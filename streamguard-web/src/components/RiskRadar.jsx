import { useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Cell } from "recharts";

const DIM_INFO = {
  "\u4ef7\u683c\u900f\u660e\u5ea6": { desc: "\u8bc4\u4f30\u4e3b\u64ad\u5bf9\u4ea7\u54c1\u4ef7\u683c\u7684\u8bf4\u660e\u662f\u5426\u6e05\u6670\u5b8c\u6574\u3002", icon: "\ud83d\udcb0" },
  "\u8bdd\u672f\u538b\u529b\u503c": { desc: "\u68c0\u6d4b\u8bdd\u672f\u4e2d\u9650\u65f6\u9650\u91cf\u3001\u7a00\u7f3a\u6027\u7b49\u50ac\u4fc3\u8d2d\u4e70\u6210\u5206\u7684\u5f3a\u5ea6\u3002", icon: "\u23f1" },
  "\u63cf\u8ff0\u771f\u5b9e\u5ea6": { desc: "\u4e3b\u64ad\u63cf\u8ff0\u4e0e\u5546\u54c1\u9875\u4e8b\u5b9e\u7684\u4e00\u81f4\u6027\u5f97\u5206\u3002", icon: "\ud83d\udccb" },
  "\u65f6\u95f4\u7d27\u8feb\u611f": { desc: "\u91cf\u5316\u76f4\u64ad\u4e2d\u7d27\u8feb\u6027\u8bdd\u8bed\u7684\u5bc6\u5ea6\u3002", icon: "\ud83d\udd50" },
  "\u8bc1\u636e\u5145\u5206\u6027": { desc: "\u4e3b\u64ad\u63d0\u4f9b\u53ef\u9a8c\u8bc1\u8bc1\u636e\u7684\u5145\u5206\u7a0b\u5ea6\u3002", icon: "\ud83d\udcc4" },
  "\u5408\u89c4\u5f97\u5206": { desc: "\u7efc\u5408\u8bc4\u4f30\u4e0e\u6cd5\u89c4\u7684\u5408\u89c4\u7a0b\u5ea6\u3002", icon: "\u2696" },
};

function getColor(v) {
  if (v >= 70) return "#3fb950";
  if (v >= 40) return "#d29922";
  return "#f85149";
}

export default function RiskRadar({ data = [] }) {
  const [view, setView] = useState("radar");
  const [activeDim, setActiveDim] = useState(null);

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
          {"\u98ce\u9669\u96f7\u8fbe"}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {["radar", "bar"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11,
              background: view === v ? "var(--bg-tertiary)" : "transparent",
              border: "1px solid var(--border)",
              color: view === v ? "var(--text-primary)" : "var(--text-muted)",
            }}>
              {v === "radar" ? "\u96f7\u8fbe" : "\u67f1\u72b6"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ padding: "0 8px", minHeight: 220 }}>
        {view === "radar" ? (
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#30363d" gridType="polygon" />
              <PolarAngleAxis dataKey="subject"
                tick={({ payload, x, y, textAnchor }) => (
                  <text x={x} y={y} textAnchor={textAnchor}
                    fill="#8b949e" fontSize={10} fontFamily="inherit"
                    style={{ cursor: "pointer" }}
                    onClick={() => setActiveDim(activeDim === payload.value ? null : payload.value)}>
                    {payload.value}
                  </text>
                )}
              />
              <Radar dataKey="value" stroke="#58a6ff" fill="rgba(88,166,255,0.1)"
                strokeWidth={1.5} dot={{ fill: "#58a6ff", r: 3, strokeWidth: 0 }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 10, right: 10, bottom: 20, left: -10 }}>
              <XAxis dataKey="subject" tick={{ fill: "#8b949e", fontSize: 9 }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" />
              <YAxis domain={[0, 100]} tick={{ fill: "#484f58", fontSize: 8 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}
                onClick={(entry) => setActiveDim(activeDim === entry.subject ? null : entry.subject)}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={getColor(entry.value)} fillOpacity={0.8} cursor="pointer" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Dimension detail */}
      {activeDim && DIM_INFO[activeDim] && (
        <div style={{
          margin: "0 12px 12px", padding: "10px 12px",
          background: "var(--bg-tertiary)", borderRadius: 6,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
              {DIM_INFO[activeDim].icon} {activeDim}
              <span className="mono" style={{ marginLeft: 8, color: getColor(data.find(d => d.subject === activeDim)?.value || 0) }}>
                {data.find(d => d.subject === activeDim)?.value || "--"}
              </span>
            </span>
            <button onClick={() => setActiveDim(null)} style={{
              background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
            }}>{"\u2715"}</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {DIM_INFO[activeDim].desc}
          </div>
        </div>
      )}
    </div>
  );
}
