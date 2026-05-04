import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearHistorySessions,
  deleteHistorySession,
  getHistorySession,
  listHistorySessions,
  renameHistorySession,
} from "../utils/historyApi";
import { Button, Panel, SegmentedControl, StatusBadge, TextField } from "../components/ui";
import SessionReportModal from "../components/SessionReportModal";

const FILTERS = [
  { value: "all", label: "全部", meta: "All" },
  { value: "high", label: "高风险", meta: "Risk" },
  { value: "safe", label: "较稳", meta: "Safe" },
];

const DEMO_SESSIONS = [
  { id: "demo-1", product: "与辉同行专场", brand: "直播间 646454278948", score: 64, total: 42, trap: 8, fact: 19, viewers: 28500, _demo: true },
  { id: "demo-2", product: "品牌上新场", brand: "直播间 208823316033", score: 82, total: 67, trap: 4, fact: 45, viewers: 89000, _demo: true },
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

export default function HistoryPage({ apiBase = "http://localhost:8012", token }) {
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
      if (payload.snapshot) setReplaySnapshot(payload.snapshot);
      else setError("这条记录没有完整报告数据");
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

        <Panel className="sg-history-toolbar" title="检索与筛选" eyebrow="Filters">
          <div className="sg-history-toolbar-row">
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
            <TextField
              label="检索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="按标题、品牌或房间号过滤"
            />
          </div>
          {error && <div className="sg-history-error">{error}</div>}
        </Panel>

        <div className="sg-history-list">
          {filtered.map((session) => {
            const score = Number(session.score || 0);
            return (
              <div key={session.id} className={`sg-history-row ${scoreTone(score) === "success" ? "is-success" : scoreTone(score) === "danger" ? "is-danger" : "is-warning"}`}>
                <div className="sg-history-row-main" onClick={() => handleReplay(session.id)}>
                  <div className="sg-history-score" style={{ "--score-color": `var(--${scoreTone(score) === "success" ? "fact" : scoreTone(score) === "danger" ? "trap" : "hype"})` }}>
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
                      <span>观众 {session.viewers || 0}</span>
                    </div>
                  </div>

                  <div className="sg-history-pills">
                    <div className={`sg-history-type is-${scoreTone(score)}`}>
                      <strong style={{color: `var(--${scoreTone(score) === "success" ? "fact" : scoreTone(score) === "danger" ? "trap" : "hype"})`}}>{scoreLabel(score)}</strong>
                    </div>
                  </div>

                  <div className="sg-history-actions">
                    <Button onClick={(e) => { e.stopPropagation(); handleReplay(session.id); }}>回看</Button>
                    {!session._demo && <Button onClick={(e) => { e.stopPropagation(); handleRename(session.id, session.product); }}>重命名</Button>}
                    {!session._demo && <Button variant="danger" onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}>删除</Button>}
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
