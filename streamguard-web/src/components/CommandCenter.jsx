import { useEffect, useMemo, useRef } from "react";
import { Button, MetricTile, Panel, StatusBadge } from "./ui";

export default function CommandCenter({
  dataSource,
  sourceConfig,
  connection,
  utterances,
  chatMessages,
  messageTotals,
  recentLimits,
  onReconnect,
  onAuthorizeDouyin,
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

  const logLines = useMemo(() => {
    return (connection.statusLog || []).slice(0, 30).slice().reverse();
  }, [connection.statusLog]);

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

  const accessIssue = connection.accessIssue;
  const statusTone = accessIssue ? "warning" : connection.connected ? "success" : connection.connecting ? "warning" : "danger";
  const statusText = connection.connected ? "已连接" : connection.connecting ? "连接中" : "未连接";

  const displayStatusText = accessIssue ? "需要验证" : statusText;

  return (
    <Panel
      className="sg-command"
      title="运营指挥台"
      eyebrow="Operations"
      actions={(
        <>
          <StatusBadge tone={statusTone}>{displayStatusText}</StatusBadge>
          {accessIssue && (
            <Button onClick={onAuthorizeDouyin} disabled={connection.authLaunching}>
              {connection.authLaunching ? "打开中" : (accessIssue.actionLabel || "打开验证")}
            </Button>
          )}
          <Button onClick={onReconnect}>重连</Button>
          <Button onClick={exportSnapshot} variant="primary">导出快照</Button>
        </>
      )}
      bodyClassName="sg-command-body"
    >
      <section className="sg-command-hero">
        <div className="sg-command-connection">
          <div className="sg-command-connection-copy">
            <span>WebSocket pipeline</span>
            <strong>{displayStatusText}</strong>
            <p>
              {connection.connected
                ? `最近消息 ${lastSeen}，直播间数据正在进入审查管线。`
                : "连接还不稳定，先检查后端、代理和房间号。"}
            </p>
          </div>
          <div className="sg-command-diagnostics">
            <KV k="数据源" v={dataSource || "--"} />
            <KV k="房间" v={sourceConfig?.roomId || "--"} mono />
            <KV k="最近消息" v={lastSeen} mono />
            <KV k="尝试次数" v={connection.connectionAttempts ?? 0} mono />
          </div>
          {accessIssue && (
            <div className="sg-command-access">
              <strong>{accessIssue.title}</strong>
              <span>{accessIssue.message}</span>
              {accessIssue.detail && <em>{accessIssue.detail}</em>}
              <div>
                <Button onClick={onAuthorizeDouyin} variant="primary" disabled={connection.authLaunching}>
                  {connection.authLaunching ? "正在打开验证窗口" : "打开浏览器验证"}
                </Button>
                <Button onClick={onReconnect}>验证后重连</Button>
              </div>
            </div>
          )}
          {connection.error && <div className="sg-command-error">{connection.error}</div>}
        </div>

        <div className="sg-command-signal-strip">
          <MetricTile label="语义累计" value={totalUtterances} />
          <MetricTile label="弹幕累计" value={totalChats} />
          <MetricTile label="估算速率" value={`${throughput}/min`} tone="success" />
          <MetricTile label="缓存窗口" value={`${utterances.length}/${chatMessages.length}`} tone={connection.connected ? "neutral" : "warning"} />
        </div>
      </section>

      <section className="sg-command-log">
        <div className="sg-command-log-head">
          <span>连接日志</span>
          <span className="mono">{(connection.statusLog || []).length} 条</span>
        </div>
        <div className="sg-command-log-body" ref={logScrollRef}>
          {logLines.map((line, index) => (
            <div key={`${line}-${index}`} className="mono">{line}</div>
          ))}
          {(!connection.statusLog || connection.statusLog.length === 0) && (
            <div className="mono">-- no logs --</div>
          )}
        </div>
      </section>
    </Panel>
  );
}

function KV({ k, v, mono, tone }) {
  return (
    <div className="sg-command-kv">
      <span>{k}</span>
      <strong className={`${mono ? "mono" : ""} ${tone ? `is-${tone}` : ""}`.trim()}>{v}</strong>
    </div>
  );
}

