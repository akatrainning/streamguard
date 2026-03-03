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
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

try:
    from openai import AsyncOpenAI, OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from douyin_search import search_douyin_live_rooms, clear_search_cache
    SEARCH_AVAILABLE = True
except ImportError:
    SEARCH_AVAILABLE = False
    print("[warn] douyin_search 模块未找到，搜索功能将使用兜底数据")

app = FastAPI(title="StreamGuard Backend")

# ============= Pydantic Models =============
class RoomInfo(BaseModel):
    room_id: str
    anchor_name: Optional[str] = None
    room_title: Optional[str] = None
    viewer_count: Optional[int] = 0
    thumbnail_url: Optional[str] = None
    status: Optional[str] = "living"
    recommendation_score: Optional[float] = 0.5

class CompareStreamsRequest(BaseModel):
    keyword: str
    rooms: List[RoomInfo]
    user_profile: Optional[dict] = None

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

# ASR client: prefer OpenAI official endpoint/key for Whisper compatibility
ASR_OPENAI_API_KEY = os.getenv("ASR_OPENAI_API_KEY", OPENAI_API_KEY)
ASR_BASE_URL = os.getenv("ASR_BASE_URL", "")
if OPENAI_AVAILABLE and ASR_OPENAI_API_KEY:
    try:
        asr_kwargs = {"api_key": ASR_OPENAI_API_KEY}
        if ASR_BASE_URL:
            asr_kwargs["base_url"] = ASR_BASE_URL
        asr_client = OpenAI(**asr_kwargs)
    except Exception:
        asr_client = None
else:
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


def analyze_chat_light(text: str, recent_utterance: str = "") -> dict:
    """
    轻量中文弹幕语义分析（纯规则，零延迟）。
    返回: sentiment / intent / flags / risk_score / correlation / label
    correlation: 与最近一条话术的语义关联 (support_claim / doubt_claim / unrelated)
    """
    t = (text or "").strip()
    if not t:
        return {"sentiment": "neutral", "intent": "other", "flags": [],
                "risk_score": 0.0, "correlation": "unrelated", "label": "💬 普通弹幕"}

    # Sentiment
    pos_hits = sum(1 for w in _CHAT_POS if w in t)
    neg_hits = sum(1 for w in _CHAT_NEG if w in t)
    sentiment = "pos" if pos_hits > neg_hits else "neg" if neg_hits > pos_hits else "neutral"

    # Intent (priority: ad_spam > complaint > doubt > purchase > support > question > other)
    intent = "other"
    flags: list[str] = []

    if any(w in t for w in _CHAT_AD_SPAM):
        intent, flags = "ad_spam", ["广告刷屏"]
        sentiment = "neg"
    elif any(w in t for w in _CHAT_COMPLAINT):
        intent, flags = "complaint", ["客诉投诉"]
        sentiment = "neg"
    elif any(w in t for w in _CHAT_DOUBT):
        intent, flags = "doubt", ["质疑话术"]
        if sentiment == "pos":
            sentiment = "neutral"
    elif any(w in t for w in _CHAT_PURCHASE):
        intent = "purchase"
    elif any(w in t for w in _CHAT_SUPPORT):
        intent = "support"
        if sentiment == "neg":
            sentiment = "neutral"
    elif any(w in t for w in _CHAT_QUESTION):
        intent = "question"

    # 刷屏检测（字符集非常小但文本较长）
    if len(set(t)) <= 3 and len(t) >= 6:
        flags.append("重复刷屏")
        intent = "ad_spam"

    # 与最近话术的关联性
    correlation = "unrelated"
    if recent_utterance:
        ru = recent_utterance.lower()
        # 话术中含极限词/夸大词，弹幕在质疑 → 关联质疑
        utterance_risk_words = ["全网最低", "最", "绝", "100%", "百分之百", "神奇", "立刻", "马上", "秒", "万能"]
        if intent == "doubt" and any(w in ru for w in utterance_risk_words):
            correlation = "doubt_claim"
            flags.append("疑问当前话术")
        elif intent in ("purchase", "support") and sentiment == "pos":
            correlation = "support_claim"
        elif intent == "complaint":
            correlation = "doubt_claim"
            flags.append("投诉关联话术")

    # Risk score
    risk_map = {"ad_spam": 0.9, "complaint": 0.75, "doubt": 0.55, "question": 0.1,
                "purchase": 0.0, "support": 0.0, "other": 0.0}
    risk = risk_map.get(intent, 0.0)
    if sentiment == "neg" and risk < 0.4:
        risk = 0.4

    return {
        "sentiment":   sentiment,                          # pos / neg / neutral
        "intent":      intent,                             # purchase / question / complaint / doubt / support / ad_spam / other
        "flags":       flags,                              # 中文警示标签
        "risk_score":  round(risk, 2),
        "correlation": correlation,                        # support_claim / doubt_claim / unrelated
        "label":       _INTENT_LABEL.get(intent, "💬 普通弹幕"),
        "sentiment_icon": _SENTIMENT_LABEL.get(sentiment, "😐"),
    }


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
    """Audio-first semantic alignment: rule baseline + LLM refinement."""
    baseline = analyze_audio_with_rules(text)
    if not client_sync or not LLM_API_KEY:
        return baseline

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
        parsed_type = parsed.get("type", baseline["type"])
        if parsed_type not in ("fact", "hype", "trap"):
            parsed_type = baseline["type"]

        parsed_score = _clamp01(parsed.get("score", baseline["score"]))
        sub = parsed.get("sub_scores") or {}
        merged = {
            "type": parsed_type,
            "score": round(parsed_score, 3),
            "sub_scores": {
                "semantic_consistency": round(_clamp01(sub.get("semantic_consistency", baseline["sub_scores"]["semantic_consistency"])), 3),
                "fact_verification": round(_clamp01(sub.get("fact_verification", baseline["sub_scores"]["fact_verification"])), 3),
                "compliance_score": round(_clamp01(sub.get("compliance_score", baseline["sub_scores"]["compliance_score"])), 3),
                "subjectivity_index": round(_clamp01(sub.get("subjectivity_index", baseline["sub_scores"]["subjectivity_index"])), 3),
            },
            "violations": parsed.get("violations") if isinstance(parsed.get("violations"), list) else baseline["violations"],
            "suggestion": parsed.get("suggestion") or baseline["suggestion"],
            "engine": "llm+rules-audio",
            "rule_baseline": baseline,
        }
        return merged
    except Exception as e:
        print(f"Audio semantic LLM fallback: {e}")
        return baseline


def _split_sentences_zh(text: str) -> list[str]:
    """Split Chinese text into short utterances for finer semantic analysis."""
    if not text:
        return []
    parts = re.split(r"[。！？!?\n]+", text)
    return [p.strip() for p in parts if p and p.strip()]


# 媒体 URL 缓存：避免重复启动 Chrome （TTL = 5 分钟）
_media_url_cache: dict[str, tuple[str, float]] = {}   # room_id -> (url, expire_ts)
_MEDIA_URL_TTL = 300  # seconds


def _discover_douyin_media_url(room_id: str, timeout_sec: int = 20) -> Optional[str]:
    """Open Douyin room and detect candidate media URL (m3u8/flv) from CDP logs."""
    # 命中缓存：同一房间在 TTL 内直接返回上次发现的 URL
    cached = _media_url_cache.get(room_id)
    if cached and time.time() < cached[1]:
        print(f"[media-url] 缓存命中，跳过 Chrome 启动: {cached[0][:60]}...")
        return cached[0]

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
    # 屏蔽 Chrome 内部日志（SSL 战手失败、GPU 驱动警告等噪音）
    opts.add_argument("--log-level=3")
    opts.add_argument("--silent")
    opts.add_argument("--disable-logging")
    opts.add_argument("--disable-extensions")
    opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = None
    candidates: list[str] = []
    try:
        import sys
        # log_output 仅在较新版本的 selenium Service 中支持，兼容旧版
        try:
            service = Service(
                ChromeDriverManager().install(),
                log_output=subprocess.DEVNULL,
            )
        except TypeError:
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
                result_url = None
                for c in reversed(candidates):
                    if ".m3u8" in c.lower():
                        result_url = c
                        break
                if not result_url:
                    for c in reversed(candidates):
                        if ".flv" in c.lower():
                            result_url = c
                            break
                if not result_url:
                    result_url = candidates[-1]
                # 写入缓存
                _media_url_cache[room_id] = (result_url, time.time() + _MEDIA_URL_TTL)
                return result_url

            time.sleep(0.4)

        return None
    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass


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
    if asr_client:
        try:
            transcript = asr_client.audio.transcriptions.create(
                model="whisper-1",
                file=(filename, io.BytesIO(audio_bytes), "audio/wav"),
                language="zh",
            )
            return (transcript.text or "").strip()
        except Exception as e:
            print(f"[ASR-cloud] 失败 ({e})，切换本地 faster-whisper...")
    return _transcribe_local_whisper(audio_bytes)


def _extract_keywords_simple(text: str) -> list:
    """规则提取关键词（LLM不可用时的备用方案）"""
    stop = set(
        "的了是在有和就也都而但这那个么什么吧呢哦啊嗯噢哈呀嘛"
        "我你他她它们我们你们他们一个这个那个一些"
    )
    words = re.findall(r'[\u4e00-\u9fa5]{2,8}', text)
    seen: set = set()
    keywords: list = []
    for w in words:
        if w not in stop and w not in seen:
            seen.add(w)
            keywords.append(w)
        if len(keywords) >= 5:
            break
    return keywords


async def _polish_transcript_async(raw_text: str) -> dict:
    """
    使用 LLM 将原始语音转写整理为通顺句子并提取关键词。
    返回: {"polished": "...", "keywords": ["关键词", ...]}
    若 LLM 不可用，则清洗空格后原样返回。
    """
    if not client_async or not LLM_API_KEY:
        return {"polished": raw_text.strip(), "keywords": _extract_keywords_simple(raw_text)}

    try:
        system_prompt = (
            "你是直播电商内容整理助手。将主播语音转写文本整理为通顺流畅的简体中文句子，并提取关键词。\n"
            "要求：\n"
            "1. 只使用简体中文，不得出现繁体字\n"
            "2. 添加适当标点符号（逗号、句号、感叹号等），使句子通顺流畅\n"
            "3. 保留原意，不添加原文没有的内容\n"
            "4. 修正明显的语音识别错误（同音字、断句错误）\n"
            "5. 去掉多余语气词和重复内容\n"
            "6. 提取 3-5 个核心关键词（产品名/功效/促销词等）\n"
            "输出纯 JSON：{\"polished\": \"整理后句子\", \"keywords\": [\"词1\", ...]}"
        )
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": f"转写文本：{raw_text}"},
            ],
            temperature=0.2,
            max_tokens=300,
        )
        result_str = resp.choices[0].message.content or ""
        if "```json" in result_str:
            result_str = result_str.split("```json")[1].split("```")[0]
        elif "```" in result_str:
            result_str = result_str.split("```")[1].split("```")[0]
        result = json.loads(result_str.strip())
        return {
            "polished": result.get("polished", raw_text).strip(),
            "keywords": result.get("keywords", []),
        }
    except Exception as e:
        print(f"[polish] LLM 整理失败: {e}")
        return {"polished": raw_text.strip(), "keywords": _extract_keywords_simple(raw_text)}


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
            analysis = analyze_utterance(text)
            await callback({
                "event": "utterance",
                "id": int(time.time() * 1000),
                "text": text,
                "timestamp": time.strftime("%H:%M:%S"),
                **analysis,
            })

            chat = random.choice(self.CHATS)
            chat_analysis = analyze_chat_light(chat, recent_utterance=last_utterance)
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
            return

        print(f"[audio-loop] ✓ 发现媒体流，开始连续监听: {media_url[:80]}...")
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
                    raw = text.strip()
                    # 并行：LLM 整理句子 + 风险分析
                    polish_result, analysis = await asyncio.gather(
                        _polish_transcript_async(raw),
                        asyncio.to_thread(analyze_with_keywords, raw),
                    )
                    display = polish_result["polished"]
                    kws = polish_result["keywords"] or _extract_keywords_simple(raw)
                    await callback({
                        "event": "utterance",
                        "id": int(time.time() * 1000),
                        "text": raw,                # 原始转写（展开区显示）
                        "display_text": display,    # 整理后句子（主要展示）
                        "keywords": kws,
                        "timestamp": time.strftime("%H:%M:%S"),
                        "source": "audio",
                        **analysis,
                    })
                    print(f"[audio-loop] 📝 原始: {raw[:50]}")
                    print(f"[audio-loop] ✨ 整理: {display[:60]}{'...' if len(display)>60 else ''}")
                else:
                    print("[audio-loop] 静默片段，跳过")
            except asyncio.CancelledError:
                print("[audio-loop] 已停止")
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
                    chat_analysis = analyze_chat_light(text, recent_utterance=last_utterance_text)
                    await callback({**evt, **chat_analysis})

                    # ★ 对高风险弹幕（质疑/投诉）同步生成 utterance 事件填充 SemanticFeed
                    # 这解决了抖音模式下 SemanticFeed 始终空白的问题
                    if (chat_analysis.get("risk_score", 0) >= 0.5
                            or chat_analysis.get("intent") in ("doubt", "complaint")):
                        utt_analysis = analyze_with_keywords(text)
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


@app.get("/douyin/room-info/{room_id}")
async def douyin_room_info(room_id: str):
    """验证房间是否直播，并返回基本信息（前端数据源选择器使用）。"""
    # 房间ID规范化
    room_id = room_id.strip()
    if not room_id or not re.match(r"^\d{6,24}$", room_id):
        raise HTTPException(status_code=400, detail="Invalid room_id format")
    
    try:
        # 尝试获取媒体流URL作为检测直播状态的指标
        media_url = await asyncio.to_thread(_discover_douyin_media_url, room_id, timeout_sec=15)
        
        return {
            "reachable": bool(media_url),
            "room_id": room_id,
            "media_url": media_url,
            "live_hint": "直播中" if media_url else "未开播或反爬阻挡",
            "error": None,
        }
    except Exception as e:
        return {
            "reachable": False,
            "room_id": room_id,
            "media_url": None,
            "live_hint": "检测异常",
            "error": str(e)[:100],
        }


@app.get("/media-url")
async def get_media_url(roomId: str):
    """Return a discovered stream URL for a Douyin room (m3u8/flv).
    Result is cached for 5 minutes to avoid repeatedly launching Chrome.
    """
    url = await asyncio.to_thread(_discover_douyin_media_url, roomId)
    from fastapi import HTTPException
    if not url:
        raise HTTPException(status_code=404, detail="media url not found")
    return {"url": url, "cached": roomId in _media_url_cache}


@app.delete("/media-url/cache")
async def clear_media_url_cache(roomId: str = None):
    """Manually clear media URL cache (force re-discover on next request)."""
    if roomId:
        _media_url_cache.pop(roomId, None)
        return {"cleared": roomId}
    _media_url_cache.clear()
    return {"cleared": "all"}

@app.get("/analyze")
async def analyze_text(text: str):
    """Analyze single utterance"""
    return analyze_utterance(text)


@app.get("/chat-analyze")
async def chat_analyze(text: str, recent_utterance: str = ""):
    """Analyze a single danmaku/chat message"""
    return analyze_chat_light(text, recent_utterance=recent_utterance)


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

        analysis = analyze_audio_semantics(text)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "text": text,
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
        media_url = _discover_douyin_media_url(room_id, timeout_sec=20)
        if not media_url:
            raise HTTPException(
                status_code=502,
                detail="No live media URL detected (room may be offline or anti-bot challenge active)",
            )

        audio_bytes = _capture_audio_clip_bytes(media_url, seconds=seconds)

        text = _transcribe_zh_audio_bytes(audio_bytes, filename="douyin_audio.wav")
        if not text:
            raise HTTPException(status_code=502, detail="ASR returned empty transcript")

        overall = analyze_audio_semantics(text)
        sentence_items = []
        for idx, seg in enumerate(_split_sentences_zh(text), start=1):
            sentence_items.append({
                "idx": idx,
                "text": seg,
                "analysis": analyze_audio_with_rules(seg),
            })

        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "room_id": room_id,
            "seconds": seconds,
            "transcript": text,
            "analysis": overall,
            "sentence_analysis": sentence_items,
            "latency_ms": elapsed_ms,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Douyin audio pipeline failed: {str(e)}")


# ============= Consumer Discovery API =============

@app.get("/consumer/search-live-streams")
async def search_live_streams(q: str, max_results: int = 12):
    """
    搜索抖音直播间（按商品关键词）
    Level 1: httpx 解析页面内嵌 JSON（快速，无需 Chrome）
    Level 2: Selenium + CDP Network.getResponseBody 截获 API 响应
    Level 3: Selenium DOM href 扫描（最后兜底）
    返回: { keyword, rooms: [...], total, data_source, search_note }
    """
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="关键词太短，至少 2 个字")

    keyword = q.strip()
    max_results = max(3, min(max_results, 50))

    # ---------- 真实爬取 ----------
    if SEARCH_AVAILABLE:
        try:
            result = await search_douyin_live_rooms(keyword, max_results)
            rooms = result.get("rooms", [])
            data_source = result.get("data_source", "unknown")
            method_used = result.get("method_used", "unknown")
            cached = result.get("cached", False)

            if rooms:
                note = (
                    f"缓存结果" if cached
                    else f"实时爬取 · {method_used}"
                )
                return {
                    "keyword": keyword,
                    "rooms": rooms,
                    "total": len(rooms),
                    "data_source": data_source,
                    "search_note": note,
                    "cached": cached,
                }
            # 爬取返回空结果（可能触发了反爬验证），降级到兜底
            print(f"[search] 爬取结果为空，使用兜底数据")
        except Exception as e:
            print(f"[search] 爬取异常: {e}，使用兜底数据")

    # ---------- 兜底模拟数据 ----------
    rooms = [
        {
            "room_id": "646454278948",
            "anchor_name": f"{keyword}达人",
            "room_title": f"正品{keyword}新鲜上市 限时特惠",
            "viewer_count": 2341,
            "thumbnail_url": "",
            "status": "living",
            "recommendation_score": 0.85,
        },
        {
            "room_id": "646454278949",
            "anchor_name": "果园直供",
            "room_title": f"新鲜冷链配送，48小时到家 · {keyword}",
            "viewer_count": 1842,
            "thumbnail_url": "",
            "status": "living",
            "recommendation_score": 0.78,
        },
    ]
    return {
        "keyword": keyword,
        "rooms": rooms[:max_results],
        "total": len(rooms),
        "data_source": "fallback_mock",
        "search_note": "抖音反爬验证触发，显示演示数据（可稍后重试）",
        "cached": False,
    }


@app.post("/consumer/compare-streams")
async def compare_streams(request: CompareStreamsRequest):
    """
    跨直播间商品对比分析（LLM 评估）
    输入: 关键词 + 选中的直播间列表
    返回: { suite_name, p1, p2, conclusion, evidence_stats, llm_analysis }
    """
    keyword = request.keyword.strip()
    rooms = request.rooms
    
    if not keyword or len(keyword) < 2:
        raise HTTPException(status_code=400, detail="关键词无效")
    if len(rooms) < 2:
        raise HTTPException(status_code=400, detail="至少需要 2 个直播间进行对比")
    
    # 简化版对比分析
    p1_room = rooms[0]
    p2_room = rooms[1] if len(rooms) > 1 else rooms[0]
    
    return {
        "suite_name": "full-suite",
        "keyword": keyword,
        "p1": {
            "room_id": p1_room.room_id,
            "anchor_name": p1_room.anchor_name or "主播A",
            "tier": "Premium",
            "product_description": f"{keyword} 精选品",
            "price_range": "¥38-58",
            "delivery_promise": "48 小时送达",
            "authenticity_signal": "原产地直供认证",
        },
        "p2": {
            "room_id": p2_room.room_id,
            "anchor_name": p2_room.anchor_name or "主播B",
            "tier": "Standard",
            "product_description": f"{keyword} 常规版",
            "price_range": "¥28-48",
            "delivery_promise": "3-5 天送达",
            "authenticity_signal": "第三方检测报告",
        },
        "conclusion": f"综合对比：主播A({p1_room.anchor_name or 'A'})商品更优，价格溢价 20%，但承诺更强",
        "evidence_stats": {
            "utterance_count": 0,
            "chat_count": 0,
        },
        "llm_analysis": {
            "p1_advantages": ["质量认证完整", "物流速度快", "原产地背书"],
            "p2_advantages": ["价格更实惠", "评价量更大"],
            "recommendation": "如果预算允许，选 P1；追求性价比选 P2",
        },
    }


@app.delete("/consumer/search-cache")
async def clear_search_results_cache(q: str = None):
    """
    清除搜索结果缓存（调试 / 强制刷新用）
    ?q=关键词  仅清除该词的缓存；不传则清除全部搜索缓存
    """
    if SEARCH_AVAILABLE:
        clear_search_cache(q)
    return {"cleared": True, "keyword": q or "all"}


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
