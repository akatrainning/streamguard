const TABS = [
  { id: "dashboard", label: "\u5b9e\u65f6\u76d1\u63a7" },
  { id: "history",   label: "\u5386\u53f2\u8bb0\u5f55" },
  { id: "analytics", label: "\u6570\u636e\u5206\u6790" },
  { id: "rules",     label: "\u5408\u89c4\u89c4\u5219" },
];

export default function Header({
  page, setPage,
  viewerCount = 0, utteranceCount = 0,
  isPaused, setIsPaused, onReset, onExport,
  sessionStats = {}, currentSource, onSwitchSource,
  connectionStatus,
}) {
  const trapRate = utteranceCount > 0
    ? Math.round((sessionStats.trap || 0) / utteranceCount * 100)
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
              ? `\u5df2\u8fde\u63a5 ${connectionStatus.roomId}`
              : connectionStatus.error ? "\u8fde\u63a5\u5931\u8d25" : "\u8fde\u63a5\u4e2d\u2026"}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "flex", gap: 14, marginLeft: "auto", alignItems: "center", fontSize: 12, color: "var(--text-secondary)" }}>
          <span>{"\u{1f441}"} {viewerCount.toLocaleString()}</span>
          <span>{"\u{1f4ac}"} {utteranceCount}</span>
          <Stat color="var(--fact)" value={sessionStats.fact || 0} label="\u4e8b\u5b9e" />
          <Stat color="var(--hype)" value={sessionStats.hype || 0} label="\u5938\u5927" />
          <Stat color="var(--trap)" value={sessionStats.trap || 0} label="\u9677\u9631" />
          {trapRate > 0 && (
            <span style={{
              fontWeight: 600,
              color: trapRate >= 30 ? "var(--trap)" : trapRate >= 15 ? "var(--hype)" : "var(--fact)",
            }}>
              {"\u98ce\u9669"} {trapRate}%
            </span>
          )}
          {isPaused && (
            <span style={{ color: "var(--hype)", fontWeight: 600 }}>{"\u23f8"} \u5df2\u6682\u505c</span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {currentSource && (
            <Btn onClick={onSwitchSource}>
              {currentSource === "mock" ? "\u6a21\u62df" : "\u6296\u97f3"} \u25be
            </Btn>
          )}
          <Btn onClick={() => setIsPaused(p => !p)}>
            {isPaused ? "\u25b6 \u7ee7\u7eed" : "\u23f8 \u6682\u505c"}
          </Btn>
          <Btn onClick={onReset}>{"\u91cd\u7f6e"}</Btn>
          <Btn onClick={onExport}>{"\u5bfc\u51fa"}</Btn>
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

function Btn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", borderRadius: 6,
      background: "var(--bg-tertiary)", border: "1px solid var(--border)",
      color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
    }}>
      {children}
    </button>
  );
}
