import { useState, useEffect } from "react";

const SOURCES = [
  { id: "mock",   icon: "\ud83c\udfac", label: "\u6a21\u62df\u6570\u636e", desc: "\u6f14\u793a\u6570\u636e\u6d41\uff0c\u65e0\u9700\u540e\u7aef" },
  { id: "douyin", icon: "\ud83c\udfb5", label: "\u6296\u97f3\u76f4\u64ad", desc: "\u5b9e\u65f6\u5f39\u5e55\u5206\u6790\uff08\u9700\u540e\u7aef + room_id\uff09" },
];

export default function DataSourceSelector({ onSelect, onConnect }) {
  const [selected, setSelected] = useState(null);
  const [roomInput, setRoomInput] = useState("");
  const [wsBase, setWsBase] = useState("ws://localhost:8011");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeData, setProbeData]   = useState(null);   // null | { reachable, url, live_hint, error? }

  const roomId = extractRoomId(roomInput);
  const canConnect = selected === "mock" || (selected === "douyin" && roomId.trim());

  // 防抖自动探测：输入稳定 700ms 后调用后端 room-info
  useEffect(() => {
    if (!roomId || selected !== "douyin") { setProbeData(null); return; }
    setProbeData(null);
    setProbeLoading(true);
    const timer = setTimeout(async () => {
      try {
        const httpBase = (wsBase || "ws://localhost:8011").replace(/^ws/i, "http");
        const res = await fetch(`${httpBase}/douyin/room-info/${roomId}`);
        const data = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
        setProbeData(data);
      } catch {
        setProbeData({ error: "后端不可达，请确认后端已启动" });
      } finally {
        setProbeLoading(false);
      }
    }, 700);
    return () => { clearTimeout(timer); setProbeLoading(false); };
  }, [roomId, selected, wsBase]);

  const handleConnect = () => {
    if (!canConnect) return;
    const config = selected === "douyin"
      ? { roomId: roomId.trim(), wsBase: wsBase.trim() || "ws://localhost:8011" }
      : { wsBase: wsBase.trim() || "ws://localhost:8011" };
    onSelect(selected, config);
    onConnect?.(selected, config);
  };

  return (
    <div style={{
      width: 400, background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 12, padding: 24,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 22 }}>{"\u{1f6e1}\ufe0f"}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>StreamGuard</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {"\u9009\u62e9\u6570\u636e\u6e90\u5f00\u59cb\u76d1\u63a7"}
          </div>
        </div>
      </div>

      {/* Source buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {SOURCES.map(s => (
          <button key={s.id} onClick={() => setSelected(s.id)} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            borderRadius: 8, cursor: "pointer", textAlign: "left",
            background: selected === s.id ? "var(--bg-tertiary)" : "transparent",
            border: selected === s.id ? "1px solid var(--accent)" : "1px solid var(--border)",
            color: "var(--text-primary)",
          }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Room ID input for Douyin */}
      {selected === "douyin" && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            直播间 ID 或完整 URL
          </label>
          <input
            type="text" placeholder="646454278948 或 https://live.douyin.com/646454278948"
            value={roomInput} onChange={e => setRoomInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              color: "var(--text-primary)", fontSize: 13, outline: "none",
              fontFamily: "Consolas, monospace",
            }}
          />
          <div style={{ marginTop: 4, fontSize: 10, color: roomId ? "var(--fact)" : "var(--text-muted)" }}>
            识别结果：{roomId || "未识别到房间 ID"}
          </div>

          {/* 房间探测结果卡片 */}
          {roomId && (
            <div style={{
              marginTop: 8, padding: "9px 12px", borderRadius: 8,
              background: "var(--bg-tertiary)", border: "1px solid var(--border)",
              fontSize: 11,
            }}>
              {probeLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-muted)" }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  正在探测直播间状态…
                </div>
              ) : probeData?.error ? (
                <div style={{ color: "var(--hype)" }}>⚠ {probeData.error}</div>
              ) : probeData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "2px 7px", borderRadius: 4, fontWeight: 600, fontSize: 10,
                      background: probeData.reachable ? "rgba(0,255,136,0.12)" : "rgba(255,165,0,0.12)",
                      color: probeData.reachable ? "#00FF88" : "#FFA500",
                      border: `1px solid ${probeData.reachable ? "rgba(0,255,136,0.3)" : "rgba(255,165,0,0.3)"}`,
                    }}>
                      {probeData.reachable ? "✓ 页面可访问" : "⚠ 访问受限"}
                    </span>
                    {probeData.live_hint && (
                      <span style={{
                        padding: "2px 7px", borderRadius: 4, fontWeight: 600, fontSize: 10,
                        background: "rgba(255,51,102,0.12)", color: "#FF3366",
                        border: "1px solid rgba(255,51,102,0.3)",
                      }}>
                        🔴 直播中
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-muted)" }}>房间 ID：</span>
                    <span className="mono" style={{ color: "var(--accent)" }}>{probeData.room_id}</span>
                  </div>
                  <a
                    href={probeData.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: 10, color: "#0096FF", textDecoration: "none",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    🔗 在浏览器中打开直播间 →
                  </a>
                  {!probeData.reachable && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                      受限不影响连接——后端 Selenium 可绕过访问限制
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { label: "与辉同行", id: "646454278948" },
              { label: "东方甄选", id: "208823316033" },
            ].map(p => (
              <button key={p.id} onClick={() => setRoomInput(p.id)} style={{
                padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
                background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                fontSize: 10, cursor: "pointer",
              }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          后端 WebSocket 地址
        </label>
        <input
          type="text"
          value={wsBase}
          onChange={e => setWsBase(e.target.value)}
          placeholder="ws://localhost:8010"
          style={{
            width: "100%", padding: "8px 10px", borderRadius: 6,
            background: "var(--bg-tertiary)", border: "1px solid var(--border)",
            color: "var(--text-primary)", fontSize: 12, outline: "none",
          }}
        />
      </div>

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={!canConnect}
        style={{
          width: "100%", padding: 10, borderRadius: 8, border: "none",
          cursor: canConnect ? "pointer" : "not-allowed",
          fontSize: 13, fontWeight: 600,
          background: canConnect ? "var(--accent)" : "var(--bg-tertiary)",
          color: canConnect ? "#fff" : "var(--text-muted)",
        }}
      >
        {"\u5f00\u59cb\u76d1\u63a7"}
      </button>
    </div>
  );
}

function extractRoomId(input = "") {
  const text = decodeURIComponent((input || "").trim());
  if (!text) return "";

  const direct = text.match(/^\d{6,24}$/);
  if (direct) return direct[0];

  // parse as URL first: support
  // https://live.douyin.com/646454278948?anchor_id=
  // ...?room_id=646454278948 / ...?web_rid=646454278948
  try {
    const url = new URL(text);
    const qRoom = url.searchParams.get("room_id") || url.searchParams.get("roomId") || url.searchParams.get("web_rid") || url.searchParams.get("webRid");
    if (qRoom && /^\d{6,24}$/.test(qRoom)) return qRoom;
  } catch {}

  const urlMatch = text.match(/(?:live\.)?douyin\.com\/(\d{6,24})/i);
  if (urlMatch) return urlMatch[1];

  const anyDigits = text.match(/(\d{6,24})/);
  return anyDigits ? anyDigits[1] : "";
}
