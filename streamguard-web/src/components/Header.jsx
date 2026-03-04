const TABS = [
  { id: "dashboard", label: "实时监控", description: "集中查看直播监控全景与关键风险信号。" },
  { id: "discover", label: "🔍 发现直播", description: "按关键词发现目标直播间并快速切换监控。" },
  { id: "consumer", label: "消费决策", description: "基于实时证据给出更稳健的消费建议。" },
  { id: "history", label: "历史记录", description: "回看历史会话、事件与关键结论，便于复盘。" },
  { id: "analytics", label: "数据分析", description: "汇总趋势与统计，定位高频异常与变化原因。" },
  { id: "rules", label: "合规规则", description: "维护规则与阈值配置，提升命中率和稳定性。" },
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
  const activeTab = TABS.find((tab) => tab.id === page) || TABS[0];

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
          <Btn onClick={() => setIsPaused((p) => !p)}>
            {isPaused ? "\u25b6 \u7ee7\u7eed" : "\u23f8 \u6682\u505c"}
          </Btn>
          <Btn onClick={onReset}>{"\u91cd\u7f6e"}</Btn>
          <Btn onClick={onExport}>{"\u5bfc\u51fa"}</Btn>
          {onEnd && (
            <Btn onClick={onEnd} danger>
              ⏹ 结束监控
            </Btn>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        padding: "0 20px",
        borderBottom: "1px solid var(--border)",
      }}>
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setPage(tab.id)} style={{
            padding: "10px 18px",
            marginBottom: -1,
            background: page === tab.id ? "rgba(255,255,255,0.03)" : "transparent",
            border: page === tab.id ? "1px solid var(--border)" : "1px solid transparent",
            borderBottom: page === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
            borderTopLeftRadius: 10,
            borderTopRightRadius: 10,
            color: page === tab.id ? "var(--text-primary)" : "var(--text-muted)",
            fontWeight: page === tab.id ? 700 : 500,
            textShadow: page === tab.id ? "0 0 10px rgba(88,166,255,0.28)" : "none",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all .16s ease",
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 20px 12px" }}>
        <div style={{
          border: "1px solid var(--border)",
          borderTop: "none",
          borderRadius: "0 10px 10px 10px",
          background: "linear-gradient(180deg, rgba(33,38,45,0.85), rgba(22,27,34,0.9))",
          padding: "14px 18px",
        }}>
          <span style={{
            color: "var(--text-secondary)",
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            {activeTab.description}
          </span>
        </div>
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
