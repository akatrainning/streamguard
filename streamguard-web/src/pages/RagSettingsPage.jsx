import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Panel } from "../components/ui";

const VIEW_TABS = [
  { id: "combined", label: "组合证据", hint: "联合查看法规、案例、材料和实时命中证据" },
  { id: "rules", label: "法规规则图谱", hint: "查看规则节点、风险类型和证据要求" },
  { id: "cases", label: "历史案例", hint: "对照相似争议、处置依据和处置经验" },
  { id: "evidence", label: "证据片段", hint: "查看可引用的检测、授权、价格和上下文材料" },
  { id: "live", label: "实时命中", hint: "聚焦当前直播间已经沉淀的话术证据" },
];

const QUICK_QUESTIONS = [
  "为什么当前直播间需要复核？",
  "有哪些相似历史案例？",
  "请给出处置建议和引用依据。",
];

const SORT_OPTIONS = [
  { value: "score", label: "按综合相关度" },
  { value: "similarity", label: "按语义相似度" },
  { value: "source", label: "按证据来源" },
  { value: "recent", label: "按时间新近" },
];

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function sourceLabel(source) {
  return {
    rule_db: "法规规则",
    historical_case: "历史案例",
    evidence_db: "证据材料",
    asr_context: "实时片段",
    claim_case: "话术案例",
  }[source] || source || "未知来源";
}

function moduleLabel(module) {
  return {
    live_transcript: "实时转写库",
    historical_records: "历史记录库",
    rule_graph: "规则图库",
    evidence_docs: "证据文档库",
  }[module] || module || "知识库";
}

function riskTone(level) {
  if (level === "P0" || level === "P1") return "is-danger";
  if (level === "P2") return "is-warning";
  return "is-good";
}

function formatTime(value) {
  if (!value) return "未评估";
  const numberValue = Number(value);
  const date = Number.isFinite(numberValue)
    ? new Date(numberValue > 10_000_000_000 ? numberValue : numberValue * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "未评估";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatRelativeTime(value) {
  if (!value) return "尚未生成";
  const ms = Date.now() - Number(value);
  if (ms < 60_000) return "刚刚";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`;
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
  if (item.similarity != null) bits.push(`语义相似度 ${Number(item.similarity).toFixed(3)}`);
  if (item.score != null) bits.push(`综合相关度 ${Number(item.score).toFixed(3)}`);
  if (item.meta?.risk_type) bits.push(`风险类型 ${item.meta.risk_type}`);
  if (item.related_claim_types?.length) bits.push(`关联 ${item.related_claim_types.join("、")}`);
  if (activeQuery) bits.push("与当前检索词匹配");
  return bits.length ? bits.join("；") : "由来源权重、证据完整性和规则关联度排序";
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

function evidenceOrbitStyle(item, index, total) {
  const score = Number(item.score ?? item.similarity ?? 0.42);
  const angle = -94 + (360 / Math.max(total, 1)) * index;
  const radius = 116 + (index % 4) * 24 + Math.min(24, score * 18);
  const radians = (angle * Math.PI) / 180;
  const color = {
    rule_db: "var(--accent)",
    historical_case: "var(--hype)",
    evidence_db: "var(--fact)",
    asr_context: "var(--trap)",
    claim_case: "var(--hype)",
  }[item.source] || "var(--text-secondary)";
  return {
    "--node-x": `${Math.cos(radians) * radius}px`,
    "--node-y": `${Math.sin(radians) * radius}px`,
    "--node-color": color,
    "--node-size": `${34 + Math.min(22, score * 24)}px`,
  };
}

function EvidenceConstellation({ items, selectedId, onSelect, sourceOptions, activeTab }) {
  const visibleNodes = items.slice(0, 18);
  return (
    <section className="sg-rag-constellation" aria-label="证据星图">
      <div className="sg-rag-constellation-stage">
        <div className="sg-rag-constellation-core">
          <span>{activeTab.label}</span>
          <strong>{items.length}</strong>
          <em>retrieved</em>
        </div>
        {visibleNodes.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`sg-rag-orbit-node ${selectedId === item.id ? "is-selected" : ""}`}
            style={evidenceOrbitStyle(item, index, visibleNodes.length)}
            onClick={() => onSelect(item.id)}
            title={item.title || item.id}
          >
            {Math.round(Number(item.score ?? item.similarity ?? 0) * 100) || index + 1}
          </button>
        ))}
      </div>

      <div className="sg-rag-constellation-ledger">
        <div>
          <span>Evidence Sources</span>
          <strong>{sourceOptions.length || 0} active lanes</strong>
        </div>
        <div className="sg-rag-constellation-bars">
          {sourceOptions.map(({ source, count }) => (
            <button key={source} type="button" onClick={() => onSelect(items.find((item) => item.source === source)?.id || "")}>
              <span>{sourceLabel(source)}</span>
              <i style={{ "--bar": `${Math.min(100, count * 14)}%` }} />
              <strong>{count}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function RagSettingsPage({
  apiBase = "http://localhost:8011",
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
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [answerGeneratedAt, setAnswerGeneratedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initialLoadDoneRef = useRef(false);
  const knowledgeRequestRef = useRef(0);
  const knowledgeCacheRef = useRef(new Map());

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
    if (!res.ok) throw new Error(payload?.detail || "请求失败，请稍后重试。");
    return payload;
  }, [apiBase]);

  const loadConfig = useCallback(async () => {
    const payload = await fetchJson("/rag/config");
    setStatus(payload);
    setConfig(payload.config);
  }, [fetchJson]);

  const loadKnowledge = useCallback(async (view, query = "") => {
    const trimmedQuery = String(query || "").trim();
    const cacheKey = `${view}::${trimmedQuery}`;
    const cached = knowledgeCacheRef.current.get(cacheKey);
    if (cached) {
      setKnowledge(cached);
      setSelectedEvidenceId((current) => {
        if (current && cached.items?.some((item) => item.id === current)) return current;
        return cached.items?.[0]?.id || "";
      });
      return cached;
    }

    const requestId = knowledgeRequestRef.current + 1;
    knowledgeRequestRef.current = requestId;
    const params = new URLSearchParams({ view, limit: "120" });
    if (trimmedQuery) params.set("query", trimmedQuery);
    const payload = await fetchJson(`/rag/knowledge?${params.toString()}`);
    if (requestId !== knowledgeRequestRef.current) return null;
    knowledgeCacheRef.current.set(cacheKey, payload);
    if (knowledgeCacheRef.current.size > 20) {
      const oldestKey = knowledgeCacheRef.current.keys().next().value;
      knowledgeCacheRef.current.delete(oldestKey);
    }
    setKnowledge(payload);
    setSelectedEvidenceId((current) => {
      if (current && payload.items?.some((item) => item.id === current)) return current;
      return payload.items?.[0]?.id || "";
    });
    return payload;
  }, [fetchJson]);

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
      initialLoadDoneRef.current = false;
      setLoading(true);
      setError("");
      try {
        await loadConfig();
        await loadKnowledge(activeView, knowledgeQuery);
      } catch (err) {
        if (alive) setError(err.message || "RAG 工作台加载失败。");
      } finally {
        if (alive) {
          initialLoadDoneRef.current = true;
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [loadConfig, loadKnowledge]);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return undefined;
    let alive = true;
    const refreshKnowledge = async () => {
      let didFinishLatest = false;
      setKnowledgeLoading(true);
      setError("");
      try {
        didFinishLatest = Boolean(await loadKnowledge(activeView, knowledgeQuery));
      } catch (err) {
        didFinishLatest = true;
        if (alive) setError(err.message || "RAG 证据检索失败。");
      } finally {
        if (alive && didFinishLatest) setKnowledgeLoading(false);
      }
    };
    refreshKnowledge();
    return () => {
      alive = false;
    };
  }, [activeView, knowledgeQuery, loadKnowledge]);

  useEffect(() => {
    let alive = true;
    const evaluate = async () => {
      try {
        await loadEvaluation();
        await loadKnowledge(activeView, knowledgeQuery);
      } catch (err) {
        if (alive) setError(err.message || "直播间总评刷新失败。");
      }
    };
    evaluate();
    return () => {
      alive = false;
    };
  }, [loadEvaluation, loadKnowledge]);

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
      setNotice(rebuild ? "高级设置已保存，索引已重建。" : "高级设置已保存。");
      if (rebuild) {
        knowledgeCacheRef.current.clear();
        setKnowledgeLoading(true);
        await loadKnowledge(activeView, knowledgeQuery);
      }
    } catch (err) {
      setError(err.message || "高级设置保存失败，请检查参数后重试。");
    } finally {
      if (rebuild) setKnowledgeLoading(false);
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
      knowledgeCacheRef.current.clear();
      setKnowledgeLoading(true);
      await loadKnowledge(activeView, knowledgeQuery);
      setNotice("索引已重建，证据地图已刷新。");
    } catch (err) {
      setError(err.message || "索引重建失败，请检查 embedding 配置和 API Key。");
    } finally {
      setKnowledgeLoading(false);
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
      setError("请输入一个审核问题。");
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
      setAnswerGeneratedAt(Date.now());
      setShowAnswerModal(true);
    } catch (err) {
      setError(err.message || "RAG 问答失败，请检查 LLM 配置或稍后重试。");
    } finally {
      setAsking(false);
    }
  }, [contextPayload, fetchJson, pinnedEvidences, question]);

  const applySearch = useCallback(() => {
    const trimmed = searchInput.trim();
    if (trimmed === knowledgeQuery) return;
    setKnowledgeQuery(trimmed);
  }, [knowledgeQuery, searchInput]);

  if (loading || !config) {
    return (
      <section className="sg-rag-page">
        <Panel eyebrow="RAG WORKBENCH" title="正在建立证据工作台">
          <div className="sg-rag-muted">正在读取知识库、索引状态和当前直播间评价。</div>
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
          <h1>RAG 证据工作台</h1>
          <p>把法规规则、历史案例、证据材料和当前直播间话术放到同一个复核视角里，帮助审核人员回答：哪里有风险，为什么有风险，依据是什么。</p>
        </div>
        <div className="sg-rag-actions">
          <Button onClick={loadEvaluation}>刷新总评</Button>
          <Button onClick={reindex} disabled={reindexing}>{reindexing ? "正在重建索引" : "重建索引"}</Button>
        </div>
      </header>

      {(error || notice) && (
        <div className={`sg-rag-message ${error ? "is-error" : "is-ok"}`} role="status">{error || notice}</div>
      )}

      <section className="sg-rag-summary-grid">
        <div className={`sg-rag-verdict ${riskTone(evaluation?.risk_level)} ${isEvaluationStale ? "is-stale" : ""}`}>
          <span>当前总评</span>
          <strong>{evaluation?.risk_level || "P3"}</strong>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", minHeight: "4rem" }}>
            <p style={{ margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {evaluation?.summary || "暂无足够 RAG 命中，建议先检索知识库证据或提出审核问题。"}
            </p>
            <div style={{ minHeight: "1.25rem", marginTop: "0.25rem", opacity: isEvaluationStale ? 1 : 0, transition: "opacity 0.2s ease", pointerEvents: isEvaluationStale ? "auto" : "none" }}>
              <small>评估后新增 {newSignalCount || "若干"} 条信号，建议刷新总评。</small>
            </div>
          </div>
        </div>
        <Metric label="命中结果" value={evaluation?.matched_count || 0} detail="当前上下文" />
        <Metric label="评估时间" value={formatRelativeTime(evaluationMeta?.evaluatedAt)} detail={isEvaluationStale ? "可能已过期" : "与当前信号同步"} tone={isEvaluationStale ? "is-warning" : "is-good"} />
        <Metric label="索引状态" value={embeddingStatus.ready ? "READY" : "CHECK"} detail={embeddingStatus.ready ? formatTime(embeddingStatus.last_built_at) : embeddingStatus.reason || "未就绪"} tone={embeddingStatus.ready ? "is-good" : "is-warning"} />
        <Metric label="规则节点" value={counts.rule_graph_nodes || 0} detail="法规图谱" />
      </section>

      <EvidenceConstellation
        items={visibleEvidence}
        selectedId={selectedEvidenceId}
        onSelect={setSelectedEvidenceId}
        sourceOptions={sourceOptions}
        activeTab={activeTab}
      />

      <div className="sg-rag-workbench-grid">
        <Panel
          eyebrow="EVIDENCE MAP"
          title="知识库可视化"
          actions={<span className="sg-rag-panel-note">{activeTab.hint}</span>}
          className="sg-rag-map-panel"
        >
          <div className="sg-rag-view-tabs" role="tablist" aria-label="知识库视图">
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
              <span>检索证据</span>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applySearch();
                }}
                placeholder="输入商品、话术、法规条款或风险类型"
              />
            </label>
            <label className="sg-rag-select">
              <span>来源</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">全部来源</option>
                {sourceOptions.map(({ source, count }) => (
                  <option key={source} value={source}>{sourceLabel(source)} ({count})</option>
                ))}
              </select>
            </label>
            <label className="sg-rag-select">
              <span>排序</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Button onClick={applySearch} disabled={knowledgeLoading}>
              {knowledgeLoading ? "检索中" : "检索"}
            </Button>
          </div>

          <div className="sg-rag-source-meter" aria-label="知识源分布">
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

          <div
            className={`sg-rag-evidence-browser ${knowledgeLoading ? "is-refreshing" : ""}`}
            id="sg-rag-evidence-results"
            aria-busy={knowledgeLoading ? "true" : "false"}
          >
            {knowledgeLoading && (
              <div className="sg-rag-refresh-indicator" role="status">
                正在刷新证据命中
              </div>
            )}
            <div className="sg-rag-evidence-list" aria-label="证据列表">
              {visibleEvidence.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`sg-rag-evidence-row ${selectedEvidenceId === item.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedEvidenceId(item.id)}
                >
                  <span className="sg-rag-evidence-source">{sourceLabel(item.source)} · {moduleLabel(item.module)}</span>
                  <strong>{item.title || item.id}</strong>
                  <p>{item.content || "该证据暂无正文。"}</p>
                  <em>{evidenceReason(item, knowledgeQuery)}</em>
                </button>
              ))}
              {visibleEvidence.length === 0 && (
                <div className="sg-rag-empty">当前视图没有匹配证据。可以清空检索词、切换来源，或重建索引后重试。</div>
              )}
            </div>

            <aside className="sg-rag-evidence-detail">
              {selectedEvidence ? (
                <>
                  <span>{sourceLabel(selectedEvidence.source)} · {moduleLabel(selectedEvidence.module)}</span>
                  <h3>{selectedEvidence.title}</h3>
                  <p>{selectedEvidence.content}</p>
                  <div className="sg-rag-evidence-why">
                    <strong>为什么命中</strong>
                    <span>{evidenceReason(selectedEvidence, knowledgeQuery)}</span>
                    {selectedEvidence.match_snippet && <span>匹配片段：{selectedEvidence.match_snippet}</span>}
                  </div>
                  <div className="sg-rag-tags">
                    {(selectedEvidence.related_claim_types || []).map((tag) => <i key={tag}>{tag}</i>)}
                  </div>
                  <div className="sg-rag-detail-actions">
                    <Button onClick={() => pinEvidence(selectedEvidence)}>加入问答引用</Button>
                    <Button
                      variant="primary"
                      onClick={() => askQuestion(`请基于这条证据说明它对当前直播间风险判断的意义：${selectedEvidence.title}`, [selectedEvidence])}
                    >
                      用这条证据提问
                    </Button>
                  </div>
                </>
              ) : (
                <div className="sg-rag-empty">选择一条证据后，这里会展示完整依据、命中原因和可提问入口。</div>
              )}
            </aside>
          </div>
        </Panel>

        <Panel eyebrow="AUDIT Q&A" title="RAG 审核问答" className="sg-rag-qa-panel">
          <div className="sg-rag-context-strip">
            <div>
              <span>当前引用上下文</span>
              <strong>{pinnedEvidences.length ? `${pinnedEvidences.length} 条证据已锁定` : "未锁定单条证据"}</strong>
              <p>{pinnedEvidences.length ? "问答将优先基于这些证据，并结合直播间上下文回答。" : "问答将基于当前直播间信号和知识库召回结果回答。"}</p>
            </div>
            {pinnedEvidences.length > 0 && <Button onClick={() => setPinnedEvidences([])}>清除引用</Button>}
          </div>

          {pinnedEvidences.length > 0 && (
            <div className="sg-rag-pinned-evidence">
              {pinnedEvidences.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPinnedEvidences((current) => current.filter((evidence) => evidence.id !== item.id))}
                  title="点击移除引用"
                >
                  {sourceLabel(item.source)} · {item.title || item.id}
                </button>
              ))}
            </div>
          )}

          <div className="sg-rag-question-box">
            <label>
              <span>审核问题</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="例如：为什么当前直播间需要复核？有哪些相似案例？应如何处置？"
                rows={4}
              />
            </label>
            <div className="sg-rag-quick-questions">
              {QUICK_QUESTIONS.map((item) => (
                <button key={item} type="button" onClick={() => askQuestion(item)}>{item}</button>
              ))}
            </div>
            <Button variant="primary" onClick={() => askQuestion()} disabled={asking}>
              {asking ? "正在生成依据" : "生成审核回答"}
            </Button>
          </div>

          <div className="sg-rag-answer" aria-live="polite">
            {!answer && !asking && (
              <div className="sg-rag-empty">生成结果将以审核报告弹窗展示，页面内只保留提问入口和最近一次报告状态。</div>
            )}
            {asking && <div className="sg-rag-muted">正在检索知识库并生成证据约束回答...</div>}
            {answer && (
              <div className="sg-rag-report-launch">
                <div>
                  <span>最近一次审核报告</span>
                  <strong>{answer.risk_level || "待复核"} · {formatTime(answerGeneratedAt)}</strong>
                  <p>{answer.conclusion || "报告已生成，可打开查看完整复核内容。"}</p>
                </div>
                <Button variant="primary" onClick={() => setShowAnswerModal(true)}>查看审核报告</Button>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <details className="sg-rag-advanced">
        <summary>
          <span>高级设置</span>
          <em>调整证据召回范围、回答严谨度、索引方式和风险判定阈值</em>
        </summary>
        <AdvancedSettings
          config={config}
          status={status}
          updateConfig={updateConfig}
          saveConfig={saveConfig}
          saving={saving}
        />
      </details>

      {showAnswerModal && answer && (
        <RagAnswerReportModal
          answer={answer}
          question={question}
          generatedAt={answerGeneratedAt}
          pinnedCount={pinnedEvidences.length}
          onClose={() => setShowAnswerModal(false)}
        />
      )}
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

function normalizeTextItems(items) {
  if (Array.isArray(items)) return items.filter(Boolean).map((item) => String(item));
  return items ? [String(items)] : [];
}

function countItems(items) {
  if (Array.isArray(items)) return items.filter(Boolean).length;
  return items ? 1 : 0;
}

function summarizeEvidence(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "暂无";
  const first = items.find(Boolean);
  if (!first) return "暂无";
  if (typeof first === "string") return first;
  return first.title || first.id || first.evidence_id || first.content || "暂无";
}

function summarizeText(items) {
  const normalized = normalizeTextItems(items);
  return normalized[0] || "暂无";
}

function AnswerStats({ answer }) {
  const stats = [
    { label: "依据", count: countItems(answer?.basis), summary: summarizeText(answer?.basis) },
    { label: "法规", count: countItems(answer?.regulations), summary: summarizeEvidence(answer?.regulations) },
    { label: "案例", count: countItems(answer?.cases), summary: summarizeEvidence(answer?.cases) },
    { label: "证据", count: countItems(answer?.citations), summary: summarizeEvidence(answer?.citations) },
  ];

  return (
    <div className="sg-rag-answer-stats" aria-label="回答摘要">
      {stats.map((item) => (
        <article key={item.label} className="sg-rag-answer-stat">
          <span>{item.label}</span>
          <strong>{item.count}</strong>
          <p>{item.summary}</p>
        </article>
      ))}
    </div>
  );
}

function RagAnswerReportModal({ answer, question, generatedAt, pinnedCount, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="sg-modal-backdrop sg-rag-report-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sg-rag-report-modal" role="dialog" aria-modal="true" aria-labelledby="sg-rag-report-title">
        <header className="sg-rag-report-head">
          <div>
            <div className="sg-ui-eyebrow">Audit Report</div>
            <h2 id="sg-rag-report-title">RAG 审核报告</h2>
          </div>
          <div className="sg-rag-report-actions">
            <Button onClick={onClose}>关闭</Button>
          </div>
        </header>

        <div className="sg-rag-report-body">
          <div className="sg-rag-report-meta">
            <div>
              <span>审核问题</span>
              <strong>{question || "未记录问题"}</strong>
            </div>
            <div>
              <span>生成时间</span>
              <strong>{formatTime(generatedAt)}</strong>
            </div>
            <div>
              <span>锁定证据</span>
              <strong>{pinnedCount || 0} 条</strong>
            </div>
          </div>

          <div className="sg-rag-answer-layout sg-rag-answer-layout-modal">
            <div className={`sg-rag-answer-head ${riskTone(answer.risk_level)}`}>
              <span>审核结论</span>
              <strong>{answer.risk_level || "待复核"}</strong>
              <p>{answer.conclusion}</p>
            </div>
            <AnswerStats answer={answer} />
            <div className="sg-rag-answer-main">
              <div className="sg-rag-answer-column">
                <AnswerSection title="判断依据" items={answer.basis} />
                <AnswerSection title="建议处置" items={answer.action_suggestions} />
              </div>
              <div className="sg-rag-answer-column sg-rag-answer-evidence">
                <EvidenceSection title="关联法规" items={answer.regulations} compact />
                <EvidenceSection title="相似案例" items={answer.cases} compact />
                <EvidenceSection title="引用证据" items={answer.citations} />
              </div>
            </div>
            {!answer.used_llm && answer.reason && <div className="sg-rag-answer-note">LLM 未参与：{answer.reason}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

function AnswerSection({ title, items = [] }) {
  const normalized = normalizeTextItems(items);
  if (!normalized.length) return null;
  return (
    <section className="sg-rag-answer-section">
      <h3>{title}</h3>
      <ul className="sg-rag-answer-list">
        {normalized.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
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
      <Panel eyebrow="VECTOR STORE" title="Embedding 与索引">
        <div className="sg-rag-form-grid">
          <CheckField label="启用云端 embedding" checked={!!embedding.enabled} onChange={(value) => updateConfig("embedding.enabled", value)} />
          <CheckField label="Embedding Key 已配置" checked={!!embedding.api_key_configured} readOnly />
          <InputField label="Provider" value={embedding.provider} onChange={(value) => updateConfig("embedding.provider", value)} />
          <InputField label="Model" value={embedding.model} onChange={(value) => updateConfig("embedding.model", value)} />
          <InputField label="Base URL" value={embedding.base_url} onChange={(value) => updateConfig("embedding.base_url", value)} />
          <InputField label="API Key Env" value={embedding.api_key_env} onChange={(value) => updateConfig("embedding.api_key_env", value)} />
          <InputField type="number" label="Vector Dimension" value={embedding.dimensions} onChange={(value) => updateConfig("embedding.dimensions", Number(value))} />
          <InputField type="number" label="Batch Size" value={embedding.batch_size} onChange={(value) => updateConfig("embedding.batch_size", Number(value))} />
        </div>
        <div className="sg-rag-muted">当前索引：{status?.embedding_status?.ready ? "READY" : status?.embedding_status?.reason || "未就绪"}</div>
      </Panel>

      <Panel eyebrow="RETRIEVAL" title="召回参数">
        <div className="sg-rag-form-grid">
          <SelectField label="检索模式" value={retrieval.mode} options={["embedding", "tfidf"]} onChange={(value) => updateConfig("retrieval.mode", value)} />
          <InputField type="number" label="Claim Top-K" value={retrieval.claim_top_k} onChange={(value) => updateConfig("retrieval.claim_top_k", Number(value))} />
          <InputField type="number" label="Recall Top-K" value={retrieval.top_k} onChange={(value) => updateConfig("retrieval.top_k", Number(value))} />
          <InputField type="number" label="Final Evidence K" value={retrieval.final_k} onChange={(value) => updateConfig("retrieval.final_k", Number(value))} />
          <InputField type="number" step="0.01" label="Similarity Threshold" value={retrieval.similarity_threshold} onChange={(value) => updateConfig("retrieval.similarity_threshold", Number(value))} />
          <InputField type="number" step="0.01" label="Dedupe Threshold" value={retrieval.dedupe_threshold} onChange={(value) => updateConfig("retrieval.dedupe_threshold", Number(value))} />
        </div>
      </Panel>

      <Panel eyebrow="LLM SCORING" title="LLM 打分">
        <div className="sg-rag-form-grid">
          <CheckField label="启用 LLM 打分" checked={!!scoring.enabled} onChange={(value) => updateConfig("llm_scoring.enabled", value)} />
          <CheckField label="启用 LLM rerank" checked={!!scoring.rerank_enabled} onChange={(value) => updateConfig("llm_scoring.rerank_enabled", value)} />
          <CheckField label="LLM Key 已配置" checked={!!scoring.api_key_configured} readOnly />
          <InputField label="Provider" value={scoring.provider} onChange={(value) => updateConfig("llm_scoring.provider", value)} />
          <InputField label="Model" value={scoring.model} onChange={(value) => updateConfig("llm_scoring.model", value)} />
          <InputField type="number" step="0.1" label="Temperature" value={scoring.temperature} onChange={(value) => updateConfig("llm_scoring.temperature", Number(value))} />
          <InputField type="number" step="0.1" label="Top P" value={scoring.top_p} onChange={(value) => updateConfig("llm_scoring.top_p", Number(value))} />
          <InputField type="number" label="Max Tokens" value={scoring.max_tokens} onChange={(value) => updateConfig("llm_scoring.max_tokens", Number(value))} />
        </div>
      </Panel>

      <Panel eyebrow="RISK POLICY" title="风险阈值">
        <div className="sg-rag-form-grid">
          <InputField type="number" step="0.01" label="P0 阈值" value={getAtPath(risk, "thresholds.p0")} onChange={(value) => updateConfig("risk.thresholds.p0", Number(value))} />
          <InputField type="number" step="0.01" label="P1 阈值" value={getAtPath(risk, "thresholds.p1")} onChange={(value) => updateConfig("risk.thresholds.p1", Number(value))} />
          <InputField type="number" step="0.01" label="P2 阈值" value={getAtPath(risk, "thresholds.p2")} onChange={(value) => updateConfig("risk.thresholds.p2", Number(value))} />
          <InputField type="number" step="0.05" label="LLM Blend" value={risk.llm_blend} onChange={(value) => updateConfig("risk.llm_blend", Number(value))} />
          <CheckField label="低置信度转人工复核" checked={!!risk.human_review_on_low_confidence} onChange={(value) => updateConfig("risk.human_review_on_low_confidence", value)} />
          <InputField type="number" step="0.01" label="人工复核置信度阈值" value={risk.human_review_confidence_threshold} onChange={(value) => updateConfig("risk.human_review_confidence_threshold", Number(value))} />
        </div>
      </Panel>

      <div className="sg-rag-advanced-actions">
        <Button onClick={() => saveConfig(false)} disabled={saving}>保存高级设置</Button>
        <Button variant="primary" onClick={() => saveConfig(true)} disabled={saving}>保存并重建索引</Button>
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
      <select value={value ?? options[0]} onChange={(event) => onChange(event.target.value)}>
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
