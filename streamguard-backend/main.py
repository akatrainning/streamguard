"""
StreamGuard 后端代理服务
职责：
  1. 连接直播间数据源（抖音 WebSocket / 模拟数据）
  2. 调用 AgentDojo 语义对齐引擎对话术评分
  3. 通过 WebSocket 将结构化结果推送给前端

运行：
  pip install fastapi uvicorn websockets openai python-dotenv
  # 配置 .env 文件中的 OPENAI_API_KEY
  uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import random
import time
import os
import base64
import io
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

try:
    from openai import AsyncOpenAI, OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

app = FastAPI(title="StreamGuard Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175", "http://127.0.0.1:5173", "http://127.0.0.1:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# OpenAI 客户端初始化
# ──────────────────────────────────────────────

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_API_KEY = OPENROUTER_API_KEY or OPENAI_API_KEY
LLM_PROVIDER = "openrouter" if OPENROUTER_API_KEY else "openai"
LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL",
    "https://openrouter.ai/api/v1" if LLM_PROVIDER == "openrouter" else ""
)
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")

if OPENAI_AVAILABLE and LLM_API_KEY:
    kwargs = {"api_key": LLM_API_KEY}
    if LLM_BASE_URL:
        kwargs["base_url"] = LLM_BASE_URL
    client_sync = OpenAI(**kwargs)
    client_async = AsyncOpenAI(**kwargs)
else:
    client_sync = None
    client_async = None

# ──────────────────────────────────────────────
# 语义评分引擎（关键词 + GPT-4 混合）
# ──────────────────────────────────────────────

SYSTEM_PROMPT = """你是一个直播带货内容合规审核AI。根据主播的话术，判断是否存在语义失当（如虚假宣传、极限词汇、陷阱话术）。

返回 JSON 格式：
{
  "type": "fact" | "hype" | "trap",
  "score": 0.0-1.0,
  "sub_scores": {
    "semantic_consistency": 0.0-1.0,
    "fact_verification": 0.0-1.0,
    "compliance_score": 0.0-1.0,
    "subjectivity_index": 0.0-1.0
  },
  "violations": ["检出的违规项1", "违规项2"],
  "suggestion": "修改建议"
}

评分规则：
- 1.0 = 完全符合合规，无问题
- 0.5 = 轻微夸大或表述不当
- 0.2 = 包含虚假宣传或陷阱话术
"""

def analyze_with_keywords(text: str) -> dict:
    """使用关键词规则快速判断（回退方案）"""
    trap_keywords = ["最后", "限时", "秒杀", "绝无仅有", "全网最低", "倒计时", "抢完没了"]
    hype_keywords = ["超级", "神奇", "惊人", "效果显著", "百分之百", "专家推荐"]

    text_lower = text.lower()
    if any(k in text for k in trap_keywords):
        utype = "trap"
        score = round(random.uniform(0.05, 0.25), 3)
    elif any(k in text for k in hype_keywords):
        utype = "hype"
        score = round(random.uniform(0.35, 0.65), 3)
    else:
        utype = "fact"
        score = round(random.uniform(0.68, 0.95), 3)

    return {
        "type": utype,
        "score": score,
        "sub_scores": {
            "semantic_consistency": round(score * random.uniform(0.9, 1.1), 3),
            "fact_verification":    round(score * random.uniform(0.85, 1.05), 3),
            "compliance_score":     round(score * random.uniform(0.88, 1.08), 3),
            "subjectivity_index":   round(1 - score * random.uniform(0.5, 0.8), 3),
        },
        "violations": [],
        "suggestion": "内容可进一步优化"
    }

async def analyze_utterance_gpt4(text: str) -> dict:
    """使用 GPT-4 进行语义对齐评分"""
    if not client_async or not LLM_API_KEY:
        # 降级到关键词判断
        return analyze_with_keywords(text)

    try:
        response = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"请评估以下话术的合规性：{text}"}
            ],
            temperature=0.3,  # 降低温度以提高一致性
            max_tokens=500,
        )

        result_text = response.choices[0].message.content
        # 尝试从 markdown JSON block 中提取 JSON
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0]
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0]

        result = json.loads(result_text.strip())
        return result

    except Exception as e:
        print(f"GPT-4 调用失败: {e}")
        return analyze_with_keywords(text)

def analyze_utterance(text: str) -> dict:
    """同步版本（用于 WebSocket 流式数据）"""
    if not client_sync or not LLM_API_KEY:
        return analyze_with_keywords(text)

    try:
        response = client_sync.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"请评估以下话术的合规性：{text}"}
            ],
            temperature=0.3,
            max_tokens=500,
        )

        result_text = response.choices[0].message.content
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0]
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0]

        result = json.loads(result_text.strip())
        return result

    except Exception as e:
        print(f"GPT-4 调用失败: {e}")
        return analyze_with_keywords(text)


# ──────────────────────────────────────────────
# 数据源适配器
# ──────────────────────────────────────────────

class MockLiveSource:
    """模拟直播数据源（开发/演示用）"""

    MOCK_UTTERANCES = [
        "这款精华液经过15年研发，获得国家专利认证",
        "只剩最后50件了！错过今天等一年！",
        "成分表公开透明，主要含烟酰胺和玻尿酸",
        "买三送一，今晚12点截止，快抢！",
        "已通过SGS国际检测，无重金属超标",
        "全网最低价，原价599今天只要199！",
        "适合敏感肌，皮肤科医生联合研发配方",
        "倒计时3分钟！手速慢的朋友要后悔了",
        "这个成分在欧美已经流行5年，实测有效",
        "限量500套，全球限定，售完绝不补货",
    ]

    MOCK_CHATS = [
        "好用吗真的？", "买了上次的还没用完", "价格有点贵",
        "主播能不能给个优惠码", "我朋友用了说很好", "先收藏",
        "这个有没有替代品", "下单了！", "求链接", "正品吗",
    ]

    async def stream(self, callback):
        """持续推送模拟数据"""
        idx = 0
        while True:
            await asyncio.sleep(random.uniform(2.5, 4.0))
            text = self.MOCK_UTTERANCES[idx % len(self.MOCK_UTTERANCES)]
            idx += 1
            analysis = analyze_utterance(text)
            await callback({
                "event": "utterance",
                "id": int(time.time() * 1000),
                "text": text,
                "timestamp": time.strftime("%H:%M:%S"),
                **analysis,
            })

            # 顺带推送聊天消息
            chat = random.choice(self.MOCK_CHATS)
            await callback({
                "event": "chat",
                "user": f"用户{random.randint(1000,9999)}",
                "text": chat,
                "timestamp": time.strftime("%H:%M:%S"),
            })


class DouyinLiveSource:
    """抖音直播数据源（CDP 浏览器抓流实现）"""

    def __init__(self, room_id: str):
        self.room_id = room_id

    async def stream(self, callback):
        from douyin_cdp import stream_douyin_cdp

        async def _on_event(evt: dict):
            if evt.get("event") == "chat":
                text = evt.get("text", "")
                if text.strip():
                    analysis = analyze_utterance(text)
                    await callback({
                        "event": "utterance",
                        "id": int(time.time() * 1000),
                        "text": text,
                        "user": evt.get("user", "User"),
                        "timestamp": evt.get("timestamp", time.strftime("%H:%M:%S")),
                        **analysis,
                    })
                    await callback(evt)
            else:
                await callback(evt)

        await stream_douyin_cdp(self.room_id, _on_event)


# ──────────────────────────────────────────────
# WebSocket 端点
# ──────────────────────────────────────────────

@app.websocket("/ws/stream")
async def ws_mock_stream(websocket: WebSocket):
    """接入模拟数据（开发用）"""
    await websocket.accept()
    source = MockLiveSource()

    async def push(data):
        try:
            await websocket.send_json(data)
        except Exception:
            pass

    try:
        await source.stream(push)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/douyin/{room_id}")
async def ws_douyin_stream(websocket: WebSocket, room_id: str):
    """接入抖音直播间"""
    await websocket.accept()
    source = DouyinLiveSource(room_id)

    async def push(data):
        try:
            await websocket.send_json(data)
        except Exception:
            pass

    try:
        await source.stream(push)
    except WebSocketDisconnect:
        pass
    except RuntimeError as e:
        try:
            await websocket.send_json({"event": "error", "message": str(e)})
        except Exception:
            pass
        await websocket.close()
    except Exception as e:
        try:
            await websocket.send_json({"event": "error", "message": f"Douyin stream failed: {e}"})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/analyze")
async def analyze_text(text: str):
    """REST 接口：对单条话术评分（同步）"""
    return analyze_utterance(text)

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    音频转文字接口
    使用 OpenAI Whisper API 将音频转为文本
    
    支持格式：mp3, mp4, mpeg, mpga, m4a, wav, webm
    """
    if not client_sync:
        raise HTTPException(status_code=500, detail="OpenAI 服务未配置")

    try:
        # 读取文件内容
        contents = await file.read()
        
        # 调用 Whisper API
        transcript = client_sync.audio.transcriptions.create(
            model="whisper-1",
            file=("audio", io.BytesIO(contents), file.content_type),
            language="zh",  # 中文
        )

        return {
            "text": transcript.text,
            "language": "zh",
            "duration": len(contents) / 16000,  # 粗略估计
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"转录失败: {str(e)}")


@app.post("/analyze-with-transcript")
async def analyze_with_transcript(file: UploadFile = File(...)):
    """
    一体化接口：音频 -> Whisper 转文字 -> GPT-4 分析
    返回：
    {
      "text": "转录文本",
      "analysis": { 话术分析结果 },
      "latency_ms": 响应时间
    }
    """
    if not client_sync:
        raise HTTPException(status_code=500, detail="OpenAI 服务未配置")

    start = time.time()

    try:
        # Step 1: 转录
        contents = await file.read()
        transcript = client_sync.audio.transcriptions.create(
            model="whisper-1",
            file=("audio", io.BytesIO(contents), file.content_type),
            language="zh",
        )
        text = transcript.text

        # Step 2: 分析
        analysis = analyze_utterance(text)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "text": text,
            "analysis": analysis,
            "latency_ms": elapsed_ms,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": "StreamGuard v2.3-cdp",
        "douyin_adapter": "cdp",
        "entry": "main.py",
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL,
        "openai_configured": bool(LLM_API_KEY),
        "gpt4_available": OPENAI_AVAILABLE and bool(LLM_API_KEY),
    }
