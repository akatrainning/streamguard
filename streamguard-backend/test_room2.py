"""Detailed room info extraction."""
import requests, json

ROOM = "646454278948"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
headers = {"User-Agent": UA, "Referer": "https://live.douyin.com/"}

r = requests.get("https://live.douyin.com", headers=headers, timeout=10)
cookies = dict(r.cookies)

api = (
    "https://live.douyin.com/webcast/room/web/enter/"
    f"?aid=6383&app_name=douyin_web&live_id=1&device_platform=web"
    f"&language=zh-CN&enter_from=web_live&cookie_enabled=true"
    f"&screen_width=1920&screen_height=1080&browser_language=zh-CN"
    f"&browser_platform=Win32&browser_name=Chrome&browser_version=120.0.0.0"
    f"&web_rid={ROOM}"
)
r3 = requests.get(api, headers=headers, cookies=cookies, timeout=15)
data = r3.json()
room_list = data.get("data", {}).get("data", [])
if room_list:
    room = room_list[0]
    print(f"id_str:      {room.get('id_str')}")
    print(f"status:      {room.get('status')} (2=live, 4=offline)")
    print(f"title:       {room.get('title')}")
    print(f"user_count:  {room.get('user_count_str')}")
    owner = room.get("owner", {})
    print(f"nickname:    {owner.get('nickname')}")
    print(f"web_rid:     {owner.get('web_rid', ROOM)}")
    # stream url
    su = room.get("stream_url", {})
    if su:
        candidates = su.get("candidate_resolution", [])
        print(f"stream resolutions: {candidates}")
        flv = su.get("flv_pull_url", {})
        if flv:
            print(f"flv pull url keys: {list(flv.keys())}")
else:
    print("No room data found")
    print(f"room_status: {data.get('data', {}).get('room_status')}")
    print(f"enter_room_id: {data.get('data', {}).get('enter_room_id')}")
