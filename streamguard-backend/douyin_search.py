"""
Douyin Live Room Search  (抖音直播搜索爬虫)

三级降级策略：
  Level 1  httpx + 页面内嵌 JSON（无需启动 Chrome，最快）
  Level 2  Selenium + CDP Network.getResponseBody 截获 API 响应（可靠）
  Level 3  Selenium + DOM href/JS 变量 兜底
"""

import asyncio
import json
import os
import re
import subprocess
import time
import urllib.parse
from typing import Optional

import httpx

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)

def _get_chrome_major_version() -> int:
    """读取本机 Chrome 主版本号，供 undetected-chromedriver 使用。"""
    import winreg
    paths = [
        (winreg.HKEY_LOCAL_MACHINE,
         r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Google Chrome"),
        (winreg.HKEY_LOCAL_MACHINE,
         r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Google Chrome"),
        (winreg.HKEY_CURRENT_USER,
         r"Software\Google\Chrome\BLBeacon"),
    ]
    for hive, path in paths:
        try:
            with winreg.OpenKey(hive, path) as key:
                ver = winreg.QueryValueEx(key, "Version")[0]
                return int(ver.split(".")[0])
        except Exception:
            pass
    # 注册表找不到，尝试 chrome.exe --version
    try:
        out = subprocess.check_output(
            ["chrome", "--version"], stderr=subprocess.DEVNULL, text=True, timeout=5
        )
        return int(out.strip().split()[-1].split(".")[0])
    except Exception:
        pass
    return 0  # 返回 0 让 uc 自动检测

_HEADERS = {
    "User-Agent": _UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.douyin.com/",
    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

# ---------------------------------------------------------------------------
# 结果缓存（关键词 → 直播间列表，TTL = 2 min）
# ---------------------------------------------------------------------------
_search_cache: dict[str, tuple[list, float]] = {}
_SEARCH_TTL = 120  # seconds


# ---------------------------------------------------------------------------
# 通用解析辅助
# ---------------------------------------------------------------------------
def _parse_room_from_item(item: dict) -> Optional[dict]:
    """
    从 API item dict 提取直播间字段。
    抖音 /aweme/v1/web/live/search/ 返回以 user 为主体的对象：
    {
      uid, short_id, nickname,          <- 主播信息
      room_id,                          <- 直播间 ID（直接在根级别）
      room_cover: {url_list: [...]},    <- 封面图
      cover_url: {url_list: [...]},     <- 备用封面
      item_list: [{desc, statistics: {watch_count}, ...}],  <- 近期作品/直播摘要
      custom_verify,                    <- 认证信息
      ...
    }
    """
    if not isinstance(item, dict):
        return None

    # ---- room_id ----
    # 在这个 API 中 room_id 直接在根字段
    room_id = str(item.get("room_id") or "")
    if not room_id or room_id == "0":
        # 兜底：从 item_list 或嵌套字段里找
        for url_key in ("share_url", "web_url", "permalink_url"):
            u = item.get(url_key) or ""
            m = re.search(r"/live/(\d{6,})", u) or re.search(r"room_id=(\d{6,})", u)
            if m:
                room_id = m.group(1)
                break
    if not room_id or room_id == "0":
        return None

    # ---- anchor_name ----
    anchor_name = (
        item.get("nickname")
        or item.get("unique_id")
        or ""
    )

    # ---- room_title ----
    # item_list[0].desc 通常是最近直播/视频标题
    item_list = item.get("item_list") or []
    first_item = item_list[0] if item_list else {}
    room_title = (
        first_item.get("desc")
        or item.get("custom_verify")   # 认证描述（如"水果 · 供应商"）
        or (f"{anchor_name}的直播间" if anchor_name else "直播间")
    )

    # ---- viewer_count ----
    # item_list[0].statistics.watch_count 或 play_count
    stats = first_item.get("statistics") or {}
    viewer_count = int(
        stats.get("watch_count") or stats.get("play_count")
        or item.get("user_count") or 0
    )

    # ---- thumbnail ----
    def _pick_url(field) -> str:
        if isinstance(field, dict):
            urls = field.get("url_list") or []
            return urls[0] if urls else ""
        return ""

    thumbnail_url = (
        _pick_url(item.get("room_cover"))
        or _pick_url(item.get("cover_url"))
        or _pick_url(first_item.get("video", {}).get("cover", {}))
        or ""
    )

    return {
        "room_id": room_id,
        "anchor_name": anchor_name,
        "room_title": room_title,
        "viewer_count": viewer_count,
        "thumbnail_url": thumbnail_url,
        "status": "living",
        "recommendation_score": round(0.5 + min(viewer_count / 100_000, 0.45), 2),
    }


def _extract_rooms_from_json(node, _seen: set = None, _depth: int = 0) -> list:
    """
    递归遍历任意 JSON 树，提取包含 room_id 字段的直播间数据。
    """
    if _seen is None:
        _seen = set()
    rooms = []
    if _depth > 15:
        return rooms

    if isinstance(node, dict):
        # 看起来像直播间 item
        if node.get("room_id") or node.get("live_room_id"):
            room = _parse_room_from_item(node)
            if room and room["room_id"] not in _seen:
                _seen.add(room["room_id"])
                rooms.append(room)
                return rooms  # 不再递归进去
        # 优先遍历可能含结果的 key
        for key in ("data", "lives", "items", "results", "list", "room_list",
                    "awemeList", "aweme_list", "search_live_list"):
            if key in node:
                rooms.extend(_extract_rooms_from_json(node[key], _seen, _depth + 1))
        for v in node.values():
            if isinstance(v, (dict, list)):
                rooms.extend(_extract_rooms_from_json(v, _seen, _depth + 1))

    elif isinstance(node, list):
        for item in node:
            rooms.extend(_extract_rooms_from_json(item, _seen, _depth + 1))

    return rooms


# ---------------------------------------------------------------------------
# Level 1: httpx 快速通道
# ---------------------------------------------------------------------------
async def _search_via_httpx(keyword: str, max_results: int) -> list:
    """
    请求抖音搜索页面 HTML，解析页面内嵌的 JSON 数据（RENDER_DATA / __NEXT_DATA__ 等）。
    不需要启动浏览器，通常 3~8 秒内完成。
    若抖音要求滑块验证/跳转登录，则返回空列表，交由 Level 2 处理。
    """
    encoded_kw = urllib.parse.quote(keyword)
    search_url = f"https://www.douyin.com/search/{encoded_kw}?type=live"

    async with httpx.AsyncClient(
        headers=_HEADERS,
        follow_redirects=True,
        timeout=12.0,
        verify=False,  # 忽略 SSL 证书问题
    ) as client:
        resp = await client.get(search_url)
        html = resp.text

    rooms: list = []

    # 尝试多种内嵌 JSON 格式
    patterns = [
        # 抖音 App 渲染数据（URL-encoded JSON）
        r'<script id="RENDER_DATA"[^>]*>(.*?)</script>',
        # Next.js 初始数据
        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
        # Remix 上下文
        r'window\.__remixContext\s*=\s*(\{.*?\});\s*</script>',
        # 通用 window.__INITIAL_STATE__
        r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});\s*(?:window\.|</)',
    ]

    for pat in patterns:
        m = re.search(pat, html, re.DOTALL)
        if not m:
            continue
        try:
            raw_text = m.group(1).strip()
            # RENDER_DATA 通常是 URL-encoded
            if "%" in raw_text[:20]:
                raw_text = urllib.parse.unquote(raw_text)
            data = json.loads(raw_text)
            found = _extract_rooms_from_json(data)
            if found:
                rooms = found
                break
        except Exception as e:
            print(f"[search-httpx] 解析 JSON 失败 ({pat[:30]}…): {e}")
            continue

    if not rooms:
        print("[search-httpx] 未从页面内嵌数据中找到直播间（可能触发了反爬验证）")

    return rooms[:max_results]


# ---------------------------------------------------------------------------
# Level 2 & 3: Selenium（CDP 截获 + DOM 兜底）
# ---------------------------------------------------------------------------
def _load_douyin_cookies() -> list:
    """
    从 douyin_cookies.json 加载 Cookie（用户手动导出），格式为 Netscape/JSON 数组。
    文件不存在时返回空列表。
    """
    cookie_file = os.path.join(os.path.dirname(__file__), "douyin_cookies.json")
    if not os.path.exists(cookie_file):
        return []
    try:
        with open(cookie_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "cookies" in data:
            return data["cookies"]
    except Exception as e:
        print(f"[search] Cookie 文件读取失败: {e}")
    return []


def _search_via_subprocess(keyword: str, max_results: int) -> list:
    """
    在独立子进程中执行 _search_via_selenium，避免 uc 的 Chrome 进程
    干扰 uvicorn 主进程（uc 使用 use_subprocess=True，可能导致信号冲突）。
    子进程将结果以 JSON 写入 stdout，主进程读取。
    """
    import sys
    script_dir = os.path.dirname(os.path.abspath(__file__))
    worker_code = f"""
import sys, json, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')
os.chdir({repr(script_dir)})
sys.path.insert(0, {repr(script_dir)})
from douyin_search import _search_via_selenium
rooms = _search_via_selenium({repr(keyword)}, {max_results})
# 输出一个特殊标记 + JSON 结果
print("\\n__SEARCH_RESULT__")
print(json.dumps(rooms, ensure_ascii=False))
"""
    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", "-c", worker_code],
            capture_output=True,
            text=True,
            timeout=90,
            cwd=script_dir,
            encoding="utf-8",
            errors="replace",
        )
        output = proc.stdout or ""
        stderr = proc.stderr or ""
        if stderr:
            # 只打印关键的 stderr 行（过滤 uc 的 __del__ 警告）
            for line in stderr.split("\n"):
                if line.strip() and "OSError" not in line and "__del__" not in line:
                    print(f"[search-subprocess] {line.strip()}")

        # 从 stdout 中提取 JSON 结果
        marker = "__SEARCH_RESULT__"
        idx = output.find(marker)
        if idx >= 0:
            json_str = output[idx + len(marker):].strip()
            rooms = json.loads(json_str)
            print(f"[search-subprocess] 子进程返回 {len(rooms)} 个直播间")
            return rooms
        else:
            # 打印部分 stdout 帮助调试
            print(f"[search-subprocess] 未找到结果标记, stdout_len={len(output)}")
            if output:
                for line in output.split("\n")[-10:]:
                    if line.strip():
                        print(f"[search-subprocess] stdout: {line.strip()[:100]}")
    except subprocess.TimeoutExpired:
        print("[search-subprocess] 子进程超时 (90s)")
    except Exception as e:
        print(f"[search-subprocess] 子进程执行失败: {type(e).__name__}: {e}")

    return []


def _search_via_selenium(keyword: str, max_results: int, timeout_sec: int = 30) -> list:
    """
    Selenium 抖音直播搜索（多策略）。

    优先使用 undetected-chromedriver (uc)，它能绕过抖音的反自动化检测，
    使 API 返回真实数据。若 uc 不可用则回退到标准 selenium + CDP 性能日志。

    数据获取通道（按优先级）：
      A1  JS XHR/fetch 拦截器（页面自身请求被 hook 后存入 JS 变量）
      A2  CDP 性能日志（仅标准 selenium 可用）
      B   浏览器内 fetch（同源请求，携带 cookie）
      C   JS 全局变量（RENDER_DATA / __INITIAL_STATE__）
      D   DOM href 链接扫描（兜底）
    """
    from selenium.common.exceptions import TimeoutException

    encoded_kw = urllib.parse.quote(keyword)
    search_url = f"https://www.douyin.com/search/{encoded_kw}?type=live"

    driver = None
    rooms: list = []
    seen_ids: set = set()
    use_uc = False          # 标记是否成功使用了 uc
    has_perf_log = False    # 标记是否可用 CDP 性能日志

    # =========== JS 拦截器（页面级 XHR/fetch hook）===========
    # 使用 __dyInterceptInstalled 防止重复安装
    INTERCEPT_JS = r"""
    if (!window.__dyInterceptInstalled) {
        window.__dySearchResults = [];
        window.__dyCaptured = false;
        window.__dyInterceptInstalled = true;

        var _origOpen = XMLHttpRequest.prototype.open;
        var _origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return _origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function() {
            var self = this;
            self.addEventListener('load', function() {
                if (self._url && self._url.indexOf('live/search') > -1
                    && self._url.indexOf('aweme') > -1) {
                    try {
                        var d = JSON.parse(self.responseText);
                        if (d && d.data && d.data.length > 0) {
                            window.__dySearchResults.push(d);
                            window.__dyCaptured = true;
                        }
                    } catch(e) {}
                }
            });
            return _origSend.apply(this, arguments);
        };

        var _origFetch = window.fetch;
        window.fetch = function(input, init) {
            var url = typeof input === 'string' ? input : (input.url || '');
            return _origFetch.apply(this, arguments).then(function(resp) {
                if (url.indexOf('live/search') > -1 && url.indexOf('aweme') > -1) {
                    resp.clone().json().then(function(d) {
                        if (d && d.data && d.data.length > 0) {
                            window.__dySearchResults.push(d);
                            window.__dyCaptured = true;
                        }
                    }).catch(function(){});
                }
                return resp;
            });
        };
        console.log('[dy-intercept] installed');
    }
    """

    try:
        # ==================================================================
        # 阶段 1：初始化浏览器（uc 优先 → 标准 selenium 回退）
        # ==================================================================
        # 默认无头模式（不弹出浏览器窗口），可通过环境变量 DOUYIN_SHOW_BROWSER=1 关闭以便调试
        _show_browser = os.environ.get("DOUYIN_SHOW_BROWSER", "0").strip() in ("1", "true", "yes")
        _headless = not _show_browser

        try:
            import undetected_chromedriver as uc
            chrome_ver = _get_chrome_major_version()
            print(f"[search-selenium] 尝试 undetected-chromedriver, Chrome v{chrome_ver}, headless={_headless}")

            uc_opts = uc.ChromeOptions()
            uc_opts.add_argument("--no-sandbox")
            uc_opts.add_argument("--disable-dev-shm-usage")
            uc_opts.add_argument("--mute-audio")
            uc_opts.add_argument("--window-size=1280,900")
            uc_opts.add_argument("--log-level=3")
            if _headless:
                uc_opts.add_argument("--disable-gpu")

            uc_kwargs = dict(options=uc_opts, headless=_headless, use_subprocess=True)
            if chrome_ver > 0:
                uc_kwargs["version_main"] = chrome_ver

            driver = uc.Chrome(**uc_kwargs)
            driver.set_page_load_timeout(40)   # uc 给更宽裕的超时
            use_uc = True
            print("[search-selenium] uc 启动成功 ✓")
        except Exception as e:
            print(f"[search-selenium] uc 失败 ({type(e).__name__}: {e}), 回退到标准 selenium")
            driver = None

        if driver is None:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service

            # 查找 chromedriver
            chromedriver_path = None
            try:
                from douyin_cdp import _get_chromedriver_path
                chromedriver_path = _get_chromedriver_path()
            except Exception:
                pass
            if not chromedriver_path:
                import pathlib, glob as _glob
                wdm_pat = str(pathlib.Path.home() / ".wdm" / "drivers" / "chromedriver" / "**" / "chromedriver.exe")
                hits = sorted(_glob.glob(wdm_pat, recursive=True), reverse=True)
                if hits:
                    chromedriver_path = hits[0]
            if not chromedriver_path:
                import shutil
                chromedriver_path = shutil.which("chromedriver") or "chromedriver"
            print(f"[search-selenium] 标准 selenium, driver={chromedriver_path}")

            opts = Options()
            # 无头模式（默认开启，DOUYIN_SHOW_BROWSER=1 时关闭）
            if _headless:
                opts.add_argument("--headless=new")
                opts.add_argument("--disable-gpu")
            else:
                opts.add_argument("--start-minimized")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
            opts.add_argument("--mute-audio")
            opts.add_argument("--window-size=1280,900")
            opts.add_argument("--log-level=3")
            opts.add_argument("--disable-logging")
            opts.add_argument(f"--user-agent={_UA}")
            opts.add_argument("--disable-blink-features=AutomationControlled")
            opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
            opts.add_experimental_option("useAutomationExtension", False)
            opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

            try:
                service = Service(chromedriver_path, log_output=subprocess.DEVNULL)
            except TypeError:
                service = Service(chromedriver_path)

            driver = webdriver.Chrome(service=service, options=opts)
            driver.set_page_load_timeout(25)
            has_perf_log = True

            # CDP 反检测
            try:
                driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                    "source": """
                        Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
                        Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
                        window.chrome={runtime:{}};
                    """
                })
            except Exception:
                pass
            try:
                driver.execute_cdp_cmd("Network.enable", {})
            except Exception:
                pass
            # 标准 selenium: 用 CDP 持久注册拦截器（每次导航自动执行）
            try:
                driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                    "source": INTERCEPT_JS
                })
                print("[search-selenium] JS 拦截器已 CDP 持久注册")
            except Exception:
                pass

        # ==================================================================
        # 阶段 2：导航到搜索页
        # ==================================================================
        print(f"[search-selenium] 导航: {search_url}")
        try:
            driver.get(search_url)
        except TimeoutException:
            print("[search-selenium] 页面加载超时（继续处理）")
        except Exception as nav_err:
            # uc 可能因 Chrome 版本不兼容而窗口崩溃
            print(f"[search-selenium] 导航异常: {type(nav_err).__name__}: {nav_err}")
            if use_uc:
                print("[search-selenium] uc 导航失败，尝试回退到标准 selenium...")
                try:
                    driver.quit()
                except Exception:
                    pass
                driver = None
                use_uc = False
                # 用标准 selenium 重新启动
                from selenium import webdriver
                from selenium.webdriver.chrome.options import Options
                from selenium.webdriver.chrome.service import Service
                chromedriver_path = None
                try:
                    from douyin_cdp import _get_chromedriver_path
                    chromedriver_path = _get_chromedriver_path()
                except Exception:
                    pass
                if not chromedriver_path:
                    import pathlib, glob as _glob
                    wdm_pat = str(pathlib.Path.home() / ".wdm" / "drivers" / "chromedriver" / "**" / "chromedriver.exe")
                    hits = sorted(_glob.glob(wdm_pat, recursive=True), reverse=True)
                    if hits:
                        chromedriver_path = hits[0]
                if not chromedriver_path:
                    import shutil
                    chromedriver_path = shutil.which("chromedriver") or "chromedriver"
                opts = Options()
                if os.environ.get("DOUYIN_HEADLESS", "").strip() in ("1", "true", "yes"):
                    opts.add_argument("--headless")
                    opts.add_argument("--disable-gpu")
                else:
                    opts.add_argument("--start-minimized")
                opts.add_argument("--no-sandbox")
                opts.add_argument("--disable-dev-shm-usage")
                opts.add_argument("--mute-audio")
                opts.add_argument("--window-size=1280,900")
                opts.add_argument("--log-level=3")
                opts.add_argument("--disable-logging")
                opts.add_argument(f"--user-agent={_UA}")
                opts.add_argument("--disable-blink-features=AutomationControlled")
                opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
                opts.add_experimental_option("useAutomationExtension", False)
                opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})
                try:
                    service = Service(chromedriver_path, log_output=subprocess.DEVNULL)
                except TypeError:
                    service = Service(chromedriver_path)
                driver = webdriver.Chrome(service=service, options=opts)
                driver.set_page_load_timeout(25)
                has_perf_log = True
                try:
                    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                        "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
                    })
                    driver.execute_cdp_cmd("Network.enable", {})
                    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": INTERCEPT_JS})
                except Exception:
                    pass
                print("[search-selenium] 回退到标准 selenium，重新导航")
                try:
                    driver.get(search_url)
                except TimeoutException:
                    print("[search-selenium] 页面加载超时（继续处理）")
            else:
                raise

        time.sleep(3)

        # 在页面执行上下文注入拦截器（uc 没有 CDP 持久注册，必须 execute_script）
        try:
            driver.execute_script(INTERCEPT_JS)
        except Exception:
            pass

        # 检查页面状态
        try:
            title = driver.title or ""
            cur = driver.current_url or ""
            print(f"[search-selenium] 页面: title={title[:50]}, url={cur[:80]}")
        except Exception:
            pass

        # 如果被重定向（不在搜索页），强制 JS 导航
        try:
            cur = driver.current_url or ""
            if "search" not in cur:
                print("[search-selenium] 被重定向，JS 强制导航")
                driver.execute_script(f"location.href='{search_url}';")
                time.sleep(4)
                try:
                    driver.execute_script(INTERCEPT_JS)
                except Exception:
                    pass
        except Exception:
            pass

        # 点击「直播」标签
        try:
            clicked = driver.execute_script("""
                var els = document.querySelectorAll('[class*="tab"], [data-e2e], a, span');
                for (var i = 0; i < els.length; i++) {
                    if ((els[i].textContent||'').trim() === '直播') {
                        els[i].click(); return true;
                    }
                }
                return false;
            """)
            if clicked:
                print("[search-selenium] 点击「直播」标签 ✓")
                time.sleep(3)
                # 重新注入拦截器（标签切换触发新 fetch，此时拦截器已安装可以捕获）
                try:
                    driver.execute_script(INTERCEPT_JS)
                except Exception:
                    pass
                # uc 模式下标签切换后等更久，让 API 请求完成
                if use_uc:
                    time.sleep(3)
        except Exception:
            pass

        # uc 模式：尝试滚动触发额外 API 请求（拦截器此时已安装）
        if use_uc:
            try:
                driver.execute_script("window.scrollTo(0, 600);")
                time.sleep(2)
                driver.execute_script("window.scrollTo(0, 0);")
                time.sleep(1)
            except Exception:
                pass

        # ==================================================================
        # 阶段 3：等待循环 — 多通道扫描
        # ==================================================================
        deadline = time.time() + min(timeout_sec, 25)
        _checked_req_ids: set = set()

        while time.time() < deadline and not rooms:
            # --- 通道 A1: JS 拦截器 ---
            try:
                if driver.execute_script("return window.__dyCaptured||false"):
                    for d in (driver.execute_script("return window.__dySearchResults||[]") or []):
                        p = _extract_rooms_from_json(d, seen_ids)
                        if p:
                            rooms.extend(p)
                    if rooms:
                        print(f"[search-selenium] JS 拦截器 → {len(rooms)} 个直播间 ✓")
                        break
            except Exception:
                pass

            # --- 通道 A2: CDP 性能日志（仅标准 selenium）---
            if has_perf_log and not rooms:
                try:
                    for entry in driver.get_log("performance"):
                        try:
                            msg = json.loads(entry["message"])["message"]
                            if msg.get("method") != "Network.responseReceived":
                                continue
                            resp_url = msg["params"]["response"]["url"]
                            req_id = msg["params"]["requestId"]
                            if ("live/search" not in resp_url or "aweme" not in resp_url
                                    or req_id in _checked_req_ids):
                                continue
                            _checked_req_ids.add(req_id)
                            body_obj = driver.execute_cdp_cmd(
                                "Network.getResponseBody", {"requestId": req_id})
                            body_text = body_obj.get("body", "")
                            print(f"[search-selenium] CDP 日志: len={len(body_text)}")
                            api_data = json.loads(body_text)
                            parsed = _extract_rooms_from_json(api_data, seen_ids)
                            if parsed:
                                rooms.extend(parsed)
                                print(f"[search-selenium] CDP → {len(parsed)} 个直播间 ✓")
                            else:
                                print(f"[search-selenium] CDP data[]={len(api_data.get('data',[]))}")
                        except Exception:
                            pass
                except Exception:
                    pass

            if not rooms:
                # --- 通道 A3: 快速 DOM 链接检查 ---
                try:
                    link_count = driver.execute_script(
                        'return document.querySelectorAll(\'a[href*="/live/"]\').length;')
                    if link_count and link_count > 0:
                        print(f"[search-selenium] 等待循环中发现 {link_count} 条 DOM 链接，跳出")
                        break
                except Exception:
                    pass
                time.sleep(1)

        # --- Step B: 浏览器内 fetch ---
        if not rooms:
            print("[search-selenium] Step B: 浏览器内 fetch...")
            try:
                cookies_js = driver.execute_script("""
                    var result = {};
                    document.cookie.split(';').forEach(function(c) {
                        var parts = c.trim().split('=');
                        result[parts[0]] = parts.slice(1).join('=');
                    });
                    return result;
                """)
                print(f"[search-selenium] 页面 Cookie keys: {list((cookies_js or {}).keys())[:10]}")

                # 构造与页面一致的 API URL（页面加载时会产生正确的参数）
                api_url = (
                    "https://www.douyin.com/aweme/v1/web/live/search/"
                    "?device_platform=webapp&aid=6383&channel=channel_pc_web"
                    "&version_code=190600&version_name=19.6.0"
                    "&browser_language=zh-CN&browser_platform=Win32"
                    "&browser_name=Chrome&browser_version=145.0.0.0"
                    f"&keyword={urllib.parse.quote(keyword)}"
                    "&count=20&cursor=0"
                    "&search_source=tab_live&query_correct_type=1&is_filter_search=0"
                    "&from_group_id=&channel_id=4&live_tag_type=0&request_tag_from=search"
                )
                raw_result = driver.execute_async_script(
                    """
                    var url = arguments[0];
                    var done = arguments[arguments.length - 1];
                    fetch(url, {
                        method: 'GET',
                        credentials: 'include',
                        mode: 'cors',
                        headers: {
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'zh-CN,zh;q=0.9',
                            'Referer': 'https://www.douyin.com/search/',
                            'sec-ch-ua': '"Chromium";v="145", "Not;A=Brand";v="99"',
                            'sec-ch-ua-mobile': '?0',
                            'sec-ch-ua-platform': '"Windows"',
                            'sec-fetch-site': 'same-origin',
                            'sec-fetch-mode': 'cors',
                            'sec-fetch-dest': 'empty',
                        }
                    })
                    .then(function(r){
                        return r.text().then(function(t){
                            done({status: r.status, body: t});
                        });
                    })
                    .catch(function(e){ done({error: e.toString()}); });
                    """,
                    api_url,
                )
                if raw_result and raw_result.get("body"):
                    status = raw_result.get("status", "?")
                    body_preview = raw_result["body"][:300]
                    print(f"[search-selenium] Step B HTTP {status}: {body_preview}")
                    try:
                        data = json.loads(raw_result["body"])
                        parsed = _extract_rooms_from_json(data, seen_ids)
                        if parsed:
                            rooms.extend(parsed)
                            print(f"[search-selenium] Step B 找到 {len(parsed)} 个直播间")
                        else:
                            raw_data = data.get("data", [])
                            print(f"[search-selenium] Step B data 数组长度: {len(raw_data)}")
                    except Exception as e:
                        print(f"[search-selenium] Step B JSON 解析失败: {e}")
            except Exception as e:
                print(f"[search-selenium] Step B 失败: {e}")

        # ---- Step C: JS 变量提取 ----
        if not rooms:
            print("[search-selenium] Step C: 尝试从 JS 变量提取...")
            try:
                page_data = driver.execute_script("""
                    try {
                        var rd = document.getElementById('RENDER_DATA');
                        if (rd && rd.textContent) {
                            return JSON.parse(decodeURIComponent(rd.textContent));
                        }
                    } catch(e) {}
                    return window.__INITIAL_STATE__
                        || (window.__remixContext && window.__remixContext.state)
                        || window.__NEXT_DATA__
                        || null;
                """)
                if page_data:
                    found = _extract_rooms_from_json(page_data, seen_ids)
                    if found:
                        rooms.extend(found)
                        print(f"[search-selenium] Step C 找到 {len(found)} 个直播间")
            except Exception as e:
                print(f"[search-selenium] Step C JS 提取失败: {e}")

        # ---- Step D: DOM 深度扫描（直播卡片提取）----
        if not rooms:
            print("[search-selenium] Step D: DOM 深度扫描...")
            try:
                links_data = driver.execute_script(r"""
                    var results = [];
                    var seen = {};

                    // 方法1: 从 a[href*="/live/"] 链接出发
                    var links = document.querySelectorAll('a[href*="/live/"]');
                    for (var i = 0; i < links.length; i++) {
                        var href = links[i].href || '';
                        var m = href.match(/\/live\/(\d{6,})/);
                        if (!m || seen[m[1]]) continue;
                        seen[m[1]] = 1;

                        // 向上找到卡片容器（通常是有多个子元素的父级）
                        var card = links[i];
                        for (var up = 0; up < 8; up++) {
                            if (!card.parentElement) break;
                            card = card.parentElement;
                            // 卡片容器通常有图片和多行文本
                            if (card.querySelectorAll('img').length > 0
                                && card.querySelectorAll('a').length >= 1
                                && card.offsetHeight > 100) break;
                        }

                        // 提取封面图（取最大的图片）
                        var imgs = card.querySelectorAll('img');
                        var bestImg = '';
                        var maxArea = 0;
                        for (var j = 0; j < imgs.length; j++) {
                            var area = (imgs[j].naturalWidth || imgs[j].width || 0)
                                     * (imgs[j].naturalHeight || imgs[j].height || 0);
                            if (area > maxArea || (!bestImg && imgs[j].src)) {
                                if (area > maxArea) maxArea = area;
                                bestImg = imgs[j].src || '';
                            }
                        }

                        // 提取文本信息
                        var fullText = (card.innerText || '').trim();
                        var cardLinks = card.querySelectorAll('a');
                        var anchorName = '';
                        var roomTitle = '';

                        // 找主播名（通常是一个短链接文本，非数字开头）
                        for (var k = 0; k < cardLinks.length; k++) {
                            var lt = (cardLinks[k].innerText || '').trim();
                            if (lt && lt.length > 0 && lt.length < 30
                                && !/^\d/.test(lt) && lt !== '直播') {
                                if (!anchorName) anchorName = lt;
                                else if (!roomTitle && lt !== anchorName) roomTitle = lt;
                            }
                        }

                        // 从 span 中找可能的标题或观看人数
                        var spans = card.querySelectorAll('span, p, div');
                        var viewerText = '';
                        for (var s = 0; s < spans.length; s++) {
                            var st = (spans[s].innerText || '').trim();
                            if (!st) continue;
                            // 观看人数标记
                            if (/[\d.]+\s*万|在看|\d+人/.test(st)) {
                                if (!viewerText) viewerText = st;
                            }
                            // 可能的直播标题（比主播名更长的文本）
                            if (!roomTitle && st.length > 4 && st.length < 60
                                && st !== anchorName && !/^\d/.test(st)
                                && !/万|在看|人|关注|粉丝/.test(st)) {
                                roomTitle = st;
                            }
                        }

                        results.push({
                            room_id: m[1],
                            anchor_name: anchorName,
                            room_title: roomTitle,
                            viewer_text: viewerText,
                            full_text: fullText.substring(0, 300),
                            img: bestImg
                        });
                    }

                    // 方法2: 如果方法1没找到，尝试从所有 a[href] 中匹配
                    if (results.length === 0) {
                        var allLinks = document.querySelectorAll('a[href]');
                        for (var i = 0; i < allLinks.length; i++) {
                            var href = allLinks[i].href || '';
                            var m = href.match(/room_id=(\d{6,})/) || href.match(/\/live\/(\d{6,})/);
                            if (!m || seen[m[1]]) continue;
                            seen[m[1]] = 1;
                            var card = allLinks[i];
                            for (var up = 0; up < 6; up++) {
                                if (!card.parentElement) break;
                                card = card.parentElement;
                            }
                            var img = card.querySelector('img');
                            results.push({
                                room_id: m[1],
                                anchor_name: '',
                                room_title: '',
                                viewer_text: '',
                                full_text: (card.innerText || '').substring(0, 300),
                                img: img ? img.src : ''
                            });
                        }
                    }

                    return results;
                """)

                if links_data:
                    print(f"[search-selenium] Step D 找到 {len(links_data)} 条链接")
                    for item in links_data:
                        rid = str(item.get("room_id", ""))
                        if not rid or rid in seen_ids:
                            continue

                        anchor_name = item.get("anchor_name", "")
                        room_title = item.get("room_title", "")
                        viewer_text = item.get("viewer_text", "")
                        full_text = item.get("full_text", "")

                        # 如果 JS 没提取到名字/标题，从 full_text 中解析
                        if not anchor_name:
                            text_lines = [l.strip() for l in full_text.split("\n") if l.strip()]
                            # 过滤掉纯数字行和太短的行
                            name_candidates = [l for l in text_lines
                                               if len(l) > 1 and not l.isdigit()
                                               and "万" not in l and "在看" not in l]
                            if name_candidates:
                                anchor_name = name_candidates[0]
                            if not room_title and len(name_candidates) > 1:
                                room_title = name_candidates[1]

                        if not room_title:
                            room_title = f"{anchor_name}的直播间" if anchor_name else "直播间"

                        # 解析观看人数
                        viewer_count = 0
                        vt = viewer_text or full_text
                        vm = re.search(r"([\d.]+)\s*万", vt)
                        if vm:
                            viewer_count = int(float(vm.group(1)) * 10_000)
                        else:
                            vm = re.search(r"(\d+)\s*(?:在看|人气|观看|人)", vt)
                            if vm:
                                viewer_count = int(vm.group(1))

                        seen_ids.add(rid)
                        rooms.append({
                            "room_id": rid,
                            "anchor_name": anchor_name,
                            "room_title": room_title,
                            "viewer_count": viewer_count,
                            "thumbnail_url": item.get("img", ""),
                            "status": "living",
                            "recommendation_score": round(
                                0.5 + min(viewer_count / 100_000, 0.45), 2
                            ),
                        })
                        print(f"[search-selenium]   DOM: [{rid}] {anchor_name} | {room_title[:20]}")
            except Exception as e:
                print(f"[search-selenium] Step D DOM 扫描失败: {e}")

        return rooms[:max_results]

    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 公共入口
# ---------------------------------------------------------------------------
async def search_douyin_live_rooms(keyword: str, max_results: int = 12) -> dict:
    """
    搜索抖音直播间（三级降级）。

    返回:
    {
        "rooms": [...],
        "data_source": "httpx" | "selenium_cdp" | "selenium_dom" | "empty",
        "method_used": str,
        "cached": bool,
    }
    """
    keyword = keyword.strip()

    # 命中缓存
    cache_key = f"{keyword}:{max_results}"
    cached = _search_cache.get(cache_key)
    if cached and time.time() < cached[1]:
        print(f"[search] 缓存命中: '{keyword}'")
        rooms, _, source = cached[0], cached[1], cached[2] if len(cached) > 2 else "cache"
        return {"rooms": rooms, "data_source": source, "method_used": "cache", "cached": True}

    # Level 1: httpx
    try:
        print(f"[search] Level 1 httpx 搜索: '{keyword}'")
        rooms = await _search_via_httpx(keyword, max_results)
        if rooms:
            _search_cache[cache_key] = (rooms, time.time() + _SEARCH_TTL, "httpx")
            return {
                "rooms": rooms, "data_source": "httpx",
                "method_used": "httpx_embedded_json", "cached": False,
            }
    except Exception as e:
        print(f"[search] Level 1 httpx 失败: {e}")

    # Level 2 & 3: Selenium (在隔离子进程中运行，避免 uc 的 Chrome 影响 uvicorn)
    print(f"[search] Level 2/3 Selenium 搜索: '{keyword}'")
    rooms = await asyncio.to_thread(_search_via_subprocess, keyword, max_results)
    source = "selenium_cdp" if rooms else "empty"
    if rooms:
        _search_cache[cache_key] = (rooms, time.time() + _SEARCH_TTL, source)

    return {
        "rooms": rooms,
        "data_source": source,
        "method_used": "selenium_cdp_dom",
        "cached": False,
    }


def clear_search_cache(keyword: str = None):
    """手动清除搜索缓存（不传参则清除全部）"""
    if keyword:
        keys_to_del = [k for k in _search_cache if k.startswith(f"{keyword}:")]
        for k in keys_to_del:
            del _search_cache[k]
    else:
        _search_cache.clear()
    print(f"[search] 缓存已清除: {'all' if not keyword else keyword}")
