import { useState, useRef, forwardRef, useImperativeHandle } from "react";

const TYPE_CFG = {
  fact: { label: "事实", color: "var(--fact)", bg: "var(--fact-bg)", border: "var(--fact-border)" },
  hype: { label: "炒作", color: "var(--hype)", bg: "var(--hype-bg)", border: "var(--hype-border)" },
  trap: { label: "陷阱", color: "var(--trap)", bg: "var(--trap-bg)", border: "var(--trap-border)" },
};

const SOURCE_CFG = {
  audio: { tag: "MIC", label: "音频转写", color: "var(--accent)", bg: "var(--accent-soft)", border: "var(--sg-border-accent)" },
  default: { tag: "AI", label: "语义分析", color: "var(--text-muted)", bg: "rgba(255,255,255,0.03)", border: "var(--sg-border-muted)" },
};

const TABS = [
  { key: "all", label: "全部", color: "var(--accent)" },
  { key: "fact", label: "事实", color: "var(--fact)" },
  { key: "hype", label: "炒作", color: "var(--hype)" },
  { key: "trap", label: "陷阱", color: "var(--trap)" },
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
        const el = scrollRef.current?.querySelector(`[data-uid="${uid}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedId(null), 2500);
      }, 80);
    },
  }));

  const visibleUtterances = utterances.filter((u) => u?.source !== "chat");
  const filtered = filter === "all" ? visibleUtterances : visibleUtterances.filter((u) => u.type === filter);
  const counts = {
    fact: visibleUtterances.filter((u) => u.type === "fact").length,
    hype: visibleUtterances.filter((u) => u.type === "hype").length,
    trap: visibleUtterances.filter((u) => u.type === "trap").length,
  };

  return (
    <section className="sg-ui-panel sg-semantic-feed">
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">语义证据</div>
          <h2>审查队列</h2>
        </div>
        <span className="sg-ui-status is-neutral">
          <i />
          {visibleUtterances.length} 条
        </span>
      </header>

      <div className="sg-semantic-tabs" role="tablist" aria-label="话术风险筛选">
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
                      {item.keywords.slice(0, 5).map((kw, i) => (
                        <em key={`${kw}-${i}`}>#{kw}</em>
                      ))}
                    </span>
                  )}
                </span>

                <span className="sg-semantic-meta">
                  <strong>{cfg.label}</strong>
                  {item.rag_level && <span>{item.rag_level}</span>}
                  <span>{item.timestamp || "--:--:--"}</span>
                  {["trap", "hype"].includes(item.type) && <span className="sg-semantic-chevron" aria-hidden="true">{isOpen ? "收起" : "详情"}</span>}
                </span>
              </button>

              {/* 【极简策略】将重要违规点进行平铺展示，减少无效的展开点击 */}
              {["trap", "hype"].includes(item.type) && !isOpen && !!item.violations?.length && (
                <div style={{ padding: "8px 16px", marginTop: "4px", fontSize: "12px", background: "var(--trap-bg)", borderLeft: "2px solid var(--trap)", borderRadius: "4px", color: "var(--text-primary)" }}>
                  <span style={{ fontWeight: "700", color: "var(--trap)" }}>风险：</span>
                  {item.violations[0]}
                  {item.violations.length > 1 && ` (及其他 ${item.violations.length - 1} 项)`}
                </div>
              )}

              {isOpen && (
                <div className="sg-semantic-detail">
                  {!!item.violations?.length && (
                    <div>
                      <h3 style={{ color: "var(--trap)" }}>命中风险</h3>
                      {item.violations.slice(0, 5).map((v, i) => (
                        <p key={i}>• {v}</p>
                      ))}
                    </div>
                  )}

                  {!!item.suggestion && (
                    <aside>
                      <h3>优化建议</h3>
                      <p>{item.suggestion}</p>
                    </aside>
                  )}

                  {!!item.rag_claims?.length && (
                    <aside>
                      <h3>RAG 判定</h3>
                      <p>风险等级：{item.rag_level || "P3"}</p>
                      <p>主张类型：{item.rag_claim_types?.join("、") || "未识别"}</p>
                      {item.rag_verification?.reason && <p>核验说明：{item.rag_verification.reason}</p>}
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
            <strong>暂无话术证据</strong>
            <span>连接直播间后，系统会持续沉淀可审查的语义证据。</span>
          </div>
        )}
      </div>
    </section>
  );
});

export default SemanticFeed;
