import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricTile, Panel, StatusBadge } from "../components/ui";
import { getHistorySession, listHistorySessions } from "../utils/historyApi";

const EMPTY_TREND = [{ day: "--", ri: 0, trap: 0, hype: 0, fact: 0 }];
const EMPTY_PIE = [
  { name: "事实话术", value: 0, color: "var(--fact)" },
  { name: "夸大话术", value: 0, color: "var(--hype)" },
  { name: "陷阱话术", value: 0, color: "var(--trap)" },
];
const EMPTY_RADAR = [
  { subject: "价格透明", value: 0 },
  { subject: "话术压力", value: 0 },
  { subject: "描述真实", value: 0 },
  { subject: "限时刺激", value: 0 },
  { subject: "证据充分", value: 0 },
  { subject: "合规得分", value: 0 },
];

const tipStyle = {
  background: "#101112",
  border: "1px solid #30332f",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};

function parseSessionTime(session) {
  if (session?.startTime) return new Date(session.startTime);
  if (session?.date) {
    const parsed = new Date(session.date.replace(/-/g, "/"));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function formatDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function buildFallbackRadar(totals, avgRI) {
  const totalAll = totals.fact + totals.hype + totals.trap;
  const factRatio = totalAll ? totals.fact / totalAll : 0;
  const hypeRatio = totalAll ? totals.hype / totalAll : 0;
  const trapRatio = totalAll ? totals.trap / totalAll : 0;
  return [
    { subject: "价格透明", value: Math.round(50 + factRatio * 45) },
    { subject: "话术压力", value: Math.round(35 + hypeRatio * 30 + trapRatio * 35) },
    { subject: "描述真实", value: Math.round(45 + factRatio * 50) },
    { subject: "限时刺激", value: Math.round(30 + trapRatio * 60) },
    { subject: "证据充分", value: Math.round(45 + factRatio * 45) },
    { subject: "合规得分", value: Math.round(avgRI || 0) },
  ];
}

export default function AnalyticsPage({ apiBase = "http://localhost:8011", token }) {
  const [sessions, setSessions] = useState([]);
  const [latestRiskData, setLatestRiskData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!token) return undefined;
    setLoading(true);
    setError("");
    listHistorySessions(apiBase, token, 120)
      .then((payload) => {
        if (!alive) return;
        const items = payload?.items || [];
        setSessions(items);
        const latestId = items[0]?.id;
        if (!latestId) return null;
        return getHistorySession(apiBase, token, latestId);
      })
      .then((detail) => {
        if (!alive || !detail?.snapshot?.riskData) return;
        setLatestRiskData(detail.snapshot.riskData || []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || "数据加载失败");
        setSessions([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [apiBase, token]);

  const totals = useMemo(() => {
    return sessions.reduce(
      (acc, session) => {
        acc.fact += session.fact || 0;
        acc.hype += session.hype || 0;
        acc.trap += session.trap || 0;
        acc.scoreSum += session.score || 0;
        acc.count += 1;
        return acc;
      },
      { fact: 0, hype: 0, trap: 0, scoreSum: 0, count: 0 },
    );
  }, [sessions]);

  const avgRI = totals.count ? Math.round(totals.scoreSum / totals.count) : 0;
  const totalAll = totals.fact + totals.hype + totals.trap;
  const trapRate = totalAll ? ((totals.trap / totalAll) * 100).toFixed(1) : "0.0";
  const alertCount = sessions.filter((item) => {
    const total = item.total || item.fact + item.hype + item.trap || 0;
    const trapRatio = total ? (item.trap || 0) / total : 0;
    return (item.score || 0) < 50 || trapRatio >= 0.2;
  }).length;
  const avgTone = avgRI >= 70 ? "success" : avgRI >= 50 ? "warning" : "danger";

  const trendData = useMemo(() => {
    if (!sessions.length) return EMPTY_TREND;
    const buckets = new Map();
    sessions.forEach((session) => {
      const date = parseSessionTime(session);
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const bucket = buckets.get(dayKey) || {
        day: formatDay(date),
        dayKey,
        riSum: 0,
        count: 0,
        trap: 0,
        hype: 0,
        fact: 0,
      };
      bucket.riSum += session.score || 0;
      bucket.count += 1;
      bucket.trap += session.trap || 0;
      bucket.hype += session.hype || 0;
      bucket.fact += session.fact || 0;
      buckets.set(dayKey, bucket);
    });
    const rows = Array.from(buckets.values())
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .slice(-7)
      .map((row) => ({
        day: row.day,
        ri: row.count ? Math.round(row.riSum / row.count) : 0,
        trap: row.trap,
        hype: row.hype,
        fact: row.fact,
      }));
    return rows.length ? rows : EMPTY_TREND;
  }, [sessions]);

  const pieData = useMemo(() => {
    if (!totalAll) return EMPTY_PIE;
    return [
      { name: "事实话术", value: totals.fact, color: "var(--fact)" },
      { name: "夸大话术", value: totals.hype, color: "var(--hype)" },
      { name: "陷阱话术", value: totals.trap, color: "var(--trap)" },
    ];
  }, [totals, totalAll]);

  const radarData = useMemo(() => {
    if (latestRiskData?.length) return latestRiskData;
    if (!sessions.length) return EMPTY_RADAR;
    return buildFallbackRadar(totals, avgRI);
  }, [latestRiskData, sessions.length, totals, avgRI]);

  const headline = loading
    ? "正在读取历史记录..."
    : sessions.length
      ? `已汇总 ${sessions.length} 场历史记录。`
      : "暂无历史记录，请先完成一次直播监测。";

  return (
    <main className="sg-analytics-page">
      <header className="sg-analytics-head">
        <div>
          <div className="sg-ui-eyebrow">Analytics</div>
          <h1>数据洞察</h1>
          <p>{headline}</p>
        </div>
        <StatusBadge tone={avgTone}>平均理性指数 {avgRI}</StatusBadge>
      </header>

      {error && <div className="sg-history-error">{error}</div>}

      <section className="sg-analytics-kpis">
        <MetricTile label="分析场次" value={sessions.length || 0} />
        <MetricTile label="平均理性指数" value={avgRI} tone={avgTone} />
        <MetricTile label="陷阱话术率" value={`${trapRate}%`} tone="danger" />
        <MetricTile label="预警触发" value={alertCount} tone="warning" />
      </section>

      <section className="sg-analytics-grid is-primary">
        <Panel title="近 7 日理性指数" eyebrow="Rationality Trend" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="analyticsRiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tipStyle} />
              <Area
                type="monotone"
                dataKey="ri"
                name="理性指数"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#analyticsRiFill)"
                dot={{ fill: "var(--accent)", r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="话术类型占比" eyebrow="Speech Mix" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={164}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" paddingAngle={3}>
                {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} fillOpacity={0.86} />)}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="sg-analytics-legend">
            {pieData.map((item) => (
              <div key={item.name}>
                <i style={{ background: item.color }} />
                <span>{item.name}</span>
                <strong className="mono" style={{ color: item.color }}>{item.value}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="sg-analytics-grid is-secondary">
        <Panel title="每日话术分布" eyebrow="Stacked Distribution" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={196}>
            <BarChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
              <XAxis dataKey="day" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tipStyle} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
              <Bar dataKey="fact" name="事实" stackId="a" fill="var(--fact)" fillOpacity={0.72} />
              <Bar dataKey="hype" name="夸大" stackId="a" fill="var(--hype)" fillOpacity={0.72} />
              <Bar dataKey="trap" name="陷阱" stackId="a" fill="var(--trap)" fillOpacity={0.86} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="风险维度均值" eyebrow="Risk Dimensions" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={196}>
            <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <PolarGrid stroke="rgba(246,255,95,0.14)" gridType="polygon" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
              <Radar
                dataKey="value"
                stroke="var(--accent)"
                fill="rgba(246,255,95,0.1)"
                strokeWidth={1.5}
                dot={{ fill: "var(--accent)", r: 2, strokeWidth: 0 }}
              />
              <Tooltip contentStyle={tipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </section>
    </main>
  );
}
