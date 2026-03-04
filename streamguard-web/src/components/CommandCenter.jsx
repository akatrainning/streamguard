import { useMemo, useState, useEffect, useRef } from "react";

// ─── 音频分析流程步骤 ───────────────────────────────────────────
const AUDIO_STEPS = [
  { key: "discover",    label: "发现直播媒体流",   desc: "从直播间提取音视频URL" },
  { key: "capture",     label: "捕获音频片段",     desc: "实时录制音频数据" },
  { key: "transcribe",  label: "ASR 语音转写",     desc: "Whisper 将音频转为文本" },
  { key: "analyze",     label: "语义对齐分析",     desc: "LLM 评估话术合规性" },
  { key: "done",        label: "分析完成",          desc: "结构化结果已就绪" },
];
const STEP_KEY_ORDER = AUDIO_STEPS.map(s => s.key);

function AudioStepIndicator({ currentStep, error }) {
  const currentIdx = STEP_KEY_ORDER.indexOf(currentStep);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "8px 0" }}>
      {AUDIO_STEPS.map((step, idx) => {
        const isDone    = currentIdx > idx || currentStep === "done";
        const isActive  = STEP_KEY_ORDER[currentIdx] === step.key && currentStep !== "done";
        const isError   = error && isActive;
        const color = isError ? "#FF3366" : isDone ? "#00FF88" : isActive ? "#FFD700" : "var(--text-muted)";
        const bg    = isError ? "rgba(255,51,102,0.08)" : isDone ? "rgba(0,255,136,0.07)" :
                      isActive ? "rgba(255,215,0,0.08)" : "transparent";
        return (
          <div key={step.key} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 7px",
            borderRadius: 6, background: bg,
            border: `1px solid ${isActive || isDone ? color + "33" : "transparent"}`,
            transition: "all 0.3s",
          }}>
            {/* 图标 */}
            <span style={{ fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 }}>
              {isError ? "✗" : isDone ? "✓" : isActive ? "⏳" : "○"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color, fontWeight: isActive ? 600 : 400 }}>{step.label}</div>
              {isActive && (
                <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{step.desc}</div>
              )}
            </div>
            {/* 活跃时的动画点 */}
            {isActive && !error && (
              <span style={{ display: "flex", gap: 3 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{
                    width: 4, height: 4, borderRadius: "50%", background: "#FFD700",
                    animation: `blink 1.2s ${i * 0.3}s infinite`,
                  }} />
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CommandCenter({
  dataSource,
  sourceConfig,
  connection,
  utterances,
  chatMessages,
  messageTotals,
  recentLimits,
  onReconnect,
}) {
  const [audioSecs, setAudioSecs] = useState(20);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [audioResult, setAudioResult] = useState(null);
  const [audioStep, setAudioStep]   = useState("");   // 当前进度步骤key
  const abortRef = useRef(null);

  const totalMsgs = messageTotals?.total ?? (utterances.length + chatMessages.length);
  const totalUtterances = messageTotals?.utterances ?? utterances.length;
  const totalChats = messageTotals?.chats ?? chatMessages.length;
  const activeMins = Math.max(1, Math.round(totalMsgs / 20));
  const throughput = Math.round(totalMsgs / activeMins);
  const lastSeen = connection.lastMessageAt
    ? new Date(connection.lastMessageAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "--";

  const apiBase = (sourceConfig?.wsBase || "ws://localhost:8011").replace(/^ws/i, "http");

  // ─── 分步音频分析 ───────────────────────────────────────────
  const runAudioAnalysis = async () => {
    if (dataSource !== "douyin") {
      setAudioError("当前仅抖音数据源支持直播间音频分析");
      return;
    }
    if (!sourceConfig?.roomId) {
      setAudioError("请先填写并连接直播间房间号");
      return;
    }
    setAudioLoading(true);
    setAudioError("");
    setAudioResult(null);
    const controller = new AbortController();
    abortRef.current = controller;

    // 分步骤模拟进度（实际请求耗时对应各阶段）
    const stepDelays = { discover: 0, capture: 1200, transcribe: 2800, analyze: 5500 };
    for (const [step, delay] of Object.entries(stepDelays)) {
      setTimeout(() => {
        if (!controller.signal.aborted) setAudioStep(step);
      }, delay);
    }

    try {
      const sec = Math.max(8, Math.min(90, Number(audioSecs) || 20));
      const url = `${apiBase}/douyin/audio-analyze/${sourceConfig.roomId}?seconds=${sec}`;
      const res = await fetch(url, { method: "POST", signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "音频分析失败");
      setAudioStep("done");
      setAudioResult(data);
    } catch (e) {
      if (e.name !== "AbortError") {
        setAudioError(e?.message || "音频分析失败");
        setAudioStep("");
      }
    } finally {
      if (!controller.signal.aborted) setAudioLoading(false);
    }
  };

  const cancelAudio = () => {
    abortRef.current?.abort();
    setAudioLoading(false);
    setAudioStep("");
    setAudioError("已取消");
  };

  const exportSnapshot = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      source: dataSource,
      roomId: sourceConfig?.roomId || null,
      wsBase: sourceConfig?.wsBase || "ws://localhost:8011",
      connection: {
        connected: connection.connected,
        connecting: connection.connecting,
        attempts: connection.connectionAttempts,
        lastMessageAt: connection.lastMessageAt,
        error: connection.error,
      },
      kpi: {
        utterances: totalUtterances,
        chats: totalChats,
        totalMessages: totalMsgs,
        recentWindow: {
          utterances: recentLimits?.utterances ?? utterances.length,
          chats: recentLimits?.chats ?? chatMessages.length,
        },
        throughputPerMin: throughput,
      },
      recentUtterances: utterances.slice(0, 20),
      recentChats: chatMessages.slice(0, 40),
      statusLog: connection.statusLog || [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `streamguard_snapshot_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>运营指挥台</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onReconnect} style={btnStyle}>重连</button>
          <button onClick={exportSnapshot} style={btnStyle}>导出快照</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12 }}>
        {/* Connection diagnostics */}
        <Card title="连接诊断">
          <KV k="数据源" v={dataSource || "--"} />
          <KV k="房间" v={sourceConfig?.roomId || "--"} mono />
          <KV k="状态" v={connection.connected ? "已连接" : connection.connecting ? "连接中" : "未连接"} color={connection.connected ? "var(--fact)" : connection.connecting ? "var(--hype)" : "var(--trap)"} />
          <KV k="尝试次数" v={connection.connectionAttempts ?? 0} mono />
          <KV k="最近消息" v={lastSeen} mono />
          {connection.error && <div style={{ marginTop: 6, fontSize: 11, color: "var(--trap)" }}>{connection.error}</div>}
        </Card>

        {/* Throughput */}
        <Card title="吞吐与负载">
          <KV k="语义条数(累计)" v={totalUtterances} mono />
          <KV k="聊天条数(累计)" v={totalChats} mono />
          <KV k="总消息(累计)" v={totalMsgs} mono />
          <KV k="最近语义缓存" v={`${utterances.length}/${recentLimits?.utterances ?? utterances.length}`} mono />
          <KV k="最近聊天缓存" v={`${chatMessages.length}/${recentLimits?.chats ?? chatMessages.length}`} mono />
          <KV k="估算速率" v={`${throughput}/min`} mono />
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
            仅限制前端最近 N 条显示；累计计数不封顶，不影响抓流频率。
          </div>
        </Card>

      </div>

      {/* Status log */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
        <details style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <summary style={{
            cursor: "pointer",
            listStyle: "none",
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            userSelect: "none",
            fontSize: 11,
            color: "var(--text-muted)",
          }}>
            <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>连接日志</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {(connection.statusLog || []).length} 条 · 点击展开
            </span>
          </summary>

          <div style={{ borderTop: "1px solid var(--border)", padding: "8px 10px" }}>
            <div style={{
              maxHeight: 160,
              overflowY: "auto",
              background: "rgba(0,0,0,0.15)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "6px 8px",
            }}>
              {(connection.statusLog || []).slice(0, 30).map((line, i) => (
                <div key={i} className="mono" style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>{line}</div>
              ))}
              {(!connection.statusLog || connection.statusLog.length === 0) && (
                <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>-- no logs --</div>
              )}
            </div>
          </div>
        </details>
      </div>

    </div>
  );
}

function TypeBadge({ type, score }) {
  const colors = { trap: "#FF3366", hype: "#FFD700", fact: "#00FF88" };
  const labels = { trap: "陷阱话术", hype: "夸大话术", fact: "合规话术" };
  const c = colors[type] || "var(--text-muted)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      padding: "6px 10px", borderRadius: 6, border: `1px solid ${c}33`, background: `${c}11`,
      flexShrink: 0, minWidth: 60 }}>
      <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: c }}>{((score || 0)*100).toFixed(0)}</span>
      <span style={{ fontSize: 9, color: c, marginTop: 2 }}>{labels[type] || type}</span>
    </div>
  );
}


function Card({ title, children }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      padding: 10, background: "var(--bg-tertiary)",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v, mono, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span className={mono ? "mono" : ""} style={{ color: color || "var(--text-secondary)" }}>{v}</span>
    </div>
  );
}

const btnStyle = {
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  fontSize: 11,
  cursor: "pointer",
};


