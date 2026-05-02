import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CASES,
  CLAIM_TYPE_META,
  LAW_GROUPS,
  RISK_CATEGORIES,
  RISK_LEVELS,
  RISK_LEVEL_META,
  RULES,
  SAFE_REWRITE_TEMPLATES,
  LIVE_RISK_TAXONOMY,
  getRuleProfile,
} from "../data/complianceRules";

const panel = {
  background: "linear-gradient(180deg, rgba(8,18,32,0.9), rgba(6,14,24,0.92))",
  border: "1px solid rgba(0,255,224,0.1)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
};

const sourceNotes = [
  "法规规则层：广告法、电子商务法、消费者权益保护法、反不正当竞争法、价格规范与个人信息保护规则。",
  "直播监管层：直播电商监督管理办法、网络直播营销管理办法、互联网广告管理办法和网络交易监管规则。",
  "知识库层：Claim 类型、证据类型、历史案例、安全改写模板和 P0-P3 风险处置策略。",
];

export default function RulesPage() {
  const [search, setSearch] = useState("");
  const [lawFilter, setLawFilter] = useState("全部");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(RULES[0]?.id ?? "");

  const enrichedRules = useMemo(() => RULES.map((rule) => ({ ...rule, profile: getRuleProfile(rule) })), []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enrichedRules.filter((rule) => {
      const lawMatched = lawFilter === "全部" || rule.law === lawFilter;
      const categoryMatched = categoryFilter === "全部" || rule.category === categoryFilter;
      const riskMatched = riskFilter === "all" || rule.risk === riskFilter;
      const searchText = [
        rule.id,
        rule.law,
        rule.article,
        rule.category,
        rule.title,
        rule.desc,
        rule.profile.riskLevel,
        ...(rule.keywords || []),
        ...(rule.patterns || []),
        ...(rule.examples || []),
        ...(rule.profile.claimTypes || []),
        ...(rule.profile.requiredEvidence || []),
        ...(rule.caseIds || []).flatMap((caseId) => {
          const item = CASES[caseId];
          return item ? [item.title, item.riskType, item.summary, item.lesson] : [];
        }),
      ].join(" ").toLowerCase();
      return lawMatched && categoryMatched && riskMatched && (!query || searchText.includes(query));
    });
  }, [categoryFilter, enrichedRules, lawFilter, riskFilter, search]);

  const selectedRule = useMemo(
    () => enrichedRules.find((rule) => rule.id === selectedId) || filtered[0] || enrichedRules[0],
    [enrichedRules, filtered, selectedId],
  );

  const stats = useMemo(() => {
    const caseCount = new Set(RULES.flatMap((rule) => rule.caseIds || [])).size;
    const graphNodes = new Set(enrichedRules.flatMap((rule) => rule.profile.graph.nodes.map((node) => node.id))).size;
    return {
      laws: LAW_GROUPS.length - 1,
      rules: RULES.length,
      cases: caseCount,
      rewrites: Object.keys(SAFE_REWRITE_TEMPLATES).length,
      graphNodes,
    };
  }, [enrichedRules]);

  return (
    <div style={{ padding: "24px", maxWidth: "1360px", margin: "0 auto" }}>
      <Hero stats={stats} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(360px, 0.95fr)", gap: "16px", alignItems: "start" }}>
        <main>
          <FilterPanel
            search={search}
            setSearch={setSearch}
            lawFilter={lawFilter}
            setLawFilter={setLawFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            riskFilter={riskFilter}
            setRiskFilter={setRiskFilter}
          />

          <TaxonomyStrip />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 10px" }}>
            <span style={{ fontSize: "12px", color: "rgba(228,240,255,0.58)" }}>
              当前命中 {filtered.length} 条规则
            </span>
            <span style={{ fontSize: "11px", color: "rgba(0,255,224,0.56)" }}>
              Rule / ClaimType / Evidence / RiskLevel / Suggestion
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            {filtered.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={index}
                selected={selectedRule?.id === rule.id}
                onSelect={() => setSelectedId(rule.id)}
              />
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ ...panel, borderRadius: "12px", padding: "52px", textAlign: "center", color: "rgba(228,240,255,0.36)", fontSize: "13px" }}>
              没有找到匹配的规则
            </div>
          )}
        </main>

        <aside style={{ position: "sticky", top: "18px", display: "grid", gap: "12px" }}>
          <RuleInspector rule={selectedRule} />
          <KnowledgeGraph rule={selectedRule} />
          <RewriteWorkbench rule={selectedRule} />
        </aside>
      </div>
    </div>
  );
}

function Hero({ stats }) {
  return (
    <header style={{ ...panel, borderRadius: "16px", padding: "18px", marginBottom: "16px", overflow: "hidden", position: "relative" }}>
      <div style={{
        position: "absolute",
        inset: "0 0 auto auto",
        width: "360px",
        height: "160px",
        background: "radial-gradient(circle at 70% 20%, rgba(0,255,224,0.18), transparent 55%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 520px", gap: "18px", alignItems: "center", position: "relative" }}>
        <section>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "10px", color: "#00ffe0", border: "1px solid rgba(0,255,224,0.24)", background: "rgba(0,255,224,0.08)", borderRadius: "999px", padding: "5px 9px", fontWeight: 700 }}>
              风险知识库
            </span>
            <span style={{ fontSize: "10px", color: "rgba(228,240,255,0.48)" }}>
              规则库 / 图谱关系 / 历史案例 / 安全改写
            </span>
          </div>
          <h1 style={{ margin: 0, color: "#00ffe0", fontSize: "24px", lineHeight: 1.25, fontWeight: 850 }}>
            直播合规规则图谱与风险知识库
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: "12px", color: "rgba(228,240,255,0.66)", lineHeight: 1.75, maxWidth: "760px" }}>
            将法规、平台规范和典型处罚案例抽象为可检索的 Claim 规则。每条规则都能说明触发词、所需证据、反证条件、P0-P3 风险等级、整改建议与安全改写，支撑后续 Claim-RAG 和 Evidence-RAG 审计链路。
          </p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" }}>
          <Metric label="法规来源" value={stats.laws} />
          <Metric label="规则条目" value={stats.rules} />
          <Metric label="图谱节点" value={stats.graphNodes} />
          <Metric label="真实案例" value={stats.cases} />
          <Metric label="改写模板" value={stats.rewrites} accent />
        </section>
      </div>
    </header>
  );
}

function Metric({ label, value, accent = false }) {
  return (
    <div style={{
      borderRadius: "12px",
      padding: "12px 10px",
      background: accent ? "linear-gradient(180deg, rgba(255,159,67,0.14), rgba(255,159,67,0.05))" : "rgba(0,255,224,0.055)",
      border: `1px solid ${accent ? "rgba(255,159,67,0.18)" : "rgba(0,255,224,0.13)"}`,
      minWidth: 0,
    }}>
      <div style={{ fontSize: "22px", fontWeight: 850, color: accent ? "#ffb86b" : "#00ffe0", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "10px", color: "rgba(228,240,255,0.5)", marginTop: "7px" }}>{label}</div>
    </div>
  );
}

function FilterPanel(props) {
  const { search, setSearch, lawFilter, setLawFilter, categoryFilter, setCategoryFilter, riskFilter, setRiskFilter } = props;
  return (
    <section style={{ ...panel, borderRadius: "14px", padding: "13px", marginBottom: "12px" }}>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索法条、Claim、证据、关键词、案例..."
          style={{
            flex: "1 1 320px",
            minWidth: "280px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(0,255,224,0.18)",
            color: "rgba(228,240,255,0.9)",
            fontSize: "12px",
            outline: "none",
          }}
        />
        <RiskButton active={riskFilter === "all"} onClick={() => setRiskFilter("all")}>全部风险</RiskButton>
        {Object.entries(RISK_LEVELS).map(([key, meta]) => (
          <RiskButton key={key} active={riskFilter === key} color={meta.color} onClick={() => setRiskFilter(key)}>
            {meta.label}
          </RiskButton>
        ))}
      </div>

      <FilterRow label="法规来源">
        {LAW_GROUPS.map((law) => (
          <FilterChip key={law} active={lawFilter === law} count={RULES.filter((rule) => law === "全部" || rule.law === law).length} onClick={() => setLawFilter(law)}>
            {law}
          </FilterChip>
        ))}
      </FilterRow>
      <FilterRow label="风险类型">
        {["全部", ...RISK_CATEGORIES].map((category) => (
          <FilterChip key={category} active={categoryFilter === category} count={RULES.filter((rule) => category === "全部" || rule.category === category).length} onClick={() => setCategoryFilter(category)}>
            {category}
          </FilterChip>
        ))}
      </FilterRow>
    </section>
  );
}

function TaxonomyStrip() {
  return (
    <section style={{ ...panel, borderRadius: "14px", padding: "12px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", marginBottom: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "13px", color: "rgba(228,240,255,0.9)" }}>10 类风险分类体系</h2>
        <span style={{ fontSize: "10px", color: "rgba(0,255,224,0.55)" }}>面向直播审计场景</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "8px" }}>
        {LIVE_RISK_TAXONOMY.map((item) => {
          const meta = CLAIM_TYPE_META[item.claimType] || {};
          return (
            <div key={item.category} style={{
              borderRadius: "10px",
              padding: "9px",
              background: "rgba(255,255,255,0.035)",
              border: `1px solid ${(meta.color || "#00ffe0")}33`,
              minHeight: "76px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "rgba(228,240,255,0.86)", fontWeight: 750 }}>{item.category}</span>
                <span style={{ fontSize: "10px", color: meta.color || "#00ffe0", fontWeight: 800 }}>{formatRiskLevel(item.defaultLevel)}</span>
              </div>
              <div style={{ fontSize: "10px", color: "rgba(228,240,255,0.48)", marginTop: "6px", lineHeight: 1.45 }}>{item.sample}</div>
              <div style={{ fontSize: "9px", color: "rgba(0,255,224,0.52)", marginTop: "5px" }}>{meta.label || item.claimType}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RuleCard({ rule, index, selected, onSelect }) {
  const risk = RISK_LEVELS[rule.risk];
  const pMeta = RISK_LEVEL_META[rule.profile.riskLevel];
  const firstClaim = rule.profile.claimTypes[0];
  const claimMeta = CLAIM_TYPE_META[firstClaim] || {};

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.014, 0.2) }}
      style={{
        ...panel,
        display: "block",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        borderRadius: "13px",
        padding: "13px",
        color: "inherit",
        border: selected ? "1px solid rgba(0,255,224,0.42)" : "1px solid rgba(0,255,224,0.09)",
        boxShadow: selected ? "0 0 0 1px rgba(0,255,224,0.14), 0 18px 45px rgba(0,0,0,0.28)" : "0 12px 28px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", minWidth: 0 }}>
          <Tag color="#4db9ff">{rule.law}</Tag>
          <Tag>{rule.article}</Tag>
          <Tag color={claimMeta.color || "#00ffe0"}>{claimMeta.label || firstClaim}</Tag>
        </div>
        <span style={{ flex: "0 0 auto", fontSize: "10px", color: pMeta.color, border: `1px solid ${pMeta.color}44`, background: `${pMeta.color}14`, borderRadius: "999px", padding: "3px 8px", fontWeight: 800 }}>
          {formatRiskLevel(rule.profile.riskLevel)}
        </span>
      </div>
      <h3 style={{ margin: "10px 0 6px", fontSize: "13px", lineHeight: 1.45, color: "rgba(228,240,255,0.9)" }}>{rule.title}</h3>
      <p style={{ margin: 0, minHeight: "38px", fontSize: "11px", lineHeight: 1.65, color: "rgba(228,240,255,0.58)" }}>
        {rule.desc}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "10px" }}>
        {(rule.keywords || []).slice(0, 5).map((keyword) => (
          <span key={keyword} style={{ color: risk.color, background: risk.bg, border: `1px solid ${risk.color}2f`, borderRadius: "999px", padding: "3px 7px", fontSize: "10px" }}>
            {keyword}
          </span>
        ))}
      </div>
    </motion.button>
  );
}

function RuleInspector({ rule }) {
  const [open, setOpen] = useState(true);
  if (!rule) return null;
  const profile = rule.profile;
  const cases = (rule.caseIds || []).map((caseId) => CASES[caseId]).filter(Boolean);
  const pMeta = RISK_LEVEL_META[profile.riskLevel];

  return (
    <section style={{ ...panel, borderRadius: "14px", overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", border: 0, background: "transparent", color: "inherit", padding: "14px", cursor: "pointer", textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "10px", color: "rgba(0,255,224,0.62)", marginBottom: "6px" }}>当前规则画像</div>
            <h2 style={{ margin: 0, fontSize: "15px", lineHeight: 1.45, color: "rgba(228,240,255,0.92)" }}>{rule.title}</h2>
          </div>
          <span style={{ flex: "0 0 auto", color: pMeta.color, border: `1px solid ${pMeta.color}44`, background: `${pMeta.color}14`, borderRadius: "10px", padding: "7px 9px", fontSize: "13px", fontWeight: 850 }}>
            {formatRiskLevel(profile.riskLevel)}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 14px 14px" }}>
              <p style={{ margin: "0 0 12px", fontSize: "11px", lineHeight: 1.75, color: "rgba(228,240,255,0.62)" }}>{rule.desc}</p>
              <InfoBlock title="Claim 类型" items={profile.claimTypes.map((claimType) => CLAIM_TYPE_META[claimType]?.label || claimType)} />
              <InfoBlock title="触发模式" items={rule.patterns} />
              <InfoBlock title="触发词" items={rule.keywords} danger />
              <InfoBlock title="所需证据" items={profile.requiredEvidence} positive />
              <InfoBlock title="反证条件" items={profile.counterEvidence} muted />
              <div style={{ marginTop: "12px", borderRadius: "10px", padding: "10px", background: `${pMeta.color}10`, border: `1px solid ${pMeta.color}22` }}>
                <div style={{ fontSize: "10px", color: pMeta.color, fontWeight: 800 }}>风险处置</div>
                <div style={{ fontSize: "11px", color: "rgba(228,240,255,0.68)", lineHeight: 1.65, marginTop: "5px" }}>
                  {pMeta.label}，评分区间 {pMeta.range}，处置建议：{pMeta.action}。
                </div>
              </div>

              {rule.examples?.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <SectionTitle>风险话术示例</SectionTitle>
                  {rule.examples.map((example) => (
                    <LineExample key={example}>{example}</LineExample>
                  ))}
                </div>
              )}

              {cases.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <SectionTitle>关联真实案例</SectionTitle>
                  {cases.map((item) => <CaseCard key={item.title} item={item} />)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function KnowledgeGraph({ rule }) {
  if (!rule) return null;
  const profile = rule.profile;
  const nodeRows = [
    [{ label: "Rule", value: rule.title, color: "#00ffe0" }],
    profile.claimTypes.map((claimType) => ({ label: "ClaimType", value: CLAIM_TYPE_META[claimType]?.label || claimType, color: CLAIM_TYPE_META[claimType]?.color || "#4db9ff" })),
    profile.requiredEvidence.slice(0, 3).map((item) => ({ label: "Evidence", value: item, color: "#82e8b8" })),
    [{ label: "RiskLevel", value: formatRiskLevel(profile.riskLevel), color: RISK_LEVEL_META[profile.riskLevel].color }],
    [{ label: "Suggestion", value: profile.safeRewrite || "补充证据后再发布", color: "#f5c542" }],
  ];

  return (
    <section style={{ ...panel, borderRadius: "14px", padding: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "13px", color: "rgba(228,240,255,0.9)" }}>规则图谱链路</h2>
        <span style={{ color: "rgba(0,255,224,0.55)", fontSize: "10px" }}>targets / requires / leads_to</span>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        {nodeRows.map((row, rowIndex) => (
          <div key={rowIndex} style={{ position: "relative" }}>
            {rowIndex > 0 && <div style={{ height: "12px", width: "1px", background: "rgba(0,255,224,0.18)", marginLeft: "18px", marginBottom: "4px" }} />}
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
              {row.map((node) => (
                <div key={`${node.label}-${node.value}`} style={{ flex: row.length === 1 ? "1 1 100%" : "1 1 110px", minWidth: 0, borderRadius: "10px", padding: "8px 9px", background: `${node.color}10`, border: `1px solid ${node.color}33` }}>
                  <div style={{ color: node.color, fontSize: "9px", fontWeight: 800 }}>{node.label}</div>
                  <div style={{ color: "rgba(228,240,255,0.78)", fontSize: "10.5px", lineHeight: 1.55, marginTop: "4px" }}>{node.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RewriteWorkbench({ rule }) {
  if (!rule) return null;
  const profile = rule.profile;
  const templates = profile.claimTypes.map((claimType) => SAFE_REWRITE_TEMPLATES[claimType]).filter(Boolean);

  return (
    <section style={{ ...panel, borderRadius: "14px", padding: "14px" }}>
      <h2 style={{ margin: "0 0 10px", fontSize: "13px", color: "rgba(228,240,255,0.9)" }}>安全改写与审核口径</h2>
      {templates.map((template) => (
        <div key={template.risky} style={{ display: "grid", gridTemplateColumns: "1fr", gap: "6px", marginBottom: "9px" }}>
          <div style={{ borderRadius: "9px", padding: "8px", background: "rgba(255,79,123,0.07)", border: "1px solid rgba(255,79,123,0.16)" }}>
            <div style={{ fontSize: "9px", color: "#ff8aa7", fontWeight: 800 }}>风险表达</div>
            <div style={{ fontSize: "11px", color: "rgba(228,240,255,0.72)", marginTop: "4px" }}>{template.risky}</div>
          </div>
          <div style={{ borderRadius: "9px", padding: "8px", background: "rgba(34,217,139,0.07)", border: "1px solid rgba(34,217,139,0.16)" }}>
            <div style={{ fontSize: "9px", color: "#82e8b8", fontWeight: 800 }}>建议改写</div>
            <div style={{ fontSize: "11px", color: "rgba(228,240,255,0.72)", lineHeight: 1.6, marginTop: "4px" }}>{template.safe}</div>
          </div>
        </div>
      ))}

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "12px", paddingTop: "12px" }}>
        <SectionTitle>RAG 证据问答参考</SectionTitle>
        <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.7, color: "rgba(228,240,255,0.58)" }}>
          若评委追问“为什么判 {formatRiskLevel(profile.riskLevel)}”，系统可回答：该规则命中了 {profile.claimTypes.map((claimType) => CLAIM_TYPE_META[claimType]?.label || claimType).join("、")}，当前需补充 {profile.requiredEvidence.slice(0, 3).join("、")} 等证据，否则应进入 {RISK_LEVEL_META[profile.riskLevel].action}。
        </p>
      </div>
    </section>
  );
}

function formatRiskLevel(level) {
  if (!level) return "";
  return String(level)
    .split("/")
    .map((item) => {
      const meta = RISK_LEVEL_META[item];
      return meta ? `${item} ${meta.label}` : item;
    })
    .join(" / ");
}

function RiskButton({ active, color = "#00ffe0", onClick, children }) {
  return (
    <button onClick={onClick} style={{
      borderRadius: "999px",
      cursor: "pointer",
      padding: "8px 12px",
      fontSize: "11px",
      fontWeight: 750,
      background: active ? `${color}1c` : "rgba(255,255,255,0.035)",
      border: `1px solid ${active ? `${color}66` : "rgba(255,255,255,0.08)"}`,
      color: active ? color : "rgba(228,240,255,0.58)",
    }}>
      {children}
    </button>
  );
}

function FilterRow({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px", alignItems: "start", marginTop: "8px" }}>
      <span style={{ fontSize: "11px", color: "rgba(228,240,255,0.35)", paddingTop: "8px" }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{children}</div>
    </div>
  );
}

function FilterChip({ active, count, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      borderRadius: "8px",
      cursor: "pointer",
      padding: "6px 9px",
      fontSize: "11px",
      fontWeight: 700,
      background: active ? "rgba(0,150,255,0.15)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${active ? "rgba(0,150,255,0.42)" : "rgba(255,255,255,0.075)"}`,
      color: active ? "#4db9ff" : "rgba(228,240,255,0.58)",
    }}>
      {children} <span style={{ opacity: 0.55 }}>({count})</span>
    </button>
  );
}

function Tag({ color = "rgba(228,240,255,0.58)", children }) {
  return (
    <span style={{ minWidth: 0, fontSize: "9px", lineHeight: 1.2, padding: "3px 7px", borderRadius: "5px", background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.075)", color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "190px" }}>
      {children}
    </span>
  );
}

function InfoBlock({ title, items = [], danger = false, positive = false, muted = false }) {
  if (!items.length) return null;
  const color = danger ? "#ff8aa7" : positive ? "#82e8b8" : muted ? "rgba(228,240,255,0.46)" : "rgba(228,240,255,0.66)";
  const bg = danger ? "rgba(255,79,123,0.08)" : positive ? "rgba(34,217,139,0.07)" : "rgba(255,255,255,0.04)";
  const border = danger ? "rgba(255,79,123,0.18)" : positive ? "rgba(34,217,139,0.18)" : "rgba(255,255,255,0.08)";
  return (
    <div style={{ marginTop: "10px" }}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
        {items.map((item) => (
          <span key={item} style={{ fontSize: "10px", color, background: bg, border: `1px solid ${border}`, borderRadius: "999px", padding: "3px 8px", lineHeight: 1.45 }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: "9px", letterSpacing: "1px", color: "rgba(228,240,255,0.34)", marginBottom: "6px" }}>{children}</div>;
}

function LineExample({ children }) {
  return (
    <div style={{ fontSize: "11px", lineHeight: 1.55, color: "rgba(245,197,66,0.84)", background: "rgba(245,197,66,0.055)", borderLeft: "2px solid rgba(245,197,66,0.34)", borderRadius: "0 7px 7px 0", padding: "7px 9px", marginBottom: "5px" }}>
      {children}
    </div>
  );
}

function CaseCard({ item }) {
  return (
    <div style={{ background: "rgba(0,150,255,0.055)", border: "1px solid rgba(0,150,255,0.14)", borderRadius: "10px", padding: "9px", marginBottom: "7px" }}>
      <div style={{ fontSize: "11px", color: "rgba(228,240,255,0.9)", fontWeight: 800, lineHeight: 1.5 }}>{item.title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", margin: "6px 0 7px" }}>
        <Tag color="#4db9ff">{item.source}</Tag>
        <Tag color="#f5c542">{item.riskType}</Tag>
      </div>
      <p style={{ margin: "0 0 6px", fontSize: "10.5px", lineHeight: 1.65, color: "rgba(228,240,255,0.62)" }}>{item.summary}</p>
      <p style={{ margin: 0, fontSize: "10.5px", lineHeight: 1.65, color: "rgba(130,232,184,0.78)" }}>启示：{item.lesson}</p>
    </div>
  );
}
