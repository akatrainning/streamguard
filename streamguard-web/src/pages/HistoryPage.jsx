import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  clearHistorySessions,
  deleteHistorySession,
  getHistorySession,
  listHistorySessions,
  renameHistorySession,
} from "../utils/historyApi";
import { Button, Panel, SegmentedControl, StatusBadge, TextField } from "../components/ui";
import SessionReportModal from "../components/SessionReportModal";

const DEMO_SESSIONS = [
  { id: "demo-1", date: "2026-03-02 14:30", product: "闆呰瘲鍏伴粵淇姢绮惧崕", brand: "鐩存挱闂?888888", duration: "2h 15m", total: 42, fact: 19, hype: 15, trap: 8, score: 64, viewers: 28500, _demo: true },
  { id: "demo-2", date: "2026-03-01 20:15", product: "Mate70 Pro 涓撳満", brand: "鐩存挱闂?66666", duration: "3h 00m", total: 67, fact: 45, hype: 18, trap: 4, score: 82, viewers: 89000, _demo: true },
  { id: "demo-3", date: "2026-03-01 10:30", product: "榛勯噾鎶曡祫鍜ㄨ", brand: "鐩存挱闂?12345", duration: "45m", total: 19, fact: 3, hype: 8, trap: 8, score: 22, viewers: 3200, _demo: true },
];

const FILTERS = [
  { value: "all", label: "鍏ㄩ儴", meta: "All" },
  { value: "high", label: "楂樺嵄", meta: "Risk" },
  { value: "ok", label: "鍚堣", meta: "Safe" },
];

const scoreTone = (score) => (score >= 75 ? "success" : score >= 50 ? "warning" : "danger");
const scoreLabel = (score) => (score >= 75 ? "鍚堣" : score >= 50 ? "娉ㄦ剰" : "楂樺嵄");
const scoreColor = (score) => (score >= 75 ? "var(--fact)" : score >= 50 ? "var(--hype)" : "var(--trap)");

export default function HistoryPage({ apiBase = "http://localhost:8012", token }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [replaySnapshot, setReplaySnapshot] = useState(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const payload = await listHistorySessions(apiBase, token, 100);
      setSessions(payload.items || []);
    } catch (err) {
      setError(err?.message || "鍘嗗彶璁板綍鍔犺浇澶辫触");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = useCallback(async (id, event) => {
    event.stopPropagation();
    try {
      await deleteHistorySession(apiBase, token, id);
      await reload();
    } catch (err) {
      setError(err?.message || "鍒犻櫎澶辫触");
    }
  }, [apiBase, token, reload]);

  const handleRename = useCallback(async (id, name) => {
    try {
      await renameHistorySession(apiBase, token, id, name);
      await reload();
    } catch (err) {
      setError(err?.message || "重命名失败");
    }
  }, [apiBase, token, reload]);

  const handleReplay = useCallback(async (id, event) => {
    event.stopPropagation();
    try {
      const payload = await getHistorySession(apiBase, token, id);
      if (payload.snapshot) setReplaySnapshot(payload.snapshot);
      else setError("这条记录没有完整报告数据");
    } catch (err) {
      setError(err?.message || "鎶ュ憡鍔犺浇澶辫触");
    }
  }, [apiBase, token]);

  const handleClearAll = useCallback(async () => {
    try {
      await clearHistorySessions(apiBase, token);
      await reload();
      setShowClearConfirm(false);
    } catch (err) {
      setError(err?.message || "娓呯┖澶辫触");
    }
  }, [apiBase, token, reload]);

  const isDemo = sessions.length === 0;
  const allSessions = isDemo ? DEMO_SESSIONS : sessions;
  const filtered = allSessions.filter((session) => {
    const matchesFilter = filter === "all" || (filter === "high" && session.score < 50) || (filter === "ok" && session.score >= 75);
    const matchesSearch = !search || (session.product || "").includes(search) || (session.brand || "").includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <>
      <main className="sg-history-page">
        <header className="sg-history-head">
          <div>
            <div className="sg-ui-eyebrow">Archive</div>
            <h1>鍘嗗彶妗ｆ</h1>
            <p>
              {loading
                ? "姝ｅ湪鍔犺浇璐﹀彿鍘嗗彶銆?
                : isDemo
                  ? "褰撳墠灞曠ず绀轰緥妗ｆ銆傜粨鏉熺湡瀹炵洿鎾細璇濆悗锛屾姤鍛婁細鑷姩娌夋穩鍒拌繖閲屻€?
                  : `鍏?${sessions.length} 鍦虹洿鎾褰曘€俙}
            </p>
          </div>

          {!isDemo && (
            <div className="sg-history-clear">
              {showClearConfirm ? (
                <>
                  <span>纭娓呯┖鎵€鏈夎褰曪紵</span>
                  <Button variant="danger" onClick={handleClearAll}>纭娓呯┖</Button>
                  <Button onClick={() => setShowClearConfirm(false)}>鍙栨秷</Button>
                </>
              ) : (
                <Button variant="danger" onClick={() => setShowClearConfirm(true)}>娓呯┖鍘嗗彶</Button>
              )}
            </div>
          )}
        </header>

        {error && <div className="sg-history-error">{error}</div>}

        <Panel className="sg-history-toolbar">
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="鎼滅储鍚嶇О / 鎴块棿鍙?
          />
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
        </Panel>

        <div className="sg-history-list">
          {filtered.map((session, index) => (
            <HistoryRow
              key={session.id}
              session={session}
              index={index}
              isOpen={expanded === session.id}
              onToggle={() => setExpanded(expanded === session.id ? null : session.id)}
              onDelete={handleDelete}
              onRename={handleRename}
              onReplay={handleReplay}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <Panel className="sg-history-empty">
            鏈壘鍒板尮閰嶈褰曘€?          </Panel>
        )}
      </main>

      {replaySnapshot && (
        <SessionReportModal
          snapshot={replaySnapshot}
          apiBase={replaySnapshot._apiBase || apiBase}
          onClose={() => setReplaySnapshot(null)}
        />
      )}
    </>
  );
}

function HistoryRow({ session, index, isOpen, onToggle, onDelete, onRename, onReplay }) {
  const isReal = !session._demo;
  const tone = scoreTone(session.score);
  const barData = [
    { name: "浜嬪疄", value: session.fact, color: "var(--fact)" },
    { name: "澶稿ぇ", value: session.hype, color: "var(--hype)" },
    { name: "闄烽槺", value: session.trap, color: "var(--trap)" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.22) }}
      className={`sg-history-row is-${tone}`}
    >
      <button className="sg-history-row-main" onClick={onToggle} type="button">
        <div className="sg-history-score" style={{ "--score-color": scoreColor(session.score) }}>
          <strong className="mono">{session.score}</strong>
          <span>{scoreLabel(session.score)}</span>
        </div>

        <div className="sg-history-info">
          <div className="sg-history-title-line">
            {isReal
              ? <EditableTitle value={session.product} sessionId={session.id} onRename={onRename} />
              : <strong>{session.product}</strong>}
            <span>{session.brand}</span>
            {session._demo && <StatusBadge tone="warning">绀轰緥</StatusBadge>}
          </div>
          <div className="sg-history-meta">
            <span>{session.date}</span>
            <span>{session.duration}</span>
            {session.viewers > 0 && <span>{session.viewers.toLocaleString()} 瑙備紬</span>}
            <span>{session.total} 璇濇湳</span>
          </div>
        </div>

        <div className="sg-history-pills">
          <TypePill count={session.fact} tone="success" label="浜嬪疄" />
          <TypePill count={session.hype} tone="warning" label="澶稿ぇ" />
          <TypePill count={session.trap} tone="danger" label="闄烽槺" />
        </div>

        {isReal && (
          <div className="sg-history-actions">
            <Button onClick={(event) => onReplay(session.id, event)} variant="primary">鎶ュ憡</Button>
            <Button onClick={(event) => onDelete(session.id, event)} variant="danger">鍒犻櫎</Button>
          </div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeInOut" }}
            className="sg-history-detail-wrap"
          >
            <div className="sg-history-detail">
              <Panel title="璇濇湳绫诲瀷鍒嗗竷" bodyClassName="sg-chart-panel">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                    <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#101112", border: "1px solid #30332f", borderRadius: 6, fontSize: 12 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {barData.map((entry) => <Cell key={entry.name} fill={entry.color} fillOpacity={0.86} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title="浼氳瘽缁熻">
                <StatRow label="闄烽槺璇濇湳鍗犳瘮" value={session.total ? `${((session.trap / session.total) * 100).toFixed(1)}%` : "--"} tone="danger" />
                <StatRow label="澶稿ぇ璇濇湳鍗犳瘮" value={session.total ? `${((session.hype / session.total) * 100).toFixed(1)}%` : "--"} tone="warning" />
                <StatRow label="浜嬪疄璇濇湳鍗犳瘮" value={session.total ? `${((session.fact / session.total) * 100).toFixed(1)}%` : "--"} tone="success" />
                <StatRow label="瑙傜湅浜烘暟" value={session.viewers?.toLocaleString?.() || 0} />
                <StatRow label="鍚堣璇勫垎" value={`${session.score}/100`} tone={tone} />
                <StatRow label="鏃堕暱" value={session.duration} />
                {isReal && <Button className="sg-history-report-wide" onClick={(event) => onReplay(session.id, event)} variant="primary">鏌ョ湅瀹屾暣鎶ュ憡</Button>}
              </Panel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function EditableTitle({ value, sessionId, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const name = draft.trim();
    if (name && name !== value) onRename(sessionId, name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        onClick={(event) => event.stopPropagation()}
        className="sg-history-title-input"
      />
    );
  }

  return (
    <strong
      title="鐐瑰嚮缂栬緫鍚嶇О"
      onClick={(event) => {
        event.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </strong>
  );
}

function TypePill({ count, tone, label }) {
  return (
    <span className={`sg-history-type is-${tone}`}>
      <strong className="mono">{count}</strong>
      <em>{label}</em>
    </span>
  );
}

function StatRow({ label, value, tone = "neutral" }) {
  return (
    <div className="sg-history-stat-row">
      <span>{label}</span>
      <strong className={`mono is-${tone}`}>{value}</strong>
    </div>
  );
}

