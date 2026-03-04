export const NAV_TABS = [
  { id: "dashboard", label: "实时总览", description: "查看直播监控、语义风险、关系拓扑和告警状态。" },
  { id: "discover", label: "直播发现", description: "搜索直播间并进行横向对比，快速切换目标房间。" },
  { id: "consumer", label: "消费建议", description: "结合直播内容和用户需求给出购买与避坑建议。" },
  { id: "history", label: "历史记录", description: "回顾往期会话，追踪风险变化与关键证据片段。" },
  { id: "analytics", label: "深度分析", description: "从统计维度观察趋势、分布、模型判定稳定性。" },
  { id: "rules", label: "规则中心", description: "查看判定规则与阈值，校准风控策略和解释口径。" },
];

export default function Header({
  page,
  setPage,
  viewerCount = 0,
  utteranceCount = 0,
  isPaused,
  setIsPaused,
  onReset,
  onExport,
  onEnd,
  sessionStats = {},
  currentSource,
  onSwitchSource,
  connectionStatus,
  showTabs = true,
}) {
  const totalForRate = sessionStats.total || utteranceCount || 0;
  const trapRate = totalForRate > 0
    ? Math.round((sessionStats.trap || 0) / totalForRate * 100)
    : 0;
  const activeTab = NAV_TABS.find((tab) => tab.id === page) || NAV_TABS[0];

  return (
    <header style={{
      background: "linear-gradient(180deg, rgba(16,26,41,0.96), rgba(16,26,41,0.86))",
      borderBottom: "1px solid #2b3d56",
      boxShadow: "0 10px 22px rgba(4,9,16,0.26)",
    }}>
      <div style={{ display: "flex", alignItems: "center", padding: "14px 22px", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{
            fontSize: 17,
            padding: "5px 8px",
            borderRadius: 8,
            background: "var(--accent-soft)",
            border: "1px solid rgba(63,140,255,0.38)",
          }}>{"\u{1f6e1}\ufe0f"}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>StreamGuard</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5 }}>Live Monitoring Console</span>
          </div>
        </div>

        {connectionStatus && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 999, fontSize: 12,
            background: connectionStatus.connected ? "var(--fact-bg)"
              : connectionStatus.error ? "var(--trap-bg)"
              : "var(--accent-soft)",
            border: connectionStatus.connected ? "1px solid var(--fact-border)"
              : connectionStatus.error ? "1px solid var(--trap-border)"
              : "1px solid rgba(63,140,255,0.3)",
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
              : connectionStatus.error ? "连接失败" : "连接中..."}
          </div>
        )}

        <div style={{
          display: "flex",
          gap: 10,
          marginLeft: "auto",
          alignItems: "center",
          fontSize: 13,
          color: "var(--text-secondary)",
          flexWrap: "wrap",
        }}>
          <StatPill label="观众" value={viewerCount.toLocaleString()} />
          <StatPill label="话术" value={utteranceCount} />
          <Stat color="var(--fact)" value={sessionStats.fact || 0} label="事实" />
          <Stat color="var(--hype)" value={sessionStats.hype || 0} label="夸大" />
          <Stat color="var(--trap)" value={sessionStats.trap || 0} label="陷阱" />
          {trapRate > 0 && (
            <span style={{
              fontWeight: 700,
              color: trapRate >= 30 ? "var(--trap)" : trapRate >= 15 ? "var(--hype)" : "var(--fact)",
            }}>
              风险 {trapRate}%
            </span>
          )}
          {isPaused && (
            <span style={{ color: "var(--hype)", fontWeight: 700 }}>{"\u23f8"} 已暂停</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {currentSource && (
            <Btn onClick={onSwitchSource}>
              {currentSource === "mock" ? "模拟" : "抖音"} \u25be
            </Btn>
          )}
          <Btn onClick={() => setIsPaused((p) => !p)}>
            {isPaused ? "\u25b6 继续" : "\u23f8 暂停"}
          </Btn>
          <Btn onClick={onReset}>重置</Btn>
          <Btn onClick={onExport}>导出</Btn>
          {onEnd && (
            <Btn onClick={onEnd} danger>
              结束会话
            </Btn>
          )}
        </div>
      </div>

      {showTabs && (
        <>
          <div style={{
            display: "flex",
            padding: "0 20px",
            borderBottom: "1px solid #2b3d56",
            gap: 4,
          }}>
            {NAV_TABS.map((tab) => (
              <button key={tab.id} onClick={() => setPage(tab.id)} style={{
                padding: "12px 17px",
                marginBottom: -1,
                background: page === tab.id ? "rgba(63,140,255,0.1)" : "transparent",
                border: page === tab.id ? "1px solid rgba(63,140,255,0.34)" : "1px solid transparent",
                borderBottom: page === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                color: page === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: page === tab.id ? 700 : 500,
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
              border: "1px solid #2d405d",
              borderTop: "none",
              borderRadius: "0 10px 10px 10px",
              background: "linear-gradient(180deg, rgba(20,33,50,0.75), rgba(15,24,37,0.9))",
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
        </>
      )}
    </header>
  );
}

function Stat({ color, label, value }) {
  return (
    <span style={{
      padding: "4px 8px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.02)",
      fontSize: 12,
    }}>
      <span style={{ color, fontWeight: 700, marginRight: 4 }}>{value}</span>{label}
    </span>
  );
}

function StatPill({ label, value }) {
  return (
    <span style={{
      padding: "4px 8px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      background: "rgba(255,255,255,0.02)",
      fontSize: 12,
    }}>
      <span style={{ color: "var(--text-muted)", marginRight: 5 }}>{label}</span>
      <span className="mono" style={{ color: "var(--text-primary)" }}>{value}</span>
    </span>
  );
}

function Btn({ onClick, children, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 10px",
      borderRadius: 8,
      background: danger ? "var(--trap-bg)" : "linear-gradient(180deg, rgba(28,43,65,0.95), rgba(22,35,52,0.95))",
      border: danger ? "1px solid var(--trap-border)" : "1px solid #355072",
      color: danger ? "var(--trap)" : "var(--text-secondary)",
      fontSize: 12,
      cursor: "pointer",
      fontWeight: danger ? 700 : 500,
      boxShadow: "0 5px 12px rgba(0,0,0,0.18)",
    }}>
      {children}
    </button>
  );
}
