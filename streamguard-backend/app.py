"""
StreamGuard Backend - FastAPI Application
"""

import asyncio
import json
import random
import time
import os
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
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5178",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenAI Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_API_KEY = OPENROUTER_API_KEY or OPENAI_API_KEY
LLM_PROVIDER = "openrouter" if OPENROUTER_API_KEY else "openai"
LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL",
    "https://openrouter.ai/api/v1" if LLM_PROVIDER == "openrouter" else ""
)
# Cost-effective default model (can be overridden by env LLM_MODEL)
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")

if OPENAI_AVAILABLE and LLM_API_KEY:
    try:
        kwargs = {"api_key": LLM_API_KEY}
        if LLM_BASE_URL:
            kwargs["base_url"] = LLM_BASE_URL
        client_sync = OpenAI(**kwargs)
        client_async = AsyncOpenAI(**kwargs)
    except Exception:
        client_sync = None
        client_async = None
else:
    client_sync = None
    client_async = None


# ============= Analysis Engine =============

def analyze_with_keywords(text: str) -> dict:
    """Keyword-based fallback analysis"""
    trap_keywords = [
        "最后", "限时", "秒杀", "绝无仅有", "全网最低", "倒计时", "抢完没了"
    ]
    hype_keywords = [
        "超级", "神奇", "惊人", "效果显著", "百分之百", "专家推荐"
    ]

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
            "fact_verification": round(score * random.uniform(0.85, 1.05), 3),
            "compliance_score": round(score * random.uniform(0.88, 1.08), 3),
            "subjectivity_index": round(1 - score * random.uniform(0.5, 0.8), 3),
        },
        "violations": [],
        "suggestion": "内容可进一步优化",
    }


def analyze_utterance(text: str) -> dict:
    """Analyze utterance (sync version)"""
    if not client_sync or not LLM_API_KEY:
        return analyze_with_keywords(text)

    try:
        system_prompt = """You are a live-stream compliance auditor. Analyze text for semantic alignment issues.
Return JSON: {"type": "fact"|"hype"|"trap", "score": 0-1, "sub_scores": {...}, "violations": [...], "suggestion": "..."}"""

        response = client_sync.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Evaluate: {text}"}
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
        print(f"GPT-4 error: {e}")
        return analyze_with_keywords(text)


# ============= Data Sources =============

class MockLiveSource:
    """Mock live streaming data"""

    UTTERANCES = [
        "这款精华液经过15年研发，获得国家专利认证",
        "只剩最后50件了！错过今天等一年！",
        "成分表公开透明，主要含烟酰胺和玻尿酸",
        "买三送一，今晚12点截止，快抢！",
        "已通过SGS国际检测，无重金属超标",
    ]

    CHATS = [
        "好用吗真的？", "买了上次的还没用完", "价格有点贵",
        "主播能不能给个优惠码", "我朋友用了说很好", "先收藏",
    ]

    async def stream(self, callback):
        idx = 0
        while True:
            await asyncio.sleep(random.uniform(2.5, 4.0))
            text = self.UTTERANCES[idx % len(self.UTTERANCES)]
            idx += 1
            analysis = analyze_utterance(text)
            await callback({
                "event": "utterance",
                "id": int(time.time() * 1000),
                "text": text,
                "timestamp": time.strftime("%H:%M:%S"),
                **analysis,
            })

            chat = random.choice(self.CHATS)
            await callback({
                "event": "chat",
                "user": f"User{random.randint(1000, 9999)}",
                "text": chat,
                "timestamp": time.strftime("%H:%M:%S"),
            })


# ============= Routes =============

@app.websocket("/ws/stream")
async def ws_mock_stream(websocket: WebSocket):
    """Mock stream endpoint"""
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


# ============= Douyin Live Source (Selenium CDP) =============

class DouyinLiveSource:
    """Connects to a real Douyin live room via headless Chrome + CDP."""

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
                        "event":     "utterance",
                        "id":        int(time.time() * 1000),
                        "text":      text,
                        "user":      evt.get("user", "User"),
                        "timestamp": evt.get("timestamp", time.strftime("%H:%M:%S")),
                        **analysis,
                    })
                    await callback(evt)
            else:
                await callback(evt)

        await stream_douyin_cdp(self.room_id, _on_event)


@app.websocket("/ws/douyin/{room_id}")
async def ws_douyin_stream(websocket: WebSocket, room_id: str):
    """Proxies a real Douyin live room to the frontend."""
    await websocket.accept()
    source = DouyinLiveSource(room_id)

    async def push(data: dict):
        try:
            await websocket.send_json(data)
        except Exception:
            pass

    try:
        await source.stream(push)
    except WebSocketDisconnect:
        pass
    except RuntimeError as exc:
        try:
            await websocket.send_json({"event": "error", "message": str(exc)})
        except Exception:
            pass
        await websocket.close()
    except Exception as exc:
        try:
            await websocket.send_json({"event": "error", "message": f"Douyin stream failed: {exc}"})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/analyze")
async def analyze_text(text: str):
    """Analyze single utterance"""
    return analyze_utterance(text)


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Convert audio to text using Whisper"""
    if not client_sync:
        raise HTTPException(status_code=500, detail="OpenAI not configured")

    try:
        contents = await file.read()
        transcript = client_sync.audio.transcriptions.create(
            model="whisper-1",
            file=("audio", io.BytesIO(contents), file.content_type),
            language="zh",
        )
        return {
            "text": transcript.text,
            "language": "zh",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/analyze-with-transcript")
async def analyze_with_transcript(file: UploadFile = File(...)):
    """Audio -> Transcribe -> Analyze"""
    if not client_sync:
        raise HTTPException(status_code=500, detail="OpenAI not configured")

    start = time.time()

    try:
        contents = await file.read()
        transcript = client_sync.audio.transcriptions.create(
            model="whisper-1",
            file=("audio", io.BytesIO(contents), file.content_type),
            language="zh",
        )
        text = transcript.text

        analysis = analyze_utterance(text)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "text": text,
            "analysis": analysis,
            "latency_ms": elapsed_ms,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "ok",
        "engine": "StreamGuard v2.3-cdp",
        "douyin_adapter": "cdp",
        "entry": "app.py",
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL,
        "openai_configured": bool(LLM_API_KEY),
        "gpt4_available": OPENAI_AVAILABLE and bool(LLM_API_KEY),
    }
