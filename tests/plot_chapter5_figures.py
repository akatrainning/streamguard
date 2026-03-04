import json
import math
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec


ROOT = Path(__file__).resolve().parents[1]
METRIC_FILE = ROOT / "results" / "chapter5_metrics.json"
MODEL_COMPARE_FILE = ROOT / "results" / "chapter5_model_compare.json"
OUT_DIR = ROOT / "results" / "figures"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def load_metrics(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def paper_style():
    plt.rcParams.update({
        "figure.dpi": 140,
        "savefig.dpi": 320,
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.labelsize": 10,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.linewidth": 0.8,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "grid.alpha": 0.25,
        "grid.linestyle": "--",
        "legend.frameon": False,
        "figure.facecolor": "white",
        "axes.facecolor": "#fcfcfd",
    })


def get_conf_matrix(conf_dict, labels):
    arr = np.zeros((len(labels), len(labels)), dtype=float)
    for i, t in enumerate(labels):
        row = conf_dict.get(t, {})
        for j, p in enumerate(labels):
            arr[i, j] = row.get(p, 0)
    return arr


def normalize_rows(cm):
    out = cm.copy().astype(float)
    row_sum = out.sum(axis=1, keepdims=True)
    row_sum[row_sum == 0] = 1.0
    return out / row_sum


def annotate_heatmap(ax, data):
    for i in range(data.shape[0]):
        for j in range(data.shape[1]):
            v = data[i, j]
            color = "white" if v > 0.45 else "#1f2937"
            ax.text(j, i, f"{v:.2f}", ha="center", va="center", color=color, fontsize=9)


def plot_classification(metrics):
    # Prefer explicit model-comparison results if available (rules vs BERT/LLM).
    if MODEL_COMPARE_FILE.exists():
        mc = load_metrics(MODEL_COMPARE_FILE)
        pretty = []
        acc = []
        f1 = []
        for m in mc.get("methods", []):
            raw = m.get("method", "")
            if raw.startswith("rule_keyword"):
                name = "Keyword Rule"
            elif raw.startswith("rule_audio"):
                name = "Rule+Audio"
            elif raw.startswith("bert_zero_shot"):
                name = "BERT Zero-shot"
            elif raw.startswith("llm_prompt"):
                name = "LLM Prompt"
            else:
                name = raw
            pretty.append(name)
            acc.append(m.get("accuracy", 0.0))
            f1.append(m.get("macro_f1", 0.0))
        methods = pretty
    else:
        comp = metrics["classification_compare"]
        methods = ["Keyword Baseline", "Rule+Audio"]
        acc = [comp["analyze_with_keywords"]["accuracy"], comp["analyze_audio_with_rules"]["accuracy"]]
        f1 = [comp["analyze_with_keywords"]["macro_f1"], comp["analyze_audio_with_rules"]["macro_f1"]]

    x = np.arange(len(methods))
    w = 0.32

    fig, ax = plt.subplots(figsize=(9.2, 4.9))
    c1, c2 = "#4C72B0", "#55A868"
    b1 = ax.bar(x - w / 2, acc, width=w, color=c1, label="Accuracy")
    b2 = ax.bar(x + w / 2, f1, width=w, color=c2, label="Macro-F1")

    ax.set_ylim(0, 1.0)
    ax.set_xticks(x)
    ax.set_xticklabels(methods)
    ax.set_ylabel("Score")
    ax.set_title("Fig. 5-1  Classification Performance Comparison")
    ax.grid(axis="y")
    ax.legend(loc="upper left")

    for bars in (b1, b2):
        for b in bars:
            h = b.get_height()
            ax.text(b.get_x() + b.get_width() / 2, h + 0.02, f"{h:.3f}", ha="center", va="bottom", fontsize=9)

    if len(acc) >= 2:
        best_i = int(np.argmax(f1))
        ax.text(
            0.98,
            0.06,
            f"Best Macro-F1: {methods[best_i]} ({f1[best_i]:.3f})",
            transform=ax.transAxes,
            ha="right",
            va="bottom",
            fontsize=9,
            bbox=dict(boxstyle="round,pad=0.35", facecolor="#eef3fb", edgecolor="#cfd8e3"),
        )

    fig.tight_layout()
    fig.savefig(OUT_DIR / "fig5_1_classification_comparison.png")
    fig.savefig(OUT_DIR / "fig5_1_classification_comparison.svg")
    plt.close(fig)


def plot_confusion(metrics):
    labels = ["fact", "hype", "trap"]
    comp = metrics["classification_compare"]

    cm_kw = get_conf_matrix(comp["analyze_with_keywords"]["confusion"], labels)
    cm_ra = get_conf_matrix(comp["analyze_audio_with_rules"]["confusion"], labels)

    n_kw = normalize_rows(cm_kw)
    n_ra = normalize_rows(cm_ra)

    # Use an explicit GridSpec with a dedicated colorbar axis to avoid overlaps.
    fig = plt.figure(figsize=(10.6, 4.8), constrained_layout=True)
    gs = fig.add_gridspec(1, 3, width_ratios=[1.0, 1.0, 0.045], wspace=0.06)
    ax_l = fig.add_subplot(gs[0, 0])
    ax_r = fig.add_subplot(gs[0, 1], sharey=ax_l)
    cax = fig.add_subplot(gs[0, 2])
    cmap = plt.get_cmap("Blues")

    for ax, data, title in [
        (ax_l, n_kw, "(a) Keyword Baseline"),
        (ax_r, n_ra, "(b) Rule+Audio"),
    ]:
        im = ax.imshow(data, cmap=cmap, vmin=0, vmax=1, interpolation="nearest")
        annotate_heatmap(ax, data)
        ax.set_xticks(np.arange(len(labels)))
        ax.set_yticks(np.arange(len(labels)))
        ax.set_xticklabels(labels)
        ax.set_yticklabels(labels)
        ax.set_xlabel("Predicted Label")
        ax.set_title(title)

    ax_l.set_ylabel("True Label")
    ax_r.tick_params(axis="y", labelleft=False)

    cbar = fig.colorbar(im, cax=cax)
    cbar.set_label("Row-normalized ratio")

    fig.suptitle("Fig. 5-2  Confusion Matrices (Normalized)")
    fig.savefig(OUT_DIR / "fig5_2_confusion_matrices.png")
    fig.savefig(OUT_DIR / "fig5_2_confusion_matrices.svg")
    plt.close(fig)


def plot_latency(metrics):
    lat = metrics["api_latency"]
    names = ["/analyze", "/chat-analyze", "/session/summary"]
    p50 = [lat["analyze"]["latency_ms"]["p50"], lat["chat_analyze"]["latency_ms"]["p50"], lat["session_summary"]["latency_ms"]["p50"]]
    p95 = [lat["analyze"]["latency_ms"]["p95"], lat["chat_analyze"]["latency_ms"]["p95"], lat["session_summary"]["latency_ms"]["p95"]]
    mean = [lat["analyze"]["latency_ms"]["mean"], lat["chat_analyze"]["latency_ms"]["mean"], lat["session_summary"]["latency_ms"]["mean"]]

    y = np.arange(len(names))[::-1]
    fig, ax = plt.subplots(figsize=(8.6, 4.8))

    for i in range(len(names)):
        ax.hlines(y[i], p50[i], p95[i], color="#4C72B0", linewidth=6, alpha=0.35)
        ax.plot(mean[i], y[i], "o", color="#C44E52", markersize=6, label="Mean" if i == 0 else "")
        ax.plot(p50[i], y[i], "|", color="#2f3e56", markersize=14, markeredgewidth=1.8, label="P50" if i == 0 else "")
        ax.plot(p95[i], y[i], "|", color="#2f3e56", markersize=14, markeredgewidth=1.8, label="P95" if i == 0 else "")
        ax.text(p95[i] + 0.15, y[i], f"{p50[i]:.2f}-{p95[i]:.2f} ms", va="center", fontsize=9, color="#334155")

    ax.set_yticks(y)
    ax.set_yticklabels(names)
    ax.set_xlabel("Latency (ms)")
    ax.set_title("Fig. 5-3  API Latency Profile (P50-P95 Range with Mean)")
    ax.grid(axis="x")
    ax.legend(loc="lower right")
    ax.set_xlim(left=0)

    fig.tight_layout()
    fig.savefig(OUT_DIR / "fig5_3_api_latency_profile.png")
    fig.savefig(OUT_DIR / "fig5_3_api_latency_profile.svg")
    plt.close(fig)


def plot_websocket(metrics):
    ws = metrics["websocket_stability"]

    # Normalize into [0,1] for radar-like presentation
    success = ws["success_rate"]
    duration = min(ws["duration_s"] / 30.0, 1.0)
    # Lower interval mean implies better responsiveness; map inversely
    iv_mean = ws["interval_s"]["mean"]
    responsiveness = max(0.0, min(1.0, 1.0 - iv_mean / 3.0))
    iv_p95 = ws["interval_s"]["p95"]
    jitter_control = max(0.0, min(1.0, 1.0 - iv_p95 / 6.0))

    vals = np.array([success, duration, responsiveness, jitter_control])
    labels = ["Success Rate", "Session Continuity", "Mean Interval Resp.", "P95 Stability"]

    angles = np.linspace(0, 2 * np.pi, len(labels), endpoint=False)
    vals_c = np.concatenate([vals, vals[:1]])
    ang_c = np.concatenate([angles, angles[:1]])

    fig = plt.figure(figsize=(6.4, 6.2))
    ax = fig.add_subplot(111, projection="polar")
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)

    ax.plot(ang_c, vals_c, color="#4C72B0", linewidth=2)
    ax.fill(ang_c, vals_c, color="#4C72B0", alpha=0.20)
    ax.set_xticks(angles)
    ax.set_xticklabels(labels)
    ax.set_yticks([0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_yticklabels(["0.2", "0.4", "0.6", "0.8", "1.0"])
    ax.set_ylim(0, 1.0)
    ax.grid(alpha=0.35)

    ax.set_title("Fig. 5-4  WebSocket Reliability Radar", pad=22)
    fig.text(0.5, 0.04,
             f"Raw metrics: success={success*100:.1f}%, duration={ws['duration_s']:.2f}s, "
             f"mean interval={iv_mean:.2f}s, p95 interval={iv_p95:.2f}s",
             ha="center", va="center", fontsize=8.5, color="#475569")

    fig.tight_layout(rect=[0, 0.07, 1, 1])
    fig.savefig(OUT_DIR / "fig5_4_websocket_radar.png")
    fig.savefig(OUT_DIR / "fig5_4_websocket_radar.svg")
    plt.close(fig)


def plot_composite(metrics):
    """One-page high-density figure for appendix or presentation."""
    comp = metrics["classification_compare"]
    ws = metrics["websocket_stability"]

    fig = plt.figure(figsize=(12.8, 8.2))
    gs = GridSpec(2, 3, figure=fig, width_ratios=[1.05, 1.05, 1.2], height_ratios=[1, 1], wspace=0.32, hspace=0.36)

    # A: bars
    ax1 = fig.add_subplot(gs[0, 0])
    methods = ["Keyword", "Rule+Audio"]
    acc = [comp["analyze_with_keywords"]["accuracy"], comp["analyze_audio_with_rules"]["accuracy"]]
    f1 = [comp["analyze_with_keywords"]["macro_f1"], comp["analyze_audio_with_rules"]["macro_f1"]]
    x = np.arange(2)
    w = 0.34
    ax1.bar(x - w/2, acc, width=w, color="#4C72B0", label="Acc")
    ax1.bar(x + w/2, f1, width=w, color="#55A868", label="Macro-F1")
    ax1.set_ylim(0, 1)
    ax1.set_xticks(x)
    ax1.set_xticklabels(methods)
    ax1.set_title("(a) Classification")
    ax1.grid(axis="y")
    ax1.legend(loc="upper left", fontsize=8)

    # B/C: confusion matrices
    labels = ["fact", "hype", "trap"]
    cm1 = normalize_rows(get_conf_matrix(comp["analyze_with_keywords"]["confusion"], labels))
    cm2 = normalize_rows(get_conf_matrix(comp["analyze_audio_with_rules"]["confusion"], labels))

    ax2 = fig.add_subplot(gs[0, 1])
    im1 = ax2.imshow(cm1, cmap="Blues", vmin=0, vmax=1)
    annotate_heatmap(ax2, cm1)
    ax2.set_xticks(np.arange(3)); ax2.set_yticks(np.arange(3))
    ax2.set_xticklabels(labels); ax2.set_yticklabels(labels)
    ax2.set_title("(b) CM: Keyword")

    ax3 = fig.add_subplot(gs[0, 2])
    im2 = ax3.imshow(cm2, cmap="Blues", vmin=0, vmax=1)
    annotate_heatmap(ax3, cm2)
    ax3.set_xticks(np.arange(3)); ax3.set_yticks(np.arange(3))
    ax3.set_xticklabels(labels); ax3.set_yticklabels(labels)
    ax3.set_title("(c) CM: Rule+Audio")
    cbar = fig.colorbar(im2, ax=[ax2, ax3], fraction=0.024, pad=0.02)
    cbar.set_label("Normalized")

    # D: latency range
    ax4 = fig.add_subplot(gs[1, 0:2])
    lat = metrics["api_latency"]
    names = ["/analyze", "/chat-analyze", "/session/summary"]
    p50 = [lat["analyze"]["latency_ms"]["p50"], lat["chat_analyze"]["latency_ms"]["p50"], lat["session_summary"]["latency_ms"]["p50"]]
    p95 = [lat["analyze"]["latency_ms"]["p95"], lat["chat_analyze"]["latency_ms"]["p95"], lat["session_summary"]["latency_ms"]["p95"]]
    mean = [lat["analyze"]["latency_ms"]["mean"], lat["chat_analyze"]["latency_ms"]["mean"], lat["session_summary"]["latency_ms"]["mean"]]
    y = np.arange(len(names))[::-1]
    for i in range(len(names)):
        ax4.hlines(y[i], p50[i], p95[i], color="#4C72B0", linewidth=7, alpha=0.35)
        ax4.plot(mean[i], y[i], "o", color="#C44E52", markersize=6)
    ax4.set_yticks(y)
    ax4.set_yticklabels(names)
    ax4.set_xlabel("Latency (ms)")
    ax4.set_title("(d) API Latency Bands")
    ax4.grid(axis="x")

    # E: websocket card
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.axis("off")
    lines = [
        "(e) WebSocket Stability",
        f"Messages: {ws['messages']}",
        f"Success Rate: {ws['success_rate']*100:.1f}%",
        f"Duration: {ws['duration_s']:.2f} s",
        f"Interval Mean: {ws['interval_s']['mean']:.2f} s",
        f"Interval P95: {ws['interval_s']['p95']:.2f} s",
    ]
    ax5.text(0.02, 0.98, "\n".join(lines), va="top", ha="left", fontsize=11,
             bbox=dict(boxstyle="round,pad=0.45", facecolor="#f1f5f9", edgecolor="#cbd5e1"))

    fig.suptitle("Chapter 5 Evaluation Dashboard", y=0.98, fontsize=14)
    fig.savefig(OUT_DIR / "fig5_dashboard_composite.png")
    fig.savefig(OUT_DIR / "fig5_dashboard_composite.svg")
    plt.close(fig)


def main():
    paper_style()
    metrics = load_metrics(METRIC_FILE)
    plot_classification(metrics)
    plot_confusion(metrics)
    plot_latency(metrics)
    plot_websocket(metrics)
    plot_composite(metrics)
    print(f"[ok] figures generated in: {OUT_DIR}")


if __name__ == "__main__":
    main()
