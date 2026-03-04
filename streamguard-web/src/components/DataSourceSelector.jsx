import { useState, useEffect } from "react";

// 设计参考：现代化、类 Linear/Vercel 的冷峻极简风格，告别廉价 AI 感
// 动态虚化抖音直播背景，消费者友好的标题文案

// 动态虚化直播背景拼接
const DynamicBlurredBackground = () => {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 0.5) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* 多个虚化直播间截图网格 */}
      <div
        style={{
          position: "absolute",
          inset: "-50%",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "20px",
          filter: "blur(40px)",
          opacity: 0.15,
          transform: `translate(${offset * 0.3}px, ${Math.sin(offset * Math.PI / 180) * 20}px)`,
          transition: "none",
        }}
      >
        {/* 9个虚化直播图像块 */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              aspectRatio: "16/9",
              background: `linear-gradient(${offset + i * 20}deg, rgba(88,166,255,0.4), rgba(255,100,150,0.3))`,
              borderRadius: "8px",
            }}
          />
        ))}
      </div>

      {/* 渐变遮罩 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%)",
        }}
      />
    </div>
  );
};

const SVG_DB = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
  </svg>
);

const SVG_RADAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="12" r="2"></circle>
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48 0a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
  </svg>
);

const SVG_SHIELD = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    <path d="M12 12v4"></path>
    <path d="M12 8h.01"></path>
  </svg>
);

export default function DataSourceSelector({ onSelect, onConnect }) {
  const [selected, setSelected] = useState(null);
  const [roomInput, setRoomInput] = useState("");
  const [wsBase, setWsBase] = useState("ws://localhost:8011");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeData, setProbeData]   = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const roomId = extractRoomId(roomInput);
  const canConnect = selected === "mock" || (selected === "douyin" && roomId.trim());

  // 极速防抖：由 700ms 降到了极速 300ms，让响应有“指哪打哪”的快感
  useEffect(() => {
    if (!roomId || selected !== "douyin") {
      setProbeData(null);
      setProbeLoading(false);
      return;
    }

    setProbeData(null);
    setProbeLoading(true);

    const timer = setTimeout(async () => {
      try {
        const httpBase = (wsBase || "ws://localhost:8011").replace(/^ws/i, "http");
        const res = await fetch(`${httpBase}/douyin/room-info/${roomId}`);
        const data = res.ok ? await res.json() : { error: `HTTP ${res.status}: 解析失败` };
        setProbeData(data);
      } catch {
        setProbeData({ error: "分析节点未响应，请检查后端服务" });
      } finally {
        setProbeLoading(false);
      }
    }, 300); 
    
    return () => clearTimeout(timer);
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
    <div
      style={{
        width: 560,
        maxWidth: "92vw",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
        padding: 28,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 动态虚化背景 */}
      <DynamicBlurredBackground />

      {/* 内容层 */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>直播风险管家</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            实时守护每一场直播，让您的消费安全无忧
          </div>
        </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => setSelected("mock")}
          style={{
            textAlign: "left",
            borderRadius: 12,
            padding: "14px 14px",
            border: selected === "mock" ? "1px solid var(--accent)" : "1px solid var(--border)",
            background: selected === "mock" ? "rgba(88,166,255,0.08)" : "var(--bg-tertiary)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>快速体验</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            试试演示直播间，1 分钟掌握风险检测
          </div>
        </button>

        <button
          onClick={() => setSelected("douyin")}
          style={{
            textAlign: "left",
            borderRadius: 12,
            padding: "14px 14px",
            border: selected === "douyin" ? "1px solid var(--accent)" : "1px solid var(--border)",
            background: selected === "douyin" ? "rgba(88,166,255,0.08)" : "var(--bg-tertiary)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>监测你的直播</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            输入你的直播间，实时发现和拦截异常风险
          </div>
        </button>
      </div>

      {selected === "douyin" && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 14,
            background: "var(--bg-tertiary)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            直播间链接或房间号
          </label>
          <input
            type="text"
            placeholder="如：https://live.douyin.com/646454278948"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              outline: "none",
              fontSize: 13,
            }}
          />

          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
            识别结果：{roomId || "未识别到房间号"}
          </div>

          {roomId && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              {probeLoading
                ? "正在解析直播间…"
                : probeData?.error
                  ? `解析失败：${probeData.error}`
                  : probeData
                    ? `已连接目标：${probeData.room_id}${probeData.live_hint ? "（直播中）" : ""}`
                    : null}
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "与辉同行", id: "646454278948" },
              { label: "东方甄选", id: "208823316033" },
            ].map((x) => (
              <button
                key={x.id}
                onClick={() => setRoomInput(x.id)}
                style={{
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16, position: "relative", zIndex: 1 }}>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            border: "none",
            background: "none",
            color: "var(--text-muted)",
            fontSize: 12,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {showAdvanced ? "收起高级设置" : "高级设置"}
        </button>

        {showAdvanced && (
          <div style={{ marginTop: 8 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
              WebSocket 地址
            </label>
            <input
              type="text"
              value={wsBase}
              onChange={(e) => setWsBase(e.target.value)}
              placeholder="ws://localhost:8011"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>
        )}
      </div>

      <button
        onClick={handleConnect}
        disabled={!canConnect}
        style={{
          width: "100%",
          height: 42,
          borderRadius: 10,
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: canConnect ? "pointer" : "not-allowed",
          background: canConnect ? "var(--accent)" : "var(--bg-tertiary)",
          color: canConnect ? "#fff" : "var(--text-muted)",
          position: "relative",
          zIndex: 1,
        }}
      >
        开始监测
      </button>
      </div>
    </div>
  );
}

function extractRoomId(input = "") {
  const text = decodeURIComponent((input || "").trim());
  if (!text) return "";

  const direct = text.match(/^\d{6,24}$/);
  if (direct) return direct[0];

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
