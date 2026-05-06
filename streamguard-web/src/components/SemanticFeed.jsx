import { forwardRef, useImperativeHandle, useRef, useState } from "react";

const TYPE_CFG = {
  fact: { label: "事实", color: "var(--fact)", bg: "var(--fact-bg)", border: "var(--fact-border)" },
  hype: { label: "夸大", color: "var(--hype)", bg: "var(--hype-bg)", border: "var(--hype-border)" },
  trap: { label: "风险", color: "var(--trap)", bg: "var(--trap-bg)", border: "var(--trap-border)" },
};

const SOURCE_CFG = {
  audio: { tag: "MIC", label: "语音转写", color: "var(--accent)", bg: "var(--accent-soft)", border: "var(--sg-border-accent)" },
  default: { tag: "AI", label: "模型识别", color: "var(--text-muted)", bg: "rgba(255,255,255,0.03)", border: "var(--sg-border-muted)" },
};

const TABS = [
  { key: "all", label: "全部", color: "var(--accent)" },
  { key: "fact", label: "事实", color: "var(--fact)" },
  { key: "hype", label: "夸大", color: "var(--hype)" },
  { key: "trap", label: "风险", color: "var(--trap)" },
];

const SemanticFeed = forwardRef(function SemanticFeed({ utterances = [] }, ref) {
  const [expandedId, setExpandedId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const scrollRef = useRef(null);

  useImperativeHandle(ref, () => ({
    highlightItem(uid) {
      setFilter("all");
      setExpandedId(uid);
      setHighlightedId(uid);
      setTimeout(() => {
        const element = scrollRef.current?.querySelector(`[data-uid="${uid}"]`);
        if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedId(null), 2500);
      }, 80);
    },
  }));

  const visibleUtterances = utterances.filter((utterance) => utterance?.source !== "chat");
  const filtered = filter === "all"
    ? visibleUtterances
    : visibleUtterances.filter((utterance) => utterance.type === filter);

  const counts = {
    fact: visibleUtterances.filter((utterance) => utterance.type === "fact").length,
    hype: visibleUtterances.filter((utterance) => utterance.type === "hype").length,
    trap: visibleUtterances.filter((utterance) => utterance.type === "trap").length,
  };

  return (
    <section className="sg-ui-panel sg-semantic-feed">
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">Semantic Evidence</div>
          <h2>语义证据</h2>
        </div>
        <span className="sg-ui-status is-neutral">
          <i />
          {visibleUtterances.length} 条
        </span>
      </header>

      <div className="sg-semantic-tabs" role="tablist" aria-label="语义证据筛选">
        {TABS.map((tab) => {
          const count = tab.key === "all" ? visibleUtterances.length : counts[tab.key] || 0;
          return (
            <button
              key={tab.key}
              className={filter === tab.key ? "is-active" : ""}
              onClick={() => setFilter(tab.key)}
              style={{ "--semantic-color": tab.color }}
              type="button"
            >
              {tab.label}
              {count > 0 ? <span>{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="sg-semantic-list">
        {filtered.map((item) => {
          const cfg = TYPE_CFG[item.type] || TYPE_CFG.fact;
          const id = item.uid || item.id;
          const isOpen = expandedId === id;
          const src = SOURCE_CFG[item.source] || SOURCE_CFG.default;
          const score = Math.max(0, Math.min(1, Number(item.score) || 0));

          return (
            <article
              key={id}
              data-uid={id}
              className={`sg-semantic-item ${isOpen ? "is-open" : ""} ${highlightedId === id ? "is-highlighted" : ""}`}
              style={{ "--semantic-color": cfg.color, "--semantic-bg": cfg.bg, "--semantic-border": cfg.border }}
            >
              <button
                className="sg-semantic-summary"
                onClick={() => setExpandedId(isOpen ? null : id)}
                type="button"
              >
                <span className="sg-semantic-primary">
                  <span className="sg-semantic-text">{item.display_text || item.text}</span>
                  {Array.isArray(item.keywords) && item.keywords.length > 0 && (
                    <span className="sg-semantic-keywords">
                      {item.keywords.slice(0, 5).map((keyword, keywordIndex) => (
                        <em key={`${keyword}-${keywordIndex}`}>#{keyword}</em>
                      ))}
                    </span>
                  )}
                </span>

                <span className="sg-semantic-meta">
                  <strong>{cfg.label}</strong>
                  <small
                    title={src.label}
                    style={{
                      "--source-border": src.border,
                      "--source-bg": src.bg,
                      "--source-color": src.color,
                    }}
                  >
                    {src.tag}
                  </small>
                  {item.rag_level && <span>{item.rag_level}</span>}
                  <span>{item.timestamp || "--:--:--"}</span>
                  <span className="sg-semantic-score" aria-hidden="true">
                    <i style={{ width: `${Math.max(12, Math.round(score * 100))}%` }} />
                  </span>
                  {["trap", "hype"].includes(item.type) && (
                    <span className="sg-semantic-chevron" aria-hidden="true">
                      {isOpen ? "收起" : "展开"}
                    </span>
                  )}
                </span>
              </button>

              {["trap", "hype"].includes(item.type) && !isOpen && !!item.violations?.length && (
                <div className="sg-semantic-inline-alert">
                  <span className="sg-semantic-inline-alert-label">命中风险:</span>
                  {item.violations[0]}
                  {item.violations.length > 1 && `（另有 ${item.violations.length - 1} 条）`}
                </div>
              )}

              {isOpen && (
                <div className="sg-semantic-detail">
                  {!!item.violations?.length && (
                    <div>
                      <h3 className="is-danger">命中风险</h3>
                      {item.violations.slice(0, 5).map((violation, violationIndex) => (
                        <p key={violationIndex}>- {violation}</p>
                      ))}
                    </div>
                  )}

                  {!!item.suggestion && (
                    <aside>
                      <h3>处置建议</h3>
                      <p>{item.suggestion}</p>
                    </aside>
                  )}

                  {!!item.rag_claims?.length && (
                    <aside>
                      <h3>RAG 结论</h3>
                      <p>风险等级: {item.rag_level || "P3"}</p>
                      <p>声明类型: {item.rag_claim_types?.join("、") || "未标注"}</p>
                      {item.rag_verification?.reason && <p>核验说明: {item.rag_verification.reason}</p>}
                    </aside>
                  )}

                  {!!item.rag_evidence?.length && (
                    <aside>
                      <h3>RAG 证据</h3>
                      {item.rag_evidence.slice(0, 3).map((evidence) => (
                        <p key={evidence.evidence_id || evidence.title}>
                          [{evidence.source}] {evidence.title || evidence.evidence_id}
                        </p>
                      ))}
                    </aside>
                  )}

                  {item.display_text && item.display_text !== item.text && (
                    <aside className="is-muted">
                      <h3>原始转写</h3>
                      <p>{item.text}</p>
                    </aside>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!filtered.length && (
          <div className="sg-semantic-empty">
            <strong>当前没有语义证据</strong>
            <span>直播接入后，这里会持续沉淀话术识别、风险命中与 RAG 证据。</span>
          </div>
        )}
      </div>
    </section>
  );
});

export default SemanticFeed;
