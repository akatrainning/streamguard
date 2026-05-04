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


KNOWLEDGE_MODULES: Dict[str, Dict[str, Any]] = {
    "live_transcript": {
        "label": "实时转写热库",
        "description": "保存当前直播或会议产生的实时话术片段，用于秒级/分钟级风险判断。",
        "sources": ["asr_context"],
        "storage": ["fetched_texts.jsonl"],
        "freshness": "hot",
        "retrieval": ["keyword", "tfidf", "embedding"],
        "lifecycle": "实时写入，结束后沉淀到历史记录库。",
    },
    "historical_records": {
        "label": "历史记录库",
        "description": "保存历史审核案例、风险话术样本和处置经验，用于相似案例召回。",
        "sources": ["historical_case", "claim_case"],
        "storage": ["historical_cases.jsonl", "claim_cases.jsonl"],
        "freshness": "warm",
        "retrieval": ["tfidf", "embedding"],
        "lifecycle": "人工复核或会话归档后写入，定期清洗和去重。",
    },
    "rule_graph": {
        "label": "规则图谱库",
        "description": "保存法规、平台规则、风险类型、证据要求和处置等级之间的关系。",
        "sources": ["rule_db"],
        "storage": ["rule_graph.json"],
        "freshness": "governed",
        "retrieval": ["graph", "keyword", "tfidf", "embedding"],
        "lifecycle": "规则版本化维护，作为审核解释和证据要求的约束层。",
    },
    "evidence_docs": {
        "label": "证据文档库",
        "description": "保存商品详情、检测报告、授权证明、平台记录等可引用证据片段。",
        "sources": ["evidence_db"],
        "storage": ["evidence_db.json"],
        "freshness": "cold",
        "retrieval": ["keyword", "tfidf", "embedding"],
        "lifecycle": "由审核材料、外部抓取或人工上传进入，作为结论引用依据。",
    },
}

KNOWLEDGE_MODULES = {
    "live_transcript": {
        "label": "实时转写热库",
        "description": "保存当前直播间产生的实时话术片段，用于秒级到分钟级风险判断。",
        "sources": ["asr_context"],
        "storage": ["fetched_texts.jsonl"],
        "freshness": "hot",
        "retrieval": ["keyword", "tfidf", "embedding"],
        "lifecycle": "实时写入，直播结束后沉淀到历史记录库。",
    },
    "historical_records": {
        "label": "历史记录库",
        "description": "保存历史审核案例、风险话术样本和处置经验，用于相似案例召回。",
        "sources": ["historical_case", "claim_case"],
        "storage": ["historical_cases.jsonl", "claim_cases.jsonl"],
        "freshness": "warm",
        "retrieval": ["tfidf", "embedding"],
        "lifecycle": "人工复核或会话归档后写入，定期清洗和去重。",
    },
    "rule_graph": {
        "label": "规则图谱库",
        "description": "保存法规、平台规则、风险类型、证据要求和处置等级之间的关系。",
        "sources": ["rule_db"],
        "storage": ["rule_graph.json"],
        "freshness": "governed",
        "retrieval": ["graph", "keyword", "tfidf", "embedding"],
        "lifecycle": "规则版本化维护，作为审核解释和证据要求的约束层。",
    },
    "evidence_docs": {
        "label": "证据文档库",
        "description": "保存商品详情、检测报告、授权证明、平台记录等可引用证据片段。",
        "sources": ["evidence_db"],
        "storage": ["evidence_db.json"],
        "freshness": "cold",
        "retrieval": ["keyword", "tfidf", "embedding"],
        "lifecycle": "由审核材料、外部抓取或人工上传进入，作为结论引用依据。",
    },
}

SOURCE_TO_MODULE = {
    source: module_id
    for module_id, module in KNOWLEDGE_MODULES.items()
    for source in module["sources"]
}

CLAIM_DETECTION_RULES: List[Dict[str, Any]] = [
    {
        "claim_type": ClaimType.PRICE_CLAIM,
        "keywords": ["全网最低", "最低价", "底价", "跳楼价", "骨折价", "史低", "全网低价"],
        "required_evidence": ["price_comparison", "price_history"],
        "subject": "当前商品",
    },
    {
        "claim_type": ClaimType.SCARCITY_CLAIM,
        "keywords": ["只剩", "最后", "库存", "限量", "限购", "售完不补", "最后一波"],
        "required_evidence": ["inventory_record", "activity_rule"],
        "subject": "当前商品",
    },
    {
        "claim_type": ClaimType.EFFICACY_CLAIM,
        "keywords": ["见效", "改善", "祛斑", "祛痘", "抗衰", "治疗", "根治", "修复", "淡纹", "美白"],
        "required_evidence": ["clinical_study", "lab_report"],
        "subject": "产品功效",
    },
    {
        "claim_type": ClaimType.AUTHORITY_CLAIM,
        "keywords": ["专家推荐", "医生推荐", "权威认证", "官方认证", "国家认证", "专利", "院线同款"],
        "required_evidence": ["authority_certification", "expert_endorsement"],
        "subject": "权威背书",
    },
    {
        "claim_type": ClaimType.QUALITY_CLAIM,
        "keywords": ["纯天然", "无添加", "0添加", "进口原料", "精选材质", "高品质", "安全无刺激", "食品级"],
        "required_evidence": ["ingredient_list", "quality_cert"],
        "subject": "产品品质",
    },
    {
        "claim_type": ClaimType.COMPARISON_CLAIM,
        "keywords": ["比某品牌更好", "比大牌更好", "同款工厂", "平替", "吊打", "超过竞品", "比旗舰店便宜"],
        "required_evidence": ["comparison_data", "peer_comparison"],
        "subject": "商品对比",
    },
    {
        "claim_type": ClaimType.GUARANTEE_CLAIM,
        "keywords": ["不满意全退", "假一赔十", "无效包退", "终身保修", "正品保证", "无理由退换", "包赔"],
        "required_evidence": ["policy_document", "return_policy"],
        "subject": "售后保障",
    },
    {
        "claim_type": ClaimType.PRESSURE_CLAIM,
        "keywords": ["错过今天", "马上下单", "现在不买", "最后机会", "仅限今天", "手慢无", "赶紧抢", "立刻拍"],
        "required_evidence": ["activity_rule", "time_limit"],
        "subject": "促销压力",
    },
]

CLAIM_SUGGESTIONS: Dict[ClaimType, List[str]] = {
    ClaimType.PRICE_CLAIM: ["避免使用“全网最低”等绝对化表述，改为“直播间当前优惠价”。", "补充价格对比截图、活动规则或历史价格依据。"],
    ClaimType.SCARCITY_CLAIM: ["库存和限量话术应基于真实库存或活动配置。", "将“只剩最后”改成可核验的活动库存说明。"],
    ClaimType.EFFICACY_CLAIM: ["功效类表述应回到可验证实验、检测或备案材料。", "避免使用治疗、根治、速效等医疗化承诺。"],
    ClaimType.AUTHORITY_CLAIM: ["权威、专家、专利类说法应给出明确来源。", "补充认证编号、机构名称或授权文件。"],
    ClaimType.QUALITY_CLAIM: ["品质与成分类表述应有配方、检测或资质证明。", "避免把主观体验包装成客观质量结论。"],
    ClaimType.COMPARISON_CLAIM: ["涉及竞品比较时应有可复核的对照标准和数据。", "避免使用“同款工厂”“比大牌更好”等未经证实的对比话术。"],
    ClaimType.GUARANTEE_CLAIM: ["售后、赔付、保修承诺应与实际政策完全一致。", "补充退换货规则、赔付条件或官方售后说明。"],
    ClaimType.PRESSURE_CLAIM: ["紧迫感话术应与真实活动时间和库存状态一致。", "减少“错过就没了”“马上下单”等高压催单表达。"],
}

VIEW_SOURCES = {
    "combined": {"rule_db", "historical_case", "evidence_db", "asr_context"},
    "rules": {"rule_db"},
    "rule_graph": {"rule_db"},
    "cases": {"historical_case", "claim_case"},
    "history": {"historical_case", "claim_case"},
    "evidence": {"evidence_db", "asr_context"},
    "docs": {"evidence_db"},
    "live": {"asr_context"},
    "hot": {"asr_context"},
}


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
        docs = self._build_embedding_documents()
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
            "modules": self._module_status(docs),
        }

    def get_knowledge_view(self, view: str = "combined", limit: int = 48, query: str = "") -> Dict[str, Any]:
        docs = self._build_embedding_documents()
        sources = VIEW_SOURCES.get(view, VIEW_SOURCES["combined"])
        if query.strip():
            hits = self._search_documents(query, docs, sources=sources, limit=limit)
        else:
            weights = self.config.get("source_weights", {})
            hits = [
                {**doc, "similarity": None, "score": float(doc.get("base_score", 0.75)) * float(weights.get(doc["source"], 1.0))}
                for doc in docs
                if doc["source"] in sources
            ]
            hits.sort(key=lambda item: item["score"], reverse=True)
            hits = hits[:limit]

        items = [self._public_doc(hit) for hit in hits]
        graph_nodes = []
        graph_edges = []
        if view in {"combined", "rules"}:
            rule_ids = {item["id"] for item in items if item["source"] == "rule_db"}
            graph_nodes = [
                {
                    "id": node.get("node_id"),
                    "label": node.get("label", "规则节点"),
                    "related_claim_types": node.get("related_claim_types", []),
                    "score": node.get("score", 0.85),
                }
                for node in self.rule_graph.get("nodes", [])
                if node.get("node_id") in rule_ids
            ]
            graph_edges = [
                edge for edge in self.rule_graph.get("edges", [])
                if edge.get("from") in rule_ids or edge.get("to") in rule_ids
            ][:80]

        source_counts = {}
        for doc in docs:
            source_counts[doc["source"]] = source_counts.get(doc["source"], 0) + 1
        return {
            "view": view,
            "query": query,
            "items": items,
            "graph": {"nodes": graph_nodes, "edges": graph_edges},
            "source_counts": source_counts,
            "modules": self._module_status(docs),
            "embedding_status": self.embedding_status,
        }

    def get_knowledge_architecture(self) -> Dict[str, Any]:
        docs = self._build_embedding_documents()
        return {
            "name": "StreamGuard layered RAG knowledge base",
            "description": "按知识生命周期组织实时话术、历史记录、规则图谱和证据文档，并在查询时进行多库路由与混合检索。",
            "modules": self._module_status(docs),
            "source_to_module": SOURCE_TO_MODULE,
            "retrieval_flow": [
                "采集实时转写、弹幕、历史报告、规则图谱和证据材料。",
                "按模块写入不同知识源，保留 source、module、session_id、timestamp、related_claim_types 等元数据。",
                "查询时先做视图/意图路由，再在目标模块中执行 embedding 或 TF-IDF 检索。",
                "召回结果按 source_weights、相似度和基础置信度融合排序。",
                "规则图谱节点补充命中规则、证据要求和风险解释，最终生成可引用答案。",
            ],
            "recommended_views": [
                {"view": "combined", "purpose": "日常审核问答，跨规则、历史、证据和实时内容联合召回。"},
                {"view": "live", "purpose": "只看当前直播间实时转写命中。"},
                {"view": "history", "purpose": "查找相似历史案例和已沉淀话术。"},
                {"view": "rules", "purpose": "解释命中的法规、平台规则和证据要求。"},
                {"view": "docs", "purpose": "查找可引用证明材料。"},
            ],
        }

    def _public_doc(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        similarity = doc.get("similarity")
        score = float(doc.get("score", doc.get("base_score", 0.75)) or 0.0)
        reason_parts = []
        if similarity is not None:
            reason_parts.append(f"语义相似度 {float(similarity):.3f}")
        reason_parts.append(f"综合相关度 {score:.3f}")
        source = doc.get("source")
        if source == "rule_db":
            reason_parts.append("命中法规或平台规则节点")
        elif source == "historical_case":
            reason_parts.append("可对照历史处置经验")
        elif source == "evidence_db":
            reason_parts.append("可作为材料证据引用")
        elif source == "asr_context":
            reason_parts.append("来自当前直播间实时话术")
        meta = self._public_meta(doc.get("meta", {}))
        if meta.get("risk_type"):
            reason_parts.append(f"风险类型 {meta['risk_type']}")
        content = doc.get("content", "")
        return {
            "id": doc.get("id"),
            "source": source,
            "module": doc.get("module") or SOURCE_TO_MODULE.get(source),
            "title": doc.get("title") or doc.get("id"),
            "content": content,
            "related_claim_types": doc.get("related_claim_types", []),
            "score": score,
            "similarity": similarity,
            "retrieval_reason": "，".join(reason_parts),
            "match_snippet": content[:120],
            "meta": meta,
        }

    def _module_status(self, docs: List[Dict[str, Any]]) -> Dict[str, Any]:
        source_counts: Dict[str, int] = {}
        module_counts: Dict[str, int] = {}
        for doc in docs:
            source = doc.get("source", "unknown")
            module_id = doc.get("module") or SOURCE_TO_MODULE.get(source, "unknown")
            source_counts[source] = source_counts.get(source, 0) + 1
            module_counts[module_id] = module_counts.get(module_id, 0) + 1

        return {
            module_id: {
                **module,
                "document_count": module_counts.get(module_id, 0),
                "source_counts": {source: source_counts.get(source, 0) for source in module["sources"]},
            }
            for module_id, module in KNOWLEDGE_MODULES.items()
        }

    def _public_meta(self, meta: Dict[str, Any]) -> Dict[str, Any]:
        allowed = [
            "session_id",
            "room_id",
            "timestamp",
            "created_at",
            "source",
            "risk_type",
            "case_id",
            "evidence_id",
            "node_id",
        ]
        return {key: meta.get(key) for key in allowed if meta.get(key) is not None}

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

    def _normalize_possible_mojibake(self, text: str) -> str:
        value = (text or "").strip()
        if not value:
            return value

        original_cjk = sum(1 for ch in value if "\u4e00" <= ch <= "\u9fff")
        suspicious = sum(1 for ch in value if 0x80 <= ord(ch) <= 0xFF)
        if suspicious == 0:
            return value

        try:
            repaired = value.encode("latin1").decode("utf-8")
        except UnicodeError:
            return value

        repaired_cjk = sum(1 for ch in repaired if "\u4e00" <= ch <= "\u9fff")
        return repaired if repaired_cjk > original_cjk else value

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
            "module": SOURCE_TO_MODULE.get(source, "unknown"),
        }

    def _search_documents(
        self,
        query: str,
        docs: List[Dict[str, Any]],
        sources: Optional[Set[str]] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        if self.embedding_index and self.embedding_docs:
            hits = self.embedding_search(query, limit=limit, sources=sources)
            if hits:
                return hits

        scoped_docs = [doc for doc in docs if not sources or doc["source"] in sources]
        if not query.strip() or not scoped_docs:
            return []

        weights = self.config.get("source_weights", {})
        vectorizer = TfidfVectorizer(max_features=1200, stop_words="english")
        matrix = vectorizer.fit_transform([doc.get("content", "") for doc in scoped_docs])
        similarities = cosine_similarity(vectorizer.transform([query]), matrix)[0]
        hits = []
        for doc, similarity in zip(scoped_docs, similarities):
            base_score = float(doc.get("base_score", 0.75))
            source_weight = float(weights.get(doc["source"], 1.0))
            score = (float(similarity) * 0.75 + base_score * 0.25) * source_weight
            hits.append({**doc, "similarity": float(similarity), "score": score})
        hits.sort(key=lambda item: item["score"], reverse=True)
        return hits[:limit]

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
        query = self._normalize_possible_mojibake(query)
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
            "session_id": event.session_id,
            "source": event.source,
            "timestamp": event.timestamp,
            "module": "live_transcript",
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
            "session_id": event.session_id,
            "timestamp": event.timestamp,
            "module": "historical_records",
        }, persist=persist)

    def _detect_claim_rules(self, content: str) -> List[Dict[str, Any]]:
        return [
            rule for rule in CLAIM_DETECTION_RULES
            if any(keyword in content for keyword in rule["keywords"])
        ]

    def _fallback_claim_case(self, content: str, claim_types: List[ClaimType], detected_rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        required_evidence: List[str] = []
        for rule in detected_rules:
            for item in rule.get("required_evidence", []):
                if item not in required_evidence:
                    required_evidence.append(item)
        primary_subject = detected_rules[0]["subject"] if detected_rules else "当前商品"
        return {
            "current_utterance": content,
            "slots": {"subject": primary_subject, "value": content},
            "required_evidence": required_evidence,
        }

    def _pick_best_claim_case(self, content: str, claim_types: List[ClaimType], detected_rules: List[Dict[str, Any]]) -> tuple[Dict[str, Any], float]:
        type_values = {claim_type.value for claim_type in claim_types}
        best_case = None
        confidence = 0.85
        if self.config["retrieval"]["mode"] == "embedding" and self.embedding_index:
            hits = self.embedding_search(content, limit=int(self.config["retrieval"]["claim_top_k"]), sources={"claim_case"})
            for hit in hits:
                candidate = hit["meta"]
                candidate_types = set(candidate.get("claim_type", []))
                if type_values & candidate_types:
                    best_case = candidate
                    confidence = max(0.65, min(0.95, float(hit.get("similarity", confidence))))
                    break

        if not best_case and self.claim_cases:
            query_vector = self.vectorizer.transform([content])
            similarities = cosine_similarity(query_vector, self.claim_matrix)[0]
            top_indices = np.argsort(similarities)[-int(self.config["retrieval"]["claim_top_k"]):][::-1]
            for idx in top_indices:
                candidate = self.claim_cases[int(idx)]
                candidate_types = set(candidate.get("claim_type", []))
                if type_values & candidate_types:
                    best_case = candidate
                    confidence = max(0.6, min(0.9, float(similarities[int(idx)])))
                    break

        if not best_case:
            best_case = self._fallback_claim_case(content, claim_types, detected_rules)
            confidence = 0.72
        return best_case, confidence

    def rule_gate(self, event: LiveSemanticEvent) -> bool:
        return bool(self._detect_claim_rules(event.raw_content))

    def claim_rag(self, event: LiveSemanticEvent) -> Optional[Claim]:
        content = event.raw_content
        detected_rules = self._detect_claim_rules(content)
        claim_types = [rule["claim_type"] for rule in detected_rules]
        if not claim_types:
            return None

        best_case, confidence = self._pick_best_claim_case(content, claim_types, detected_rules)
        slots = best_case.get("slots", {})
        required_evidence: List[str] = []
        for item in best_case.get("required_evidence", []):
            normalized = str(item or "").strip()
            if normalized and normalized.lower() != "none" and normalized not in required_evidence:
                required_evidence.append(normalized)
        for rule in detected_rules:
            for item in rule.get("required_evidence", []):
                normalized = str(item or "").strip()
                if normalized and normalized.lower() != "none" and normalized not in required_evidence:
                    required_evidence.append(normalized)
        if not required_evidence:
            required_evidence = ["product_spec"]
        value_candidates = [
            slots.get("price_term", ""),
            slots.get("quantity", ""),
            slots.get("quality", ""),
            slots.get("authority", ""),
            slots.get("comparison", ""),
            slots.get("guarantee", ""),
            slots.get("time", ""),
            slots.get("value", ""),
        ]
        values = [item for item in value_candidates if item]
        return Claim(
            claim_id=f"claim_{event.event_id}",
            claim_type=claim_types,
            subject=slots.get("subject", detected_rules[0]["subject"] if detected_rules else "当前商品"),
            predicate=[best_case.get("current_utterance", content)],
            value=values or [content],
            required_evidence=required_evidence,
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
        missing_requirements = []
        for ct in claim.claim_type:
            relevant = [ev for ev in evidences if ct in ev.related_claim_types or ev.source in {"rule_db", "historical_case"}]
            verdict = VerificationVerdict.SUPPORTED if relevant else VerificationVerdict.NOT_ENOUGH_EVIDENCE
            support_status[ct.value] = verdict
            if verdict == VerificationVerdict.NOT_ENOUGH_EVIDENCE:
                missing_requirements.extend(
                    req for req in claim.required_evidence
                    if req not in missing_requirements
                )
        verdict = (
            VerificationVerdict.NOT_ENOUGH_EVIDENCE
            if any(value == VerificationVerdict.NOT_ENOUGH_EVIDENCE for value in support_status.values())
            else VerificationVerdict.SUPPORTED
        )
        if verdict == VerificationVerdict.SUPPORTED:
            reason = "证据充足"
        else:
            if missing_requirements:
                reason = f"当前证据不足，仍缺少：{', '.join(missing_requirements[:4])}。"
            else:
                reason = "当前证据不足，需要补充价格、库存、功效、背书或售后依据。"
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
            seen = set()
            for claim_type in claim.claim_type:
                for suggestion in CLAIM_SUGGESTIONS.get(claim_type, []):
                    if suggestion not in seen:
                        seen.add(suggestion)
                        suggestions.append(suggestion)
            if not suggestions:
                suggestions.append("当前高风险话术需要回到可核验、可追溯的中性表达。")
        return Report(summary=f"检测到 {len(claim.claim_type)} 类主张，风险等级 {risk.level.value}。", suggestions=suggestions, risk_level=risk.level)

    def rag_qa(self, question: str, claim: Claim, evidences: List[Evidence]) -> str:
        if "为什么" in question:
            return "该结论基于当前召回证据、证据缺口和规则图谱节点综合判断。"
        if "改写" in question:
            return "建议避免绝对化、稀缺性和功效承诺，改为可核验的中性描述。"
        return "基于当前证据，该主张仍需要更多可追溯材料支持。"

    def answer_question(self, question: str, context: Optional[Dict[str, Any]] = None, evidence_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        context = context or {}
        evidence_ids = evidence_ids or []
        utterances = context.get("utterances") or []
        context_text = "\n".join([
            item.get("display_text") or item.get("text") or ""
            for item in utterances[:12]
            if isinstance(item, dict)
        ]).strip()
        query = " ".join([question, context_text])[:4000]

        selected = []
        if evidence_ids:
            lookup = {doc["id"]: doc for doc in self._build_embedding_documents()}
            selected = [self._public_doc(lookup[eid]) for eid in evidence_ids if eid in lookup]

        hits = self.embedding_search(query, limit=int(self.config["retrieval"]["final_k"])) if self.embedding_index else []
        if not hits:
            hits = self.get_knowledge_view("combined", limit=int(self.config["retrieval"]["final_k"]), query=question)["items"]
        else:
            hits = [self._public_doc(hit) for hit in hits]

        citations = selected + [item for item in hits if item["id"] not in {ev["id"] for ev in selected}]
        citations = citations[: max(4, int(self.config["retrieval"]["final_k"]))]
        fallback = self._fallback_answer(question, context_text, citations)

        client = self._openai_client("llm_scoring")
        if client is None or not self.config["llm_scoring"].get("enabled"):
            return {**fallback, "used_llm": False, "reason": "missing_llm_api_key_or_disabled"}

        scoring = self.config["llm_scoring"]
        payload = {
            "question": question,
            "live_context": context_text,
            "session_stats": context.get("sessionStats") or {},
            "room_id": context.get("roomId"),
            "citations": citations,
        }
        try:
            response = client.chat.completions.create(
                model=scoring["model"],
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是直播电商监管审核助手。只能基于给定直播上下文和证据回答。"
                            "输出严格 JSON，字段为 conclusion, risk_level, basis, regulations, cases, action_suggestions, citations。"
                        ),
                    },
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                temperature=float(scoring["temperature"]),
                top_p=float(scoring["top_p"]),
                max_tokens=int(scoring["max_tokens"]),
                timeout=int(scoring["timeout_seconds"]),
            )
            content = response.choices[0].message.content or "{}"
            match = re.search(r"\{.*\}", content, flags=re.S)
            parsed = json.loads(match.group(0) if match else content)
            return {
                "question": question,
                "conclusion": parsed.get("conclusion") or fallback["conclusion"],
                "risk_level": parsed.get("risk_level") or fallback["risk_level"],
                "basis": parsed.get("basis") or fallback["basis"],
                "regulations": parsed.get("regulations") or fallback["regulations"],
                "cases": parsed.get("cases") or fallback["cases"],
                "action_suggestions": parsed.get("action_suggestions") or fallback["action_suggestions"],
                "citations": citations,
                "used_llm": True,
                "model": scoring["model"],
            }
        except Exception as exc:
            return {**fallback, "used_llm": False, "reason": f"llm_answer_failed: {exc}"}

    def _fallback_answer(self, question: str, context_text: str, citations: List[Dict[str, Any]]) -> Dict[str, Any]:
        risk_level = "P1" if any(term in context_text for term in ["全网最低", "最低价", "只剩", "最后"]) else "P2"
        basis = [
            "当前回答使用规则库、历史案例和证据片段进行证据约束检索。",
            "如果直播话术包含绝对化价格、稀缺库存或功效承诺，应要求补充可追溯证明材料。",
        ]
        regulations = [item for item in citations if item.get("source") == "rule_db"][:3]
        cases = [item for item in citations if item.get("source") == "historical_case"][:3]
        return {
            "question": question,
            "conclusion": "当前信息提示存在需要复核的直播话术风险，建议围绕价格真实性、库存依据和功效证明继续取证。",
            "risk_level": risk_level,
            "basis": basis,
            "regulations": regulations,
            "cases": cases,
            "action_suggestions": [
                "要求主播或商家提供价格对比、库存活动规则和功效证明材料。",
                "将相关话术片段与命中证据一起归档，便于后续复核。",
                "如果证据不足，不直接作最终处罚判断，先标记人工复核。",
            ],
            "citations": citations,
        }

    def evaluate_live_context(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        context = context or {}
        utterances = context.get("utterances") or []
        stats = context.get("sessionStats") or {}
        candidates = [
            item.get("display_text") or item.get("text") or ""
            for item in utterances[:8]
            if isinstance(item, dict)
        ]
        matched = []
        for idx, text in enumerate(candidates):
            if not text.strip():
                continue
            result = self.process_event(
                LiveSemanticEvent(
                    event_id=f"eval_{int(time.time() * 1000)}_{idx}",
                    session_id="rag_live_evaluation",
                    timestamp=time.time(),
                    modality="text",
                    source="rag_live_evaluation",
                    raw_content=text,
                    confidence=0.9,
                ),
                persist_discovery=False,
                enable_llm_scoring=False,
            )
            if result.claim or result.evidence:
                matched.append(result.dict())
        highest = "P3"
        for result in matched:
            level = (result.get("risk") or {}).get("level")
            if level in ["P0", "P1", "P2"]:
                highest = level
                break
        return {
            "room_id": context.get("roomId"),
            "risk_level": highest if matched else ("P2" if (stats.get("trap") or 0) > 0 else "P3"),
            "summary": "已基于当前直播话术、规则库和案例库生成审核视角评价。" if matched else "当前直播间暂无足够 RAG 命中，仍可通过知识库问答进行人工核验。",
            "matched_count": len(matched),
            "matched_results": matched[:5],
            "session_stats": stats,
        }

    def answer_question(self, question: str, context: Optional[Dict[str, Any]] = None, evidence_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        context = context or {}
        evidence_ids = evidence_ids or []
        utterances = context.get("utterances") or []
        context_text = "\n".join([
            item.get("display_text") or item.get("text") or ""
            for item in utterances[:12]
            if isinstance(item, dict)
        ]).strip()
        query = " ".join([question, context_text])[:4000]

        selected = []
        if evidence_ids:
            lookup = {doc["id"]: doc for doc in self._build_embedding_documents()}
            selected = [self._public_doc(lookup[eid]) for eid in evidence_ids if eid in lookup]

        hits = self.embedding_search(query, limit=int(self.config["retrieval"]["final_k"])) if self.embedding_index else []
        if not hits:
            hits = self.get_knowledge_view("combined", limit=int(self.config["retrieval"]["final_k"]), query=question)["items"]
        else:
            hits = [self._public_doc(hit) for hit in hits]

        citations = selected + [item for item in hits if item["id"] not in {ev["id"] for ev in selected}]
        citations = citations[: max(4, int(self.config["retrieval"]["final_k"]))]
        fallback = self._fallback_answer(question, context_text, citations)

        client = self._openai_client("llm_scoring")
        if client is None or not self.config["llm_scoring"].get("enabled"):
            return {**fallback, "used_llm": False, "reason": "missing_llm_api_key_or_disabled"}

        scoring = self.config["llm_scoring"]
        payload = {
            "question": question,
            "live_context": context_text,
            "session_stats": context.get("sessionStats") or {},
            "room_id": context.get("roomId"),
            "citations": citations,
        }
        try:
            response = client.chat.completions.create(
                model=scoring["model"],
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是直播电商监管审核助手。只能基于给定直播上下文和证据回答，不引入外部事实。"
                            "输出严格 JSON，字段为 conclusion, risk_level, basis, regulations, cases, action_suggestions, citations。"
                            "结论必须说明判断依据、相似案例和仍需人工复核的不确定点。"
                        ),
                    },
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                temperature=float(scoring["temperature"]),
                top_p=float(scoring["top_p"]),
                max_tokens=int(scoring["max_tokens"]),
                timeout=int(scoring["timeout_seconds"]),
            )
            content = response.choices[0].message.content or "{}"
            match = re.search(r"\{.*\}", content, flags=re.S)
            parsed = json.loads(match.group(0) if match else content)
            return {
                "question": question,
                "conclusion": parsed.get("conclusion") or fallback["conclusion"],
                "risk_level": parsed.get("risk_level") or fallback["risk_level"],
                "basis": parsed.get("basis") or fallback["basis"],
                "regulations": parsed.get("regulations") or fallback["regulations"],
                "cases": parsed.get("cases") or fallback["cases"],
                "action_suggestions": parsed.get("action_suggestions") or fallback["action_suggestions"],
                "citations": citations,
                "used_llm": True,
                "model": scoring["model"],
            }
        except Exception as exc:
            return {**fallback, "used_llm": False, "reason": f"llm_answer_failed: {exc}"}

    def _fallback_answer(self, question: str, context_text: str, citations: List[Dict[str, Any]]) -> Dict[str, Any]:
        high_risk_terms = ["全网最低", "最低价", "只剩", "最后", "包治", "根治", "绝对有效"]
        risk_level = "P1" if any(term in context_text for term in high_risk_terms) else "P2"
        regulations = [item for item in citations if item.get("source") == "rule_db"][:3]
        cases = [item for item in citations if item.get("source") == "historical_case"][:3]
        return {
            "question": question,
            "conclusion": "当前信息提示存在需要复核的直播话术风险，建议围绕价格真实性、库存依据和功效证明继续取证。",
            "risk_level": risk_level,
            "basis": [
                "当前回答使用规则库、历史案例和证据片段进行证据约束检索。",
                "如果直播话术包含绝对化价格、稀缺库存或功效承诺，应要求补充可追溯证明材料。",
            ],
            "regulations": regulations,
            "cases": cases,
            "action_suggestions": [
                "要求主播或商家提供价格对比、库存活动规则和功效证明材料。",
                "将相关话术片段与命中证据一起归档，便于后续复核。",
                "如果证据不足，不直接作最终处置判断，先标记人工复核。",
            ],
            "citations": citations,
        }

    def evaluate_live_context(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        context = context or {}
        utterances = context.get("utterances") or []
        stats = context.get("sessionStats") or {}
        candidates = [
            item.get("display_text") or item.get("text") or ""
            for item in utterances[:8]
            if isinstance(item, dict)
        ]
        matched = []
        for idx, text in enumerate(candidates):
            if not text.strip():
                continue
            result = self.process_event(
                LiveSemanticEvent(
                    event_id=f"eval_{int(time.time() * 1000)}_{idx}",
                    session_id="rag_live_evaluation",
                    timestamp=time.time(),
                    modality="text",
                    source="rag_live_evaluation",
                    raw_content=text,
                    confidence=0.9,
                ),
                persist_discovery=False,
                enable_llm_scoring=False,
            )
            if result.claim or result.evidence:
                matched.append(result.dict())

        highest = "P3"
        for result in matched:
            level = (result.get("risk") or {}).get("level")
            if level in ["P0", "P1", "P2"]:
                highest = level
                break

        return {
            "room_id": context.get("roomId"),
            "risk_level": highest if matched else ("P2" if (stats.get("trap") or 0) > 0 else "P3"),
            "summary": (
                "已基于当前直播话术、规则库和案例库生成审核视角评价。"
                if matched
                else "当前直播间暂无足够 RAG 命中，仍可通过知识库问答进行人工核验。"
            ),
            "matched_count": len(matched),
            "matched_results": matched[:5],
            "session_stats": stats,
            "evaluated_at": int(time.time()),
        }

    def process_event(self, event: LiveSemanticEvent, persist_discovery: bool = True, enable_llm_scoring: bool = True) -> AnalysisResult:
        trace = []
        rag_debug: Dict[str, Any] = {}
        normalized_content = self._normalize_possible_mojibake(event.raw_content)
        if normalized_content != event.raw_content:
            event = event.copy(update={"raw_content": normalized_content})
        if persist_discovery:
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

        llm_score = self.llm_score_claim(claim, evidences, verification) if enable_llm_scoring else None
        if llm_score:
            rag_debug["llm_scoring"] = llm_score
            trace.append({"step": "llm_scoring", "used": bool(llm_score.get("used")), "model": llm_score.get("model"), "reason": llm_score.get("reason")})
            evidences = self.apply_llm_rerank(evidences, llm_score)

        risk = self.risk_scorer(claim, verification, evidences, llm_score=llm_score)
        trace.append({"step": "risk_scorer", "score": risk.score, "level": risk.level.value})
        report = self.report_generator(claim, risk)
        trace.append({"step": "report_generator", "suggestions_count": len(report.suggestions)})
        graph = self.graph_for_claim(claim)
        if persist_discovery:
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
        normalized_text = self._normalize_possible_mojibake(text)
        event = LiveSemanticEvent(
            event_id=f"test_{int(time.time() * 1000)}",
            session_id="rag_settings_test",
            timestamp=time.time(),
            modality=Modality.TEXT,
            source="rag_settings",
            raw_content=normalized_text,
            confidence=0.9,
        )
        return self.process_event(event, persist_discovery=False).dict()

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
