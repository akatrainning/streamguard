import { useState } from "react";

const SOURCES = [
  { id: "mock",   icon: "\ud83c\udfac", label: "\u6a21\u62df\u6570\u636e", desc: "\u6f14\u793a\u6570\u636e\u6d41\uff0c\u65e0\u9700\u540e\u7aef" },
  { id: "douyin", icon: "\ud83c\udfb5", label: "\u6296\u97f3\u76f4\u64ad", desc: "\u5b9e\u65f6\u5f39\u5e55\u5206\u6790\uff08\u9700\u540e\u7aef + room_id\uff09" },
];

export default function DataSourceSelector({ onSelect, onConnect }) {
  const [selected, setSelected] = useState(null);
  const [roomInput, setRoomInput] = useState("");
  const [wsBase, setWsBase] = useState("ws://localhost:8010");

  const roomId = extractRoomId(roomInput);

  const canConnect = selected === "mock" || (selected === "douyin" && roomId.trim());

  const handleConnect = () => {
    if (!canConnect) return;
    const config = selected === "douyin"
      ? { roomId: roomId.trim(), wsBase: wsBase.trim() || "ws://localhost:8010" }
      : { wsBase: wsBase.trim() || "ws://localhost:8010" };
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
  const text = input.trim();
  if (!text) return "";

  const direct = text.match(/^\d{6,24}$/);
  if (direct) return direct[0];

  const urlMatch = text.match(/live\.douyin\.com\/(\d{6,24})/i);
  if (urlMatch) return urlMatch[1];

  const anyDigits = text.match(/(\d{6,24})/);
  return anyDigits ? anyDigits[1] : "";
}
