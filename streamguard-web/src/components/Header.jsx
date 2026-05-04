import { Button, StatusBadge, StreamGuardMark } from "./ui";

export const NAV_TABS = [
  { id: "dashboard", label: "实时总览", description: "查看直播监控、语义风险、告警状态和处置线索。" },
  { id: "discover", label: "直播发现", description: "搜索直播间并横向对比，快速切换目标房间。" },
  { id: "consumer", label: "消费建议", description: "结合直播内容和用户需求，给出购买与避坑建议。" },
  { id: "history", label: "历史记录", description: "回看往期会话，追踪风险变化与关键证据片段。" },
  { id: "rules", label: "规则中心", description: "查看合规规则、证据要求和安全改写口径。" },
  { id: "analytics", label: "数据洞察", description: "从统计维度观察趋势、分布和模型判定稳定性。" },
  { id: "profile", label: "个人主页", description: "管理账号资料、头像和个人信息。" },
];

NAV_TABS.splice(
  Math.max(0, NAV_TABS.findIndex((tab) => tab.id === "profile")),
  0,
  { id: "rag", label: "RAG 证据", description: "查看知识库证据地图、直播间总评和审核问答。" }
);

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
  connectionStatus,
  showTabs = true,
}) {
  const totalForRate = sessionStats.total || utteranceCount || 0;
  const trapRate = totalForRate > 0
    ? Math.round(((sessionStats.trap || 0) / totalForRate) * 100)
    : 0;
  const activeTab = NAV_TABS.find((tab) => tab.id === page) || NAV_TABS[0];

  return (
    <header className="sg-app-header">
      <div className="sg-app-header-main">
        <div className="sg-lockup">
          <StreamGuardMark gradientId="sgHeaderMark" />
          <div className="sg-lockup-copy">
            <span className="sg-lockup-title">StreamGuard</span>
            <span className="sg-lockup-subtitle">Live Monitoring Console</span>
          </div>
        </div>

        {connectionStatus && (
          <StatusBadge tone={connectionStatus.connected ? "success" : connectionStatus.error ? "danger" : "neutral"}>
            {connectionStatus.connected
              ? `已连接 ${connectionStatus.roomId}`
              : connectionStatus.error ? "连接失败" : "连接中"}
          </StatusBadge>
        )}

        <div className="sg-app-header-stats">
          <StatPill label="观众" value={viewerCount.toLocaleString()} />
          <StatPill label="语义" value={utteranceCount} />
          <Stat color="var(--fact)" value={sessionStats.fact || 0} label="FACT" />
          <Stat color="var(--hype)" value={sessionStats.hype || 0} label="HYPE" />
          <Stat color="var(--trap)" value={sessionStats.trap || 0} label="TRAP" />
          {trapRate > 0 && (
            <span
              className="sg-app-header-risk"
              style={{ color: trapRate >= 30 ? "var(--trap)" : trapRate >= 15 ? "var(--hype)" : "var(--fact)" }}
            >
              风险 {trapRate}%
            </span>
          )}
          {isPaused && <span className="sg-app-header-paused">已暂停</span>}
        </div>

        <div className="sg-app-header-actions">
          <Button onClick={() => setIsPaused((paused) => !paused)}>
            {isPaused ? "继续" : "暂停"}
          </Button>
          <Button onClick={onReset}>重置</Button>
          <Button onClick={onExport}>导出</Button>
          {onEnd && (
            <Button onClick={onEnd} variant="danger">
              结束会话
            </Button>
          )}
        </div>
      </div>

      {showTabs && (
        <>
          <nav className="sg-app-tabs">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                className={page === tab.id ? "is-active" : ""}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="sg-app-tab-context">
            <div>{activeTab.description}</div>
          </div>
        </>
      )}
    </header>
  );
}

function Stat({ color, label, value }) {
  return (
    <span className="sg-app-stat">
      <strong style={{ color }}>{value}</strong>
      {label}
    </span>
  );
}

function StatPill({ label, value }) {
  return (
    <span className="sg-app-stat">
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </span>
  );
}
