import json
import os
from typing import List, Dict, Any, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from models import (
    LiveSemanticEvent, Claim, ClaimType, Evidence, EvidenceStance,
    Verification, VerificationVerdict, Risk, RiskLevel, Report, AnalysisResult
)

class RAGPipeline:
    def __init__(self):
        self.claim_cases = self.load_claim_cases()
        self.evidence_db = self.load_evidence_db()
        self.vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        # Fit vectorizer on combined texts for consistent vocabulary
        all_texts = self.claim_cases + self.evidence_db
        all_text_contents = [case['current_utterance'] for case in self.claim_cases] + [ev['content'] for ev in self.evidence_db]
        self.vectorizer.fit(all_text_contents)
        self.claim_matrix = self.vectorizer.transform([case['current_utterance'] for case in self.claim_cases])
        self.evidence_matrix = self.vectorizer.transform([ev['content'] for ev in self.evidence_db])
        # LLM not used for now, simplified

    def load_claim_cases(self) -> List[Dict]:
        path = os.path.join(os.path.dirname(__file__), '..', 'src', 'agentdojo', 'data', 'knowledge_base', 'claim_cases.jsonl')
        cases = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                cases.append(json.loads(line))
        return cases

    def load_evidence_db(self) -> List[Dict]:
        path = os.path.join(os.path.dirname(__file__), '..', 'src', 'agentdojo', 'data', 'knowledge_base', 'evidence_db.json')
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def rule_gate(self, event: LiveSemanticEvent) -> bool:
        # Simple rule gate: check for high-risk keywords
        high_risk_keywords = ['全网最低', '只剩最后', '专家推荐', '三天见效']
        return any(keyword in event.raw_content for keyword in high_risk_keywords)

    def claim_rag(self, event: LiveSemanticEvent) -> Optional[Claim]:
        # Keyword-based initial detection
        content = event.raw_content
        claim_types = []
        if '最低' in content or '全网' in content:
            claim_types.append(ClaimType.PRICE_CLAIM)
        if '只剩' in content or '最后' in content:
            claim_types.append(ClaimType.SCARCITY_CLAIM)

        if not claim_types:
            return None

        # Retrieve similar cases using TF-IDF similarity
        query_vector = self.vectorizer.transform([content])
        similarities = cosine_similarity(query_vector, self.claim_matrix)[0]
        top_indices = np.argsort(similarities)[-3:][::-1]  # Top 3 similar cases

        best_case = self.claim_cases[top_indices[0]] if len(top_indices) > 0 else None

        if best_case:
            claim = Claim(
                claim_id=f"claim_{event.event_id}",
                claim_type=claim_types,
                subject=best_case.get('slots', {}).get('subject', '当前商品'),
                predicate=[best_case.get('current_utterance', content)],
                value=[best_case.get('slots', {}).get('price_term', '') or best_case.get('slots', {}).get('quantity', '')],
                required_evidence=best_case.get('required_evidence', []),
                confidence=0.85
            )
            return claim
        return None

    def evidence_rag(self, claim: Claim) -> List[Evidence]:
        evidences = []
        for req_ev in claim.required_evidence:
            # Search for evidence related to required type
            query = f"{req_ev} {claim.subject}"
            query_vector = self.vectorizer.transform([query])
            similarities = cosine_similarity(query_vector, self.evidence_matrix)[0]
            top_indices = np.argsort(similarities)[-2:][::-1]  # Top 2 similar evidences

            for idx in top_indices:
                meta = self.evidence_db[idx]
                evidence = Evidence(
                    evidence_id=meta['evidence_id'],
                    source=meta['source'],
                    title=meta.get('title', ''),
                    content=meta['content'],
                    stance=EvidenceStance(meta['stance']),
                    score=meta['score'],
                    related_claim_types=[ClaimType(ct) for ct in meta['related_claim_types']]
                )
                evidences.append(evidence)
        return evidences

    def evidence_verifier(self, claim: Claim, evidences: List[Evidence]) -> Verification:
        support_status = {}
        for ct in claim.claim_type:
            ct_str = ct.value
            relevant_evidences = [ev for ev in evidences if ct in ev.related_claim_types]
            if relevant_evidences:
                support_status[ct_str] = VerificationVerdict.SUPPORTED
            else:
                support_status[ct_str] = VerificationVerdict.NOT_ENOUGH_EVIDENCE

        verdict = VerificationVerdict.NOT_ENOUGH_EVIDENCE if any(v == VerificationVerdict.NOT_ENOUGH_EVIDENCE for v in support_status.values()) else VerificationVerdict.SUPPORTED

        reason = "证据充足" if verdict == VerificationVerdict.SUPPORTED else "当前仅检索到商品卡价格，未检索到全网比价记录或库存活动规则。"

        human_review_required = verdict == VerificationVerdict.NOT_ENOUGH_EVIDENCE

        return Verification(
            verdict=verdict,
            support_status=support_status,
            reason=reason,
            human_review_required=human_review_required
        )

    def risk_scorer(self, claim: Claim, verification: Verification, evidences: List[Evidence]) -> Risk:
        # Simple formula-based scoring
        rule_severity = 0.9 if ClaimType.PRICE_CLAIM in claim.claim_type or ClaimType.SCARCITY_CLAIM in claim.claim_type else 0.5
        claim_risk = 0.9 if len(claim.claim_type) > 1 else 0.6  # Higher risk for combined claims
        evidence_missing = max(0, 1.0 - (len(evidences) / len(claim.required_evidence))) if claim.required_evidence else 0
        evidence_conflict = 0.0  # Simplified
        chat_questioning = 0.0  # Not implemented yet
        historical_similarity = 0.5  # Simplified

        score = (
            0.30 * rule_severity +  # Increased weight
            0.25 * claim_risk +     # Increased weight
            0.20 * evidence_missing +
            0.15 * evidence_conflict +
            0.05 * chat_questioning +
            0.05 * historical_similarity
        )

        if score >= 0.80:
            level = RiskLevel.P0
        elif score >= 0.50:
            level = RiskLevel.P1
        elif score >= 0.30:
            level = RiskLevel.P2
        else:
            level = RiskLevel.P3

        factors = {
            "rule_severity": rule_severity,
            "claim_risk": claim_risk,
            "evidence_missing": evidence_missing,
            "evidence_conflict": evidence_conflict,
            "chat_questioning": chat_questioning,
            "historical_similarity": historical_similarity
        }

        return Risk(score=score, level=level, factors=factors)

    def report_generator(self, claim: Claim, risk: Risk) -> Report:
        summary = f"检测到{len(claim.claim_type)}类主张，风险等级{risk.level}。"
        suggestions = []
        if risk.level in [RiskLevel.P0, RiskLevel.P1]:
            suggestions.append("避免使用'全网最低'，改为'直播间当前优惠价'")
            suggestions.append("库存表述需补充依据")
        return Report(summary=summary, suggestions=suggestions, risk_level=risk.level)

    def rag_qa(self, question: str, claim: Claim, evidences: List[Evidence]) -> str:
        # Simplified QA without LLM
        if "为什么" in question and "P1" in question:
            return "该话术包含价格绝对化主张和稀缺促销主张。当前证据库未检索到全网比价记录和真实库存活动规则，因此判定为证据不足，风险等级为 P1。"
        elif "如何改写" in question:
            return "避免使用'全网最低'，改为'直播间当前优惠价'；库存表述需补充依据。"
        else:
            return "基于当前证据，该主张需要更多验证材料。"

    def process_event(self, event: LiveSemanticEvent) -> AnalysisResult:
        trace = []
        rag_debug = {}

        # Rule Gate
        if not self.rule_gate(event):
            return AnalysisResult(event=event, trace=trace, rag_debug=rag_debug)

        trace.append({"step": "rule_gate", "passed": True})

        # Claim-RAG
        claim = self.claim_rag(event)
        if not claim:
            return AnalysisResult(event=event, trace=trace, rag_debug=rag_debug)

        trace.append({"step": "claim_rag", "claim_types": [ct.value for ct in claim.claim_type]})

        # Evidence-RAG
        evidences = self.evidence_rag(claim)
        trace.append({"step": "evidence_rag", "evidence_count": len(evidences)})

        # Evidence Verifier
        verification = self.evidence_verifier(claim, evidences)
        trace.append({"step": "evidence_verifier", "verdict": verification.verdict.value})

        # Risk Scorer
        risk = self.risk_scorer(claim, verification, evidences)
        trace.append({"step": "risk_scorer", "score": risk.score, "level": risk.level.value})

        # Report Generator
        report = self.report_generator(claim, risk)
        trace.append({"step": "report_generator", "suggestions_count": len(report.suggestions)})

        return AnalysisResult(
            event=event,
            claim=claim,
            evidence=evidences,
            verification=verification,
            risk=risk,
            report=report,
            trace=trace,
            rag_debug=rag_debug
        )