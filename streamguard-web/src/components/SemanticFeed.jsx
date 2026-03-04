import { useState, useRef, forwardRef, useImperativeHandle } from "react";

const TYPE_CFG = {
  fact: { label: "FACT", color: "var(--fact)", bg: "var(--fact-bg)", border: "var(--fact-border)" },
  hype: { label: "HYPE", color: "var(--hype)", bg: "var(--hype-bg)", border: "var(--hype-border)" },
  trap: { label: "TRAP", color: "var(--trap)", bg: "var(--trap-bg)", border: "var(--trap-border)" },
};

const SOURCE_CFG = {
  audio: { icon: "🎤", label: "主播话术", color: "#3f8cff", bg: "rgba(63,140,255,0.14)", border: "rgba(63,140,255,0.35)" },
  chat: { icon: "💬", label: "观众质疑", color: "#d79b30", bg: "rgba(215,155,48,0.14)", border: "rgba(215,155,48,0.35)" },
  default: { icon: "📋", label: "分析", color: "var(--text-muted)", bg: "transparent", border: "transparent" },
};

const SemanticFeed = forwardRef(function SemanticFeed({ utterances = [] }, ref) {
  const [expandedId, setExpandedId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [srcFilter, setSrcFilter] = useState("audio");
  const scrollRef = useRef(null);

  useImperativeHandle(ref, () => ({
    highlightItem(uid) {
      setFilter("all");
      setSrcFilter("all");
      setExpandedId(uid);
      setHighlightedId(uid);
      setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-uid="${uid}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => setHighlightedId(null), 2500);
      }, 80);
    },
  }));

  const srcFiltered = srcFilter === "all" ? utterances : utterances.filter((u) => u.source === srcFilter);
  const filtered = filter === "all" ? srcFiltered : srcFiltered.filter((u) => u.type === filter);

  const counts = {
    fact: srcFiltered.filter((u) => u.type === "fact").length,
    hype: srcFiltered.filter((u) => u.type === "hype").length,
    trap: srcFiltered.filter((u) => u.type === "trap").length,
  };
  const srcCounts = {
    audio: utterances.filter((u) => u.source === "audio").length,
    chat: utterances.filter((u) => u.source === "chat").length,
  };

  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(18,29,45,0.94), rgba(15,24,37,0.95))",
      border: "1px solid #2b3f5c",
      borderRadius: 12,
      overflow: "hidden",
      flex: 1,
      boxShadow: "0 12px 28px rgba(4,9,16,0.24)",
    }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #2b3f5c" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.2 }}>话术风险分析</span>
          <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {utterances.length} 条
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "🔍 全部", count: utterances.length, color: "var(--accent)" },
            { key: "audio", label: "🎤 主播话术", count: srcCounts.audio, color: "#3f8cff" },
            { key: "chat", label: "💬 观众质疑", count: srcCounts.chat, color: "#d79b30" },
          ].map((tab) => (
            <button key={tab.key} onClick={() => { setSrcFilter(tab.key); setFilter("all"); }} style={tabBtnStyle(srcFilter === tab.key, tab.color)}>
              {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "全部", count: srcFiltered.length, color: "var(--accent)" },
            { key: "fact", label: "FACT", count: counts.fact, color: "var(--fact)" },
            { key: "hype", label: "HYPE", count: counts.hype, color: "var(--hype)" },
            { key: "trap", label: "TRAP", count: counts.trap, color: "var(--trap)" },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setFilter(tab.key)} style={tabBtnStyle(filter === tab.key, tab.color)}>
              {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} style={{ height: 380, overflowY: "auto", padding: "10px 14px" }}>
        {filtered.map((item) => {
          const cfg = TYPE_CFG[item.type];
          const id = item.uid || item.id;
          const isOpen = expandedId === id;
          return (
            <div key={id} data-uid={id} style={{
              marginBottom: 8,
              borderRadius: 8,
              outline: highlightedId === id ? "2px solid var(--accent)" : "none",
              outlineOffset: 1,
            }}>
              <div onClick={() => setExpandedId(isOpen ? null : id)} style={{
                padding: "12px 14px",
                borderRadius: isOpen ? "8px 8px 0 0" : 8,
                cursor: "pointer",
                background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
                borderLeft: `3px solid ${cfg.color}`,
                border: `1px solid ${cfg.border}`,
              }}>
                <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, marginBottom: 7 }}>
                  {item.display_text}
                </div>
                {Array.isArray(item.keywords) && item.keywords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
                    {item.keywords.slice(0, 5).map((kw, i) => (
                      <span key={`${kw}-${i}`} style={{
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: "1px solid #304865",
                        color: "var(--text-secondary)",
                        background: "rgba(29,45,66,0.8)",
                      }}>
                        #{kw}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                  {(() => {
                    const src = SOURCE_CFG[item.source] || SOURCE_CFG.default;
                    if (!item.source) return null;
                    return (
                      <span style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: src.bg,
                        color: src.color,
                        border: `1px solid ${src.border}`,
                        fontWeight: 600,
                      }}>
                        {src.icon} {src.label}
                      </span>
                    );
                  })()}
                  <div style={{ width: 76, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(item.score || 0) * 100}%`, background: cfg.color, borderRadius: 4 }} />
                  </div>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>{item.score?.toFixed(2)}</span>
                  <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>{item.timestamp}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {isOpen && (
                <div style={{
                  margin: 0,
                  padding: "12px 14px",
                  background: "linear-gradient(180deg, rgba(24,37,56,0.8), rgba(20,32,48,0.9))",
                  border: `1px solid ${cfg.border}`,
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                }}>
                  {!!(item.violations && item.violations.length) && (
                    <>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                        模型识别风险点
                      </div>
                      {item.violations.slice(0, 5).map((v, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, paddingLeft: 10, position: "relative" }}>
                          <span style={{ position: "absolute", left: 0, color: cfg.color }}>{"\u2022"}</span>{v}
                        </div>
                      ))}
                    </>
                  )}

                  {!!item.suggestion && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700, marginBottom: 4 }}>
                        优化建议
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                        {item.suggestion}
                      </div>
                    </div>
                  )}

                  {item.display_text && item.display_text !== item.text && (
                    <div style={{ marginTop: 8, padding: "7px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginBottom: 3 }}>
                        🎙 原始转写
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, fontStyle: "italic" }}>
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
          <div style={{ textAlign: "center", padding: 44, color: "var(--text-muted)", fontSize: 13 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>
              {srcFilter === "audio" ? "🎤" : srcFilter === "chat" ? "💬" : "🔍"}
            </div>
            <div>
              {srcFilter === "audio"
                ? "暂无主播话术转写…"
                : srcFilter === "chat"
                ? "暂无观众质疑弹幕…"
                : "等待话术分析数据…"}
            </div>
            <div style={{ fontSize: 11, marginTop: 6, color: "var(--text-muted)", opacity: 0.75 }}>
              {srcFilter === "audio"
                ? "连接直播间后，音频将每15秒自动转写分析"
                : srcFilter === "chat"
                ? "包含实质质疑/投诉内容的弹幕将出现于此"
                : "主播话术（音频转写）和观众质疑弹幕将自动出现"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

function tabBtnStyle(active, color) {
  return {
    padding: "5px 11px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    background: active ? `${color}22` : "transparent",
    border: `1px solid ${active ? `${color}66` : "#304865"}`,
    color: active ? color : "var(--text-muted)",
  };
}

export default SemanticFeed;
