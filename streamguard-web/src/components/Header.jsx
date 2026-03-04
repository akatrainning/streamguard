const TABS = [
  { id: "dashboard", label: "实时监控" },
  { id: "discover",  label: "🔍 发现直播" },
  { id: "consumer",  label: "消费决策" },
  { id: "history",   label: "历史记录" },
  { id: "analytics", label: "数据分析" },
  { id: "rules",     label: "合规规则" },
];

export default function Header({
  page, setPage,
  viewerCount = 0, utteranceCount = 0,
  isPaused, setIsPaused, onReset, onExport, onEnd,
  sessionStats = {}, currentSource, onSwitchSource,
  connectionStatus,
}) {
  const totalForRate = sessionStats.total || utteranceCount || 0;
  const trapRate = totalForRate > 0
    ? Math.round((sessionStats.trap || 0) / totalForRate * 100)
    : 0;

  return (
    <header style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 20px", gap: 16 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>{"\u{1f6e1}\ufe0f"}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>StreamGuard</span>
        </div>

        {/* Connection badge */}
        {connectionStatus && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 10px", borderRadius: 12, fontSize: 12,
            background: connectionStatus.connected ? "var(--fact-bg)"
              : connectionStatus.error ? "var(--trap-bg)"
              : "rgba(88,166,255,0.1)",
            color: connectionStatus.connected ? "var(--fact)"
              : connectionStatus.error ? "var(--trap)"
              : "var(--accent)",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "currentColor",
              animation: !connectionStatus.connected && !connectionStatus.error ? "blink 1s infinite" : "none",
            }} />
            {connectionStatus.connected
              ? `已连接 ${connectionStatus.roomId}`
              : connectionStatus.error ? "连接失败" : "连接中…"}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", gap: 14, marginLeft: "auto", alignItems: "center", fontSize: 12, color: "var(--text-secondary)" }}>
          <span>{"\u{1f441}"} {viewerCount.toLocaleString()}</span>
          <span>{"\u{1f4ac}"} {utteranceCount}</span>
          <Stat color="var(--fact)" value={sessionStats.fact || 0} label="事实" />
          <Stat color="var(--hype)" value={sessionStats.hype || 0} label="夸大" />
          <Stat color="var(--trap)" value={sessionStats.trap || 0} label="陷阱" />
          {trapRate > 0 && (
            <span style={{
              fontWeight: 600,
              color: trapRate >= 30 ? "var(--trap)" : trapRate >= 15 ? "var(--hype)" : "var(--fact)",
            }}>
              风险 {trapRate}%
            </span>
          )}
          {isPaused && (
            <span style={{ color: "var(--hype)", fontWeight: 600 }}>⏸ 已暂停</span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {currentSource && (
            <Btn onClick={onSwitchSource}>
              {currentSource === "mock" ? "模拟" : "抖音"} ⋮
            </Btn>
          )}
          <Btn onClick={() => setIsPaused(p => !p)}>
            {isPaused ? "▶ 继续" : "⏸ 暂停"}
          </Btn>
          <Btn onClick={onReset}>重置</Btn>
          <Btn onClick={onExport}>导出</Btn>
          {onEnd && (
            <Btn onClick={onEnd} danger>
              ⏹ 结束监控
            </Btn>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", padding: "0 20px" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setPage(tab.id)} style={{
            padding: "8px 16px", background: "none", border: "none",
            borderBottom: page === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
            color: page === tab.id ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: page === tab.id ? 600 : 400,
            fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}

function Stat({ color, label, value }) {
  return <span><span style={{ color, fontWeight: 600 }}>{value}</span> {label}</span>;
}

function Btn({ onClick, children, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", borderRadius: 6,
      background: danger ? "rgba(248,81,73,0.12)" : "var(--bg-tertiary)",
      border: danger ? "1px solid rgba(248,81,73,0.4)" : "1px solid var(--border)",
      color: danger ? "#f85149" : "var(--text-secondary)",
      fontSize: 11, cursor: "pointer", fontWeight: danger ? 600 : 400,
    }}>
      {children}
    </button>
  );
}
