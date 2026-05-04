# StreamGuard RAG Knowledge Architecture

StreamGuard uses a layered RAG knowledge base instead of one mixed vector store. The goal is to keep real-time livestream context, historical review knowledge, rule graph constraints, and evidence documents separate at ingestion time, then combine them at retrieval time.

## Modules

| Module | Source IDs | Storage | Purpose |
| --- | --- | --- | --- |
| 实时转写热库 | `asr_context` | `fetched_texts.jsonl` | Current livestream utterances and ASR snippets. Used for low-latency monitoring and current-room questions. |
| 历史记录库 | `historical_case`, `claim_case` | `historical_cases.jsonl`, `claim_cases.jsonl` | Similar historical cases, prior risk utterances, review lessons, and manually or automatically discovered claim samples. |
| 规则图谱库 | `rule_db` | `rule_graph.json` | Laws, platform rules, risk types, evidence requirements, and disposal levels. Used as the explainable constraint layer. |
| 证据文档库 | `evidence_db` | `evidence_db.json` | Product pages, reports, licenses, screenshots, and other materials that can be cited in audit answers. |

## Data Flow

```text
Live ASR / chat / manual text
  -> live_transcript hot memory
  -> rule gate and claim detection
  -> multi-source retrieval
  -> evidence verification and risk scoring
  -> auditor answer with citations
  -> reviewed sessions become historical_records

Rules / policies / compliance rule data
  -> rule_graph
  -> graph-constrained retrieval
  -> explains which rule was hit and which evidence is required

Product materials / screenshots / reports
  -> evidence_docs
  -> citation-ready evidence for verification
```

## Retrieval Policy

The backend exposes the same knowledge through different views:

| View | Sources | Use case |
| --- | --- | --- |
| `combined` | `rule_db`, `historical_case`, `evidence_db`, `asr_context` | Default audit Q&A. |
| `live` or `hot` | `asr_context` | Current livestream context only. |
| `history` or `cases` | `historical_case`, `claim_case` | Similar historical cases and prior utterance patterns. |
| `rules` or `rule_graph` | `rule_db` | Regulation/rule explanation. |
| `docs` | `evidence_db` | Citation-ready proof materials. |

If a FAISS embedding index is available, retrieval uses embedding search first. If embeddings are not configured or the index is unavailable, the system falls back to local TF-IDF retrieval so the workbench remains usable in offline or demo environments.

## API Surface

| Endpoint | Purpose |
| --- | --- |
| `GET /rag/architecture` | Returns module definitions, live counts, source mapping, and the retrieval flow. |
| `GET /rag/knowledge?view=combined&query=...` | Returns knowledge items for a module/view. |
| `POST /rag/ask` | Produces evidence-bound audit answers with citations. |
| `POST /rag/live-evaluation` | Evaluates the current livestream context using the layered knowledge base. |
| `POST /rag/reindex` | Rebuilds TF-IDF spaces and the optional FAISS embedding index. |

## Implementation Notes

- Every public knowledge item now includes `source`, `module`, `score`, `similarity`, `related_claim_types`, and safe public metadata.
- Real-time entries written by `auto_discover_fetched_text` include `session_id`, `source`, `timestamp`, and `module=live_transcript`.
- Automatically discovered claim cases include `module=historical_records`, so they can later be separated from hot memory.
- The rule graph remains structured JSON and is not reduced to plain text only; its nodes and edges are returned in knowledge views for explainability.
