"""Test HTTP polling approach for Douyin live messages."""
import requests, json, time, random, gzip

ROOM = "646454278948"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

sess = requests.Session()
sess.headers.update({
    "User-Agent": UA,
    "Referer": f"https://live.douyin.com/{ROOM}",
    "Accept-Language": "zh-CN,zh;q=0.9",
})

# Get cookies
r1 = sess.get("https://live.douyin.com", timeout=15)
r2 = sess.get(f"https://live.douyin.com/{ROOM}", timeout=15)

# Get internal room id
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
room_data = data["data"]["data"][0]
internal_id = room_data["id_str"]
print(f"Room: {room_data.get('title')} by {room_data.get('owner',{}).get('nickname')}")
print(f"Internal ID: {internal_id}")
print(f"Viewers: {room_data.get('user_count_str')}")

# Try different fetch approaches
uid = str(random.randint(10**15, 10**16-1))

# Approach 1: GET /webcast/im/fetch/
print("\n--- Approach 1: GET im/fetch ---")
fetch_url = (
    f"https://live.douyin.com/webcast/im/fetch/"
    f"?aid=6383&app_name=douyin_web&live_id=1&device_platform=web"
    f"&language=zh-CN&cookie_enabled=true&room_id={internal_id}"
    f"&did_rule=3&endpoint=live_pc&support_wrds=1"
    f"&identity=audience&user_unique_id={uid}"
    f"&heartbeatDuration=0&im_path=/webcast/im/fetch/"
)
r4 = sess.get(fetch_url, timeout=15)
print(f"  Status: {r4.status_code}, Len: {len(r4.content)}, Type: {r4.headers.get('content-type')}")
if r4.content:
    try:
        j = r4.json()
        print(f"  JSON keys: {list(j.keys())}")
    except:
        try:
            decompressed = gzip.decompress(r4.content)
            print(f"  Gzip decompressed: {len(decompressed)} bytes")
        except:
            print(f"  Raw first 200 bytes: {r4.content[:200]}")

# Approach 2: POST im/fetch
print("\n--- Approach 2: POST im/fetch ---")
r5 = sess.post(fetch_url, timeout=15)
print(f"  Status: {r5.status_code}, Len: {len(r5.content)}, Type: {r5.headers.get('content-type')}")
if r5.content:
    try:
        j = r5.json()
        print(f"  JSON keys: {list(j.keys())}")
    except:
        print(f"  Raw first 200 bytes: {r5.content[:200]}")

# Approach 3: Gift list API (always works, gives recent activity)
print("\n--- Approach 3: webcast/ranklist/audience ---")
rank_url = (
    f"https://live.douyin.com/webcast/ranklist/audience/"
    f"?aid=6383&app_name=douyin_web&live_id=1"
    f"&room_id={internal_id}&anchor_id={room_data.get('owner',{}).get('id_str','')}"
    f"&sec_anchor_id={room_data.get('owner',{}).get('sec_uid','')}"
)
r6 = sess.get(rank_url, timeout=15)
print(f"  Status: {r6.status_code}, Len: {len(r6.content)}")
if r6.content:
    try:
        j = r6.json()
        print(f"  JSON keys: {list(j.keys())}")
        ranks = j.get("data", {}).get("ranks", [])
        for rank in ranks[:3]:
            u = rank.get("user", {})
            print(f"  Top viewer: {u.get('nickname','?')} (score: {rank.get('score','?')})")
    except Exception as e:
        print(f"  Error: {e}")

# Approach 4: webcast/gift/rank 
print("\n--- Approach 4: Gift data ---")
gift_url = (
    f"https://live.douyin.com/webcast/gift/room_rank_list/"
    f"?aid=6383&app_name=douyin_web"
    f"&room_id={internal_id}&anchor_id={room_data.get('owner',{}).get('id_str','')}"
)
r7 = sess.get(gift_url, timeout=15)
print(f"  Status: {r7.status_code}, Len: {len(r7.content)}")
if r7.content:
    try:
        j = r7.json()
        print(f"  JSON keys: {list(j.keys())}")
    except:
        pass
