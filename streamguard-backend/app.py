"""
StreamGuard Backend - FastAPI Application
"""

import asyncio
import json
import random
import time
import os
import io
import re
import shutil
import sys
import tempfile
import subprocess
import base64
import hashlib
import hmac
import secrets
import sqlite3
from typing import Optional, List, Tuple
from urllib.parse import quote, urljoin, urlparse
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from dotenv import load_dotenv
import httpx

load_dotenv()

# Import RAG Pipeline
try:
    def _compile_rule_graph_from_frontend() -> None:
        """
        Best-effort: compile frontend `complianceRules.js` into backend KB artifacts:
        - `rule_graph.json`
        - `historical_cases.jsonl`
        Falls back silently if Node.js isn't available or export fails.
        """
        try:
            repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
            out_path = os.path.join(repo_root, "src", "agentdojo", "data", "knowledge_base", "rule_graph.json")
            out_cases = os.path.join(repo_root, "src", "agentdojo", "data", "knowledge_base", "historical_cases.jsonl")
            exporter = os.path.join(os.path.dirname(__file__), "scripts", "export_rule_graph.mjs")

            if not os.path.exists(exporter):
                return

            # Use `node` in PATH. If not available, this will fail and we fall back.
            subprocess.run(
                ["node", exporter, out_path, out_cases],
                cwd=repo_root,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            # Keep backend booting even if export fails.
            return

    _compile_rule_graph_from_frontend()

    from rag_pipeline import RAGPipeline
    from models import LiveSemanticEvent, RAGQuestion, Claim, ClaimType
    rag_pipeline = RAGPipeline()
    RAG_AVAILABLE = True
except ImportError as e:
    print(f"[RAG] Import failed: {e}; RAG features disabled")
    RAG_AVAILABLE = False
    rag_pipeline = None
try:
    from openai import AsyncOpenAI, OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from douyin_search import search_douyin_live_rooms, clear_search_cache, \
        get_cookie_status, open_douyin_for_login, _save_douyin_cookies
    SEARCH_AVAILABLE = True
except ImportError:
    SEARCH_AVAILABLE = False
    print("[warn] douyin_search module not found, search will use fallback data")

app = FastAPI(title="StreamGuard Backend")

# ============= Pydantic Models =============
class RoomInfo(BaseModel):
    room_id: str
    anchor_name: Optional[str] = None
    room_title: Optional[str] = None
    viewer_count: Optional[int] = 0
    thumbnail_url: Optional[str] = None
    status: Optional[str] = "living"
    recommendation_score: Optional[float] = 0.5

class CompareStreamsRequest(BaseModel):
    keyword: str
    rooms: List[RoomInfo]
    user_profile: Optional[dict] = None
    stream_context: Optional[dict] = None   # { utterances: [...], chats: [...] }


class RegisterRequest(BaseModel):
    email: str
    password: str
    nickname: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None


class HistorySaveRequest(BaseModel):
    entry: dict
    snapshot: Optional[dict] = None


class HistoryRenameRequest(BaseModel):
    product: str


class RAGConfigRequest(BaseModel):
    config: dict
    rebuild: Optional[bool] = False


class RAGTestRequest(BaseModel):
    text: str

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5178",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup_cleanup():
    try:
        result = subprocess.run(
            ['taskkill', '/F', '/IM', 'chromedriver.exe'],
            capture_output=True, timeout=5
        )
        if result.returncode == 0:
            print("[startup] cleaned stale chromedriver processes")
    except Exception:
        pass


@app.on_event("startup")
async def _startup_init_sqlite():
    _init_sqlite()


# LLM Configuration
def _env_value(name: str, default: str = "") -> str:
    value = os.getenv(name, default).strip()
    placeholder_fragments = ("your-", "sk-your", "xxx", "...")
    if any(fragment in value.lower() for fragment in placeholder_fragments):
        return ""
    return value


LLM_PROVIDER_SETTING = _env_value("LLM_PROVIDER", "deepseek").lower()
DEEPSEEK_API_KEY = _env_value("DEEPSEEK_API_KEY")
OPENROUTER_API_KEY = _env_value("OPENROUTER_API_KEY")
OPENAI_API_KEY = _env_value("OPENAI_API_KEY")

if LLM_PROVIDER_SETTING in ("deepseek", "auto") and DEEPSEEK_API_KEY:
    LLM_API_KEY  = DEEPSEEK_API_KEY
    LLM_PROVIDER = "deepseek"
    LLM_BASE_URL = _env_value("LLM_BASE_URL", "https://api.deepseek.com")
    LLM_MODEL    = _env_value("LLM_MODEL", "deepseek-v4-flash")
elif LLM_PROVIDER_SETTING in ("openrouter", "auto") and OPENROUTER_API_KEY:
    LLM_API_KEY  = OPENROUTER_API_KEY
    LLM_PROVIDER = "openrouter"
    LLM_BASE_URL = _env_value("LLM_BASE_URL", "https://openrouter.ai/api/v1")
    LLM_MODEL    = _env_value("LLM_MODEL", "deepseek/deepseek-v4-flash")
elif LLM_PROVIDER_SETTING in ("openai", "auto") and OPENAI_API_KEY:
    LLM_API_KEY  = OPENAI_API_KEY
    LLM_PROVIDER = "openai"
    LLM_BASE_URL = _env_value("LLM_BASE_URL", "")
    LLM_MODEL    = _env_value("LLM_MODEL", "gpt-4o-mini")
else:
    LLM_API_KEY  = ""
    LLM_PROVIDER = LLM_PROVIDER_SETTING if LLM_PROVIDER_SETTING in ("deepseek", "openrouter", "openai") else "none"
    LLM_BASE_URL = ""
    LLM_MODEL    = ""

if OPENAI_AVAILABLE and LLM_API_KEY:
    try:
        kwargs = {"api_key": LLM_API_KEY}
        if LLM_BASE_URL:
            kwargs["base_url"] = LLM_BASE_URL
        client_sync = OpenAI(**kwargs)
        client_async = AsyncOpenAI(**kwargs)
        print(f"[LLM] OK provider={LLM_PROVIDER}, model={LLM_MODEL}, base={LLM_BASE_URL or '(openai default)'}")
    except Exception as _e:
        print(f"[LLM] FAIL init: {_e}")
        client_sync = None
        client_async = None
else:
    print(f"[LLM] SKIP no key (OPENAI_AVAILABLE={OPENAI_AVAILABLE}, LLM_API_KEY={'set' if LLM_API_KEY else 'empty'})")
    client_sync = None
    client_async = None

# ASR cloud transcription is optional and intentionally separate from LLM keys.
ASR_OPENAI_API_KEY = _env_value("ASR_OPENAI_API_KEY")
ASR_BASE_URL = _env_value("ASR_BASE_URL", "")
if OPENAI_AVAILABLE and ASR_OPENAI_API_KEY:
    try:
        asr_kwargs = {"api_key": ASR_OPENAI_API_KEY}
        if ASR_BASE_URL:
            asr_kwargs["base_url"] = ASR_BASE_URL
        asr_client = OpenAI(**asr_kwargs)
    except Exception:
        asr_client = None
else:
    asr_client = None

_LLM_DISABLED_REASON = ""
_ASR_DISABLED_REASON = ""

_SQLITE_DB_PATH = os.getenv(
    "SQLITE_DB_PATH",
    os.path.join(os.path.dirname(__file__), "streamguard.db"),
)
_AUTH_TOKEN_TTL_DAYS = int(os.getenv("AUTH_TOKEN_TTL_DAYS", "7"))
_AUTH_PASSWORD_MIN_LEN = int(os.getenv("AUTH_PASSWORD_MIN_LEN", "8"))


def _ensure_sqlite_dir(path: str) -> None:
    dir_path = os.path.dirname(path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)


def _init_sqlite() -> None:
    if not _SQLITE_DB_PATH:
        return
    _ensure_sqlite_dir(_SQLITE_DB_PATH)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                password_iter INTEGER NOT NULL,
                nickname TEXT,
                avatar_url TEXT,
                bio TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_login INTEGER
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product TEXT,
                brand TEXT,
                date TEXT,
                duration TEXT,
                total INTEGER,
                fact INTEGER,
                hype INTEGER,
                trap INTEGER,
                score INTEGER,
                viewers INTEGER,
                start_time INTEGER,
                end_time INTEGER,
                room_id TEXT,
                sample_utterances TEXT,
                snapshot_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_user_time ON session_history(user_id, created_at)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS utterances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT,
                room_id TEXT,
                source TEXT,
                text TEXT,
                display_text TEXT,
                type TEXT,
                score REAL,
                timestamp TEXT,
                created_at INTEGER,
                engine TEXT,
                keywords TEXT,
                violations TEXT,
                sub_scores TEXT,
                suggestion TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT,
                room_id TEXT,
                user TEXT,
                text TEXT,
                timestamp TEXT,
                created_at INTEGER,
                sentiment TEXT,
                intent TEXT,
                flags TEXT,
                risk_score REAL,
                label TEXT,
                correlation TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_utterances_room_time ON utterances(room_id, created_at)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chats_room_time ON chats(room_id, created_at)"
        )
        conn.commit()
    finally:
        conn.close()


def _json_dump(value) -> str:
    try:
        return json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    except Exception:
        return "[]" if isinstance(value, list) else "{}"


def _safe_json_loads(value, fallback):
    if value is None:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _hash_password(password: str, salt_b64: Optional[str] = None, iterations: Optional[int] = None):
    if iterations is None:
        iterations = 150000
    if salt_b64:
        salt = base64.b64decode(salt_b64.encode("utf-8"))
    else:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return (
        base64.b64encode(digest).decode("utf-8"),
        base64.b64encode(salt).decode("utf-8"),
        iterations,
    )


def _verify_password(password: str, stored_hash: str, stored_salt: str, stored_iter: int) -> bool:
    derived_hash, _, _ = _hash_password(password, stored_salt, stored_iter)
    return hmac.compare_digest(derived_hash, stored_hash)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _public_user(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "email": row.get("email"),
        "nickname": row.get("nickname"),
        "avatar_url": row.get("avatar_url"),
        "bio": row.get("bio"),
        "created_at": row.get("created_at"),
        "last_login": row.get("last_login"),
    }


def _get_user_by_email(email: str) -> Optional[dict]:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _get_user_by_id(user_id: int) -> Optional[dict]:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _create_user(email: str, password: str, nickname: Optional[str]) -> dict:
    now = int(time.time() * 1000)
    pwd_hash, pwd_salt, pwd_iter = _hash_password(password)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        cur = conn.execute(
            """
            INSERT INTO users (email, password_hash, password_salt, password_iter, nickname, avatar_url, bio, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email,
                pwd_hash,
                pwd_salt,
                pwd_iter,
                nickname,
                None,
                None,
                now,
                now,
            ),
        )
        conn.commit()
        user_id = cur.lastrowid
    finally:
        conn.close()
    return _get_user_by_id(user_id)


def _create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    now = int(time.time() * 1000)
    expires_at = now + _AUTH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute(
            """
            INSERT INTO auth_sessions (user_id, token_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, token_hash, now, expires_at),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def _get_user_by_token(token: str) -> Optional[dict]:
    token_hash = _hash_token(token)
    now = int(time.time() * 1000)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT u.*
            FROM auth_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at >= ?
            ORDER BY s.id DESC
            LIMIT 1
            """,
            (token_hash, now),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _revoke_session(token: str) -> None:
    token_hash = _hash_token(token)
    now = int(time.time() * 1000)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute(
            "UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
            (now, token_hash),
        )
        conn.commit()
    finally:
        conn.close()


def _touch_last_login(user_id: int) -> None:
    now = int(time.time() * 1000)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute(
            "UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?",
            (now, now, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def _update_user_profile(user_id: int, nickname: Optional[str], avatar_url: Optional[str], bio: Optional[str]) -> None:
    now = int(time.time() * 1000)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute(
            """
            UPDATE users
            SET nickname = ?, avatar_url = ?, bio = ?, updated_at = ?
            WHERE id = ?
            """,
            (nickname, avatar_url, bio, now, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1]


async def _get_user_from_auth_header(authorization: Optional[str]) -> Tuple[dict, str]:
    token = _extract_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization token")
    user = await asyncio.to_thread(_get_user_by_token, token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user, token


def _insert_utterance(event: dict, room_id: Optional[str]) -> None:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        event_id = event.get("id")
        display_text = event.get("display_text") or event.get("text") or ""
        conn.execute(
            """
            INSERT INTO utterances (
                event_id, room_id, source, text, display_text, type, score,
                timestamp, created_at, engine, keywords, violations, sub_scores, suggestion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(event_id) if event_id is not None else None,
                room_id,
                event.get("source"),
                event.get("text"),
                display_text,
                event.get("type"),
                event.get("score"),
                event.get("timestamp"),
                int(time.time() * 1000),
                event.get("engine"),
                _json_dump(event.get("keywords") or []),
                _json_dump(event.get("violations") or []),
                _json_dump(event.get("sub_scores") or {}),
                event.get("suggestion"),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _insert_chat(event: dict, room_id: Optional[str]) -> None:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        event_id = event.get("id")
        conn.execute(
            """
            INSERT INTO chats (
                event_id, room_id, user, text, timestamp, created_at,
                sentiment, intent, flags, risk_score, label, correlation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(event_id) if event_id is not None else None,
                room_id,
                event.get("user"),
                event.get("text"),
                event.get("timestamp"),
                int(time.time() * 1000),
                event.get("sentiment"),
                event.get("intent"),
                _json_dump(event.get("flags") or []),
                event.get("risk_score"),
                event.get("label"),
                event.get("correlation"),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _persist_stream_event(event: dict, room_id: Optional[str]) -> None:
    if not _SQLITE_DB_PATH:
        return
    event_type = event.get("event")
    if event_type == "utterance":
        _insert_utterance(event, room_id)
    elif event_type == "chat":
        _insert_chat(event, room_id)


async def _persist_event_async(event: dict, room_id: Optional[str]) -> None:
    if not _SQLITE_DB_PATH:
        return
    try:
        await asyncio.to_thread(_persist_stream_event, event, room_id)
    except Exception as exc:
        print(f"[sqlite] persist failed: {exc}")


def _fetch_utterances(room_id: Optional[str], limit: int) -> list:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        if room_id:
            rows = conn.execute(
                "SELECT * FROM utterances WHERE room_id = ? ORDER BY created_at DESC LIMIT ?",
                (room_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM utterances ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        items = []
        for row in rows:
            items.append({
                **dict(row),
                "keywords": _safe_json_loads(row["keywords"], []),
                "violations": _safe_json_loads(row["violations"], []),
                "sub_scores": _safe_json_loads(row["sub_scores"], {}),
            })
        return items
    finally:
        conn.close()


def _fetch_chats(room_id: Optional[str], limit: int) -> list:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        if room_id:
            rows = conn.execute(
                "SELECT * FROM chats WHERE room_id = ? ORDER BY created_at DESC LIMIT ?",
                (room_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM chats ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        items = []
        for row in rows:
            items.append({
                **dict(row),
                "flags": _safe_json_loads(row["flags"], []),
            })
        return items
    finally:
        conn.close()


def _normalize_history_entry(entry: dict) -> dict:
    return {
        "product": entry.get("product") or "Session",
        "brand": entry.get("brand") or "-",
        "date": entry.get("date") or "",
        "duration": entry.get("duration") or "",
        "total": int(entry.get("total") or 0),
        "fact": int(entry.get("fact") or 0),
        "hype": int(entry.get("hype") or 0),
        "trap": int(entry.get("trap") or 0),
        "score": int(entry.get("score") or 0),
        "viewers": int(entry.get("viewers") or 0),
        "start_time": entry.get("startTime"),
        "end_time": entry.get("endTime"),
        "room_id": entry.get("roomId"),
        "sample_utterances": entry.get("sampleUtterances") or [],
    }


def _insert_history_session(user_id: int, entry: dict, snapshot: Optional[dict]) -> dict:
    now = int(time.time() * 1000)
    normalized = _normalize_history_entry(entry)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        cur = conn.execute(
            """
            INSERT INTO session_history (
                user_id, product, brand, date, duration, total, fact, hype, trap,
                score, viewers, start_time, end_time, room_id, sample_utterances,
                snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                normalized["product"],
                normalized["brand"],
                normalized["date"],
                normalized["duration"],
                normalized["total"],
                normalized["fact"],
                normalized["hype"],
                normalized["trap"],
                normalized["score"],
                normalized["viewers"],
                normalized["start_time"],
                normalized["end_time"],
                normalized["room_id"],
                _json_dump(normalized["sample_utterances"]),
                _json_dump(snapshot) if snapshot else None,
                now,
                now,
            ),
        )
        conn.commit()
        session_id = cur.lastrowid
    finally:
        conn.close()
    return _get_history_session(user_id, session_id)


def _history_row_to_entry(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "product": row["product"],
        "brand": row["brand"],
        "date": row["date"],
        "duration": row["duration"],
        "total": row["total"],
        "fact": row["fact"],
        "hype": row["hype"],
        "trap": row["trap"],
        "score": row["score"],
        "viewers": row["viewers"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "roomId": row["room_id"],
        "sampleUtterances": _safe_json_loads(row["sample_utterances"], []),
    }


def _get_history_session(user_id: int, session_id: int) -> Optional[dict]:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT * FROM session_history WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        return _history_row_to_entry(row) if row else None
    finally:
        conn.close()


def _list_history_sessions(user_id: int, limit: int) -> list:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT * FROM session_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return [_history_row_to_entry(row) for row in rows]
    finally:
        conn.close()


def _get_history_snapshot(user_id: int, session_id: int) -> Optional[dict]:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT snapshot_json FROM session_history WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        if not row:
            return None
        return _safe_json_loads(row["snapshot_json"], None)
    finally:
        conn.close()


def _rename_history_session(user_id: int, session_id: int, product: str) -> None:
    now = int(time.time() * 1000)
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute(
            "UPDATE session_history SET product = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (product, now, session_id, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def _delete_history_session(user_id: int, session_id: int) -> None:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute(
            "DELETE FROM session_history WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def _clear_history_sessions(user_id: int) -> None:
    conn = sqlite3.connect(_SQLITE_DB_PATH)
    try:
        conn.execute("DELETE FROM session_history WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()


def _is_auth_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    message = str(exc).lower()
    return (
        status_code == 401
        or "invalid_api_key" in message
        or "incorrect api key" in message
        or "401" in message
    )


def _disable_llm(reason: str):
    global client_sync, client_async, LLM_API_KEY, _LLM_DISABLED_REASON
    client_sync = None
    client_async = None
    LLM_API_KEY = ""
    if not _LLM_DISABLED_REASON:
        _LLM_DISABLED_REASON = reason
        print(f"[LLM] disabled: {reason}; using local rule fallback")


def _disable_asr(reason: str):
    global asr_client, _ASR_DISABLED_REASON
    asr_client = None
    if not _ASR_DISABLED_REASON:
        _ASR_DISABLED_REASON = reason
        print(f"[ASR-cloud] disabled: {reason}; using local faster-whisper fallback")


# ============= Analysis Engine =============

def analyze_with_keywords(text: str) -> dict:
    """Keyword-based fallback analysis."""
    trap_keywords = [
        "最后", "限时", "秒杀", "绝无仅有", "全网最低", "倒计时", "抢完没了",
    ]
    hype_keywords = [
        "超级", "神奇", "惊人", "效果显著", "百分之百", "专家推荐",
    ]

    if any(k in text for k in trap_keywords):
        utype = "trap"
        score = round(random.uniform(0.05, 0.25), 3)
    elif any(k in text for k in hype_keywords):
        utype = "hype"
        score = round(random.uniform(0.35, 0.65), 3)
    else:
        utype = "fact"
        score = round(random.uniform(0.68, 0.95), 3)

    return {
        "type": utype,
        "score": score,
        "sub_scores": {
            "semantic_consistency": round(score * random.uniform(0.9, 1.1), 3),
            "fact_verification": round(score * random.uniform(0.85, 1.05), 3),
            "compliance_score": round(score * random.uniform(0.88, 1.08), 3),
            "subjectivity_index": round(1 - score * random.uniform(0.5, 0.8), 3),
        },
        "violations": [],
        "suggestion": "内容可进一步优化。",
    }

def analyze_utterance(text: str) -> dict:
    """Analyze utterance (sync version)"""
    if not client_sync or not LLM_API_KEY:
        return analyze_with_keywords(text)

    try:
        system_prompt = """You are a live-stream compliance auditor. Analyze text for semantic alignment issues.
Return JSON: {"type": "fact"|"hype"|"trap", "score": 0-1, "sub_scores": {...}, "violations": [...], "suggestion": "..."}"""

        response = client_sync.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Evaluate: {text}"}
            ],
            temperature=0.3,
            max_tokens=500,
        )

        result_text = response.choices[0].message.content
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0]
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0]

        result = json.loads(result_text.strip())
        return result

    except Exception as e:
        if _is_auth_error(e):
            _disable_llm("invalid API key")
        else:
            print(f"LLM analysis fallback: {e}")
        return analyze_with_keywords(text)


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _clip_text(text: str, limit: int = 36) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)] + "…"


def _collect_stream_signals(utterances: list, chats: list) -> dict:
    utterance_total = len(utterances)
    chat_total = len(chats)

    fact_count = sum(1 for u in utterances if u.get("type") == "fact")
    hype_count = sum(1 for u in utterances if u.get("type") == "hype")
    trap_count = sum(1 for u in utterances if u.get("type") == "trap")
    high_risk_count = hype_count + trap_count

    evidence_hits = 0
    for u in utterances:
        evidence_hits += len(u.get("violations") or [])
        if u.get("suggestion"):
            evidence_hits += 1

    avg_score = (
        sum(_safe_float(u.get("score"), 0.0) for u in utterances) / utterance_total
        if utterance_total
        else 0.0
    )
    confidence_base = (
        0.35
        + min(0.30, utterance_total / 80.0 * 0.30)
        + min(0.15, chat_total / 120.0 * 0.15)
        + min(0.20, evidence_hits / max(1.0, utterance_total * 2.0) * 0.20)
    )
    evidence_confidence = round(_clamp01(confidence_base), 3)

    complaint_count = sum(1 for c in chats if c.get("intent") == "complaint")
    doubt_count = sum(1 for c in chats if c.get("intent") == "doubt")
    purchase_count = sum(1 for c in chats if c.get("intent") == "purchase")
    question_count = sum(1 for c in chats if c.get("intent") == "question")
    negative_chat_count = sum(1 for c in chats if c.get("sentiment") == "neg")

    risk_ratio = high_risk_count / utterance_total if utterance_total else 0.0
    fact_ratio = fact_count / utterance_total if utterance_total else 0.0
    complaint_ratio = complaint_count / chat_total if chat_total else 0.0
    doubt_ratio = doubt_count / chat_total if chat_total else 0.0
    purchase_ratio = purchase_count / chat_total if chat_total else 0.0

    trust_penalty = min(0.55, risk_ratio * 0.40 + complaint_ratio * 0.25 + doubt_ratio * 0.15)
    trust_bonus = min(0.18, fact_ratio * 0.12 + purchase_ratio * 0.06)
    trust_score = round(_clamp01(0.52 + trust_bonus - trust_penalty + avg_score * 0.12), 3)

    high_risk_samples = [
        {
            "text": u.get("text") or "",
            "type": u.get("type") or "",
            "score": round(_safe_float(u.get("score"), 0.0), 3),
        }
        for u in utterances
        if u.get("type") in ("trap", "hype")
    ][:5]

    return {
        "utterance_count": utterance_total,
        "chat_count": chat_total,
        "fact_count": fact_count,
        "hype_count": hype_count,
        "trap_count": trap_count,
        "high_risk_count": high_risk_count,
        "avg_score": round(avg_score, 3),
        "evidence_hits": evidence_hits,
        "evidence_confidence": evidence_confidence,
        "complaint_count": complaint_count,
        "doubt_count": doubt_count,
        "purchase_count": purchase_count,
        "question_count": question_count,
        "negative_chat_count": negative_chat_count,
        "risk_ratio": round(risk_ratio, 3),
        "fact_ratio": round(fact_ratio, 3),
        "complaint_ratio": round(complaint_ratio, 3),
        "doubt_ratio": round(doubt_ratio, 3),
        "purchase_ratio": round(purchase_ratio, 3),
        "trust_score": trust_score,
        "high_risk_samples": high_risk_samples,
    }


def _verdict_from_score(score: float) -> str:
    if score >= 0.72:
        return "BUY"
    if score >= 0.48:
        return "WAIT"
    return "SKIP"


def _build_dynamic_consumer_p0(best_name: str, overall_score: float, signals: dict, keyword: str = "") -> dict:
    verdict = _verdict_from_score(overall_score)
    confidence = round(_clamp01(overall_score * 0.55 + signals["evidence_confidence"] * 0.45), 3)

    why_buy = []
    if best_name:
        why_buy.append(f"{best_name} 当前综合得分最高。")
    if signals["fact_count"] > 0:
        why_buy.append(f"本场已识别 {signals['fact_count']} 条偏事实表达，可核验信息相对更多。")
    if signals["purchase_count"] > 0:
        why_buy.append(f"弹幕中有 {signals['purchase_count']} 条购买意向，说明成交兴趣存在。")
    if signals["question_count"] > 0:
        why_buy.append(f"用户正在追问 {signals['question_count']} 个问题，适合继续核验证据后再决策。")
    if not why_buy:
        why_buy.append("当前有一定可比较信息，但证据量仍有限。")

    why_not_buy = []
    if signals["high_risk_count"] > 0:
        why_not_buy.append(f"监测到 {signals['high_risk_count']} 条风险话术，需警惕夸大或压迫式表达。")
    if signals["complaint_count"] > 0:
        why_not_buy.append(f"弹幕里出现 {signals['complaint_count']} 条客诉/退款相关信号。")
    if signals["doubt_count"] > 0:
        why_not_buy.append(f"弹幕里有 {signals['doubt_count']} 条质疑内容，说明信任度还不稳。")
    if signals["evidence_confidence"] < 0.55:
        why_not_buy.append("当前样本量偏少，结论可信度还不足以支持直接下单。")
    if not why_not_buy:
        why_not_buy.append("暂未看到明显负反馈，但仍需核验价格、规格和售后。")

    must_verify = []
    if keyword:
        must_verify.append(f"{keyword} 对应的检测报告或授权凭证")
    must_verify.extend(["最终到手价", "退换货政策", "套餐规格换算"])
    if signals["complaint_count"] > 0:
        must_verify.append("历史投诉点是否已被主播正面回应")

    if verdict == "BUY":
        consumer_summary = "当前证据偏正向，可以继续核验关键凭证；核验通过后再下单更稳。"
    elif verdict == "WAIT":
        consumer_summary = "直播间信息还不够扎实，先观望并补齐证据，比直接跟单更安全。"
    else:
        consumer_summary = "当前风险信号偏多，不建议仅凭直播间话术做购买决定。"

    return {
        "verdict": verdict,
        "confidence": confidence,
        "why_buy": why_buy[:4],
        "why_not_buy": why_not_buy[:4],
        "must_verify": must_verify[:5],
        "consumer_summary": consumer_summary,
    }


def _build_session_summary_response(utterances: list, chats: list, duration_seconds: int = 0, room_id: str = "") -> dict:
    signals = _collect_stream_signals(utterances, chats)
    verdict = _verdict_from_score(signals["trust_score"])

    if verdict == "BUY":
        ai_summary = (
            f"本场监测共采集 {signals['utterance_count']} 条话术、{signals['chat_count']} 条弹幕，"
            f"事实表达占比相对更高，整体信任度约为 {round(signals['trust_score'] * 100)}%。"
        )
    elif verdict == "WAIT":
        ai_summary = (
            f"本场证据量为 {signals['utterance_count']} 条话术、{signals['chat_count']} 条弹幕，"
            f"风险与可核验信息并存，当前更适合继续观察。"
        )
    else:
        ai_summary = (
            f"本场监测中风险话术共 {signals['high_risk_count']} 条，"
            f"负向弹幕与质疑信号偏多，整体需提高警惕。"
        )

    ai_advice = []
    ai_advice.append({
        "level": "info",
        "title": "证据概览",
        "body": (
            f"本次会话累计 {signals['utterance_count']} 条话术、{signals['chat_count']} 条弹幕，"
            f"其中 FACT {signals['fact_count']} 条，HYPE {signals['hype_count']} 条，TRAP {signals['trap_count']} 条。"
        ),
    })

    if signals["high_risk_count"] > 0:
        sample = _clip_text(signals["high_risk_samples"][0]["text"]) if signals["high_risk_samples"] else "风险话术"
        ai_advice.append({
            "level": "high" if signals["high_risk_count"] >= 4 else "medium",
            "title": "风险话术回放",
            "body": f"检测到 {signals['high_risk_count']} 条高风险表达，例如“{sample}”，建议优先复核原始录屏和截图证据。",
        })

    if signals["complaint_count"] > 0 or signals["doubt_count"] > 0:
        ai_advice.append({
            "level": "medium",
            "title": "用户反馈信号",
            "body": (
                f"弹幕中有 {signals['complaint_count']} 条客诉、{signals['doubt_count']} 条质疑，"
                "应核对主播是否正面回应了价格、真伪、售后等问题。"
            ),
        })

    if signals["evidence_confidence"] < 0.55:
        ai_advice.append({
            "level": "info",
            "title": "样本量提醒",
            "body": "当前样本量或证据密度偏低，这份摘要更适合做预警，不适合作为最终定论。",
        })
    else:
        ai_advice.append({
            "level": "low",
            "title": "结论可信度",
            "body": f"当前摘要置信度约为 {round(signals['evidence_confidence'] * 100)}%，已具备一定参考价值，但仍建议保留原始证据。",
        })

    if duration_seconds > 0:
        ai_advice.append({
            "level": "info",
            "title": "会话时长",
            "body": f"本次监测时长约 {duration_seconds} 秒{f'，直播间 {room_id}' if room_id else ''}，建议结合时序回看风险是否集中爆发。",
        })

    return {
        "summary": ai_summary,
        "ai_summary": ai_summary,
        "ai_advice": ai_advice[:5],
        "utterance_count": signals["utterance_count"],
        "chat_count": signals["chat_count"],
        "high_risk_count": signals["high_risk_count"],
        "average_score": signals["avg_score"],
        "high_risk_samples": signals["high_risk_samples"],
        "confidence": signals["evidence_confidence"],
        "signal_stats": signals,
    }


# ============= Chat Semantic Analysis =============

_CHAT_POS = ["好用", "喜欢", "买了", "下单", "真香", "赞", "不错", "推荐", "支持", "期待", "满意", "值得", "棒", "厉害", "冲", "必买"]
_CHAT_NEG = ["假货", "骗人", "差评", "退货", "质量差", "失望", "坑", "黑心", "不好", "难用", "后悔", "太贵", "不值", "垃圾"]
_CHAT_DOUBT = ["真的吗", "假的吧", "可靠吗", "有效吗", "正品吗", "可信吗", "别买", "小心", "真的有用", "管用吗", "骗人的", "假的", "怎么证明", "哪有这么好"]
_CHAT_COMPLAINT = ["投诉", "退款", "假的", "骗局", "举报", "不靠谱", "买亏了", "太坑", "没用", "没效果", "打假", "维权", "客服", "售后"]
_CHAT_PURCHASE = ["下单", "买了", "拍了", "求链接", "怎么买", "加购", "收藏", "要一个", "几件", "发链接", "购买", "怎么下单", "在哪里买"]
_CHAT_QUESTION = ["吗", "吗？", "呢？", "？", "?", "怎么", "能不能", "有没有", "是不是", "多少", "哪里", "什么时候", "为什么", "啥", "啊", "需要", "适合"]
_CHAT_AD_SPAM = ["加微信", "私信我", "wx", "vx", "拿货价", "批发", "便宜出", "代购", "渠道", "刷单", "号请联系", "加我", "找我"]
_CHAT_SUPPORT = ["主播加油", "支持主播", "主播好", "YYDS", "爱了", "美美的", "帅", "顶", "666", "永远支持", "全程支持"]

_INTENT_LABEL = {
    "purchase": "购买意向",
    "question": "提问咨询",
    "complaint": "客诉投诉",
    "doubt": "质疑话术",
    "support": "支持主播",
    "ad_spam": "广告刷屏",
    "other": "普通弹幕",
}
_SENTIMENT_LABEL = {"pos": "正向", "neg": "负向", "neutral": "中性"}


def analyze_chat_light(text: str, recent_utterance: str = "") -> dict:
    """Lightweight rule-based chat sentiment and intent analysis."""
    t = (text or "").strip()
    if not t:
        return {
            "sentiment": "neutral",
            "intent": "other",
            "flags": [],
            "risk_score": 0.0,
            "correlation": "unrelated",
            "label": _INTENT_LABEL["other"],
        }

    pos_hits = sum(1 for w in _CHAT_POS if w in t)
    neg_hits = sum(1 for w in _CHAT_NEG if w in t)
    sentiment = "pos" if pos_hits > neg_hits else "neg" if neg_hits > pos_hits else "neutral"

    intent = "other"
    flags: list[str] = []

    if any(w in t for w in _CHAT_AD_SPAM):
        intent, flags = "ad_spam", ["广告刷屏"]
        sentiment = "neg"
    elif any(w in t for w in _CHAT_COMPLAINT):
        intent, flags = "complaint", ["客诉投诉"]
        sentiment = "neg"
    elif any(w in t for w in _CHAT_DOUBT):
        intent, flags = "doubt", ["质疑话术"]
        if sentiment == "pos":
            sentiment = "neutral"
    elif any(w in t for w in _CHAT_PURCHASE):
        intent = "purchase"
    elif any(w in t for w in _CHAT_SUPPORT):
        intent = "support"
        if sentiment == "neg":
            sentiment = "neutral"
    elif any(w in t for w in _CHAT_QUESTION):
        intent = "question"

    if len(set(t)) <= 3 and len(t) >= 6:
        flags.append("重复刷屏")
        intent = "ad_spam"

    correlation = "unrelated"
    if recent_utterance:
        risk_words = ["全网最低", "最", "绝", "100%", "百分之百", "神奇", "立刻", "马上", "秒", "万能"]
        if intent == "doubt" and any(w in recent_utterance for w in risk_words):
            correlation = "doubt_claim"
            flags.append("疑问关联话术")
        elif intent in ("purchase", "support") and sentiment == "pos":
            correlation = "support_claim"
        elif intent == "complaint":
            correlation = "doubt_claim"
            flags.append("投诉关联话术")

    risk_map = {
        "ad_spam": 0.9,
        "complaint": 0.75,
        "doubt": 0.55,
        "question": 0.1,
        "purchase": 0.0,
        "support": 0.0,
        "other": 0.0,
    }
    risk = risk_map.get(intent, 0.0)
    if sentiment == "neg" and risk < 0.4:
        risk = 0.4

    return {
        "sentiment": sentiment,
        "intent": intent,
        "flags": flags,
        "risk_score": round(risk, 2),
        "correlation": correlation,
        "label": _INTENT_LABEL.get(intent, _INTENT_LABEL["other"]),
        "sentiment_icon": _SENTIMENT_LABEL.get(sentiment, _SENTIMENT_LABEL["neutral"]),
    }

def analyze_audio_with_rules(text: str) -> dict:
    """Audio-focused rule engine for livestream compliance semantics."""
    t = (text or "").strip()
    if not t:
        return {
            "type": "fact",
            "score": 0.5,
            "sub_scores": {
                "semantic_consistency": 0.5,
                "fact_verification": 0.5,
                "compliance_score": 0.5,
                "subjectivity_index": 0.5,
            },
            "violations": ["空文本，无法评估"],
            "suggestion": "请延长音频采样时长后重试。",
            "engine": "rules-audio",
        }

    risk_map = {
        "绝对化/极限词": ["最", "第一", "唯一", "顶级", "国家级", "永不", "100%", "根治", "永久"],
        "压迫式促销": ["马上下单", "现在拍", "最后", "限时", "倒计时", "只剩", "错过", "手慢无"],
        "收益或功效夸大": ["立刻见效", "秒变", "稳赚", "包过", "保本", "翻倍", "无副作用", "包治"],
        "证据背书不足": ["专家都说", "权威认证", "全网最低", "内部渠道", "官方特供"],
    }
    evidence_words = ["检测", "报告", "编号", "成分", "实验", "对照", "链接", "凭证", "标准"]

    hit_violations = []
    hit_count = 0
    for violation_name, words in risk_map.items():
        hits = [w for w in words if w in t]
        if hits:
            hit_count += len(hits)
            hit_violations.append(f"{violation_name}: {', '.join(hits[:4])}")

    evidence_hit = sum(1 for w in evidence_words if w in t)
    risk_raw = max(0.0, min(0.95, hit_count * 0.18 - evidence_hit * 0.04))
    score = round(1.0 - risk_raw, 3)

    if risk_raw >= 0.62:
        utype = "trap"
    elif risk_raw >= 0.32:
        utype = "hype"
    else:
        utype = "fact"

    semantic_consistency = _clamp01(1.0 - risk_raw * 0.9)
    fact_verification = _clamp01(0.55 + evidence_hit * 0.08 - hit_count * 0.05)
    compliance_score = _clamp01(1.0 - risk_raw)
    subjectivity_index = _clamp01(0.25 + risk_raw * 0.9)

    if utype == "trap":
        suggestion = "删除极限词和压迫式下单表达，补充可核验证据与适用条件。"
    elif utype == "hype":
        suggestion = "降低夸张表达，改为可验证的数据描述。"
    else:
        suggestion = "整体表达较稳健，可继续补充证据来源提升可信度。"

    return {
        "type": utype,
        "score": score,
        "sub_scores": {
            "semantic_consistency": round(semantic_consistency, 3),
            "fact_verification": round(fact_verification, 3),
            "compliance_score": round(compliance_score, 3),
            "subjectivity_index": round(subjectivity_index, 3),
        },
        "violations": hit_violations,
        "suggestion": suggestion,
        "engine": "rules-audio",
    }

def analyze_audio_semantics(text: str) -> dict:
    """Audio-first semantic alignment: rule baseline + LLM refinement."""
    baseline = analyze_audio_with_rules(text)
    if not client_sync or not LLM_API_KEY:
        return baseline

    try:
        prompt = """
你是“直播话术转写合规审查员”。请仅基于给定文本判断，不要补充不存在的事实。

重点关注：
1) 是否存在极限词、绝对化承诺、疗效或收益保证。
2) 是否存在施压式促单，例如倒计时、只剩最后、错过后悔。
3) 是否给出可核验依据，例如检测报告、编号、成分、适用范围。

严格返回 JSON：
{
  "type": "fact|hype|trap",
  "score": 0-1,
  "sub_scores": {
    "semantic_consistency": 0-1,
    "fact_verification": 0-1,
    "compliance_score": 0-1,
    "subjectivity_index": 0-1
  },
  "violations": ["..."],
  "suggestion": "..."
}
"""
        resp = client_sync.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"请评估这段直播话术转写：{text}"},
            ],
            temperature=0.1,
            max_tokens=650,
        )
        content = (resp.choices[0].message.content or "").strip()
        if "```json" in content:
            content = content.split("```json", 1)[1].split("```", 1)[0]
        elif "```" in content:
            content = content.split("```", 1)[1].split("```", 1)[0]

        parsed = json.loads(content)
        parsed_type = parsed.get("type", baseline["type"])
        if parsed_type not in ("fact", "hype", "trap"):
            parsed_type = baseline["type"]

        parsed_score = _clamp01(parsed.get("score", baseline["score"]))
        sub = parsed.get("sub_scores") or {}
        merged = {
            "type": parsed_type,
            "score": round(parsed_score, 3),
            "sub_scores": {
                "semantic_consistency": round(_clamp01(sub.get("semantic_consistency", baseline["sub_scores"]["semantic_consistency"])), 3),
                "fact_verification": round(_clamp01(sub.get("fact_verification", baseline["sub_scores"]["fact_verification"])), 3),
                "compliance_score": round(_clamp01(sub.get("compliance_score", baseline["sub_scores"]["compliance_score"])), 3),
                "subjectivity_index": round(_clamp01(sub.get("subjectivity_index", baseline["sub_scores"]["subjectivity_index"])), 3),
            },
            "violations": parsed.get("violations") if isinstance(parsed.get("violations"), list) else baseline["violations"],
            "suggestion": parsed.get("suggestion") or baseline["suggestion"],
            "engine": "llm+rules-audio",
            "rule_baseline": baseline,
        }
        return merged
    except Exception as e:
        if _is_auth_error(e):
            _disable_llm("invalid API key")
        else:
            print(f"Audio semantic LLM fallback: {e}")
        return baseline


def _split_sentences_zh(text: str) -> list[str]:
    """Split Chinese text into short utterances for finer semantic analysis."""
    if not text:
        return []
    parts = re.split(r"[。！？?\n]+", text)
    return [p.strip() for p in parts if p and p.strip()]


# Media URL cache to avoid repeated Chrome startup (TTL = 15 minutes).
_media_url_cache: dict[str, tuple[str, float]] = {}   # room_id -> (url, expire_ts)
_MEDIA_URL_TTL = 900  # seconds



def _discover_douyin_media_url(room_id: str, timeout_sec: int = 20) -> Optional[str]:
    """Open Douyin room and detect candidate media URL (m3u8/flv) from CDP logs."""
    # Reuse a recent discovery result before starting Chrome again.
    cached = _media_url_cache.get(room_id)
    if cached and time.time() < cached[1]:
        print(f"[media-url] cache hit, skipping Chrome startup: {cached[0][:60]}...")
        return cached[0]

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.common.exceptions import TimeoutException
    from douyin_cdp import _get_chromedriver_path

    target = f"https://live.douyin.com/{room_id}"
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--mute-audio")
    opts.add_argument("--window-size=800,600")
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--allow-running-insecure-content")
    # Keep discovery resource usage down.
    opts.add_argument("--disable-extensions")
    opts.add_argument("--disable-background-networking")
    opts.add_argument("--disable-sync")
    opts.add_argument("--disable-translate")
    opts.add_argument("--disable-plugins")
    opts.add_argument("--blink-settings=imagesEnabled=false")
    opts.add_argument("--js-flags=--max-old-space-size=256")
    opts.add_argument("--media-cache-size=1")
    opts.add_argument("--disk-cache-size=1")
    # Suppress noisy Chrome logs.
    opts.add_argument("--log-level=3")
    opts.add_argument("--silent")
    opts.add_argument("--disable-logging")
    opts.add_argument("--disable-extensions")
    opts.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = None
    _service_pid = None
    candidates: list[str] = []
    try:
        import sys
        # `log_output` is supported only in newer Selenium versions.
        try:
            driver_path = _get_chromedriver_path()
            service = Service(
                driver_path,
                log_output=subprocess.DEVNULL,
            )
        except TypeError:
            driver_path = _get_chromedriver_path()
            service = Service(driver_path)
        driver = webdriver.Chrome(service=service, options=opts)
        _service_pid = getattr(getattr(service, 'process', None), 'pid', None)
        driver.set_page_load_timeout(25)
        driver.execute_cdp_cmd("Network.enable", {})

        try:
            driver.get(target)
        except TimeoutException:
            pass

        start = time.time()
        while time.time() - start < timeout_sec:
            logs = driver.get_log("performance")
            for entry in logs:
                try:
                    msg = json.loads(entry["message"])["message"]
                    if msg.get("method") != "Network.requestWillBeSent":
                        continue
                    req = msg.get("params", {}).get("request", {})
                    url = req.get("url", "")
                    u = url.lower()
                    if ".m3u8" in u or ".flv" in u or "pull-hls" in u or "stream" in u:
                        candidates.append(url)
                except Exception:
                    continue

            if candidates:
                # Prefer m3u8, then flv, then latest candidate
                result_url = None
                for c in reversed(candidates):
                    if ".m3u8" in c.lower():
                        result_url = c
                        break
                if not result_url:
                    for c in reversed(candidates):
                        if ".flv" in c.lower():
                            result_url = c
                            break
                if not result_url:
                    result_url = candidates[-1]
                # Cache the discovered media URL for a short time.
                _media_url_cache[room_id] = (result_url, time.time() + _MEDIA_URL_TTL)
                return result_url

            time.sleep(0.4)

        return None
    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass
        # 寮烘潃杩涚▼鏍戯紝纭繚 chrome.exe 瀛愯繘绋嬩笉娈嬬暀
        if _service_pid:
            try:
                subprocess.run(
                    ['taskkill', '/F', '/T', '/PID', str(_service_pid)],
                    capture_output=True, timeout=5
                )
            except Exception:
                pass


def _get_ffmpeg_bin() -> str:
    """
    Resolve an ffmpeg binary path.

    Preference order:
      1. Bundled binary from imageio-ffmpeg
      2. ffmpeg available on the system PATH
    """
    try:
        import imageio_ffmpeg
        path = imageio_ffmpeg.get_ffmpeg_exe()
        if path and os.path.isfile(path):
            return path
    except Exception:
        pass
    path = shutil.which("ffmpeg")
    if path:
        return path
    raise RuntimeError(
        "ffmpeg not found. Run: pip install imageio-ffmpeg "
        "(or install ffmpeg and add it to PATH)."
    )


def _capture_audio_clip_bytes(stream_url: str, seconds: int = 20) -> bytes:
    """Capture a short audio clip from a live stream URL.
    Uses imageio-ffmpeg (bundled binary, no system install needed)
    or falls back to system ffmpeg.
    """
    ffmpeg_bin = _get_ffmpeg_bin()

    # Keep a couple of CPU cores free for the rest of the system.
    ffmpeg_threads = str(max(1, (os.cpu_count() or 4) - 2))

    with tempfile.TemporaryDirectory() as td:
        out_wav = os.path.join(td, "clip.wav")
        cmd = [
            ffmpeg_bin,
            "-y",
            "-fflags", "nobuffer",          # Reduce input buffering delay.
            "-flags", "low_delay",
            "-i", stream_url,
            "-t", str(max(8, min(seconds, 90))),
            "-vn",                           # Audio only; skip video decoding.
            "-ac", "1",
            "-ar", "16000",
            "-acodec", "pcm_s16le",
            "-threads", ffmpeg_threads,      # Limit CPU thread usage.
            out_wav,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0 or not os.path.exists(out_wav):
            stderr_tail = (proc.stderr or "")[-600:]
            raise RuntimeError(f"ffmpeg capture failed: {stderr_tail}")

        with open(out_wav, "rb") as f:
            return f.read()


# Local faster-whisper model cache. Loading happens lazily on first ASR use.
_fw_model = None
_FW_MODEL_SIZE = os.getenv("LOCAL_WHISPER_MODEL", "base")  # tiny/base/small/medium
_FW_CPU_THREADS = int(os.getenv("WHISPER_CPU_THREADS", "2"))
_FW_BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "1"))
_ENABLE_LIVE_AUDIO_ASR = os.getenv("ENABLE_LIVE_AUDIO_ASR", "0").strip().lower() in ("1", "true", "yes")
_AUDIO_CAPTURE_WINDOW_SECS = float(os.getenv("AUDIO_CAPTURE_WINDOW_SECS", "5"))


def _transcribe_local_whisper(audio_bytes: bytes) -> str:
    """Local transcription via faster-whisper (no API key, no cloud)."""
    global _fw_model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("faster-whisper is not installed")
    if _fw_model is None:
        print(f"[ASR-local] loading faster-whisper model={_FW_MODEL_SIZE}, threads={_FW_CPU_THREADS}, beam={_FW_BEAM_SIZE}")
        model_path = os.path.join(os.path.dirname(__file__), "whisper_base_model")
        if not os.path.isfile(os.path.join(model_path, "model.bin")):
            model_path = _FW_MODEL_SIZE
        print(f"[ASR-local] using model: {model_path}")
        _fw_model = WhisperModel(
            model_path,
            device="cpu",
            compute_type="int8",
            cpu_threads=_FW_CPU_THREADS,
            num_workers=1,
        )
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        segments, _ = _fw_model.transcribe(
            tmp_path,
            language="zh",
            beam_size=_FW_BEAM_SIZE,        # 1 is faster; larger beams may improve accuracy.
            vad_filter=False,               # Keep disabled unless onnxruntime is available.
        )
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _transcribe_zh_audio_bytes(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Transcribe Chinese audio bytes using cloud ASR first, then local Whisper."""
    if asr_client:
        try:
            transcript = asr_client.audio.transcriptions.create(
                model="whisper-1",
                file=(filename, io.BytesIO(audio_bytes), "audio/wav"),
                language="zh",
            )
            return (transcript.text or "").strip()
        except Exception as e:
            if _is_auth_error(e):
                _disable_asr("invalid API key")
            else:
                print(f"[ASR-cloud] failed ({e}); falling back to local faster-whisper")
    try:
        return _transcribe_local_whisper(audio_bytes)
    except Exception as e:
        print(f"[ASR-local] failed ({e}); returning empty transcript")
        return ""


def _extract_keywords_simple(text: str) -> list:
    """Simple Chinese keyword extraction used when the LLM is unavailable."""
    stop = set("的了是在有和就也都而但这那一个么什么吧呢哦啊嗯哈我你他她它们我们你们他们")
    words = re.findall(r'[\u4e00-\u9fa5]{2,8}', text)
    seen: set = set()
    keywords: list = []
    for word in words:
        if word not in stop and word not in seen:
            seen.add(word)
            keywords.append(word)
        if len(keywords) >= 5:
            break
    return keywords


def _parse_json_object_from_model(text: str) -> dict:
    """Parse a JSON object from model output, tolerating fenced or prefixed text."""
    content = (text or "").strip()
    if not content:
        raise ValueError("empty model response")
    if "```json" in content:
        content = content.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in content:
        content = content.split("```", 1)[1].split("```", 1)[0].strip()
    if not content.startswith("{"):
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            content = content[start:end + 1]
    return json.loads(content)


async def _polish_transcript_async(raw_text: str) -> dict:
    """Polish ASR text and extract keywords with the configured LLM."""
    if not client_async or not LLM_API_KEY:
        return {"polished": raw_text.strip(), "keywords": _extract_keywords_simple(raw_text)}

    try:
        system_prompt = """
你是直播电商语音转写整理助手。请把转写文本修成更通顺、更像人话的简体中文。
要求：
1. 只返回 JSON：{"polished": "...", "keywords": ["..."]}。
2. 可以补充标点、合并断句、修正常见同音字和明显识别错误。
3. 不要编造原文没有的新事实，不确定时保守处理。
4. 去掉口头禅、重复词、乱码片段和明显噪声词。
5. `polished` 要像直播里真实说出来的话，长度尽量与原文接近。
6. `keywords` 提取 3-5 个关键词，优先商品、功效、促销词。
"""
        resp = await client_async.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"转写文本：{raw_text}"},
            ],
            temperature=0.2,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        result = _parse_json_object_from_model(resp.choices[0].message.content or "")
        return {
            "polished": result.get("polished", raw_text).strip(),
            "keywords": result.get("keywords", []),
        }
    except Exception as e:
        if _is_auth_error(e):
            _disable_llm("invalid API key")
        elif isinstance(e, (json.JSONDecodeError, ValueError)):
            pass
        else:
            print(f"[polish] LLM polish failed: {e}")
        return {"polished": raw_text.strip(), "keywords": _extract_keywords_simple(raw_text)}


# ============= Data Sources =============
class MockLiveSource:
    """Mock live-stream data source for local demos."""

    UTTERANCES = [
        "这款精华液经过五年研发，获得国家专利认证。",
        "只剩最后二十件了，错过今天就要等一年。",
        "成分表公开透明，主要含烟酰胺和玻尿酸。",
        "买三送一，今晚十二点截止。",
        "已通过 SGS 检测，无重金属超标。",
        "全网最低价，原价 499，今天只要 199。",
        "适合敏感肌，配方经过皮肤科测试。",
        "倒计时五分钟，手慢的朋友要后悔。",
        "这个成分在欧美已经流行多年，实测有效。",
        "限量五百套，售完不补。",
        "可以帮助改善细纹，提亮肤色。",
        "今天下单，加送旅行套装。",
        "我们是品牌方授权渠道，保证正品。",
        "大家看一下这个质地，非常水润，不油腻。",
        "多数肤质都可以使用，建议敏感肌先做局部测试。",
    ]

    CHATS = [
        "真的好用吗？", "上次买的还没用完", "价格有点贵",
        "主播能不能给个优惠码", "我朋友用过说不错", "先收藏",
        "有没有替代品", "下单了", "求链接", "是正品吗",
        "敏感肌能用吗？", "保质期多久？", "怎么查防伪？",
        "已经买了，等收货", "主播今天状态很好", "支持主播",
        "物流快不快？", "还有其他赠品吗？", "蹲一个链接",
        "这个牌子挺有名",
    ]

    async def stream(self, callback):
        idx = 0
        last_utterance = ""
        while True:
            await asyncio.sleep(random.uniform(2.5, 4.0))
            text = self.UTTERANCES[idx % len(self.UTTERANCES)]
            idx += 1
            last_utterance = text
            analysis = analyze_utterance(text)
            await callback({
                "event": "utterance",
                "id": int(time.time() * 1000),
                "text": text,
                "timestamp": time.strftime("%H:%M:%S"),
                **analysis,
            })

            chat = random.choice(self.CHATS)
            chat_analysis = analyze_chat_light(chat, recent_utterance=last_utterance)
            await callback({
                "event": "chat",
                "user": f"User{random.randint(1000, 9999)}",
                "text": chat,
                "timestamp": time.strftime("%H:%M:%S"),
                **chat_analysis,
            })


# ============= Routes =============
@app.websocket("/ws/stream")
async def ws_mock_stream(websocket: WebSocket):
    """Mock stream endpoint"""
    await websocket.accept()
    source = MockLiveSource()

    async def push(data):
        try:
            await websocket.send_json(data)
            await _persist_event_async(data, "mock")
        except Exception:
            pass

    try:
        await source.stream(push)
    except WebSocketDisconnect:
        pass


# ============= Douyin Live Source (Selenium CDP) =============

class DouyinLiveSource:
    """Connect to a Douyin live room via Chrome/CDP and optional audio ASR."""

    def __init__(self, room_id: str):
        self.room_id = room_id

    async def _audio_loop(self, callback):
        if not _ENABLE_LIVE_AUDIO_ASR:
            print("[audio-loop] live audio ASR disabled; set ENABLE_LIVE_AUDIO_ASR=1 to enable")
            return

        window_secs = max(3.0, min(_AUDIO_CAPTURE_WINDOW_SECS, 10.0))
        capture_idle_secs = float(os.getenv("AUDIO_CAPTURE_IDLE", "2"))

        print(f"[audio-loop] discovering media URL for room {self.room_id}")
        try:
            media_url = await asyncio.to_thread(_discover_douyin_media_url, self.room_id, 20)
        except Exception as e:
            print(f"[audio-loop] media discovery failed: {e}")
            return

        if not media_url:
            print("[audio-loop] no playable media URL found")
            return

        print(f"[audio-loop] media URL found: {media_url[:80]}...")
        audio_queue: asyncio.Queue = asyncio.Queue(maxsize=2)

        async def capture_worker():
            error_count = 0
            while True:
                try:
                    audio_bytes = await asyncio.to_thread(
                        _capture_audio_clip_bytes, media_url, window_secs
                    )
                    if audio_queue.full():
                        try:
                            audio_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    await audio_queue.put(audio_bytes)
                    error_count = 0
                    await asyncio.sleep(capture_idle_secs)
                except asyncio.CancelledError:
                    print("[audio-loop] capture worker stopped")
                    break
                except Exception as e:
                    error_count += 1
                    wait = min(3 * error_count, 15)
                    print(f"[audio-loop] capture failed ({error_count}): {e}; retry in {wait}s")
                    await asyncio.sleep(wait)

        async def transcribe_worker():
            while True:
                try:
                    audio_bytes = await audio_queue.get()
                    try:
                        text = await asyncio.to_thread(
                            _transcribe_zh_audio_bytes, audio_bytes, "live_loop.wav"
                        )
                        if text and len(text.strip()) > 3:
                            raw = text.strip()
                            polish_result, analysis = await asyncio.gather(
                                _polish_transcript_async(raw),
                                asyncio.to_thread(analyze_with_keywords, raw),
                            )
                            display = polish_result["polished"]
                            keywords = polish_result["keywords"] or _extract_keywords_simple(raw)
                            await callback({
                                "event": "utterance",
                                "id": int(time.time() * 1000),
                                "text": raw,
                                "display_text": display,
                                "keywords": keywords,
                                "timestamp": time.strftime("%H:%M:%S"),
                                "source": "audio",
                                **analysis,
                            })
                        else:
                            print("[audio-loop] silent clip skipped")
                    finally:
                        audio_queue.task_done()
                except asyncio.CancelledError:
                    print("[audio-loop] transcribe worker stopped")
                    break
                except Exception as e:
                    print(f"[audio-loop] transcribe/analyze failed: {e}")

        capture_task = asyncio.create_task(capture_worker())
        transcribe_task = asyncio.create_task(transcribe_worker())
        try:
            await asyncio.gather(capture_task, transcribe_task)
        except asyncio.CancelledError:
            capture_task.cancel()
            transcribe_task.cancel()
            await asyncio.gather(capture_task, transcribe_task, return_exceptions=True)
            print("[audio-loop] pipeline stopped")

    async def stream(self, callback):
        from douyin_cdp import stream_douyin_cdp

        last_utterance_text = ""

        async def _on_event(evt: dict):
            nonlocal last_utterance_text
            if evt.get("event") == "chat":
                text = evt.get("text", "")
                if text.strip():
                    chat_analysis = analyze_chat_light(text, recent_utterance=last_utterance_text)
                    await callback({**evt, **chat_analysis})

                    if chat_analysis.get("risk_score", 0) >= 0.5 or chat_analysis.get("intent") in ("doubt", "complaint"):
                        utt_analysis = analyze_with_keywords(text)
                        await callback({
                            "event": "utterance",
                            "id": int(time.time() * 1000),
                            "text": text,
                            "timestamp": evt.get("timestamp", time.strftime("%H:%M:%S")),
                            "source": "chat",
                            **utt_analysis,
                        })
            elif evt.get("event") == "utterance":
                last_utterance_text = evt.get("text", "")
                # Integrate RAG analysis
                if RAG_AVAILABLE and rag_pipeline:
                    try:
                        from models import LiveSemanticEvent, Modality
                        rag_event = LiveSemanticEvent(
                            event_id=f"live_{evt.get('id', int(time.time() * 1000))}",
                            session_id=f"session_{self.room_id}",
                            timestamp=time.time(),
                            modality=Modality.ASR,
                            source="douyin_live",
                            raw_content=last_utterance_text,
                            confidence=0.9
                        )
                        rag_result = await asyncio.to_thread(rag_pipeline.process_event, rag_event)
                        # Add RAG results to the event
                        evt["rag_claims"] = [rag_result.claim.dict()] if rag_result.claim and hasattr(rag_result.claim, 'dict') else ([] if not rag_result.claim else [rag_result.claim])
                        evt["rag_evidence"] = [ev.dict() if hasattr(ev, 'dict') else ev for ev in (rag_result.evidence or [])]
                        evt["rag_verification"] = rag_result.verification.dict() if rag_result.verification and hasattr(rag_result.verification, 'dict') else rag_result.verification
                        evt["rag_risk"] = rag_result.risk.dict() if rag_result.risk and hasattr(rag_result.risk, 'dict') else rag_result.risk
                        evt["rag_report"] = rag_result.report.dict() if rag_result.report and hasattr(rag_result.report, 'dict') else rag_result.report
                    except Exception as e:
                        print(f"[RAG] analysis failed: {e}")
                        evt["rag_error"] = str(e)
                await callback(evt)
            else:
                await callback(evt)

        audio_task = asyncio.create_task(self._audio_loop(callback))
        try:
            await stream_douyin_cdp(self.room_id, _on_event)
        finally:
            audio_task.cancel()
            try:
                await audio_task
            except asyncio.CancelledError:
                pass

@app.websocket("/ws/douyin/{room_id}")
async def ws_douyin_stream(websocket: WebSocket, room_id: str):
    """Proxies a real Douyin live room to the frontend."""
    await websocket.accept()
    source = DouyinLiveSource(room_id)

    async def push(data: dict):
        try:
            await websocket.send_json(data)
            await _persist_event_async(data, room_id)
        except Exception:
            pass

    try:
        await source.stream(push)
    except WebSocketDisconnect:
        pass
    except RuntimeError as exc:
        try:
            await websocket.send_json({"event": "error", "message": str(exc)})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
    except Exception as exc:
        try:
            await websocket.send_json({"event": "error", "message": f"Douyin stream failed: {exc}"})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


@app.post("/auth/register")
async def auth_register(payload: RegisterRequest):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""
    nickname = (payload.nickname or "").strip() or email.split("@", 1)[0]

    if not email or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(password) < _AUTH_PASSWORD_MIN_LEN:
        raise HTTPException(status_code=400, detail="Password too short")
    if len(nickname) > 60:
        raise HTTPException(status_code=400, detail="Nickname too long")

    existing = await asyncio.to_thread(_get_user_by_email, email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    try:
        user = await asyncio.to_thread(_create_user, email, password, nickname)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Email already registered")

    token = await asyncio.to_thread(_create_session, user["id"])
    return {"token": token, "user": _public_user(user)}


@app.post("/auth/login")
async def auth_login(payload: LoginRequest):
    email = (payload.email or "").strip().lower()
    password = payload.password or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Missing credentials")

    user = await asyncio.to_thread(_get_user_by_email, email)
    if not user or not _verify_password(password, user["password_hash"], user["password_salt"], user["password_iter"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await asyncio.to_thread(_touch_last_login, user["id"])
    user = await asyncio.to_thread(_get_user_by_id, user["id"])
    token = await asyncio.to_thread(_create_session, user["id"])
    return {"token": token, "user": _public_user(user)}


@app.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    _, token = await _get_user_from_auth_header(authorization)
    await asyncio.to_thread(_revoke_session, token)
    return {"success": True}


@app.get("/me")
async def get_me(authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    return {"user": _public_user(user)}


@app.put("/me")
async def update_me(payload: UpdateProfileRequest, authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    nickname = payload.nickname if payload.nickname is not None else user.get("nickname")
    avatar_url = payload.avatar_url if payload.avatar_url is not None else user.get("avatar_url")
    bio = payload.bio if payload.bio is not None else user.get("bio")

    if isinstance(nickname, str):
        nickname = nickname.strip() or None
    if isinstance(avatar_url, str):
        avatar_url = avatar_url.strip() or None
    if isinstance(bio, str):
        bio = bio.strip()

    if nickname is not None and len(nickname) > 60:
        raise HTTPException(status_code=400, detail="Nickname too long")
    if bio is not None and len(bio) > 200:
        raise HTTPException(status_code=400, detail="Bio too long")

    await asyncio.to_thread(_update_user_profile, user["id"], nickname, avatar_url, bio)
    updated = await asyncio.to_thread(_get_user_by_id, user["id"])
    return {"user": _public_user(updated)}


@app.post("/history/sessions")
async def save_history(payload: HistorySaveRequest, authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    entry = payload.entry or {}
    snapshot = payload.snapshot
    saved = await asyncio.to_thread(_insert_history_session, user["id"], entry, snapshot)
    return {"item": saved}


@app.get("/history/sessions")
async def list_history(limit: int = 50, authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    limit = max(1, min(limit, 200))
    items = await asyncio.to_thread(_list_history_sessions, user["id"], limit)
    return {"items": items}


@app.get("/history/sessions/{session_id}")
async def get_history(session_id: int, authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    entry = await asyncio.to_thread(_get_history_session, user["id"], session_id)
    if not entry:
        raise HTTPException(status_code=404, detail="History not found")
    snapshot = await asyncio.to_thread(_get_history_snapshot, user["id"], session_id)
    return {"item": entry, "snapshot": snapshot}


@app.put("/history/sessions/{session_id}")
async def rename_history(session_id: int, payload: HistoryRenameRequest, authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    product = (payload.product or "").strip()
    if not product:
        raise HTTPException(status_code=400, detail="Product name required")
    await asyncio.to_thread(_rename_history_session, user["id"], session_id, product)
    entry = await asyncio.to_thread(_get_history_session, user["id"], session_id)
    return {"item": entry}


@app.delete("/history/sessions/{session_id}")
async def delete_history(session_id: int, authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    await asyncio.to_thread(_delete_history_session, user["id"], session_id)
    return {"success": True}


@app.delete("/history/sessions")
async def clear_history(authorization: Optional[str] = Header(None)):
    user, _ = await _get_user_from_auth_header(authorization)
    await asyncio.to_thread(_clear_history_sessions, user["id"])
    return {"success": True}


@app.get("/db/utterances")
async def list_utterances(room_id: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 500))
    return {"items": await asyncio.to_thread(_fetch_utterances, room_id, limit)}


@app.get("/db/chats")
async def list_chats(room_id: Optional[str] = None, limit: int = 100):
    limit = max(1, min(limit, 500))
    return {"items": await asyncio.to_thread(_fetch_chats, room_id, limit)}


@app.get("/douyin/room-info/{room_id}")
async def douyin_room_info(room_id: str):
    """Validate a Douyin room id and return basic reachability info."""
    room_id = room_id.strip()
    if not room_id or not re.match(r"^\d{6,24}$", room_id):
        raise HTTPException(status_code=400, detail="Invalid room_id format")

    try:
        media_url = await asyncio.to_thread(_discover_douyin_media_url, room_id, timeout_sec=15)
        return {
            "reachable": bool(media_url),
            "room_id": room_id,
            "media_url": media_url,
            "live_hint": "直播中" if media_url else "未开播或无法访问",
            "error": None,
        }
    except Exception as e:
        return {
            "reachable": False,
            "room_id": room_id,
            "media_url": None,
            "live_hint": "检测异常",
            "error": str(e)[:100],
        }

@app.get("/media-url")
async def get_media_url(roomId: str):
    """Return a discovered stream URL for a Douyin room (m3u8/flv).
    Result is cached for 5 minutes to avoid repeatedly launching Chrome.
    """
    url = await asyncio.to_thread(_discover_douyin_media_url, roomId)
    from fastapi import HTTPException
    if not url:
        raise HTTPException(status_code=404, detail="media url not found")
    return {"url": url, "cached": roomId in _media_url_cache}


_MEDIA_PROXY_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://live.douyin.com/",
    "Origin": "https://live.douyin.com",
    "Accept": "*/*",
}


def _validate_media_proxy_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="invalid media url")

    host = parsed.hostname or ""
    allowed_fragments = ("douyin", "douyinliving", "byte", "bytedance")
    if not any(fragment in host for fragment in allowed_fragments):
        raise HTTPException(status_code=400, detail="media host is not allowed")
    return url


def _media_proxy_url(url: str) -> str:
    return f"/douyin/media-proxy?url={quote(url, safe='')}"


def _rewrite_hls_playlist(text: str, base_url: str) -> str:
    """Rewrite HLS child playlists/segments so the browser stays on our origin."""
    def replace_uri_attr(match):
        child = match.group(1)
        return f'URI="{_media_proxy_url(urljoin(base_url, child))}"'

    rewritten = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            rewritten.append(raw_line)
            continue
        if line.startswith("#"):
            rewritten.append(re.sub(r'URI="([^"]+)"', replace_uri_attr, raw_line))
            continue
        rewritten.append(_media_proxy_url(urljoin(base_url, line)))
    return "\n".join(rewritten) + ("\n" if text.endswith("\n") else "")


@app.get("/douyin/media-proxy")
async def proxy_douyin_media(url: str, request: Request):
    """Proxy Douyin media through the backend to avoid browser CORS/Referer blocks."""
    url = _validate_media_proxy_url(url)
    headers = dict(_MEDIA_PROXY_HEADERS)
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    lower_url = url.lower()
    try:
        if ".m3u8" in lower_url:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail="upstream media request failed")
            body = _rewrite_hls_playlist(resp.text, url)
            return Response(
                body,
                media_type="application/vnd.apple.mpegurl",
                headers={"Cache-Control": "no-store"},
            )

        client = httpx.AsyncClient(timeout=None, follow_redirects=True)
        upstream = await client.send(
            client.build_request("GET", url, headers=headers),
            stream=True,
        )
        if upstream.status_code >= 400:
            await upstream.aclose()
            await client.aclose()
            raise HTTPException(status_code=upstream.status_code, detail="upstream media request failed")

        async def stream_body():
            try:
                async for chunk in upstream.aiter_bytes():
                    yield chunk
            finally:
                await upstream.aclose()
                await client.aclose()

        response_headers = {"Cache-Control": "no-store"}
        for key in ("content-range", "accept-ranges"):
            if key in upstream.headers:
                response_headers[key] = upstream.headers[key]

        media_type = upstream.headers.get("content-type")
        if not media_type:
            media_type = "video/x-flv" if ".flv" in lower_url else "application/octet-stream"

        return StreamingResponse(
            stream_body(),
            status_code=upstream.status_code,
            media_type=media_type,
            headers=response_headers,
        )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"media proxy failed: {exc}") from exc


@app.delete("/media-url/cache")
async def clear_media_url_cache(roomId: str = None):
    """Manually clear media URL cache (force re-discover on next request)."""
    if roomId:
        _media_url_cache.pop(roomId, None)
        return {"cleared": roomId}
    _media_url_cache.clear()
    return {"cleared": "all"}

@app.get("/analyze")
async def analyze_text(text: str):
    """Analyze single utterance"""
    return analyze_utterance(text)


@app.get("/chat-analyze")
async def chat_analyze(text: str, recent_utterance: str = ""):
    """Analyze a single danmaku/chat message"""
    return analyze_chat_light(text, recent_utterance=recent_utterance)


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Convert audio to text using Whisper"""
    if not (asr_client or client_sync):
        raise HTTPException(status_code=500, detail="ASR client not configured")

    try:
        contents = await file.read()
        transcript_text = _transcribe_zh_audio_bytes(contents, filename=file.filename or "upload.wav")
        return {
            "text": transcript_text,
            "language": "zh",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/analyze-with-transcript")
async def analyze_with_transcript(file: UploadFile = File(...)):
    """Audio -> Transcribe -> Analyze"""
    if not (asr_client or client_sync):
        raise HTTPException(status_code=500, detail="ASR client not configured")

    start = time.time()

    try:
        contents = await file.read()
        text = _transcribe_zh_audio_bytes(contents, filename=file.filename or "upload.wav")

        analysis = analyze_audio_semantics(text)

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "text": text,
            "analysis": analysis,
            "latency_ms": elapsed_ms,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/douyin/audio-analyze/{room_id}")
async def analyze_douyin_audio(room_id: str, seconds: int = 20):
    """Douyin room audio -> transcript -> semantic alignment analysis."""
    if not (asr_client or client_sync):
        raise HTTPException(status_code=500, detail="ASR client not configured")

    started = time.time()
    try:
        media_url = _discover_douyin_media_url(room_id, timeout_sec=20)
        if not media_url:
            raise HTTPException(
                status_code=502,
                detail="No live media URL detected (room may be offline or anti-bot challenge active)",
            )

        audio_bytes = _capture_audio_clip_bytes(media_url, seconds=seconds)

        text = _transcribe_zh_audio_bytes(audio_bytes, filename="douyin_audio.wav")
        if not text:
            raise HTTPException(status_code=502, detail="ASR returned empty transcript")

        overall = analyze_audio_semantics(text)
        sentence_items = []
        for idx, seg in enumerate(_split_sentences_zh(text), start=1):
            sentence_items.append({
                "idx": idx,
                "text": seg,
                "analysis": analyze_audio_with_rules(seg),
            })

        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "room_id": room_id,
            "seconds": seconds,
            "transcript": text,
            "analysis": overall,
            "sentence_analysis": sentence_items,
            "latency_ms": elapsed_ms,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Douyin audio pipeline failed: {str(e)}")


# ============= Consumer Discovery API =============

# --- Douyin Cookie / Auth ---

@app.get("/consumer/cookie-status")
async def cookie_status():
    """Check whether douyin cookies are available."""
    if not SEARCH_AVAILABLE:
        return {"exists": False, "count": 0, "message": "search module not available"}
    return get_cookie_status()


@app.post("/consumer/auth-douyin")
async def auth_douyin(payload: dict = None):
    """
    Open a headed browser for user to complete captcha / login on douyin.
    Cookies are saved automatically after success.
    Body (optional): {"keyword": "..."}
    """
    if not SEARCH_AVAILABLE:
        raise HTTPException(status_code=500, detail="search module not available")
    keyword = (payload or {}).get("keyword", "")
    result = await asyncio.to_thread(open_douyin_for_login, keyword)
    return result


@app.post("/consumer/upload-cookies")
async def upload_cookies(payload: dict):
    """
    Upload cookies directly (from browser extension export).
    Body: {"cookies": [...]}
    """
    if not SEARCH_AVAILABLE:
        raise HTTPException(status_code=500, detail="search module not available")
    cookies = payload.get("cookies", [])
    if not cookies or not isinstance(cookies, list):
        raise HTTPException(status_code=400, detail="cookies must be a non-empty array")
    _save_douyin_cookies(cookies)
    return {"success": True, "saved": len(cookies)}


@app.get("/consumer/search-live-streams")
async def search_live_streams(q: str, max_results: int = 12):
    """Search Douyin live rooms by keyword, with mock fallback data."""
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="关键词太短，至少 2 个字")

    keyword = q.strip()
    max_results = max(3, min(max_results, 50))

    if SEARCH_AVAILABLE:
        try:
            result = await search_douyin_live_rooms(keyword, max_results)
            rooms = result.get("rooms", [])
            if rooms:
                return {
                    "keyword": keyword,
                    "rooms": rooms,
                    "total": len(rooms),
                    "data_source": result.get("data_source", "unknown"),
                }
            print("[search] no live rooms found; using fallback data")
        except Exception as e:
            print(f"[search] failed: {e}; using fallback data")

    rooms = [
        {
            "room_id": "646454278948",
            "anchor_name": f"{keyword}达人",
            "room_title": f"正品{keyword}上新，限时优惠",
            "viewer_count": 2341,
            "thumbnail_url": "",
            "status": "living",
            "recommendation_score": 0.85,
        },
        {
            "room_id": "646454278949",
            "anchor_name": "品牌直播间",
            "room_title": f"{keyword}专场，公开成分和检测报告",
            "viewer_count": 1842,
            "thumbnail_url": "",
            "status": "living",
            "recommendation_score": 0.78,
        },
    ]
    return {
        "keyword": keyword,
        "rooms": rooms[:max_results],
        "total": len(rooms[:max_results]),
        "data_source": "fallback",
    }

@app.post("/consumer/compare-streams")
async def compare_streams(request: CompareStreamsRequest):
    """Compare selected live rooms and return the shape expected by the frontend."""
    keyword = request.keyword.strip()
    rooms = request.rooms
    stream_ctx = request.stream_context or {}

    if not keyword or len(keyword) < 2:
        raise HTTPException(status_code=400, detail="关键词无效")
    if len(rooms) < 2:
        raise HTTPException(status_code=400, detail="至少需要 2 个直播间进行对比")

    utterances = stream_ctx.get("utterances", [])
    chats = stream_ctx.get("chats", [])
    signals = _collect_stream_signals(utterances, chats)
    evidence_stats = {
        "utterance_count": signals["utterance_count"],
        "chat_count": signals["chat_count"],
        "high_risk_count": signals["high_risk_count"],
        "confidence": signals["evidence_confidence"],
    }

    dimensions = ["价格", "品质", "信任度", "物流", "性价比"]
    products = []
    room_count = max(1, len(rooms))
    for idx, room in enumerate(rooms):
        base = _safe_float(room.recommendation_score, 0.5)
        room_position_bonus = max(0.0, (room_count - idx - 1) * 0.015)
        price_score = _clamp01(base + 0.02 + room_position_bonus - signals["risk_ratio"] * 0.06)
        quality_score = _clamp01(base + 0.04 + signals["fact_ratio"] * 0.12 - signals["complaint_ratio"] * 0.05)
        trust = _clamp01(base + signals["fact_ratio"] * 0.18 - signals["risk_ratio"] * 0.24 - signals["complaint_ratio"] * 0.18 - signals["doubt_ratio"] * 0.10)
        logistics = _clamp01(base - signals["complaint_ratio"] * 0.08 + signals["purchase_ratio"] * 0.04)
        value_score = _clamp01((price_score + quality_score + trust) / 3.0)
        scores = {
            "价格": round(price_score, 2),
            "品质": round(quality_score, 2),
            "信任度": round(trust, 2),
            "物流": round(logistics, 2),
            "性价比": round(value_score, 2),
        }
        overall = round(sum(scores.values()) / len(scores), 2)
        products.append({
            "name": room.anchor_name or room.room_title or room.room_id,
            "room_id": room.room_id,
            "scores": scores,
            "overall": overall,
        })

    products.sort(key=lambda item: item["overall"], reverse=True)
    ranked = [p["name"] for p in products]
    best = products[0]
    p0 = _build_dynamic_consumer_p0(best["name"], best["overall"], signals, keyword)
    return {
        "keyword": keyword,
        "engine": "dynamic-streamguard",
        "evidence_stats": evidence_stats,
        "p0": p0,
        "p1": {
            "compare_dimensions": dimensions,
            "products": products,
            "ranked": ranked,
            "analysis_notes": [
                f"评分已结合 {signals['high_risk_count']} 条风险话术、{signals['complaint_count']} 条客诉和 {signals['fact_count']} 条事实表达动态计算。",
            ],
        },
        "p2": {
            "ask_anchor_questions": [
                f"{keyword} 是否有检测报告或官方授权凭证？",
                "具体规格、生产日期和保质期是什么？",
                "退换货和售后政策如何执行？",
            ],
            "alternatives": [
                "查看品牌官方店",
                "对比同类商品历史价格",
                "回看高风险话术片段再决定",
            ],
            "buy_timing": (
                "当授权、检测、价格和售后都能被主播明确回答时再下单；"
                if p0["verdict"] != "SKIP"
                else "当前不建议因为直播间气氛或倒计时而立即下单。"
            ),
            "action_plan": [
                "先问关键凭证",
                "截图保存承诺",
                "对比最终到手价",
                "复核弹幕质疑点",
            ],
        },
    }

@app.get("/consumer/search-products")
async def search_products(q: str):
    """Return product candidates for the consumer advisor page."""
    keyword = (q or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="请输入商品关键词")

    products = [
        {
            "id": f"{keyword}-official",
            "name": f"{keyword} 官方旗舰款",
            "brand": "品牌官方",
            "channel": "官方店",
            "price": "199-299 元",
            "spec": "标准装",
            "fit_for": ["证据优先", "售后明确"],
            "known_risks": ["需核验检测报告"],
        },
        {
            "id": f"{keyword}-deal",
            "name": f"{keyword} 直播优惠款",
            "brand": "直播间",
            "channel": "主播推荐",
            "price": "129-199 元",
            "spec": "组合装",
            "fit_for": ["价格敏感", "短期促销"],
            "known_risks": ["关注极限词", "确认退换货"],
        },
        {
            "id": f"{keyword}-alt",
            "name": f"{keyword} 同类替代款",
            "brand": "同类品牌",
            "channel": "综合电商",
            "price": "159-259 元",
            "spec": "对比装",
            "fit_for": ["横向比较", "理性决策"],
            "known_risks": ["对比规格差异"],
        },
    ]
    return {"query": keyword, "source": "rules", "products": products}


@app.post("/consumer/full-suite")
async def consumer_full_suite(payload: dict):
    """Build P0/P1/P2 consumer decision output from selected products."""
    product_query = (payload.get("product_query") or "").strip()
    products_in = payload.get("products") or []
    stream_ctx = payload.get("stream_context") or {}
    user_profile = payload.get("user_profile") or {}

    if not product_query:
        raise HTTPException(status_code=400, detail="请输入商品关键词")
    if not products_in:
        raise HTTPException(status_code=400, detail="请至少选择一个候选商品")

    utterances = stream_ctx.get("utterances", [])
    chats = stream_ctx.get("chats", [])
    signals = _collect_stream_signals(utterances, chats)
    evidence_stats = {
        "utterance_count": signals["utterance_count"],
        "chat_count": signals["chat_count"],
        "high_risk_count": signals["high_risk_count"],
        "confidence": signals["evidence_confidence"],
    }

    dims = ["价格透明度", "质量证据", "售后保障", "话术可信度", "弹幕口碑"]
    scored = []
    for idx, product in enumerate(products_in):
        base = 0.76 - idx * 0.035
        profile_bonus = 0.03 if user_profile.get("budget") else 0.0
        need_bonus = 0.03 if user_profile.get("core_need") else 0.0
        risk_penalty = min(0.30, signals["risk_ratio"] * 0.28 + signals["complaint_ratio"] * 0.20 + signals["doubt_ratio"] * 0.10)
        scores = {
            "价格透明度": round(_clamp01(base + profile_bonus - signals["risk_ratio"] * 0.08), 2),
            "质量证据": round(_clamp01(base + signals["fact_ratio"] * 0.18 - 0.03), 2),
            "售后保障": round(_clamp01(base - signals["complaint_ratio"] * 0.12 - 0.02), 2),
            "话术可信度": round(_clamp01(base + need_bonus - risk_penalty), 2),
            "弹幕口碑": round(_clamp01(base + signals["purchase_ratio"] * 0.10 - signals["complaint_ratio"] * 0.18 - signals["doubt_ratio"] * 0.08), 2),
        }
        scored.append({
            "name": product.get("name") or f"候选商品 {idx + 1}",
            "scores": scores,
            "overall": round(sum(scores.values()) / len(scores), 2),
        })

    scored.sort(key=lambda item: item["overall"], reverse=True)
    best = scored[0]
    budget = user_profile.get("budget") or "未填写"
    core_need = user_profile.get("core_need") or "未填写"
    risk_replay = [
        {
            "title": f"{(u.get('type') or 'risk').upper()} 风险片段",
            "detail": f"{_clip_text(u.get('text', ''), 80)}（风险分 {round(_safe_float(u.get('score'), 0.0) * 100)}%）",
            "text": u.get("text", ""),
            "type": u.get("type", ""),
            "score": u.get("score", 0),
        }
        for u in utterances
        if u.get("type") in ("trap", "hype")
    ][:5]
    p0 = _build_dynamic_consumer_p0(best["name"], best["overall"], signals, product_query)
    p0["why_buy"].insert(1, f"预算：{budget}；核心需求：{core_need}。")

    return {
        "engine": "dynamic-streamguard",
        "evidence_stats": evidence_stats,
        "p0": p0,
        "p1": {
            "compare_dimensions": dims,
            "products": scored,
            "ranked": [item["name"] for item in scored],
            "analysis_notes": [
                f"评分已结合直播风险比例 {round(signals['risk_ratio'] * 100)}%、客诉比例 {round(signals['complaint_ratio'] * 100)}% 和事实表达比例 {round(signals['fact_ratio'] * 100)}% 动态生成。",
            ],
        },
        "p2": {
            "ask_anchor_questions": [
                f"{product_query} 的检测报告编号是什么？",
                "是否支持七天无理由或质量问题退换？",
                "不同套餐的单件价格分别是多少？",
            ],
            "alternatives": ["品牌官方店", "同类高评价商品", "历史价格更稳定的渠道"],
            "buy_timing": (
                "当凭证、价格和售后都明确时再下单；信息不完整时先等待。"
                if p0["verdict"] != "SKIP"
                else "当前风险偏高，优先转向更透明的渠道，不建议继续被直播节奏推动。"
            ),
            "action_plan": ["截图保存关键承诺", "核验官方凭证", "比较单价", "确认售后", "回看风险片段"],
            "risk_replay": risk_replay,
        },
    }


@app.post("/session/summary")
async def session_summary(payload: dict):
    """Summarize a monitoring session for the history/report modal."""
    utterances = payload.get("utterances") or []
    chats = payload.get("chats") or payload.get("chatMessages") or []
    duration_seconds = _safe_int(payload.get("durationSeconds"), 0)
    room_id = (payload.get("roomId") or "").strip()
    return _build_session_summary_response(utterances, chats, duration_seconds, room_id)

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "ok",
        "engine": "StreamGuard v2.3-cdp",
        "douyin_adapter": "cdp",
        "entry": "app.py",
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL,
        "llm_configured": bool(LLM_API_KEY),
        "asr_cloud_configured": bool(asr_client),
        "openai_configured": LLM_PROVIDER == "openai" and bool(LLM_API_KEY),
        "gpt4_available": LLM_PROVIDER == "openai" and OPENAI_AVAILABLE and bool(LLM_API_KEY),
        "rag_available": RAG_AVAILABLE,
        "rag_status": "initialized" if RAG_AVAILABLE and rag_pipeline else "failed",
    }


# ============= RAG Endpoints =============

@app.get("/rag/config")
async def rag_get_config():
    """Return sanitized RAG configuration and runtime index status."""
    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")
    return rag_pipeline.get_public_status()


@app.put("/rag/config")
async def rag_update_config(request: RAGConfigRequest):
    """Update RAG tuning configuration. API keys are read from environment variables only."""
    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")
    try:
        return rag_pipeline.update_config(request.config, persist=True, rebuild=bool(request.rebuild))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"RAG config update failed: {str(e)}")


@app.post("/rag/reindex")
async def rag_reindex():
    """Rebuild TF-IDF spaces and the FAISS embedding index."""
    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")
    try:
        rag_pipeline.rebuild_vector_spaces(rebuild_embedding=True)
        return rag_pipeline.get_public_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG reindex failed: {str(e)}")


@app.post("/rag/test")
async def rag_test_query(request: RAGTestRequest):
    """Run a single utterance through the current RAG configuration."""
    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        return rag_pipeline.test_query(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG test failed: {str(e)}")


@app.post("/rag/analyze")
async def rag_analyze_event(event: LiveSemanticEvent):
    """RAG-based analysis of a LiveSemanticEvent"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    try:
        result = rag_pipeline.process_event(event)
        return result.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG analysis failed: {str(e)}")


@app.post("/v2/rag/ask")
async def rag_ask_question(question: RAGQuestion):
    """RAG QA for evidence-based answers"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    try:
        # Find the claim by claim_id (simplified, in real impl would query DB)
        # For now, assume we have the claim from context
        mock_claim = Claim(
            claim_id=question.claim_id,
            claim_type=[ClaimType.PRICE_CLAIM],
            subject="商品",
            predicate=["全网最低"],
            value=["最低价"],
            required_evidence=["price_comparison"],
            confidence=0.9
        )
        mock_evidences = rag_pipeline.evidence_rag(mock_claim)

        answer = rag_pipeline.rag_qa(question.question, mock_claim, mock_evidences)

        return {
            "question": question.question,
            "answer": answer,
            "claim_id": question.claim_id,
            "evidence_count": len(mock_evidences)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG QA failed: {str(e)}")


@app.post("/rag/review")
async def rag_review_utterance(text: str):
    """RAG-based review of a single utterance"""
    if not RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    try:
        from models import LiveSemanticEvent, Modality
        event = LiveSemanticEvent(
            event_id=f"review_{int(time.time() * 1000)}",
            session_id="review_session",
            timestamp=time.time(),
            modality=Modality.TEXT,
            source="manual_review",
            raw_content=text,
            confidence=0.9
        )
        result = rag_pipeline.process_event(event)
        return result.dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG review failed: {str(e)}")
