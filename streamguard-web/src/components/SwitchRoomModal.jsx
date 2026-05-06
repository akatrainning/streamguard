function formatDuration(startTime) {
  if (!startTime) return "--";
  const seconds = Math.max(0, Math.round((Date.now() - startTime) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return minutes > 0 ? `${minutes} 分 ${remain} 秒` : `${remain} 秒`;
}

const primaryButtonStyle = {
  minHeight: 42,
  borderRadius: 8,
  border: "1px solid color-mix(in oklab, var(--accent) 54%, black 46%)",
  background: "linear-gradient(180deg, color-mix(in oklab, var(--accent) 92%, white 8%), var(--accent-hover))",
  color: "var(--accent-contrast)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "var(--accent-shadow-sm)",
};

const secondaryButtonStyle = {
  minHeight: 42,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostButtonStyle = {
  minHeight: 36,
  border: "none",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
  cursor: "pointer",
};

function Row({ label, value, tone = "default" }) {
  const color = tone === "accent" ? "var(--accent)" : tone === "fact" ? "var(--fact)" : "var(--text-primary)";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color, fontFamily: "JetBrains Mono, Consolas, monospace" }}>{value}</span>
    </div>
  );
}

function StatBox({ label, value, tone = "default" }) {
  const color = tone === "hype" ? "var(--hype)" : "var(--text-primary)";
  return (
    <div
      style={{
        padding: "6px 8px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        textAlign: "center",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ color, fontSize: 14, fontWeight: 700 }}>{value}</div>
      <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 10 }}>{label}</div>
    </div>
  );
}

export default function SwitchRoomModal({
  fromRoomId,
  toRoomId,
  stats = {},
  startTime,
  onSaveAndSwitch,
  onDirectSwitch,
  onCancel,
}) {
  const total = stats.total || 0;
  const trap = stats.trap || 0;
  const trapRate = total > 0 ? Math.round((trap / total) * 100) : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0, 0, 0, 0.76)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(event) => event.target === event.currentTarget && onCancel?.()}
    >
      <section
        style={{
          width: 420,
          maxWidth: "100%",
          display: "grid",
          gap: 16,
          padding: 24,
          border: "1px solid var(--border)",
          borderRadius: 14,
          background: "var(--bg-secondary)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <header style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: "var(--text-primary)", fontSize: 16 }}>切换直播间</strong>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            检测到当前会话还有监控数据，建议先保存报告。
          </span>
        </header>

        <div
          style={{
            display: "grid",
            gap: 8,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-tertiary)",
          }}
        >
          <Row label="当前直播间" value={fromRoomId || "--"} tone="accent" />
          <Row label="目标直播间" value={toRoomId || "--"} tone="fact" />
          <div style={{ height: 1, background: "var(--border)" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
            <StatBox label="记录数" value={total} />
            <StatBox label="风险占比" value={`${trapRate}%`} tone={trapRate >= 20 ? "hype" : "default"} />
            <StatBox label="监控时长" value={formatDuration(startTime)} />
          </div>
        </div>

        {total > 0 && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--hype-border)",
              background: "var(--hype-bg)",
              color: "var(--hype)",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            直接切换会丢失当前 {total} 条监控记录。
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {total > 0 && (
            <button type="button" onClick={onSaveAndSwitch} style={primaryButtonStyle}>
              保存报告后切换
            </button>
          )}
          <button type="button" onClick={onDirectSwitch} style={secondaryButtonStyle}>
            {total > 0 ? "直接切换，不保存" : "立即切换"}
          </button>
          <button type="button" onClick={onCancel} style={ghostButtonStyle}>
            取消
          </button>
        </div>
      </section>
    </div>
  );
}