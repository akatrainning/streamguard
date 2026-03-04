/**
 * SwitchRoomModal — 切换直播间时的保存确认弹窗
 * 当用户在"发现直播间"点击"进入直播间"，且当前已有监控数据时弹出
 */
export default function SwitchRoomModal({
  fromRoomId,   // 当前正在监控的直播间 ID
  toRoomId,     // 即将切换到的直播间 ID
  stats = {},   // { total, trap, hype, fact }
  startTime,    // 会话开始时间戳
  onSaveAndSwitch,   // () => void  保存报告后切换
  onDirectSwitch,    // () => void  直接切换不保存
  onCancel,          // () => void  取消
}) {
  const total    = stats.total || 0;
  const trap     = stats.trap  || 0;
  const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const mins     = Math.floor(duration / 60);
  const secs     = duration % 60;
  const durStr   = mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;
  const trapRate = total > 0 ? Math.round((trap / total) * 100) : 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel?.()}
    >
      <div style={{
        width: 420,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 24,
        display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔄</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              切换直播间
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              检测到当前已有监控数据
            </div>
          </div>
        </div>

        {/* Room info */}
        <div style={{
          background: "var(--bg-tertiary)", borderRadius: 10, padding: 12,
          display: "flex", flexDirection: "column", gap: 8,
          border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)" }}>当前直播间</span>
            <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
              {fromRoomId || "—"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)" }}>目标直播间</span>
            <span style={{ fontFamily: "monospace", color: "var(--fact)" }}>
              {toRoomId}
            </span>
          </div>
          <div style={{
            height: 1, background: "var(--border)", margin: "2px 0",
          }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            <StatBox label="话术条数" value={total} />
            <StatBox label="陷阱占比" value={`${trapRate}%`} warn={trapRate >= 20} />
            <StatBox label="监控时长" value={durStr} />
          </div>
        </div>

        {/* Warning */}
        {total > 0 && (
          <div style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(255,165,0,0.08)",
            border: "1px solid rgba(255,165,0,0.25)",
            fontSize: 12, color: "var(--hype)", lineHeight: 1.6,
          }}>
            ⚠ 直接切换将丢失当前 {total} 条监控记录，建议先保存报告。
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {total > 0 && (
            <button
              onClick={onSaveAndSwitch}
              style={{
                padding: "10px 0", borderRadius: 8, border: "none",
                background: "var(--accent)", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              💾 保存报告后切换
            </button>
          )}
          <button
            onClick={onDirectSwitch}
            style={{
              padding: "10px 0", borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-tertiary)", color: "var(--text-primary)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            🚀 {total > 0 ? "直接切换（不保存）" : "立即切换"}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 0", borderRadius: 8, border: "none",
              background: "transparent", color: "var(--text-muted)",
              fontSize: 12, cursor: "pointer",
            }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, warn = false }) {
  return (
    <div style={{
      background: "var(--bg-secondary)", borderRadius: 6, padding: "6px 8px",
      textAlign: "center", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: warn ? "var(--hype)" : "var(--text-primary)" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
