import { useState, useRef, forwardRef, useImperativeHandle } from "react";

const TYPE_CFG = {
  fact: { label: "FACT", color: "var(--fact)", bg: "var(--fact-bg)", border: "var(--fact-border)" },
  hype: { label: "HYPE", color: "var(--hype)", bg: "var(--hype-bg)", border: "var(--hype-border)" },
  trap: { label: "TRAP", color: "var(--trap)", bg: "var(--trap-bg)", border: "var(--trap-border)" },
};

// 来源标签配置：告诉消费者"这条分析从哪来"
const SOURCE_CFG = {
  audio:   { icon: "🎤", label: "主播话术", color: "#0096FF", bg: "rgba(0,150,255,0.12)", border: "rgba(0,150,255,0.3)" },
  default: { icon: "📋", label: "分析",     color: "var(--text-muted)", bg: "transparent", border: "transparent" },
};

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

  // 删除“观众质疑”来源：仅展示主播话术（音频转写）相关分析
  const baseUtterances = utterances.filter(u => u.source !== "chat");
  const filtered = filter === "all" ? baseUtterances : baseUtterances.filter(u => u.type === filter);

  // 统计类型数量
  const counts = {
    fact: baseUtterances.filter(u => u.type === "fact").length,
    hype: baseUtterances.filter(u => u.type === "hype").length,
    trap: baseUtterances.filter(u => u.type === "trap").length,
  };

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden", flex: 1,
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>话术风险分析</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {baseUtterances.length} 条
          </span>
        </div>

        {/* 风险类型过滤行 */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "all",  label: "全部", count: baseUtterances.length, color: "var(--accent)" },
            { key: "fact", label: "FACT", count: counts.fact, color: "var(--fact)" },
            { key: "hype", label: "HYPE", count: counts.hype, color: "var(--hype)" },
            { key: "trap", label: "TRAP", count: counts.trap, color: "var(--trap)" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
              padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 500,
              background: filter === tab.key ? "var(--bg-tertiary)" : "transparent",
              border: filter === tab.key ? "1px solid var(--border)" : "1px solid transparent",
              color: filter === tab.key ? tab.color : "var(--text-muted)",
            }}>
              {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Utterance list */}
      <div ref={scrollRef} style={{ height: 340, overflowY: "auto", padding: "6px 12px" }}>
        {filtered.map(item => {
          const cfg = TYPE_CFG[item.type];
          const isOpen = expandedId === (item.uid || item.id);
          return (
            <div key={item.uid || item.id} data-uid={item.uid || item.id}
              style={{
                marginBottom: 6, borderRadius: 6,
                outline: highlightedId === (item.uid || item.id) ? "2px solid var(--accent)" : "none",
              }}>
              {/* Main row */}
              <div
                onClick={() => setExpandedId(isOpen ? null : (item.uid || item.id))}
                style={{
                  padding: "8px 10px", borderRadius: isOpen ? "6px 6px 0 0" : 6,
                  cursor: "pointer", background: cfg.bg,
                  borderLeft: `3px solid ${cfg.color}`,
                  border: `1px solid ${cfg.border}`,
                }}>
                <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: 4 }}>
                  {item.display_text}
                </div>
                {Array.isArray(item.keywords) && item.keywords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    {item.keywords.slice(0, 5).map((kw, i) => (
                      <span key={`${kw}-${i}`} style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        background: "var(--bg-tertiary)",
                      }}>
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
                  <span style={{ fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  {/* 来源徽章：消费者能清楚知道分析来自主播话术还是观众质疑 */}
                  {(() => {
                    const src = SOURCE_CFG[item.source] || SOURCE_CFG.default;
                    if (!item.source) return null;
                    return (
                      <span style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 4,
                        background: src.bg, color: src.color, border: `1px solid ${src.border}`,
                        fontWeight: 500,
                      }}>
                        {src.icon} {src.label}
                      </span>
                    );
                  })()}
                  {/* Score bar */}
                  <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(item.score || 0) * 100}%`, background: cfg.color, borderRadius: 2 }} />
                  </div>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>{item.score?.toFixed(2)}</span>
                  <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>{item.timestamp}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{
                  margin: 0, padding: "10px 12px",
                  background: "var(--bg-tertiary)",
                  border: `1px solid ${cfg.border}`, borderTop: "none",
                  borderRadius: "0 0 6px 6px",
                }}>
                  {!!(item.violations && item.violations.length) && (
                    <>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                        模型识别风险点
                      </div>
                      {item.violations.slice(0, 5).map((v, i) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3, paddingLeft: 10, position: "relative" }}>
                          <span style={{ position: "absolute", left: 0, color: cfg.color }}>{"\u2022"}</span>{v}
                        </div>
                      ))}
                    </>
                  )}

                  {!!item.suggestion && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600, marginBottom: 4 }}>
                        优化建议
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {item.suggestion}
                      </div>
                    </div>
                  )}

                  {/* 原始语音转写（仅 display_text 与原文不同时展示） */}
                  {item.display_text && item.display_text !== item.text && (
                    <div style={{ marginTop: 8, padding: "7px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginBottom: 3 }}>
                        🎙 原始转写
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, fontStyle: "italic" }}>
                        {item.text}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!filtered.length && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>
              {"🎤"}
            </div>
            <div>
              {"暂无主播话术转写…"}
            </div>
            <div style={{ fontSize: 10, marginTop: 6, color: "var(--text-muted)", opacity: 0.7 }}>
              {"连接直播间后，音频将每15秒自动转写分析"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default SemanticFeed;
