import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Set

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    import faiss
except ImportError:
    faiss = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from models import (
    AnalysisResult,
    Claim,
    ClaimType,
    Evidence,
    EvidenceStance,
    LiveSemanticEvent,
    Report,
    Risk,
    RiskLevel,
    Verification,
    VerificationVerdict,
)
from rag_config import load_rag_config, public_rag_config, save_rag_config, validate_rag_config


class RAGPipeline:
    def __init__(self):
        self.config = load_rag_config()
        self.embedding_index = None
        self.embedding_docs: List[Dict[str, Any]] = []
        self.embedding_status = self._embedding_status("not_built")
        self.claim_cases = self.load_claim_cases()
        self.evidence_db = self.load_evidence_db()
        self.fetched_texts = self.load_fetched_texts()
        self.rule_graph = self.load_rule_graph()
        self.historical_cases = self.load_historical_cases()
        self.rebuild_vector_spaces(rebuild_embedding=True)

    def _kb_path(self, filename: str) -> str:
        return os.path.join(os.path.dirname(__file__), "..", "src", "agentdojo", "data", "knowledge_base", filename)

    def load_claim_cases(self) -> List[Dict[str, Any]]:
        cases = []
        with open(self._kb_path("claim_cases.jsonl"), "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    cases.append(json.loads(line))
        return cases

    def load_evidence_db(self) -> List[Dict[str, Any]]:
        with open(self._kb_path("evidence_db.json"), "r", encoding="utf-8") as f:
            return json.load(f)

    def load_fetched_texts(self) -> List[Dict[str, Any]]:
        texts = []
        path = self._kb_path("fetched_texts.jsonl")
        if not os.path.exists(path):
            return texts
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    texts.append(json.loads(line))
        return texts

    def load_rule_graph(self) -> Dict[str, Any]:
        with open(self._kb_path("rule_graph.json"), "r", encoding="utf-8") as f:
            return json.load(f)

    def load_historical_cases(self) -> List[Dict[str, Any]]:
        cases = []
        path = self._kb_path("historical_cases.jsonl")
        if not os.path.exists(path):
            return cases
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    cases.append(json.loads(line))
        return cases

    def rebuild_vector_spaces(self, rebuild_embedding: bool = True) -> None:
        all_texts = [case.get("current_utterance", "") for case in self.claim_cases]
        all_texts += [ev.get("content", "") for ev in self.evidence_db]
        all_texts += [ft.get("content", "") for ft in self.fetched_texts]
        all_texts += [node.get("content", "") for node in self.rule_graph.get("nodes", [])]
        all_texts += [case.get("content", "") for case in self.historical_cases]
        all_texts = [text for text in all_texts if text]

        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words="english")
        self.vectorizer.fit(all_texts or ["empty"])
        self.claim_matrix = self.vectorizer.transform([case.get("current_utterance", "") for case in self.claim_cases])
        self.evidence_matrix = self.vectorizer.transform([ev.get("content", "") for ev in self.evidence_db])
        self.fetched_texts_matrix = self.vectorizer.transform([ft.get("content", "") for ft in self.fetched_texts])
        self.historical_cases_matrix = (
            self.vectorizer.transform([case.get("content", "") for case in self.historical_cases])
            if self.historical_cases
            else None
        )
        if rebuild_embedding:
            self.rebuild_embedding_index()

    def get_public_status(self) -> Dict[str, Any]:
        return {
            "available": True,
            "config": public_rag_config(self.config),
            "embedding_status": self.embedding_status,
            "counts": {
                "claim_cases": len(self.claim_cases),
                "evidence_db": len(self.evidence_db),
                "fetched_texts": len(self.fetched_texts),
                "rule_graph_nodes": len(self.rule_graph.get("nodes", [])),
                "historical_cases": len(self.historical_cases),
            },
        }

    def update_config(self, config_patch: Dict[str, Any], persist: bool = True, rebuild: bool = False) -> Dict[str, Any]:
        merged = validate_rag_config(self._deep_merge(self.config, config_patch or {}))
        self.config = save_rag_config(merged) if persist else merged
        if rebuild:
            self.rebuild_vector_spaces(rebuild_embedding=True)
        return self.get_public_status()

    def _deep_merge(self, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        merged = json.loads(json.dumps(base))
        for key, value in (override or {}).items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged

    def _env_secret(self, name: str) -> str:
        value = os.getenv(name or "", "").strip()
        if any(fragment in value.lower() for fragment in ("your-", "sk-your", "xxx", "...")):
            return ""
        return value

    def _embedding_status(self, reason: str, ready: bool = False, document_count: int = 0, dimensions: Optional[int] = None) -> Dict[str, Any]:
        cfg = self.config["embedding"]
        return {
            "ready": ready,
            "reason": reason,
            "document_count": document_count,
            "last_built_at": int(time.time()) if ready else None,
            "provider": cfg["provider"],
            "model": cfg["model"],
            "dimensions": dimensions or cfg["dimensions"],
        }

    def _openai_client(self, section: str):
        if OpenAI is None:
            return None
        cfg = self.config[section]
        api_key = self._env_secret(cfg.get("api_key_env"))
        if not api_key:
            return None
        kwargs = {"api_key": api_key}
        if cfg.get("base_url"):
            kwargs["base_url"] = cfg["base_url"]
        return OpenAI(**kwargs)

    def _build_embedding_documents(self) -> List[Dict[str, Any]]:
        docs: List[Dict[str, Any]] = []
        for case in self.claim_cases:
            content = case.get("current_utterance", "").strip()
            if content:
                docs.append(self._doc("claim_case", case.get("case_id", f"claim_case_{len(docs)}"), "claim case", content, case, case.get("claim_type", []), 0.75))
        for ev in self.evidence_db:
            content = ev.get("content", "").strip()
            if content:
                docs.append(self._doc("evidence_db", ev.get("evidence_id", f"evidence_{len(docs)}"), ev.get("title", ""), content, ev, ev.get("related_claim_types", []), ev.get("score", 0.75)))
        for ft in self.fetched_texts:
            content = ft.get("content", "").strip()
            if content:
                docs.append(self._doc("asr_context", ft.get("text_id", f"captured_text_{len(docs)}"), "直播抓取文本片段", content, ft, ft.get("related_claim_types", []), ft.get("confidence", 0.8)))
        for node in self.rule_graph.get("nodes", []):
            content = node.get("content", "").strip()
            if content:
                docs.append(self._doc("rule_db", node.get("node_id", f"rule_node_{len(docs)}"), node.get("label", "规则图谱节点"), content, node, node.get("related_claim_types", []), node.get("score", 0.85)))
        for case in self.historical_cases:
            content = "\n".join([case.get("risk_type", ""), case.get("summary", ""), case.get("lesson", ""), case.get("content", "")]).strip()
            if content:
                docs.append(self._doc("historical_case", case.get("case_id", f"historical_case_{len(docs)}"), case.get("title", "历史案例"), content, case, case.get("related_claim_types", []), 0.75))
        return docs

    def _doc(self, source: str, doc_id: str, title: str, content: str, meta: Dict[str, Any], related: List[str], score: float) -> Dict[str, Any]:
        return {
            "id": doc_id,
            "source": source,
            "title": title,
            "content": content,
            "meta": meta,
            "related_claim_types": related,
            "base_score": float(score or 0.75),
        }

    def _embed_texts(self, texts: List[str]) -> Optional[np.ndarray]:
        if not texts:
            return None
        client = self._openai_client("embedding")
        if client is None:
            self.embedding_status = self._embedding_status("missing_embedding_api_key_or_sdk")
            return None
        cfg = self.config["embedding"]
        vectors: List[List[float]] = []
        batch_size = int(cfg.get("batch_size", 64))
        for start in range(0, len(texts), batch_size):
            response = client.embeddings.create(model=cfg["model"], input=texts[start:start + batch_size])
            vectors.extend([item.embedding for item in response.data])
        matrix = np.array(vectors, dtype="float32")
        matrix = matrix / np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
        return matrix

    def rebuild_embedding_index(self) -> Dict[str, Any]:
        self.embedding_index = None
        self.embedding_docs = []
        if not self.config["embedding"].get("enabled"):
            self.embedding_status = self._embedding_status("disabled")
            return self.embedding_status
        if faiss is None:
            self.embedding_status = self._embedding_status("faiss_not_installed")
            return self.embedding_status

        docs = self._build_embedding_documents()
        if not docs:
            self.embedding_status = self._embedding_status("empty_corpus")
            return self.embedding_status
        try:
            vectors = self._embed_texts([doc["content"] for doc in docs])
            if vectors is None:
                return self.embedding_status
            index = faiss.IndexFlatIP(int(vectors.shape[1]))
            index.add(vectors)
            self.embedding_index = index
            self.embedding_docs = docs
            self.embedding_status = self._embedding_status("ready", ready=True, document_count=len(docs), dimensions=int(vectors.shape[1]))
        except Exception as exc:
            self.embedding_status = self._embedding_status(f"build_failed: {exc}")
        return self.embedding_status

    def embedding_search(self, query: str, limit: Optional[int] = None, sources: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
        if not query.strip() or not self.embedding_index or not self.embedding_docs:
            return []
        query_vector = self._embed_texts([query])
        if query_vector is None:
            return []
        retrieval = self.config["retrieval"]
        search_k = min(max(int(limit or retrieval["top_k"]), int(retrieval["top_k"])), len(self.embedding_docs))
        distances, indices = self.embedding_index.search(query_vector, search_k)
        threshold = float(retrieval["similarity_threshold"])
        weights = self.config.get("source_weights", {})
        hits = []
        for score, idx in zip(distances[0], indices[0]):
            if idx < 0:
                continue
            doc = self.embedding_docs[int(idx)]
            if sources and doc["source"] not in sources:
                continue
            similarity = float(score)
            if similarity < threshold:
                continue
            hits.append({**doc, "similarity": similarity, "score": similarity * float(weights.get(doc["source"], 1.0))})
        hits.sort(key=lambda item: item["score"], reverse=True)
        return hits[:limit] if limit else hits

    def append_fetched_text(self, entry: Dict[str, Any], persist: bool = True) -> None:
        if persist:
            with open(self._kb_path("fetched_texts.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self.fetched_texts.append(entry)
        self.rebuild_vector_spaces(rebuild_embedding=False)

    def append_claim_case(self, entry: Dict[str, Any], persist: bool = True) -> None:
        if persist:
            with open(self._kb_path("claim_cases.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self.claim_cases.append(entry)
        self.rebuild_vector_spaces(rebuild_embedding=False)

    def refresh_from_files(self) -> None:
        self.claim_cases = self.load_claim_cases()
        self.evidence_db = self.load_evidence_db()
        self.fetched_texts = self.load_fetched_texts()
        self.rule_graph = self.load_rule_graph()
        self.historical_cases = self.load_historical_cases()
        self.rebuild_vector_spaces(rebuild_embedding=True)

    def _has_fetched_text(self, content: str) -> bool:
        normalized = content.strip()
        return any(ft.get("content", "").strip() == normalized for ft in self.fetched_texts)

    def _has_claim_case(self, current_utterance: str) -> bool:
        normalized = current_utterance.strip()
        return any(case.get("current_utterance", "").strip() == normalized for case in self.claim_cases)

    def auto_discover_fetched_text(self, event: LiveSemanticEvent, persist: bool = True) -> None:
        content = event.raw_content.strip()
        if not content or self._has_fetched_text(content):
            return
        self.append_fetched_text({
            "text_id": f"captured_text_{event.event_id}",
            "content": content,
            "confidence": float(event.confidence or 0.0),
            "related_claim_types": [],
        }, persist=persist)

    def auto_discover_claim_case(self, event: LiveSemanticEvent, claim: Claim, persist: bool = True) -> None:
        current_utterance = event.raw_content.strip()
        if not claim or not current_utterance or self._has_claim_case(current_utterance):
            return
        self.append_claim_case({
            "case_id": f"case_{event.event_id}",
            "history_utterances": [],
            "current_utterance": current_utterance,
            "claim_type": [ct.value for ct in claim.claim_type],
            "slots": {"subject": claim.subject, "value": claim.value[0] if claim.value else ""},
            "required_evidence": claim.required_evidence,
            "risk_hint": f"自动采集案例：检测到{','.join([ct.value for ct in claim.claim_type])}。",
        }, persist=persist)

    def rule_gate(self, event: LiveSemanticEvent) -> bool:
        keywords = ["全网最低", "最低价", "只剩", "最后", "专家推荐", "三天见效", "限时", "秒杀"]
        return any(keyword in event.raw_content for keyword in keywords)

    def claim_rag(self, event: LiveSemanticEvent) -> Optional[Claim]:
        content = event.raw_content
        claim_types = []
        if any(term in content for term in ["最低", "全网", "低价"]):
            claim_types.append(ClaimType.PRICE_CLAIM)
        if any(term in content for term in ["只剩", "最后", "库存", "限量"]):
            claim_types.append(ClaimType.SCARCITY_CLAIM)
        if not claim_types:
            return None

        best_case = None
        confidence = 0.85
        if self.config["retrieval"]["mode"] == "embedding" and self.embedding_index:
            hits = self.embedding_search(content, limit=int(self.config["retrieval"]["claim_top_k"]), sources={"claim_case"})
            if hits:
                best_case = hits[0]["meta"]
                confidence = max(0.65, min(0.95, float(hits[0].get("similarity", confidence))))

        if not best_case and self.claim_cases:
            query_vector = self.vectorizer.transform([content])
            similarities = cosine_similarity(query_vector, self.claim_matrix)[0]
            top_indices = np.argsort(similarities)[-int(self.config["retrieval"]["claim_top_k"]):][::-1]
            best_case = self.claim_cases[int(top_indices[0])] if len(top_indices) else None

        if not best_case:
            return None
        slots = best_case.get("slots", {})
        return Claim(
            claim_id=f"claim_{event.event_id}",
            claim_type=claim_types,
            subject=slots.get("subject", "当前商品"),
            predicate=[best_case.get("current_utterance", content)],
            value=[slots.get("price_term", "") or slots.get("quantity", "") or slots.get("value", "")],
            required_evidence=best_case.get("required_evidence", []),
            confidence=confidence,
        )

    def evidence_rag(self, claim: Claim) -> List[Evidence]:
        query_text = " ".join(claim.predicate + claim.value + [claim.subject] + claim.required_evidence)
        if self.config["retrieval"]["mode"] == "embedding" and self.embedding_index:
            evidences = []
            seen_ids = set()
            for hit in self.embedding_search(query_text, limit=int(self.config["retrieval"]["top_k"])):
                evidence = self._hit_to_evidence(hit)
                if not evidence or evidence.evidence_id in seen_ids:
                    continue
                seen_ids.add(evidence.evidence_id)
                evidences.append(evidence)
                if len(evidences) >= int(self.config["retrieval"]["final_k"]):
                    break
            if evidences:
                return evidences
        return self._tfidf_evidence_rag(claim, query_text)

    def _hit_to_evidence(self, hit: Dict[str, Any]) -> Optional[Evidence]:
        if hit["source"] == "claim_case":
            return None
        meta = hit.get("meta", {})
        related = [ClaimType(ct) for ct in hit.get("related_claim_types", []) if ct in {c.value for c in ClaimType}]
        score = float(max(0.0, min(1.0, hit.get("score", hit.get("base_score", 0.75)))))
        if hit["source"] == "evidence_db":
            return Evidence(
                evidence_id=meta.get("evidence_id", hit["id"]),
                source=meta.get("source", "evidence_db"),
                title=meta.get("title", hit.get("title", "")),
                content=meta.get("content", hit["content"]),
                stance=EvidenceStance(meta.get("stance", EvidenceStance.NEUTRAL.value)),
                score=score,
                related_claim_types=related,
            )
        stance = EvidenceStance.RISK_SUPPORTING if hit["source"] in {"rule_db", "historical_case"} else EvidenceStance.NEUTRAL
        return Evidence(
            evidence_id=meta.get("node_id") or meta.get("case_id") or meta.get("text_id") or hit["id"],
            source=hit["source"],
            title=hit.get("title", ""),
            content=hit["content"],
            stance=stance,
            score=score,
            related_claim_types=related,
        )

    def _tfidf_evidence_rag(self, claim: Claim, query_text: str) -> List[Evidence]:
        evidences = []
        valid_claim_type_values = {c.value for c in ClaimType}
        for req_ev in claim.required_evidence:
            query_vector = self.vectorizer.transform([f"{req_ev} {claim.subject}"])
            similarities = cosine_similarity(query_vector, self.evidence_matrix)[0]
            top_indices = np.argsort(similarities)[-int(self.config["retrieval"]["final_k"]):][::-1]
            for idx in top_indices:
                meta = self.evidence_db[int(idx)]
                evidences.append(Evidence(
                    evidence_id=meta["evidence_id"],
                    source=meta["source"],
                    title=meta.get("title", ""),
                    content=meta["content"],
                    stance=EvidenceStance(meta["stance"]),
                    score=meta["score"],
                    related_claim_types=[ClaimType(ct) for ct in meta["related_claim_types"] if ct in valid_claim_type_values],
                ))

        if self.fetched_texts:
            similarities = cosine_similarity(self.vectorizer.transform([query_text]), self.fetched_texts_matrix)[0]
            best_text = self.fetched_texts[int(np.argsort(similarities)[-1])]
            evidences.append(Evidence(
                evidence_id=best_text["text_id"],
                source="asr_context",
                title="直播抓取文本片段",
                content=best_text["content"],
                stance=EvidenceStance.NEUTRAL,
                score=best_text.get("confidence", 0.8),
                related_claim_types=[ClaimType(ct) for ct in best_text.get("related_claim_types", []) if ct in valid_claim_type_values],
            ))

        matched_nodes = [
            node for node in self.rule_graph.get("nodes", [])
            if any(ct.value in node.get("related_claim_types", []) for ct in claim.claim_type)
        ]
        for node in matched_nodes:
            related = node.get("related_claim_types", []) or []
            evidences.append(Evidence(
                evidence_id=node["node_id"],
                source="rule_db",
                title=node.get("label", "规则图谱节点"),
                content=node.get("content", ""),
                stance=EvidenceStance.RISK_SUPPORTING,
                score=node.get("score", 0.85),
                related_claim_types=[ClaimType(ct) for ct in related if ct in valid_claim_type_values],
            ))

        if self.historical_cases and self.historical_cases_matrix is not None:
            similarities = cosine_similarity(self.vectorizer.transform([query_text]), self.historical_cases_matrix)[0]
            for idx in np.argsort(similarities)[-2:][::-1]:
                meta = self.historical_cases[int(idx)]
                related = meta.get("related_claim_types") or []
                evidences.append(Evidence(
                    evidence_id=meta.get("case_id", f"historical_case_{idx}"),
                    source="historical_case",
                    title=meta.get("title", "历史案例"),
                    content="\n".join([meta.get("risk_type", ""), meta.get("summary", ""), meta.get("lesson", "")]).strip() or meta.get("content", ""),
                    stance=EvidenceStance.RISK_SUPPORTING,
                    score=float(similarities[int(idx)]),
                    related_claim_types=[ClaimType(ct) for ct in related if ct in valid_claim_type_values],
                ))
        return evidences

    def evidence_verifier(self, claim: Claim, evidences: List[Evidence]) -> Verification:
        support_status = {}
        for ct in claim.claim_type:
            relevant = [ev for ev in evidences if ct in ev.related_claim_types or ev.source in {"rule_db", "historical_case"}]
            support_status[ct.value] = VerificationVerdict.SUPPORTED if relevant else VerificationVerdict.NOT_ENOUGH_EVIDENCE
        verdict = (
            VerificationVerdict.NOT_ENOUGH_EVIDENCE
            if any(value == VerificationVerdict.NOT_ENOUGH_EVIDENCE for value in support_status.values())
            else VerificationVerdict.SUPPORTED
        )
        reason = "证据充足" if verdict == VerificationVerdict.SUPPORTED else "当前证据不足，需要补充价格、库存或功效依据。"
        return Verification(verdict=verdict, support_status=support_status, reason=reason, human_review_required=verdict == VerificationVerdict.NOT_ENOUGH_EVIDENCE)

    def llm_score_claim(self, claim: Claim, evidences: List[Evidence], verification: Verification) -> Optional[Dict[str, Any]]:
        scoring = self.config["llm_scoring"]
        if not scoring.get("enabled"):
            return None
        client = self._openai_client("llm_scoring")
        if client is None:
            return {"enabled": True, "used": False, "reason": "missing_llm_api_key_or_sdk"}
        payload = {
            "claim": {
                "claim_id": claim.claim_id,
                "claim_type": [ct.value for ct in claim.claim_type],
                "subject": claim.subject,
                "predicate": claim.predicate,
                "value": claim.value,
                "required_evidence": claim.required_evidence,
                "confidence": claim.confidence,
            },
            "verification": {"verdict": verification.verdict.value, "reason": verification.reason},
            "evidence": [
                {
                    "evidence_id": ev.evidence_id,
                    "source": ev.source,
                    "title": ev.title,
                    "content": ev.content[:800],
                    "stance": ev.stance.value,
                    "score": ev.score,
                }
                for ev in evidences[: int(self.config["retrieval"]["final_k"])]
            ],
        }
        try:
            response = client.chat.completions.create(
                model=scoring["model"],
                messages=[
                    {"role": "system", "content": "你是直播电商合规审核系统的证据约束打分器，只输出 JSON。"},
                    {
                        "role": "user",
                        "content": (
                            "只基于给定证据打分，不要引入外部事实。返回严格 JSON，字段包括 "
                            "overall_risk_score, confidence, evidence_support, misleading_risk, "
                            "missing_evidence_risk, conflict_risk, rationale, evidence_scores。"
                            f"\n\n{json.dumps(payload, ensure_ascii=False)}"
                        ),
                    },
                ],
                temperature=float(scoring["temperature"]),
                top_p=float(scoring["top_p"]),
                max_tokens=int(scoring["max_tokens"]),
                timeout=int(scoring["timeout_seconds"]),
            )
            content = response.choices[0].message.content or "{}"
            match = re.search(r"\{.*\}", content, flags=re.S)
            parsed = json.loads(match.group(0) if match else content)
            parsed.update({"used": True, "provider": scoring["provider"], "model": scoring["model"]})
            return parsed
        except Exception as exc:
            return {"enabled": True, "used": False, "reason": f"llm_scoring_failed: {exc}"}

    def apply_llm_rerank(self, evidences: List[Evidence], llm_score: Optional[Dict[str, Any]]) -> List[Evidence]:
        if not evidences or not llm_score or not llm_score.get("used") or not self.config["llm_scoring"].get("rerank_enabled"):
            return evidences
        score_map = {}
        for item in llm_score.get("evidence_scores", []) or []:
            try:
                score_map[item.get("evidence_id")] = float(item.get("usefulness_score"))
            except (TypeError, ValueError):
                continue
        for evidence in evidences:
            if evidence.evidence_id in score_map:
                evidence.score = max(0.0, min(1.0, evidence.score * 0.45 + score_map[evidence.evidence_id] * 0.55))
        return sorted(evidences, key=lambda ev: ev.score, reverse=True)

    def risk_scorer(self, claim: Claim, verification: Verification, evidences: List[Evidence], llm_score: Optional[Dict[str, Any]] = None) -> Risk:
        weights = self.config["risk"]["weights"]
        thresholds = self.config["risk"]["thresholds"]
        rule_severity = 0.9 if any(ct in claim.claim_type for ct in [ClaimType.PRICE_CLAIM, ClaimType.SCARCITY_CLAIM]) else 0.5
        claim_risk = 0.9 if len(claim.claim_type) > 1 else 0.6
        evidence_missing = max(0, 1.0 - (len(evidences) / len(claim.required_evidence))) if claim.required_evidence else 0
        evidence_conflict = 0.0
        chat_questioning = 0.0
        historical_similarity = max([ev.score for ev in evidences if ev.source == "historical_case"] or [0.5])
        score = (
            float(weights.get("rule_severity", 0.30)) * rule_severity
            + float(weights.get("claim_risk", 0.25)) * claim_risk
            + float(weights.get("evidence_missing", 0.20)) * evidence_missing
            + float(weights.get("evidence_conflict", 0.15)) * evidence_conflict
            + float(weights.get("chat_questioning", 0.05)) * chat_questioning
            + float(weights.get("historical_similarity", 0.05)) * historical_similarity
        )
        factors = {
            "rule_severity": rule_severity,
            "claim_risk": claim_risk,
            "evidence_missing": evidence_missing,
            "evidence_conflict": evidence_conflict,
            "chat_questioning": chat_questioning,
            "historical_similarity": historical_similarity,
        }
        if llm_score and llm_score.get("used"):
            try:
                llm_risk = max(0.0, min(1.0, float(llm_score.get("overall_risk_score"))))
                blend = float(self.config["risk"].get("llm_blend", 0.45))
                score = score * (1.0 - blend) + llm_risk * blend
                factors["llm_risk"] = llm_risk
            except (TypeError, ValueError):
                pass
        if score >= thresholds["p0"]:
            level = RiskLevel.P0
        elif score >= thresholds["p1"]:
            level = RiskLevel.P1
        elif score >= thresholds["p2"]:
            level = RiskLevel.P2
        else:
            level = RiskLevel.P3
        return Risk(score=score, level=level, factors=factors)

    def report_generator(self, claim: Claim, risk: Risk) -> Report:
        suggestions = []
        if risk.level in [RiskLevel.P0, RiskLevel.P1]:
            suggestions.append("避免使用“全网最低”等绝对化表述，改为“直播间当前优惠价”。")
            suggestions.append("库存、价格、功效类话术需要补充可追溯证据。")
        return Report(summary=f"检测到 {len(claim.claim_type)} 类主张，风险等级 {risk.level.value}。", suggestions=suggestions, risk_level=risk.level)

    def rag_qa(self, question: str, claim: Claim, evidences: List[Evidence]) -> str:
        if "为什么" in question:
            return "该结论基于当前召回证据、证据缺口和规则图谱节点综合判断。"
        if "改写" in question:
            return "建议避免绝对化、稀缺性和功效承诺，改为可核验的中性描述。"
        return "基于当前证据，该主张仍需要更多可追溯材料支持。"

    def process_event(self, event: LiveSemanticEvent) -> AnalysisResult:
        trace = []
        rag_debug: Dict[str, Any] = {}
        self.auto_discover_fetched_text(event)
        if not self.rule_gate(event):
            return AnalysisResult(event=event, trace=trace, rag_debug=rag_debug)
        trace.append({"step": "rule_gate", "passed": True})

        claim = self.claim_rag(event)
        if not claim:
            return AnalysisResult(event=event, trace=trace, rag_debug=rag_debug)
        trace.append({"step": "claim_rag", "claim_types": [ct.value for ct in claim.claim_type]})

        evidences = self.evidence_rag(claim)
        trace.append({"step": "evidence_rag", "evidence_count": len(evidences)})
        verification = self.evidence_verifier(claim, evidences)
        trace.append({"step": "evidence_verifier", "verdict": verification.verdict.value})

        llm_score = self.llm_score_claim(claim, evidences, verification)
        if llm_score:
            rag_debug["llm_scoring"] = llm_score
            trace.append({"step": "llm_scoring", "used": bool(llm_score.get("used")), "model": llm_score.get("model"), "reason": llm_score.get("reason")})
            evidences = self.apply_llm_rerank(evidences, llm_score)

        risk = self.risk_scorer(claim, verification, evidences, llm_score=llm_score)
        trace.append({"step": "risk_scorer", "score": risk.score, "level": risk.level.value})
        report = self.report_generator(claim, risk)
        trace.append({"step": "report_generator", "suggestions_count": len(report.suggestions)})
        graph = self.graph_for_claim(claim)
        self.auto_discover_claim_case(event, claim)
        return AnalysisResult(
            event=event,
            claim=claim,
            evidence=evidences,
            verification=verification,
            risk=risk,
            report=report,
            trace=trace,
            graph=graph,
            rag_debug=rag_debug,
        )

    def test_query(self, text: str) -> Dict[str, Any]:
        from models import Modality
        event = LiveSemanticEvent(
            event_id=f"test_{int(time.time() * 1000)}",
            session_id="rag_settings_test",
            timestamp=time.time(),
            modality=Modality.TEXT,
            source="rag_settings",
            raw_content=text,
            confidence=0.9,
        )
        return self.process_event(event).dict()

    def graph_for_claim(self, claim: Claim) -> Dict[str, Any]:
        nodes = [
            node for node in self.rule_graph.get("nodes", [])
            if any(ct.value in node.get("related_claim_types", []) for ct in claim.claim_type)
        ]
        node_ids = {node["node_id"] for node in nodes}
        edges = [
            edge for edge in self.rule_graph.get("edges", [])
            if edge.get("from") in node_ids or edge.get("to") in node_ids
        ]
        return {"matched_nodes": nodes, "matched_edges": edges}
