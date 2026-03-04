import json
import re
import time
import statistics
import pathlib
import importlib.util
from collections import Counter, defaultdict
from typing import Dict, List

from fastapi.testclient import TestClient


def load_backend_module(root: pathlib.Path):
    spec = importlib.util.spec_from_file_location("sg_app", str(root / "streamguard-backend" / "app.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_labeled_samples(root: pathlib.Path) -> List[Dict]:
    js = (root / "streamguard-web" / "src" / "data" / "mockStream.js").read_text(encoding="utf-8")
    pat = re.compile(r"\{\s*id:\s*\d+,\s*text:\s*'([^']+)'\s*,\s*type:\s*'([^']+)'", re.S)
    items = [{"text": m.group(1), "label": m.group(2)} for m in pat.finditer(js)]
    if not items:
        raise RuntimeError("No labeled samples parsed from mockStream.js")
    return items


def f1_macro(y_true: List[str], y_pred: List[str], labels: List[str]) -> float:
    f1s = []
    for c in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == c and p == c)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != c and p == c)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == c and p != c)
        if tp == 0 and (fp > 0 or fn > 0):
            f1 = 0.0
        elif tp == 0 and fp == 0 and fn == 0:
            f1 = 0.0
        else:
            precision = tp / (tp + fp) if (tp + fp) else 0.0
            recall = tp / (tp + fn) if (tp + fn) else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        f1s.append(f1)
    return sum(f1s) / len(f1s)


def evaluate_classifier(samples: List[Dict], fn):
    y_true = [s["label"] for s in samples]
    y_pred = [fn(s["text"]).get("type", "") for s in samples]

    acc = sum(int(t == p) for t, p in zip(y_true, y_pred)) / len(samples)
    labels = ["fact", "hype", "trap"]
    macro_f1 = f1_macro(y_true, y_pred, labels)

    cm = defaultdict(Counter)
    for t, p in zip(y_true, y_pred):
        cm[t][p] += 1

    return {
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "confusion": {k: dict(cm[k]) for k in labels},
    }


def percentile(values: List[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = int(round((len(s) - 1) * q))
    idx = max(0, min(idx, len(s) - 1))
    return s[idx]


def bench_analyze(client: TestClient, samples: List[Dict]):
    lat = []
    correct = 0
    for s in samples:
        t0 = time.perf_counter()
        r = client.get("/analyze", params={"text": s["text"]})
        lat.append((time.perf_counter() - t0) * 1000)
        pred = r.json().get("type")
        correct += int(pred == s["label"])
    return {
        "samples": len(samples),
        "accuracy": round(correct / len(samples), 4),
        "latency_ms": {
            "p50": round(percentile(lat, 0.5), 2),
            "p95": round(percentile(lat, 0.95), 2),
            "mean": round(statistics.mean(lat), 2),
        },
    }


def bench_chat(client: TestClient):
    chat_samples = [
        "主播加油，已下单", "这是真的假的？会不会骗人", "加微信领优惠",
        "太贵了，质量差", "求链接"
    ] * 20
    lat = []
    for text in chat_samples:
        t0 = time.perf_counter()
        client.get("/chat-analyze", params={"text": text, "recent_utterance": "全网最低价，最后10份"})
        lat.append((time.perf_counter() - t0) * 1000)
    return {
        "samples": len(chat_samples),
        "latency_ms": {
            "p50": round(percentile(lat, 0.5), 2),
            "p95": round(percentile(lat, 0.95), 2),
            "mean": round(statistics.mean(lat), 2),
        },
    }


def bench_session_summary(client: TestClient):
    payload = {
        "utterances": [
            {"type": "fact", "score": 0.91, "text": "有检测报告可查"},
            {"type": "trap", "score": 0.12, "text": "全网最低价最后10份"},
            {"type": "hype", "score": 0.41, "text": "效果惊人"},
        ],
        "chatMessages": [{"user": "u1", "text": "真的假的"}, {"user": "u2", "text": "已下单"}],
        "stats": {"total": 3, "fact": 1, "hype": 1, "trap": 1},
        "roomId": "demo",
        "durationSeconds": 180,
        "rationalityIndex": 62,
    }
    lat = []
    generated_by = None
    for _ in range(30):
        t0 = time.perf_counter()
        r = client.post("/session/summary", json=payload)
        lat.append((time.perf_counter() - t0) * 1000)
        generated_by = r.json().get("generated_by")
    return {
        "samples": 30,
        "generated_by": generated_by,
        "latency_ms": {
            "p50": round(percentile(lat, 0.5), 2),
            "p95": round(percentile(lat, 0.95), 2),
            "mean": round(statistics.mean(lat), 2),
        },
    }


def bench_websocket(client: TestClient):
    n = 15
    recv_ts = []
    wall_t0 = time.time()
    with client.websocket_connect("/ws/stream") as ws:
        for _ in range(n):
            ws.receive_json()
            recv_ts.append(time.time())
    intervals = [recv_ts[i] - recv_ts[i - 1] for i in range(1, len(recv_ts))]
    return {
        "messages": n,
        "success_rate": 1.0,
        "duration_s": round(recv_ts[-1] - recv_ts[0], 2) if len(recv_ts) > 1 else 0.0,
        "interval_s": {
            "p50": round(percentile(intervals, 0.5), 2) if intervals else 0.0,
            "p95": round(percentile(intervals, 0.95), 2) if intervals else 0.0,
            "mean": round(statistics.mean(intervals), 2) if intervals else 0.0,
        },
        "wall_s": round(time.time() - wall_t0, 2),
    }


def main():
    root = pathlib.Path(__file__).resolve().parents[1]
    mod = load_backend_module(root)
    samples = load_labeled_samples(root)

    rule_kw = evaluate_classifier(samples, mod.analyze_with_keywords)
    rule_audio = evaluate_classifier(samples, mod.analyze_audio_with_rules)

    client = TestClient(mod.app)
    api_analyze = bench_analyze(client, samples)
    api_chat = bench_chat(client)
    api_summary = bench_session_summary(client)
    ws = bench_websocket(client)

    out = {
        "meta": {
            "dataset": "streamguard-web/src/data/mockStream.js",
            "dataset_size": len(samples),
            "labels": ["fact", "hype", "trap"],
        },
        "classification_compare": {
            "analyze_with_keywords": rule_kw,
            "analyze_audio_with_rules": rule_audio,
        },
        "api_latency": {
            "analyze": api_analyze,
            "chat_analyze": api_chat,
            "session_summary": api_summary,
        },
        "websocket_stability": ws,
    }

    out_dir = root / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "chapter5_metrics.json"
    out_file.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print("[ok] metrics written:", out_file)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
