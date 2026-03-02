"""Quick test: can we connect to Douyin room 646454278948?"""
import requests, re, json
from urllib.parse import unquote

ROOM = "646454278948"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
headers = {"User-Agent": UA, "Referer": "https://live.douyin.com/"}

# Step 1 - get ttwid
r = requests.get("https://live.douyin.com", headers=headers, timeout=10)
cookies = dict(r.cookies)
ttwid = cookies.get("ttwid", "")
print(f"[1] ttwid: {'OK' if ttwid else 'MISSING'}")

# Step 2 - fetch room page
r2 = requests.get(f"https://live.douyin.com/{ROOM}", headers=headers, cookies=cookies, timeout=15)
print(f"[2] room page: status={r2.status_code} len={len(r2.text)}")

# Step 3 - parse RENDER_DATA
m = re.search(r'<script id="RENDER_DATA"[^>]*>([^<]+)</script>', r2.text)
if m:
    decoded = unquote(m.group(1))
    obj = json.loads(decoded)
    # Walk through keys to find room info
    for key, val in obj.items():
        if not isinstance(val, dict):
            continue
        # Try multiple possible structures
        room_info = val.get("roomInfo", {})
        if not room_info:
            room_info = val.get("initialState", {}).get("roomStore", {}).get("roomInfo", {})
        room = room_info.get("room", {}) if isinstance(room_info, dict) else {}
        if room and room.get("id_str"):
            print(f"[3] FOUND room data in key '{key}':")
            print(f"    id_str:   {room.get('id_str')}")
            print(f"    status:   {room.get('status')} (2=live, 4=offline)")
            print(f"    title:    {room.get('title', '?')}")
            owner = room.get("owner", {})
            print(f"    nickname: {owner.get('nickname', '?')}")
            # Get the web push info
            web_stream = room_info.get("web_stream_url", {})
            if web_stream:
                print(f"    has stream url: yes")
            break
    else:
        # Fallback: regex search for id_str
        all_ids = re.findall(r'"id_str"\s*:\s*"(\d+)"', decoded)
        print(f"[3] No structured room found, but id_str values: {all_ids[:5]}")
else:
    print("[3] No RENDER_DATA in page")
    ids = re.findall(r'"id_str"\s*:\s*"(\d+)"', r2.text)
    print(f"    regex id_str: {ids[:5]}")

# Step 4 - test the API endpoint
api = (
    "https://live.douyin.com/webcast/room/web/enter/"
    f"?aid=6383&app_name=douyin_web&live_id=1&device_platform=web"
    f"&language=zh-CN&enter_from=web_live&cookie_enabled=true"
    f"&screen_width=1920&screen_height=1080&browser_language=zh-CN"
    f"&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
    f"&web_rid={ROOM}"
)
try:
    r3 = requests.get(api, headers=headers, cookies=cookies, timeout=15)
    data = r3.json()
    print(f"[4] API: status_code={data.get('status_code')} data keys={list(data.get('data',{}).keys())}")
    room_data = data.get("data", {})
    if room_data:
        print(f"    room_data keys: {list(room_data.keys())[:10]}")
        rd = room_data.get("data", [])
        if isinstance(rd, list) and rd:
            print(f"    first item keys: {list(rd[0].keys())[:10]}")
except Exception as e:
    print(f"[4] API error: {e}")
