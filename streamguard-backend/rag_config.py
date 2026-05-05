import copy
import json
import os
from typing import Any, Dict


CONFIG_PATH = os.path.join(os.path.dirname(__file__), "rag_config.json")


def _env_value(name: str, default: str = "") -> str:
    value = os.getenv(name, default).strip()
    placeholder_fragments = ("your-", "sk-your", "xxx", "...")
    if any(fragment in value.lower() for fragment in placeholder_fragments):
        return ""
    return value


def default_rag_config() -> Dict[str, Any]:
    return {
        "embedding": {
            "enabled": True,
            "provider": _env_value("EMBEDDING_PROVIDER", "aihubmix") or "aihubmix",
            "model": _env_value("EMBEDDING_MODEL", "text-embedding-3-small") or "text-embedding-3-small",
            "base_url": _env_value("EMBEDDING_BASE_URL", "https://aihubmix.com/v1") or "https://aihubmix.com/v1",
            "api_key_env": _env_value("EMBEDDING_API_KEY_ENV", "EMBEDDING_API_KEY") or "EMBEDDING_API_KEY",
            "dimensions": int(_env_value("EMBEDDING_DIMENSIONS", "1536") or "1536"),
            "batch_size": int(_env_value("EMBEDDING_BATCH_SIZE", "64") or "64"),
        },
        "retrieval": {
            "mode": "embedding",
            "claim_top_k": 3,
            "top_k": 20,
            "final_k": 5,
            "similarity_threshold": 0.15,
            "dedupe_threshold": 0.92,
        },
        "source_weights": {
            "evidence_db": 1.0,
            "rule_db": 0.95,
            "historical_case": 0.9,
            "asr_context": 1.1,
            "claim_case": 0.7,
        },
        "llm_scoring": {
            "enabled": True,
            "rerank_enabled": True,
            "provider": _env_value("LLM_PROVIDER", "deepseek") or "deepseek",
            "model": _env_value("LLM_MODEL", "deepseek-v4-flash") or "deepseek-v4-flash",
            "base_url": _env_value("LLM_BASE_URL", "https://api.deepseek.com") or "https://api.deepseek.com",
            "api_key_env": "DEEPSEEK_API_KEY",
            "temperature": float(_env_value("RAG_LLM_TEMPERATURE", "0.0") or "0.0"),
            "top_p": float(_env_value("RAG_LLM_TOP_P", "1.0") or "1.0"),
            "max_tokens": int(_env_value("RAG_LLM_MAX_TOKENS", "4000") or "4000"),
            "timeout_seconds": int(_env_value("RAG_LLM_TIMEOUT_SECONDS", "30") or "30"),
        },
        "risk": {
            "thresholds": {"p0": 0.80, "p1": 0.50, "p2": 0.30},
            "weights": {
                "rule_severity": 0.30,
                "claim_risk": 0.25,
                "evidence_missing": 0.20,
                "evidence_conflict": 0.15,
                "chat_questioning": 0.05,
                "historical_similarity": 0.05,
            },
            "llm_blend": 0.45,
            "human_review_on_low_confidence": True,
            "human_review_confidence_threshold": 0.55,
        },
    }


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _clamp_float(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        return max(minimum, min(maximum, float(value)))
    except (TypeError, ValueError):
        return fallback


def _clamp_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        return max(minimum, min(maximum, int(value)))
    except (TypeError, ValueError):
        return fallback


def validate_rag_config(config: Dict[str, Any]) -> Dict[str, Any]:
    defaults = default_rag_config()
    cfg = _deep_merge(defaults, config or {})

    embedding = cfg["embedding"]
    embedding["enabled"] = bool(embedding.get("enabled"))
    embedding["provider"] = str(embedding.get("provider") or defaults["embedding"]["provider"]).strip()
    embedding["model"] = str(embedding.get("model") or defaults["embedding"]["model"]).strip()
    embedding["base_url"] = str(embedding.get("base_url") or defaults["embedding"]["base_url"]).strip().rstrip("/")
    embedding["api_key_env"] = str(embedding.get("api_key_env") or "EMBEDDING_API_KEY").strip()
    embedding["dimensions"] = _clamp_int(embedding.get("dimensions"), 128, 8192, 1536)
    embedding["batch_size"] = _clamp_int(embedding.get("batch_size"), 1, 256, 64)

    retrieval = cfg["retrieval"]
    retrieval["mode"] = "embedding" if retrieval.get("mode") == "embedding" else "tfidf"
    retrieval["claim_top_k"] = _clamp_int(retrieval.get("claim_top_k"), 1, 20, 3)
    retrieval["top_k"] = _clamp_int(retrieval.get("top_k"), 1, 100, 20)
    retrieval["final_k"] = _clamp_int(retrieval.get("final_k"), 1, 30, 5)
    retrieval["similarity_threshold"] = _clamp_float(retrieval.get("similarity_threshold"), 0.0, 1.0, 0.15)
    retrieval["dedupe_threshold"] = _clamp_float(retrieval.get("dedupe_threshold"), 0.5, 1.0, 0.92)

    for key, value in list(cfg["source_weights"].items()):
        cfg["source_weights"][key] = _clamp_float(value, 0.0, 3.0, defaults["source_weights"].get(key, 1.0))

    scoring = cfg["llm_scoring"]
    scoring["enabled"] = bool(scoring.get("enabled"))
    scoring["rerank_enabled"] = bool(scoring.get("rerank_enabled"))
    scoring["provider"] = str(scoring.get("provider") or defaults["llm_scoring"]["provider"]).strip()
    scoring["model"] = str(scoring.get("model") or defaults["llm_scoring"]["model"]).strip()
    scoring["base_url"] = str(scoring.get("base_url") or defaults["llm_scoring"]["base_url"]).strip().rstrip("/")
    scoring["api_key_env"] = str(scoring.get("api_key_env") or "DEEPSEEK_API_KEY").strip()
    scoring["temperature"] = _clamp_float(scoring.get("temperature"), 0.0, 2.0, 0.0)
    scoring["top_p"] = _clamp_float(scoring.get("top_p"), 0.0, 1.0, 1.0)
    scoring["max_tokens"] = _clamp_int(scoring.get("max_tokens"), 128, 4096, 700)
    scoring["timeout_seconds"] = _clamp_int(scoring.get("timeout_seconds"), 3, 120, 20)

    thresholds = cfg["risk"]["thresholds"]
    thresholds["p0"] = _clamp_float(thresholds.get("p0"), 0.0, 1.0, 0.80)
    thresholds["p1"] = _clamp_float(thresholds.get("p1"), 0.0, thresholds["p0"], 0.50)
    thresholds["p2"] = _clamp_float(thresholds.get("p2"), 0.0, thresholds["p1"], 0.30)
    cfg["risk"]["llm_blend"] = _clamp_float(cfg["risk"].get("llm_blend"), 0.0, 1.0, 0.45)
    cfg["risk"]["human_review_on_low_confidence"] = bool(cfg["risk"].get("human_review_on_low_confidence"))
    cfg["risk"]["human_review_confidence_threshold"] = _clamp_float(
        cfg["risk"].get("human_review_confidence_threshold"), 0.0, 1.0, 0.55
    )
    return cfg


def load_rag_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        return validate_rag_config({})
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return validate_rag_config(json.load(f))
    except Exception:
        return validate_rag_config({})


def save_rag_config(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = validate_rag_config(config)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg


def public_rag_config(config: Dict[str, Any]) -> Dict[str, Any]:
    cfg = copy.deepcopy(validate_rag_config(config))
    embedding_key_env = cfg["embedding"].get("api_key_env") or "EMBEDDING_API_KEY"
    scoring_key_env = cfg["llm_scoring"].get("api_key_env") or "DEEPSEEK_API_KEY"
    cfg["embedding"]["api_key_configured"] = bool(_env_value(embedding_key_env))
    cfg["llm_scoring"]["api_key_configured"] = bool(_env_value(scoring_key_env))
    return cfg
