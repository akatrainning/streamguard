import { useState, useEffect } from "react";

export default function RationalityGate({ onConfirm = () => {}, onCancel = () => {}, utterances = [] }) {
  const [countdown, setCountdown] = useState(10);
  const [confirmed, setConfirmed] = useState(false);

  const trapItems = utterances.filter(u => u.type === "trap").slice(0, 3);
  const risks = trapItems.length > 0
    ? trapItems.map(u => ({ text: u.text.slice(0, 80) + (u.text.length > 80 ? "\u2026" : "") }))
    : [
        { text: "\u68c0\u6d4b\u5230\u9650\u65f6\u50ac\u8d2d\u8bdd\u672f\uff0c\u53ef\u80fd\u4ea7\u751f\u51b2\u52a8\u6d88\u8d39" },
        { text: "\u90e8\u5206\u5546\u54c1\u529f\u6548\u63cf\u8ff0\u4e0e\u7b2c\u4e09\u65b9\u68c0\u6d4b\u6570\u636e\u4e0d\u7b26" },
      ];

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        width: 380, background: "var(--bg-secondary)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 24,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--trap)", marginBottom: 4 }}>
          {"\ud83e\udde0 \u7406\u6027\u6d88\u8d39\u5b88\u62a4"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          {"\u68c0\u6d4b\u5230\u4ee5\u4e0b\u6f5c\u5728\u98ce\u9669\uff0c\u8bf7\u7406\u6027\u51b3\u7b56"}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {risks.map((r, i) => (
            <div key={i} style={{
              padding: "8px 10px", background: "var(--trap-bg)",
              border: "1px solid var(--trap-border)", borderRadius: 6,
              fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5,
            }}>
              {"\u26a0"} {r.text}
            </div>
          ))}
        </div>

        {/* Cooldown bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 11, color: "var(--text-muted)", marginBottom: 4,
          }}>
            <span>{"\u51b7\u9759\u671f"}</span>
            <span className="mono" style={{
              color: countdown > 0 ? "var(--hype)" : "var(--fact)",
            }}>
              {countdown > 0 ? `${countdown}s` : "\u53ef\u7ee7\u7eed"}
            </span>
          </div>
          <div style={{
            height: 3, background: "var(--bg-tertiary)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${(countdown / 10) * 100}%`,
              background: countdown > 3 ? "var(--hype)" : "var(--fact)",
              transition: "width 0.9s linear",
              borderRadius: 2,
            }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: 10, borderRadius: 8, cursor: "pointer",
            background: "var(--bg-tertiary)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: 12, fontWeight: 600,
          }}>
            {"\u518d\u60f3\u60f3"}
          </button>
          <button
            disabled={countdown > 0}
            onClick={() => { setConfirmed(true); setTimeout(onConfirm, 400); }}
            style={{
              flex: 1, padding: 10, borderRadius: 8,
              cursor: countdown > 0 ? "not-allowed" : "pointer",
              background: countdown > 0 ? "var(--bg-tertiary)" : confirmed ? "var(--fact-bg)" : "var(--trap-bg)",
              border: `1px solid ${countdown > 0 ? "var(--border)" : confirmed ? "var(--fact-border)" : "var(--trap-border)"}`,
              color: countdown > 0 ? "var(--text-muted)" : confirmed ? "var(--fact)" : "var(--trap)",
              fontSize: 12, fontWeight: 600,
            }}
          >
            {confirmed ? "\u2713 \u5df2\u786e\u8ba4" : countdown > 0 ? `\u7b49\u5f85 ${countdown}s` : "\u786e\u8ba4\u4e0b\u5355"}
          </button>
        </div>
      </div>
    </div>
  );
}
