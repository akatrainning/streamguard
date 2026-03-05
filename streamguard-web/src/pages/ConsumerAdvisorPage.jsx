import { useMemo, useState } from "react";

export default function ConsumerAdvisorPage({ apiBase, utterances = [], chatMessages = [] }) {
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("");
  const [need, setNeed] = useState("");
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [suite, setSuite] = useState(null);
  const [error, setError] = useState("");

  const streamEvidence = useMemo(() => {
    const us = utterances.slice(0, 60).map((u) => ({
      text: u.text,
      type: u.type,
      score: u.score,
      source: u.source,
      timestamp: u.timestamp,
      violations: u.violations || [],
      suggestion: u.suggestion || "",
    }));
    const cs = chatMessages.slice(0, 100).map((c) => ({
      text: c.text,
      intent: c.intent,
      sentiment: c.sentiment,
      risk_score: c.risk_score,
      timestamp: c.timestamp,
    }));
    return { utterances: us, chats: cs };
  }, [utterances, chatMessages]);

  const products = searchResult?.products || [];
  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setError("请先输入商品关键词");
      return;
    }
    setError("");
    setSearching(true);
    setSuite(null);
    try {
      const res = await fetch(`${apiBase}/consumer/search-products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "搜索失败");
      setSearchResult(data);
      setSelectedIds((data.products || []).slice(0, 3).map((x) => x.id));
    } catch (e) {
      setError(e?.message || "搜索失败");
    } finally {
      setSearching(false);
    }
  };

  const runFullSuite = async () => {
    if (!query.trim()) {
      setError("请先输入商品关键词");
      return;
    }
    setError("");
    setAnalyzing(true);
    try {
      const payload = {
        product_query: query.trim(),
        products: selectedProducts,
        user_profile: {
          budget: budget.trim(),
          core_need: need.trim(),
        },
        stream_context: streamEvidence,
      };
      const res = await fetch(`${apiBase}/consumer/full-suite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "综合分析失败");
      setSuite(data);
    } catch (e) {
      setError(e?.message || "综合分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Section title="消费者决策中心" subtitle="从‘值不值得买’出发：结论、对比、行动计划">
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr auto", gap: 8 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索商品，例如：玻尿酸精华、破壁机、儿童学习桌"
            style={inputStyle} />
          <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="预算（可选）：如 300以内" style={inputStyle} />
          <input value={need} onChange={(e) => setNeed(e.target.value)} placeholder="核心需求（可选）：如 敏感肌可用" style={inputStyle} />
          <button style={btnStyle} onClick={runSearch} disabled={searching}>{searching ? "搜索中..." : "搜索候选"}</button>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <button style={{ ...btnStyle, background: "var(--accent)", color: "#fff", border: "none" }} onClick={runFullSuite} disabled={analyzing}>
            {analyzing ? "分析中..." : "开始综合分析"}
          </button>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            已接入证据：话术 {utterances.length} 条 / 弹幕 {chatMessages.length} 条
          </span>
        </div>

        {!!error && <div style={{ marginTop: 8, fontSize: 12, color: "var(--trap)" }}>⚠ {error}</div>}
      </Section>

      {products.length > 0 && (
        <Section
          title="P1：候选商品列表"
          subtitle={
            <span>
              勾选后参与垂类对比分析（可多选）
              {searchResult?.source === "llm" ? (
                <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 8, fontSize: 10, background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}>✦ AI 生成</span>
              ) : (
                <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 8, fontSize: 10, background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>⚠ 兜底数据（AI 不可用）</span>
              )}
            </span>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {products.map((p) => {
              const active = selectedIds.includes(p.id);
              return (
                <div key={p.id} style={{ border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                    <input type="checkbox" checked={active} onChange={() => toggleSelect(p.id)} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{p.brand} · {p.channel}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>价格：{p.price} | 规格：{p.spec}</div>
                  <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>适配：</div>
                  <TagList items={p.fit_for || []} />
                  <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}>已知风险：</div>
                  <TagList items={p.known_risks || []} risk />
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {suite?.p0 && (
        <Section title="P0：值不值得买（结论卡）" subtitle={`引擎：${suite.engine} · 证据：话术${suite.evidence_stats?.utterance_count || 0}/弹幕${suite.evidence_stats?.chat_count || 0}`}>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 1fr", gap: 10 }}>
            <VerdictCard p0={suite.p0} />
            <BulletCard title="值得买的理由" items={suite.p0.why_buy || []} />
            <BulletCard title="不建议立刻买的理由" items={suite.p0.why_not_buy || []} danger />
          </div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BulletCard title="买前必须核验" items={suite.p0.must_verify || []} />
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>消费者摘要</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{suite.p0.consumer_summary || "--"}</div>
            </div>
          </div>
        </Section>
      )}

      {suite?.p1 && (
        <Section title="P1：同类商品垂直对比" subtitle="包含价格透明度、质量证据、售后保障、主播话术可信度、弹幕口碑等维度">
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th style={thStyle}>商品</th>
                  {suite.p1.compare_dimensions?.map((d) => <th key={d} style={thStyle}>{d}</th>)}
                  <th style={thStyle}>综合分</th>
                </tr>
              </thead>
              <tbody>
                {(suite.p1.products || []).map((p) => (
                  <tr key={p.name}>
                    <td style={tdStyle}>{p.name}</td>
                    {(suite.p1.compare_dimensions || []).map((d) => (
                      <td key={d} style={tdStyle}>{toPct(p.scores?.[d])}</td>
                    ))}
                    <td style={tdStyle}><b>{toPct(p.overall)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BulletCard title="排名建议" items={(suite.p1.ranked || []).map((x, i) => `${i + 1}. ${x}`)} />
            <BulletCard title="对比备注" items={suite.p1.analysis_notes || []} />
          </div>
        </Section>
      )}

      {suite?.p2 && (
        <Section title="P2：行动工具包" subtitle="你现在就能执行的提问、替代、时机和风险回看">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <BulletCard title="问主播的关键问题" items={suite.p2.ask_anchor_questions || []} />
            <BulletCard title="替代方案" items={suite.p2.alternatives || []} />
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>买点时机建议</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{suite.p2.buy_timing || "--"}</div>
            </div>
            <BulletCard title="行动计划" items={suite.p2.action_plan || []} />
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>风险回放</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {(suite.p2.risk_replay || []).map((r, i) => (
                <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
                  <div style={{ fontSize: 12, color: "var(--trap)", marginBottom: 3 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{r.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function VerdictCard({ p0 }) {
  const map = {
    BUY: { c: "var(--fact)", t: "建议购买" },
    WAIT: { c: "var(--hype)", t: "建议观望" },
    SKIP: { c: "var(--trap)", t: "不建议购买" },
  };
  const m = map[p0.verdict] || map.WAIT;
  return (
    <div style={{ border: `1px solid ${m.c}`, borderRadius: 8, padding: 12, background: "var(--bg-tertiary)" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>最终结论</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: m.c, marginTop: 6 }}>{m.t}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>置信度：{toPct(p0.confidence)}</div>
    </div>
  );
}

function BulletCard({ title, items = [], danger = false }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--bg-tertiary)" }}>
      <div style={{ fontSize: 11, color: danger ? "var(--trap)" : "var(--text-muted)", marginBottom: 4 }}>{title}</div>
      {(items || []).length === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>--</div>}
      {(items || []).slice(0, 8).map((x, i) => (
        <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, lineHeight: 1.5 }}>• {x}</div>
      ))}
    </div>
  );
}

function TagList({ items = [], risk = false }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {(items || []).slice(0, 5).map((x, i) => (
        <span key={i} style={{
          padding: "1px 6px",
          borderRadius: 999,
          border: `1px solid ${risk ? "var(--trap)" : "var(--border)"}`,
          color: risk ? "var(--trap)" : "var(--text-secondary)",
          fontSize: 10,
        }}>{x}</span>
      ))}
    </div>
  );
}

function toPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  outline: "none",
  fontSize: 12,
};

const btnStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: 12,
};

const thStyle = {
  textAlign: "left",
  fontSize: 11,
  color: "var(--text-muted)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
};

const tdStyle = {
  fontSize: 12,
  color: "var(--text-secondary)",
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
};
