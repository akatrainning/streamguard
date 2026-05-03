import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function scoreFromRisk(risk) {
  if (risk === "high") return 0.92;
  if (risk === "medium") return 0.75;
  return 0.55;
}

const CLAIM_KEYWORDS = [
  { claimType: "price_claim", terms: ["价格", "原价", "最低", "全网", "折扣", "到手价", "优惠", "券后", "比价"] },
  { claimType: "scarcity_claim", terms: ["只剩", "最后", "倒计时", "限时", "限量", "手慢"] },
  { claimType: "efficacy_claim", terms: ["功效", "治疗", "根治", "见效", "无副作用", "减肥", "改善", "疗效", "医疗"] },
  { claimType: "authority_claim", terms: ["专家", "医生", "官方", "推荐", "认证", "背书"] },
  { claimType: "quality_claim", terms: ["质量", "品质", "材质", "纯天然", "零添加", "医美级", "合格", "安全"] },
  { claimType: "comparison_claim", terms: ["竞品", "同行", "贬低", "对比", "强十倍", "别家"] },
  { claimType: "guarantee_claim", terms: ["售后", "退", "退款", "赔", "保证", "承诺", "押金", "发票"] },
  { claimType: "pressure_claim", terms: ["错过", "后悔", "手慢", "赶紧", "马上", "拍下", "冲"] },
];

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function inferClaimTypes(text) {
  const hit = CLAIM_KEYWORDS.filter(({ terms }) => terms.some((term) => text.includes(term))).map(({ claimType }) => claimType);
  return hit.length ? [...new Set(hit)] : ["quality_claim"];
}

async function main() {
  const args = process.argv.slice(2);
  const outRuleGraph = args[0];
  const outHistoricalCases = args[1];
  if (!outRuleGraph) {
    console.error("Usage: node export_rule_graph.mjs <rule_graph_json_path> [historical_cases_jsonl_path]");
    process.exit(2);
  }

  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const repoRoot = path.resolve(thisDir, "..", "..");
  const complianceRulesPath = path.resolve(repoRoot, "streamguard-web", "src", "data", "complianceRules.js");

  const mod = await import(pathToFileURL(complianceRulesPath).href);
  const RULES = mod.RULES ?? [];
  const getRuleProfile = mod.getRuleProfile;
  const CASES = mod.CASES ?? {};
  if (typeof getRuleProfile !== "function") {
    throw new Error("complianceRules.js does not export getRuleProfile(rule)");
  }

  const nodes = [];
  const edges = [];

  for (const rule of RULES) {
    const profile = getRuleProfile(rule);
    const relatedClaimTypes = Array.isArray(profile?.claimTypes) ? profile.claimTypes : [];
    nodes.push({
      node_id: rule.id,
      label: rule.title ?? rule.id,
      content: [
        `${rule.law ?? ""}`.trim(),
        `${rule.article ?? ""}`.trim(),
        `${rule.category ?? ""}`.trim(),
        `${rule.desc ?? ""}`.trim(),
        ...(rule.keywords ?? []).map((k) => `关键词: ${k}`),
        ...(rule.patterns ?? []).map((p) => `模式: ${p}`),
        ...(rule.evidence ?? []).map((e) => `证据: ${e}`),
      ].filter(Boolean).join("\n"),
      related_claim_types: relatedClaimTypes,
      score: scoreFromRisk(rule.risk),
    });

    const gEdges = profile?.graph?.edges ?? [];
    for (const e of gEdges) {
      edges.push({
        from: e.source,
        to: e.target,
        relation: e.label ?? "related",
        weight: 0.8,
      });
    }
  }

  const graph = {
    nodes: uniqueByKey(nodes, (n) => n.node_id),
    edges: uniqueByKey(edges, (e) => `${e.from}::${e.to}::${e.relation}`),
    meta: {
      generated_from: "streamguard-web/src/data/complianceRules.js",
      generated_at: new Date().toISOString(),
      rule_count: RULES.length,
    },
  };

  await fs.mkdir(path.dirname(outRuleGraph), { recursive: true });
  await fs.writeFile(outRuleGraph, JSON.stringify(graph, null, 2), "utf8");

  let casesWritten = 0;
  if (outHistoricalCases) {
    const lines = [];
    for (const [caseId, meta] of Object.entries(CASES)) {
      const content = [
        meta?.title ?? "",
        meta?.source ?? "",
        meta?.riskType ?? "",
        meta?.summary ?? "",
        meta?.lesson ?? "",
      ].filter(Boolean).join("\n");
      lines.push(JSON.stringify({
        case_id: caseId,
        title: meta?.title ?? caseId,
        source: meta?.source ?? "historical_case",
        risk_type: meta?.riskType ?? "",
        summary: meta?.summary ?? "",
        lesson: meta?.lesson ?? "",
        content,
        related_claim_types: inferClaimTypes(content),
      }, null, 0));
    }
    await fs.mkdir(path.dirname(outHistoricalCases), { recursive: true });
    await fs.writeFile(outHistoricalCases, `${lines.join("\n")}\n`, "utf8");
    casesWritten = lines.length;
  }

  process.stdout.write(`ok: wrote ${graph.nodes.length} nodes, ${graph.edges.length} edges to ${outRuleGraph}\n`);
  if (outHistoricalCases) {
    process.stdout.write(`ok: wrote ${casesWritten} cases to ${outHistoricalCases}\n`);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
