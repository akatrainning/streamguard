import { useRef } from "react";

export default function LiveStreamPanel({ chatMessages = [], isLive = true }) {
  const chatRef = useRef(null);

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {"\u5f39\u5e55\u5b9e\u65f6\u6d41"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {chatMessages.length} msgs
          </span>
          {isLive && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4,
              background: "var(--trap-bg)", fontSize: 10, fontWeight: 600, color: "var(--trap)",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "var(--trap)", animation: "blink 1.2s infinite",
              }} />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Chat list */}
      <div ref={chatRef} style={{ height: 300, overflowY: "auto", padding: "8px 16px" }}>
        {chatMessages.length === 0 && (
          <div style={{
            color: "var(--text-muted)", fontSize: 12,
            textAlign: "center", paddingTop: 40,
          }}>
            {"\u7b49\u5f85\u5f39\u5e55\u6570\u636e\u2026"}
          </div>
        )}
        {chatMessages.slice(0, 30).map(msg => (
          <div key={msg.id} style={{
            display: "flex", gap: 8, padding: "4px 0", fontSize: 12,
          }}>
            <span style={{ color: "var(--accent)", fontWeight: 500, flexShrink: 0 }}>
              {msg.user}
            </span>
            <span style={{ color: "var(--text-secondary)" }}>
              {msg.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
