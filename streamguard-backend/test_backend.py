#!/usr/bin/env python3
"""
StreamGuard Backend Quick Test
测试 API 端点和 WebSocket 连接
"""

import requests
import json
import asyncio
import websockets
import sys

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000"

def test_health():
    """Test health endpoint"""
    print("🔍 Testing /health endpoint...")
    try:
        resp = requests.get(f"{BASE_URL}/health")
        print(f"✅ Status: {resp.status_code}")
        print(f"📊 Response: {json.dumps(resp.json(), indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_analyze():
    """Test /analyze endpoint"""
    print("\n🔍 Testing /analyze endpoint...")
    try:
        text = "只剩最后50件了，快抢！"
        resp = requests.get(f"{BASE_URL}/analyze", params={"text": text})
        print(f"✅ Status: {resp.status_code}")
        result = resp.json()
        print(f"📊 Input: {text}")
        print(f"📊 Result: {json.dumps(result, indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

async def test_websocket():
    """Test WebSocket stream"""
    print("\n🔍 Testing WebSocket /ws/stream...")
    try:
        async with websockets.connect(f"{WS_URL}/ws/stream") as ws:
            print("✅ Connected to WebSocket")
            for i in range(3):
                msg = await ws.recv()
                data = json.loads(msg)
                print(f"📨 Message {i+1}: {data.get('event')} - {data.get('text', '')[:50]}")
        print("✅ WebSocket stream test passed")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("=" * 60)
    print("🛡️  StreamGuard Backend Quick Test Suite")
    print("=" * 60)
    
    # Test REST endpoints
    print("\n📡 REST API Tests:")
    print("-" * 60)
    
    health_ok = test_health()
    analyze_ok = test_analyze()
    
    # Test WebSocket
    print("\n🔌 WebSocket Tests:")
    print("-" * 60)
    
    try:
        ws_ok = asyncio.run(test_websocket())
    except Exception as e:
        print(f"❌ WebSocket test failed: {e}")
        ws_ok = False
    
    # Summary
    print("\n" + "=" * 60)
    print("📋 Test Summary:")
    print(f"  Health Check: {'✅' if health_ok else '❌'}")
    print(f"  Analyze API: {'✅' if analyze_ok else '❌'}")
    print(f"  WebSocket: {'✅' if ws_ok else '❌'}")
    print("=" * 60)
    
    if all([health_ok, analyze_ok, ws_ok]):
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n⚠️ Some tests failed. Check backend configuration.")
        sys.exit(1)

if __name__ == "__main__":
    main()
