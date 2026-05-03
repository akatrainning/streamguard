import { useCallback, useEffect, useState } from "react";
import { Button, Panel } from "../components/ui";

const SAMPLE_TEXT = "主播说这是全网最低价，只剩最后十单，三天就能见效。";

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function getAtPath(object, path, fallback = "") {
  return path.split(".").reduce((current, key) => current?.[key], object) ?? fallback;
}

function formatTime(value) {
  if (!value) return "未构建";
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

export default function RagSettingsPage({ apiBase = "http://localhost:8011" }) {
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testText, setTestText] = useState(SAMPLE_TEXT);
  const [testResult, setTestResult] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/rag/config`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.detail || "配置加载失败");
      setStatus(payload);
      setConfig(payload.config);
    } catch (err) {
      setError(err.message || "配置加载失败");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateConfig = useCallback((path, value) => {
    setConfig((current) => {
      const next = cloneConfig(current);
      const keys = path.split(".");
      let cursor = next;
      keys.slice(0, -1).forEach((key) => {
        cursor[key] = cursor[key] || {};
        cursor = cursor[key];
      });
      cursor[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  const saveConfig = useCallback(async (rebuild = false) => {
    if (!config) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${apiBase}/rag/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, rebuild }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.detail || "保存失败");
      setStatus(payload);
      setConfig(payload.config);
      setNotice(rebuild ? "配置已保存，索引已按当前参数重建。" : "配置已保存。需要时可手动重建索引。");
    } catch (err) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }, [apiBase, config]);

  const reindex = useCallback(async () => {
    setReindexing(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${apiBase}/rag/reindex`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.detail || "索引重建失败");
      setStatus(payload);
      setConfig(payload.config);
      setNotice("索引重建完成，当前状态已刷新。");
    } catch (err) {
      setError(err.message || "索引重建失败");
    } finally {
      setReindexing(false);
    }
  }, [apiBase]);

  const runTest = useCallback(async () => {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const res = await fetch(`${apiBase}/rag/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.detail || "试跑失败");
      setTestResult(payload);
    } catch (err) {
      setError(err.message || "试跑失败");
    } finally {
      setTesting(false);
    }
  }, [apiBase, testText]);

  if (loading || !config) {
    return (
      <section className="sg-rag-page">
        <Panel eyebrow="RAG CONTROL" title="正在读取 RAG 配置">
          <div className="sg-rag-muted">连接后端配置接口，检查 embedding 与索引状态。</div>
        </Panel>
      </section>
    );
  }

  const embedding = config.embedding || {};
  const retrieval = config.retrieval || {};
  const scoring = config.llm_scoring || {};
  const risk = config.risk || {};
  const embeddingStatus = status?.embedding_status || {};
  const counts = status?.counts || {};
  const llmDebug = testResult?.rag_debug?.llm_scoring;

  return (
    <section className="sg-rag-page">
      <header className="sg-rag-hero">
        <div>
          <div className="sg-ui-eyebrow">RAG CONTROL</div>
          <h1>RAG 调优控制台</h1>
          <p>将 AIHubMix embedding、FAISS 召回和 LLM 证据打分拆开调，避免把检索质量和生成温度混成一团。</p>
        </div>
        <div className="sg-rag-actions">
          <Button onClick={() => saveConfig(false)} disabled={saving}>保存配置</Button>
          <Button variant="primary" onClick={() => saveConfig(true)} disabled={saving}>保存并重建</Button>
          <Button onClick={reindex} disabled={reindexing}>{reindexing ? "重建中" : "重建索引"}</Button>
        </div>
      </header>

      {(error || notice) && (
        <div className={`sg-rag-message ${error ? "is-error" : "is-ok"}`}>{error || notice}</div>
      )}

      <div className="sg-rag-status-strip">
        <StatusCell label="Embedding" value={`${embedding.provider} / ${embedding.model}`} good={embedding.api_key_configured} />
        <StatusCell label="FAISS Index" value={embeddingStatus.ready ? "READY" : embeddingStatus.reason || "NOT READY"} good={embeddingStatus.ready} />
        <StatusCell label="Documents" value={embeddingStatus.document_count || 0} />
        <StatusCell label="Last Built" value={formatTime(embeddingStatus.last_built_at)} />
        <StatusCell label="LLM Scoring" value={`${scoring.provider} / ${scoring.model}`} good={scoring.api_key_configured} />
      </div>

      <div className="sg-rag-grid">
        <Panel eyebrow="VECTOR STORE" title="Embedding 与 FAISS">
          <div className="sg-rag-form-grid">
            <CheckField label="启用云端 embedding" checked={!!embedding.enabled} onChange={(value) => updateConfig("embedding.enabled", value)} />
            <CheckField label="Embedding Key 已配置" checked={!!embedding.api_key_configured} readOnly />
            <InputField label="Provider" value={embedding.provider} onChange={(value) => updateConfig("embedding.provider", value)} />
            <InputField label="Model" value={embedding.model} onChange={(value) => updateConfig("embedding.model", value)} />
            <InputField label="Base URL" value={embedding.base_url} onChange={(value) => updateConfig("embedding.base_url", value)} />
            <InputField label="API Key Env" value={embedding.api_key_env} onChange={(value) => updateConfig("embedding.api_key_env", value)} />
            <InputField type="number" label="Vector Dimension" value={embedding.dimensions} onChange={(value) => updateConfig("embedding.dimensions", Number(value))} />
            <InputField type="number" label="Batch Size" value={embedding.batch_size} onChange={(value) => updateConfig("embedding.batch_size", Number(value))} />
          </div>
          <div className="sg-rag-kb-row">
            <Kv label="claim cases" value={counts.claim_cases || 0} />
            <Kv label="rule nodes" value={counts.rule_graph_nodes || 0} />
            <Kv label="historical cases" value={counts.historical_cases || 0} />
            <Kv label="captured texts" value={counts.fetched_texts || 0} />
          </div>
        </Panel>

        <Panel eyebrow="RETRIEVAL" title="召回与证据筛选">
          <div className="sg-rag-form-grid">
            <SelectField label="检索模式" value={retrieval.mode} options={["embedding", "tfidf"]} onChange={(value) => updateConfig("retrieval.mode", value)} />
            <InputField type="number" label="Claim Top-K" value={retrieval.claim_top_k} onChange={(value) => updateConfig("retrieval.claim_top_k", Number(value))} />
            <InputField type="number" label="Recall Top-K" value={retrieval.top_k} onChange={(value) => updateConfig("retrieval.top_k", Number(value))} />
            <InputField type="number" label="Final Evidence K" value={retrieval.final_k} onChange={(value) => updateConfig("retrieval.final_k", Number(value))} />
            <InputField type="number" step="0.01" label="Similarity Threshold" value={retrieval.similarity_threshold} onChange={(value) => updateConfig("retrieval.similarity_threshold", Number(value))} />
            <InputField type="number" step="0.01" label="Dedupe Threshold" value={retrieval.dedupe_threshold} onChange={(value) => updateConfig("retrieval.dedupe_threshold", Number(value))} />
          </div>
          <div className="sg-rag-weight-grid">
            {Object.entries(config.source_weights || {}).map(([key, value]) => (
              <InputField
                key={key}
                type="number"
                step="0.05"
                label={`${key} weight`}
                value={value}
                onChange={(next) => updateConfig(`source_weights.${key}`, Number(next))}
              />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="LLM SCORING" title="证据约束打分">
          <div className="sg-rag-form-grid">
            <CheckField label="启用 LLM 打分" checked={!!scoring.enabled} onChange={(value) => updateConfig("llm_scoring.enabled", value)} />
            <CheckField label="启用 LLM rerank" checked={!!scoring.rerank_enabled} onChange={(value) => updateConfig("llm_scoring.rerank_enabled", value)} />
            <CheckField label="LLM Key 已配置" checked={!!scoring.api_key_configured} readOnly />
            <InputField label="Provider" value={scoring.provider} onChange={(value) => updateConfig("llm_scoring.provider", value)} />
            <InputField label="Model" value={scoring.model} onChange={(value) => updateConfig("llm_scoring.model", value)} />
            <InputField label="Base URL" value={scoring.base_url} onChange={(value) => updateConfig("llm_scoring.base_url", value)} />
            <InputField label="API Key Env" value={scoring.api_key_env} onChange={(value) => updateConfig("llm_scoring.api_key_env", value)} />
            <InputField type="number" step="0.1" label="Temperature" value={scoring.temperature} onChange={(value) => updateConfig("llm_scoring.temperature", Number(value))} />
            <InputField type="number" step="0.1" label="Top P" value={scoring.top_p} onChange={(value) => updateConfig("llm_scoring.top_p", Number(value))} />
            <InputField type="number" label="Max Tokens" value={scoring.max_tokens} onChange={(value) => updateConfig("llm_scoring.max_tokens", Number(value))} />
          </div>
        </Panel>

        <Panel eyebrow="RISK POLICY" title="风险阈值">
          <div className="sg-rag-form-grid">
            <InputField type="number" step="0.01" label="P0 阈值" value={getAtPath(risk, "thresholds.p0")} onChange={(value) => updateConfig("risk.thresholds.p0", Number(value))} />
            <InputField type="number" step="0.01" label="P1 阈值" value={getAtPath(risk, "thresholds.p1")} onChange={(value) => updateConfig("risk.thresholds.p1", Number(value))} />
            <InputField type="number" step="0.01" label="P2 阈值" value={getAtPath(risk, "thresholds.p2")} onChange={(value) => updateConfig("risk.thresholds.p2", Number(value))} />
            <InputField type="number" step="0.05" label="LLM Blend" value={risk.llm_blend} onChange={(value) => updateConfig("risk.llm_blend", Number(value))} />
            <CheckField label="低置信度人工复核" checked={!!risk.human_review_on_low_confidence} onChange={(value) => updateConfig("risk.human_review_on_low_confidence", value)} />
            <InputField type="number" step="0.01" label="人工复核置信度阈值" value={risk.human_review_confidence_threshold} onChange={(value) => updateConfig("risk.human_review_confidence_threshold", Number(value))} />
          </div>
        </Panel>
      </div>

      <Panel eyebrow="SANDBOX" title="当前参数试跑">
        <div className="sg-rag-sandbox">
          <div className="sg-rag-test-input">
            <label>
              <span>直播话术</span>
              <textarea value={testText} onChange={(event) => setTestText(event.target.value)} rows={5} />
            </label>
            <Button variant="primary" onClick={runTest} disabled={testing}>{testing ? "试跑中" : "运行 RAG"}</Button>
          </div>

          <div className="sg-rag-test-output">
            {!testResult && <div className="sg-rag-muted">试跑会展示 claim、证据、trace 和 LLM 打分结果，方便判断参数是否调过头。</div>}
            {testResult && (
              <>
                <div className="sg-rag-result-head">
                  <Kv label="claim" value={testResult.claim ? testResult.claim.claim_type?.join(", ") : "未命中"} />
                  <Kv label="risk" value={testResult.risk ? `${testResult.risk.level} / ${Number(testResult.risk.score).toFixed(3)}` : "--"} />
                  <Kv label="evidence" value={testResult.evidence?.length || 0} />
                  <Kv label="llm" value={llmDebug?.used ? "USED" : (llmDebug?.reason || "SKIPPED")} />
                </div>
                <div className="sg-rag-trace">
                  {(testResult.trace || []).map((step, index) => (
                    <span key={`${step.step}-${index}`}>{step.step}</span>
                  ))}
                </div>
                <div className="sg-rag-evidence-list">
                  {(testResult.evidence || []).slice(0, 6).map((ev) => (
                    <article key={ev.evidence_id}>
                      <div>
                        <strong>{ev.title || ev.evidence_id}</strong>
                        <span>{ev.source} · score {Number(ev.score || 0).toFixed(3)}</span>
                      </div>
                      <p>{ev.content}</p>
                    </article>
                  ))}
                </div>
                {llmDebug?.used && (
                  <pre className="sg-rag-json">{JSON.stringify(llmDebug, null, 2)}</pre>
                )}
              </>
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function StatusCell({ label, value, good }) {
  const tone = good === undefined ? "" : good ? "is-good" : "is-bad";
  return (
    <div className={`sg-rag-status-cell ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Kv({ label, value }) {
  return (
    <div className="sg-rag-kv">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", ...props }) {
  return (
    <label className="sg-rag-field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="sg-rag-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function CheckField({ label, checked, onChange, readOnly = false }) {
  return (
    <label className={`sg-rag-check ${readOnly ? "is-readonly" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        readOnly={readOnly}
        onChange={(event) => !readOnly && onChange?.(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
