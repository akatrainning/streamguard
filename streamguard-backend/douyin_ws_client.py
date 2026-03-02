"""
Minimal Douyin Live WebSocket client - no external dependencies beyond requests+websockets.
Implements the Douyin live proto decoder directly in Python.
"""
import asyncio
import gzip
import json
import re
import time
import random
from typing import Optional, Callable

try:
    import requests as _requests
    _REQUESTS_OK = True
except ImportError:
    _REQUESTS_OK = False

try:
    import websockets
    _WEBSOCKETS_OK = True
except ImportError:
    _WEBSOCKETS_OK = False


# ---------------------------------------------------------------------------
# Tiny protobuf decoder  (no generated code needed)
# ---------------------------------------------------------------------------

def _read_varint(data: bytes, pos: int):
    result = 0
    shift = 0
    while pos < len(data):
        b = data[pos]; pos += 1
        result |= (b & 0x7F) << shift
        shift += 7
        if not (b & 0x80):
            return result, pos
    raise ValueError("truncated varint")

def _decode_fields(data: bytes) -> dict:
    fields: dict = {}
    pos = 0
    while pos < len(data):
        try:
            tag, pos = _read_varint(data, pos)
        except (ValueError, IndexError):
            break
        field_num = tag >> 3
        wire_type = tag & 0x7
        try:
            if wire_type == 0:
                val, pos = _read_varint(data, pos)
            elif wire_type == 1:
                val = data[pos:pos+8]; pos += 8
            elif wire_type == 2:
                n, pos = _read_varint(data, pos)
                val = data[pos:pos+n]; pos += n
            elif wire_type == 5:
                val = data[pos:pos+4]; pos += 4
            else:
                break
        except (ValueError, IndexError):
            break
        fields.setdefault(field_num, []).append(val)
    return fields

def _str(f: dict, n: int, default: str = "") -> str:
    v = f.get(n, [b""])[0]
    if isinstance(v, bytes):
        try: return v.decode("utf-8", errors="replace")
        except: return default
    return default

def _bytes_val(f: dict, n: int) -> Optional[bytes]:
    v = f.get(n, [None])[0]
    return v if isinstance(v, bytes) else None

def _int_val(f: dict, n: int, default: int = 0) -> int:
    v = f.get(n, [default])[0]
    return v if isinstance(v, int) else default


# ---------------------------------------------------------------------------
# Douyin-specific proto decoders
# ---------------------------------------------------------------------------

def _decode_push_frame(raw: bytes):
    """Decode PushFrame -> (payloadType, payload, needAck, seqId)"""
    f = _decode_fields(raw)
    payload_type = _str(f, 7) or _str(f, 4)
    payload      = _bytes_val(f, 8) or b""
    need_ack     = bool(_int_val(f, 9))
    seq_id       = _int_val(f, 1)
    return payload_type, payload, need_ack, seq_id

def _decode_response(compressed: bytes):
    """Decode gzip-compressed Response -> ([(method, payload)], internal_ext, cursor)"""
    try:
        data = gzip.decompress(compressed)
    except Exception:
        data = compressed
    f = _decode_fields(data)
    msgs_raw     = f.get(1, [])
    internal_ext = _str(f, 5)
    cursor       = _str(f, 2)
    need_ack     = bool(_int_val(f, 9))
    results = []
    for mb in msgs_raw:
        if not isinstance(mb, bytes):
            continue
        mf     = _decode_fields(mb)
        method = _str(mf, 1)
        body   = _bytes_val(mf, 2) or b""
        results.append((method, body))
    return results, internal_ext, cursor, need_ack

def _decode_user_from_bytes(user_bytes: bytes) -> str:
    if not user_bytes:
        return ""
    uf = _decode_fields(user_bytes)
    return _str(uf, 3) or _str(uf, 2) or ""

def _decode_chat(payload: bytes) -> dict:
    f       = _decode_fields(payload)
    content = _str(f, 3)
    nick    = _decode_user_from_bytes(_bytes_val(f, 2) or b"")
    return {"content": content, "nickname": nick or "User"}

def _decode_member(payload: bytes) -> dict:
    f    = _decode_fields(payload)
    nick = _decode_user_from_bytes(_bytes_val(f, 2) or b"")
    return {"nickname": nick or "User"}

def _build_ack_frame(seq_id: int) -> bytes:
    """Build minimal ACK PushFrame."""
    def varint(n):
        buf = bytearray()
        while n > 0x7F:
            buf.append((n & 0x7F) | 0x80); n >>= 7
        buf.append(n); return bytes(buf)
    def field_varint(fn, v):
        return varint((fn << 3) | 0) + varint(v)
    def field_bytes(fn, v):
        return varint((fn << 3) | 2) + varint(len(v)) + v
    return field_varint(1, seq_id) + field_bytes(7, b"ack") + field_bytes(8, b"")


# ---------------------------------------------------------------------------
# HTTP helpers (sync, runs in executor)
# ---------------------------------------------------------------------------

_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer":         "https://live.douyin.com/",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept":          "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
}

def _fetch_ttwid_sync():
    resp = _requests.get("https://live.douyin.com", headers=_HEADERS, timeout=15)
    return resp.cookies.get("ttwid", ""), dict(resp.cookies)

def _fetch_room_id_sync(web_rid: str, cookies: dict):
    """Return (room_id, cursor, internal_ext)."""
    # Try JSON API first
    api = (
        "https://live.douyin.com/webcast/room/web/enter/"
        f"?aid=6383&app_name=douyin_web&live_id=1&device_platform=web"
        f"&language=zh-CN&enter_from=web_live&cookie_enabled=true"
        f"&screen_width=1920&screen_height=1080&browser_language=zh-CN"
        f"&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
        f"&web_rid={web_rid}&room_id_str={web_rid}"
    )
    try:
        resp = _requests.get(api, headers=_HEADERS, cookies=cookies, timeout=15)
        data = resp.json()
        room_list = data.get("data", {}).get("data", [{}])
        if isinstance(room_list, list) and room_list:
            r = room_list[0]
        elif isinstance(room_list, dict):
            r = room_list
        else:
            r = {}
        rid = str(r.get("id_str", "")) or str(r.get("room_id", ""))
        if rid:
            return rid, str(r.get("cursor", "")), str(r.get("internal_ext", ""))
    except Exception as exc:
        print(f"[Douyin] API lookup failed: {exc}")

    # Fallback: parse HTML
    try:
        resp = _requests.get(
            f"https://live.douyin.com/{web_rid}",
            headers=_HEADERS, cookies=cookies, timeout=15
        )
        html = resp.text
        # RENDER_DATA script tag (URL-encoded JSON)
        m = re.search(r'<script id="RENDER_DATA"[^>]*>([^<]+)</script>', html)
        if m:
            from urllib.parse import unquote
            try:
                obj = json.loads(unquote(m.group(1)))
                room_store = (obj.get("app", {}) or obj).get("initialState", {}).get("roomStore", {})
                rid = str(room_store.get("roomInfo", {}).get("room", {}).get("id_str", ""))
                if rid:
                    return rid, "", ""
            except Exception:
                pass
        for pat in [r'"id_str"\s*:\s*"(\d+)"', r'"roomId"\s*:\s*"(\d+)"', r'"room_id"\s*:\s*"(\d+)"']:
            m2 = re.search(pat, html)
            if m2:
                return m2.group(1), "", ""
    except Exception as exc:
        print(f"[Douyin] HTML lookup failed: {exc}")

    # Last resort: use web_rid directly
    return web_rid, "", ""


# ---------------------------------------------------------------------------
# WebSocket URL template
# ---------------------------------------------------------------------------

_WS_TMPL = (
    "wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/"
    "?app_name=douyin_web&version_code=180800&webcast_sdk_version=1.0.14"
    "&update_version_code=1.0.14&compress=gzip"
    "&internal_ext={internal_ext}&cursor={cursor}"
    "&host=https://live.douyin.com&aid=6383&live_id=1&did_rule=3"
    "&endpoint=live_pc&support_wrds=1&im_path=/webcast/im/fetch/"
    "&user_unique_id={uid}&device_platform=web&cookie_enabled=true"
    "&screen_width=1920&screen_height=1080&browser_language=zh-CN"
    "&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
    "&browser_online=true&tz_name=Asia%2FShanghai&identity=audience"
    "&room_id={room_id}&heartbeatDuration=0"
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def stream_douyin_live(web_rid: str, callback: Callable):
    """
    Connect to Douyin live room *web_rid* and call callback(event_dict) for each event.
    Raises RuntimeError if unable to connect.
    """
    # NOTE (2026): Direct WS is frequently blocked by anti-bot signatures.
    # Keep this legacy function name, but route to CDP-based browser capture.
    try:
        await callback({
            "event": "status",
            "status": "connecting",
            "message": "Legacy WS adapter redirected to CDP adapter",
        })
    except Exception:
        pass

    try:
        from douyin_cdp import stream_douyin_cdp
        await stream_douyin_cdp(web_rid, callback)
    except Exception as exc:
        raise RuntimeError(f"Douyin CDP fallback error: {exc}")