import { useState, useRef, forwardRef, useImperativeHandle } from "react";

const TYPE_CFG = {
  fact: { label: "FACT", color: "var(--fact)", bg: "var(--fact-bg)", border: "var(--fact-border)" },
  hype: { label: "HYPE", color: "var(--hype)", bg: "var(--hype-bg)", border: "var(--hype-border)" },
  trap: { label: "TRAP", color: "var(--trap)", bg: "var(--trap-bg)", border: "var(--trap-border)" },
};

// 来源标签配置：告诉消费者"这条分析从哪来"
const SOURCE_CFG = {
  audio:   { icon: "🎤", label: "主播话术", color: "#0096FF", bg: "rgba(0,150,255,0.12)", border: "rgba(0,150,255,0.3)" },
  chat:    { icon: "💬", label: "观众质疑", color: "#FFA500", bg: "rgba(255,165,0,0.12)",  border: "rgba(255,165,0,0.3)"  },
  default: { icon: "📋", label: "分析",     color: "var(--text-muted)", bg: "transparent", border: "transparent" },
};

const LAW_REFS = {
  fact: [
    "\u300a\u5e7f\u544a\u6cd5\u300b\u7b2c4\u6761\uff1a\u5e7f\u544a\u5185\u5bb9\u5e94\u5f53\u771f\u5b9e\u3001\u5408\u6cd5",
  ],
  hype: [
    "\u300a\u5e7f\u544a\u6cd5\u300b\u7b2c28\u6761\uff1a\u5e7f\u544a\u4e0d\u5f97\u4ee5\u865a\u5047\u65b9\u5f0f\u5f15\u5bfc\u6d88\u8d39",
    "\u300a\u53cd\u4e0d\u6b63\u5f53\u7ade\u4e89\u6cd5\u300b\u7b2c8\u6761\uff1a\u4e0d\u5f97\u8fdb\u884c\u5f15\u4eba\u8bef\u89e3\u7684\u5ba3\u4f20",
  ],
  trap: [
    "\u300a\u5e7f\u544a\u6cd5\u300b\u7b2c23\u6761\uff1a\u7981\u6b62\u4f7f\u7528\u2018\u6700\u4f73\u2019\u2018\u6700\u9ad8\u2019\u2018\u7b2c\u4e00\u2019\u7b49\u7528\u8bed",
    "\u300a\u6d88\u8d39\u8005\u6743\u76ca\u4fdd\u62a4\u6cd5\u300b\u7b2c20\u6761\uff1a\u7ecf\u8425\u8005\u5e94\u771f\u5b9e\u5168\u9762\u63d0\u4f9b\u4fe1\u606f",
  ],
};

const SUGGESTIONS = {
  fact: null,
  hype: [
    "\u5efa\u8bae\u5220\u9664\u9650\u65f6\u9650\u91cf\u8868\u8ff0\uff0c\u6539\u4e3a\u51c6\u786e\u5e93\u5b58\u6570\u5b57",
    "\u907f\u514d\u4f7f\u7528\u2018\u6700\u540e\u2019\u7b49\u5938\u5927\u6027\u8bcd\u6c47",
  ],
  trap: [
    "\u5fc5\u987b\u5220\u9664\u65e0\u6cd5\u6838\u5b9e\u7684\u6bd4\u8f83\u6027\u58f0\u660e",
    "\u5efa\u8bae\u63d0\u4f9b\u7b2c\u4e09\u65b9\u68c0\u6d4b\u62a5\u544a\u652f\u6491",
    "\u66ff\u6362\u4e3a\u5177\u4f53\u6570\u636e\u63cf\u8ff0",
  ],
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

  const filtered = filter === "all" ? utterances : utterances.filter(u => u.type === filter);
  const counts = {
    fact: utterances.filter(u => u.type === "fact").length,
    hype: utterances.filter(u => u.type === "hype").length,
    trap: utterances.filter(u => u.type === "trap").length,
  };

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden", flex: 1,
    }}>
      {/* Header with filter tabs */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600 }}>话术风险分析</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>
              🎤 主播话术 + 💬 观众质疑
            </span>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {utterances.length} 条
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { key: "all",  label: "\u5168\u90e8", count: utterances.length, color: "var(--accent)" },
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
                  {item.text}
                </div>
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
                  {/* Law references */}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                    {"\u76f8\u5173\u6cd5\u89c4"}
                  </div>
                  {(LAW_REFS[item.type] || []).map((l, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3, paddingLeft: 10, position: "relative" }}>
                      <span style={{ position: "absolute", left: 0, color: cfg.color }}>{"\u203a"}</span>{l}
                    </div>
                  ))}

                  {/* Suggestions */}
                  {SUGGESTIONS[item.type] && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600, marginBottom: 4 }}>
                        {"\u4fee\u6539\u5efa\u8bae"}
                      </div>
                      {SUGGESTIONS[item.type].map((s, i) => (
                        <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2, paddingLeft: 10, position: "relative" }}>
                          <span style={{ position: "absolute", left: 0, color: cfg.color }}>{"\u2022"}</span>{s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!filtered.length && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            <div>等待话术分析数据…</div>
            <div style={{ fontSize: 10, marginTop: 6, color: "var(--text-muted)", opacity: 0.7 }}>
              主播话术（音频转写）和高风险弹幕<br/>将自动出现在此处
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default SemanticFeed;
