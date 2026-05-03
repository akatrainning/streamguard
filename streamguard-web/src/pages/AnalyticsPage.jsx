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

const TREND = [
  { day: "02-24", ri: 82, trap: 3, hype: 10, fact: 28 },
  { day: "02-25", ri: 75, trap: 5, hype: 14, fact: 22 },
  { day: "02-26", ri: 68, trap: 7, hype: 16, fact: 19 },
  { day: "02-27", ri: 44, trap: 14, hype: 12, fact: 18 },
  { day: "02-28", ri: 79, trap: 4, hype: 9, fact: 31 },
  { day: "03-01", ri: 58, trap: 9, hype: 18, fact: 15 },
  { day: "03-02", ri: 72, trap: 6, hype: 11, fact: 24 },
];

const PIE = [
  { name: "事实话术", value: 157, color: "var(--fact)" },
  { name: "夸大话术", value: 90, color: "var(--hype)" },
  { name: "陷阱话术", value: 48, color: "var(--trap)" },
];

const RADAR_AVG = [
  { subject: "价格透明", value: 76 },
  { subject: "话术压力", value: 48 },
  { subject: "描述真实", value: 64 },
  { subject: "限时刺激", value: 58 },
  { subject: "证据充分", value: 71 },
  { subject: "合规得分", value: 68 },
];

const tipStyle = {
  background: "#101112",
  border: "1px solid #30332f",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};

export default function AnalyticsPage() {
  const avgRI = Math.round(TREND.reduce((sum, row) => sum + row.ri, 0) / TREND.length);
  const totalTrap = TREND.reduce((sum, row) => sum + row.trap, 0);
  const totalAll = TREND.reduce((sum, row) => sum + row.trap + row.hype + row.fact, 0);
  const trapRate = ((totalTrap / totalAll) * 100).toFixed(1);
  const avgTone = avgRI >= 70 ? "success" : avgRI >= 50 ? "warning" : "danger";

  return (
    <main className="sg-analytics-page">
      <header className="sg-analytics-head">
        <div>
          <div className="sg-ui-eyebrow">Analytics</div>
          <h1>数据洞察</h1>
          <p>近 7 日风险走势、话术结构与合规维度。只保留运营判断需要的指标。</p>
        </div>
        <StatusBadge tone={avgTone}>平均理性指数 {avgRI}</StatusBadge>
      </header>

      <section className="sg-analytics-kpis">
        <MetricTile label="分析场次" value="288" />
        <MetricTile label="平均理性指数" value={avgRI} tone={avgTone} />
        <MetricTile label="陷阱话术率" value={`${trapRate}%`} tone="danger" />
        <MetricTile label="预警触发" value="47" tone="warning" />
      </section>

      <section className="sg-analytics-grid is-primary">
        <Panel title="近 7 日理性指数" eyebrow="Rationality Trend" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={TREND}>
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
              <Pie data={PIE} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" paddingAngle={3}>
                {PIE.map((entry) => <Cell key={entry.name} fill={entry.color} fillOpacity={0.86} />)}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="sg-analytics-legend">
            {PIE.map((item) => (
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
            <BarChart data={TREND} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
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
            <RadarChart data={RADAR_AVG} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
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
