"""
StreamGuard Backend - FastAPI Application
"""

import asyncio
import json
import random
import time
import os
import io
import re
import shutil
import tempfile
import subprocess
import urllib.parse
from urllib.parse import urljoin
from typing import Optional, Any, Dict, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
# ============= Local HLS Relay =============
# ffmpeg 中继：将戩6音流（FLV/HLS）转封装为本地 HLS，前端直接播放无跨域问题
_HLS_BASE_DIR = os.path.join(tempfile.gettempdir(), "streamguard_hls")
os.makedirs(_HLS_BASE_DIR, exist_ok=True)
_hls_relay_procs: dict = {}   # room_id -> subprocess.Popen


async def _start_hls_relay(room_id: str, source_url: str) -> Optional[str]:
    """
    启动 ffmpeg 将抖音流（FLV 或 HLS）转封装为本地 HLS。
    返回本地访问路径（如 /hls/room_id/index.m3u8），失败返回 None。
    """
    out_dir = os.path.join(_HLS_BASE_DIR, room_id)
    os.makedirs(out_dir, exist_ok=True)
    index_m3u8 = os.path.join(out_dir, "index.m3u8")

    _stop_hls_relay(room_id)  # 先停止旧进程

    try:
        ffmpeg_bin = _get_ffmpeg_bin()
    except RuntimeError as e:
        print(f"[hls-relay] ffmpeg 未找到: {e}")
        return None

    cmd = [
        ffmpeg_bin,
        "-loglevel", "error",
        "-headers",
            "Referer: https://live.douyin.com/\r\n"
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n",
        "-i", source_url,
        "-c", "copy",              # 不转码，截流将最小
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "8",
        "-hls_flags", "delete_segments+append_list+omit_endlist",
        "-hls_segment_filename", os.path.join(out_dir, "s%05d.ts"),
        index_m3u8,
    ]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        _hls_relay_procs[room_id] = proc
        print(f"[hls-relay] 已启动 (pid={proc.pid})。等待第一个分片...")
    except Exception as e:
        print(f"[hls-relay] ffmpeg 启动失败: {e}")
        return None

    # 等待 index.m3u8 出现（最多 12s）
    for _ in range(24):
        await asyncio.sleep(0.5)
        if os.path.exists(index_m3u8) and os.path.getsize(index_m3u8) > 0:
            print(f"[hls-relay] ✓ 本地 HLS 就绪: /hls/{room_id}/index.m3u8")
            return f"/hls/{room_id}/index.m3u8"
        if proc.poll() is not None:
            err = b""
            try:
                err = proc.stderr.read(300)
            except Exception:
                pass
            print(f"[hls-relay] ffmpeg 异常退出: {err.decode(errors='replace')}")
            return None

    print("[hls-relay] 超时，未能在 12s 内就绪")
    return None


def _stop_hls_relay(room_id: str):
    proc = _hls_relay_procs.pop(room_id, None)
    if proc and proc.poll() is None:
        try:
            proc.kill()
            print(f"[hls-relay] 已停止 (room={room_id})")
        except Exception:
            pass


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

# ASR client (cloud Whisper)
# ---------------------------------------------------------------
# OpenRouter / DeepSeek 等 LLM 代理均不提供 Whisper 音频转写接口，
# 因此 ASR 云端客户端只在用户 **显式** 设置 ASR_OPENAI_API_KEY 时才启用。
# 若未设置，直接使用本地 faster-whisper，完全避免 401 错误。
#
# 如需启用云端 Whisper，在 .env 中配置：
#   ASR_OPENAI_API_KEY=sk-xxxx          # 真实 OpenAI key（必须）
#   ASR_BASE_URL=https://...            # 可选，自定义兼容 Whisper 的端点
# ---------------------------------------------------------------
ASR_OPENAI_API_KEY = os.getenv("ASR_OPENAI_API_KEY", "")   # 不再继承 OPENAI_API_KEY
ASR_BASE_URL = os.getenv("ASR_BASE_URL", "")

if OPENAI_AVAILABLE and ASR_OPENAI_API_KEY:
    try:
        asr_kwargs = {"api_key": ASR_OPENAI_API_KEY}
        if ASR_BASE_URL:
            asr_kwargs["base_url"] = ASR_BASE_URL
        asr_client = OpenAI(**asr_kwargs)
        print(f"[ASR] 云端 Whisper 客户端初始化完成（key …{ASR_OPENAI_API_KEY[-4:]}）")
    except Exception as _e:
        print(f"[ASR] 云端客户端初始化失败 ({_e})，将使用本地 faster-whisper")
        asr_client = None
else:
    print("[ASR] 未配置 ASR_OPENAI_API_KEY，跳过云端 Whisper，直接使用本地 faster-whisper")
    asr_client = None


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


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _extract_json_block(content: str) -> str:
    t = (content or "").strip()
    if "```json" in t:
        return t.split("```json", 1)[1].split("```", 1)[0].strip()
    if "```" in t:
        inner = t.split("```", 1)[1].split("```", 1)[0].strip()
        if inner.startswith("json"):
            inner = inner[4:]
        return inner.strip()
    return t


async def _consumer_llm_json(system_prompt: str, user_prompt: str, fallback: dict, max_tokens: int = 700) -> dict:
    """Shared LLM JSON caller for consumer decision APIs."""
    if not client_async or not LLM_API_KEY:
        return fallback
    try:
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=max_tokens,
        )
        raw = (resp.choices[0].message.content or "").strip()
        parsed = json.loads(_extract_json_block(raw))
        if isinstance(parsed, dict):
            return parsed
        return fallback
    except Exception as e:
        print(f"[consumer-llm] 调用失败: {e}")
        return fallback


def _trim_text_list(items: list, limit: int = 30) -> list[str]:
    out: list[str] = []
    for x in items or []:
        t = str((x or {}).get("text", "") if isinstance(x, dict) else x).strip()
        if t:
            out.append(t[:140])
        if len(out) >= limit:
            break
    return out


def _llm_unavailable_analysis(reason: str = "LLM unavailable") -> dict:
    """Non-heuristic fallback when LLM is not reachable/configured."""
    return {
        "type": "fact",
        "score": 0.5,
        "sub_scores": {
            "semantic_consistency": 0.5,
            "fact_verification": 0.5,
            "compliance_score": 0.5,
            "subjectivity_index": 0.5,
        },
        "violations": [reason],
        "suggestion": "当前未启用语义模型，暂不做规则推断；请配置 LLM 后重试。",
        "engine": "llm-unavailable",
    }


# ============= Chat Semantic Analysis =============

_CHAT_POS     = ["好用","喜欢","买了","下单","真香","赞","不错","推荐","支持","期待","满意","值得","棒","厉害","冲","必买"]
_CHAT_NEG     = ["假货","骗人","差评","退货","质量差","失望","坑","黑心","不好","难用","后悔","太贵","不值","垃圾"]
_CHAT_DOUBT   = ["真的吗","假的吧","可靠吗","有效吗","正品吗","可信吗","别买","小心","真的有用","管用吗","骗人的","假的","怎么证明","哪有这么好"]
_CHAT_COMPLAINT = ["投诉","退款","假的","骗局","举报","不靠谱","买亏了","太坑","没用","没效果","打假","维权","客服","售后"]
_CHAT_PURCHASE  = ["下单","买了","拍了","求链接","怎么买","加购","收藏","要一个","几件","发链接","购买","怎么下单","在哪里买"]
_CHAT_QUESTION  = ["吗","吗？","吧？","？","?","怎么","能不能","有没有","是不是","多少","哪里","什么时候","为什么","咋","啥","需要","适合"]
_CHAT_AD_SPAM   = ["加微信","私信我","wx","vx","拿货价","批发","便宜出","代购","渠道","刷单","号请联系","加我","找我"]
_CHAT_SUPPORT   = ["主播加油","支持主播","主播好","YYDS","爱了","美美的","帅","顶","666","永远支持","全程支持"]

# Intent labels in Chinese
_INTENT_LABEL = {
    "purchase":  "🛒 购买意向",
    "question":  "❓ 提问咨询",
    "complaint": "🚨 客诉投诉",
    "doubt":     "🤔 质疑话术",
    "support":   "🙌 支持主播",
    "ad_spam":   "🚫 广告刷屏",
    "other":     "💬 普通弹幕",
}
_SENTIMENT_LABEL = {"pos": "😊", "neg": "😠", "neutral": "😐"}


def _analyze_chat_rules(text: str, recent_utterance: str = "") -> dict:
    """规则兜底：LLM 不可用时使用关键词匹配。"""
    t = (text or "").strip()
    if not t:
        return {"sentiment": "neutral", "intent": "other", "flags": [],
                "risk_score": 0.0, "correlation": "unrelated", "label": "💬 普通弹幕",
                "sentiment_icon": "😐"}

    pos_hits = sum(1 for w in _CHAT_POS if w in t)
    neg_hits = sum(1 for w in _CHAT_NEG if w in t)
    sentiment = "pos" if pos_hits > neg_hits else "neg" if neg_hits > pos_hits else "neutral"

    intent = "other"
    flags: list[str] = []
    if any(w in t for w in _CHAT_AD_SPAM):
        intent, flags = "ad_spam", ["广告刷屏"]; sentiment = "neg"
    elif any(w in t for w in _CHAT_COMPLAINT):
        intent, flags = "complaint", ["客诉投诉"]; sentiment = "neg"
    elif any(w in t for w in _CHAT_DOUBT):
        intent, flags = "doubt", ["质疑话术"]
        if sentiment == "pos": sentiment = "neutral"
    elif any(w in t for w in _CHAT_PURCHASE):
        intent = "purchase"
    elif any(w in t for w in _CHAT_SUPPORT):
        intent = "support"
        if sentiment == "neg": sentiment = "neutral"
    elif any(w in t for w in _CHAT_QUESTION):
        intent = "question"
    if len(set(t)) <= 3 and len(t) >= 6:
        flags.append("重复刷屏"); intent = "ad_spam"

    correlation = "unrelated"
    if recent_utterance:
        ru = recent_utterance.lower()
        risk_words = ["全网最低", "最", "绝", "100%", "百分之百", "神奇", "立刻", "马上", "秒", "万能"]
        if intent == "doubt" and any(w in ru for w in risk_words):
            correlation = "doubt_claim"; flags.append("疑问当前话术")
        elif intent in ("purchase", "support") and sentiment == "pos":
            correlation = "support_claim"
        elif intent == "complaint":
            correlation = "doubt_claim"; flags.append("投诉关联话术")

    risk_map = {"ad_spam": 0.9, "complaint": 0.75, "doubt": 0.55, "question": 0.1,
                "purchase": 0.0, "support": 0.0, "other": 0.0}
    risk = risk_map.get(intent, 0.0)
    if sentiment == "neg" and risk < 0.4: risk = 0.4
    return {
        "sentiment": sentiment, "intent": intent, "flags": flags,
        "risk_score": round(risk, 2), "correlation": correlation,
        "label": _INTENT_LABEL.get(intent, "💬 普通弹幕"),
        "sentiment_icon": _SENTIMENT_LABEL.get(sentiment, "😐"),
    }


async def analyze_chat_llm(text: str, recent_utterance: str = "") -> dict:
    """LLM 弹幕意图分析（OpenRouter/OpenAI）。"""
    if not client_async or not LLM_API_KEY:
        return {
            "sentiment": "neutral",
            "intent": "other",
            "flags": ["LLM未配置"],
            "risk_score": 0.0,
            "correlation": "unrelated",
            "label": _INTENT_LABEL.get("other", "💬 普通弹幕"),
            "sentiment_icon": _SENTIMENT_LABEL.get("neutral", "😐"),
            "engine": "llm-unavailable",
        }
    try:
        system = (
            "你是直播间弹幕分析员。分析弹幕意图和情感，考虑主播话术背景。\n"
            "意图（选最匹配的一个）：\n"
            "  purchase=询问购买/求链接/下单  question=提问产品/功效/成分\n"
            "  complaint=投诉/退货/打假/维权  doubt=质疑话术真实性\n"
            "  support=点赞/支持/鼓励  ad_spam=广告引流/加微信/刷屏  other=其他\n"
            "关联性：support_claim=认可话术 | doubt_claim=质疑话术 | unrelated=无关\n"
            "risk_score：0=无风险，1=高风险（complaint/doubt 通常 0.5-0.9）\n"
            "flags：简短中文警示标签列表，无风险可为空\n"
            "严格返回 JSON（不加代码块标记）：\n"
            '{"sentiment":"pos|neg|neutral","intent":"purchase|question|complaint|doubt|support|ad_spam|other",'
            '"flags":[],"risk_score":0.0,"correlation":"support_claim|doubt_claim|unrelated"}'
        )
        user_msg = f"弹幕：{text}"
        if recent_utterance:
            user_msg += f"\n主播最近话术：{recent_utterance[:120]}"
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.1,
            max_tokens=150,
        )
        content = (resp.choices[0].message.content or "").strip()
        if "```" in content:
            content = content.split("```")[1].split("```")[0]
            if content.startswith("json"): content = content[4:]
        parsed = json.loads(content.strip())
        sentiment  = parsed.get("sentiment",  "neutral")
        intent     = parsed.get("intent",     "other")
        correlation= parsed.get("correlation","unrelated")
        if sentiment   not in ("pos","neg","neutral"): sentiment = "neutral"
        if intent      not in ("purchase","question","complaint","doubt","support","ad_spam","other"): intent = "other"
        if correlation not in ("support_claim","doubt_claim","unrelated"): correlation = "unrelated"
        flags = parsed.get("flags", [])
        if not isinstance(flags, list): flags = []
        return {
            "sentiment":      sentiment,
            "intent":         intent,
            "flags":          flags,
            "risk_score":     round(_clamp01(parsed.get("risk_score", 0.0)), 2),
            "correlation":    correlation,
            "label":          _INTENT_LABEL.get(intent, "💬 普通弹幕"),
            "sentiment_icon": _SENTIMENT_LABEL.get(sentiment, "😐"),
        }
    except Exception as e:
        print(f"[LLM-chat] 分析失败 ({e})")
        return {
            "sentiment": "neutral",
            "intent": "other",
            "flags": ["LLM解析失败"],
            "risk_score": 0.0,
            "correlation": "unrelated",
            "label": _INTENT_LABEL.get("other", "💬 普通弹幕"),
            "sentiment_icon": _SENTIMENT_LABEL.get("neutral", "😐"),
            "engine": "llm-error",
        }


async def analyze_utterance_async(text: str) -> dict:
    """Async LLM 话术合规分析。"""
    if not client_async or not LLM_API_KEY:
        return _llm_unavailable_analysis("LLM未配置")
    try:
        system = (
            "你是直播间话术合规审计员，只根据给定文本判断，不脑补未出现事实。\n"
            "类型：fact=有依据陈述 | hype=夸大但非明确欺诈 | trap=极限词/压迫下单/虚假功效承诺\n"
            "score 表示合规程度（1=完全合规，0=严重违规）\n"
            "严格返回 JSON（不加代码块标记）：\n"
            '{"type":"fact|hype|trap","score":0-1,'
            '"sub_scores":{"semantic_consistency":0-1,"fact_verification":0-1,"compliance_score":0-1,"subjectivity_index":0-1},'
            '"violations":["..."],"suggestion":"..."}'
        )
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": f"话术：{text}"},
            ],
            temperature=0.1,
            max_tokens=350,
        )
        content = (resp.choices[0].message.content or "").strip()
        if "```" in content:
            content = content.split("```")[1].split("```")[0]
            if content.startswith("json"): content = content[4:]
        parsed = json.loads(content.strip())
        if parsed.get("type") not in ("fact", "hype", "trap"):
            parsed["type"] = "fact"
        parsed["score"] = round(_clamp01(parsed.get("score", 0.5)), 3)
        sub = parsed.setdefault("sub_scores", {})
        for k in ("semantic_consistency", "fact_verification", "compliance_score", "subjectivity_index"):
            sub[k] = round(_clamp01(sub.get(k, 0.5)), 3)
        if not isinstance(parsed.get("violations"), list): parsed["violations"] = []
        parsed.setdefault("suggestion", "")
        return parsed
    except Exception as e:
        print(f"[LLM-utterance] 分析失败 ({e})")
        return _llm_unavailable_analysis("LLM解析失败")


async def polish_transcript_for_consumer(raw_text: str) -> dict:
    """Rewrite ASR output into fluent consumer-facing sentence + keywords."""
    t = (raw_text or "").strip()
    if not t:
        return {"polished_text": "", "keywords": []}

    # LLM unavailable -> do minimal formatting (not rule-based classification)
    if not client_async or not LLM_API_KEY:
        simple = re.sub(r"\s+", "", t)
        if simple and simple[-1] not in "。！？!?":
            simple += "。"
        return {"polished_text": simple, "keywords": []}

    try:
        prompt = (
            "你是直播转写润色助手。将口语/断句不完整的中文转写，整理成1-2句通顺文本，"
            "不要新增事实，不要改变原意。再提取2-5个购买相关关键词。"
            "严格返回 JSON：{\"polished_text\":\"...\",\"keywords\":[\"...\"]}"
        )
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"原始转写：{t}"},
            ],
            temperature=0.1,
            max_tokens=180,
        )
        content = (resp.choices[0].message.content or "").strip()
        if "```" in content:
            content = content.split("```", 1)[1].split("```", 1)[0]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content.strip())
        polished = (parsed.get("polished_text") or t).strip()
        if polished and polished[-1] not in "。！？!?":
            polished += "。"
        kws = parsed.get("keywords") if isinstance(parsed.get("keywords"), list) else []
        kws = [str(k).strip() for k in kws if str(k).strip()][:5]
        return {"polished_text": polished, "keywords": kws}
    except Exception as e:
        print(f"[transcript-polish] 失败 ({e})")
        simple = re.sub(r"\s+", "", t)
        if simple and simple[-1] not in "。！？!?":
            simple += "。"
        return {"polished_text": simple, "keywords": []}


# 保持向后兼容的同步包装（HTTP endpoint 专用，内部请优先用 async 版本）
def analyze_chat_light(text: str, recent_utterance: str = "") -> dict:
    return _analyze_chat_rules(text, recent_utterance)


def analyze_audio_with_rules(text: str) -> dict:
    """Audio-focused rule engine for livestream compliance semantics."""
    t = (text or "").strip()
    if not t:
        return {
            "type": "fact",
            "score": 0.5,
            "sub_scores": {
                "semantic_consistency": 0.5,
                "fact_verification": 0.5,
                "compliance_score": 0.5,
                "subjectivity_index": 0.5,
            },
            "violations": ["空文本，无法评估"],
            "suggestion": "请延长音频采样时长后重试",
            "engine": "rules-audio",
        }

    risk_map = {
        "绝对化/极限词": ["最", "第一", "唯一", "顶级", "国家级", "永不", "100%", "根治", "永久"],
        "强促销/压迫式下单": ["马上下单", "现在拍", "最后", "限时", "倒计时", "只剩", "错过", "手慢无"],
        "收益或功效夸大": ["立刻见效", "秒变", "稳赚", "包过", "保本", "翻倍", "无副作用", "包治"],
        "不充分证据背书": ["专家都说", "权威认证", "全网最低", "内部渠道", "官方特供"],
    }
    evidence_words = ["检测", "报告", "编号", "成分", "实验", "对照", "链接", "凭证", "标准"]

    hit_violations = []
    hit_count = 0
    for v_name, words in risk_map.items():
        hits = [w for w in words if w in t]
        if hits:
            hit_count += len(hits)
            hit_violations.append(f"{v_name}: {', '.join(hits[:4])}")

    evidence_hit = sum(1 for w in evidence_words if w in t)

    risk_raw = hit_count * 0.18 - evidence_hit * 0.04
    risk_raw = max(0.0, min(0.95, risk_raw))
    score = round(1.0 - risk_raw, 3)

    if risk_raw >= 0.62:
        utype = "trap"
    elif risk_raw >= 0.32:
        utype = "hype"
    else:
        utype = "fact"

    semantic_consistency = _clamp01(1.0 - risk_raw * 0.9)
    fact_verification = _clamp01(0.55 + evidence_hit * 0.08 - hit_count * 0.05)
    compliance_score = _clamp01(1.0 - risk_raw)
    subjectivity_index = _clamp01(0.25 + risk_raw * 0.9)

    if utype == "trap":
        suggestion = "删除极限词和压迫式下单措辞，补充可核验证据与适用条件。"
    elif utype == "hype":
        suggestion = "降低夸张表达，改为可验证数据描述（检测报告/对照结果）。"
    else:
        suggestion = "整体表达较稳健，可继续补充证据来源提升可信度。"

    return {
        "type": utype,
        "score": score,
        "sub_scores": {
            "semantic_consistency": round(semantic_consistency, 3),
            "fact_verification": round(fact_verification, 3),
            "compliance_score": round(compliance_score, 3),
            "subjectivity_index": round(subjectivity_index, 3),
        },
        "violations": hit_violations,
        "suggestion": suggestion,
        "engine": "rules-audio",
    }


def analyze_audio_semantics(text: str) -> dict:
    """Audio semantic analysis powered by LLM only (no rule baseline)."""
    if not client_sync or not LLM_API_KEY:
        return _llm_unavailable_analysis("LLM未配置")

    try:
        prompt = """
你是“直播间语音转写合规审计员”。请只基于给定文本做判断，不要脑补未出现事实。

重点：
1) 是否存在极限词、绝对化承诺、疗效/收益保证。
2) 是否存在压迫式促单（倒计时、只剩最后、错过后悔）。
3) 是否给出可核验依据（检测报告、编号、成分和范围条件）。

严格返回 JSON：
{
  "type": "fact|hype|trap",
  "score": 0-1,
  "sub_scores": {
    "semantic_consistency": 0-1,
    "fact_verification": 0-1,
    "compliance_score": 0-1,
    "subjectivity_index": 0-1
  },
  "violations": ["..."],
  "suggestion": "..."
}
"""
        resp = client_sync.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"请评估这段直播语音转写：{text}"},
            ],
            temperature=0.1,
            max_tokens=650,
        )
        content = (resp.choices[0].message.content or "").strip()
        if "```json" in content:
            content = content.split("```json", 1)[1].split("```", 1)[0]
        elif "```" in content:
            content = content.split("```", 1)[1].split("```", 1)[0]

        parsed = json.loads(content)
        parsed_type = parsed.get("type", "fact")
        if parsed_type not in ("fact", "hype", "trap"):
            parsed_type = "fact"

        parsed_score = _clamp01(parsed.get("score", 0.5))
        sub = parsed.get("sub_scores") or {}
        merged = {
            "type": parsed_type,
            "score": round(parsed_score, 3),
            "sub_scores": {
                "semantic_consistency": round(_clamp01(sub.get("semantic_consistency", 0.5)), 3),
                "fact_verification": round(_clamp01(sub.get("fact_verification", 0.5)), 3),
                "compliance_score": round(_clamp01(sub.get("compliance_score", 0.5)), 3),
                "subjectivity_index": round(_clamp01(sub.get("subjectivity_index", 0.5)), 3),
            },
            "violations": parsed.get("violations") if isinstance(parsed.get("violations"), list) else [],
            "suggestion": parsed.get("suggestion") or "",
            "engine": "llm-audio",
        }
        return merged
    except Exception as e:
        print(f"Audio semantic LLM error: {e}")
        return _llm_unavailable_analysis("LLM解析失败")


def _split_sentences_zh(text: str) -> list[str]:
    """Split Chinese text into short utterances for finer semantic analysis."""
    if not text:
        return []
    parts = re.split(r"[。！？!?\n]+", text)
    return [p.strip() for p in parts if p and p.strip()]


def _normalize_room_id(room_input: str) -> str:
    """
    Normalize Douyin room input to pure numeric room_id.
    Supports:
    - 646454278948
    - https://live.douyin.com/646454278948
    - https://live.douyin.com/646454278948?anchor_id=
    - ...?room_id=646454278948 / ...?web_rid=646454278948
    """
    raw = str(room_input or "").strip()
    if not raw:
        return ""

    # fast path: pure digits
    if re.fullmatch(r"\d{6,24}", raw):
        return raw

    text = urllib.parse.unquote(raw)

    # query params path (when full url provided)
    try:
        parsed = urllib.parse.urlparse(text)
        q = urllib.parse.parse_qs(parsed.query or "")
        for key in ("room_id", "roomId", "web_rid", "webRid"):
            val = (q.get(key) or [""])[0]
            if re.fullmatch(r"\d{6,24}", str(val)):
                return str(val)
        m = re.search(r"(?:live\.)?douyin\.com/(\d{6,24})", text, flags=re.I)
        if m:
            return m.group(1)
    except Exception:
        pass

    # fallback: first digit chunk
    m = re.search(r"(\d{6,24})", text)
    return m.group(1) if m else ""


def _discover_douyin_media_url(room_id: str, timeout_sec: int = 20) -> Optional[str]:
    """Open Douyin room and detect candidate media URL (m3u8/flv) from CDP logs."""
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.common.exceptions import TimeoutException
    from webdriver_manager.chrome import ChromeDriverManager

    target = f"https://live.douyin.com/{room_id}"
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--mute-audio")
    opts.add_argument("--window-size=1280,720")
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--allow-running-insecure-content")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = None
    candidates: list[str] = []
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=opts)
        driver.set_page_load_timeout(25)
        driver.execute_cdp_cmd("Network.enable", {})

        try:
            driver.get(target)
        except TimeoutException:
            pass

        start = time.time()
        while time.time() - start < timeout_sec:
            logs = driver.get_log("performance")
            for entry in logs:
                try:
                    msg = json.loads(entry["message"])["message"]
                    if msg.get("method") != "Network.requestWillBeSent":
                        continue
                    req = msg.get("params", {}).get("request", {})
                    url = req.get("url", "")
                    u = url.lower()
                    if ".m3u8" in u or ".flv" in u or "pull-hls" in u or "stream" in u:
                        candidates.append(url)
                except Exception:
                    continue

            if candidates:
                # Prefer m3u8, then flv, then latest candidate
                for c in reversed(candidates):
                    if ".m3u8" in c.lower():
                        return c
                for c in reversed(candidates):
                    if ".flv" in c.lower():
                        return c
                return candidates[-1]

            time.sleep(0.4)

        return None
    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass


# ============= Douyin Live Room Search =============

def _parse_cookie_header(cookie_header: str) -> dict:
    """Parse `k=v; k2=v2` cookie header into dict for requests/selenium."""
    out: dict = {}
    if not cookie_header:
        return out
    for part in cookie_header.split(";"):
        seg = part.strip()
        if not seg or "=" not in seg:
            continue
        k, v = seg.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k:
            out[k] = v
    return out

def _parse_douyin_search_json(content: str) -> list:
    """Parse JSON body from Douyin search API response into normalized room list."""
    rooms = []
    try:
        data = json.loads(content)
    except Exception as e:
        print(f"[douyin-parse] JSON解析失败: {e}, snippet={content[:80]!r}")
        return rooms
    top_keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
    print(f"[douyin-parse] JSON顶层结构: {top_keys}")

    def _get_cover_url(obj) -> str:
        if not isinstance(obj, dict):
            return ""
        for key in ("cover", "room_cover", "avatar_thumb", "thumbnail"):
            v = obj.get(key)
            if isinstance(v, dict):
                ul = v.get("url_list") or []
                if ul:
                    return ul[0]
        return ""

    def _get_author(obj) -> dict:
        for key in ("author", "owner", "user"):
            a = obj.get(key)
            if isinstance(a, dict):
                avatar = _get_cover_url(a)
                return {
                    "nickname": str(a.get("nickname") or a.get("display_id") or ""),
                    "avatar_url": avatar,
                }
        return {"nickname": "", "avatar_url": ""}

    def _normalize_item(item) -> Optional[dict]:
        if not isinstance(item, dict):
            return None
        # Try nested paths
        core = item.get("aweme_info") or item.get("live_room") or item
        if not isinstance(core, dict):
            return None
        room_id = str(
            core.get("room_id") or core.get("web_rid") or core.get("id_str") or
            item.get("room_id") or item.get("web_rid") or ""
        )
        if not room_id or not room_id.isdigit() or len(room_id) < 8:
            return None
        author = _get_author(core)
        stats = core.get("statistics") or {}
        viewer_count = int(
            stats.get("watch_count") or stats.get("online_total") or
            core.get("user_count") or core.get("online_total") or 0
        )
        title = str(
            core.get("desc") or core.get("title") or core.get("room_title") or "直播中"
        ).strip()[:100]
        thumbnail = _get_cover_url(core)
        return {
            "room_id": room_id,
            "url": f"https://live.douyin.com/{room_id}",
            "title": title,
            "streamer_name": author["nickname"] or "主播",
            "streamer_avatar": author["avatar_url"],
            "viewer_count": viewer_count,
            "thumbnail_url": thumbnail,
            "products": [],
            "recommendation_score": 0.5,
            "risk_level": "medium",
            "reason": "",
        }

    # Handle multiple response envelopes
    item_list = []
    if isinstance(data.get("data"), list):
        item_list = data["data"]
    elif isinstance(data.get("data"), dict):
        inner = data["data"]
        if isinstance(inner.get("data"), list):
            item_list = inner["data"]
        elif isinstance(inner.get("aweme_list"), list):
            item_list = inner["aweme_list"]
    elif isinstance(data.get("aweme_list"), list):
        item_list = data["aweme_list"]
    elif isinstance(data.get("room_list"), list):
        item_list = data["room_list"]

    print(f"[douyin-parse] item_list长度={len(item_list)}")
    for raw in item_list:
        r = _normalize_item(raw)
        if r:
            rooms.append(r)
    print(f"[douyin-parse] 最终解析出直播间={len(rooms)}")
    return rooms


def _extract_rooms_from_dom(driver) -> list:
    """DOM + JavaScript extraction fallback when XHR capture fails."""
    rooms = []
    seen: set = set()
    try:
        page_source = driver.page_source
        # Regex patterns to find room IDs in page source
        patterns = [
            r'live\.douyin\.com/(\d{10,})',
            r'"web_rid"\s*:\s*"(\d{10,})"',
            r'"room_id"\s*:\s*"(\d{10,})"',
            r'/live/(\d{10,})',
        ]
        for pat in patterns:
            for m in re.finditer(pat, page_source):
                seen.add(m.group(1))

        # Also try JS anchor extraction
        try:
            js_result = driver.execute_script(r"""
                var links = document.querySelectorAll('a[href]');
                var out = [];
                links.forEach(function(a) {
                    var h = a.href || '';
                    var m = h.match(/live\.douyin\.com\/(\d{10,})/);
                    if (m) {
                        var card = a.closest('[data-e2e]') || a.closest('li') || a.parentElement;
                        out.push({rid: m[1], txt: card ? card.innerText.slice(0,120) : a.innerText || ''});
                    }
                });
                return out;
            """)
            if js_result:
                for item in js_result:
                    rid = str(item.get("rid", ""))
                    if rid and len(rid) >= 10:
                        txt = str(item.get("txt", "")).replace("\n", " ")[:80]
                        if rid not in seen:
                            seen.add(rid)
                        rooms.append({
                            "room_id": rid,
                            "url": f"https://live.douyin.com/{rid}",
                            "title": txt or "直播中",
                            "streamer_name": "主播",
                            "streamer_avatar": "",
                            "viewer_count": 0,
                            "thumbnail_url": "",
                            "products": [],
                            "recommendation_score": 0.5,
                            "risk_level": "medium",
                            "reason": "",
                        })
        except Exception:
            pass

        # Create stub records for IDs found via regex
        existing_ids = {r["room_id"] for r in rooms}
        for rid in seen:
            if rid not in existing_ids:
                rooms.append({
                    "room_id": rid,
                    "url": f"https://live.douyin.com/{rid}",
                    "title": "直播中",
                    "streamer_name": "主播",
                    "streamer_avatar": "",
                    "viewer_count": 0,
                    "thumbnail_url": "",
                    "products": [],
                    "recommendation_score": 0.5,
                    "risk_level": "medium",
                    "reason": "",
                })
    except Exception as e:
        print(f"[douyin-search] DOM提取错误: {e}")
    return rooms


async def _try_httpx_douyin_search(keyword: str, max_results: int) -> list:
    """Attempt direct HTTP API call to Douyin's search endpoint (no Selenium)."""
    try:
        import httpx
    except ImportError:
        print("[douyin-search][httpx] httpx 未安装，跳过直连方式")
        return []

    encoded_kw = urllib.parse.quote(keyword)
    endpoints = [
        (
            "https://www.douyin.com/aweme/v1/web/live/search/"
            f"?keyword={encoded_kw}&count={max_results}&offset=0"
            "&pc_client_type=1&version_code=190600&version_name=19.6.0"
            "&cookie_enabled=true&browser_language=zh-CN&browser_platform=Win32"
            "&browser_name=Chrome&browser_version=124.0.0.0"
        ),
        (
            "https://www.douyin.com/aweme/v1/web/search/item/"
            f"?keyword={encoded_kw}&search_channel=aweme_live"
            f"&type=1&count={max_results}&offset=0"
            "&from_page=search&search_source=tab_search"
            "&pc_client_type=1&version_code=190600&cookie_enabled=true"
            "&browser_language=zh-CN&browser_platform=Win32"
            "&browser_name=Chrome&browser_version=124.0.0.0"
        ),
    ]
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.douyin.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    cookie_header = os.getenv("DOUYIN_COOKIE", "").strip()
    if cookie_header:
        headers["Cookie"] = cookie_header
        print("[douyin-search][httpx] 已注入 DOUYIN_COOKIE")
    print(f"[douyin-search][httpx] 开始直连搜索 keyword={keyword!r}, {len(endpoints)} 个端点")
    for i, url in enumerate(endpoints):
        short_url = url.split('?')[0]
        print(f"[douyin-search][httpx] [{i+1}/{len(endpoints)}] GET {short_url}")
        try:
            async with httpx.AsyncClient(
                timeout=15, follow_redirects=True, headers=headers
            ) as client:
                resp = await client.get(url)
            ct = resp.headers.get('content-type', '?')
            snippet = resp.text[:300].replace('\n', ' ')
            print(
                f"[douyin-search][httpx]   → status={resp.status_code} "
                f"content-type={ct} "
                f"body_len={len(resp.text)} "
                f"snippet={snippet!r}"
            )
            # 放宽检测条件：只要是 JSON 结构即可尝试解析
            if resp.status_code == 200 and len(resp.text) > 30:
                rooms = _parse_douyin_search_json(resp.text)
                print(f"[douyin-search][httpx]   → 解析出直播间数: {len(rooms)}")
                if rooms:
                    print(f"[douyin-search][httpx] ✓ 直连成功，返回 {len(rooms)} 个直播间")
                    return rooms[:max_results]
                else:
                    print(f"[douyin-search][httpx]   → 解析为0，响应结构可能不匹配")
            else:
                print(f"[douyin-search][httpx]   → 跳过（状态码或长度不满足）")
        except Exception as e:
            print(f"[douyin-search][httpx]   → 异常: {type(e).__name__}: {e}")
    print(f"[douyin-search][httpx] 所有端点无结果，返回空列表")
    return []


def _selenium_search_live_rooms(keyword: str, max_results: int = 12, timeout_sec: int = 45) -> list:
    """Selenium + CDP: navigate to Douyin search page and capture live room data."""
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    try:
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        print("[douyin-search] webdriver_manager 未安装，跳过Selenium搜索")
        return []

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--mute-audio")
    opts.add_argument("--window-size=1280,900")
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    opts.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    driver = None
    rooms: list = []
    try:
        print(f"[douyin-search][selenium] 启动 Chrome headless...")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=opts)
        driver.set_page_load_timeout(30)
        print(f"[douyin-search][selenium] Chrome 启动成功")

        # Anti-detection: hide webdriver flag
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
            "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
        })
        driver.execute_cdp_cmd("Network.enable", {})

        # Step 1: get homepage cookies (helps pass anti-bot challenge)
        print(f"[douyin-search][selenium] Step1: 访问首页获取 cookies...")
        try:
            driver.get("https://www.douyin.com")
            print(f"[douyin-search][selenium] Step1: 首页标题={driver.title!r}")
        except Exception as e:
            print(f"[douyin-search][selenium] Step1: 首页加载异常 {e}")

        # Optional: inject user cookie to improve pass rate of anti-bot
        cookie_header = os.getenv("DOUYIN_COOKIE", "").strip()
        if cookie_header:
            ck = _parse_cookie_header(cookie_header)
            if ck:
                injected = 0
                for k, v in ck.items():
                    try:
                        driver.add_cookie({
                            "name": k,
                            "value": v,
                            "domain": ".douyin.com",
                            "path": "/",
                        })
                        injected += 1
                    except Exception:
                        pass
                print(f"[douyin-search][selenium] Step1: 注入Cookie {injected}项")
                try:
                    driver.get("https://www.douyin.com")
                except Exception:
                    pass
        time.sleep(2)

        # Step 2: navigate to live search
        encoded = urllib.parse.quote(keyword)
        search_url = f"https://www.douyin.com/search/{encoded}?type=live"
        print(f"[douyin-search][selenium] Step2: 导航到搜索页 {search_url}")
        try:
            driver.get(search_url)
            print(f"[douyin-search][selenium] Step2: 搜索页标题={driver.title!r}")
            low_title = (driver.title or "").lower()
            if any(k in low_title for k in ["验证", "captcha", "verify", "安全"]):
                print("[douyin-search][selenium] ⚠ 检测到验证码/风控页面，可能无法抓取搜索结果")
        except Exception as e:
            print(f"[douyin-search][selenium] Step2: 搜索页加载异常 {e}")
        time.sleep(3)

        # Step 3: capture XHR response bodies that look like search results
        print(f"[douyin-search][selenium] Step3: 开始监听 XHR，超时 {timeout_sec}s...")
        seen_req_ids: set = set()
        all_xhr_urls: list = []
        deadline = time.time() + timeout_sec
        tick = 0
        while time.time() < deadline:
            tick += 1
            try:
                logs = driver.get_log("performance")
                for entry in logs:
                    try:
                        msg = json.loads(entry["message"])["message"]
                        method = msg.get("method", "")
                        if method == "Network.responseReceived":
                            response = msg.get("params", {}).get("response", {})
                            resp_url = response.get("url", "")
                            mime_type = str(response.get("mimeType", "")).lower()
                            if resp_url and "douyin" in resp_url:
                                # 记录所有抖音相关 XHR URL（用于诊断）
                                short = resp_url.split('?')[0][-80:]
                                if short not in all_xhr_urls:
                                    all_xhr_urls.append(short)

                            # 只处理“可能是业务 JSON”的接口，避免把 css/js/html 当 JSON 解析
                            is_api_url = any(k in resp_url for k in [
                                "/aweme/", "/webcast/", "/search/", "/discover/"
                            ])
                            is_json_like = ("json" in mime_type)
                            if is_api_url and "douyin" in resp_url and (is_json_like or "/aweme/" in resp_url):
                                req_id = msg["params"]["requestId"]
                                if req_id in seen_req_ids:
                                    continue
                                seen_req_ids.add(req_id)
                                short_resp = resp_url.split('?')[0][-80:]
                                print(f"[douyin-search][selenium]   XHR命中: {short_resp}")
                                try:
                                    body = driver.execute_cdp_cmd(
                                        "Network.getResponseBody", {"requestId": req_id}
                                    )
                                    content = body.get("body", "")
                                    print(
                                        f"[douyin-search][selenium]   响应体长度={len(content)} "
                                        f"snippet={content[:120].replace(chr(10),' ')!r}"
                                    )
                                    if content and len(content) > 30 and content.lstrip().startswith(("{", "[")):
                                        parsed = _parse_douyin_search_json(content)
                                        print(f"[douyin-search][selenium]   解析出直播间={len(parsed)}")
                                        if parsed:
                                            rooms.extend(parsed)
                                            print(f"[douyin-search][selenium] ✓ XHR抓取到{len(parsed)}个直播间")
                                    else:
                                        print("[douyin-search][selenium]   非JSON响应，跳过解析")
                                except Exception as xe:
                                    print(f"[douyin-search][selenium]   getResponseBody 失败: {xe}")
                    except Exception:
                        pass
            except Exception as le:
                print(f"[douyin-search][selenium] get_log 异常: {le}")

            # 每 10 个 tick (~12s) 打印一次进度
            if tick % 10 == 0:
                elapsed = round(time.time() - (deadline - timeout_sec), 1)
                print(
                    f"[douyin-search][selenium] 进度 {elapsed}s/{timeout_sec}s "
                    f"rooms={len(rooms)} xhr_urls={len(all_xhr_urls)}"
                )

            if len(rooms) >= max_results:
                break
            time.sleep(1.2)

        print(f"[douyin-search][selenium] Step3 结束，共捕获XHR URL={len(all_xhr_urls)} rooms={len(rooms)}")
        if all_xhr_urls:
            print(f"[douyin-search][selenium] 捕获到的抖音XHR路径:")
            for u in all_xhr_urls[:20]:
                print(f"  - {u}")

        # Step 4: DOM fallback if XHR yielded nothing
        if not rooms:
            print("[douyin-search][selenium] Step4: XHR无结果，尝试DOM提取...")
            rooms = _extract_rooms_from_dom(driver)
            print(f"[douyin-search][selenium] Step4: DOM提取结果 rooms={len(rooms)}")

        # Deduplicate
        seen_ids: set = set()
        unique: list = []
        for r in rooms:
            if r.get("room_id") and r["room_id"] not in seen_ids:
                seen_ids.add(r["room_id"])
                unique.append(r)
        return unique[:max_results]

    except Exception as e:
        print(f"[douyin-search] Selenium搜索失败: {e}")
        return []
    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass


async def _search_douyin_live_rooms(keyword: str, max_results: int = 12) -> list:
    """
    Main orchestrator for Douyin live room search.
    Strategy: httpx direct API → Selenium CDP fallback.
    """
    # Method 1: fast direct HTTP
    rooms = await _try_httpx_douyin_search(keyword, max_results)
    if rooms:
        return rooms

    # Method 2: full Selenium search
    print(f"[douyin-search] 启动Selenium搜索 keyword={keyword!r}...")
    rooms = await asyncio.to_thread(_selenium_search_live_rooms, keyword, max_results)
    return rooms


async def _score_and_rank_rooms(keyword: str, rooms: list) -> list:
    """Use LLM to score and rank rooms; fall back to viewer-count heuristic."""
    if not rooms:
        return rooms

    # Viewer-count heuristic as quick baseline
    max_vc = max((r.get("viewer_count", 0) for r in rooms), default=1) or 1
    for r in rooms:
        vc_score = min(r.get("viewer_count", 0) / max_vc * 0.6, 0.6)
        r["recommendation_score"] = round(0.3 + vc_score, 3)

    if not (client_async and LLM_API_KEY):
        rooms.sort(key=lambda x: x["recommendation_score"], reverse=True)
        return rooms

    summaries = [
        {
            "room_id": r["room_id"],
            "title": r["title"][:60],
            "streamer": r["streamer_name"],
            "viewers": r["viewer_count"],
        }
        for r in rooms[:12]
    ]

    system = (
        "你是消费者购物助手。根据搜索词和各直播间标题/主播/观看人数，"
        "为每个直播间评估推荐程度（0-1）和风险等级(low/medium/high)。"
        "考虑：①标题与搜索词相关性 ②话术是否含饥饿营销/虚假承诺等高风险词 ③观看人数口碑。"
        "输出JSON数组（只输出数组，不要包裹键）："
        "[{\"room_id\":\"...\",\"recommendation_score\":0.7,\"risk_level\":\"low\",\"reason\":\"...\"}]"
    )
    user = f"搜索词：{keyword}\n直播间列表：{json.dumps(summaries, ensure_ascii=False)}"

    # Fallback: viewer-count scores already set
    fallback_scores = [
        {
            "room_id": r["room_id"],
            "recommendation_score": r["recommendation_score"],
            "risk_level": "medium",
            "reason": "依观看人数估算",
        }
        for r in rooms
    ]

    try:
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            max_tokens=700,
            temperature=0.3,
        )
        raw = (resp.choices[0].message.content or "").strip()
        raw = _extract_json_block(raw)
        # Result may be a raw array or {"scores": [...]}
        if raw.startswith("["):
            scores_list = json.loads(raw)
        else:
            scores_list = json.loads(raw)
            if isinstance(scores_list, dict):
                scores_list = list(scores_list.values())[0] if scores_list else []
    except Exception as e:
        print(f"[douyin-search] LLM评分失败: {e}")
        rooms.sort(key=lambda x: x["recommendation_score"], reverse=True)
        return rooms

    if not isinstance(scores_list, list):
        scores_list = fallback_scores

    score_map = {
        str(s.get("room_id", "")): s
        for s in scores_list
        if isinstance(s, dict)
    }
    for r in rooms:
        s = score_map.get(r["room_id"], {})
        raw_score = s.get("recommendation_score", r["recommendation_score"])
        r["recommendation_score"] = round(_clamp01(float(raw_score)), 3)
        r["risk_level"] = str(s.get("risk_level", "medium")).lower()
        if r["risk_level"] not in ("low", "medium", "high"):
            r["risk_level"] = "medium"
        r["reason"] = str(s.get("reason", "")).strip()[:80]

    rooms.sort(key=lambda x: x["recommendation_score"], reverse=True)
    return rooms


def _get_ffmpeg_bin() -> str:
    """
    自动获取 ffmpeg 路径。
    优先顺序：
      1. imageio-ffmpeg 内置二进制（pip install imageio-ffmpeg，无需手动安装、无需配 PATH）
      2. 系统 PATH 中的 ffmpeg（已手动安装的用户 fallback）
    """
    try:
        import imageio_ffmpeg
        path = imageio_ffmpeg.get_ffmpeg_exe()
        if path and os.path.isfile(path):
            return path
    except Exception:
        pass
    path = shutil.which("ffmpeg")
    if path:
        return path
    raise RuntimeError(
        "ffmpeg 未找到。请运行: pip install imageio-ffmpeg  "
        "（或手动安装系统 ffmpeg 并加入 PATH）"
    )


def _capture_audio_clip_bytes(stream_url: str, seconds: int = 20) -> bytes:
    """Capture a short audio clip from a live stream URL.
    Uses imageio-ffmpeg (bundled binary, no system install needed)
    or falls back to system ffmpeg.
    """
    ffmpeg_bin = _get_ffmpeg_bin()

    with tempfile.TemporaryDirectory() as td:
        out_wav = os.path.join(td, "clip.wav")
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", stream_url,
            "-t", str(max(8, min(seconds, 90))),
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-acodec", "pcm_s16le",
            out_wav,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not os.path.exists(out_wav):
            stderr_tail = (proc.stderr or "")[-600:]
            raise RuntimeError(f"ffmpeg capture failed: {stderr_tail}")

        with open(out_wav, "rb") as f:
            return f.read()


# faster-whisper 本地模型缓存（惰性初始化）
_fw_model = None
_FW_MODEL_SIZE = os.getenv("LOCAL_WHISPER_MODEL", "base")  # tiny/base/small/medium


def _transcribe_local_whisper(audio_bytes: bytes) -> str:
    """Local transcription via faster-whisper (no API key, no cloud)."""
    global _fw_model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper 未安装。运行: pip install faster-whisper"
        )
    if _fw_model is None:
        print(f"[ASR-local] 首次加载 faster-whisper '{_FW_MODEL_SIZE}' 模型，请稍候...")
        _fw_model = WhisperModel(_FW_MODEL_SIZE, device="cpu", compute_type="int8")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        segments, _ = _fw_model.transcribe(tmp_path, language="zh", beam_size=5)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _transcribe_zh_audio_bytes(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Transcribe Chinese audio bytes.
    Priority:
      1. asr_client — OpenAI cloud Whisper (requires valid ASR_OPENAI_API_KEY)
      2. faster-whisper — local, free, no API key needed
    """
    global asr_client  # may be set to None on first 401 to skip cloud permanently
    if asr_client:
        try:
            transcript = asr_client.audio.transcriptions.create(
                model="whisper-1",
                file=(filename, io.BytesIO(audio_bytes), "audio/wav"),
                language="zh",
            )
            return (transcript.text or "").strip()
        except Exception as e:
            # 401 / 认证失败 → key 无效，永久禁用云端，避免每次都重试
            err_str = str(e)
            is_auth_err = (
                "401" in err_str
                or "invalid_api_key" in err_str
                or "Incorrect API key" in err_str
                or getattr(type(e), "__name__", "") == "AuthenticationError"
            )
            if is_auth_err:
                print("[ASR] API key 无效（401），已永久禁用云端 ASR，后续将直接使用本地 faster-whisper")
                asr_client = None
            else:
                print(f"[ASR-cloud] 请求失败 ({e})，本次切换本地 faster-whisper...")
    return _transcribe_local_whisper(audio_bytes)


# ============= Data Sources =============

class MockLiveSource:
    """Mock live streaming data"""

    UTTERANCES = [
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
        "抚平细纹，提亮肤色，效果立竿见影",
        "今天下单，加送价值99元的旅行套装",
        "我们是品牌方直接授权，保证正品",
        "看一下这个质地，非常水润，不油腻",
        "所有肤质都适用，特别是熬夜肌",
    ]

    CHATS = [
        "好用吗真的？", "买了上次的还没用完", "价格有点贵",
        "主播能不能给个优惠码", "我朋友用了说很好", "先收藏",
        "这个有没有替代品", "下单了！", "求链接", "正品吗",
        "敏感肌能用吗？", "保质期多久？", "怎么查防伪？",
        "已经买了，等收货", "主播今天好漂亮", "支持主播",
        "物流快不快？", "还有其他赠品吗？", "蹲一个链接",
        "这个牌子很有名",
    ]

    async def stream(self, callback):
        idx = 0
        last_utterance = ""  # 记录最近一条话术，供弹幕关联分析用
        while True:
            await asyncio.sleep(random.uniform(2.5, 4.0))
            text = self.UTTERANCES[idx % len(self.UTTERANCES)]
            idx += 1
            last_utterance = text
            analysis = await analyze_utterance_async(text)
            await callback({
                "event": "utterance",
                "id": int(time.time() * 1000),
                "text": text,
                "timestamp": time.strftime("%H:%M:%S"),
                **analysis,
            })

            chat = random.choice(self.CHATS)
            chat_analysis = await analyze_chat_llm(chat, recent_utterance=last_utterance)
            await callback({
                "event": "chat",
                "user": f"User{random.randint(1000, 9999)}",
                "text": chat,
                "timestamp": time.strftime("%H:%M:%S"),
                **chat_analysis,
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

    async def _audio_loop(self, callback):
        """
        连续音频监听后台循环（消费者级实用方案）：
        自动发现直播媒体流 → 每 15s 采集一窗口 → 转写 → 推送 utterance 事件到前端。
        无需 API Key：优先 faster-whisper 本地模型。
        """
        print(f"[audio-loop] 正在发现直播媒体流（房间: {self.room_id}）...")
        try:
            media_url = await asyncio.to_thread(_discover_douyin_media_url, self.room_id, 20)
        except Exception as e:
            print(f"[audio-loop] 媒体流发现失败: {e}")
            return

        if not media_url:
            print("[audio-loop] 未能找到可用媒体流，音频监听退出（直播间可能已下线或有反爬限制）")
            await callback({
                "event": "media_url_discovered",
                "url": None,
                "status": "not_found",
                "room_id": self.room_id,
            })
            return

        print(f"[audio-loop] ✓ 发现媒体流，开始连续监听: {media_url[:80]}...")
        # 立即把流地址推给前端，前端可用 hls.js 直接播放
        await callback({
            "event": "media_url_discovered",
            "url": media_url,
            "status": "found",
            "room_id": self.room_id,
            "timestamp": time.strftime("%H:%M:%S"),
        })
        WINDOW_SECS = 15  # 每次采集 15 秒，兼顾句子完整性与响应延迟

        while True:
            try:
                audio_bytes = await asyncio.to_thread(
                    _capture_audio_clip_bytes, media_url, WINDOW_SECS
                )
                text = await asyncio.to_thread(
                    _transcribe_zh_audio_bytes, audio_bytes, "live_loop.wav"
                )
                if text and len(text.strip()) > 3:
                    polished = await polish_transcript_for_consumer(text)
                    display_text = (polished.get("polished_text") or text).strip()
                    analysis = await analyze_utterance_async(display_text)
                    await callback({
                        "event": "utterance",
                        "id": int(time.time() * 1000),
                        "text": display_text,
                        "raw_text": text.strip(),
                        "keywords": polished.get("keywords", []),
                        "timestamp": time.strftime("%H:%M:%S"),
                        "source": "audio",   # 标记来源：音频转写
                        **analysis,
                    })
                    print(f"[audio-loop] 📝 转写: {display_text[:60]}{'...' if len(display_text)>60 else ''}")
                else:
                    print("[audio-loop] 静默片段，跳过")
            except asyncio.CancelledError:
                print("[audio-loop] 已停止")
                _stop_hls_relay(self.room_id)
                break
            except Exception as e:
                print(f"[audio-loop] 采集/转写错误: {e}")
                await asyncio.sleep(6)  # 出错后等 6s 再重试，防止过频重试
                continue
            # 短暂间隔，避免与上一窗口完全重叠
            await asyncio.sleep(1)

    async def stream(self, callback):
        from douyin_cdp import stream_douyin_cdp

        last_utterance_text = ""

        async def _on_event(evt: dict):
            nonlocal last_utterance_text
            if evt.get("event") == "chat":
                text = evt.get("text", "")
                if text.strip():
                    # 弹幕语义分析（将最近话术传入做关联分析）
                    chat_analysis = await analyze_chat_llm(text, recent_utterance=last_utterance_text)
                    await callback({**evt, **chat_analysis})

                    # ★ 将真实质疑/投诉弹幕提升为 utterance 填充 SemanticFeed
                    # LLM 已判断意图，只需校验含实质汉字（排除表情包/数字刷屏）
                    _intent = chat_analysis.get("intent", "other")
                    _has_hanzi = bool(__import__('re').search(r'[\u4e00-\u9fff]{3,}', text))
                    if _intent in ("doubt", "complaint") and _has_hanzi:
                        utt_analysis = await analyze_utterance_async(text)
                        await callback({
                            "event": "utterance",
                            "id": int(time.time() * 1000),
                            "text": text,
                            "timestamp": evt.get("timestamp", time.strftime("%H:%M:%S")),
                            "source": "chat",   # 标记来源：弹幕质疑/投诉
                            **utt_analysis,
                        })
            elif evt.get("event") == "utterance":
                last_utterance_text = evt.get("text", "")
                await callback(evt)
            else:
                await callback(evt)

        # 后台启动连续音频监听（自动转写主播话术 → utterance 事件）
        audio_task = asyncio.create_task(self._audio_loop(callback))
        try:
            await stream_douyin_cdp(self.room_id, _on_event)
        finally:
            audio_task.cancel()
            try:
                await audio_task
            except asyncio.CancelledError:
                pass
            _stop_hls_relay(self.room_id)  # 断开时清理 ffmpeg 中继进程


@app.get("/hls/{room_id}/{filename}")
async def serve_hls_file(room_id: str, filename: str):
    """
    \u670d\u52a1\u672c\u5730 HLS \u4e2d\u7ee7\u6587\u4ef6\uff08.m3u8 manifest + .ts \u5206\u7247\uff09。
    \u81ea\u5e26 CORS \u5934\uff0c\u524d\u7aef hls.js \u53ef\u76f4\u63a5\u8bbf\u95ee\u65e0\u8de8\u57df\u95ee\u9898\u3002
    """
    # \u9632\u6b62\u8def\u5f84\u7a7f\u8d8a
    safe_name = os.path.basename(filename)
    fpath = os.path.join(_HLS_BASE_DIR, room_id, safe_name)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="Segment not found")
    if safe_name.endswith(".m3u8"):
        return FileResponse(
            fpath,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache, no-store",
            },
        )
    return FileResponse(
        fpath,
        media_type="video/MP2T",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.websocket("/ws/douyin/{room_id}")
async def ws_douyin_stream(websocket: WebSocket, room_id: str):
    """Proxies a real Douyin live room to the frontend."""
    await websocket.accept()
    room_id_clean = _normalize_room_id(room_id)
    if not room_id_clean:
        try:
            await websocket.send_json({"event": "error", "message": f"Invalid room_id: {room_id}"})
        except Exception:
            pass
        await websocket.close()
        return
    source = DouyinLiveSource(room_id_clean)

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


@app.get("/douyin/room-info/{room_id}")
async def douyin_room_info(room_id: str):
    """
    快速直播间可访问性探测（不启动 Selenium，纯 HTTP 请求）。
    用于前端在用户输入 URL/room_id 时即时反馈房间状态。
    """
    import requests as req_lib

    room_id_clean = _normalize_room_id(room_id)
    if not room_id_clean:
        raise HTTPException(status_code=400, detail="invalid room_id or douyin live url")

    url = f"https://live.douyin.com/{room_id_clean}"

    def _check():
        try:
            r = req_lib.get(
                url, timeout=6, allow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                                  "Chrome/124.0.0.0 Safari/537.36",
                    "Referer": "https://www.douyin.com/",
                },
            )
            # Douyin returns 200 for valid rooms even if not live
            live_hint = "直播" in r.text or "live" in r.url.lower()
            return {
                "reachable": r.status_code == 200,
                "status_code": r.status_code,
                "live_hint": live_hint,
            }
        except Exception as e:
            return {"reachable": None, "error": str(e)[:120]}

    result = await asyncio.to_thread(_check)
    return {
        "room_id": room_id_clean,
        "url": url,
        "checked_at": time.strftime("%H:%M:%S"),
        **result,
    }


@app.get("/douyin/resolve-room-id")
async def resolve_room_id(input: str):
    """Utility: resolve raw Douyin URL/text into room_id for troubleshooting."""
    rid = _normalize_room_id(input)
    return {
        "input": input,
        "room_id": rid,
        "ok": bool(rid),
    }


@app.get("/consumer/search-live-streams")
async def search_live_streams(q: str, max_results: int = 12):
    """
    搜索抖音直播间中正在销售指定商品的直播间，返回按推荐度降序排列的列表。
    策略：httpx直接API → Selenium CDP → 空结果（如遇反爬限制）。
    """
    keyword = (q or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="q is required")

    max_results = max(1, min(int(max_results), 20))
    print(f"\n{'='*60}")
    print(f"[search-live-streams] ▶ 搜索开始 keyword={keyword!r} max={max_results}")
    print(f"{'='*60}")

    import traceback
    try:
        rooms = await _search_douyin_live_rooms(keyword, max_results=max_results)
    except Exception as e:
        print(f"[search-live-streams] ✗ 搜索异常: {type(e).__name__}: {e}")
        traceback.print_exc()
        rooms = []

    print(f"[search-live-streams] 搜索完成，原始结果={len(rooms)} 个直播间")

    # Score and rank
    try:
        rooms = await _score_and_rank_rooms(keyword, rooms)
    except Exception as e:
        print(f"[search-live-streams] LLM评分异常: {e}")
        rooms.sort(key=lambda x: x.get("viewer_count", 0), reverse=True)

    print(f"[search-live-streams] ◀ 最终返回 {len(rooms)} 个直播间")
    has_cookie = bool(os.getenv("DOUYIN_COOKIE", "").strip())
    if not rooms:
        if has_cookie:
            note = "抖音返回空结果：当前会话未拿到可解析的直播搜索数据（可能是风控或页面加载超时）"
        else:
            note = "抖音返回空结果：未提供登录Cookie，匿名会话常被限制直播搜索；建议配置 DOUYIN_COOKIE"
    else:
        note = ""
    return {
        "keyword": keyword,
        "rooms": rooms,
        "total": len(rooms),
        "data_source": "douyin_live" if rooms else "none",
        "search_note": note,
        "diagnostics": {
            "has_douyin_cookie": has_cookie,
            "pipeline": "httpx->selenium->dom",
        },
    }


@app.post("/consumer/compare-streams")
async def compare_streams(payload: Dict[str, Any]):
    """
    对比多个直播间商品（跨直播间P1/P2分析）。
    输入：{ keyword, rooms: [{room_id, title, streamer_name, viewer_count, ...}], user_profile }
    复用 /consumer/full-suite 逻辑，将直播间元数据作为候选商品传入。
    """
    keyword = str(payload.get("keyword") or "").strip()
    rooms_in = payload.get("rooms") or []
    user_profile = payload.get("user_profile") if isinstance(payload.get("user_profile"), dict) else {}

    if not isinstance(rooms_in, list) or len(rooms_in) < 2:
        raise HTTPException(status_code=400, detail="至少需要2个直播间进行对比")

    # Convert rooms to product-format for full-suite
    products = []
    for r in rooms_in[:8]:
        if not isinstance(r, dict):
            continue
        viewer_fmt = f"{r.get('viewer_count', 0)}人在看"
        products.append({
            "id": str(r.get("room_id", "")),
            "name": str(r.get("title", "直播间"))[:60],
            "brand": str(r.get("streamer_name", "主播")),
            "price": str(r.get("price", "--")),
            "spec": viewer_fmt,
            "channel": f"https://live.douyin.com/{r.get('room_id','')}",
            "fit_for": [],
            "known_risks": ([str(r.get("reason", ""))] if r.get("reason") else []),
            "risk_level": r.get("risk_level", "medium"),
        })

    # Reuse full-suite endpoint logic
    compare_payload = {
        "product_query": keyword,
        "products": products,
        "user_profile": user_profile,
        "stream_context": {"utterances": [], "chats": []},
    }
    return await consumer_full_suite(compare_payload)


@app.get("/consumer/search-products")
async def consumer_search_products(q: str, category: str = ""):
    """P1: 搜索商品并返回候选列表（优先LLM生成结构化候选）。"""
    query = (q or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="q is required")

    fallback = {
        "query": query,
        "category": category or "通用",
        "products": [
            {
                "id": "p1",
                "name": f"{query} 标准版",
                "brand": "待核验",
                "price": "--",
                "spec": "--",
                "channel": "直播间A",
                "fit_for": ["价格敏感", "基础需求"],
                "known_risks": ["参数待核验"],
            },
            {
                "id": "p2",
                "name": f"{query} 进阶版",
                "brand": "待核验",
                "price": "--",
                "spec": "--",
                "channel": "直播间B",
                "fit_for": ["性能优先"],
                "known_risks": ["售后条款待确认"],
            },
        ],
        "engine": "fallback",
    }

    system = (
        "你是电商导购检索助手。用户给定商品关键词后，输出可比较的候选商品列表。"
        "禁止编造具体参数；不确定信息可写‘待核验’。"
        "严格返回JSON："
        "{\"query\":\"...\",\"category\":\"...\",\"products\":[{\"id\":\"...\",\"name\":\"...\",\"brand\":\"...\","
        "\"price\":\"...\",\"spec\":\"...\",\"channel\":\"...\",\"fit_for\":[\"...\"],\"known_risks\":[\"...\"]}]}"
    )
    user = f"关键词：{query}\n类目：{category or '自动判断'}\n请给出4-8个候选商品。"
    data = await _consumer_llm_json(system, user, fallback, max_tokens=900)
    products = data.get("products") if isinstance(data.get("products"), list) else fallback["products"]
    for i, p in enumerate(products):
        if not isinstance(p, dict):
            products[i] = fallback["products"][i % len(fallback["products"])]
            continue
        p.setdefault("id", f"p{i+1}")
        p.setdefault("name", f"候选商品{i+1}")
        p.setdefault("brand", "待核验")
        p.setdefault("price", "--")
        p.setdefault("spec", "--")
        p.setdefault("channel", "直播间")
        p["fit_for"] = p.get("fit_for") if isinstance(p.get("fit_for"), list) else []
        p["known_risks"] = p.get("known_risks") if isinstance(p.get("known_risks"), list) else []

    return {
        "query": data.get("query", query),
        "category": data.get("category", category or "通用"),
        "products": products[:8],
        "engine": "llm" if client_async and LLM_API_KEY else "fallback",
    }


@app.post("/consumer/full-suite")
async def consumer_full_suite(payload: Dict[str, Any]):
    """
    P0+P1+P2 一体化消费者决策接口：
    - P0 结论卡：买/等等/不买
    - P1 同类对比：商品清单 + 垂类维度对比 + 直播证据引用
    - P2 行动工具：反问清单、替代方案、买点时机、风险回放
    """
    product_query = str(payload.get("product_query") or "").strip()
    products = payload.get("products") if isinstance(payload.get("products"), list) else []
    user_profile = payload.get("user_profile") if isinstance(payload.get("user_profile"), dict) else {}
    stream_context = payload.get("stream_context") if isinstance(payload.get("stream_context"), dict) else {}

    utterances = _trim_text_list(stream_context.get("utterances", []), limit=40)
    chats = _trim_text_list(stream_context.get("chats", []), limit=60)

    fallback = {
        "p0": {
            "verdict": "WAIT",
            "confidence": 0.5,
            "why_buy": ["信息不足，先补证据"],
            "why_not_buy": ["缺少稳定价格/质量证明"],
            "must_verify": ["规格参数", "退换货政策", "历史价格"],
            "consumer_summary": "当前证据不足，不建议立刻下单。",
        },
        "p1": {
            "compare_dimensions": ["价格透明度", "质量证据", "售后保障", "主播话术可信度", "弹幕口碑"],
            "products": [
                {
                    "name": (products[0].get("name") if products and isinstance(products[0], dict) else product_query) or "当前商品",
                    "scores": {
                        "价格透明度": 0.5,
                        "质量证据": 0.5,
                        "售后保障": 0.5,
                        "主播话术可信度": 0.5,
                        "弹幕口碑": 0.5,
                    },
                    "pros": ["待补充"],
                    "cons": ["待补充"],
                    "overall": 0.5,
                }
            ],
            "ranked": ["当前商品"],
            "analysis_notes": ["未连接完整商品库，建议结合平台实价二次核对。"],
        },
        "p2": {
            "ask_anchor_questions": [
                "请给出该商品最近30天最低到手价截图？",
                "核心参数/成分第三方检测报告编号是什么？",
                "7天无理由、运费险和质保范围如何？",
            ],
            "alternatives": ["先收藏，比较2-3家同规格后再决策"],
            "buy_timing": "建议先观望到价格/证据明确后再下单",
            "risk_replay": [
                {"title": "高风险话术片段", "detail": "建议检查‘最后/最低/包治’等承诺是否可证实"}
            ],
            "action_plan": ["先核价", "再核证据", "最后看售后"],
        },
        "engine": "fallback",
    }

    system = (
        "你是消费者决策顾问，任务是帮助用户判断‘值不值得买’。"
        "请结合直播证据（主播话术、弹幕反馈）与商品对比做结论，避免空泛。"
        "输出必须是JSON，结构："
        "{"
        "\"p0\":{\"verdict\":\"BUY|WAIT|SKIP\",\"confidence\":0-1,\"why_buy\":[...],\"why_not_buy\":[...],\"must_verify\":[...],\"consumer_summary\":\"...\"},"
        "\"p1\":{\"compare_dimensions\":[...],\"products\":[{\"name\":\"...\",\"scores\":{\"维度\":0-1},\"pros\":[...],\"cons\":[...],\"overall\":0-1}],\"ranked\":[\"...\"],\"analysis_notes\":[...]},"
        "\"p2\":{\"ask_anchor_questions\":[...],\"alternatives\":[...],\"buy_timing\":\"...\",\"risk_replay\":[{\"title\":\"...\",\"detail\":\"...\"}],\"action_plan\":[...]}"
        "}"
    )
    user = json.dumps(
        {
            "product_query": product_query,
            "products": products[:8],
            "user_profile": user_profile,
            "stream_evidence": {
                "utterances": utterances,
                "chats": chats,
            },
        },
        ensure_ascii=False,
    )

    data = await _consumer_llm_json(system, user, fallback, max_tokens=1600)

    p0 = data.get("p0") if isinstance(data.get("p0"), dict) else fallback["p0"]
    p1 = data.get("p1") if isinstance(data.get("p1"), dict) else fallback["p1"]
    p2 = data.get("p2") if isinstance(data.get("p2"), dict) else fallback["p2"]

    verdict = str(p0.get("verdict", "WAIT")).upper()
    if verdict not in ("BUY", "WAIT", "SKIP"):
        verdict = "WAIT"
    p0["verdict"] = verdict
    p0["confidence"] = round(_clamp01(p0.get("confidence", 0.5)), 3)
    for k in ("why_buy", "why_not_buy", "must_verify"):
        if not isinstance(p0.get(k), list):
            p0[k] = []
    p0["consumer_summary"] = str(p0.get("consumer_summary", "")).strip()

    dims = p1.get("compare_dimensions") if isinstance(p1.get("compare_dimensions"), list) else []
    p1["compare_dimensions"] = [str(d) for d in dims][:8] or fallback["p1"]["compare_dimensions"]
    plist = p1.get("products") if isinstance(p1.get("products"), list) else []
    norm_products = []
    for p in plist[:10]:
        if not isinstance(p, dict):
            continue
        scores = p.get("scores") if isinstance(p.get("scores"), dict) else {}
        norm_scores = {str(k): round(_clamp01(v), 3) for k, v in scores.items()}
        norm_products.append({
            "name": str(p.get("name", "候选商品")),
            "scores": norm_scores,
            "pros": p.get("pros") if isinstance(p.get("pros"), list) else [],
            "cons": p.get("cons") if isinstance(p.get("cons"), list) else [],
            "overall": round(_clamp01(p.get("overall", 0.5)), 3),
        })
    p1["products"] = norm_products or fallback["p1"]["products"]
    p1["ranked"] = p1.get("ranked") if isinstance(p1.get("ranked"), list) else []
    p1["analysis_notes"] = p1.get("analysis_notes") if isinstance(p1.get("analysis_notes"), list) else []

    for k in ("ask_anchor_questions", "alternatives", "action_plan"):
        if not isinstance(p2.get(k), list):
            p2[k] = []
    if not isinstance(p2.get("risk_replay"), list):
        p2["risk_replay"] = []
    p2["buy_timing"] = str(p2.get("buy_timing", "")).strip()

    return {
        "p0": p0,
        "p1": p1,
        "p2": p2,
        "evidence_stats": {
            "utterance_count": len(utterances),
            "chat_count": len(chats),
        },
        "engine": "llm" if client_async and LLM_API_KEY else "fallback",
    }


@app.get("/analyze")
async def analyze_text(text: str):
    """Analyze single utterance via LLM"""
    return await analyze_utterance_async(text)


@app.get("/chat-analyze")
async def chat_analyze(text: str, recent_utterance: str = ""):
    """Analyze a single danmaku/chat message via LLM"""
    return await analyze_chat_llm(text, recent_utterance=recent_utterance)


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Convert audio to text using Whisper"""
    if not (asr_client or client_sync):
        raise HTTPException(status_code=500, detail="ASR client not configured")

    try:
        contents = await file.read()
        transcript_text = _transcribe_zh_audio_bytes(contents, filename=file.filename or "upload.wav")
        return {
            "text": transcript_text,
            "language": "zh",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/analyze-with-transcript")
async def analyze_with_transcript(file: UploadFile = File(...)):
    """Audio -> Transcribe -> Analyze"""
    if not (asr_client or client_sync):
        raise HTTPException(status_code=500, detail="ASR client not configured")

    start = time.time()

    try:
        contents = await file.read()
        text = _transcribe_zh_audio_bytes(contents, filename=file.filename or "upload.wav")
        polished = await polish_transcript_for_consumer(text)
        polished_text = (polished.get("polished_text") or text).strip()

        analysis = analyze_audio_semantics(polished_text)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "text": polished_text,
            "raw_text": text,
            "keywords": polished.get("keywords", []),
            "analysis": analysis,
            "latency_ms": elapsed_ms,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/douyin/audio-analyze/{room_id}")
async def analyze_douyin_audio(room_id: str, seconds: int = 20):
    """Douyin room audio -> transcript -> semantic alignment analysis."""
    if not (asr_client or client_sync):
        raise HTTPException(status_code=500, detail="ASR client not configured")

    started = time.time()
    try:
        room_id_clean = _normalize_room_id(room_id)
        if not room_id_clean:
            raise HTTPException(status_code=400, detail="invalid room_id or douyin live url")

        media_url = _discover_douyin_media_url(room_id_clean, timeout_sec=20)
        if not media_url:
            raise HTTPException(
                status_code=502,
                detail="No live media URL detected (room may be offline or anti-bot challenge active)",
            )

        audio_bytes = _capture_audio_clip_bytes(media_url, seconds=seconds)

        text = _transcribe_zh_audio_bytes(audio_bytes, filename="douyin_audio.wav")
        if not text:
            raise HTTPException(status_code=502, detail="ASR returned empty transcript")

        polished = await polish_transcript_for_consumer(text)
        polished_text = (polished.get("polished_text") or text).strip()

        overall = analyze_audio_semantics(polished_text)
        sentence_items = []
        for idx, seg in enumerate(_split_sentences_zh(polished_text), start=1):
            sentence_items.append({
                "idx": idx,
                "text": seg,
                "analysis": await analyze_utterance_async(seg),
            })

        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "room_id": room_id_clean,
            "seconds": seconds,
            "transcript": polished_text,
            "raw_transcript": text,
            "keywords": polished.get("keywords", []),
            "analysis": overall,
            "sentence_analysis": sentence_items,
            "latency_ms": elapsed_ms,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Douyin audio pipeline failed: {str(e)}")


@app.get("/douyin/hls-proxy")
async def hls_proxy(url: str):
    """
    HLS 流代理端点—代理 Douyin CDN 请求并添加 CORS 头。

    - m3u8 manifest 中的 URL 全部改写为代理路径，让浏览器能逐段请求
    - 残差 302/chunked 流均选择直接回传
    - 利用 httpx 异步请求，不阻塞 FastAPI 事件循环
    """
    try:
        import httpx
    except ImportError:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"detail": "httpx 未安装，请运行: pip install httpx"}
        )

    from fastapi import Request
    from fastapi.responses import Response, StreamingResponse

    FORWARD_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/124.0.0.0 Safari/537.36",
        "Referer":    "https://live.douyin.com/",
        "Origin":     "https://live.douyin.com",
    }
    CORS_HEADERS = {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url, headers=FORWARD_HEADERS)
            resp.raise_for_status()
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=502, content={"detail": f"CDN 请求失败: {e}"})

    content_type = resp.headers.get("content-type", "")
    is_manifest = (
        ".m3u8" in url.lower()
        or "mpegurl" in content_type.lower()
        or resp.text.lstrip().startswith("#EXTM3U")
    )

    if is_manifest:
        # 重写 manifest 中所有子 URL 为代理路径
        lines = []
        for raw_line in resp.text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                # 对 #EXT-X-MAP URI 和 #EXT-X-KEY URI 也改写
                if 'URI="' in line:
                    def _rewrite_attr(m):
                        orig = m.group(1)
                        abs_url = urljoin(url, orig)
                        proxy = "/douyin/hls-proxy?url=" + urllib.parse.quote(abs_url, safe="")
                        return f'URI="{proxy}"'
                    import re as _re
                    line = _re.sub(r'URI="([^"]+)"', _rewrite_attr, line)
                lines.append(line)
            else:
                # 分片/子播单 URL
                abs_url  = urljoin(url, line)
                proxy    = "/douyin/hls-proxy?url=" + urllib.parse.quote(abs_url, safe="")
                lines.append(proxy)
        body = "\n".join(lines)
        return Response(
            content=body,
            media_type="application/vnd.apple.mpegurl",
            headers=CORS_HEADERS,
        )
    else:
        # 二进制分片直接回传
        return Response(
            content=resp.content,
            media_type=content_type or "application/octet-stream",
            headers=CORS_HEADERS,
        )


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
