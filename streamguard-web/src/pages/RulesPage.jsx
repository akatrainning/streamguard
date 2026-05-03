import { useMemo, useState } from "react";
import { CASES, RULES, SAFE_REWRITE_TEMPLATES, getRuleProfile } from "../data/complianceRules";

const RISK_META = {
  high: { label: "高风险", tone: "is-danger" },
  medium: { label: "中风险", tone: "is-warning" },
  low: { label: "低风险", tone: "is-success" },
};

const RULE_LABELS = [
  ["ABS", "绝对化承诺"],
  ["DISCLOSE", "信息披露"],
  ["DATA", "数据佐证"],
  ["PATENT", "专利与资质"],
  ["DISPARAGE", "贬损竞品"],
  ["IDENTIFY", "广告识别"],
  ["MEDICAL", "医疗功效"],
  ["NONMED", "非医疗商品暗示疗效"],
  ["HEALTHFOOD", "保健食品边界"],
  ["PRICE", "价格与优惠"],
  ["LIMITED", "限时限量"],
  ["REFUND", "退换与售后"],
  ["MINOR", "未成年人保护"],
  ["PRIVACY", "个人信息"],
];

const REVIEW_STEPS = ["识别 claim", "绑定证据", "判定风险", "改写话术"];

export default function RulesPage() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(RULES[0]?.id ?? "");

  const enrichedRules = useMemo(
    () =>
      RULES.map((rule) => {
        const profile = getRuleProfile(rule);
        return {
          ...rule,
          profile,
          displayTitle: readableRuleTitle(rule),
          displayCategory: readableCategory(rule),
        };
      }),
    [],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enrichedRules.filter((rule) => {
      const riskMatched = riskFilter === "all" || rule.risk === riskFilter;
      const searchText = [
        rule.id,
        rule.displayTitle,
        rule.displayCategory,
        rule.profile?.riskLevel,
        ...(rule.profile?.claimTypes || []),
        ...(rule.profile?.requiredEvidence || []),
      ]
        .join(" ")
        .toLowerCase();
      return riskMatched && (!query || searchText.includes(query));
    });
  }, [enrichedRules, riskFilter, search]);

  const selectedRule = useMemo(
    () => enrichedRules.find((rule) => rule.id === selectedId) || filtered[0] || enrichedRules[0],
    [enrichedRules, filtered, selectedId],
  );

  const stats = useMemo(() => {
    const caseCount = new Set(RULES.flatMap((rule) => rule.caseIds || [])).size;
    const claimTypes = new Set(enrichedRules.flatMap((rule) => rule.profile?.claimTypes || [])).size;
    return {
      rules: RULES.length,
      cases: caseCount,
      claimTypes,
      rewrites: Object.keys(SAFE_REWRITE_TEMPLATES).length,
    };
  }, [enrichedRules]);

  if (!selectedRule) {
    return (
      <section className="sg-rules-page">
        <div className="sg-rules-empty">暂无规则数据</div>
      </section>
    );
  }

  return (
    <section className="sg-rules-page">
      <header className="sg-rules-hero">
        <div>
          <div className="sg-ui-eyebrow">Compliance Library</div>
          <h1>直播合规规则库</h1>
          <p>把法规、风险类型、证据要求和安全改写收束成一套审查路径，减少主观判断漂移。</p>
        </div>
        <div className="sg-rules-stats">
          <Metric label="规则" value={stats.rules} />
          <Metric label="案例" value={stats.cases} />
          <Metric label="Claim 类型" value={stats.claimTypes} />
          <Metric label="改写模板" value={stats.rewrites} accent />
        </div>
      </header>

      <section className="sg-rules-flow">
        {REVIEW_STEPS.map((step, index) => (
          <span key={step}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            {step}
          </span>
        ))}
      </section>

      <div className="sg-rules-layout">
        <section className="sg-rules-list-zone">
          <section className="sg-ui-panel sg-rules-filter">
            <div className="sg-ui-panel-body">
              <label className="sg-ui-field">
                <span>搜索规则</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="输入规则编号、风险类型或 claim"
                />
              </label>
              <div className="sg-rules-risk-tabs">
                <RiskButton active={riskFilter === "all"} onClick={() => setRiskFilter("all")}>
                  全部风险
                </RiskButton>
                {Object.entries(RISK_META).map(([key, meta]) => (
                  <RiskButton key={key} active={riskFilter === key} tone={meta.tone} onClick={() => setRiskFilter(key)}>
                    {meta.label}
                  </RiskButton>
                ))}
              </div>
            </div>
          </section>

          <div className="sg-rules-count">
            <span>命中 {filtered.length} 条规则</span>
            <small>Rule / Claim / Evidence / Rewrite</small>
          </div>

          <section className="sg-rules-grid">
            {filtered.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                selected={selectedRule?.id === rule.id}
                onSelect={() => setSelectedId(rule.id)}
              />
            ))}
          </section>

          {filtered.length === 0 && <div className="sg-rules-empty">没有匹配的规则</div>}
        </section>

        <aside className="sg-rules-inspector">
          <RuleInspector rule={selectedRule} />
          <EvidenceGraph rule={selectedRule} />
          <RewriteWorkbench rule={selectedRule} />
        </aside>
      </div>
    </section>
  );
}

function RuleCard({ rule, selected, onSelect }) {
  const risk = RISK_META[rule.risk] || RISK_META.medium;
  const claims = rule.profile?.claimTypes || [];
  return (
    <button className={`sg-rules-card ${selected ? "is-selected" : ""}`} onClick={onSelect} type="button">
      <span className={`sg-ui-status ${risk.tone}`}>
        <i />
        {risk.label}
      </span>
      <h2>{rule.displayTitle}</h2>
      <p>{rule.displayCategory}</p>
      <div>
        <strong className="mono">{rule.id}</strong>
        <small>{claims.slice(0, 2).join(" / ") || "Claim 待识别"}</small>
      </div>
    </button>
  );
}

function RuleInspector({ rule }) {
  const risk = RISK_META[rule.risk] || RISK_META.medium;
  const profile = rule.profile || {};
  const cases = (rule.caseIds || []).map((caseId) => CASES[caseId]).filter(Boolean);
  return (
    <section className="sg-ui-panel sg-rules-detail">
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">Inspector</div>
          <h2>{rule.displayTitle}</h2>
        </div>
        <span className={`sg-ui-status ${risk.tone}`}>
          <i />
          {risk.label}
        </span>
      </header>
      <div className="sg-ui-panel-body">
        <InfoBlock
          title="审查重点"
          items={[
            `规则编号：${rule.id}`,
            `规则类型：${rule.displayCategory}`,
            `风险层级：${formatRiskLevel(profile.riskLevel)}`,
          ]}
        />
        <InfoBlock title="Claim 类型" items={profile.claimTypes || []} />
        <InfoBlock title="必须补足的证据" items={profile.requiredEvidence || []} danger />
        <InfoBlock title="处置建议" items={profile.suggestions || []} positive />
        <div className="sg-rules-cases">
          <h3>关联案例</h3>
          {cases.length === 0 && <p>暂无关联案例</p>}
          {cases.slice(0, 2).map((item, index) => (
            <article key={index}>
              <strong>{item.title || `案例 ${index + 1}`}</strong>
              <span>{item.riskType || "风险类型待补充"}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EvidenceGraph({ rule }) {
  const nodes = rule.profile?.graph?.nodes || [];
  return (
    <section className="sg-ui-panel">
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">Evidence Graph</div>
          <h2>证据图谱</h2>
        </div>
      </header>
      <div className="sg-rules-node-list">
        {nodes.slice(0, 7).map((node, index) => (
          <span key={`${node.id || node.label}-${index}`}>
            <b className="mono">{String(index + 1).padStart(2, "0")}</b>
            {node.label || node.id || "证据节点"}
          </span>
        ))}
        {nodes.length === 0 && <span>暂无图谱节点</span>}
      </div>
    </section>
  );
}

function RewriteWorkbench({ rule }) {
  const profile = rule.profile || {};
  const templates = (profile.claimTypes || []).map((claimType) => SAFE_REWRITE_TEMPLATES[claimType]).filter(Boolean);
  return (
    <section className="sg-ui-panel">
      <header className="sg-ui-panel-head">
        <div>
          <div className="sg-ui-eyebrow">Rewrite</div>
          <h2>安全改写</h2>
        </div>
      </header>
      <div className="sg-rules-rewrite">
        {templates.length === 0 && <p>当前规则暂无模板，可先改为“可核验证据 + 条件限制 + 不承诺结果”的表达。</p>}
        {templates.slice(0, 3).map((template, index) => (
          <p key={index}>{template}</p>
        ))}
      </div>
    </section>
  );
}

function InfoBlock({ title, items = [], danger = false, positive = false }) {
  return (
    <section className={`sg-rules-info ${danger ? "is-danger" : ""} ${positive ? "is-positive" : ""}`}>
      <h3>{title}</h3>
      {(items || []).length === 0 && <p>暂无数据</p>}
      {(items || []).slice(0, 6).map((item, index) => (
        <p key={index}>{item}</p>
      ))}
    </section>
  );
}

function RiskButton({ active, tone = "is-neutral", onClick, children }) {
  return (
    <button className={`sg-rules-risk ${tone} ${active ? "is-active" : ""}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div className={`sg-rules-metric ${accent ? "is-accent" : ""}`}>
      <strong className="mono">{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function readableRuleTitle(rule) {
  const match = RULE_LABELS.find(([key]) => rule.id?.includes(key));
  return match ? match[1] : `合规规则 ${rule.id}`;
}

function readableCategory(rule) {
  if (rule.id?.startsWith("AD")) return "直播广告与商品宣称";
  return "直播合规审查";
}

function formatRiskLevel(level) {
  if (!level) return "待识别";
  const map = { p0: "P0 立即处置", p1: "P1 高优先级", p2: "P2 观察复核", p3: "P3 记录归档" };
  return map[String(level).toLowerCase()] || String(level).toUpperCase();
}
