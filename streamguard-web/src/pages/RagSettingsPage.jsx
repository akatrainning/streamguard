import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Panel } from "../components/ui";

const VIEW_TABS = [
  { id: "combined", label: "缁勫悎璇佹嵁", hint: "鑱斿悎鏌ョ湅娉曡銆佹渚嬨€佹潗鏂欏拰瀹炴椂鍛戒腑璇佹嵁" },
  { id: "rules", label: "娉曡瑙勫垯鍥捐氨", hint: "鏌ョ湅瑙勫垯鑺傜偣銆侀闄╃被鍨嬪拰璇佹嵁瑕佹眰" },
  { id: "cases", label: "鍘嗗彶妗堜緥", hint: "瀵圭収鐩镐技浜夎銆佸缃氫緷鎹拰澶勭疆缁忛獙" },
  { id: "evidence", label: "璇佹嵁鐗囨", hint: "鏌ョ湅鍙紩鐢ㄧ殑妫€娴嬨€佹巿鏉冦€佷环鏍煎拰涓婁笅鏂囨潗鏂? },
  { id: "live", label: "瀹炴椂鍛戒腑", hint: "鑱氱劍褰撳墠鐩存挱闂村凡娌夋穩鐨勮瘽鏈瘉鎹? },
];

const QUICK_QUESTIONS = [
  "涓轰粈涔堝綋鍓嶇洿鎾棿闇€瑕佸鏍革紵",
  "鏈夊摢浜涚浉浼煎巻鍙叉渚嬶紵",
  "璇风粰鍑哄缓璁缃剰瑙佸拰寮曠敤渚濇嵁銆?,
];

const SORT_OPTIONS = [
  { value: "score", label: "鎸夌患鍚堢浉鍏冲害" },
  { value: "similarity", label: "鎸夎涔夌浉浼煎害" },
  { value: "source", label: "鎸夎瘉鎹潵婧? },
  { value: "recent", label: "鎸夋椂闂存柊杩? },
];

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function sourceLabel(source) {
  return {
    rule_db: "娉曡瑙勫垯",
    historical_case: "鍘嗗彶妗堜緥",
    evidence_db: "璇佹嵁鏉愭枡",
    asr_context: "瀹炴椂鐗囨",
    claim_case: "璇濇湳妗堜緥",
  }[source] || source || "鏈煡鏉ユ簮";
}

function moduleLabel(module) {
  return {
    live_transcript: "瀹炴椂杞啓搴?,
    historical_records: "鍘嗗彶璁板綍搴?,
    rule_graph: "瑙勫垯鍥捐氨搴?,
    evidence_docs: "璇佹嵁鏂囨。搴?,
  }[module] || module || "鐭ヨ瘑搴?;
}

function riskTone(level) {
  if (level === "P0" || level === "P1") return "is-danger";
  if (level === "P2") return "is-warning";
  return "is-good";
}

function formatTime(value) {
  if (!value) return "鏈瘎浼?;
  const numberValue = Number(value);
  const date = Number.isFinite(numberValue)
    ? new Date(numberValue > 10_000_000_000 ? numberValue : numberValue * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "鏈瘎浼?;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatRelativeTime(value) {
  if (!value) return "灏氭湭鐢熸垚";
  const ms = Date.now() - Number(value);
  if (ms < 60_000) return "鍒氬垰";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 鍒嗛挓鍓峘;
  return formatTime(value);
}

function getAtPath(object, path, fallback = "") {
  return path.split(".").reduce((current, key) => current?.[key], object) ?? fallback;
}

function buildContextSignature({ roomId, utterances, chatMessages, sessionStats, riskData }) {
  const lastUtterance = utterances[0] || utterances[utterances.length - 1] || {};
  const lastChat = chatMessages[0] || chatMessages[chatMessages.length - 1] || {};
  return JSON.stringify({
    roomId: roomId || "",
    utteranceCount: utterances.length,
    chatCount: chatMessages.length,
    riskCount: riskData.length,
    latestUtterance: lastUtterance.id || lastUtterance.event_id || lastUtterance.timestamp || lastUtterance.text || "",
    latestChat: lastChat.id || lastChat.event_id || lastChat.timestamp || lastChat.text || "",
    trap: sessionStats?.trap || 0,
    hype: sessionStats?.hype || 0,
  });
}

function itemTimestamp(item) {
  const raw = item?.meta?.timestamp || item?.meta?.created_at || 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Date.parse(raw) || 0;
}

function evidenceReason(item, activeQuery) {
  if (item.retrieval_reason) return item.retrieval_reason;
  const bits = [];
  if (item.similarity != null) bits.push(`璇箟鐩镐技搴?${Number(item.similarity).toFixed(3)}`);
  if (item.score != null) bits.push(`缁煎悎鐩稿叧搴?${Number(item.score).toFixed(3)}`);
  if (item.meta?.risk_type) bits.push(`椋庨櫓绫诲瀷 ${item.meta.risk_type}`);
  if (item.related_claim_types?.length) bits.push(`鍏宠仈 ${item.related_claim_types.join("銆?)}`);
  if (activeQuery) bits.push("涓庡綋鍓嶆绱㈣瘝鍖归厤");
  return bits.length ? bits.join("锛?) : "鐢辨潵婧愭潈閲嶃€佽瘉鎹畬鏁存€у拰瑙勫垯鍏宠仈搴︽帓搴?;
}

function matchesSource(item, sourceFilter) {
  return sourceFilter === "all" || item.source === sourceFilter;
}

function sortEvidence(items, sortMode) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sortMode === "similarity") return Number(b.similarity ?? -1) - Number(a.similarity ?? -1);
    if (sortMode === "source") return sourceLabel(a.source).localeCompare(sourceLabel(b.source), "zh-CN");
    if (sortMode === "recent") return itemTimestamp(b) - itemTimestamp(a);
    return Number(b.score ?? 0) - Number(a.score ?? 0);
  });
  return sorted;
}

export default function RagSettingsPage({
  apiBase = "http://localhost:8012",
  utterances = [],
  chatMessages = [],
  sessionStats = {},
  sourceConfig = {},
  riskData = [],
}) {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationMeta, setEvaluationMeta] = useState(null);
  const [activeView, setActiveView] = useState("combined");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [pinnedEvidences, setPinnedEvidences] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortMode, setSortMode] = useState("score");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const contextPayload = useMemo(() => ({
    roomId: sourceConfig.roomId || null,
    utterances: utterances.slice(0, 24),
    chatMessages: chatMessages.slice(0, 24),
    sessionStats,
    riskData,
  }), [sourceConfig.roomId, utterances, chatMessages, sessionStats, riskData]);

  const contextSignature = useMemo(() => buildContextSignature({
    roomId: sourceConfig.roomId,
    utterances,
    chatMessages,
    sessionStats,
    riskData,
  }), [sourceConfig.roomId, utterances, chatMessages, sessionStats, riskData]);

  const selectedEvidence = useMemo(
    () => (knowledge?.items || []).find((item) => item.id === selectedEvidenceId) || null,
    [knowledge, selectedEvidenceId],
  );

  const visibleEvidence = useMemo(() => {
    const filtered = (knowledge?.items || []).filter((item) => matchesSource(item, sourceFilter));
    return sortEvidence(filtered, sortMode);
  }, [knowledge, sourceFilter, sortMode]);

  const sourceOptions = useMemo(() => {
    const counts = {};
    (knowledge?.items || []).forEach((item) => {
      counts[item.source] = (counts[item.source] || 0) + 1;
    });
    return Object.entries(counts).map(([source, count]) => ({ source, count }));
  }, [knowledge]);

  const isEvaluationStale = Boolean(evaluation && evaluationMeta?.signature !== contextSignature);
  const evaluatedSignalCount = (evaluationMeta?.utteranceCount || 0) + (evaluationMeta?.chatCount || 0);
  const currentSignalCount = utterances.length + chatMessages.length;
  const newSignalCount = Math.max(0, currentSignalCount - evaluatedSignalCount);
  const activeTab = VIEW_TABS.find((tab) => tab.id === activeView) || VIEW_TABS[0];

  const fetchJson = useCallback(async (path, options = {}) => {
    const res = await fetch(`${apiBase}${path}`, options);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.detail || "璇锋眰澶辫触锛岃绋嶅悗閲嶈瘯銆?);
    return payload;
  }, [apiBase]);

  const loadConfig = useCallback(async () => {
    const payload = await fetchJson("/rag/config");
    setStatus(payload);
    setConfig(payload.config);
  }, [fetchJson]);

  const loadKnowledge = useCallback(async (view = activeView, query = knowledgeQuery) => {
    const params = new URLSearchParams({ view, limit: "120" });
    if (query.trim()) params.set("query", query.trim());
    const payload = await fetchJson(`/rag/knowledge?${params.toString()}`);
    setKnowledge(payload);
    setSelectedEvidenceId((current) => {
      if (current && payload.items?.some((item) => item.id === current)) return current;
      return payload.items?.[0]?.id || "";
    });
  }, [activeView, fetchJson, knowledgeQuery]);

  const loadEvaluation = useCallback(async () => {
    const payload = await fetchJson("/rag/live-evaluation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: contextPayload }),
    });
    setEvaluation(payload);
    setEvaluationMeta({
      evaluatedAt: Date.now(),
      signature: contextSignature,
      utteranceCount: utterances.length,
      chatCount: chatMessages.length,
    });
  }, [contextPayload, contextSignature, fetchJson, utterances.length, chatMessages.length]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await loadConfig();
        await loadKnowledge(activeView, knowledgeQuery);
      } catch (err) {
        if (alive) setError(err.message || "RAG 宸ヤ綔鍙板姞杞藉け璐ャ€?);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [activeView, knowledgeQuery, loadConfig, loadKnowledge]);

  useEffect(() => {
    let alive = true;
    const evaluate = async () => {
      try {
        await loadEvaluation();
      } catch (err) {
        if (alive) setError(err.message || "鐩存挱闂存€昏瘎鍒锋柊澶辫触銆?);
      }
    };
    evaluate();
    return () => {
      alive = false;
    };
  }, [loadEvaluation]);

  const updateConfig = useCallback((path, value) => {
    setConfig((current) => {
      const next = cloneConfig(current);
      const keys = path.split(".");
      let cursor = next;
      keys.slice(0, -1).forEach((key) => {
        cursor[key] = cursor[key] || {};
        cursor = cursor[key];
      });
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  const saveConfig = useCallback(async (rebuild = false) => {
    if (!config) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchJson("/rag/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, rebuild }),
      });
      setStatus(payload);
      setConfig(payload.config);
      setNotice(rebuild ? "楂樼骇璁剧疆宸蹭繚瀛橈紝绱㈠紩宸查噸寤恒€? : "楂樼骇璁剧疆宸蹭繚瀛樸€?);
      if (rebuild) await loadKnowledge(activeView, knowledgeQuery);
    } catch (err) {
      setError(err.message || "楂樼骇璁剧疆淇濆瓨澶辫触锛岃妫€鏌ュ弬鏁板悗閲嶈瘯銆?);
    } finally {
      setSaving(false);
    }
  }, [activeView, config, fetchJson, knowledgeQuery, loadKnowledge]);

  const reindex = useCallback(async () => {
    setReindexing(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchJson("/rag/reindex", { method: "POST" });
      setStatus(payload);
      setConfig(payload.config);
      await loadKnowledge(activeView, knowledgeQuery);
      setNotice("绱㈠紩宸查噸寤猴紝璇佹嵁鍦板浘宸插埛鏂般€?);
    } catch (err) {
      setError(err.message || "绱㈠紩閲嶅缓澶辫触锛岃妫€鏌?embedding 閰嶇疆鍜?API Key銆?);
    } finally {
      setReindexing(false);
    }
  }, [activeView, fetchJson, knowledgeQuery, loadKnowledge]);

  const pinEvidence = useCallback((item) => {
    if (!item) return;
    setPinnedEvidences((current) => {
      if (current.some((evidence) => evidence.id === item.id)) return current;
      return [...current, item].slice(-4);
    });
  }, []);

  const askQuestion = useCallback(async (nextQuestion = question, evidenceOverride = null) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed) {
      setError("璇疯緭鍏ヤ竴涓鏍搁棶棰樸€?);
      return;
    }
    const evidenceContext = evidenceOverride || pinnedEvidences;
    setAsking(true);
    setError("");
    setAnswer(null);
    try {
      const payload = await fetchJson("/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          context: contextPayload,
          evidence_ids: evidenceContext.map((item) => item.id),
        }),
      });
      setAnswer(payload);
      setQuestion(trimmed);
    } catch (err) {
      setError(err.message || "RAG 闂瓟澶辫触锛岃妫€鏌?LLM 閰嶇疆鎴栫◢鍚庨噸璇曘€?);
    } finally {
      setAsking(false);
    }
  }, [contextPayload, fetchJson, pinnedEvidences, question]);

  const applySearch = useCallback(() => {
    setKnowledgeQuery(searchInput.trim());
  }, [searchInput]);

  if (loading || !config) {
    return (
      <section className="sg-rag-page">
        <Panel eyebrow="RAG WORKBENCH" title="姝ｅ湪寤虹珛璇佹嵁宸ヤ綔鍙?>
          <div className="sg-rag-muted">姝ｅ湪璇诲彇鐭ヨ瘑搴撱€佺储寮曠姸鎬佸拰褰撳墠鐩存挱闂磋瘎浠枫€?/div>
        </Panel>
      </section>
    );
  }

  const embeddingStatus = status?.embedding_status || {};
  const counts = status?.counts || {};

  return (
    <section className="sg-rag-page sg-rag-workbench">
      <header className="sg-rag-hero sg-rag-workbench-hero">
        <div>
          <div className="sg-ui-eyebrow">RAG EVIDENCE</div>
          <h1>RAG 璇佹嵁宸ヤ綔鍙?/h1>
          <p>鎶婃硶瑙勮鍒欍€佸巻鍙叉渚嬨€佽瘉鎹潗鏂欏拰褰撳墠鐩存挱闂磋瘽鏈斁鍒板悓涓€涓鏍歌瑙掗噷锛屽府鍔╁鏍镐汉鍛樺洖绛旓細鍝噷鏈夐闄┿€佷负浠€涔堟湁椋庨櫓銆佷緷鎹槸浠€涔堛€?/p>
        </div>
        <div className="sg-rag-actions">
          <Button onClick={loadEvaluation}>鍒锋柊鎬昏瘎</Button>
          <Button onClick={reindex} disabled={reindexing}>{reindexing ? "姝ｅ湪閲嶅缓绱㈠紩" : "閲嶅缓绱㈠紩"}</Button>
        </div>
      </header>

      {(error || notice) && (
        <div className={`sg-rag-message ${error ? "is-error" : "is-ok"}`} role="status">{error || notice}</div>
      )}

      <section className="sg-rag-summary-grid">
        <div className={`sg-rag-verdict ${riskTone(evaluation?.risk_level)} ${isEvaluationStale ? "is-stale" : ""}`}>
          <span>褰撳墠鎬昏瘎</span>
          <strong>{evaluation?.risk_level || "P3"}</strong>
          <p>{evaluation?.summary || "鏆傛棤瓒冲 RAG 鍛戒腑锛屽缓璁厛妫€绱㈢煡璇嗗簱璇佹嵁鎴栨彁鍑哄鏍搁棶棰樸€?}</p>
          {isEvaluationStale && <small>璇勪及鍚庢柊澧?{newSignalCount || "鑻ュ共"} 鏉′俊鍙凤紝寤鸿鍒锋柊鎬昏瘎銆?/small>}
        </div>
        <Metric label="鍛戒腑缁撴灉" value={evaluation?.matched_count || 0} detail="褰撳墠涓婁笅鏂? />
        <Metric label="璇勪及鏃堕棿" value={formatRelativeTime(evaluationMeta?.evaluatedAt)} detail={isEvaluationStale ? "鍙兘宸茶繃鏈? : "涓庡綋鍓嶄俊鍙峰悓姝?} tone={isEvaluationStale ? "is-warning" : "is-good"} />
        <Metric label="绱㈠紩鐘舵€? value={embeddingStatus.ready ? "READY" : "CHECK"} detail={embeddingStatus.ready ? formatTime(embeddingStatus.last_built_at) : embeddingStatus.reason || "鏈氨缁?} tone={embeddingStatus.ready ? "is-good" : "is-warning"} />
        <Metric label="瑙勫垯鑺傜偣" value={counts.rule_graph_nodes || 0} detail="娉曡鍥捐氨" />
      </section>

      <div className="sg-rag-workbench-grid">
        <Panel
          eyebrow="EVIDENCE MAP"
          title="鐭ヨ瘑搴撳彲瑙嗗寲"
          actions={<span className="sg-rag-panel-note">{activeTab.hint}</span>}
          className="sg-rag-map-panel"
        >
          <div className="sg-rag-view-tabs" role="tablist" aria-label="鐭ヨ瘑搴撹鍥?>
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeView === tab.id}
                aria-controls="sg-rag-evidence-results"
                className={activeView === tab.id ? "is-active" : ""}
                onClick={() => {
                  setActiveView(tab.id);
                  setSourceFilter("all");
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="sg-rag-knowledge-tools">
            <label className="sg-rag-search">
              <span>妫€绱㈣瘉鎹?/span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applySearch();
                }}
                placeholder="杈撳叆鍟嗗搧銆佽瘽鏈€佹硶瑙勬潯娆炬垨椋庨櫓绫诲瀷"
              />
            </label>
            <label className="sg-rag-select">
              <span>鏉ユ簮</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">鍏ㄩ儴鏉ユ簮</option>
                {sourceOptions.map(({ source, count }) => (
                  <option key={source} value={source}>{sourceLabel(source)} ({count})</option>
                ))}
              </select>
            </label>
            <label className="sg-rag-select">
              <span>鎺掑簭</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Button onClick={applySearch}>妫€绱?/Button>
          </div>

          <div className="sg-rag-source-meter" aria-label="鐭ヨ瘑婧愬垎甯?>
            {sourceOptions.map(({ source, count }) => (
              <button
                key={source}
                type="button"
                className={sourceFilter === source ? "is-active" : ""}
                onClick={() => setSourceFilter(sourceFilter === source ? "all" : source)}
              >
                {sourceLabel(source)} <strong>{count}</strong>
              </button>
            ))}
          </div>

          <div className="sg-rag-evidence-browser" id="sg-rag-evidence-results">
            <div className="sg-rag-evidence-list" aria-label="璇佹嵁鍒楄〃">
              {visibleEvidence.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sg-rag-evidence-row ${selectedEvidenceId === item.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedEvidenceId(item.id)}
                >
                  <span className="sg-rag-evidence-source">{sourceLabel(item.source)} 路 {moduleLabel(item.module)}</span>
                  <strong>{item.title || item.id}</strong>
                  <p>{item.content || "璇ヨ瘉鎹殏鏃犳鏂囥€?}</p>
                  <em>{evidenceReason(item, knowledgeQuery)}</em>
                </button>
              ))}
              {visibleEvidence.length === 0 && (
                <div className="sg-rag-empty">褰撳墠瑙嗗浘娌℃湁鍖归厤璇佹嵁銆傚彲浠ユ竻绌烘绱㈣瘝銆佸垏鎹㈡潵婧愶紝鎴栭噸寤虹储寮曞悗閲嶈瘯銆?/div>
              )}
            </div>

            <aside className="sg-rag-evidence-detail">
              {selectedEvidence ? (
                <>
                  <span>{sourceLabel(selectedEvidence.source)} 路 {moduleLabel(selectedEvidence.module)}</span>
                  <h3>{selectedEvidence.title}</h3>
                  <p>{selectedEvidence.content}</p>
                  <div className="sg-rag-evidence-why">
                    <strong>涓轰粈涔堝懡涓?/strong>
                    <span>{evidenceReason(selectedEvidence, knowledgeQuery)}</span>
                    {selectedEvidence.match_snippet && <span>鍖归厤鐗囨锛歿selectedEvidence.match_snippet}</span>}
                  </div>
                  <div className="sg-rag-tags">
                    {(selectedEvidence.related_claim_types || []).map((tag) => <i key={tag}>{tag}</i>)}
                  </div>
                  <div className="sg-rag-detail-actions">
                    <Button onClick={() => pinEvidence(selectedEvidence)}>鍔犲叆闂瓟寮曠敤</Button>
                    <Button
                      variant="primary"
                      onClick={() => askQuestion(`璇峰熀浜庤繖鏉¤瘉鎹鏄庡畠瀵瑰綋鍓嶇洿鎾棿椋庨櫓鍒ゆ柇鐨勬剰涔夛細${selectedEvidence.title}`, [selectedEvidence])}
                    >
                      鐢ㄨ繖鏉¤瘉鎹彁闂?                    </Button>
                  </div>
                </>
              ) : (
                <div className="sg-rag-empty">閫夋嫨涓€鏉¤瘉鎹悗锛岃繖閲屼細灞曠ず瀹屾暣渚濇嵁銆佸懡涓師鍥犲拰鍙彁闂叆鍙ｃ€?/div>
              )}
            </aside>
          </div>
        </Panel>

        <Panel eyebrow="AUDIT Q&A" title="RAG 瀹℃牳闂瓟" className="sg-rag-qa-panel">
          <div className="sg-rag-context-strip">
            <div>
              <span>褰撳墠寮曠敤涓婁笅鏂?/span>
              <strong>{pinnedEvidences.length ? `${pinnedEvidences.length} 鏉¤瘉鎹凡閿佸畾` : "鏈攣瀹氬崟鏉¤瘉鎹?}</strong>
              <p>{pinnedEvidences.length ? "闂瓟灏嗕紭鍏堝熀浜庤繖浜涜瘉鎹紝骞剁粨鍚堢洿鎾棿涓婁笅鏂囧洖绛斻€? : "闂瓟灏嗗熀浜庡綋鍓嶇洿鎾棿淇″彿鍜岀煡璇嗗簱鍙洖缁撴灉鍥炵瓟銆?}</p>
            </div>
            {pinnedEvidences.length > 0 && <Button onClick={() => setPinnedEvidences([])}>娓呴櫎寮曠敤</Button>}
          </div>

          {pinnedEvidences.length > 0 && (
            <div className="sg-rag-pinned-evidence">
              {pinnedEvidences.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPinnedEvidences((current) => current.filter((evidence) => evidence.id !== item.id))}
                  title="鐐瑰嚮绉婚櫎寮曠敤"
                >
                  {sourceLabel(item.source)} 路 {item.title || item.id}
                </button>
              ))}
            </div>
          )}

          <div className="sg-rag-question-box">
            <label>
              <span>瀹℃牳闂</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="渚嬪锛氫负浠€涔堝綋鍓嶇洿鎾棿闇€瑕佸鏍革紵鏈夊摢浜涚浉浼兼渚嬶紵搴斿浣曞缃紵"
                rows={4}
              />
            </label>
            <div className="sg-rag-quick-questions">
              {QUICK_QUESTIONS.map((item) => (
                <button key={item} type="button" onClick={() => askQuestion(item)}>{item}</button>
              ))}
            </div>
            <Button variant="primary" onClick={() => askQuestion()} disabled={asking}>
              {asking ? "姝ｅ湪鐢熸垚渚濇嵁" : "鐢熸垚瀹℃牳鍥炵瓟"}
            </Button>
          </div>

          <div className="sg-rag-answer" aria-live="polite">
            {!answer && !asking && (
              <div className="sg-rag-empty">鍥炵瓟浼氭寜鈥滅粨璁恒€佸垽鏂緷鎹€佸叧鑱旀硶瑙勩€佺浉浼兼渚嬨€佸缓璁缃€佸紩鐢ㄨ瘉鎹€濊緭鍑猴紝鏂逛究鐩存帴鐢ㄤ簬瀹℃牳澶嶆牳銆?/div>
            )}
            {asking && <div className="sg-rag-muted">姝ｅ湪妫€绱㈢煡璇嗗簱骞剁敓鎴愯瘉鎹害鏉熷洖绛?..</div>}
            {answer && (
              <>
                <div className={`sg-rag-answer-head ${riskTone(answer.risk_level)}`}>
                  <span>缁撹</span>
                  <strong>{answer.risk_level || "寰呭鏍?}</strong>
                  <p>{answer.conclusion}</p>
                </div>
                <AnswerSection title="鍒ゆ柇渚濇嵁" items={answer.basis} />
                <EvidenceSection title="鍏宠仈娉曡" items={answer.regulations} />
                <EvidenceSection title="鐩镐技妗堜緥" items={answer.cases} />
                <AnswerSection title="寤鸿澶勭疆" items={answer.action_suggestions} />
                <EvidenceSection title="寮曠敤璇佹嵁" items={answer.citations} compact />
                {!answer.used_llm && answer.reason && <div className="sg-rag-answer-note">LLM 鏈弬涓庯細{answer.reason}</div>}
              </>
            )}
          </div>
        </Panel>
      </div>

      <details className="sg-rag-advanced">
        <summary>
          <span>楂樼骇璁剧疆</span>
          <em>璋冩暣璇佹嵁鍙洖鑼冨洿銆佸洖绛斾弗璋ㄥ害銆佺储寮曟柟寮忓拰椋庨櫓鍒ゅ畾闃堝€?/em>
        </summary>
        <AdvancedSettings
          config={config}
          status={status}
          updateConfig={updateConfig}
          saveConfig={saveConfig}
          saving={saving}
        />
      </details>
    </section>
  );
}

function Metric({ label, value, detail, tone = "" }) {
  return (
    <div className={`sg-rag-metric ${tone}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function AnswerSection({ title, items = [] }) {
  const normalized = Array.isArray(items) ? items : [items].filter(Boolean);
  if (!normalized.length) return null;
  return (
    <section className="sg-rag-answer-section">
      <h3>{title}</h3>
      <ul>
        {normalized.map((item, index) => <li key={`${title}-${index}`}>{String(item)}</li>)}
      </ul>
    </section>
  );
}

function EvidenceSection({ title, items = [], compact = false }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <section className={`sg-rag-answer-section ${compact ? "is-compact" : ""}`}>
      <h3>{title}</h3>
      <div className="sg-rag-citations">
        {items.map((item, index) => (
          <article key={item.id || item.evidence_id || `${title}-${index}`}>
            <span>{sourceLabel(item.source)}</span>
            <strong>{item.title || item.id || item.evidence_id}</strong>
            {!compact && <p>{item.content}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function AdvancedSettings({ config, status, updateConfig, saveConfig, saving }) {
  const embedding = config.embedding || {};
  const retrieval = config.retrieval || {};
  const scoring = config.llm_scoring || {};
  const risk = config.risk || {};
  return (
    <div className="sg-rag-advanced-grid">
      <Panel eyebrow="VECTOR STORE" title="Embedding 涓庣储寮?>
        <div className="sg-rag-form-grid">
          <CheckField label="鍚敤浜戠 embedding" checked={!!embedding.enabled} onChange={(value) => updateConfig("embedding.enabled", value)} />
          <CheckField label="Embedding Key 宸查厤缃? checked={!!embedding.api_key_configured} readOnly />
          <InputField label="Provider" value={embedding.provider} onChange={(value) => updateConfig("embedding.provider", value)} />
          <InputField label="Model" value={embedding.model} onChange={(value) => updateConfig("embedding.model", value)} />
          <InputField label="Base URL" value={embedding.base_url} onChange={(value) => updateConfig("embedding.base_url", value)} />
          <InputField label="API Key Env" value={embedding.api_key_env} onChange={(value) => updateConfig("embedding.api_key_env", value)} />
          <InputField type="number" label="Vector Dimension" value={embedding.dimensions} onChange={(value) => updateConfig("embedding.dimensions", Number(value))} />
          <InputField type="number" label="Batch Size" value={embedding.batch_size} onChange={(value) => updateConfig("embedding.batch_size", Number(value))} />
        </div>
        <div className="sg-rag-muted">褰撳墠绱㈠紩锛歿status?.embedding_status?.ready ? "READY" : status?.embedding_status?.reason || "鏈氨缁?}</div>
      </Panel>

      <Panel eyebrow="RETRIEVAL" title="鍙洖鍙傛暟">
        <div className="sg-rag-form-grid">
          <SelectField label="妫€绱㈡ā寮? value={retrieval.mode} options={["embedding", "tfidf"]} onChange={(value) => updateConfig("retrieval.mode", value)} />
          <InputField type="number" label="Claim Top-K" value={retrieval.claim_top_k} onChange={(value) => updateConfig("retrieval.claim_top_k", Number(value))} />
          <InputField type="number" label="Recall Top-K" value={retrieval.top_k} onChange={(value) => updateConfig("retrieval.top_k", Number(value))} />
          <InputField type="number" label="Final Evidence K" value={retrieval.final_k} onChange={(value) => updateConfig("retrieval.final_k", Number(value))} />
          <InputField type="number" step="0.01" label="Similarity Threshold" value={retrieval.similarity_threshold} onChange={(value) => updateConfig("retrieval.similarity_threshold", Number(value))} />
          <InputField type="number" step="0.01" label="Dedupe Threshold" value={retrieval.dedupe_threshold} onChange={(value) => updateConfig("retrieval.dedupe_threshold", Number(value))} />
        </div>
      </Panel>

      <Panel eyebrow="LLM SCORING" title="LLM 鎵撳垎">
        <div className="sg-rag-form-grid">
          <CheckField label="鍚敤 LLM 鎵撳垎" checked={!!scoring.enabled} onChange={(value) => updateConfig("llm_scoring.enabled", value)} />
          <CheckField label="鍚敤 LLM rerank" checked={!!scoring.rerank_enabled} onChange={(value) => updateConfig("llm_scoring.rerank_enabled", value)} />
          <CheckField label="LLM Key 宸查厤缃? checked={!!scoring.api_key_configured} readOnly />
          <InputField label="Provider" value={scoring.provider} onChange={(value) => updateConfig("llm_scoring.provider", value)} />
          <InputField label="Model" value={scoring.model} onChange={(value) => updateConfig("llm_scoring.model", value)} />
          <InputField type="number" step="0.1" label="Temperature" value={scoring.temperature} onChange={(value) => updateConfig("llm_scoring.temperature", Number(value))} />
          <InputField type="number" step="0.1" label="Top P" value={scoring.top_p} onChange={(value) => updateConfig("llm_scoring.top_p", Number(value))} />
          <InputField type="number" label="Max Tokens" value={scoring.max_tokens} onChange={(value) => updateConfig("llm_scoring.max_tokens", Number(value))} />
        </div>
      </Panel>

      <Panel eyebrow="RISK POLICY" title="椋庨櫓闃堝€?>
        <div className="sg-rag-form-grid">
          <InputField type="number" step="0.01" label="P0 闃堝€? value={getAtPath(risk, "thresholds.p0")} onChange={(value) => updateConfig("risk.thresholds.p0", Number(value))} />
          <InputField type="number" step="0.01" label="P1 闃堝€? value={getAtPath(risk, "thresholds.p1")} onChange={(value) => updateConfig("risk.thresholds.p1", Number(value))} />
          <InputField type="number" step="0.01" label="P2 闃堝€? value={getAtPath(risk, "thresholds.p2")} onChange={(value) => updateConfig("risk.thresholds.p2", Number(value))} />
          <InputField type="number" step="0.05" label="LLM Blend" value={risk.llm_blend} onChange={(value) => updateConfig("risk.llm_blend", Number(value))} />
          <CheckField label="浣庣疆淇″害杞汉宸ュ鏍? checked={!!risk.human_review_on_low_confidence} onChange={(value) => updateConfig("risk.human_review_on_low_confidence", value)} />
          <InputField type="number" step="0.01" label="浜哄伐澶嶆牳缃俊搴﹂槇鍊? value={risk.human_review_confidence_threshold} onChange={(value) => updateConfig("risk.human_review_confidence_threshold", Number(value))} />
        </div>
      </Panel>

      <div className="sg-rag-advanced-actions">
        <Button onClick={() => saveConfig(false)} disabled={saving}>淇濆瓨楂樼骇璁剧疆</Button>
        <Button variant="primary" onClick={() => saveConfig(true)} disabled={saving}>淇濆瓨骞堕噸寤虹储寮?/Button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", ...props }) {
  return (
    <label className="sg-rag-field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="sg-rag-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function CheckField({ label, checked, onChange, readOnly = false }) {
  return (
    <label className={`sg-rag-check ${readOnly ? "is-readonly" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        readOnly={readOnly}
        onChange={(event) => !readOnly && onChange?.(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

