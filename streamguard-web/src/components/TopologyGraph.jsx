import { useMemo, useState } from "react";

const TC = { fact: "#3fb950", hype: "#d29922", trap: "#f85149" };
const TL = { fact: "FACT", hype: "HYPE", trap: "TRAP" };
const LANE_Y = { fact: 0.22, hype: 0.52, trap: 0.82 };

const DRIFT_REASON = {
  "fact-hype": "\u6838\u5b9e\u5185\u5bb9\u8f6c\u4e3a\u50ac\u4fc3\u8bdd\u672f",
  "hype-fact": "\u60c5\u7eea\u62c9\u52a8\u540e\u5207\u56de\u4e8b\u5b9e",
  "fact-trap": "\u4ee5\u4e8b\u5b9e\u94fa\u57ab\u690d\u5165\u9677\u9631",
  "trap-fact": "\u9677\u9631\u540e\u7528\u4e8b\u5b9e\u964d\u4f4e\u6212\u5907",
  "hype-trap": "\u50ac\u4fc3\u8bdd\u672f\u5347\u7ea7\u4e3a\u9677\u9631",
  "trap-hype": "\u9677\u9631\u4f34\u968f\u50ac\u8d2d\u5f3a\u5316",
};

export default function TopologyGraph({ utterances = [] }) {
  const [activeNode, setActiveNode] = useState(null);
  const [showDrift, setShowDrift] = useState(false);
  const [onlyTrap, setOnlyTrap] = useState(false);

  const W = 900, H = 240;
  const PAD_X = 48, PAD_RIGHT = 28;

  const nodes = useMemo(() => {
    const items = utterances.slice(0, 16).reverse();
    const n = items.length;
    const step = n > 1 ? (W - PAD_X - PAD_RIGHT) / (n - 1) : 0;
    return items.map((u, i) => ({ ...u, nx: PAD_X + i * step, ny: LANE_Y[u.type] * H, idx: i }));
  }, [utterances.length]);

  const edges = useMemo(() => nodes.slice(1).map((to, i) => {
    const from = nodes[i];
    return {
      from, to,
      isDrift: from.type !== to.type,
      isTrap: from.type === "trap" || to.type === "trap",
      key: `${from.type}-${to.type}`,
    };
  }), [nodes]);

  const visEdges = onlyTrap ? edges.filter(e => e.isTrap) : edges;
  const visNodes = onlyTrap
    ? nodes.filter(n => n.type === "trap" || edges.some(e => e.isTrap && (e.from.idx === n.idx || e.to.idx === n.idx)))
    : nodes;

  function edgePath(e) {
    const { from: f, to: t } = e;
    const dy = t.ny - f.ny;
    const ctrl = Math.abs(dy) > 20 ? Math.abs(dy) * 0.55 : Math.abs(t.nx - f.nx) * 0.4;
    return `M${f.nx},${f.ny} C${f.nx + ctrl},${f.ny} ${t.nx - ctrl},${t.ny} ${t.nx},${t.ny}`;
  }

  function edgeColor(e) {
    if (e.isTrap) return TC.trap;
    if (showDrift && e.isDrift) return TC.hype;
    return "#30363d";
  }

  const driftCount = edges.filter(e => e.isDrift).length;
  const trapCount = edges.filter(e => e.isTrap).length;

  return (
    <div style={{
      background: "var(--bg-secondary)", border: "1px solid var(--border)",
      borderRadius: 10, overflow: "hidden", flex: 1, minHeight: 320,
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {"\u8bed\u4e49\u6f02\u79fb\u62d3\u6251\u56fe"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {"\u2190 \u65e7  \u65b0 \u2192"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <TogBtn active={showDrift} color={TC.hype} onClick={() => setShowDrift(p => !p)}>
            {"\u8de8\u7c7b\u9ad8\u4eae"}
          </TogBtn>
          <TogBtn active={onlyTrap} color={TC.trap} onClick={() => setOnlyTrap(p => !p)}>
            {"\u4ec5\u9677\u9631"}
          </TogBtn>
          <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px" }} />
          {Object.entries(TC).map(([t, c]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{TL[t]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG */}
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
          <defs>
            {Object.entries(TC).map(([t, c]) => (
              <marker key={t} id={`arr-${t}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0, 7 3.5, 0 7" fill={c} opacity="0.7" />
              </marker>
            ))}
          </defs>

          {/* Lane backgrounds */}
          {Object.entries(LANE_Y).map(([type, ly]) => (
            <g key={type}>
              <rect x={0} y={ly * H - 30} width={W} height={60} fill={TC[type]} fillOpacity={0.03} />
              <line x1={0} y1={ly * H - 30} x2={W} y2={ly * H - 30} stroke={TC[type]} strokeOpacity={0.08} />
              <text x={12} y={ly * H + 4} fill={TC[type]} fillOpacity={0.4} fontSize={9} fontWeight={600}
                fontFamily="Consolas,monospace">{TL[type]}</text>
            </g>
          ))}

          {/* Edges */}
          {visEdges.map((e, i) => (
            <path key={i} d={edgePath(e)} stroke={edgeColor(e)}
              strokeWidth={e.isTrap ? 2 : 1.2}
              strokeDasharray={e.isTrap ? "6 3" : "none"}
              fill="none" markerEnd={`url(#arr-${e.to.type})`} />
          ))}

          {/* Nodes */}
          {visNodes.map(node => {
            const c = TC[node.type];
            const isActive = activeNode?.idx === node.idx;
            const r = 12;
            return (
              <g key={node.idx} style={{ cursor: "pointer" }}
                onClick={() => setActiveNode(isActive ? null : node)}>
                {isActive && (
                  <circle cx={node.nx} cy={node.ny} r={r + 4}
                    fill="none" stroke={c} strokeWidth={1.5} opacity={0.6} />
                )}
                <circle cx={node.nx} cy={node.ny} r={r}
                  fill={isActive ? `${c}44` : `${c}22`}
                  stroke={c} strokeWidth={isActive ? 2 : 1.2} />
                <text x={node.nx} y={node.ny + 1} textAnchor="middle" dominantBaseline="middle"
                  fill={c} fontSize={8} fontWeight={600} fontFamily="Consolas,monospace">
                  {TL[node.type]}
                </text>
                <text x={node.nx} y={node.ny - r - 4} textAnchor="middle"
                  fill={c} fillOpacity={0.6} fontSize={8} fontFamily="Consolas,monospace">
                  {Math.round((node.score || 0) * 100)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Node detail popover */}
        {activeNode && (
          <div style={{
            position: "absolute", top: 10, right: 10, width: 240,
            background: "var(--bg-tertiary)", border: `1px solid ${TC[activeNode.type]}55`,
            borderRadius: 8, padding: 12, zIndex: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: TC[activeNode.type] }}>
                {TL[activeNode.type]} #{activeNode.idx + 1}
              </span>
              <button onClick={() => setActiveNode(null)} style={{
                background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
              }}>{"\u2715"}</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>
              {activeNode.text}
            </div>
            <div className="mono" style={{ fontSize: 11, color: TC[activeNode.type] }}>
              Score: {Math.round((activeNode.score || 0) * 100)}
            </div>
            {/* Drift reasons */}
            {edges
              .filter(e => (e.from.idx === activeNode.idx || e.to.idx === activeNode.idx) && e.isDrift)
              .slice(0, 2)
              .map((e, i) => (
                <div key={i} style={{
                  fontSize: 10, color: TC.hype, marginTop: 4,
                  padding: "4px 6px", background: "rgba(210,153,34,0.08)",
                  border: "1px solid rgba(210,153,34,0.2)", borderRadius: 4,
                }}>
                  {"\u21c4"} {DRIFT_REASON[e.key] || "\u8bed\u4e49\u7c7b\u578b\u8f6c\u53d8"}
                </div>
              ))}
            {activeNode.timestamp && (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                {activeNode.timestamp}
              </div>
            )}
          </div>
        )}

        {!nodes.length && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-muted)", fontSize: 12,
          }}>
            {"\u7b49\u5f85\u6570\u636e\u2026"}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div style={{
        padding: "8px 16px", borderTop: "1px solid var(--border)",
        display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)",
      }}>
        <span>{"\u8282\u70b9"} <span className="mono" style={{ color: "var(--accent)" }}>{visNodes.length}</span></span>
        <span>{"\u8de8\u7c7b"} <span className="mono" style={{ color: TC.hype }}>{driftCount}</span></span>
        <span>{"\u9677\u9631\u8fb9"} <span className="mono" style={{ color: TC.trap }}>{trapCount}</span></span>
        <span style={{ marginLeft: "auto", fontSize: 10 }}>
          {"\u70b9\u51fb\u8282\u70b9\u67e5\u770b\u8be6\u60c5"}
        </span>
      </div>
    </div>
  );
}

function TogBtn({ active, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontWeight: 500,
      background: active ? `${color}22` : "transparent",
      border: `1px solid ${active ? color + "55" : "var(--border)"}`,
      color: active ? color : "var(--text-muted)",
    }}>
      {children}
    </button>
  );
}
