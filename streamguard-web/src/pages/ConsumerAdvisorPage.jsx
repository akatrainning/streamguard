import { useMemo, useState } from "react";

function DecisionBoard({ products, selectedIds, suite, onToggle }) {
  if (!products.length && !suite) return null;
  const verdict = suite?.p0?.verdict || "WAIT";
  const confidence = suite?.p0?.confidence;
  const ranked = suite?.p1?.ranked || [];
  const activeProducts = products.filter((product) => selectedIds.includes(product.id));

  return (
    <section className="sg-advisor-decision-board">
      <div className={`sg-advisor-decision-core is-${String(verdict).toLowerCase()}`}>
        <span>DECISION</span>
        <strong>{verdict}</strong>
        <em>{Number.isFinite(Number(confidence)) ? `${Math.round(Number(confidence) * 100)}% confidence` : `${activeProducts.length} selected`}</em>
      </div>

      <div className="sg-advisor-product-matrix">
        {(products.length ? products : activeProducts).slice(0, 8).map((product, index) => {
          const active = selectedIds.includes(product.id);
          const riskCount = (product.known_risks || []).length;
          const fitCount = (product.fit_for || []).length;
          return (
            <button
              key={product.id || product.name}
              type="button"
              className={`sg-advisor-matrix-cell ${active ? "is-active" : ""}`}
              onClick={() => onToggle(product.id)}
              aria-pressed={active}
            >
              <span className="mono">P{index + 1}</span>
              <strong>{product.name}</strong>
              <em>{product.price || "--"} / risk {riskCount}</em>
              <i style={{ "--fit": `${Math.min(100, fitCount * 22 + 18)}%` }} />
            </button>
          );
        })}
      </div>

      <div className="sg-advisor-evidence-strip">
        <div>
          <span>Best rank</span>
          <strong>{ranked[0] || activeProducts[0]?.name || "--"}</strong>
        </div>
        <div>
          <span>Must verify</span>
          <strong>{suite?.p0?.must_verify?.[0] || products[0]?.known_risks?.[0] || "--"}</strong>
        </div>
        <div>
          <span>Next action</span>
          <strong>{suite?.p2?.action_plan?.[0] || suite?.p2?.buy_timing || "Run full suite"}</strong>
        </div>
      </div>
    </section>
  );
}

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
      setError("请输入商品关键词");
      return;
    }
    setError("");
    setSearching(true);
    setSuite(null);
    try {
      const res = await fetch(`${apiBase}/consumer/search-products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "商品搜索失败");
      setSearchResult(data);
      setSelectedIds((data.products || []).slice(0, 3).map((x) => x.id));
    } catch (e) {
      setError(e?.message || "商品搜索失败");
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
      if (!res.ok) throw new Error(data?.detail || "消费建议生成失败");
      setSuite(data);
    } catch (e) {
      setError(e?.message || "消费建议生成失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <main className="sg-advisor-page">
      <header className="sg-advisor-hero">
        <div>
          <div className="sg-ui-eyebrow">Consumer Decision</div>
          <h1>消费建议工作台</h1>
          <p>把直播间话术、弹幕反馈和商品候选放在同一张审查桌上，先验风险，再谈购买。</p>
        </div>
        <div className="sg-advisor-meter">
          <span>证据池</span>
          <strong className="mono">{utterances.length + chatMessages.length}</strong>
          <small>{utterances.length} 话术 / {chatMessages.length} 弹幕</small>
        </div>
      </header>

      <section className="sg-ui-panel sg-advisor-search">
        <div className="sg-ui-panel-body">
          <label className="sg-ui-field">
            <span>商品关键词</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="如：护肤精华、家用取暖器" />
          </label>
          <label className="sg-ui-field">
            <span>预算</span>
            <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="如：300 元以内" />
          </label>
          <label className="sg-ui-field">
            <span>核心需求</span>
            <input value={need} onChange={(e) => setNeed(e.target.value)} placeholder="如：敏感肌、低噪音、送父母" />
          </label>
          <div className="sg-advisor-actions">
            <button className="sg-ui-button is-secondary" onClick={runSearch} disabled={searching} type="button">
              {searching ? "检索中..." : "检索商品"}
            </button>
            <button className="sg-ui-button is-primary" onClick={runFullSuite} disabled={analyzing} type="button">
              {analyzing ? "分析中..." : "生成建议"}
            </button>
          </div>
          {!!error && <div className="sg-advisor-error">{error}</div>}
        </div>
      </section>

      <DecisionBoard
        products={products}
        selectedIds={selectedIds}
        suite={suite}
        onToggle={toggleSelect}
      />

      {products.length > 0 && (
        <section className="sg-ui-panel">
          <header className="sg-ui-panel-head">
            <div>
              <div className="sg-ui-eyebrow">Candidate Set</div>
              <h2>候选商品</h2>
            </div>
            <span className={`sg-ui-status ${searchResult?.source === "llm" ? "is-warning" : "is-neutral"}`}>
              <i />
              {searchResult?.source === "llm" ? "AI 补全" : "检索结果"}
            </span>
          </header>
          <div className="sg-advisor-products">
            {products.map((p) => {
              const active = selectedIds.includes(p.id);
              return (
                <article key={p.id} className={`sg-advisor-product ${active ? "is-active" : ""}`}>
                  <label>
                    <input type="checkbox" checked={active} onChange={() => toggleSelect(p.id)} />
                    <span>{active ? "纳入分析" : "暂不纳入"}</span>
                  </label>
                  <h3>{p.name}</h3>
                  <p>{p.brand} / {p.channel}</p>
                  <strong>{p.price || "--"} <small>{p.spec || ""}</small></strong>
                  <TagList label="适配人群" items={p.fit_for || []} />
                  <TagList label="已知风险" items={p.known_risks || []} risk />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {suite ? (
        <section className="sg-advisor-suite">
          {suite.p0 && (
            <div className="sg-advisor-grid is-p0">
              <VerdictCard p0={suite.p0} engine={suite.engine} evidence={suite.evidence_stats} />
              <BulletCard title="可以买的理由" items={suite.p0.why_buy || []} />
              <BulletCard title="需要克制的理由" items={suite.p0.why_not_buy || []} danger />
              <BulletCard title="必须核验" items={suite.p0.must_verify || []} />
              <TextCard title="给消费者的短结论" text={suite.p0.consumer_summary} />
            </div>
          )}

          {suite.p1 && (
            <section className="sg-ui-panel">
              <header className="sg-ui-panel-head">
                <div>
                  <div className="sg-ui-eyebrow">Comparison</div>
                  <h2>商品对比</h2>
                </div>
              </header>
              <ComparisonTable p1={suite.p1} />
              <div className="sg-advisor-grid">
                <BulletCard title="推荐排序" items={(suite.p1.ranked || []).map((x, i) => `${i + 1}. ${x}`)} />
                <BulletCard title="分析备注" items={suite.p1.analysis_notes || []} />
              </div>
            </section>
          )}

          {suite.p2 && (
            <section className="sg-ui-panel">
              <header className="sg-ui-panel-head">
                <div>
                  <div className="sg-ui-eyebrow">Action Plan</div>
                  <h2>购买前动作</h2>
                </div>
              </header>
              <div className="sg-advisor-grid">
                <BulletCard title="需要追问主播" items={suite.p2.ask_anchor_questions || []} />
                <BulletCard title="替代方案" items={suite.p2.alternatives || []} />
                <TextCard title="购买时机" text={suite.p2.buy_timing} />
                <BulletCard title="行动清单" items={suite.p2.action_plan || []} />
              </div>
              <div className="sg-advisor-risk-replay">
                {(suite.p2.risk_replay || []).map((r, i) => (
                  <TextCard key={i} title={r.title} text={r.detail} danger />
                ))}
              </div>
            </section>
          )}
        </section>
      ) : (
        <div className="sg-advisor-empty">
          <strong>尚未生成消费建议</strong>
          <span>先检索商品，再把候选和直播证据一起送入分析。</span>
        </div>
      )}
    </main>
  );
}

function VerdictCard({ p0, engine, evidence }) {
  const map = {
    BUY: { cls: "is-success", text: "可以买" },
    WAIT: { cls: "is-warning", text: "先等等" },
    SKIP: { cls: "is-danger", text: "不建议买" },
  };
  const m = map[p0.verdict] || map.WAIT;
  return (
    <article className={`sg-advisor-verdict ${m.cls}`}>
      <span>决策建议</span>
      <strong>{m.text}</strong>
      <p>置信度 {toPct(p0.confidence)}</p>
      <small>{engine || "local"} / {evidence?.utterance_count || 0} 话术 / {evidence?.chat_count || 0} 弹幕</small>
    </article>
  );
}

function ComparisonTable({ p1 }) {
  const dimensions = p1.compare_dimensions || [];
  return (
    <div className="sg-advisor-table-wrap">
      <table className="sg-advisor-table">
        <thead>
          <tr>
            <th>商品</th>
            {dimensions.map((d) => <th key={d}>{d}</th>)}
            <th>综合</th>
          </tr>
        </thead>
        <tbody>
          {(p1.products || []).map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              {dimensions.map((d) => <td key={d}>{toPct(p.scores?.[d])}</td>)}
              <td><strong>{toPct(p.overall)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulletCard({ title, items = [], danger = false }) {
  return (
    <article className={`sg-advisor-card ${danger ? "is-danger" : ""}`}>
      <h3>{title}</h3>
      {(items || []).length === 0 && <p>暂无数据</p>}
      {(items || []).slice(0, 8).map((x, i) => <p key={i}>{x}</p>)}
    </article>
  );
}

function TextCard({ title, text, danger = false }) {
  return (
    <article className={`sg-advisor-card ${danger ? "is-danger" : ""}`}>
      <h3>{title}</h3>
      <p>{text || "暂无数据"}</p>
    </article>
  );
}

function TagList({ label, items = [], risk = false }) {
  return (
    <div className="sg-advisor-tags">
      <span>{label}</span>
      <div>
        {(items || []).slice(0, 5).map((x, i) => (
          <em key={i} className={risk ? "is-risk" : ""}>{x}</em>
        ))}
        {items.length === 0 && <em>无</em>}
      </div>
    </div>
  );
}

function toPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}
