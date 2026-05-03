import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricTile, StatusBadge } from "./ui";

const RISK_LABELS = {
  "Price Transparency": "价格透明",
  "Pressure Level": "话术压力",
  Accuracy: "描述真实",
  Urgency: "紧迫感",
  Evidence: "证据充分",
  Compliance: "合规表现",
  价格透明度: "价格透明",
  话术压力值: "话术压力",
  描述真实度: "描述真实",
  时间紧迫感: "紧迫感",
  证据充分性: "证据充分",
  合规得分: "合规表现",
};

function riskColor(value) {
  if (value >= 70) return "#ef6262";
  if (value >= 45) return "#d79b30";
  return "#2fb47a";
}

function normalizeRiskDimension(item) {
  const subject = item.subject || item.name || "--";
  const value = Number(item.value || 0);
  const isPressure = /Pressure|Urgency|压力|紧迫/.test(subject);
  return {
    subject,
    label: RISK_LABELS[subject] || subject,
    value,
    risk: isPressure ? value : Math.max(0, 100 - value),
  };
}

function typeRisk(type, score) {
  if (type === "trap") return 92;
  if (type === "hype") return 58;
  if (typeof score === "number") return Math.round((1 - score) * 100);
  return 18;
}

export default function RiskInsightSidebar({
  rationalityIndex = 0,
  riskData = [],
  alerts = [],
  utterances = [],
  messageTotals = { utterances: 0, chats: 0, total: 0 },
  viewerCount = 0,
  onJumpTo,
}) {
  const stats = useMemo(() => {
    const fact = utterances.filter((u) => u.type === "fact").length;
    const hype = utterances.filter((u) => u.type === "hype").length;
    const trap = utterances.filter((u) => u.type === "trap").length;
    const total = messageTotals.utterances || utterances.length || 0;
    const riskRate = total ? Math.round(((hype + trap) / total) * 100) : 0;
    return { fact, hype, trap, total, riskRate };
  }, [messageTotals.utterances, utterances]);

  const riskLevel = rationalityIndex >= 70 ? "低风险" : rationalityIndex >= 40 ? "观察中" : "高风险";
  const riskTone = rationalityIndex >= 70 ? "success" : rationalityIndex >= 40 ? "warning" : "danger";
  const riskScore = Math.max(0, Math.min(100, 100 - Math.round(rationalityIndex || 0)));

  const dimensionData = useMemo(
    () => (riskData || []).map(normalizeRiskDimension).sort((a, b) => b.risk - a.risk).slice(0, 6),
    [riskData],
  );

  const trendData = useMemo(() => {
    const rows = [...utterances].reverse().slice(-14);
    if (!rows.length) return [{ name: "待采集", risk: 0 }];
    return rows.map((u, index) => ({
      name: `${index + 1}`,
      risk: typeRisk(u.type, u.score),
      type: u.type,
    }));
  }, [utterances]);

  return (
    <aside className="sg-risk-rail">
      <div className="sg-risk-rail-head">
        <div>
          <div className="sg-risk-eyebrow">Risk Intelligence</div>
          <div className="sg-risk-title">风险分析</div>
        </div>
        <StatusBadge tone={riskTone}>{riskLevel}</StatusBadge>
      </div>

      <section className="sg-risk-score-card">
        <div
          className="sg-risk-orbit"
          style={{ "--risk-score": `${riskScore * 3.6}deg`, "--risk-color": riskColor(riskScore) }}
        >
          <div className="sg-risk-orbit-inner">
            <span className="mono">{riskScore}</span>
            <small>risk</small>
          </div>
        </div>
        <div className="sg-risk-score-copy">
          <div className="sg-risk-score-label">综合风险热度</div>
          <div className="sg-risk-score-desc">
            基于话术类型、理性指数和维度雷达实时计算。
          </div>
        </div>
      </section>

      <div className="sg-risk-kpi-grid">
        <MetricTile label="高危" value={stats.trap} tone="danger" />
        <MetricTile label="夸大" value={stats.hype} tone="warning" />
        <MetricTile label="风险率" value={`${stats.riskRate}%`} tone={riskTone} />
        <MetricTile label="观众" value={viewerCount || 0} />
      </div>

      <section className="sg-risk-panel">
        <div className="sg-risk-panel-head">
          <span>风险走势</span>
          <span className="mono">{stats.total} utterances</span>
        </div>
        <div className="sg-risk-trend">
          <ResponsiveContainer width="100%" height={96}>
            <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="riskTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef6262" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="#ef6262" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(120, 173, 255, 0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#7f91aa", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6f8198", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ stroke: "rgba(120,173,255,0.18)" }}
                contentStyle={{ background: "#101a29", border: "1px solid #314866", borderRadius: 6, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="risk" stroke="#ef6262" fill="url(#riskTrendFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="sg-risk-panel">
        <div className="sg-risk-panel-head">
          <span>维度热区</span>
          <span>top {dimensionData.length}</span>
        </div>
        <div className="sg-risk-bars">
          <ResponsiveContainer width="100%" height={154}>
            <BarChart data={dimensionData} layout="vertical" margin={{ top: 4, right: 10, bottom: 0, left: 52 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "#aabbd2", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ fill: "rgba(120,173,255,0.05)" }}
                contentStyle={{ background: "#101a29", border: "1px solid #314866", borderRadius: 6, fontSize: 12 }}
              />
              <Bar dataKey="risk" radius={[3, 3, 3, 3]} barSize={10}>
                {dimensionData.map((entry) => (
                  <Cell key={entry.subject} fill={riskColor(entry.risk)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="sg-risk-panel sg-risk-alert-panel">
        <div className="sg-risk-panel-head">
          <span>高危队列</span>
          <span>{alerts?.length || 0} 条</span>
        </div>
        <div className="sg-risk-alert-list">
          {(alerts || []).slice(0, 4).map((alert) => {
            const clickable = !!alert.utteranceId;
            return (
              <button
                key={alert.id}
                className="sg-risk-alert-row"
                onClick={() => clickable && onJumpTo?.(alert.utteranceId)}
                disabled={!clickable}
              >
                <div className="sg-risk-alert-top">
                  <span className="mono">score {alert.score ?? "--"}</span>
                  <span>{alert.timestamp || "--"}</span>
                </div>
                <p>{alert.text}</p>
              </button>
            );
          })}
          {(!alerts || alerts.length === 0) && (
            <div className="sg-risk-empty">暂无高危话术，继续监听实时流。</div>
          )}
        </div>
      </section>
    </aside>
  );
}
