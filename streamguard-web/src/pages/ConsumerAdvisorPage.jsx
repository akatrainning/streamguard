import { useMemo, useState } from "react";
import StatusBadge from "../components/ui/StatusBadge";
import { requestJson } from "../utils/authClient";

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
        <em>
          {Number.isFinite(Number(confidence))
            ? `${Math.round(Number(confidence) * 100)}% confidence`
            : `${activeProducts.length} selected`}
        </em>
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

function normalizeProduct(product = {}, index = 0, query = "") {
  return {
    id: product.id || `product-${index + 1}`,
    name: product.name || `${query || "商品"} 候选 ${index + 1}`,
    brand: product.brand || "",
    channel: product.channel || "",
    price: product.price || "",
    spec: product.spec || "",
    fit_for: Array.isArray(product.fit_for) ? product.fit_for : [],
    known_risks: Array.isArray(product.known_risks) ? product.known_risks : [],
  };
}

function buildFallbackProducts(query = "") {
  return [
    {
      id: `${query}-official`,
      name: `${query} 官方旗舰款`,
      brand: "品牌官方",
      channel: "官方店",
      price: "199-299 元",
      spec: "标准装",
      fit_for: ["证据优先", "售后明确"],
      known_risks: ["需核验检测报告"],
    },
    {
      id: `${query}-deal`,
      name: `${query} 直播优惠款`,
      brand: "直播间",
      channel: "主播推荐",
      price: "129-199 元",
      spec: "组合装",
      fit_for: ["价格敏感", "短期促销"],
      known_risks: ["关注极限词", "确认退换货"],
    },
    {
      id: `${query}-alt`,
      name: `${query} 同类替代款`,
      brand: "同类品牌",
      channel: "综合电商",
      price: "159-259 元",
      spec: "对比装",
      fit_for: ["横向比较", "理性决策"],
      known_risks: ["对比规格差异"],
    },
  ].map((item, index) => normalizeProduct(item, index, query));
}

function parseTagInput(value) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ConsumerAdvisorPage({ apiBase, utterances = [], chatMessages = [] }) {
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("");
  const [need, setNeed] = useState("");
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [editableProducts, setEditableProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [suite, setSuite] = useState(null);
  const [error, setError] = useState("");
  const [searchStatus, setSearchStatus] = useState(null);

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

  const products = editableProducts;
  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));

  const updateProduct = (id, field, value) => {
    setEditableProducts((prev) => prev.map((product) => {
      if (product.id !== id) return product;
      if (field === "fit_for" || field === "known_risks") {
        return { ...product, [field]: parseTagInput(value) };
      }
      return { ...product, [field]: value };
    }));
  };

  const addCustomProduct = () => {
    const id = `custom-${Date.now()}`;
    setEditableProducts((prev) => [
      ...prev,
      {
        id,
        name: `${query.trim() || "自定义商品"} 自定义款`,
        brand: "手动录入",
        channel: "待核验",
        price: "",
        spec: "",
        fit_for: [],
        known_risks: [],
      },
    ]);
    setSelectedIds((prev) => [...prev, id]);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setError("请输入商品关键词");
      setSearchStatus(null);
      return;
    }
    setError("");
    setSearchStatus({ tone: "neutral", text: "正在搜索候选商品..." });
    setSearching(true);
    setSuite(null);
    try {
      const data = await requestJson(apiBase, `/consumer/search-products?q=${encodeURIComponent(q)}`);
      const nextProducts = (data.products || []).map((item, index) => normalizeProduct(item, index, q));
      const productsToUse = nextProducts.length ? nextProducts : buildFallbackProducts(q);
      const source = nextProducts.length ? data.source || "rules" : "local-fallback";
      setSearchResult({ ...data, source, products: productsToUse });
      setEditableProducts(productsToUse);
      setSelectedIds(productsToUse.slice(0, 3).map((item) => item.id));
      setSearchStatus({
        tone: source === "local-fallback" ? "warning" : "success",
        text: source === "local-fallback"
          ? "服务未返回候选结果，已切换为本地候选商品。"
          : `已找到 ${productsToUse.length} 个候选商品。`,
      });
    } catch (e) {
      const fallbackProducts = buildFallbackProducts(q);
      setSearchResult({ query: q, source: "local-fallback", products: fallbackProducts });
      setEditableProducts(fallbackProducts);
      setSelectedIds(fallbackProducts.slice(0, 3).map((item) => item.id));
      setSearchStatus({
        tone: "warning",
        text: "搜索服务暂不可用，已切换为本地候选商品。",
      });
      setError("");
    } finally {
      setSearching(false);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    runSearch();
  };

  const runFullSuite = async () => {
    if (!query.trim()) {
      setError("请先输入商品关键词");
      return;
    }
    if (!selectedProducts.length) {
      setError("请至少选择一个候选商品");
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
      const data = await requestJson(apiBase, "/consumer/full-suite", {
        method: "POST",
        body: payload,
      });
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
          <p>把直播话术、弹幕反馈和候选商品放在同一张审查桌上，先核验风险，再决定是否购买。</p>
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
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="如：护肤精华、家用取暖器"
            />
          </label>
          <label className="sg-ui-field">
            <span>预算</span>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="如：300 元以内"
            />
          </label>
          <label className="sg-ui-field">
            <span>核心需求</span>
            <input
              value={need}
              onChange={(e) => setNeed(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="如：敏感肌、低噪音、送父母"
            />
          </label>
          <div className="sg-advisor-actions">
            <button className="sg-ui-button is-secondary" onClick={runSearch} disabled={searching} type="button">
              {searching ? "搜索中..." : "搜索商品"}
            </button>
            <button className="sg-ui-button is-primary" onClick={runFullSuite} disabled={analyzing} type="button">
              {analyzing ? "分析中..." : "生成建议"}
            </button>
          </div>
          {!!searchStatus && (
            <StatusBadge tone={searchStatus.tone} className="sg-advisor-search-status">
              {searchStatus.text}
            </StatusBadge>
          )}
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
            <div className="sg-ui-panel-actions">
              <span
                className={`sg-ui-status ${
                  searchResult?.source === "llm"
                    ? "is-warning"
                    : searchResult?.source === "local-fallback"
                      ? "is-warning"
                      : "is-neutral"
                }`}
              >
                <i />
                {searchResult?.source === "llm"
                  ? "AI 补全"
                  : searchResult?.source === "local-fallback"
                    ? "离线候选"
                    : "预置候选"}
              </span>
              <button className="sg-ui-button is-secondary" type="button" onClick={addCustomProduct}>
                添加自定义商品
              </button>
            </div>
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

                  <div className="sg-advisor-product-editor">
                    <label className="sg-advisor-product-field">
                      <span>商品名</span>
                      <input value={p.name || ""} onChange={(e) => updateProduct(p.id, "name", e.target.value)} />
                    </label>
                    <div className="sg-advisor-product-row">
                      <label className="sg-advisor-product-field">
                        <span>品牌</span>
                        <input value={p.brand || ""} onChange={(e) => updateProduct(p.id, "brand", e.target.value)} />
                      </label>
                      <label className="sg-advisor-product-field">
                        <span>渠道</span>
                        <input value={p.channel || ""} onChange={(e) => updateProduct(p.id, "channel", e.target.value)} />
                      </label>
                    </div>
                    <div className="sg-advisor-product-row">
                      <label className="sg-advisor-product-field">
                        <span>价格</span>
                        <input value={p.price || ""} onChange={(e) => updateProduct(p.id, "price", e.target.value)} placeholder="如：199 元" />
                      </label>
                      <label className="sg-advisor-product-field">
                        <span>规格</span>
                        <input value={p.spec || ""} onChange={(e) => updateProduct(p.id, "spec", e.target.value)} placeholder="如：50ml / 单件装" />
                      </label>
                    </div>
                    <label className="sg-advisor-product-field">
                      <span>适配人群</span>
                      <textarea
                        value={(p.fit_for || []).join("，")}
                        onChange={(e) => updateProduct(p.id, "fit_for", e.target.value)}
                        placeholder="多个标签用逗号分隔"
                      />
                    </label>
                    <label className="sg-advisor-product-field">
                      <span>已知风险</span>
                      <textarea
                        value={(p.known_risks || []).join("，")}
                        onChange={(e) => updateProduct(p.id, "known_risks", e.target.value)}
                        placeholder="多个风险点用逗号分隔"
                      />
                    </label>
                  </div>

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
          <span>先搜索商品，再把候选商品和直播证据一起送入分析。</span>
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
