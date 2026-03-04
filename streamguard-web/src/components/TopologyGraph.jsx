import { useMemo, useState } from "react";

const TC = { fact: "#2fb47a", hype: "#d79b30", trap: "#e35b5b" };
const TL = { fact: "FACT", hype: "HYPE", trap: "TRAP" };
const LANE_Y = { fact: 0.22, hype: 0.52, trap: 0.82 };

const DRIFT_REASON = {
  "fact-hype": "核实内容转为促销话术",
  "hype-fact": "情绪拉动后切回事实",
  "fact-trap": "以事实铺垫植入陷阱",
  "trap-fact": "陷阱后用事实降低戒备",
  "hype-trap": "催促话术升级为陷阱",
  "trap-hype": "陷阱伴随促购强化",
};

export default function TopologyGraph({ utterances = [] }) {
  const [activeNode, setActiveNode] = useState(null);
  const [showDrift, setShowDrift] = useState(false);
  const [onlyTrap, setOnlyTrap] = useState(false);
  const [windowSize, setWindowSize] = useState(12);
  const [sortKey, setSortKey] = useState("driftMagnitude");

  const W = 900;
  const H = 240;
  const PAD_X = 48;
  const PAD_RIGHT = 28;

  const nodes = useMemo(() => {
    const items = utterances.slice(0, 16).reverse();
    const n = items.length;
    const step = n > 1 ? (W - PAD_X - PAD_RIGHT) / (n - 1) : 0;
    return items.map((u, i) => ({ ...u, nx: PAD_X + i * step, ny: LANE_Y[u.type] * H, idx: i }));
  }, [utterances]);

  const edges = useMemo(() => nodes.slice(1).map((to, i) => {
    const from = nodes[i];
    return {
      from,
      to,
      isDrift: from.type !== to.type,
      isTrap: from.type === "trap" || to.type === "trap",
      key: `${from.type}-${to.type}`,
    };
  }), [nodes]);

  const visEdges = onlyTrap ? edges.filter((e) => e.isTrap) : edges;
  const visNodes = onlyTrap
    ? nodes.filter((n) => n.type === "trap" || edges.some((e) => e.isTrap && (e.from.idx === n.idx || e.to.idx === n.idx)))
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
    return "#304865";
  }

  const driftCount = edges.filter((e) => e.isDrift).length;
  const trapCount = edges.filter((e) => e.isTrap).length;

  const stats = useMemo(() => {
    const total = nodes.length;
    const counts = nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, { fact: 0, hype: 0, trap: 0 });
    const avgScore = total
      ? Math.round((nodes.reduce((s, n) => s + (n.score || 0), 0) / total) * 100)
      : 0;
    const driftNodes = new Set();
    edges.forEach((e) => {
      if (e.isDrift) {
        driftNodes.add(e.from.idx);
        driftNodes.add(e.to.idx);
      }
    });

    const windowStats = (size, offset) => {
      if (!total) return { driftRate: 0, trapRate: 0, edgeCount: 0 };
      const end = Math.max(0, total - offset);
      const start = Math.max(0, end - size);
      const inRange = new Set();
      for (let i = start; i < end; i += 1) inRange.add(i);
      const wEdges = edges.filter((e) => inRange.has(e.from.idx) && inRange.has(e.to.idx));
      const wDrift = wEdges.filter((e) => e.isDrift).length;
      const wTrap = wEdges.filter((e) => e.isTrap).length;
      const edgeCount = wEdges.length || 1;
      return {
        driftRate: wDrift / edgeCount,
        trapRate: wTrap / edgeCount,
        edgeCount: wEdges.length,
      };
    };

    const cur = windowStats(windowSize, 0);
    const prev = windowStats(windowSize, windowSize);
    const driftDelta = prev.edgeCount
      ? Math.round((cur.driftRate - prev.driftRate) * 100)
      : null;

    return {
      total,
      counts,
      avgScore,
      driftNodeCount: driftNodes.size,
      driftDelta,
    };
  }, [nodes, edges, windowSize]);

  const ranking = useMemo(() => {
    const items = nodes.map((node, idx) => {
      const driftEdges = edges.filter((e) => e.isDrift && (e.from.idx === node.idx || e.to.idx === node.idx)).length;
      const trapEdges = edges.filter((e) => e.isTrap && (e.from.idx === node.idx || e.to.idx === node.idx)).length;
      const prev = nodes[idx - 1];
      const confDrop = prev ? Math.max(0, (prev.score || 0) - (node.score || 0)) : 0;
      return {
        node,
        driftMagnitude: driftEdges + (node.type === "trap" ? 0.5 : 0),
        crossClassStrength: driftEdges,
        trapDensity: trapEdges,
        confDrop,
        recent: idx,
      };
    });
    return items
      .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0))
      .slice(0, 6);
  }, [nodes, edges, sortKey]);

  return (
    <div style={{
      background: "linear-gradient(180deg, rgba(18,29,45,0.94), rgba(15,24,37,0.95))",
      border: "1px solid #2b3f5c",
      borderRadius: 14,
      overflow: "hidden",
      minHeight: 320,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 12px 28px rgba(4,9,16,0.24)",
    }}>
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid #2b3f5c",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>语义漂移拓扑图</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>← 旧  新 →</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <TogBtn active={showDrift} color={TC.hype} onClick={() => setShowDrift((p) => !p)}>
            跨类高亮
          </TogBtn>
          <TogBtn active={onlyTrap} color={TC.trap} onClick={() => setOnlyTrap((p) => !p)}>
            仅陷阱
          </TogBtn>
          <span style={{ width: 1, height: 14, background: "#2b3f5c", margin: "0 4px" }} />
          {Object.entries(TC).map(([t, c]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{TL[t]}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
            <defs>
              {Object.entries(TC).map(([t, c]) => (
                <marker key={t} id={`arr-${t}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill={c} opacity="0.7" />
                </marker>
              ))}
            </defs>

            {Object.entries(LANE_Y).map(([type, ly]) => (
              <g key={type}>
                <rect x={0} y={ly * H - 30} width={W} height={60} fill={TC[type]} fillOpacity={0.03} />
                <line x1={0} y1={ly * H - 30} x2={W} y2={ly * H - 30} stroke={TC[type]} strokeOpacity={0.08} />
                <text x={12} y={ly * H + 4} fill={TC[type]} fillOpacity={0.45} fontSize={9} fontWeight={700} fontFamily="Consolas,monospace">
                  {TL[type]}
                </text>
              </g>
            ))}

            {visEdges.map((e, i) => (
              <path key={i} d={edgePath(e)} stroke={edgeColor(e)}
                strokeWidth={e.isTrap ? 2 : 1.2}
                strokeDasharray={e.isTrap ? "6 3" : "none"}
                fill="none" markerEnd={`url(#arr-${e.to.type})`} />
            ))}

            {visNodes.map((node) => {
              const c = TC[node.type];
              const isActive = activeNode?.idx === node.idx;
              const r = 12;
              return (
                <g key={node.idx} style={{ cursor: "pointer" }} onClick={() => setActiveNode(isActive ? null : node)}>
                  {isActive && (
                    <circle cx={node.nx} cy={node.ny} r={r + 4} fill="none" stroke={c} strokeWidth={1.5} opacity={0.65} />
                  )}
                  <circle cx={node.nx} cy={node.ny} r={r} fill={isActive ? `${c}44` : `${c}22`} stroke={c} strokeWidth={isActive ? 2 : 1.2} />
                  <text x={node.nx} y={node.ny + 1} textAnchor="middle" dominantBaseline="middle" fill={c} fontSize={8} fontWeight={700} fontFamily="Consolas,monospace">
                    {TL[node.type]}
                  </text>
                  <text x={node.nx} y={node.ny - r - 4} textAnchor="middle" fill={c} fillOpacity={0.6} fontSize={8} fontFamily="Consolas,monospace">
                    {Math.round((node.score || 0) * 100)}
                  </text>
                </g>
              );
            })}
          </svg>

          {activeNode && (
            <div style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 280,
              background: "linear-gradient(180deg, rgba(24,37,56,0.94), rgba(19,30,45,0.96))",
              border: `1px solid ${TC[activeNode.type]}66`,
              borderRadius: 8,
              padding: 13,
              zIndex: 10,
              boxShadow: "0 14px 26px rgba(0,0,0,0.25)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TC[activeNode.type] }}>
                  {TL[activeNode.type]} #{activeNode.idx + 1}
                </span>
                <button onClick={() => setActiveNode(null)} style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}>{"\u2715"}</button>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 8 }}>
                {activeNode.text}
              </div>
              <div className="mono" style={{ fontSize: 12, color: TC[activeNode.type] }}>
                Score: {Math.round((activeNode.score || 0) * 100)}
              </div>
              {edges
                .filter((e) => (e.from.idx === activeNode.idx || e.to.idx === activeNode.idx) && e.isDrift)
                .slice(0, 2)
                .map((e, i) => (
                  <div key={i} style={{
                    fontSize: 11,
                    color: TC.hype,
                    marginTop: 5,
                    padding: "4px 6px",
                    background: "rgba(215,155,48,0.1)",
                    border: "1px solid rgba(215,155,48,0.3)",
                    borderRadius: 4,
                  }}>
                    {"\u21c4"} {DRIFT_REASON[e.key] || "语义类型转变"}
                  </div>
                ))}
              {activeNode.timestamp && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {activeNode.timestamp}
                </div>
              )}
            </div>
          )}

          {!nodes.length && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}>
              等待数据…
            </div>
          )}
        </div>

        <div style={{
          marginTop: 8,
          background: "linear-gradient(180deg, rgba(22,35,52,0.88), rgba(18,29,44,0.92))",
          borderTop: "1px solid #2b3f5c",
          padding: "12px 14px 14px",
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: 12,
          fontSize: 12,
          color: "var(--text-secondary)",
        }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 700 }}>统计概览</span>
              <div style={{ display: "flex", gap: 6 }}>
                {[6, 12, 16].map((n) => (
                  <TogBtn key={n} active={windowSize === n} color="var(--accent)" onClick={() => setWindowSize(n)}>
                    近{n}
                  </TogBtn>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <MetricCard label="样本节点" value={stats.total} />
              <MetricCard label="漂移节点" value={stats.driftNodeCount} accent={TC.hype} />
              <MetricCard label="陷阱边" value={trapCount} accent={TC.trap} />
              <MetricCard label="平均置信" value={`${stats.avgScore}%`} accent={TC.fact} />
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>FACT / HYPE / TRAP 占比</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  漂移变化
                  <span style={{ marginLeft: 6, color: stats.driftDelta == null ? "var(--text-muted)" : (stats.driftDelta >= 0 ? TC.hype : TC.fact) }}>
                    {stats.driftDelta == null ? "--" : `${stats.driftDelta > 0 ? "+" : ""}${stats.driftDelta}%`}
                  </span>
                </span>
              </div>
              <div style={{
                height: 10,
                borderRadius: 6,
                overflow: "hidden",
                display: "flex",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
              }}>
                <RatioSeg color={TC.fact} value={stats.counts.fact} total={stats.total} />
                <RatioSeg color={TC.hype} value={stats.counts.hype} total={stats.total} />
                <RatioSeg color={TC.trap} value={stats.counts.trap} total={stats.total} />
              </div>
            </div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
              <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>高风险节点排行</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {[
                  { key: "driftMagnitude", label: "漂移强度" },
                  { key: "crossClassStrength", label: "跨类次数" },
                  { key: "trapDensity", label: "陷阱密度" },
                  { key: "confDrop", label: "置信下降" },
                  { key: "recent", label: "时间靠近" },
                ].map((opt) => (
                  <TogBtn key={opt.key} active={sortKey === opt.key} color={TC.hype} onClick={() => setSortKey(opt.key)}>
                    {opt.label}
                  </TogBtn>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ranking.map(({ node }) => (
                <div key={node.idx} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                    padding: "8px 10px",
                  borderRadius: 7,
                  background: "rgba(11,19,30,0.44)",
                  border: `1px solid ${TC[node.type]}44`,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: TC[node.type], fontWeight: 700, fontSize: 12 }}>
                        {TL[node.type]} #{node.idx + 1}
                      </span>
                      <span className="mono" style={{ color: TC[node.type] }}>
                        {Math.round((node.score || 0) * 100)}%
                      </span>
                      {node.timestamp && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{node.timestamp}</span>
                      )}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {node.text}
                    </div>
                  </div>
                  <button onClick={() => setActiveNode(node)} style={{
                    marginLeft: 8,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "transparent",
                    border: `1px solid ${TC[node.type]}66`,
                    color: TC[node.type],
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                  }}>
                    定位
                  </button>
                </div>
              ))}
              {!ranking.length && (
            <div style={{ padding: "10px 8px", color: "var(--text-muted)", fontSize: 12 }}>暂无可分析节点</div>
              )}
            </div>
          </div>
        </div>

        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid #2b3f5c",
          display: "flex",
          gap: 16,
          fontSize: 12,
          color: "var(--text-muted)",
        }}>
          <span>节点 <span className="mono" style={{ color: "var(--accent)" }}>{visNodes.length}</span></span>
          <span>跨类 <span className="mono" style={{ color: TC.hype }}>{driftCount}</span></span>
          <span>陷阱边 <span className="mono" style={{ color: TC.trap }}>{trapCount}</span></span>
          <span style={{ marginLeft: "auto", fontSize: 11 }}>点击榜单可定位拓扑节点</span>
        </div>
      </div>
    </div>
  );
}

function TogBtn({ active, color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 10px",
      borderRadius: 999,
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 600,
      background: active ? `${color}22` : "transparent",
      border: `1px solid ${active ? `${color}66` : "#304865"}`,
      color: active ? color : "var(--text-muted)",
    }}>
      {children}
    </button>
  );
}

function MetricCard({ label, value, accent = "var(--accent)" }) {
  return (
    <div style={{
      padding: "9px 11px",
      borderRadius: 7,
      background: "rgba(11,19,30,0.44)",
      border: "1px solid #304865",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
    }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, color: accent }}>{value}</span>
    </div>
  );
}

function RatioSeg({ color, value, total }) {
  const pct = total ? (value / total) * 100 : 0;
  return <div style={{ width: `${pct}%`, background: color, opacity: 0.6 }} />;
}
