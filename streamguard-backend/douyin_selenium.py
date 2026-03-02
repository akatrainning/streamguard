"""
Douyin Live Scraper via Selenium CDP (Chrome DevTools Protocol).

Instead of trying to forge Douyin's anti-bot signatures, we open the real page
in headless Chrome and capture WebSocket frames via CDP Network events.
The browser handles all JS/signatures natively.
"""
import asyncio
import json
import gzip
import time
import re
import threading
import queue
from typing import Callable, Optional

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager


# ---------------------------------------------------------------------------
# Tiny protobuf varint / field decoder (same as douyin_ws_client.py)
# ---------------------------------------------------------------------------
def _read_varint(data: bytes, pos: int):
    result = 0; shift = 0
    while pos < len(data):
        b = data[pos]; pos += 1
        result |= (b & 0x7F) << shift; shift += 7
        if not (b & 0x80):
            return result, pos
    raise ValueError("truncated varint")

def _decode_fields(data: bytes) -> dict:
    fields: dict = {}; pos = 0
    while pos < len(data):
        try:
            tag, pos = _read_varint(data, pos)
        except (ValueError, IndexError):
            break
        fn = tag >> 3; wt = tag & 0x7
        try:
            if wt == 0:
                val, pos = _read_varint(data, pos)
            elif wt == 1:
                val = data[pos:pos+8]; pos += 8
            elif wt == 2:
                n, pos = _read_varint(data, pos)
                val = data[pos:pos+n]; pos += n
            elif wt == 5:
                val = data[pos:pos+4]; pos += 4
            else:
                break
        except (ValueError, IndexError):
            break
        fields.setdefault(fn, []).append(val)
    return fields

def _str(f, n, default=""):
    v = f.get(n, [b""])[0]
    return v.decode("utf-8", errors="replace") if isinstance(v, bytes) else default

def _bytes_val(f, n):
    v = f.get(n, [None])[0]
    return v if isinstance(v, bytes) else None

def _int_val(f, n, default=0):
    v = f.get(n, [default])[0]
    return v if isinstance(v, int) else default


# ---------------------------------------------------------------------------
# Message decoders
# ---------------------------------------------------------------------------
def _decode_user(ub: bytes) -> str:
    if not ub: return ""
    uf = _decode_fields(ub)
    return _str(uf, 3) or _str(uf, 2) or ""

def decode_push_frame(raw: bytes):
    """Returns (payload_bytes, need_ack, seq_id)."""
    f = _decode_fields(raw)
    payload = _bytes_val(f, 8) or b""
    need_ack = bool(_int_val(f, 9))
    seq_id = _int_val(f, 1)
    return payload, need_ack, seq_id

def decode_response(compressed: bytes):
    """Returns list of (method, body_bytes)."""
    try:
        data = gzip.decompress(compressed)
    except Exception:
        data = compressed
    f = _decode_fields(data)
    results = []
    for mb in f.get(1, []):
        if not isinstance(mb, bytes): continue
        mf = _decode_fields(mb)
        method = _str(mf, 1)
        body = _bytes_val(mf, 2) or b""
        results.append((method, body))
    return results

def decode_chat(payload: bytes) -> dict:
    f = _decode_fields(payload)
    content = _str(f, 3)
    nick = _decode_user(_bytes_val(f, 2) or b"")
    return {"content": content, "nickname": nick or "User"}

def decode_member(payload: bytes) -> dict:
    f = _decode_fields(payload)
    nick = _decode_user(_bytes_val(f, 2) or b"")
    return {"nickname": nick or "User"}


# ---------------------------------------------------------------------------
# Selenium-based scraper (runs in a background thread)
# ---------------------------------------------------------------------------

class DouyinSeleniumScraper:
    """
    Opens a headless Chrome, navigates to the Douyin live room, and
    intercepts WebSocket binary frames via CDP.
    Puts decoded events into an asyncio-safe queue.
    """

    def __init__(self, web_rid: str, event_queue: queue.Queue):
        self.web_rid = web_rid
        self.url = f"https://live.douyin.com/{web_rid}"
        self.q = event_queue
        self.driver: Optional[webdriver.Chrome] = None
        self._stop = False

    def start(self):
        """Run in a background thread."""
        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--mute-audio")
        opts.add_argument("--window-size=1280,720")
        opts.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        # Avoid detection
        opts.add_experimental_option("excludeSwitches", ["enable-automation"])
        opts.add_experimental_option("useAutomationExtension", False)

        try:
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=opts)
        except Exception as e:
            self.q.put({"event": "error", "message": f"Chrome startup failed: {e}"})
            return

        try:
            # Enable CDP Network domain
            self.driver.execute_cdp_cmd("Network.enable", {})

            # Navigate to the live room
            self.driver.get(self.url)
            time.sleep(3)  # wait for page load

            # Inject JS to intercept WebSocket messages
            self.driver.execute_script("""
                window.__dyMsgs = [];
                const origWS = WebSocket;
                const origSend = WebSocket.prototype.send;
                
                // Patch WebSocket constructor
                const patchedWS = function(url, protocols) {
                    const ws = protocols ? new origWS(url, protocols) : new origWS(url);
                    
                    ws.addEventListener('message', function(evt) {
                        if (evt.data instanceof Blob) {
                            evt.data.arrayBuffer().then(buf => {
                                const arr = Array.from(new Uint8Array(buf));
                                window.__dyMsgs.push({type: 'binary', data: arr, ts: Date.now()});
                            });
                        } else if (evt.data instanceof ArrayBuffer) {
                            const arr = Array.from(new Uint8Array(evt.data));
                            window.__dyMsgs.push({type: 'binary', data: arr, ts: Date.now()});
                        } else if (typeof evt.data === 'string') {
                            window.__dyMsgs.push({type: 'text', data: evt.data, ts: Date.now()});
                        }
                    });
                    return ws;
                };
                patchedWS.prototype = origWS.prototype;
                patchedWS.CONNECTING = origWS.CONNECTING;
                patchedWS.OPEN = origWS.OPEN;
                patchedWS.CLOSING = origWS.CLOSING;
                patchedWS.CLOSED = origWS.CLOSED;
                window.WebSocket = patchedWS;
            """)

            self.q.put({
                "event": "status",
                "status": "connected",
                "message": f"Chrome opened room {self.web_rid}, intercepting WebSocket...",
            })

            # Poll for intercepted messages
            while not self._stop:
                try:
                    msgs = self.driver.execute_script("""
                        const out = window.__dyMsgs || [];
                        window.__dyMsgs = [];
                        return out;
                    """)
                except Exception:
                    time.sleep(1)
                    continue

                if msgs:
                    for msg in msgs:
                        self._process_raw(msg)

                time.sleep(0.5)

        except Exception as e:
            self.q.put({"event": "error", "message": f"Scraper error: {e}"})
        finally:
            try:
                if self.driver:
                    self.driver.quit()
            except Exception:
                pass

    def _process_raw(self, msg: dict):
        if msg.get("type") != "binary":
            return
        raw = bytes(msg.get("data", []))
        if not raw:
            return
        try:
            payload, _, _ = decode_push_frame(raw)
            if not payload:
                return
            messages = decode_response(payload)
            ts = time.strftime("%H:%M:%S")
            for method, body in messages:
                if method == "WebcastChatMessage":
                    info = decode_chat(body)
                    if info["content"].strip():
                        self.q.put({
                            "event": "chat",
                            "user": info["nickname"],
                            "text": info["content"],
                            "timestamp": ts,
                        })
                elif method == "WebcastMemberMessage":
                    info = decode_member(body)
                    self.q.put({
                        "event": "viewer_join",
                        "user": info["nickname"],
                        "timestamp": ts,
                    })
                elif method == "WebcastGiftMessage":
                    self.q.put({"event": "gift", "timestamp": ts})
        except Exception:
            pass

    def stop(self):
        self._stop = True


# ---------------------------------------------------------------------------
# Async wrapper
# ---------------------------------------------------------------------------

async def stream_douyin_selenium(web_rid: str, callback: Callable):
    """
    Async entry point. Starts Selenium in a background thread,
    reads events from a queue and calls callback(event_dict).
    """
    q = queue.Queue(maxsize=500)
    scraper = DouyinSeleniumScraper(web_rid, q)
    thread = threading.Thread(target=scraper.start, daemon=True)
    thread.start()

    try:
        while thread.is_alive():
            # drain queue
            while True:
                try:
                    evt = q.get_nowait()
                    await callback(evt)
                except queue.Empty:
                    break
            await asyncio.sleep(0.3)
    finally:
        scraper.stop()


# ---------------------------------------------------------------------------
# Quick self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    room = sys.argv[1] if len(sys.argv) > 1 else "646454278948"
    count = 0

    async def on_event(evt):
        global count
        count += 1
        etype = evt.get("event", "?")
        if etype == "status":
            print(f">> {evt.get('message')}")
        elif etype == "chat":
            print(f"[CHAT] {evt.get('user','?')}: {evt.get('text','')}")
        elif etype == "viewer_join":
            print(f"[JOIN] {evt.get('user','?')}")
        elif etype == "error":
            print(f"[ERROR] {evt.get('message','?')}")
        else:
            print(f"[{etype}]")
        if count >= 30:
            raise KeyboardInterrupt

    async def main():
        try:
            await asyncio.wait_for(
                stream_douyin_selenium(room, on_event),
                timeout=60
            )
        except (KeyboardInterrupt, asyncio.TimeoutError):
            print(f"\nDone. Got {count} events.")

    asyncio.run(main())
