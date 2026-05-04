# StreamGuard RAG Completion Plan

This plan turns the current "RAG pipeline runs" state into a complete livestream risk-scoring loop.

## Current Status

Already working:

- Embedding index can be built and queried.
- `rule_gate -> claim_rag -> evidence_rag -> evidence_verifier -> risk_scorer -> report_generator` is wired in the backend.
- `/rag/test` can return `claim`, `evidence`, `risk`, and `report`.
- The realtime backend attaches `rag_claims`, `rag_evidence`, `rag_verification`, `rag_risk`, and `rag_report` to livestream utterance events.

Still incomplete:

- Claim coverage is narrow. The stable path mainly covers price and scarcity claims.
- Retrieval quality is weak. Results are often dominated by `asr_context` instead of `rule_db`, `historical_case`, and `evidence_db`.
- LLM rerank exists but is not yet a dependable part of the scoring path.
- The frontend main monitoring flow still reads old `type/score/sub_scores` fields instead of using `rag_risk` as the primary risk signal.

## Task 1: Expand Claim and Rule Coverage

Goal:

- Move from "price/scarcity demo" to "real livestream compliance coverage".

Primary files:

- [models.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\models.py:20)
- [rag_pipeline.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\rag_pipeline.py:623)
- [claim_cases.jsonl](D:\学习资料\2024OOP\git\streamguard\src\agentdojo\data\knowledge_base\claim_cases.jsonl)
- [evidence_db.json](D:\学习资料\2024OOP\git\streamguard\src\agentdojo\data\knowledge_base\evidence_db.json)
- [rule_graph.json](D:\学习资料\2024OOP\git\streamguard\src\agentdojo\data\knowledge_base\rule_graph.json)

What to change:

- Extend `rule_gate` and `claim_rag` to reliably detect:
  - `efficacy_claim`
  - `authority_claim`
  - `quality_claim`
  - `comparison_claim`
  - `guarantee_claim`
  - `pressure_claim`
- Add claim templates and required evidence types for each claim family.
- Add supporting and refuting evidence entries for each claim family.
- Make rule graph nodes map clearly to claim types and required proofs.

Examples to support:

- "七天见效"
- "治疗痘痘"
- "专家推荐"
- "全网独家"
- "同款工厂"
- "假一赔十"
- "错过今天就没了"

Acceptance:

- `/rag/test` can classify at least one representative sentence for each claim family.
- Returned `claim.claim_type` is correct for mixed claims.
- `required_evidence` is non-empty and meaningful for each supported claim type.

## Task 2: Improve Retrieval and Ranking Quality

Goal:

- Make evidence retrieval useful enough for scoring, not just technically non-empty.

Primary files:

- [rag_pipeline.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\rag_pipeline.py:664)
- [rag_pipeline.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\rag_pipeline.py:708)
- [rag_pipeline.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\rag_pipeline.py:785)
- [rag_pipeline.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\rag_pipeline.py:843)
- [rag_config.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\rag_config.py:20)

What to change:

- Introduce source-aware retrieval quotas instead of letting `asr_context` crowd out everything else.
- Ensure final evidence selection contains a healthier mix:
  - rule evidence
  - historical analog cases
  - citation-style product or proof documents
  - current live context
- Enforce real dedupe before final ranking.
- Use `final_k` as a hard cap after rerank, not just during recall.
- Make `evidence_verifier` check required evidence coverage, not only "any related evidence exists".
- If LLM scoring is enabled, use it as a rerank/fusion layer, not as the only judge.

Recommended ranking shape:

- First pass: embedding or TF-IDF recall by source bucket.
- Second pass: score fusion by similarity, source weight, claim-type match, and evidence freshness.
- Third pass: optional LLM rerank if configured.

Acceptance:

- For a price + scarcity test sentence, final evidence should usually include at least one non-`asr_context` item.
- `evidence_count` should stay near `final_k`, not balloon far beyond it.
- `verification.reason` should reflect which required evidence is present or missing.

## Task 3: Let the Frontend Use RAG as the Main Risk Signal

Goal:

- Stop treating RAG as side data. Make it part of the actual livestream scoring experience.

Primary files:

- [app.py](D:\学习资料\2024OOP\git\streamguard\streamguard-backend\app.py:2055)
- [useRealStream.js](D:\学习资料\2024OOP\git\streamguard\streamguard-web\src\hooks\useRealStream.js:20)
- [App.jsx](D:\学习资料\2024OOP\git\streamguard\streamguard-web\src\App.jsx:88)

What to change:

- Parse `rag_claims`, `rag_evidence`, `rag_verification`, `rag_risk`, and `rag_report` in the realtime hook.
- Define a single frontend risk model:
  - prefer `rag_risk` when present
  - fall back to legacy `type/score/sub_scores` only when RAG is absent
- Surface RAG evidence and report directly in the UI:
  - alert banner
  - semantic feed
  - side panel or evidence drawer
  - session summary
- Update the dashboard metrics so they reflect RAG risk levels, not only legacy trap/hype counting.
- Ensure mock stream mode can also emit RAG-backed events, so the UI is testable without Douyin live input.

Acceptance:

- A realtime utterance that triggers RAG shows visible RAG-backed risk information in the main UI.
- Frontend metrics and alerts change when `rag_risk.level` changes.
- Mock mode and live mode both exercise the same frontend RAG display path.

## Recommended Order

1. Task 1 first. Broader claim coverage gives us more realistic inputs.
2. Task 2 second. Retrieval quality determines whether scores are trustworthy.
3. Task 3 last. Once backend outputs are stable, wire the UI to them.

## Suggested Delivery Slices

Slice A:

- Add efficacy, authority, and guarantee claims.
- Add source-balanced evidence ranking.
- Keep UI unchanged.

Slice B:

- Add comparison, pressure, and quality claims.
- Improve verification messages and risk factors.
- Add mock-mode RAG event output.

Slice C:

- Switch frontend monitoring to prefer `rag_risk`.
- Expose evidence and report in the main workflow.

## Minimal Definition of "Complete"

The RAG chain should be considered complete when all of the following are true:

- Backend supports the main livestream risk claim families beyond price/scarcity.
- Retrieval produces mixed-source evidence rather than mostly live snippets.
- Verification and risk scoring are tied to required evidence coverage.
- Frontend primary monitoring views use RAG output directly.
- Mock mode and live mode both exercise the same end-to-end RAG path.
