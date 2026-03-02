export default function AlertBanner({ alerts = [], onDismiss = () => {}, onJumpTo = () => {} }) {
  return (
    <div style={{
      position: "fixed", top: 70, right: 16, zIndex: 200,
      display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none",
    }}>
      {alerts.map(alert => (
        <div key={alert.id} style={{
          pointerEvents: "auto", width: 280,
          background: "var(--bg-secondary)", border: "1px solid var(--trap-border)",
          borderLeft: "3px solid var(--trap)", borderRadius: 8, padding: "10px 12px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", marginBottom: 4,
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--trap)" }}>
              {"\u26a0 \u68c0\u6d4b\u5230\u6d88\u8d39\u9677\u9631"}
            </span>
            <button onClick={() => onDismiss(alert.id)} style={{
              background: "none", border: "none", color: "var(--text-muted)",
              cursor: "pointer", fontSize: 12, padding: 0,
            }}>{"\u2715"}</button>
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-secondary)",
            lineHeight: 1.5, marginBottom: 6,
          }}>
            {alert.text}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => onJumpTo(alert.utteranceId || alert.id)} style={{
              padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10,
              background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              color: "var(--accent)",
            }}>{"\u5b9a\u4f4d"}</button>
            <span className="mono" style={{
              fontSize: 10, color: "var(--text-muted)", marginLeft: "auto",
            }}>
              {alert.timestamp}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
