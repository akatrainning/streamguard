"""Test WebSocket connection to Douyin live room."""
import asyncio
import sys
sys.path.insert(0, ".")
from douyin_ws_client import stream_douyin_live

ROOM = "646454278948"
count = 0

async def on_event(evt):
    global count
    count += 1
    etype = evt.get("event", "?")
    if etype == "status":
        print(f">> STATUS: {evt.get('message')}")
    elif etype == "chat":
        print(f"[CHAT] {evt.get('user','?')}: {evt.get('text','')}")
    elif etype == "viewer_join":
        print(f"[JOIN] {evt.get('user','?')}")
    elif etype == "gift":
        print(f"[GIFT]")
    else:
        print(f"[{etype}] {evt}")
    
    if count >= 20:
        print(f"\n--- Got {count} events, test passed! ---")
        raise KeyboardInterrupt

async def main():
    print(f"Connecting to room {ROOM}...")
    try:
        await asyncio.wait_for(stream_douyin_live(ROOM, on_event), timeout=30)
    except KeyboardInterrupt:
        print("Done (interrupted after enough events)")
    except asyncio.TimeoutError:
        if count > 0:
            print(f"Timeout but got {count} events - partial success")
        else:
            print("Timeout - no events received in 30s")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
