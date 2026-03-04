import { useMemo } from "react";

import { useEffect, useRef } from "react";

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
  const logScrollRef = useRef(null);
  const didInitScrollRef = useRef(false);
  const totalMsgs = messageTotals?.total ?? (utterances.length + chatMessages.length);
  const totalUtterances = messageTotals?.utterances ?? utterances.length;
  const totalChats = messageTotals?.chats ?? chatMessages.length;
  const activeMins = Math.max(1, Math.round(totalMsgs / 20));
  const throughput = Math.round(totalMsgs / activeMins);

  const lastSeen = useMemo(() => {
    if (!connection?.lastMessageAt) return "--";
    return new Date(connection.lastMessageAt).toLocaleTimeString("zh-CN", { hour12: false });
  }, [connection?.lastMessageAt]);

  // statusLog is stored newest-first; render oldest-first so the fixed-height panel
  // reads naturally top-to-bottom and can anchor to the bottom when short.
  const logLines = useMemo(() => {
    return (connection.statusLog || []).slice(0, 30).slice().reverse();
  }, [connection.statusLog]);

  // Auto-scroll to bottom (terminal-style). If user scrolls up, don't yank.
  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;

    if (!didInitScrollRef.current) {
      didInitScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 24) el.scrollTop = el.scrollHeight;
  }, [connection.statusLog]);

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

  const statusText = connection.connected ? "已连接" : connection.connecting ? "连接中" : "未连接";
  const statusColor = connection.connected ? "var(--fact)" : connection.connecting ? "var(--hype)" : "var(--trap)";

  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(18,29,45,0.94), rgba(15,24,37,0.95))",
      border: "1px solid #2b3f5c",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 12px 28px rgba(4,9,16,0.24)",
      height: "100%",
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid #2b3f5c",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>运营指挥台</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onReconnect} style={btnStyle}>重连</button>
          <button onClick={exportSnapshot} style={btnStyle}>导出快照</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 14, flex: "0 0 auto" }}>
        <Card title="连接诊断">
          <KV k="数据源" v={dataSource || "--"} />
          <KV k="房间" v={sourceConfig?.roomId || "--"} mono />
          <KV k="状态" v={statusText} color={statusColor} />
          <KV k="尝试次数" v={connection.connectionAttempts ?? 0} mono />
          <KV k="最近消息" v={lastSeen} mono />
          {connection.error && <div style={{ marginTop: 8, fontSize: 12, color: "var(--trap)" }}>{connection.error}</div>}
        </Card>

        <Card title="吞吐与负载">
          <KV k="语义条数(累计)" v={totalUtterances} mono />
          <KV k="聊天条数(累计)" v={totalChats} mono />
          <KV k="总消息(累计)" v={totalMsgs} mono />
          <KV k="最近语义缓存" v={`${utterances.length}/${recentLimits?.utterances ?? utterances.length}`} mono />
          <KV k="最近聊天缓存" v={`${chatMessages.length}/${recentLimits?.chats ?? chatMessages.length}`} mono />
          <KV k="估算速率" v={`${throughput}/min`} mono />
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
            仅限前端最近 N 条缓存展示，累计计数不封顶，不影响真实流速统计。
          </div>
        </Card>
      </div>

      <div style={{ borderTop: "1px solid #2b3f5c", padding: "10px 12px", flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{
          background: "rgba(18,30,46,0.9)",
          border: "1px solid #2f4666",
          borderRadius: 8,
          overflow: "hidden",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{
            padding: "10px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            fontSize: 12,
            color: "var(--text-muted)",
          }}>
            <span style={{ fontWeight: 800, color: "var(--text-secondary)" }}>连接日志</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {(connection.statusLog || []).length} 条
            </span>
          </div>

          <div style={{ borderTop: "1px solid #2f4666", padding: "8px 10px", flex: 1, minHeight: 0 }}>
            <div style={{
              height: "100%",
              overflowY: "auto",
              background: "rgba(0,0,0,0.16)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "6px 8px",
              display: "flex",
              flexDirection: "column",
              rowGap: 2,
            }} ref={logScrollRef}>
              {logLines.map((line, i) => (
                <div
                  key={i}
                  className="mono"
                  style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.35 }}
                >
                  {line}
                </div>
              ))}
              {(!connection.statusLog || connection.statusLog.length === 0) && (
                <div className="mono" style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.35 }}>
                  -- no logs --
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      border: "1px solid #304865",
      borderRadius: 8,
      padding: 12,
      background: "rgba(20,33,50,0.85)",
    }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, fontWeight: 700 }}>{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v, mono, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)" }}>{k}</span>
      <span className={mono ? "mono" : ""} style={{ color: color || "var(--text-secondary)", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

const btnStyle = {
  padding: "6px 10px",
  borderRadius: 8,
  background: "linear-gradient(180deg, rgba(28,43,65,0.95), rgba(22,35,52,0.95))",
  border: "1px solid #355072",
  color: "var(--text-secondary)",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 600,
};
