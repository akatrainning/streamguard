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
import sys
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
    from douyin_search import search_douyin_live_rooms, clear_search_cache, \
        get_cookie_status, open_douyin_for_login, _save_douyin_cookies
    SEARCH_AVAILABLE = True
except ImportError:
    SEARCH_AVAILABLE = False
    print("[warn] douyin_search module not found, search will use fallback data")

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


@app.on_event("startup")
async def _startup_cleanup():
    """开机清理：杀掉上次崩溃遗留的 chromedriver.exe 进程，防止僵尸进程占用内存。
    安全：chromedriver.exe 是自动化工具，不是用户浏览器，杀掉不影响用户。
    """
    try:
        result = subprocess.run(
            ['taskkill', '/F', '/IM', 'chromedriver.exe'],
            capture_output=True, timeout=5
        )
        if result.returncode == 0:
            print("[startup] 已清理遗留的 chromedriver 进程")
    except Exception:
        pass


# LLM Configuration -- 优先级: DeepSeek > OpenRouter > OpenAI
DEEPSEEK_API_KEY  = os.getenv("DEEPSEEK_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")

if DEEPSEEK_API_KEY:
    LLM_API_KEY  = DEEPSEEK_API_KEY
    LLM_PROVIDER = "deepseek"
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
    LLM_MODEL    = os.getenv("LLM_MODEL", "deepseek-chat")
elif OPENROUTER_API_KEY:
    LLM_API_KEY  = OPENROUTER_API_KEY
    LLM_PROVIDER = "openrouter"
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")
    LLM_MODEL    = os.getenv("LLM_MODEL", "deepseek/deepseek-chat")
elif OPENAI_API_KEY:
    LLM_API_KEY  = OPENAI_API_KEY
    LLM_PROVIDER = "openai"
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL    = os.getenv("LLM_MODEL", "gpt-4o-mini")
else:
    LLM_API_KEY  = ""
    LLM_PROVIDER = "none"
    LLM_BASE_URL = ""
    LLM_MODEL    = ""

if OPENAI_AVAILABLE and LLM_API_KEY:
    try:
        kwargs = {"api_key": LLM_API_KEY}
        if LLM_BASE_URL:
            kwargs["base_url"] = LLM_BASE_URL
        client_sync = OpenAI(**kwargs)
        client_async = AsyncOpenAI(**kwargs)
        print(f"[LLM] OK provider={LLM_PROVIDER}, model={LLM_MODEL}, base={LLM_BASE_URL or '(openai default)'}")
    except Exception as _e:
        print(f"[LLM] FAIL init: {_e}")
        client_sync = None
        client_async = None
else:
    print(f"[LLM] SKIP no key (OPENAI_AVAILABLE={OPENAI_AVAILABLE}, LLM_API_KEY={'set' if LLM_API_KEY else 'empty'})")
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
    轻量中文弹幕语义分析(纯规则，零延迟)。
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

    # 刷屏检测(字符集非常小但文本较长)
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
        suggestion = "降低夸张表达，改为可验证数据描述(检测报告/对照结果)。"
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
2) 是否存在压迫式促单(倒计时、只剩最后、错过后悔)。
3) 是否给出可核验依据(检测报告、编号、成分和范围条件)。

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


# 媒体 URL 缓存：避免重复启动 Chrome (TTL = 15 分钟)
_media_url_cache: dict[str, tuple[str, float]] = {}   # room_id -> (url, expire_ts)
_MEDIA_URL_TTL = 900  # seconds(上次 5分钟，现在 15分钟)


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
    opts.add_argument("--window-size=800,600")          # 缩小窗口
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--allow-running-insecure-content")
    # 节省资源：禁用不必要的功能
    opts.add_argument("--disable-extensions")
    opts.add_argument("--disable-background-networking")
    opts.add_argument("--disable-sync")
    opts.add_argument("--disable-translate")
    opts.add_argument("--disable-plugins")
    opts.add_argument("--blink-settings=imagesEnabled=false")  # 禁用图片加载
    opts.add_argument("--js-flags=--max-old-space-size=256")
    opts.add_argument("--media-cache-size=1")
    opts.add_argument("--disk-cache-size=1")
    # 屏蔽 Chrome 内部日志话音失败、GPU 驱动警告等噪音)
    opts.add_argument("--log-level=3")
    opts.add_argument("--silent")
    opts.add_argument("--disable-logging")
    opts.add_argument("--disable-extensions")
    opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = None
    _service_pid = None
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
        _service_pid = getattr(getattr(service, 'process', None), 'pid', None)
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
        # 强杀进程树，确保 chrome.exe 子进程不残留
        if _service_pid:
            try:
                subprocess.run(
                    ['taskkill', '/F', '/T', '/PID', str(_service_pid)],
                    capture_output=True, timeout=5
                )
            except Exception:
                pass


def _get_ffmpeg_bin() -> str:
    """
    自动获取 ffmpeg 路径。
    优先顺序：
      1. imageio-ffmpeg 内置二进制(pip install imageio-ffmpeg，无需手动安装、无需配 PATH)
      2. 系统 PATH 中的 ffmpeg(已手动安装的用户 fallback)
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
        "(或手动安装系统 ffmpeg 并加入 PATH)"
    )


def _capture_audio_clip_bytes(stream_url: str, seconds: int = 20) -> bytes:
    """Capture a short audio clip from a live stream URL.
    Uses imageio-ffmpeg (bundled binary, no system install needed)
    or falls back to system ffmpeg.
    """
    ffmpeg_bin = _get_ffmpeg_bin()

    # ffmpeg CPU 线程数：保留 2 核给系统，最少 1 线程
    ffmpeg_threads = str(max(1, (os.cpu_count() or 4) - 2))

    with tempfile.TemporaryDirectory() as td:
        out_wav = os.path.join(td, "clip.wav")
        cmd = [
            ffmpeg_bin,
            "-y",
            "-fflags", "nobuffer",          # 减少输入缓冲延迟
            "-flags", "low_delay",
            "-i", stream_url,
            "-t", str(max(8, min(seconds, 90))),
            "-vn",                           # 只要音频，跳过视频解码
            "-ac", "1",
            "-ar", "16000",
            "-acodec", "pcm_s16le",
            "-threads", ffmpeg_threads,      # 限制 CPU 线程数
            out_wav,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not os.path.exists(out_wav):
            stderr_tail = (proc.stderr or "")[-600:]
            raise RuntimeError(f"ffmpeg capture failed: {stderr_tail}")

        with open(out_wav, "rb") as f:
            return f.read()


# faster-whisper 本地模型缓存(惰性初始化)
_fw_model = None
_FW_MODEL_SIZE = os.getenv("LOCAL_WHISPER_MODEL", "base")  # tiny/base/small/medium
# CPU 线程数：默认保留 2 核给系统，可通过环境变量覆盖
_FW_CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", max(1, (os.cpu_count() or 4) - 2)))
_FW_BEAM_SIZE   = int(os.getenv("WHISPER_BEAM_SIZE", "1"))  # 1=贪心(快)/5=束搜索(准)


def _transcribe_local_whisper(audio_bytes: bytes) -> str:
    """Local transcription via faster-whisper (no API key, no cloud)."""
    global _fw_model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("faster-whisper 未安装")
    if _fw_model is None:
        print(f"[ASR-local] 首次加载 faster-whisper 模型(model={_FW_MODEL_SIZE}, threads={_FW_CPU_THREADS}, beam={_FW_BEAM_SIZE})...")
        model_path = os.path.join(os.path.dirname(__file__), "whisper_base_model")
        if not os.path.isfile(os.path.join(model_path, "model.bin")):
            model_path = _FW_MODEL_SIZE  # 本地目录缺失 model.bin，回退到自动下载
        print(f"[ASR-local] 使用模型: {model_path}")
        _fw_model = WhisperModel(
            model_path,
            device="cpu",
            compute_type="int8",
            cpu_threads=_FW_CPU_THREADS,   # 限制转写线程数
            num_workers=1,                 # 单工作进程，避免多实例竞争 CPU
        )
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        segments, _ = _fw_model.transcribe(
            tmp_path,
            language="zh",
            beam_size=_FW_BEAM_SIZE,        # 1=贪心解码（快 3-5x），5=束搜索（准但慢）
            vad_filter=False,              # VAD需要onnxruntime，暂时禁用
        )
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _transcribe_zh_audio_bytes(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Transcribe Chinese audio bytes.
    Priority:
      1. asr_client -- OpenAI cloud Whisper (requires valid ASR_OPENAI_API_KEY)
      2. faster-whisper -- local, free, no API key needed
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
    try:
        return _transcribe_local_whisper(audio_bytes)
    except Exception as e:
        print(f"[ASR-local] 失败 ({e})，返回空字符串")
        return ""


def _extract_keywords_simple(text: str) -> list:
    """规则提取关键词(LLM不可用时的备用方案)"""
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
            "2. 添加适当标点符号(逗号、句号、感叹号等)，使句子通顺流畅\n"
            "3. 保留原意，不添加原文没有的内容\n"
            "4. 修正明显的语音识别错误(同音字、断句错误)\n"
            "5. 去掉多余语气词和重复内容\n"
            "6. 提取 3-5 个核心关键词(产品名/功效/促销词等)\n"
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
        连续音频监听后台循环(流水线模式)：
        自动发现直播媒体流 → 采集与转写并行流水线 → 每 ~8s 输出一条润色话术。

        流水线原理：
          采集线程(capture_worker)持续采集 8s 音频片段放入队列；
          转写线程(transcribe_worker)同步从队列取出并处理。
          两者并行 → 有效延迟 ≈ 8s(窗口时长)，而非串行的 20+s。

        无需 API Key：优先 faster-whisper 本地模型。
        """
        WINDOW_SECS = 8  # 采集窗口：8s 兼顾句子完整性与响应延迟(可调 5~10)

        print(f"[audio-loop] 正在发现直播媒体流(房间: {self.room_id})...")
        try:
            media_url = await asyncio.to_thread(_discover_douyin_media_url, self.room_id, 20)
        except Exception as e:
            print(f"[audio-loop] 媒体流发现失败: {e}")
            return

        if not media_url:
            print("[audio-loop] 未能找到可用媒体流，音频监听退出(直播间可能已下线或有反爬限制)")
            return

        print(f"[audio-loop] OK 发现媒体流，开始流水线监听: {media_url[:80]}...")

        # 采集队列：maxsize=2 防止转写慢时积压过多
        audio_queue: asyncio.Queue = asyncio.Queue(maxsize=2)

        # 采集间隔：每轮采集完成后额外等待，防止 CPU 持续满载
        # 可通过环境变量调整，默认 2s(采集 8s + 等待 2s = 每 10s 一轮)
        CAPTURE_IDLE_SECS = float(os.getenv("AUDIO_CAPTURE_IDLE", "2"))

        async def capture_worker():
            """持续采集音频片段并放入队列(不等转写完成)。"""
            error_count = 0
            while True:
                try:
                    audio_bytes = await asyncio.to_thread(
                        _capture_audio_clip_bytes, media_url, WINDOW_SECS
                    )
                    # 队列满时丢弃最旧片段(转写跟不上时避免内存堆积)
                    if audio_queue.full():
                        try:
                            audio_queue.get_nowait()
                            print("[audio-loop] 队列已满，丢弃旧片段")
                        except asyncio.QueueEmpty:
                            pass
                    await audio_queue.put(audio_bytes)
                    error_count = 0
                    # 采集间隔：给 CPU 喘息空间，避免持续满载
                    await asyncio.sleep(CAPTURE_IDLE_SECS)
                except asyncio.CancelledError:
                    print("[audio-loop] 采集线程已停止")
                    break
                except Exception as e:
                    error_count += 1
                    wait = min(3 * error_count, 15)
                    print(f"[audio-loop] 采集错误(第{error_count}次): {e}，等待 {wait}s 后重试")
                    await asyncio.sleep(wait)

        async def transcribe_worker():
            """从队列取音频片段 → 转写 → 润色 → 推送 utterance 事件。"""
            while True:
                try:
                    audio_bytes = await audio_queue.get()
                    try:
                        text = await asyncio.to_thread(
                            _transcribe_zh_audio_bytes, audio_bytes, "live_loop.wav"
                        )
                        if text and len(text.strip()) > 3:
                            raw = text.strip()
                            # 并行：LLM 润色整理 + 规则风险分析
                            polish_result, analysis = await asyncio.gather(
                                _polish_transcript_async(raw),
                                asyncio.to_thread(analyze_with_keywords, raw),
                            )
                            display = polish_result["polished"]
                            kws = polish_result["keywords"] or _extract_keywords_simple(raw)
                            await callback({
                                "event": "utterance",
                                "id": int(time.time() * 1000),
                                "text": raw,             # 原始转写
                                "display_text": display, # LLM 润色后句子(主要展示)
                                "keywords": kws,
                                "timestamp": time.strftime("%H:%M:%S"),
                                "source": "audio",
                                **analysis,
                            })
                            print(f"[audio-loop] 📝 原始: {raw[:50]}")
                            print(f"[audio-loop] * 润色: {display[:60]}{'...' if len(display) > 60 else ''}")
                        else:
                            print("[audio-loop] 静默片段，跳过")
                    finally:
                        audio_queue.task_done()
                except asyncio.CancelledError:
                    print("[audio-loop] 转写线程已停止")
                    break
                except Exception as e:
                    print(f"[audio-loop] 转写/分析错误: {e}")

        # 并发启动采集与转写两个协程
        capture_task = asyncio.create_task(capture_worker())
        transcribe_task = asyncio.create_task(transcribe_worker())
        try:
            await asyncio.gather(capture_task, transcribe_task)
        except asyncio.CancelledError:
            capture_task.cancel()
            transcribe_task.cancel()
            await asyncio.gather(capture_task, transcribe_task, return_exceptions=True)
            print("[audio-loop] 流水线已停止")

    async def stream(self, callback):
        from douyin_cdp import stream_douyin_cdp

        last_utterance_text = ""

        async def _on_event(evt: dict):
            nonlocal last_utterance_text
            if evt.get("event") == "chat":
                text = evt.get("text", "")
                if text.strip():
                    # 弹幕语义分析(将最近话术传入做关联分析)
                    chat_analysis = analyze_chat_light(text, recent_utterance=last_utterance_text)
                    await callback({**evt, **chat_analysis})

                    # ★ 对高风险弹幕(质疑/投诉)同步生成 utterance 事件填充 SemanticFeed
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

        # 后台启动连续音频监听(自动转写主播话术 → utterance 事件)
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
        try:
            await websocket.close()
        except Exception:
            pass
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
    """验证房间是否直播，并返回基本信息(前端数据源选择器使用)。"""
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

# --- Douyin Cookie / Auth ---

@app.get("/consumer/cookie-status")
async def cookie_status():
    """Check whether douyin cookies are available."""
    if not SEARCH_AVAILABLE:
        return {"exists": False, "count": 0, "message": "search module not available"}
    return get_cookie_status()


@app.post("/consumer/auth-douyin")
async def auth_douyin(payload: dict = None):
    """
    Open a headed browser for user to complete captcha / login on douyin.
    Cookies are saved automatically after success.
    Body (optional): {"keyword": "..."}
    """
    if not SEARCH_AVAILABLE:
        raise HTTPException(status_code=500, detail="search module not available")
    keyword = (payload or {}).get("keyword", "")
    result = await asyncio.to_thread(open_douyin_for_login, keyword)
    return result


@app.post("/consumer/upload-cookies")
async def upload_cookies(payload: dict):
    """
    Upload cookies directly (from browser extension export).
    Body: {"cookies": [...]}
    """
    if not SEARCH_AVAILABLE:
        raise HTTPException(status_code=500, detail="search module not available")
    cookies = payload.get("cookies", [])
    if not cookies or not isinstance(cookies, list):
        raise HTTPException(status_code=400, detail="cookies must be a non-empty array")
    _save_douyin_cookies(cookies)
    return {"success": True, "saved": len(cookies)}


@app.get("/consumer/search-live-streams")
async def search_live_streams(q: str, max_results: int = 12):
    """
    搜索抖音直播间(按商品关键词)
    Level 1: httpx 解析页面内嵌 JSON(快速，无需 Chrome)
    Level 2: Selenium + CDP Network.getResponseBody 截获 API 响应
    Level 3: Selenium DOM href 扫描(最后兜底)
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
                    # "search_note": note,
                    # "cached": cached,
                }
            # 爬取返回空结果(可能触发了反爬验证)，降级到兜底
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
        "search_note": "抖音反爬验证触发，显示演示数据(可稍后重试)",
        "cached": False,
    }


@app.post("/consumer/compare-streams")
async def compare_streams(request: CompareStreamsRequest):
    """
    跨直播间商品对比分析(LLM 评估)
    输入: 关键词 + 选中的直播间列表
    返回: { p0, p1, p2, engine, keyword, evidence_stats }
      p0: 综合结论 { verdict, confidence, why_buy, why_not_buy }
      p1: 维度对比表 { compare_dimensions, products, ranked }
      p2: 行动建议 { ask_anchor_questions, alternatives, buy_timing, action_plan }
    """
    keyword = request.keyword.strip()
    rooms = request.rooms
    user_profile = request.user_profile or {}

    if not keyword or len(keyword) < 2:
        raise HTTPException(status_code=400, detail="关键词无效")
    if len(rooms) < 2:
        raise HTTPException(status_code=400, detail="至少需要 2 个直播间进行对比")

    compare_dims = ["价格", "品质", "信任度", "物流", "性价比"]

    # ─── LLM 生成 ───────────────────────────────────────────────
    if client_async and LLM_API_KEY:
        rooms_desc = "\n".join(
            f"- 直播间{i+1}({r.room_id})：主播={r.anchor_name or '未知'}，"
            f"标题={r.room_title or '未知'}，观看人数={r.viewer_count or 0}，"
            f"推荐分={r.recommendation_score or 0.5:.2f}"
            for i, r in enumerate(rooms)
        )
        user_str = ""
        if user_profile.get("budget"):
            user_str += f"\n用户预算：{user_profile['budget']}"
        if user_profile.get("core_need"):
            user_str += f"\n用户核心需求：{user_profile['core_need']}"

        room_names = [r.anchor_name or r.room_id for r in rooms]
        dims_str = str(compare_dims)

        prompt = f"""你是直播电商消费顾问，请对以下直播间进行"{keyword}"商品的综合对比分析。

【直播间列表】
{rooms_desc}{user_str}

请严格返回以下 JSON 格式(不要任何额外文字)：
{{
  "p0": {{
    "verdict": "BUY",
    "confidence": 0.78,
    "why_buy": ["推荐理由1(结合具体直播间)", "推荐理由2", "推荐理由3"],
    "why_not_buy": ["谨慎因素1", "谨慎因素2"]
  }},
  "p1": {{
    "compare_dimensions": {dims_str},
    "products": [
      {{
        "name": "{room_names[0] if room_names else '直播间1'}",
        "scores": {{"价格": 0.75, "品质": 0.80, "信任度": 0.70, "物流": 0.85, "性价比": 0.78}},
        "overall": 0.78
      }}
    ],
    "ranked": {str(room_names)}
  }},
  "p2": {{
    "ask_anchor_questions": ["问题1(针对{keyword})", "问题2", "问题3"],
    "alternatives": ["替代方案1", "替代方案2"],
    "buy_timing": "建议在XX情况下下单",
    "action_plan": ["行动步骤1", "行动步骤2", "行动步骤3"]
  }}
}}

verdict 只能是 BUY/WAIT/SKIP 之一；products 数组必须包含所有 {len(rooms)} 个直播间；scores 各维度值为 0~1 的小数。"""

        try:
            resp = await client_async.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": "你是直播电商消费顾问，只返回合法 JSON，不要 markdown 代码块。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.4,
                max_tokens=1400,
            )
            raw = resp.choices[0].message.content or "{}"
            # 去除可能的 markdown 代码块
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0]
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0]
            result = json.loads(raw.strip())
            result["engine"] = "llm"
            result["keyword"] = keyword
            result["evidence_stats"] = {"utterance_count": 0, "chat_count": 0}
            return result
        except Exception as e:
            print(f"[compare] LLM 生成失败: {e}，降级到规则引擎")

    # ─── 规则引擎兜底 ─────────────────────────────────────────
    def _room_score(room, dim):
        base = float(room.recommendation_score or 0.5)
        dim_bias = {"价格": -0.05, "品质": 0.06, "信任度": 0.0, "物流": 0.03, "性价比": -0.02}
        popularity_bonus = 0.08 if (room.viewer_count or 0) > 1000 else 0.0
        return round(min(1.0, max(0.0, base + dim_bias.get(dim, 0) + popularity_bonus)), 2)

    products = [
        {
            "name": r.anchor_name or r.room_id,
            "scores": {d: _room_score(r, d) for d in compare_dims},
            "overall": round(float(r.recommendation_score or 0.5), 2),
        }
        for r in rooms
    ]
    ranked_products = sorted(products, key=lambda x: x["overall"], reverse=True)
    top_room = ranked_products[0]["name"]
    top_score = ranked_products[0]["overall"]

    verdict = "BUY" if top_score >= 0.7 else ("WAIT" if top_score >= 0.5 else "SKIP")

    return {
        "engine": "rule",
        "keyword": keyword,
        "p0": {
            "verdict": verdict,
            "confidence": round(top_score, 2),
            "why_buy": [
                f"{top_room} 综合推荐分最高({round(top_score*100)}分)",
                f"观看人数 {rooms[0].viewer_count} 人，直播间热度较高" if rooms[0].viewer_count else f"关键词 [{keyword}] 匹配度高",
                "建议进入直播间后开启 StreamGuard 监控获取实时话术分析",
            ],
            "why_not_buy": [
                "当前分析仅基于标题和观看人数，缺乏实时话术数据",
                "建议开启监控模式获取更全面的风险评估",
            ],
        },
        "p1": {
            "compare_dimensions": compare_dims,
            "products": products,
            "ranked": [p["name"] for p in ranked_products],
        },
        "p2": {
            "ask_anchor_questions": [
                f"这款{keyword}的产地和生产日期是什么？",
                "是否有质量检测报告或官方认证？",
                "退换货政策和售后保障具体是什么？",
            ],
            "alternatives": [
                f'在电商平台搜索"{keyword} 旗舰店"对比价格',
                "建议查看近期用户评价后再决定购买",
            ],
            "buy_timing": f"建议在主播给出额外优惠(折扣码/赠品)时下单，避免在限时倒计时压力下冲动消费",
            "action_plan": [
                "先加入购物车不付款，观察价格是否持续变动",
                "点击【进入直播间】并开启 StreamGuard 实时监控",
                f"对比 {len(rooms)} 个直播间的话术风险后再做决定",
            ],
        },
        "evidence_stats": {"utterance_count": 0, "chat_count": 0},
    }


@app.delete("/consumer/search-cache")
async def clear_search_results_cache(q: str = None):
    """
    清除搜索结果缓存(调试 / 强制刷新用)
    ?q=关键词  仅清除该词的缓存；不传则清除全部搜索缓存
    """
    if SEARCH_AVAILABLE:
        clear_search_cache(q)
    return {"cleared": True, "keyword": q or "all"}


# ============= Consumer Product Search & Full-Suite API =============

@app.get("/consumer/search-products")
async def search_products(q: str):
    """
    按关键词搜索同类商品候选列表，供消费者决策中心 P1 对比使用。
    优先 LLM 生成拟真商品数据；无 LLM 时返回规则兜底数据。
    返回: { products: [{ id, name, brand, channel, price, spec, fit_for, known_risks }] }
    """
    keyword = (q or "").strip()
    if not keyword or len(keyword) < 2:
        raise HTTPException(status_code=400, detail="关键词太短，至少 2 个字")

    # ── LLM 生成 ──────────────────────────────────────────────────────────
    if client_async and LLM_API_KEY:
        try:
            prompt = f"""你是电商商品数据库。请为关键词「{keyword}」生成 4 个真实感的同类商品候选，
适合消费者在直播间购物时横向对比。

严格返回以下 JSON(不要任何额外文字或 markdown)：
{{
  "products": [
    {{
      "id": "p1",
      "name": "商品全称(含品牌+型号)",
      "brand": "品牌名",
      "channel": "渠道(如：官方旗舰店/经销商/白牌)",
      "price": "参考价格(如：¥199~¥249)",
      "spec": "主要规格参数(30字以内)",
      "fit_for": ["适合人群或场景1", "适合人群2"],
      "known_risks": ["已知风险或注意事项1", "注意事项2"]
    }}
  ]
}}

要求：4 个商品覆盖不同价位段(低/中/中高/高)，品牌各不相同，数据真实合理。"""
            resp = await client_async.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": "只返回合法 JSON，不要 markdown 代码块。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.4,
                max_tokens=800,
            )
            raw = (resp.choices[0].message.content or "{}").strip()
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0]
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0]
            data = json.loads(raw.strip())
            products = data.get("products", [])
            if products:
                print(f"[search-products] OK LLM returned {len(products)}  items ({LLM_PROVIDER}/{LLM_MODEL})")
                return {"keyword": keyword, "products": products, "source": "llm"}
        except Exception as e:
            import traceback
            print(f"[search-products] FAIL LLM ({type(e).__name__}): {e}")
            print(traceback.format_exc()[:800])

    # ── 规则兜底 ──────────────────────────────────────────────────────────
    fallback = [
        {
            "id": f"p{i+1}",
            "name": f"{keyword} 候选商品 {chr(65+i)}",
            "brand": ["国际大牌", "国货新锐", "专业品牌", "性价比之选"][i % 4],
            "channel": ["官方旗舰店", "品牌直播间", "经销商", "白牌自营"][i % 4],
            "price": [f"¥{99+i*100}~¥{149+i*100}" for i in range(4)][i],
            "spec": f"适用于{keyword}场景，标准规格参数",
            "fit_for": ["大众人群", "注重品质用户"],
            "known_risks": ["需核实产品资质", "建议索要检测报告"],
        }
        for i in range(4)
    ]
    return {"keyword": keyword, "products": fallback, "source": "rule"}


@app.post("/consumer/full-suite")
async def consumer_full_suite(payload: dict):
    """
    消费者 P0+P1+P2 综合分析(结合直播间话术证据)。
    输入: { product_query, products, user_profile, stream_context }
    返回: { engine, evidence_stats, p0, p1, p2 }
      p0: { verdict, confidence, why_buy, why_not_buy, must_verify, consumer_summary }
      p1: { compare_dimensions, products, ranked, analysis_notes }
      p2: { ask_anchor_questions, alternatives, buy_timing, action_plan, risk_replay }
    """
    keyword     = (payload.get("product_query") or "").strip()
    products    = payload.get("products") or []
    user_profile = payload.get("user_profile") or {}
    stream_ctx  = payload.get("stream_context") or {}

    if not keyword:
        raise HTTPException(status_code=400, detail="product_query 不能为空")

    utterances  = stream_ctx.get("utterances", [])
    chats       = stream_ctx.get("chats", [])
    evidence_stats = {"utterance_count": len(utterances), "chat_count": len(chats)}

    # 摘取风险话术样本(最多 10 条 trap/hype)供 LLM 分析
    risk_utts = [u for u in utterances if u.get("type") in ("trap", "hype")][:10]
    risk_text = "\n".join(f'- [{u["type"]}] {u.get("text","")[:60]}' for u in risk_utts)

    compare_dims = ["价格透明度", "品质证据", "售后保障", "话术可信度", "综合性价比"]

    # ── LLM 分析 ──────────────────────────────────────────────────────────
    if client_async and LLM_API_KEY:
        products_desc = "\n".join(
            f"- 商品{i+1}「{p.get('name','未知')}」：品牌={p.get('brand','未知')}，"
            f"渠道={p.get('channel','未知')}，价格={p.get('price','未知')}，"
            f"规格={p.get('spec','未知')}"
            for i, p in enumerate(products)
        ) if products else "(用户未选择候选商品，请基于关键词作通用评估)"

        user_str = ""
        if user_profile.get("budget"):
            user_str += f"\n用户预算：{user_profile['budget']}"
        if user_profile.get("core_need"):
            user_str += f"\n核心需求：{user_profile['core_need']}"

        risk_section = f"\n\n【直播间风险话术样本(共{len(risk_utts)}条)】\n{risk_text}" if risk_utts else ""

        product_names = [p.get("name", f"商品{i+1}") for i, p in enumerate(products)] or [keyword]
        dims_str = str(compare_dims)
        names_str = str(product_names)

        prompt = f"""你是专业直播电商消费顾问，请基于以下信息给出购买决策分析。

【搜索关键词】{keyword}{user_str}

【候选商品】
{products_desc}{risk_section}

请严格返回以下 JSON(不要任何额外文字或 markdown 代码块)：
{{
  "p0": {{
    "verdict": "BUY",
    "confidence": 0.75,
    "why_buy": ["理由1(具体结合商品/话术)", "理由2", "理由3"],
    "why_not_buy": ["风险1", "风险2"],
    "must_verify": ["必须核实的事项1", "必须核实的事项2"],
    "consumer_summary": "给消费者的一段综合建议(60字以内)"
  }},
  "p1": {{
    "compare_dimensions": {dims_str},
    "products": [
      {{
        "name": "{product_names[0]}",
        "scores": {{"价格透明度": 0.7, "品质证据": 0.75, "售后保障": 0.8, "话术可信度": 0.65, "综合性价比": 0.72}},
        "overall": 0.72
      }}
    ],
    "ranked": {names_str},
    "analysis_notes": ["对比备注1", "对比备注2"]
  }},
  "p2": {{
    "ask_anchor_questions": ["问题1(针对{keyword})", "问题2", "问题3"],
    "alternatives": ["替代方案1", "替代方案2"],
    "buy_timing": "具体建议在什么情况下下单(30字以内)",
    "action_plan": ["步骤1", "步骤2", "步骤3"],
    "risk_replay": [
      {{"title": "风险点标题", "detail": "风险详情(结合话术样本)"}}
    ]
  }}
}}

verdict 只能是 BUY/WAIT/SKIP 之一；
p1.products 必须包含所有 {max(1, len(products))}  items (无商品则用关键词作单品分析)；
scores 各维度为 0~1 的小数；risk_replay 基于话术样本生成(无样本则生成通用风险提示)。"""

        try:
            resp = await client_async.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": "只返回合法 JSON，不要 markdown 代码块。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=1600,
            )
            raw = (resp.choices[0].message.content or "{}").strip()
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0]
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0]
            result = json.loads(raw.strip())
            result["engine"] = "llm"
            result["evidence_stats"] = evidence_stats
            # 确保 risk_replay 字段存在
            if "p2" in result and "risk_replay" not in result["p2"]:
                result["p2"]["risk_replay"] = []
            return result
        except Exception as e:
            print(f"[full-suite] LLM 失败: {e}，降级到规则引擎")

    # ── 规则引擎兜底 ──────────────────────────────────────────────────────
    def _score(p, dim):
        base = 0.65
        price_str = str(p.get("price", ""))
        if dim == "价格透明度":
            return round(base + (0.1 if "¥" in price_str else -0.05), 2)
        if dim == "品质证据":
            return round(base + (0.1 if "旗舰" in str(p.get("channel","")) else 0.0), 2)
        return round(base + random.uniform(-0.1, 0.1), 2)

    rule_products = [
        {
            "name": p.get("name", f"商品{i+1}"),
            "scores": {d: _score(p, d) for d in compare_dims},
            "overall": round(sum(_score(p, d) for d in compare_dims) / len(compare_dims), 2),
        }
        for i, p in enumerate(products)
    ] or [{"name": keyword, "scores": {d: 0.65 for d in compare_dims}, "overall": 0.65}]

    top = max(rule_products, key=lambda x: x["overall"])
    verdict = "BUY" if top["overall"] >= 0.70 else ("WAIT" if top["overall"] >= 0.55 else "SKIP")

    return {
        "engine": "rule",
        "evidence_stats": evidence_stats,
        "p0": {
            "verdict": verdict,
            "confidence": round(top["overall"], 2),
            "why_buy": [
                f"「{top['name']}」综合评分最高({round(top['overall']*100)}分)",
                f"已接入 {len(utterances)} 条话术 + {len(chats)} 条弹幕证据",
                f"关键词「{keyword}」在当前直播间有覆盖",
            ],
            "why_not_buy": [
                "规则引擎兜底，建议配置 LLM API Key 获取更精准分析",
                f"共发现 {len(risk_utts)} 条风险话术，请人工核验",
            ],
            "must_verify": [
                f"核实「{keyword}」的产品资质和检测报告",
                "确认退换货政策和实际到手价格",
            ],
            "consumer_summary": f"基于规则引擎分析，「{top['name']}」综合表现最佳，建议结合实时话术风险谨慎决策。",
        },
        "p1": {
            "compare_dimensions": compare_dims,
            "products": rule_products,
            "ranked": [p["name"] for p in sorted(rule_products, key=lambda x: x["overall"], reverse=True)],
            "analysis_notes": ["当前使用规则引擎兜底，配置 LLM 可获得更详细对比", "价格和品质数据来自商品描述字段"],
        },
        "p2": {
            "ask_anchor_questions": [
                f"这款{keyword}有没有质量检测报告或生产许可证号？",
                "退换货政策是什么？出现质量问题如何处理？",
                "现在的价格是活动价还是日常价？活动结束后价格会变吗？",
            ],
            "alternatives": [
                f'在电商平台搜索「{keyword} 官方旗舰店」对比价格',
                "先加购物车观察价格变动，避免冲动消费",
            ],
            "buy_timing": "建议主播给出额外赠品或折扣码时下单，避免在倒计时压力下冲动购买",
            "action_plan": [
                "截图记录当前价格和主播承诺内容",
                "点击「进入直播间」并开启 StreamGuard 实时监控",
                f"重点关注{keyword}的功效宣称是否有可验证依据",
            ],
            "risk_replay": [
                {"title": f"话术风险(共{len(risk_utts)}条)", "detail": risk_text or "当前无风险话术样本，建议开启实时监控后重新分析。"}
            ],
        },
    }


@app.post("/session/summary")
async def session_summary(payload: dict):
    """
    接收前端本次监控的完整数据快照，
    调用 LLM 生成结构化 AI 综合建议，返回给前端展示。
    """
    utterances   = payload.get("utterances", [])
    chat_messages = payload.get("chatMessages", [])
    stats        = payload.get("stats", {})
    room_id      = payload.get("roomId", "未知")
    duration_s   = payload.get("durationSeconds", 0)
    ri           = payload.get("rationalityIndex", 0)

    total     = stats.get("total", 0)
    trap_n    = stats.get("trap", 0)
    hype_n    = stats.get("hype", 0)
    fact_n    = stats.get("fact", 0)
    trap_rate = round(trap_n / total * 100, 1) if total > 0 else 0

    # 取风险最高的几条话术
    sorted_u = sorted(utterances, key=lambda x: x.get("score", 1), reverse=False)
    top_risks = sorted_u[:8]
    top_risk_lines = "\n".join(
        f"  [{u.get('type','?').upper()}] {u.get('text','')[:80]}"
        for u in top_risks
    )
    # 取所有话术文本(转写内容摘要)
    all_utterance_texts = "\n".join(
        f"  {u.get('text','')[:60]}" for u in utterances[:30]
    )
    # 取弹幕样本
    chat_sample = "\n".join(
        f"  [{c.get('user','用户')}]: {c.get('text','')[:40]}"
        for c in chat_messages[:30]
    )

    # 无 LLM 时的规则兜底
    if not client_async or not LLM_API_KEY:
        advice = []
        if trap_rate >= 30:
            advice.append({"level": "high", "title": "高陷阱话术占比", "body": f"本次陷阱话术占比 {trap_rate}%，风险较高，建议用户重点核查限时促销、价格误导类话术。"})
        elif trap_rate >= 15:
            advice.append({"level": "medium", "title": "陷阱话术需关注", "body": f"陷阱话术占比 {trap_rate}%，建议用户复查标注为 TRAP 的条目，确认是否存在虚假宣传。"})
        else:
            advice.append({"level": "low", "title": "整体话术较规范", "body": "本次监控陷阱话术比例较低，主播话术总体合规。"})
        advice.append({"level": "info", "title": "理性指数评级", "body": f"理性指数 {ri} 分，{'处于合理区间，继续保持。' if ri >= 70 else '偏低，建议用户关注主播情绪化表达。'}"})
        advice.append({"level": "info", "title": "建议", "body": "建议用户留存本报告用于合规存档，如需深度分析可查看各话术详情。"})
        return {"ai_advice": advice, "generated_by": "rule-engine"}

    # LLM 生成深度分析
    minutes = duration_s // 60
    seconds = duration_s % 60
    duration_str = f"{minutes}分{seconds}秒" if minutes > 0 else f"{seconds}秒"

    prompt = f"""你是一名直播电商合规分析师。以下是一次直播监控会话的完整数据，请先做内容总结，再给出结构化合规建议。

【会话概况】
- 直播间: {room_id}
- 监控时长: {duration_str}
- 主播话术总数: {total} 条
- 理性指数: {ri} 分(满分100，越高越理性)
- 事实型(FACT): {fact_n} 条 / 夸大型(HYPE): {hype_n} 条 / 陷阱型(TRAP): {trap_n} 条(陷阱占比 {trap_rate}%)

【主播转写内容摘要(最近30条)】
{all_utterance_texts if all_utterance_texts else '  (无转写内容)'}

【高风险话术(score最低的8条)】
{top_risk_lines if top_risk_lines else '  (无明显高风险话术)'}

【观众弹幕样本(最近30条)】
{chat_sample if chat_sample else '  (无弹幕数据)'}

请返回一个 JSON 对象，包含两个字段：
1. "summary": 字符串，150字以内，综合主播话术和观众弹幕，描述本场直播的整体情况(主播卖了什么、观众反应如何、整体风险如何)
2. "advice": JSON数组，4~6条建议，每条包含：
   - level: "high" | "medium" | "low" | "info"
   - title: 建议标题(10字以内)
   - body: 具体说明(50~100字，必须结合实际数据和弹幕内容，明确建议是给用户的)

只返回 JSON 对象，不要有额外文字。"""
    try:
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "你是直播合规AI助手，返回JSON格式分析报告。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=1000,
        )
        raw = resp.choices[0].message.content or "[]"
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0]
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0]
        parsed = json.loads(raw.strip())
        # 支持新格式 {summary, advice} 和旧格式 []
        if isinstance(parsed, dict):
            advice = parsed.get("advice", [])
            summary = parsed.get("summary", "")
        elif isinstance(parsed, list):
            advice = parsed
            summary = ""
        else:
            raise ValueError("unexpected format")
        return {"ai_advice": advice, "ai_summary": summary, "generated_by": "llm"}
    except Exception as e:
        return {
            "ai_advice": [{"level": "info", "title": "AI分析暂不可用", "body": f"AI建议生成失败({str(e)[:60]})，请查看本地统计数据。"}],
            "generated_by": "fallback",
        }


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
