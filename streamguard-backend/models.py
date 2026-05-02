from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from enum import Enum

class Modality(str, Enum):
    ASR = "asr"
    TEXT = "text"
    CHAT = "chat"

class LiveSemanticEvent(BaseModel):
    event_id: str
    session_id: str
    timestamp: float
    modality: Modality
    source: str
    raw_content: str
    product_id: Optional[str] = None
    confidence: float

class ClaimType(str, Enum):
    PRICE_CLAIM = "price_claim"
    SCARCITY_CLAIM = "scarcity_claim"
    EFFICACY_CLAIM = "efficacy_claim"
    AUTHORITY_CLAIM = "authority_claim"
    QUALITY_CLAIM = "quality_claim"
    COMPARISON_CLAIM = "comparison_claim"
    GUARANTEE_CLAIM = "guarantee_claim"
    PRESSURE_CLAIM = "pressure_claim"
    NEUTRAL_FACT = "neutral_fact"

class Claim(BaseModel):
    claim_id: str
    claim_type: List[ClaimType]
    subject: str
    predicate: List[str]
    value: List[str]
    required_evidence: List[str]
    confidence: float

class EvidenceStance(str, Enum):
    SUPPORTING = "supporting"
    REFUTING = "refuting"
    INSUFFICIENT = "insufficient"
    RISK_SUPPORTING = "risk_supporting"
    NEUTRAL = "neutral"

class Evidence(BaseModel):
    evidence_id: str
    source: str
    title: str
    content: str
    stance: EvidenceStance
    score: float
    related_claim_types: List[ClaimType]

class VerificationVerdict(str, Enum):
    SUPPORTED = "supported"
    REFUTED = "refuted"
    NOT_ENOUGH_EVIDENCE = "not_enough_evidence"
    CONFLICT = "conflict"

class Verification(BaseModel):
    verdict: VerificationVerdict
    support_status: Dict[str, VerificationVerdict]
    reason: str
    human_review_required: bool

class RiskLevel(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"

class Risk(BaseModel):
    score: float
    level: RiskLevel
    factors: Dict[str, float]

class Report(BaseModel):
    summary: str
    suggestions: List[str]
    risk_level: RiskLevel

class AnalysisResult(BaseModel):
    event: LiveSemanticEvent
    claim: Optional[Claim] = None
    evidence: List[Evidence] = []
    verification: Optional[Verification] = None
    risk: Optional[Risk] = None
    report: Optional[Report] = None
    trace: List[Dict[str, Any]] = []
    graph: Dict[str, Any] = {}
    rag_debug: Dict[str, Any] = {}

# For RAG QA
class RAGQuestion(BaseModel):
    session_id: str
    claim_id: str
    question: str

class RAGAnswer(BaseModel):
    answer: str
    used_evidence: List[str]
    suggested_followups: List[str]