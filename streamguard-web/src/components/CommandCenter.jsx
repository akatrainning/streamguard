import { useMemo, useState } from "react";

export default function CommandCenter({
  dataSource,
  sourceConfig,
  connection,
  utterances,
  chatMessages,
  onReconnect,
}) {
  const [watchInput, setWatchInput] = useState("最后, 限时, 第一, 全网最低");

  const watchWords = useMemo(() => (
    watchInput
      .split(/[，,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20)
  ), [watchInput]);

  const corpus = useMemo(() => {
    const u = utterances.map(x => x.text || "");
    const c = chatMessages.map(x => x.text || "");
    return [...u, ...c].join("\n");
  }, [utterances, chatMessages]);

  const watchStats = useMemo(() => {
    return watchWords.map(w => ({
      word: w,
      count: corpus ? (corpus.match(new RegExp(escapeRegExp(w), "g")) || []).length : 0,
    })).sort((a, b) => b.count - a.count);
  }, [watchWords, corpus]);

  const totalMsgs = utterances.length + chatMessages.length;
  const activeMins = Math.max(1, Math.round(totalMsgs / 20));
  const throughput = Math.round(totalMsgs / activeMins);
  const lastSeen = connection.lastMessageAt
    ? new Date(connection.lastMessageAt).toLocaleTimeString("zh-CN", { hour12: false })
    : "--";

  const exportSnapshot = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      source: dataSource,
      roomId: sourceConfig?.roomId || null,
      wsBase: sourceConfig?.wsBase || "ws://localhost:8000",
      connection: {
        connected: connection.connected,
        connecting: connection.connecting,
        attempts: connection.connectionAttempts,
        lastMessageAt: connection.lastMessageAt,
        error: connection.error,
      },
      kpi: {
        utterances: utterances.length,
        chats: chatMessages.length,
        throughputPerMin: throughput,
      },
      watchStats,
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

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 12, padding: 12 }}>
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
          <KV k="语义条数" v={utterances.length} mono />
          <KV k="聊天条数" v={chatMessages.length} mono />
          <KV k="总消息" v={totalMsgs} mono />
          <KV k="估算速率" v={`${throughput}/min`} mono />
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)" }}>
            速率按当前会话消息量估算，用于快速评估抓流稳定性。
          </div>
        </Card>

        {/* Watchlist */}
        <Card title="关键词哨兵">
          <input
            value={watchInput}
            onChange={e => setWatchInput(e.target.value)}
            placeholder="输入关键词，逗号分隔"
            style={{
              width: "100%", padding: "6px 8px", borderRadius: 6,
              background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              color: "var(--text-primary)", fontSize: 12, outline: "none",
            }}
          />
          <div style={{ marginTop: 8, maxHeight: 130, overflowY: "auto" }}>
            {watchStats.length === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>暂无关键词</div>}
            {watchStats.map(item => (
              <div key={item.word} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: "var(--text-secondary)" }}>{item.word}</span>
                <span className="mono" style={{ color: item.count > 0 ? "var(--trap)" : "var(--text-muted)" }}>{item.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Status log */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>连接日志</div>
        <div style={{
          maxHeight: 88, overflowY: "auto",
          background: "var(--bg-tertiary)", borderRadius: 6,
          border: "1px solid var(--border)", padding: "6px 8px",
        }}>
          {(connection.statusLog || []).slice(0, 8).map((line, i) => (
            <div key={i} className="mono" style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 2 }}>{line}</div>
          ))}
          {(!connection.statusLog || connection.statusLog.length === 0) && (
            <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>-- no logs --</div>
          )}
        </div>
      </div>
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

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
