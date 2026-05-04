"""
Douyin Live Scraper - CDP WebSocket Frame Capture.

Uses Chrome DevTools Protocol (CDP) to capture WebSocket frames directly,
bypassing the need for JS injection timing. This is more reliable because
CDP sees ALL WebSocket traffic regardless of when the connection is created.
"""
import asyncio
import json
import gzip
import zlib
import time
import base64
import threading
import queue
import subprocess
import atexit
import os
import pathlib
import stat
import re
from typing import Callable, Optional

# ---------------------------------------------------------------------------
# Global Chrome process tracker.
# Clean up stale Chrome/chromedriver processes between runs.
# ---------------------------------------------------------------------------
_tracked_service_pids: list = []
_tracked_pids_lock = threading.Lock()


def _kill_chrome_pid(pid: int):
    """Force-kill the given process tree on Windows."""
    try:
        subprocess.run(
            ['taskkill', '/F', '/T', '/PID', str(pid)],
            capture_output=True, timeout=5
        )
    except Exception:
        pass


def _kill_all_tracked_chromes():
    """Kill all tracked Chrome/chromedriver process trees."""
    with _tracked_pids_lock:
        pids = _tracked_service_pids[:]
        _tracked_service_pids.clear()
    for pid in pids:
        _kill_chrome_pid(pid)


def _register_chrome_pid(pid: int):
    with _tracked_pids_lock:
        _tracked_service_pids.append(pid)


def _unregister_chrome_pid(pid: int):
    with _tracked_pids_lock:
        try:
            _tracked_service_pids.remove(pid)
        except ValueError:
            pass


atexit.register(_kill_all_tracked_chromes)

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException
from webdriver_manager.chrome import ChromeDriverManager

# ---------------------------------------------------------------------------
# ChromeDriver path cache (avoid re-downloading on every connect)
# ---------------------------------------------------------------------------
_CHROMEDRIVER_PATH: Optional[str] = None


def _merge_no_proxy_value(existing: str) -> str:
    required = ["localhost", "127.0.0.1", "::1"]
    items = [part.strip() for part in (existing or "").split(",") if part.strip()]
    seen = {item.lower() for item in items}
    for value in required:
        if value.lower() not in seen:
            items.append(value)
    return ",".join(items)


def _ensure_local_webdriver_bypass():
    """Keep Selenium's localhost traffic away from the user's HTTP proxy."""
    for key in ("NO_PROXY", "no_proxy"):
        os.environ[key] = _merge_no_proxy_value(os.environ.get(key, ""))


def _find_chrome_exe() -> str:
    """Locate a local Chrome/Edge executable on Windows."""
    import shutil as _sh

    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Google\Chrome\Application\chrome.exe"),
        os.path.join(os.environ.get("PROGRAMFILES", ""), r"Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    for name in ("chrome", "google-chrome", "chromium", "msedge"):
        found = _sh.which(name)
        if found:
            return found
    return ""


def _get_browser_major_version() -> Optional[int]:
    browser_path = _find_chrome_exe()
    if not browser_path:
        return None
    try:
        version = pathlib.Path(browser_path).resolve().stat()
    except Exception:
        version = None
    try:
        import win32api  # type: ignore
        version_str = win32api.GetFileVersionInfo(browser_path, "\\")  # pragma: no cover
        if version_str:
            ms = version_str["FileVersionMS"]
            ls = version_str["FileVersionLS"]
            major = ms // 65536
            if major:
                return int(major)
    except Exception:
        pass
    try:
        import ctypes

        size = ctypes.windll.version.GetFileVersionInfoSizeW(browser_path, None)
        if size:
            res = ctypes.create_string_buffer(size)
            ctypes.windll.version.GetFileVersionInfoW(browser_path, 0, size, res)
            lptr = ctypes.c_void_p()
            ulen = ctypes.c_uint()
            if ctypes.windll.version.VerQueryValueW(res, "\\", ctypes.byref(lptr), ctypes.byref(ulen)):
                class VS_FIXEDFILEINFO(ctypes.Structure):
                    _fields_ = [
                        ("dwSignature", ctypes.c_uint32),
                        ("dwStrucVersion", ctypes.c_uint32),
                        ("dwFileVersionMS", ctypes.c_uint32),
                        ("dwFileVersionLS", ctypes.c_uint32),
                        ("dwProductVersionMS", ctypes.c_uint32),
                        ("dwProductVersionLS", ctypes.c_uint32),
                        ("dwFileFlagsMask", ctypes.c_uint32),
                        ("dwFileFlags", ctypes.c_uint32),
                        ("dwFileOS", ctypes.c_uint32),
                        ("dwFileType", ctypes.c_uint32),
                        ("dwFileSubtype", ctypes.c_uint32),
                        ("dwFileDateMS", ctypes.c_uint32),
                        ("dwFileDateLS", ctypes.c_uint32),
                    ]

                ffi = VS_FIXEDFILEINFO.from_address(lptr.value)
                major = ffi.dwFileVersionMS >> 16
                if major:
                    return int(major)
    except Exception:
        pass
    return None


def _cached_chromedriver_candidates() -> list[pathlib.Path]:
    root = pathlib.Path.home() / ".wdm" / "drivers" / "chromedriver"
    if not root.exists():
        return []
    hits = [path for path in root.rglob("chromedriver.exe") if path.is_file()]
    hits.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return hits


def _pick_cached_chromedriver() -> Optional[str]:
    browser_major = _get_browser_major_version()
    candidates = _cached_chromedriver_candidates()
    if not candidates:
        return None

    if browser_major is not None:
        for candidate in candidates:
            parts = candidate.parts
            for part in parts:
                match = re.match(r"^(\d+)\.", part)
                if match and int(match.group(1)) == browser_major:
                    return str(candidate)

    return str(candidates[0])


_ensure_local_webdriver_bypass()

def _fix_chromedriver_permissions(driver_path: str):
    """Best-effort permission repair for webdriver binaries on Windows."""
    if os.name != "nt" or not os.path.exists(driver_path):
        return
    try:
        current_perms = os.stat(driver_path).st_mode
        os.chmod(driver_path, current_perms | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except Exception:
        pass

def _resolve_chromedriver_path(driver_path: str) -> str:
    """Normalize webdriver-manager output to a runnable chromedriver.exe path."""
    candidate = pathlib.Path(driver_path)
    search_roots = []
    if candidate.exists():
        search_roots.append(candidate if candidate.is_dir() else candidate.parent)
    search_roots.append(candidate.parent)
    search_roots.append(candidate.parent.parent)

    seen: set[str] = set()
    for root in search_roots:
        root_str = str(root)
        if not root_str or root_str in seen or not root.exists():
            continue
        seen.add(root_str)
        for hit in root.rglob("chromedriver.exe"):
            if hit.is_file():
                return str(hit)
    return driver_path

def _validate_chromedriver_path(driver_path: str) -> str:
    """Ensure the resolved driver is executable before handing it to Selenium."""
    resolved = _resolve_chromedriver_path(driver_path)
    _fix_chromedriver_permissions(resolved)
    try:
        subprocess.run(
            [resolved, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
    except Exception as exc:
        raise RuntimeError(f"chromedriver not runnable at {resolved}: {exc}") from exc
    return resolved

def _get_chromedriver_path() -> str:
    global _CHROMEDRIVER_PATH
    if _CHROMEDRIVER_PATH is None:
        cached_path = _pick_cached_chromedriver()
        if cached_path:
            try:
                _CHROMEDRIVER_PATH = _validate_chromedriver_path(cached_path)
                print(f"[chromedriver] using cached driver at {_CHROMEDRIVER_PATH}")
                return _CHROMEDRIVER_PATH
            except Exception as cached_err:
                print(f"[chromedriver] cached driver unusable: {cached_err}")

        max_retries = 3
        last_error = None
        
        for attempt in range(max_retries):
            try:
                print(f"[chromedriver] download attempt {attempt + 1}/{max_retries}...")
                # 使用简单的 ChromeDriverManager，不带兼容性问题的参数
                manager = ChromeDriverManager()
                raw_path = manager.install()
                _CHROMEDRIVER_PATH = _validate_chromedriver_path(raw_path)
                print(f"[chromedriver] installed successfully at {_CHROMEDRIVER_PATH}")
                return _CHROMEDRIVER_PATH
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # 指数退避：1, 2 秒
                    print(f"[chromedriver] attempt {attempt + 1} failed: {type(e).__name__}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"[chromedriver] all {max_retries} attempts failed")
        
        # 如果下载失败，尝试查找已存在的 chromedriver
        print("[chromedriver] trying to find existing chromedriver...")
        possible_locations = [
            os.path.expanduser("~/.wdm/drivers/chromedriver/win64"),
            os.path.join(os.path.dirname(__file__), "..", "chromedriver.exe"),
        ]
        for loc in possible_locations:
            if os.path.exists(loc):
                try:
                    _CHROMEDRIVER_PATH = _validate_chromedriver_path(loc)
                    print(f"[chromedriver] found existing at {_CHROMEDRIVER_PATH}")
                    return _CHROMEDRIVER_PATH
                except Exception as locate_err:
                    print(f"[chromedriver] existing at {loc} not usable: {locate_err}")
        
        # 最后的手段
        raise RuntimeError(
            f"Failed to get chromedriver after {max_retries} attempts. "
            f"Last error: {type(last_error).__name__}: {last_error}"
        )
    return _CHROMEDRIVER_PATH


# ---------------------------------------------------------------------------
# Protobuf helpers (lightweight, no proto compilation)
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
        try: tag, pos = _read_varint(data, pos)
        except: break
        fn = tag >> 3; wt = tag & 0x7
        try:
            if wt == 0: val, pos = _read_varint(data, pos)
            elif wt == 1: val = data[pos:pos+8]; pos += 8
            elif wt == 2:
                n, pos = _read_varint(data, pos)
                val = data[pos:pos+n]; pos += n
            elif wt == 5: val = data[pos:pos+4]; pos += 4
            else: break
        except: break
        fields.setdefault(fn, []).append(val)
    return fields

def _s(f, n, d=""): 
    v = f.get(n, [b""])[0]
    return v.decode("utf-8", errors="replace") if isinstance(v, bytes) else d

def _b(f, n): 
    v = f.get(n, [None])[0]
    return v if isinstance(v, bytes) else None

def _i(f, n, d=0): 
    v = f.get(n, [d])[0]
    return v if isinstance(v, int) else d

def _user(ub):
    if not ub: return ""
    uf = _decode_fields(ub)
    return _s(uf, 3) or _s(uf, 2) or ""


def _inflate_candidates(payload: bytes):
    """Return candidate decoded payloads (raw/gzip/zlib)."""
    cands = [payload]
    for fn in (
        lambda b: gzip.decompress(b),
        lambda b: zlib.decompress(b),
        lambda b: zlib.decompress(b, -zlib.MAX_WBITS),
    ):
        try:
            out = fn(payload)
            if out and out not in cands:
                cands.append(out)
        except Exception:
            pass
    return cands


# ---------------------------------------------------------------------------
# Frame decoders
# ---------------------------------------------------------------------------
def decode_ws_frame(raw: bytes):
    """Decode a complete WS binary frame -> list of (method, decoded_dict)."""
    results = []
    try:
        f = _decode_fields(raw)
        payload = _b(f, 8) or raw
        if not payload:
            return results

        decoded_any = False
        for data in _inflate_candidates(payload):
            rf = _decode_fields(data)
            for mb in rf.get(1, []):
                if not isinstance(mb, bytes):
                    continue
                mf = _decode_fields(mb)
                method = _s(mf, 1)
                body = _b(mf, 2) or b""
                if method == "WebcastChatMessage":
                    cf = _decode_fields(body)
                    results.append(("chat", {
                        "user": _user(_b(cf, 2) or b"") or "User",
                        "text": _s(cf, 3),
                    }))
                    decoded_any = True
                elif method == "WebcastMemberMessage":
                    mf2 = _decode_fields(body)
                    results.append(("member", {
                        "user": _user(_b(mf2, 2) or b"") or "User",
                    }))
                    decoded_any = True
                elif method == "WebcastGiftMessage":
                    results.append(("gift", {}))
                    decoded_any = True
                elif method == "WebcastSocialMessage":
                    sf = _decode_fields(body)
                    results.append(("social", {
                        "user": _user(_b(sf, 2) or b"") or "User",
                    }))
                    decoded_any = True

            if decoded_any:
                break
    except Exception:
        pass
    return results


# ---------------------------------------------------------------------------
# CDP-based WebSocket frame capture
# ---------------------------------------------------------------------------
class DouyinCDPScraper:
    """
    Opens headless Chrome with CDP logging, navigates to a Douyin live room,
    and captures WebSocket frames through CDP Network events.
    """

    def __init__(self, web_rid: str, event_queue: queue.Queue, headless: bool = True):
        self.web_rid = web_rid
        self.url = f"https://live.douyin.com/{web_rid}"
        self.q = event_queue
        self.headless = headless
        self.driver: Optional[webdriver.Chrome] = None
        self._stop = False
        self.raw_frame_count = 0
        self.decoded_event_count = 0
        self.ws_created_count = 0

    def start(self):
        opts = Options()
        if self.headless:
            opts.add_argument("--headless=new")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--ignore-certificate-errors")
        opts.add_argument("--allow-running-insecure-content")
        opts.add_argument("--mute-audio")
        opts.add_argument("--window-size=800,600")       # 缂╁皬绐楀彛锛屽噺灏戞覆鏌撳紑閿€
        opts.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        # 鑺傜渷璧勬簮锛氱鐢ㄤ笉蹇呰鐨勫姛鑳?
        opts.add_argument("--disable-extensions")
        opts.add_argument("--disable-background-networking")   # 绂佺敤鍚庡彴缃戠粶璇锋眰
        opts.add_argument("--disable-sync")                    # 绂佺敤璐﹀彿鍚屾
        opts.add_argument("--disable-translate")
        opts.add_argument("--disable-plugins")
        opts.add_argument("--disable-background-timer-throttling")
        opts.add_argument("--disable-renderer-backgrounding")  # 闃叉 Chrome 闄嶄綆鍚庡彴鏍囩浼樺厛绾?
        opts.add_argument("--blink-settings=imagesEnabled=false")  # 绂佹鍔犺浇鍥剧墖
        opts.add_argument("--disable-javascript-harmony-shipping")
        opts.add_argument("--js-flags=--max-old-space-size=256")   # 闄愬埗 JS 鍫嗗唴瀛?256MB
        opts.add_argument("--media-cache-size=1")
        opts.add_argument("--disk-cache-size=1")
        opts.add_experimental_option("excludeSwitches", ["enable-automation"])
        opts.add_experimental_option("useAutomationExtension", False)
        # Enable performance logging for CDP WebSocket frames
        opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

        _service_pid = None
        try:
            _service = Service(_get_chromedriver_path())
            self.driver = webdriver.Chrome(service=_service, options=opts)
            _service_pid = getattr(getattr(_service, 'process', None), 'pid', None)
            if _service_pid:
                _register_chrome_pid(_service_pid)
            self.driver.set_page_load_timeout(20)
        except Exception as e:
            self.q.put({"event": "error", "message": f"Chrome start failed: {e}"})
            return

        try:
            # Enable CDP network
            self.driver.execute_cdp_cmd("Network.enable", {})

            self.q.put({
                "event": "status", "status": "connecting",
                "message": f"Opening {self.url} in Chrome...",
            })

            try:
                self.driver.get(self.url)
            except TimeoutException:
                self.q.put({
                    "event": "status",
                    "status": "connecting",
                    "message": "Page load timeout, continue listening WebSocket frames...",
                })
            # 鏅鸿兘绛夊緟锛氳疆璇㈡娴嬮鏉S甯э紝鏈€闀跨瓑5s锛岃€岄潪鍥哄畾sleep
            _wait_start = time.time()
            while time.time() - _wait_start < 5:
                try:
                    _probe = self.driver.get_log("performance")
                except Exception:
                    break
                if any(
                    json.loads(e["message"])["message"].get("method", "").startswith("Network.webSocket")
                    for e in _probe
                ):
                    break
                time.sleep(0.2)

            # Check page loaded
            title = self.driver.title
            self.q.put({
                "event": "status", "status": "connected",
                "message": f"Page loaded: {title}",
            })

            # Main loop: read performance logs for WS frames
            last_frame_ts = time.time()
            last_note_ts = 0.0
            while not self._stop:
                try:
                    logs = self.driver.get_log("performance")
                except Exception:
                    time.sleep(1)
                    continue

                for entry in logs:
                    try:
                        msg = json.loads(entry["message"])["message"]
                        method = msg.get("method", "")
                        params = msg.get("params", {})

                        if method == "Network.webSocketCreated":
                            self.ws_created_count += 1
                            ws_url = params.get("url", "")
                            self.q.put({
                                "event": "status",
                                "status": "connecting",
                                "message": f"WS created ({self.ws_created_count}): {ws_url[:120]}",
                            })

                        if method == "Network.webSocketFrameReceived":
                            resp = params.get("response", {})
                            payload_data = resp.get("payloadData", "")
                            opcode = resp.get("opcode", 2)

                            if opcode == 2 and payload_data:
                                # Binary frame, base64 encoded
                                try:
                                    raw = base64.b64decode(payload_data)
                                except Exception:
                                    continue
                                self.raw_frame_count += 1
                                last_frame_ts = time.time()
                                self._handle_binary(raw)
                            elif opcode == 1 and payload_data:
                                # Text frame (usually heartbeat or control message)
                                self.raw_frame_count += 1
                                last_frame_ts = time.time()

                    except Exception:
                        continue

                now = time.time()
                if now - last_frame_ts > 20 and now - last_note_ts > 8:
                    if self.raw_frame_count > 0 and self.decoded_event_count == 0:
                        msg = (
                            f"WS frames observed: {self.raw_frame_count}, but decoded events: 0 "
                            f"(likely protocol/compression variant or anti-bot page)"
                        )
                    elif self.ws_created_count == 0:
                        msg = "No Douyin WS created yet (possible anti-bot challenge or room unavailable)"
                    else:
                        msg = "No WS frame decoded for 20s (room may be quiet or anti-bot challenge in progress)"
                    self.q.put({
                        "event": "status",
                        "status": "connecting",
                        "message": msg,
                    })
                    last_note_ts = now

                time.sleep(0.2)  # 5Hz 杞(鍘?10Hz)锛屽噺灏?CPU 鍗犵敤

        except Exception as e:
            self.q.put({"event": "error", "message": f"CDP error: {e}"})
        finally:
            try:
                if self.driver: self.driver.quit()
            except Exception:
                pass
            # 寮哄埗鏉€ chromedriver 杩涚▼鏍?纭繚 chrome.exe 瀛愯繘绋嬩篃琚竻鐞?
            if _service_pid:
                _unregister_chrome_pid(_service_pid)
                _kill_chrome_pid(_service_pid)

    def _handle_binary(self, raw: bytes):
        ts = time.strftime("%H:%M:%S")
        events = decode_ws_frame(raw)
        self.decoded_event_count += len(events)
        for etype, data in events:
            if etype == "chat" and data.get("text", "").strip():
                self.q.put({
                    "event": "chat",
                    "user": data["user"],
                    "text": data["text"],
                    "timestamp": ts,
                })
            elif etype == "member":
                self.q.put({
                    "event": "viewer_join",
                    "user": data["user"],
                    "timestamp": ts,
                })
            elif etype == "gift":
                self.q.put({"event": "gift", "timestamp": ts})

    def stop(self):
        self._stop = True


# ---------------------------------------------------------------------------
# Async wrapper for FastAPI integration
# ---------------------------------------------------------------------------
async def stream_douyin_cdp(web_rid: str, callback: Callable, headless: bool = True):
    """Start Chrome scraper in thread, forward events via async callback.

    Retry strategy:
    1) headless mode only (headed mode disabled - too resource intensive)
    Chrome process cleanup is handled automatically via _tracked_service_pids.
    """
    # 鍚姩鏂拌繛鎺ュ墠鍏堟竻鐞嗘墍鏈夎拷韪腑鐨勬棫 Chrome 杩涚▼锛岄槻姝㈠兊灏歌繘绋嬬Н绱?
    _kill_all_tracked_chromes()

    modes = [headless]  # 鍙皾璇?headless锛屼笉鍐嶈嚜鍔?fallback 鍒?headed(鑺傜渷璧勬簮)

    last_error = None
    for idx, mode in enumerate(modes, start=1):
        q = queue.Queue(maxsize=1000)
        scraper = DouyinCDPScraper(web_rid, q, headless=mode)
        thread = threading.Thread(target=scraper.start, daemon=True)
        thread.start()

        got_data = False
        try:
            await callback({
                "event": "status",
                "status": "connecting",
                "message": f"CDP attempt {idx}/{len(modes)} ({'headless' if mode else 'headed'})",
            })

            while thread.is_alive():
                while True:
                    try:
                        evt = q.get_nowait()
                    except queue.Empty:
                        break

                    if evt.get("event") in ("chat", "viewer_join", "gift"):
                        got_data = True
                    if evt.get("event") == "error":
                        last_error = evt.get("message")
                    await callback(evt)

                await asyncio.sleep(0.1)  # 10Hz(鍘?20Hz)

            # Drain any remaining events after thread exits
            while True:
                try:
                    evt = q.get_nowait()
                except queue.Empty:
                    break
                if evt.get("event") in ("chat", "viewer_join", "gift"):
                    got_data = True
                if evt.get("event") == "error":
                    last_error = evt.get("message")
                await callback(evt)

        finally:
            scraper.stop()

        if got_data:
            return

        # No data on this attempt: try next mode
        if idx < len(modes):
            await callback({
                "event": "status",
                "status": "connecting",
                "message": "No live frames captured, retrying with alternate browser mode...",
            })

    # Final fallback: JS-level interception (some environments decode better via this path)
    await callback({
        "event": "status",
        "status": "connecting",
        "message": "CDP retries exhausted, trying Selenium JS interception fallback...",
    })
    try:
        from douyin_selenium import stream_douyin_selenium

        got_data = False

        async def _fallback_cb(evt: dict):
            nonlocal got_data
            if evt.get("event") in ("chat", "viewer_join", "gift"):
                got_data = True
            await callback(evt)

        await asyncio.wait_for(stream_douyin_selenium(web_rid, _fallback_cb), timeout=45)
        if got_data:
            return
    except Exception as exc:
        last_error = str(exc)

    raise RuntimeError(last_error or "No live frames captured from Douyin after retries and fallback")


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    room = sys.argv[1] if len(sys.argv) > 1 else "646454278948"
    count = 0

    async def on_evt(evt):
        global count
        count += 1
        et = evt.get("event", "?")
        if et == "status":
            print(f">> {evt.get('message')}")
        elif et == "chat":
            print(f"[CHAT] {evt['user']}: {evt['text']}")
        elif et == "viewer_join":
            print(f"[JOIN] {evt['user']}")
        elif et == "error":
            print(f"[ERR] {evt.get('message')}")
        else:
            print(f"[{et}]")
        if count >= 50:
            raise KeyboardInterrupt

    async def main():
        try:
            await asyncio.wait_for(stream_douyin_cdp(room, on_evt, headless=True), timeout=60)
        except (KeyboardInterrupt, asyncio.TimeoutError):
            print(f"\nDone. {count} events.")

    asyncio.run(main())
