import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearHistorySessions,
  deleteHistorySession,
  getHistorySession,
  listHistorySessions,
  renameHistorySession,
} from "../utils/historyApi";
import { Button, Panel, SegmentedControl, TextField } from "../components/ui";
import SessionReportModal from "../components/StableSessionReportModal";

const FILTERS = [
  { value: "all", label: "全部", meta: "All" },
  { value: "high", label: "高风险", meta: "Risk" },
  { value: "safe", label: "较稳", meta: "Safe" },
];

const DEMO_SESSIONS = [
  {
    id: "demo-1",
    product: "与辉同行专场",
    brand: "直播间 646454278948",
    score: 64,
    total: 42,
    trap: 8,
    fact: 19,
    viewers: 28500,
    _demo: true,
  },
  {
    id: "demo-2",
    product: "品牌上新场",
    brand: "直播间 208823316033",
    score: 82,
    total: 67,
    trap: 4,
    fact: 45,
    viewers: 89000,
    _demo: true,
  },
];

function scoreTone(score) {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function scoreLabel(score) {
  if (score >= 75) return "较稳";
  if (score >= 50) return "注意";
  return "高风险";
}

function historyNodeStyle(session, index, total) {
  const score = Number(session.score || 0);
  const angle = -88 + (360 / Math.max(total, 1)) * index;
  const radius = 118 + ((score % 4) * 18);
  const radians = (angle * Math.PI) / 180;
  const tone = scoreTone(score);
  return {
    "--node-x": `${Math.cos(radians) * radius}px`,
    "--node-y": `${Math.sin(radians) * radius}px`,
    "--node-color": `var(--${tone === "success" ? "fact" : tone === "danger" ? "trap" : "hype"})`,
  };
}

export default function HistoryPage({ apiBase = "http://localhost:8011", token }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
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
      setError(err?.message || "历史记录加载失败");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteHistorySession(apiBase, token, id);
      await reload();
    } catch (err) {
      setError(err?.message || "删除失败");
    }
  }, [apiBase, token, reload]);

  const handleRename = useCallback(async (id, product) => {
    const next = window.prompt("修改会话标题", product || "");
    if (!next || !next.trim()) return;
    try {
      await renameHistorySession(apiBase, token, id, next.trim());
      await reload();
    } catch (err) {
      setError(err?.message || "重命名失败");
    }
  }, [apiBase, token, reload]);

  const handleReplay = useCallback(async (id) => {
    try {
      const payload = await getHistorySession(apiBase, token, id);
      if (payload.snapshot) {
        setReplaySnapshot(payload.snapshot);
      } else {
        setError("这条记录没有完整报告数据");
      }
    } catch (err) {
      setError(err?.message || "报告加载失败");
    }
  }, [apiBase, token]);

  const handleClearAll = useCallback(async () => {
    try {
      await clearHistorySessions(apiBase, token);
      await reload();
      setShowClearConfirm(false);
    } catch (err) {
      setError(err?.message || "清空失败");
    }
  }, [apiBase, token, reload]);

  const isDemo = sessions.length === 0;
  const allSessions = isDemo ? DEMO_SESSIONS : sessions;

  const filtered = useMemo(() => {
    return allSessions.filter((session) => {
      const score = Number(session.score || 0);
      const matchesFilter =
        filter === "all"
        || (filter === "high" && score < 50)
        || (filter === "safe" && score >= 75);
      const haystack = `${session.product || ""} ${session.brand || ""} ${session.room_id || ""}`;
      const matchesSearch = !search.trim() || haystack.includes(search.trim());
      return matchesFilter && matchesSearch;
    });
  }, [allSessions, filter, search]);

  const archiveStats = useMemo(() => {
    const total = allSessions.reduce((sum, session) => sum + Number(session.total || 0), 0);
    const trap = allSessions.reduce((sum, session) => sum + Number(session.trap || 0), 0);
    const evidence = allSessions.reduce((sum, session) => sum + Number(session.evidenceCount || 0), 0);
    const highRisk = allSessions.filter((session) => Number(session.score || 0) < 50).length;
    const riskRate = total ? Math.round((trap / total) * 100) : 0;
    return { total, trap, evidence, highRisk, riskRate };
  }, [allSessions]);

  return (
    <>
      <main className="sg-history-page">
        <header className="sg-history-head">
          <div>
            <div className="sg-ui-eyebrow">Archive</div>
            <h1>历史档案</h1>
            <p>
              {loading
                ? "正在加载账号历史。"
                : isDemo
                  ? "当前展示示例档案。结束真实直播会话后，报告会自动沉淀到这里。"
                  : `共 ${sessions.length} 场直播记录。`}
            </p>
          </div>

          {!isDemo && (
            <div className="sg-history-clear">
              {showClearConfirm ? (
                <>
                  <span>确认清空所有记录？</span>
                  <Button variant="danger" onClick={handleClearAll}>确认清空</Button>
                  <Button onClick={() => setShowClearConfirm(false)}>取消</Button>
                </>
              ) : (
                <Button variant="danger" onClick={() => setShowClearConfirm(true)}>清空历史</Button>
              )}
            </div>
          )}
        </header>

        <section className="sg-history-command-board" aria-label="历史档案检索面板">
          <div className="sg-history-orbit" aria-hidden="true">
            <div className="sg-history-orbit-core">
              <span>VISIBLE</span>
              <strong>{filtered.length}</strong>
              <em>{allSessions.length} archives</em>
            </div>
            {allSessions.slice(0, 10).map((session, index, items) => (
              <button
                key={session.id}
                type="button"
                className={`sg-history-orbit-node is-${scoreTone(Number(session.score || 0))}`}
                style={historyNodeStyle(session, index, items.length)}
                onClick={() => handleReplay(session.id)}
                title={session.product || session.title || session.id}
              >
                {Number(session.score || 0)}
              </button>
            ))}
          </div>

          <div className="sg-history-console">
            <div className="sg-history-console-head">
              <span>Archive Query</span>
              <strong>{archiveStats.riskRate}% trap ratio</strong>
            </div>
            <div className="sg-history-console-metrics">
              <div><span>signals</span><strong>{archiveStats.total}</strong></div>
              <div><span>trap</span><strong>{archiveStats.trap}</strong></div>
              <div><span>evidence</span><strong>{archiveStats.evidence}</strong></div>
              <div><span>p0/p1</span><strong>{archiveStats.highRisk}</strong></div>
            </div>
            <div className="sg-history-command-tools">
              <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
              <TextField
                label="检索"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="按标题、品牌或房间号过滤"
              />
            </div>
            {error && <div className="sg-history-error">{error}</div>}
          </div>
        </section>

        <div className="sg-history-list">
          {filtered.map((session) => {
            const score = Number(session.score || 0);
            const tone = scoreTone(score);
            return (
              <div
                key={session.id}
                className={`sg-history-row ${tone === "success" ? "is-success" : tone === "danger" ? "is-danger" : "is-warning"}`}
              >
                <div className="sg-history-row-main" onClick={() => handleReplay(session.id)}>
                  <div className="sg-history-score" style={{ "--score-color": `var(--${tone === "success" ? "fact" : tone === "danger" ? "trap" : "hype"})` }}>
                    <strong>{score}</strong>
                    <span>SCORE</span>
                  </div>

                  <div className="sg-history-info">
                    <div className="sg-history-title-line">
                      <strong>{session.product || session.title || "未命名会话"}</strong>
                      <span>{session.brand || session.room_id || "直播会话"}</span>
                    </div>
                    <div className="sg-history-meta">
                      <span>总条数 {session.total || 0}</span>
                      <span>事实 {session.fact || 0}</span>
                      <span>陷阱 {session.trap || 0}</span>
                      <span>证据 {session.evidenceCount || 0}</span>
                      {session.riskLevel && <span>{session.riskLevel}</span>}
                      <span>观众 {session.viewers || 0}</span>
                    </div>
                  </div>

                  <div className="sg-history-pills">
                    <div className={`sg-history-type is-${tone}`}>
                      <strong style={{ color: `var(--${tone === "success" ? "fact" : tone === "danger" ? "trap" : "hype"})` }}>
                        {scoreLabel(score)}
                      </strong>
                    </div>
                  </div>

                  <div className="sg-history-actions">
                    <Button onClick={(event) => { event.stopPropagation(); handleReplay(session.id); }}>回看</Button>
                    {!session._demo && (
                      <Button onClick={(event) => { event.stopPropagation(); handleRename(session.id, session.product); }}>
                        重命名
                      </Button>
                    )}
                    {!session._demo && (
                      <Button variant="danger" onClick={(event) => { event.stopPropagation(); handleDelete(session.id); }}>
                        删除
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <Panel className="sg-history-empty" title="没有匹配结果" eyebrow="Empty">
            <p>换一个筛选条件试试，或者先完成一次新的直播监测。</p>
          </Panel>
        )}
      </main>

      {replaySnapshot && (
        <SessionReportModal
          snapshot={replaySnapshot}
          apiBase={apiBase}
          onDismiss={() => setReplaySnapshot(null)}
          onClose={() => setReplaySnapshot(null)}
        />
      )}
    </>
  );
}
