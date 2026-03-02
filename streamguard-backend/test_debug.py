"""Debug: figure out exactly what Douyin needs for WebSocket."""
import requests, json, re, time, random

ROOM = "646454278948"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

sess = requests.Session()
sess.headers.update({
    "User-Agent": UA,
    "Referer": "https://live.douyin.com/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
})

# Step 1: visit main page to get cookies
r1 = sess.get("https://live.douyin.com", timeout=15)
print(f"[1] Main page cookies: {list(sess.cookies.get_dict().keys())}")

# Step 2: visit the room page
r2 = sess.get(f"https://live.douyin.com/{ROOM}", timeout=15)
all_cookies = sess.cookies.get_dict()
print(f"[2] After room page cookies: {list(all_cookies.keys())}")
print(f"    ttwid: {'yes' if 'ttwid' in all_cookies else 'no'}")
print(f"    __ac_nonce: {'yes' if '__ac_nonce' in all_cookies else 'no'}")
print(f"    msToken: {'yes' if 'msToken' in all_cookies else 'no'}")

# Step 3: API call
api = (
    "https://live.douyin.com/webcast/room/web/enter/"
    f"?aid=6383&app_name=douyin_web&live_id=1&device_platform=web"
    f"&language=zh-CN&enter_from=web_live&cookie_enabled=true"
    f"&screen_width=1920&screen_height=1080&browser_language=zh-CN"
    f"&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
    f"&web_rid={ROOM}"
)
r3 = sess.get(api, timeout=15)
data = r3.json()
room_list = data.get("data", {}).get("data", [])
if room_list:
    room = room_list[0]
    internal_id = room.get("id_str", "")
    print(f"[3] Internal room_id: {internal_id}")
    print(f"    Status: {room.get('status')} (2=live)")
    print(f"    Title: {room.get('title')}")
else:
    internal_id = ROOM
    print(f"[3] No room data, using web_rid as fallback")

# Step 4: Try fetch endpoint (HTTP polling for messages)
fetch_url = (
    "https://live.douyin.com/webcast/im/fetch/"
    f"?aid=6383&app_name=douyin_web&live_id=1&device_platform=web"
    f"&language=zh-CN&cookie_enabled=true"
    f"&screen_width=1920&screen_height=1080&browser_language=zh-CN"
    f"&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
    f"&room_id={internal_id}&identity=audience"
    f"&did_rule=3&endpoint=live_pc"
    f"&user_unique_id={random.randint(10**15, 10**16 - 1)}"
)
r4 = sess.get(fetch_url, timeout=15)
print(f"[4] Fetch endpoint: status={r4.status_code}, content-type={r4.headers.get('content-type','?')}, len={len(r4.content)}")

# Step 5: Build cookie string for WebSocket
cookie_str = "; ".join(f"{k}={v}" for k, v in all_cookies.items())
print(f"\n[5] Cookie string for WS: {cookie_str[:100]}...")

# Step 6: Try multiple WS hosts
import asyncio
import websockets

uid = str(random.randint(10**15, 10**16 - 1))
ts = str(int(time.time()))

WS_HOSTS = [
    "webcast5-ws-web-lf.douyin.com",
    "webcast3-ws-web-lf.douyin.com",
    "webcast5-ws-web-hl.douyin.com",
    "webcast3-ws-web-hl.douyin.com",
]

async def try_ws(host):
    url = (
        f"wss://{host}/webcast/im/push/v2/"
        f"?app_name=douyin_web&version_code=180800&webcast_sdk_version=1.0.14"
        f"&update_version_code=1.0.14&compress=gzip"
        f"&host=https://live.douyin.com&aid=6383&live_id=1&did_rule=3"
        f"&endpoint=live_pc&support_wrds=1&im_path=/webcast/im/fetch/"
        f"&user_unique_id={uid}&device_platform=web&cookie_enabled=true"
        f"&screen_width=1920&screen_height=1080&browser_language=zh-CN"
        f"&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
        f"&browser_online=true&tz_name=Asia/Shanghai&identity=audience"
        f"&room_id={internal_id}&heartbeatDuration=0"
    )
    headers_ws = {
        "User-Agent": UA,
        "Cookie": cookie_str,
        "Origin": "https://live.douyin.com",
        "Referer": f"https://live.douyin.com/{ROOM}",
    }
    try:
        async with websockets.connect(
            url,
            additional_headers=headers_ws,
            open_timeout=10,
            max_size=None,
        ) as ws:
            print(f"  [{host}] CONNECTED!")
            # Try to read one message
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=5)
                print(f"  [{host}] Got message: {len(msg)} bytes (type={'binary' if isinstance(msg, bytes) else 'text'})")
                return True
            except asyncio.TimeoutError:
                print(f"  [{host}] Connected but no messages in 5s")
                return True
    except Exception as e:
        err_str = str(e)
        if len(err_str) > 100:
            err_str = err_str[:100] + "..."
        print(f"  [{host}] FAILED: {err_str}")
        return False

async def main():
    print(f"\n[6] Testing WebSocket hosts with room_id={internal_id}:")
    for host in WS_HOSTS:
        ok = await try_ws(host)
        if ok:
            print(f"\n>>> Working host: {host}")
            break

asyncio.run(main())
