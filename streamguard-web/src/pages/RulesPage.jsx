import { useEffect, useMemo, useState } from "react";
import { CASES, RULES, SAFE_REWRITE_TEMPLATES, getRuleProfile } from "../data/complianceRules";

const RISK_META = {
  high: { label: "高风险", tone: "is-danger", short: "P1" },
  medium: { label: "中风险", tone: "is-warning", short: "P2" },
  low: { label: "低风险", tone: "is-success", short: "P3" },
};

const GRAPH_NODE_META = {
  rule: { label: "规则", tone: "rule" },
  related_rule: { label: "关联规则", tone: "related" },
  claim: { label: "主张类型", tone: "claim" },
  evidence: { label: "证据", tone: "evidence" },
  risk: { label: "风险等级", tone: "risk" },
  rewrite: { label: "安全改写", tone: "rewrite" },
  case: { label: "案例", tone: "case" },
};

const COLUMN_X = {
  left: 88,
  core: 350,
  evidence: 612,
  action: 876,
};

const MOBILE_LANES = [
  { id: "rules", system: "RULE", label: "规则层", kinds: ["rule", "related_rule"] },
  { id: "claims", system: "CLAIM", label: "主张层", kinds: ["claim"] },
  { id: "evidence", system: "EVIDENCE", label: "证据层", kinds: ["evidence"] },
  { id: "action", system: "ACTION", label: "处置层", kinds: ["risk", "rewrite", "case"] },
];

const RULE_LABELS = [
  ["ABS", "绝对化承诺"],
  ["DISCLOSE", "信息披露"],
  ["DATA", "数据佐证"],
  ["PATENT", "专利与资质"],
  ["DISPARAGE", "贬损竞品"],
  ["IDENTIFY", "广告识别"],
  ["MEDICAL", "医疗功效"],
  ["NONMED", "非医疗商品疗效暗示"],
  ["HEALTHFOOD", "保健食品边界"],
  ["PRICE", "价格与优惠"],
  ["LIMITED", "限时限量"],
  ["REFUND", "退款与售后"],
  ["MINOR", "未成年人保护"],
  ["PRIVACY", "个人信息"],
];

export default function RulesPage() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(RULES[0]?.id ?? "");
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [rulesListOpen, setRulesListOpen] = useState(false);

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

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enrichedRules.filter((rule) => {
      const riskMatched = riskFilter === "all" || rule.risk === riskFilter;
      const searchText = [
        rule.id,
        rule.displayTitle,
        rule.displayCategory,
        rule.law,
        ...(rule.keywords || []),
        ...(rule.profile?.claimTypes || []),
        ...(rule.profile?.requiredEvidence || []),
      ]
        .join(" ")
        .toLowerCase();
      return riskMatched && (!query || searchText.includes(query));
    });
  }, [enrichedRules, riskFilter, search]);

  const selectedRule = useMemo(
    () => enrichedRules.find((rule) => rule.id === selectedId) || filteredRules[0] || enrichedRules[0],
    [enrichedRules, filteredRules, selectedId],
  );

  useEffect(() => {
    if (selectedRule) {
      setSelectedId(selectedRule.id);
      setFocusNodeId(`rule:${selectedRule.id}`);
    }
  }, [selectedRule?.id]);

  const graphModel = useMemo(
    () => (selectedRule ? buildKnowledgeGraph(selectedRule, enrichedRules) : { nodes: [], edges: [], metrics: {} }),
    [selectedRule, enrichedRules],
  );

  const focusedNode = useMemo(
    () => graphModel.nodes.find((node) => node.id === focusNodeId) || graphModel.nodes[0] || null,
    [graphModel, focusNodeId],
  );

  const displayedRules = useMemo(() => {
    if (rulesListOpen) return filteredRules;
    const activeRule = filteredRules.find((rule) => rule.id === selectedRule?.id);
    const leadingRules = filteredRules.filter((rule) => rule.id !== activeRule?.id).slice(0, activeRule ? 3 : 4);
    return activeRule ? [activeRule, ...leadingRules] : leadingRules;
  }, [filteredRules, rulesListOpen, selectedRule?.id]);

  const hiddenRuleCount = Math.max(filteredRules.length - displayedRules.length, 0);

  const stats = useMemo(() => {
    const caseCount = new Set(RULES.flatMap((rule) => rule.caseIds || [])).size;
    const claimTypes = new Set(enrichedRules.flatMap((rule) => rule.profile?.claimTypes || [])).size;
    const evidenceCount = new Set(enrichedRules.flatMap((rule) => rule.profile?.requiredEvidence || [])).size;
    return {
      rules: RULES.length,
      cases: caseCount,
      claimTypes,
      evidenceCount,
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
      <header className="sg-rules-command">
        <div className="sg-rules-command-copy">
          <div className="sg-ui-eyebrow">KNOWLEDGE GRAPH</div>
          <h1>规则知识图谱工作台</h1>
        </div>
        <div className="sg-rules-command-stats" aria-label="图谱摘要">
          <span>{stats.rules} 规则</span>
          <span>{stats.evidenceCount} 证据</span>
          <span>{stats.claimTypes} 主张</span>
          <span>{stats.cases} 案例</span>
        </div>
      </header>

      <div className="sg-rules-shell">
        <aside className="sg-rules-rail">
          <section className="sg-rules-filter">
            <header className="sg-rules-section-head">
              <div>
                <div className="sg-ui-eyebrow">FILTER</div>
                <h2>图谱入口</h2>
              </div>
            </header>
            <div className="sg-rules-filter-body">
              <label className="sg-ui-field">
                <span>检索规则 / 主张 / 证据</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="例如：价格、限时、功效、退款"
                />
              </label>
              <div className="sg-rules-risk-tabs" role="toolbar" aria-label="风险筛选">
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

          <div className="sg-rules-active-strip">
            <span>当前规则</span>
            <strong>{selectedRule.displayTitle}</strong>
            <small>{selectedRule.id}</small>
          </div>

          <section className={`sg-rules-list-panel ${rulesListOpen ? "is-open" : "is-collapsed"}`}>
            <header className="sg-rules-list-head">
              <div>
                <div className="sg-ui-eyebrow">RULE HITS</div>
                <h2>命中 {filteredRules.length}</h2>
              </div>
              <button
                className="sg-rules-collapse"
                type="button"
                aria-expanded={rulesListOpen}
                aria-controls="rules-hit-list"
                onClick={() => setRulesListOpen((open) => !open)}
              >
                {rulesListOpen ? "收起" : "展开"}
              </button>
            </header>

            <div id="rules-hit-list" className="sg-rules-list" aria-label="规则列表">
              {displayedRules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  selected={selectedRule.id === rule.id}
                  onSelect={() => {
                    setSelectedId(rule.id);
                    setFocusNodeId(`rule:${rule.id}`);
                  }}
                />
              ))}
              {filteredRules.length === 0 && <div className="sg-rules-empty">没有匹配的规则</div>}
            </div>

            {!rulesListOpen && hiddenRuleCount > 0 && (
              <button className="sg-rules-more" type="button" onClick={() => setRulesListOpen(true)}>
                还有 {hiddenRuleCount} 条，展开查看
              </button>
            )}
          </section>
        </aside>

        <main className="sg-rules-stage">
          <GraphOverview rule={selectedRule} metrics={graphModel.metrics} />
          <KnowledgeGraphCanvas
            rule={selectedRule}
            graph={graphModel}
            focusNodeId={focusNodeId}
            onFocusNode={setFocusNodeId}
          />
        </main>

        <aside className="sg-rules-evidence">
          <section className="sg-rules-evidence-sheet">
            <FocusInspector node={focusedNode} />
            <EvidencePanel rule={selectedRule} />
            <RewriteWorkbench rule={selectedRule} />
            <CasePanel rule={selectedRule} />
          </section>
        </aside>
      </div>
    </section>
  );
}

function GraphOverview({ rule, metrics }) {
  return (
    <section className="sg-rules-overview">
      <div className="sg-rules-overview-main">
        <div>
          <div className="sg-ui-eyebrow">ACTIVE RULE</div>
          <h2>{rule.displayTitle}</h2>
        </div>
        <div className="sg-rules-overview-tags">
          <span className="sg-rules-chip">{rule.id}</span>
          <span className={`sg-ui-status ${RISK_META[rule.risk]?.tone || "is-warning"}`}>
            <i />
            {formatRiskLevel(rule.profile?.riskLevel)}
          </span>
        </div>
      </div>
      <div className="sg-rules-overview-stats" aria-label="当前图谱摘要">
        <span>{metrics.relatedRules || 0} 关联</span>
        <span>{metrics.claims || 0} 主张</span>
        <span>{metrics.evidence || 0} 证据</span>
        <span>{metrics.cases || 0} 案例</span>
      </div>
    </section>
  );
}

function RuleRow({ rule, selected, onSelect }) {
  const risk = RISK_META[rule.risk] || RISK_META.medium;
  const claims = rule.profile?.claimTypes || [];
  return (
    <button
      className={`sg-rules-row ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      type="button"
      aria-pressed={selected}
    >
      <div className="sg-rules-row-head">
        <strong>{rule.displayTitle}</strong>
        <span className={`sg-ui-status ${risk.tone}`}>
          <i />
          {risk.short}
        </span>
      </div>
      <div className="sg-rules-row-meta">
        <span className="mono">{rule.id}</span>
        <span>{claims.slice(0, 2).join(" / ") || "待识别主张"}</span>
      </div>
    </button>
  );
}

function KnowledgeGraphCanvas({ rule, graph, focusNodeId, onFocusNode }) {
  const width = 980;
  const height = 520;
  const mobileGroups = MOBILE_LANES.map((lane) => ({
    ...lane,
    nodes: graph.nodes.filter((node) => lane.kinds.includes(node.kind)),
  })).filter((lane) => lane.nodes.length > 0);

  return (
    <section className="sg-rules-graph-panel">
      <header className="sg-rules-graph-head">
        <div>
          <div className="sg-ui-eyebrow">GRAPH STAGE</div>
          <h2>关系图谱</h2>
        </div>
        <div className="sg-rules-graph-note">
          <span>中心规则</span>
          <strong>{rule.id}</strong>
        </div>
      </header>

      <p id="rules-graph-guide" className="sg-rules-graph-guide">
        图谱节点支持点击和键盘操作，按 <span className="mono">Tab</span> 聚焦，按 <span className="mono">Enter</span> 或{" "}
        <span className="mono">Space</span> 切换右侧说明。
      </p>

      <div className="sg-rules-graph-desktop">
        <div className="sg-rules-graph-canvas">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height="100%"
            role="img"
            aria-describedby="rules-graph-guide"
            aria-label={`${rule.displayTitle} 的关系图谱`}
          >
            <defs>
              {Object.keys(GRAPH_NODE_META).map((key) => (
                <marker key={key} id={`arrow-${key}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <polygon points="0 0, 8 4, 0 8" className={`sg-rules-arrow sg-rules-arrow-${key}`} />
                </marker>
              ))}
            </defs>

            {[
              { x: 28, y: 28, w: 170, h: height - 56, label: "RULE" },
              { x: 252, y: 28, w: 196, h: height - 56, label: "CLAIM" },
              { x: 520, y: 28, w: 196, h: height - 56, label: "EVIDENCE" },
              { x: 788, y: 28, w: 164, h: height - 56, label: "ACTION" },
            ].map((lane) => (
              <g key={lane.label}>
                <rect x={lane.x} y={lane.y} width={lane.w} height={lane.h} className="sg-rules-lane" rx="12" />
                <text x={lane.x + 16} y={lane.y + 20} className="sg-rules-lane-label">
                  {lane.label}
                </text>
              </g>
            ))}

            {graph.edges.map((edge) => {
              const from = graph.nodes.find((node) => node.id === edge.source);
              const to = graph.nodes.find((node) => node.id === edge.target);
              if (!from || !to) return null;
              return (
                <path
                  key={`${edge.source}-${edge.target}`}
                  d={edgePath(from, to)}
                  className={`sg-rules-edge is-${edge.kind}`}
                  markerEnd={`url(#arrow-${to.kind})`}
                />
              );
            })}

            {graph.nodes.map((node) => {
              const active = node.id === focusNodeId;
              const activate = () => onFocusNode(node.id);
              return (
                <g
                  key={node.id}
                  onClick={activate}
                  onKeyDown={activateOnKeyDown(activate)}
                  className={`sg-rules-graph-node ${active ? "is-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={nodeAriaLabel(node, active)}
                  aria-pressed={active}
                >
                  <title>{nodeAriaLabel(node, active)}</title>
                  <rect
                    x={node.x - node.w / 2}
                    y={node.y - node.h / 2}
                    width={node.w}
                    height={node.h}
                    rx="12"
                    className={`sg-rules-node-card is-${node.kind} ${active ? "is-active" : ""}`}
                  />
                  <text x={node.x - node.w / 2 + 14} y={node.y - 14} className="sg-rules-node-kicker">
                    {GRAPH_NODE_META[node.kind]?.label || "节点"}
                  </text>
                  <text x={node.x - node.w / 2 + 14} y={node.y + 4} className="sg-rules-node-title">
                    {truncateText(node.title, node.kind === "rewrite" ? 34 : 20)}
                  </text>
                  {node.meta && (
                    <text x={node.x - node.w / 2 + 14} y={node.y + 22} className="sg-rules-node-meta">
                      {truncateText(node.meta, node.kind === "rewrite" ? 32 : 18)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="sg-rules-graph-mobile" aria-label={`${rule.displayTitle} 的移动图谱`}>
        {mobileGroups.map((lane) => (
          <section key={lane.id} className="sg-rules-mobile-lane">
            <div className="sg-rules-mobile-lane-head">
              <div>
                <div className="sg-ui-eyebrow">{lane.system}</div>
                <h3>{lane.label}</h3>
              </div>
              <span className="sg-rules-chip">{lane.nodes.length} 节点</span>
            </div>
            <div className="sg-rules-mobile-flow">
              {lane.nodes.map((node) => {
                const active = node.id === focusNodeId;
                return (
                  <button
                    key={node.id}
                    className={`sg-rules-mobile-node is-${node.kind} ${active ? "is-active" : ""}`}
                    onClick={() => onFocusNode(node.id)}
                    type="button"
                    aria-pressed={active}
                  >
                    <div className="sg-rules-mobile-node-head">
                      <span className="sg-rules-mobile-node-kicker">{GRAPH_NODE_META[node.kind]?.label || "节点"}</span>
                      <span className={`sg-rules-node-pill is-${node.kind}`}>{active ? "当前焦点" : "可切换"}</span>
                    </div>
                    <strong>{node.title}</strong>
                    {node.meta && <small>{node.meta}</small>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function FocusInspector({ node }) {
  if (!node) {
    return (
      <section className="sg-rules-focus">
        <div className="sg-rules-empty">等待节点焦点</div>
      </section>
    );
  }

  return (
    <section className="sg-rules-focus">
      <header className="sg-rules-detail-head">
        <div>
          <div className="sg-ui-eyebrow">NODE FOCUS</div>
          <h2>{node.title}</h2>
        </div>
        <span className={`sg-rules-node-pill is-${node.kind}`}>{GRAPH_NODE_META[node.kind]?.label || "节点"}</span>
      </header>
      <div className="sg-rules-focus-body-wrap">
        <div className="sg-rules-focus-body">
          {node.meta && <strong>{node.meta}</strong>}
          <p>{node.body}</p>
        </div>
      </div>
    </section>
  );
}

function EvidencePanel({ rule }) {
  const evidence = rule.profile?.requiredEvidence || [];
  const visibleEvidence = evidence.slice(0, 3);
  return (
    <section className="sg-rules-detail-block">
      <header className="sg-rules-detail-head">
        <div>
          <div className="sg-ui-eyebrow">EVIDENCE</div>
          <h2>证据要求</h2>
        </div>
      </header>
      <div className="sg-rules-stack">
        {visibleEvidence.map((item, index) => (
          <article key={item} className="sg-rules-stack-item">
            <strong>{String(index + 1).padStart(2, "0")}</strong>
            <div>
              <p>{item}</p>
            </div>
          </article>
        ))}
        {evidence.length > visibleEvidence.length && <div className="sg-rules-inline-note">+{evidence.length - visibleEvidence.length} 条证据</div>}
        {evidence.length === 0 && <div className="sg-rules-empty">暂无证据要求</div>}
      </div>
    </section>
  );
}

function RewriteWorkbench({ rule }) {
  const profile = rule.profile || {};
  const templates = (profile.claimTypes || [])
    .map((claimType) => normalizeRewriteTemplate(SAFE_REWRITE_TEMPLATES[claimType]))
    .filter(Boolean);
  return (
    <section className="sg-rules-detail-block">
      <header className="sg-rules-detail-head">
        <div>
          <div className="sg-ui-eyebrow">REWRITE</div>
          <h2>安全改写</h2>
        </div>
      </header>
      <div className="sg-rules-rewrite-list">
        {templates.length === 0 && (
          <p>暂无模板，改成可验证、有限定的表达。</p>
        )}
        {templates.slice(0, 1).map((template, index) => (
          <article key={index}>
            <strong>建议</strong>
            <p>{template}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CasePanel({ rule }) {
  const cases = (rule.caseIds || []).map((caseId) => CASES[caseId]).filter(Boolean);
  return (
    <section className="sg-rules-detail-block">
      <header className="sg-rules-detail-head">
        <div>
          <div className="sg-ui-eyebrow">CASE ANCHOR</div>
          <h2>关联案例</h2>
        </div>
      </header>
      <div className="sg-rules-case-list">
        {cases.length === 0 && <div className="sg-rules-empty">暂无关联案例</div>}
        {cases.slice(0, 2).map((item, index) => (
          <article key={index}>
            <strong>{item.title || `案例 ${index + 1}`}</strong>
          </article>
        ))}
        {cases.length > 2 && <div className="sg-rules-inline-note">+{cases.length - 2} 个案例</div>}
      </div>
    </section>
  );
}

function RiskButton({ active, tone = "is-neutral", onClick, children }) {
  return (
    <button className={`sg-rules-risk ${tone} ${active ? "is-active" : ""}`} onClick={onClick} type="button" aria-pressed={active}>
      {children}
    </button>
  );
}

function buildKnowledgeGraph(rule, allRules) {
  const profile = rule.profile || {};
  const claimTypes = profile.claimTypes || [];
  const evidence = profile.requiredEvidence || [];
  const cases = (rule.caseIds || []).map((caseId) => CASES[caseId]).filter(Boolean).slice(0, 2);
  const relatedRules = allRules
    .filter((candidate) => candidate.id !== rule.id)
    .map((candidate) => {
      const sharedClaims = overlapCount(claimTypes, candidate.profile?.claimTypes || []);
      const sharedEvidence = overlapCount(evidence, candidate.profile?.requiredEvidence || []);
      return { candidate, weight: sharedClaims * 2 + sharedEvidence };
    })
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((item) => item.candidate);

  const graphNodes = [];
  const graphEdges = [];

  graphNodes.push(
    makeNode({
      id: `rule:${rule.id}`,
      kind: "rule",
      title: rule.displayTitle,
      meta: `${rule.id} / ${rule.displayCategory}`,
      body: `${formatRiskLevel(profile.riskLevel)}，当前图谱围绕这条规则展开。`,
      hint: "点击或聚焦任意节点，右侧会切换成对应说明。",
      x: COLUMN_X.left,
      y: 270,
      w: 180,
      h: 92,
    }),
  );

  relatedRules.forEach((relatedRule, index) => {
    const y = 120 + index * 110;
    graphNodes.push(
      makeNode({
        id: `related:${relatedRule.id}`,
        kind: "related_rule",
        title: relatedRule.displayTitle,
        meta: relatedRule.id,
        body: `与当前规则共享 ${overlapCount(claimTypes, relatedRule.profile?.claimTypes || [])} 个主张锚点和 ${overlapCount(evidence, relatedRule.profile?.requiredEvidence || [])} 个证据锚点。`,
        x: COLUMN_X.left,
        y,
        w: 180,
        h: 72,
      }),
    );
    graphEdges.push({ source: `related:${relatedRule.id}`, target: `rule:${rule.id}`, kind: "related" });
  });

  claimTypes.forEach((claimType, index) => {
    const y = laneY(index, claimTypes.length, 270, 100);
    graphNodes.push(
      makeNode({
        id: `claim:${claimType}`,
        kind: "claim",
        title: humanizeClaimType(claimType),
        meta: "主张类型",
        body: `系统把这条规则归入“${humanizeClaimType(claimType)}”主张，需要后续证据和处置动作跟进。`,
        x: COLUMN_X.core,
        y,
        w: 194,
        h: 70,
      }),
    );
    graphEdges.push({ source: `rule:${rule.id}`, target: `claim:${claimType}`, kind: "claim" });
  });

  evidence.slice(0, 4).forEach((item, index) => {
    const y = laneY(index, Math.min(evidence.length, 4), 270, 100);
    graphNodes.push(
      makeNode({
        id: `evidence:${item}`,
        kind: "evidence",
        title: item,
        meta: "待补证据",
        body: `如果没有“${item}”，这条规则对应的审查判断就不够稳。`,
        x: COLUMN_X.evidence,
        y,
        w: 194,
        h: 74,
      }),
    );
    const claimSource = claimTypes[index % Math.max(claimTypes.length, 1)];
    graphEdges.push({
      source: claimSource ? `claim:${claimSource}` : `rule:${rule.id}`,
      target: `evidence:${item}`,
      kind: "evidence",
    });
  });

  graphNodes.push(
    makeNode({
      id: `risk:${profile.riskLevel || "P2"}`,
      kind: "risk",
      title: formatRiskLevel(profile.riskLevel),
      meta: "处置优先级",
      body: `当前建议处置等级为 ${formatRiskLevel(profile.riskLevel)}。`,
      x: COLUMN_X.action,
      y: 118,
      w: 146,
      h: 72,
    }),
  );
  graphEdges.push({ source: `rule:${rule.id}`, target: `risk:${profile.riskLevel || "P2"}`, kind: "risk" });

  graphNodes.push(
    makeNode({
      id: `rewrite:${rule.id}`,
      kind: "rewrite",
      title: normalizeRewriteTemplate(profile.safeRewrite || SAFE_REWRITE_TEMPLATES[claimTypes[0]] || ""),
      meta: "建议话术",
      body: "风险表达需要被改写成可验证、有限定条件、不过度承诺的版本。",
      x: COLUMN_X.action,
      y: 270,
      w: 146,
      h: 120,
    }),
  );
  graphEdges.push({ source: `risk:${profile.riskLevel || "P2"}`, target: `rewrite:${rule.id}`, kind: "rewrite" });

  cases.forEach((item, index) => {
    const y = 404 + index * 86;
    graphNodes.push(
      makeNode({
        id: `case:${index}`,
        kind: "case",
        title: item.title || `案例 ${index + 1}`,
        meta: item.riskType || "案例锚点",
        body: "案例用于帮助审查员把抽象规则落到真实处置语境里。",
        x: COLUMN_X.action,
        y,
        w: 146,
        h: 72,
      }),
    );
    graphEdges.push({ source: `rule:${rule.id}`, target: `case:${index}`, kind: "case" });
  });

  return {
    nodes: graphNodes,
    edges: graphEdges,
    metrics: {
      relatedRules: relatedRules.length,
      claims: claimTypes.length,
      evidence: Math.min(evidence.length, 4),
      cases: cases.length,
    },
  };
}

function makeNode(node) {
  return node;
}

function edgePath(from, to) {
  const startX = from.x + from.w / 2 - 8;
  const endX = to.x - to.w / 2 + 8;
  const dx = endX - startX;
  const curve = Math.max(40, dx * 0.35);
  return `M ${startX} ${from.y} C ${startX + curve} ${from.y}, ${endX - curve} ${to.y}, ${endX} ${to.y}`;
}

function laneY(index, total, center, gap) {
  if (total <= 1) return center;
  const offset = (index - (total - 1) / 2) * gap;
  return center + offset;
}

function overlapCount(base, target) {
  const targetSet = new Set(target);
  return base.filter((item) => targetSet.has(item)).length;
}

function humanizeClaimType(type) {
  const mapping = {
    efficacy_claim: "功效主张",
    qualification_claim: "资质主张",
    quality_claim: "品质主张",
    price_claim: "价格主张",
    urgency_claim: "促销主张",
    guarantee_claim: "售后主张",
    chat_signal: "弹幕信号",
  };
  return mapping[type] || type;
}

function normalizeRewriteTemplate(template) {
  if (!template) return "先给出证据，再收窄承诺边界。";
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.filter(Boolean).join(" / ");
  if (typeof template === "object") {
    const parts = [];
    if (template.risky) parts.push(`风险表达：${template.risky}`);
    if (template.safe) parts.push(`安全改写：${template.safe}`);
    return parts.join(" / ");
  }
  return String(template);
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

function truncateText(text, max) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function activateOnKeyDown(handler) {
  return (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
}

function nodeAriaLabel(node, active) {
  const label = GRAPH_NODE_META[node.kind]?.label || "节点";
  return `${label}：${node.title}${node.meta ? `，${node.meta}` : ""}${active ? "，当前焦点" : ""}`;
}
