import { useRef, useMemo } from "react";

// 精简版本向：意图映射只关注风控告警项
const INTENT_COLOR = {
  complaint: { bg: "var(--trap-bg)", text: "var(--trap)", border: "var(--trap-border)" },
  doubt:     { bg: "var(--hype-bg)", text: "var(--hype)", border: "var(--hype-border)" },
  ad_spam:   { bg: "var(--trap-bg)", text: "var(--trap)", border: "var(--trap-border)" },
  other:     { bg: "transparent",    text: "var(--text-muted)", border: "transparent" },
};

function IntentBadge({ intent, label }) {
  // 非风险意图不显示 Badge，剔除视觉噪音
  if (!["complaint", "doubt", "ad_spam"].includes(intent)) return null;
  const c = INTENT_COLOR[intent] || INTENT_COLOR.other;
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 4, flexShrink: 0,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function FlagBadge({ flag }) {
  return (
    <span style={{
      fontSize: 9, padding: "1px 4px", borderRadius: 4,
      background: "rgba(255,165,0,0.12)", color: "#FFA500",
      border: "1px solid rgba(255,165,0,0.25)", fontWeight: 500,
    }}>
      {flag}
    </span>
  );
}

export default function LiveStreamPanel({ chatMessages = [], isLive = true }) {
  const chatRef = useRef(null);

  // 实时情感统计（最近50条）
  const sentimentStats = useMemo(() => {
    const recent = chatMessages.slice(0, 50);
    const pos     = recent.filter(m => m.sentiment === "pos").length;
    const neg     = recent.filter(m => m.sentiment === "neg").length;
    const neutral = recent.length - pos - neg;
    const total   = recent.length || 1;
    // 意图分布 Top3
    const intentCount = {};
    recent.forEach(m => {
      if (m.intent && m.intent !== "other") {
        intentCount[m.intent] = (intentCount[m.intent] || 0) + 1;
      }
    });
    const topIntents = Object.entries(intentCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    // 风险弹幕（complaint/doubt/ad_spam）
    const riskCount = recent.filter(m => ["complaint","doubt","ad_spam"].includes(m.intent)).length;
    return { pos, neg, neutral, total: recent.length, topIntents, riskCount,
      posP: Math.round(pos/total*100), negP: Math.round(neg/total*100),
      neutralP: Math.round(neutral/total*100) };
  }, [chatMessages]);

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>弹幕实时流</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {sentimentStats.riskCount > 0 && (
            <span style={{
              fontSize: 10, padding: "1px 7px", borderRadius: 4,
              background: "rgba(255,51,102,0.15)", color: "#FF3366",
              border: "1px solid rgba(255,51,102,0.3)", fontWeight: 600,
            }}>
              风险弹幕 {sentimentStats.riskCount}
            </span>
          )}
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {chatMessages.length} msgs
          </span>
          {isLive && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4,
              background: "var(--trap-bg)", fontSize: 10, fontWeight: 600, color: "var(--trap)",
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%",
                background: "var(--trap)", animation: "blink 1.2s infinite" }} />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* 意图 Top3 (仅展示核心风险项) */}
      {chatMessages.length > 0 && sentimentStats.topIntents.filter(([i]) => ["complaint", "doubt", "ad_spam"].includes(i)).length > 0 && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>违规与预警弹幕拦截统计：</span>
              {sentimentStats.topIntents.filter(([i]) => ["complaint", "doubt", "ad_spam"].includes(i)).map(([intent, cnt]) => {
                const c = INTENT_COLOR[intent] || INTENT_COLOR.other;
                const labels = { complaint:"客诉", doubt:"质疑", ad_spam:"广告" };
                return (
                  <span key={intent} style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 4,
                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                  }}>
                    {labels[intent] || intent} ×{cnt}
                  </span>
                );
              })}
            </div>
        </div>
      )}

      {/* 弹幕列表 */}
      <div ref={chatRef} style={{ flex: 1, minHeight: 200, overflowY: "auto", padding: "6px 14px" }}>
        {chatMessages.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", paddingTop: 36 }}>
            等待弹幕数据…
          </div>
        )}
        {chatMessages.slice(0, 60).map((msg, index) => {
          const risk = msg.risk_score || 0;
          const isRisky = risk >= 0.5;
          return (
            <div key={`${msg.id || "chat"}-${index}`} style={{
              padding: "4px 6px", marginBottom: 3, borderRadius: 5, fontSize: 12,
              background: isRisky ? "rgba(255,51,102,0.06)" : "transparent",
              borderLeft: isRisky ? "2px solid rgba(255,51,102,0.5)" : "2px solid transparent",
              transition: "background 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
                <span style={{ color: "var(--text-secondary)", fontWeight: 500, fontSize: 11, flexShrink: 0 }}>
                  {msg.user}
                </span>
                {/* 意图标签 */}
                {msg.intent && <IntentBadge intent={msg.intent} label={msg.label || msg.intent} />}
                {/* 风险标签 */}
                {(msg.flags || []).map((f, i) => <FlagBadge key={i} flag={f} />)}
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: 11, lineHeight: 1.4 }}>
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
