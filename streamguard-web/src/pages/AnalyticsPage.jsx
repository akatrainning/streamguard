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

const PRESET_SESSION_SEEDS = [
  {
    id: "preset-01",
    roomTitle: "美妆秒杀专场",
    anchorName: "南桥优选",
    platform: "抖音",
    category: "美妆",
    score: 86,
    fact: 52,
    hype: 8,
    trap: 2,
    alerts: 2,
    evidence: 19,
    viewerCount: 18320,
    responseMinutes: 4,
    action: "抽样复核",
  },
  {
    id: "preset-02",
    roomTitle: "家电福利夜",
    anchorName: "成华电器仓",
    platform: "快手",
    category: "家电",
    score: 67,
    fact: 36,
    hype: 17,
    trap: 7,
    alerts: 7,
    evidence: 28,
    viewerCount: 24780,
    responseMinutes: 8,
    action: "人工确认",
  },
  {
    id: "preset-03",
    roomTitle: "滋补保健清仓",
    anchorName: "青禾滋补",
    platform: "抖音",
    category: "保健",
    score: 43,
    fact: 18,
    hype: 29,
    trap: 15,
    alerts: 13,
    evidence: 36,
    viewerCount: 31940,
    responseMinutes: 12,
    action: "高危处置",
  },
  {
    id: "preset-04",
    roomTitle: "母婴好物测评",
    anchorName: "西巷妈妈团",
    platform: "视频号",
    category: "母婴",
    score: 78,
    fact: 44,
    hype: 12,
    trap: 4,
    alerts: 3,
    evidence: 21,
    viewerCount: 12650,
    responseMinutes: 5,
    action: "持续观察",
  },
  {
    id: "preset-05",
    roomTitle: "珠宝源头直供",
    anchorName: "锦城珠宝",
    platform: "抖音",
    category: "珠宝",
    score: 58,
    fact: 24,
    hype: 25,
    trap: 10,
    alerts: 9,
    evidence: 31,
    viewerCount: 22410,
    responseMinutes: 10,
    action: "重点标注",
  },
  {
    id: "preset-06",
    roomTitle: "食品囤货节",
    anchorName: "小满厨房",
    platform: "淘宝",
    category: "食品",
    score: 91,
    fact: 61,
    hype: 5,
    trap: 1,
    alerts: 1,
    evidence: 16,
    viewerCount: 15880,
    responseMinutes: 3,
    action: "正常归档",
  },
  {
    id: "preset-07",
    roomTitle: "数码新品首发",
    anchorName: "极客严选",
    platform: "京东",
    category: "数码",
    score: 73,
    fact: 41,
    hype: 14,
    trap: 5,
    alerts: 4,
    evidence: 24,
    viewerCount: 19740,
    responseMinutes: 6,
    action: "抽样复核",
  },
];

const EMPTY_TREND = [{ day: "--", ri: 0, trap: 0, hype: 0, fact: 0 }];
const SPEECH_COLORS = {
  fact: "var(--fact)",
  hype: "var(--hype)",
  trap: "var(--trap)",
};

const tipStyle = {
  background: "var(--sg-surface-base)",
  border: "1px solid var(--sg-border-base)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 12,
};

function getPresetSessions() {
  const today = new Date();
  return PRESET_SESSION_SEEDS.map((session, index) => {
    const date = new Date(today.getTime() - (PRESET_SESSION_SEEDS.length - 1 - index) * 24 * 60 * 60 * 1000);
    const hour = 10 + (index % 8);
    date.setHours(hour, index % 2 ? 30 : 5, 0, 0);
    return {
      ...session,
      id: `${session.id}-${formatDay(date)}`,
      startTime: date.toISOString(),
      date: date.toISOString(),
      total: session.fact + session.hype + session.trap,
      isPreset: true,
    };
  });
}

function parseSessionTime(session) {
  if (session?.startTime) {
    const parsed = new Date(session.startTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (session?.date) {
    const parsed = new Date(String(session.date).replace(/-/g, "/"));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function formatDay(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function clampMetric(value) {
  return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value || 0));
}

function normalizeSession(session) {
  const fact = Number(session.fact || 0);
  const hype = Number(session.hype || 0);
  const trap = Number(session.trap || 0);
  return {
    ...session,
    fact,
    hype,
    trap,
    total: Number(session.total || fact + hype + trap || 0),
    score: clampMetric(session.score),
    alerts: Number(session.alerts || 0),
    evidence: Number(session.evidence || session.evidenceCount || 0),
    viewerCount: Number(session.viewerCount || session.viewers || 0),
    responseMinutes: Number(session.responseMinutes || 0),
  };
}

function buildFallbackRadar(totals, avgRI) {
  const totalAll = totals.fact + totals.hype + totals.trap;
  const factRatio = totalAll ? totals.fact / totalAll : 0;
  const hypeRatio = totalAll ? totals.hype / totalAll : 0;
  const trapRatio = totalAll ? totals.trap / totalAll : 0;
  return [
    { subject: "价格透明", value: clampMetric(50 + factRatio * 45) },
    { subject: "话术压力", value: clampMetric(35 + hypeRatio * 30 + trapRatio * 35) },
    { subject: "描述真实", value: clampMetric(45 + factRatio * 50) },
    { subject: "限时刺激", value: clampMetric(30 + trapRatio * 60) },
    { subject: "证据充分", value: clampMetric(45 + factRatio * 45) },
    { subject: "合规得分", value: avgRI },
  ];
}

function riskTone(score) {
  if (score >= 75) return "success";
  if (score >= 55) return "warning";
  return "danger";
}

function aggregateByCategory(sessions) {
  const buckets = new Map();
  sessions.forEach((session) => {
    const key = session.category || session.platform || "未分类";
    const bucket = buckets.get(key) || { name: key, sessions: 0, alerts: 0, trap: 0, scoreSum: 0 };
    bucket.sessions += 1;
    bucket.alerts += session.alerts || 0;
    bucket.trap += session.trap || 0;
    bucket.scoreSum += session.score || 0;
    buckets.set(key, bucket);
  });
  return Array.from(buckets.values())
    .map((bucket) => ({
      ...bucket,
      avgScore: bucket.sessions ? Math.round(bucket.scoreSum / bucket.sessions) : 0,
    }))
    .sort((a, b) => b.alerts + b.trap - (a.alerts + a.trap))
    .slice(0, 6);
}

function buildDecisionQueue(sessions) {
  return sessions
    .map((session) => {
      const trapRatio = session.total ? session.trap / session.total : 0;
      const urgency = Math.round((100 - session.score) * 0.58 + trapRatio * 100 * 0.42);
      return { ...session, urgency };
    })
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 5);
}

export default function AnalyticsPage({ apiBase = "http://localhost:8011", token }) {
  const [sessions, setSessions] = useState(() => getPresetSessions());
  const [latestRiskData, setLatestRiskData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      if (!token) {
        setSessions(getPresetSessions());
        setLatestRiskData([]);
        setLastSyncedAt(new Date());
        setLoading(false);
        return;
      }

      try {
        const payload = await listHistorySessions(apiBase, token, 120);
        if (!alive) return;

        const items = (payload?.items || []).map(normalizeSession);
        if (!items.length) {
          setSessions(getPresetSessions());
          setLatestRiskData([]);
          setLastSyncedAt(new Date());
          return;
        }

        setSessions(items);
        setLastSyncedAt(new Date());

        const latestId = items[0]?.id;
        if (!latestId) {
          setLatestRiskData([]);
          return;
        }

        try {
          const detail = await getHistorySession(apiBase, token, latestId);
          if (alive) setLatestRiskData(detail?.snapshot?.riskData || []);
        } catch {
          if (alive) setLatestRiskData([]);
        }
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "历史数据读取失败，已切换为预制演示数据。");
        setSessions(getPresetSessions());
        setLatestRiskData([]);
        setLastSyncedAt(new Date());
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadAnalytics();
    return () => {
      alive = false;
    };
  }, [apiBase, token]);

  const normalizedSessions = useMemo(() => sessions.map(normalizeSession), [sessions]);

  const sortedSessions = useMemo(() => {
    return [...normalizedSessions].sort((a, b) => parseSessionTime(b).getTime() - parseSessionTime(a).getTime());
  }, [normalizedSessions]);

  const totals = useMemo(() => {
    return normalizedSessions.reduce(
      (acc, session) => {
        acc.fact += session.fact;
        acc.hype += session.hype;
        acc.trap += session.trap;
        acc.scoreSum += session.score;
        acc.alerts += session.alerts;
        acc.evidence += session.evidence;
        acc.viewers += session.viewerCount;
        acc.responseMinutes += session.responseMinutes || 0;
        acc.count += 1;
        return acc;
      },
      { fact: 0, hype: 0, trap: 0, scoreSum: 0, alerts: 0, evidence: 0, viewers: 0, responseMinutes: 0, count: 0 },
    );
  }, [normalizedSessions]);

  const avgRI = totals.count ? Math.round(totals.scoreSum / totals.count) : 0;
  const totalAll = totals.fact + totals.hype + totals.trap;
  const trapRate = totalAll ? ((totals.trap / totalAll) * 100).toFixed(1) : "0.0";
  const avgResponse = totals.count ? Math.round(totals.responseMinutes / totals.count) : 0;
  const avgTone = riskTone(avgRI);
  const isPreset = normalizedSessions.some((session) => session.isPreset);
  const latestSession = sortedSessions[0];

  const trendData = useMemo(() => {
    if (!normalizedSessions.length) return EMPTY_TREND;
    const buckets = new Map();
    normalizedSessions.forEach((session) => {
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
      bucket.riSum += session.score;
      bucket.count += 1;
      bucket.trap += session.trap;
      bucket.hype += session.hype;
      bucket.fact += session.fact;
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
  }, [normalizedSessions]);

  const pieData = useMemo(() => {
    return [
      { name: "事实话术", value: totals.fact, color: SPEECH_COLORS.fact },
      { name: "夸大话术", value: totals.hype, color: SPEECH_COLORS.hype },
      { name: "陷阱话术", value: totals.trap, color: SPEECH_COLORS.trap },
    ];
  }, [totals]);

  const radarData = useMemo(() => {
    if (latestRiskData?.length) return latestRiskData;
    return buildFallbackRadar(totals, avgRI);
  }, [latestRiskData, totals, avgRI]);

  const categoryRows = useMemo(() => aggregateByCategory(normalizedSessions), [normalizedSessions]);
  const decisionQueue = useMemo(() => buildDecisionQueue(normalizedSessions), [normalizedSessions]);

  const headline = loading
    ? "正在同步历史监测记录，页面会先保留可读的分析框架。"
    : isPreset
      ? "暂无最新历史记录时，当前展示预制演示数据，便于验证分析版式和风险阅读路径。"
      : `已汇总 ${normalizedSessions.length} 场直播监测记录，最新数据来自 ${latestSession?.roomTitle || "最近一场监测"}。`;

  const syncLabel = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";

  return (
    <main className="sg-analytics-page">
      <header className="sg-analytics-head">
        <div className="sg-analytics-title-block">
          <div className="sg-ui-eyebrow">ANALYTICS COMMAND</div>
          <h1>数据洞察</h1>
          <p>{headline}</p>
        </div>
        <div className="sg-analytics-head-actions">
          <StatusBadge tone={avgTone}>{`平均理性 ${avgRI}`}</StatusBadge>
          <span className="sg-analytics-sync mono">SYNC {syncLabel}</span>
        </div>
      </header>

      {error && <div className="sg-history-error">{error}</div>}

      <section className="sg-analytics-kpis">
        <MetricTile label="分析场次" value={normalizedSessions.length || 0} />
        <MetricTile label="平均理性指数" value={avgRI} tone={avgTone} />
        <MetricTile label="陷阱话术占比" value={`${trapRate}%`} tone="danger" />
        <MetricTile label="证据片段" value={formatNumber(totals.evidence || totalAll)} tone="success" />
      </section>

      <section className="sg-analytics-command">
        <Panel
          title="监测态势总览"
          eyebrow="RISK RADAR"
          className="sg-analytics-stage-panel"
          bodyClassName="sg-analytics-stage-body"
          actions={<span className={`sg-analytics-live-dot is-${loading ? "loading" : "ready"}`}>{loading ? "SYNCING" : "READY"}</span>}
        >
          <div className="sg-analytics-stage-copy">
            <span>当前优先级</span>
            <strong>{avgRI >= 75 ? "稳定复核" : avgRI >= 55 ? "重点观察" : "高危处置"}</strong>
            <p>
              {decisionQueue[0]
                ? `${decisionQueue[0].roomTitle || "最近直播间"} 的风险优先级最高，建议先检查陷阱话术与证据片段。`
                : "暂无监测对象时，系统会展示预制样本保持页面可读。"}
            </p>
          </div>
          <div className="sg-analytics-orbit" style={{ "--score": `${avgRI * 3.6}deg` }}>
            <div className="sg-analytics-orbit-inner">
              <span className="mono">{avgRI}</span>
              <small>RI SCORE</small>
            </div>
            <i className="sg-analytics-node is-fact">事实 {totals.fact}</i>
            <i className="sg-analytics-node is-hype">夸大 {totals.hype}</i>
            <i className="sg-analytics-node is-trap">陷阱 {totals.trap}</i>
          </div>
          <div className="sg-analytics-stage-table">
            <div>
              <span>告警总数</span>
              <strong className="mono">{totals.alerts || decisionQueue.filter((item) => item.score < 55).length}</strong>
            </div>
            <div>
              <span>覆盖观众</span>
              <strong className="mono">{formatNumber(totals.viewers)}</strong>
            </div>
            <div>
              <span>平均响应</span>
              <strong className="mono">{avgResponse || "--"} min</strong>
            </div>
          </div>
        </Panel>

        <Panel title="话术构成" eyebrow="SPEECH MIX" bodyClassName="sg-chart-panel sg-analytics-donut-body">
          <ResponsiveContainer width="100%" height={178}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={76} dataKey="value" paddingAngle={3}>
                {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} fillOpacity={0.9} />)}
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

      <section className="sg-analytics-grid is-primary">
        <Panel title="近 7 日理性指数" eyebrow="RATIONALITY TREND" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={244}>
            <AreaChart data={trendData} margin={{ top: 10, right: 18, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="analyticsRiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.34} />
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

        <Panel title="风险维度均值" eyebrow="RISK DIMENSIONS" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={244}>
            <RadarChart data={radarData} margin={{ top: 14, right: 24, bottom: 14, left: 24 }}>
              <PolarGrid stroke="rgba(246,255,95,0.14)" gridType="polygon" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
              <Radar
                dataKey="value"
                stroke="var(--accent)"
                fill="rgba(246,255,95,0.12)"
                strokeWidth={1.5}
                dot={{ fill: "var(--accent)", r: 2, strokeWidth: 0 }}
              />
              <Tooltip contentStyle={tipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="sg-analytics-grid is-secondary">
        <Panel title="每日话术分布" eyebrow="STACKED DISTRIBUTION" bodyClassName="sg-chart-panel">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 8, right: 18, bottom: 5, left: -12 }}>
              <XAxis dataKey="day" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tipStyle} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
              <Bar dataKey="fact" name="事实" stackId="speech" fill="var(--fact)" fillOpacity={0.72} />
              <Bar dataKey="hype" name="夸大" stackId="speech" fill="var(--hype)" fillOpacity={0.74} />
              <Bar dataKey="trap" name="陷阱" stackId="speech" fill="var(--trap)" fillOpacity={0.88} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="行业风险分布" eyebrow="CATEGORY RISK" bodyClassName="sg-analytics-category-body">
          <div className="sg-analytics-category-list">
            {categoryRows.map((row) => (
              <div key={row.name} className="sg-analytics-category-row">
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.sessions} 场 · {row.alerts} 次告警</span>
                </div>
                <div className="sg-analytics-mini-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(8, 100 - row.avgScore)}%` }} />
                </div>
                <em className={`is-${riskTone(row.avgScore)} mono`}>{row.avgScore}</em>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="sg-analytics-ledger">
        <Panel title="处置优先队列" eyebrow="REVIEW QUEUE" bodyClassName="sg-analytics-queue">
          {decisionQueue.map((session, index) => (
            <article key={session.id} className={`sg-analytics-queue-row is-${riskTone(session.score)}`}>
              <span className="mono">#{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{session.roomTitle || session.anchorName || "未命名直播间"}</strong>
                <small>{session.platform || "未知平台"} · {session.category || "未分类"} · {session.action || "待复核"}</small>
              </div>
              <em className="mono">{session.score}</em>
            </article>
          ))}
        </Panel>

        <Panel title="可读性摘要" eyebrow="INSIGHT NOTES" bodyClassName="sg-analytics-notes">
          <div>
            <span>高风险来源</span>
            <strong>{decisionQueue[0]?.roomTitle || "暂无"}</strong>
            <p>优先查看低理性指数、高陷阱占比的直播间，避免从总量最高的场次开始盲查。</p>
          </div>
          <div>
            <span>结构信号</span>
            <strong>事实 {totals.fact} / 夸大 {totals.hype} / 陷阱 {totals.trap}</strong>
            <p>事实话术占比越高，说明主播描述更可验证；陷阱话术升高时应同步查看证据片段。</p>
          </div>
          <div>
            <span>数据状态</span>
            <strong>{isPreset ? "演示样本" : "真实历史"}</strong>
            <p>{isPreset ? "后端暂无最新记录时，页面仍保持完整分析样式。" : "已接入历史记录，预制数据不会混入统计。"}</p>
          </div>
        </Panel>
      </section>
    </main>
  );
}
