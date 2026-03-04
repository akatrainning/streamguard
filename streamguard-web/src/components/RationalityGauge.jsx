import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const R = 72, CX = 90, CY = 95;

function getRawColor(v) {
  if (v >= 70) return "#3fb950";
  if (v >= 40) return "#d29922";
  return "#f85149";
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const rad = d => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg)), y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg)),   y2 = cy + r * Math.sin(rad(endDeg));
  return `M ${x1} ${y1} A ${r} ${r} 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

export default function RationalityGauge({ value = 78, utterances = [] }) {
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([{ time: "00:00", value: 78 }]);
  const prevVal = useRef(78);

  useEffect(() => {
    if (value !== prevVal.current) {
      prevVal.current = value;
      const time = new Date().toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setHistory(prev => [...prev.slice(-29), { time, value }]);
    }
  }, [value]);

  const color = getRawColor(value);
  const facts = utterances.filter(u => u.type === "fact").length;
  const hypes = utterances.filter(u => u.type === "hype").length;
  const traps = utterances.filter(u => u.type === "trap").length;
  const label = value >= 70 ? "\u7406\u6027" : value >= 40 ? "\u8b66\u60d5" : "\u9ad8\u5371";

  const valueDeg = 135 + (value / 100) * 270;
  const trackPath = arcPath(CX, CY, R, 135, 405);
  const valuePath = arcPath(CX, CY, R, 135, Math.min(valueDeg, 404.9));

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column", height: "100%",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {"\u7406\u6027\u6307\u6570"}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color,
            padding: "2px 8px", borderRadius: 4,
            background: `${color}18`,
          }}>{label}</span>
          <button onClick={() => setShowHistory(p => !p)} style={{
            padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11,
            background: showHistory ? "var(--bg-tertiary)" : "transparent",
            border: "1px solid var(--border)", color: "var(--text-muted)",
          }}>
            {showHistory ? "\u6536\u8d77" : "\u5386\u53f2"}
          </button>
        </div>
      </div>

      {/* Gauge SVG */}
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
        <svg width="180" height="140" viewBox="0 0 180 190">
          {/* Track */}
          <path d={trackPath} fill="none" stroke="#30363d" strokeWidth="8" strokeLinecap="round" />
          {/* Value arc */}
          <path d={valuePath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map(tick => {
            const deg = 135 + (tick / 100) * 270;
            const rad = (deg * Math.PI) / 180;
            return (
              <line key={tick}
                x1={CX + 58 * Math.cos(rad)} y1={CY + 58 * Math.sin(rad)}
                x2={CX + 66 * Math.cos(rad)} y2={CY + 66 * Math.sin(rad)}
                stroke="#484f58" strokeWidth="1.5" strokeLinecap="round"
              />
            );
          })}
          {/* Value text */}
          <text x={CX} y={CY - 8} textAnchor="middle" fill={color}
            fontSize="26" fontWeight="700" fontFamily="Consolas, monospace">{value}</text>
          <text x={CX} y={CY + 10} textAnchor="middle"
            fill="#484f58" fontSize="10">/ 100</text>
        </svg>
      </div>

      {/* Type counts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: "0 12px 12px" }}>
        {[
          ["FACT", facts, "var(--fact)"],
          ["HYPE", hypes, "var(--hype)"],
          ["TRAP", traps, "var(--trap)"],
        ].map(([lbl, val, c]) => (
          <div key={lbl} style={{
            textAlign: "center", padding: "6px 4px",
            background: "var(--bg-tertiary)", borderRadius: 6,
          }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: c }}>{val}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* History chart */}
      {showHistory && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <XAxis dataKey="time" tick={{ fill: "#484f58", fontSize: 8 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fill: "#484f58", fontSize: 8 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={70} stroke="rgba(63,185,80,0.2)" strokeDasharray="3 3" />
              <ReferenceLine y={40} stroke="rgba(210,153,34,0.2)" strokeDasharray="3 3" />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 11 }} />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
