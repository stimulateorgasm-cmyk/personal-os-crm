"""
CRM API — единый бэкенд для Personal OS CRM.

Пишет параллельно в локальную SQLite БД и в Notion.
Источник правды пока Notion, локальная БД для фронтенда.

POST /api/clients     — создать/обновить клиента
GET  /api/clients     — список клиентов (с фильтрами)
GET  /api/clients/:id — карточка клиента
POST /api/quiz/submit — принять результат теста
GET  /api/quiz/count  — счётчик участниц
POST /api/quiz/send-pdf — отправка PDF в Telegram
GET  /api/stats       — статистика воронки
"""
import asyncio
import base64
import hashlib
import hmac
import html
import json
import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import jwt as pyjwt

import httpx
from dotenv import load_dotenv
import uuid

from fastapi import FastAPI, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import Optional

load_dotenv(Path(__file__).parent / ".env")

# ─── Kaiten config ─────────────────────────────────────────────────────────────
KAITEN_API_KEY = os.environ.get("KAITEN_API_KEY", "")
KAITEN_DOMAIN = os.environ.get("KAITEN_DOMAIN", "shumkin.kaiten.ru")
KAITEN_SPACE_ID = os.environ.get("KAITEN_SPACE_ID", "503372")

NOTION_API_KEY = os.environ["NOTION_API_KEY"]
NOTION_NOTION_VERSION = os.environ.get("NOTION_VERSION", "2022-06-28")
NOTION_CLIENTS_DB_ID = os.environ["NOTION_CLIENTS_DB_ID"]
NOTION_DEALS_DB_ID = os.environ["NOTION_DEALS_DB_ID"]
NOTIFY_BOT_TOKEN = os.environ.get("NOTIFY_BOT_TOKEN", "")
ASSISTANT_CHAT_ID = os.environ.get("ASSISTANT_CHAT_ID", "")
ANTON_CHAT_ID = os.environ.get("ANTON_CHAT_ID", "")
QUIZ_BOT_TOKEN = os.environ.get("QUIZ_BOT_TOKEN", "")
MENS_BOT_TOKEN = os.environ.get("MENS_BOT_TOKEN", "")
raw = os.environ.get("CHITKOD_TOPIC_ID", "0")
CHITKOD_TOPIC_ID = int(raw) if raw.strip() else 0
# Мост к AI: LiteLLM для tool_calls, Hermes Bridge для простых чатов
LITELLM_URL = os.environ.get("LITELLM_URL", "http://127.0.0.1:8080/chat/completions")
MIRA_API_URL = os.environ.get("MIRA_API_URL", "http://127.0.0.1:8081/api/chat")
MIRA_MODEL = os.environ.get("MIRA_MODEL", "deepseek/deepseek-chat")
TELEGRAM_SENDER_URL = os.environ.get("TELEGRAM_SENDER_URL", "http://127.0.0.1:8011")

NOTION_BASE = "https://api.notion.com/v1"

# ─── Database config ────────────────────────────────────────────────────────────
USE_PG = os.environ.get("USE_PG", "").lower() in ("true", "1", "yes")
DB_PATH = Path(__file__).parent / "crm.db"

if USE_PG:
    import psycopg2
    import psycopg2.extras
    PG_URL = os.environ["DATABASE_URL"]
    _pg_conn = None

    def _get_pg_conn():
        global _pg_conn
        if _pg_conn is None or _pg_conn.closed:
            _pg_conn = psycopg2.connect(PG_URL)
        return _pg_conn

    class DB:
        """Обёртка вокруг psycopg2 для единообразия с SQLite-кодом."""

        def __init__(self):
            self._conn = _get_pg_conn()
            self.cur = None

        def execute(self, sql: str, params: tuple | list = ()):
            self.cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            s = sql.replace("datetime('now')", "to_char(now() at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS')")
            s = s.replace(" LIKE ?", " ILIKE ?")
            s = s.replace("?", "%s")
            # Convert :named params to %(named)s for psycopg2
            if isinstance(params, dict):
                s = re.sub(r':(\w+)', r'%(\1)s', s)
            try:
                self.cur.execute(s, params)
            except Exception:
                self._conn.rollback()
                raise
            return self.cur

        def close(self):
            self.cur = None  # don't close the pool, reuse connection

        def commit(self):
            self._conn.commit()

        @property
        def lastrowid(self):
            if self.cur is None:
                return None
            if self.cur.description:
                row = self.cur.fetchone()
                return row[0] if row else None
            c = self._conn.cursor()
            try:
                c.execute("SELECT lastval()")
                return c.fetchone()[0]
            except Exception:
                return None
else:
    class DB:
        """Обёртка вокруг sqlite3."""

        def __init__(self):
            self._conn = sqlite3.connect(str(DB_PATH))
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self.cur = None

        def execute(self, sql: str, params: tuple | list = ()):
            self.cur = self._conn.execute(sql, params)
            return self.cur

        def close(self):
            self._conn.close()

        def commit(self):
            self._conn.commit()

        @property
        def lastrowid(self):
            return self.cur.lastrowid if self.cur else None


def _get_db() -> DB:
    return DB()


def _row(r) -> dict:
    return dict(r)


def _scalar(r):
    """Fetch single value from first column of first row."""
    if r is None:
        return 0
    if USE_PG:
        row = r
        if row:
            return row.get(list(row.keys())[0], 0)
        return 0
    return r[0]

# ─── JWT Auth ─────────────────────────────────────────────────────────────────
JWT_SECRET = hashlib.sha256((NOTIFY_BOT_TOKEN or "").encode()).hexdigest()
JWT_ALGO = "HS256"

ALLOWED_CHAT_IDS = set()
raw_ids = os.environ.get("ALLOWED_CHAT_IDS", "")
if raw_ids:
    for x in raw_ids.split(","):
        x = x.strip()
        if x.isdigit():
            ALLOWED_CHAT_IDS.add(int(x))
else:
    # fallback на старые переменные
    for k in ("ANTON_CHAT_ID", "ASSISTANT_CHAT_ID", "TONYROAR_CHAT_ID", "ANDREY_CHAT_ID"):
        v = os.environ.get(k, "").strip()
        if v.isdigit():
            ALLOWED_CHAT_IDS.add(int(v))


def _verify_telegram_login(data: dict) -> int | None:
    received_hash = data.pop("hash", "")
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hashlib.sha256(NOTIFY_BOT_TOKEN.encode()).digest()
    if hmac.new(secret, check.encode(), hashlib.sha256).hexdigest() != received_hash:
        return None
    uid = data.get("id")
    if isinstance(uid, int) and uid in ALLOWED_CHAT_IDS:
        return uid
    return None


def _create_jwt(user_id: int) -> str:
    payload = {"user_id": user_id, "exp": datetime.utcnow() + timedelta(days=30)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _get_current_user(request: Request) -> int | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload = pyjwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGO])
        return payload.get("user_id")
    except Exception:
        return None


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("crm")

app = FastAPI(title="Personal OS CRM")


# ─── Chain Scheduler (фоновая задача) ────────────────────────────────────────
async def _chain_scheduler_loop():
    """Проверять цепочки каждые 15 минут."""
    while True:
        try:
            await _process_chains()
        except Exception as e:
            logger.warning("Chain scheduler error: %s", e)
        await asyncio.sleep(900)  # 15 минут


@app.on_event("startup")
async def _start_scheduler():
    asyncio.ensure_future(_chain_scheduler_loop())
    asyncio.ensure_future(_start_bot_polling())
    logger.info("Chain scheduler and bot polling started")
raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
cors_origins = [o.strip() for o in raw_origins.split(",") if o.strip()] if raw_origins else ["*"]
app.add_middleware(CORSMiddleware, allow_origins=cors_origins, allow_methods=["*"], allow_headers=["*"])


# ─── Database ─────────────────────────────────────────────────────────────────

def _init_db() -> None:
    if USE_PG:
        db = _get_db()
        for stmt in [
            "CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, notion_page_id TEXT, name TEXT NOT NULL DEFAULT '', telegram_nick TEXT DEFAULT '', telegram_id TEXT DEFAULT '', phone TEXT DEFAULT '', status TEXT DEFAULT 'Контакт', source TEXT DEFAULT '', last_account TEXT DEFAULT '', last_contact TEXT DEFAULT '', next_step TEXT DEFAULT '', summary TEXT DEFAULT '', follow_up_date TEXT DEFAULT '', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), updated_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS deals (id SERIAL PRIMARY KEY, notion_page_id TEXT, client_id INTEGER REFERENCES clients(id), title TEXT NOT NULL, status TEXT DEFAULT 'Ожидает', amount REAL DEFAULT 0, paid REAL DEFAULT 0, purchase_date TEXT DEFAULT '', sessions_total INTEGER DEFAULT 0, sessions_conducted INTEGER DEFAULT 0, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), updated_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS test_results (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), telegram_id TEXT DEFAULT '', name TEXT DEFAULT '', phone TEXT DEFAULT '', age INTEGER, test_type TEXT DEFAULT 'female', freedom_score INTEGER DEFAULT 0, sexuality_score INTEGER DEFAULT 0, diagnosis TEXT DEFAULT '', utm_source TEXT DEFAULT '', utm_medium TEXT DEFAULT '', utm_campaign TEXT DEFAULT '', answers TEXT DEFAULT '[]', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS quiz_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "INSERT INTO quiz_meta (key, value) VALUES ('female_count', '157') ON CONFLICT DO NOTHING",
            "INSERT INTO quiz_meta (key, value) VALUES ('live_increment', '0') ON CONFLICT DO NOTHING",
            "CREATE TABLE IF NOT EXISTS quiz_events (id SERIAL PRIMARY KEY, event TEXT NOT NULL DEFAULT '', metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS test_funnel (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), quiz_name TEXT DEFAULT '', state TEXT DEFAULT '', telegram_id TEXT DEFAULT '', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS notes (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), text TEXT NOT NULL, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'follow_up', due_date TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS telegram_messages (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), telegram_id TEXT DEFAULT '', sender_type TEXT NOT NULL DEFAULT 'client', text TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE INDEX IF NOT EXISTS idx_tg_client ON telegram_messages(client_id)",
            "CREATE INDEX IF NOT EXISTS idx_tg_created ON telegram_messages(created_at)",
            "CREATE TABLE IF NOT EXISTS mira_sessions (id SERIAL PRIMARY KEY, title TEXT DEFAULT 'Новый чат', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), updated_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS mira_messages (id SERIAL PRIMARY KEY, session_id INTEGER REFERENCES mira_sessions(id), role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE INDEX IF NOT EXISTS idx_mira_session ON mira_messages(session_id)",
            "CREATE TABLE IF NOT EXISTS antons_tasks (id SERIAL PRIMARY KEY, kaiten_id INTEGER UNIQUE, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Идеи', order_index INTEGER DEFAULT 0, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), updated_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS antons_task_comments (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES antons_tasks(id) ON DELETE CASCADE, kaiten_id INTEGER UNIQUE, text TEXT NOT NULL DEFAULT '', author TEXT DEFAULT '', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS assistant_tasks (id SERIAL PRIMARY KEY, kaiten_id INTEGER UNIQUE, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Входящие и идеи', order_index INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')), updated_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS assistant_task_comments (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES assistant_tasks(id) ON DELETE CASCADE, kaiten_id INTEGER UNIQUE, text TEXT NOT NULL DEFAULT '', author TEXT DEFAULT '', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS task_files (id SERIAL PRIMARY KEY, task_type TEXT NOT NULL, task_id INTEGER NOT NULL, original_name TEXT NOT NULL, file_path TEXT NOT NULL, mime_type TEXT DEFAULT '', file_size INTEGER DEFAULT 0, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
            "CREATE TABLE IF NOT EXISTS task_checklist_items (id SERIAL PRIMARY KEY, task_type TEXT NOT NULL, task_id INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', done INTEGER DEFAULT 0, order_index INTEGER DEFAULT 0, created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
        ]:
            db.execute(stmt)
        db.commit()
    else:
        conn = _get_db()
        for stmt in [
            "CREATE TABLE IF NOT EXISTS antons_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, kaiten_id INTEGER UNIQUE, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Идеи', order_index INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS antons_task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES antons_tasks(id) ON DELETE CASCADE, kaiten_id INTEGER UNIQUE, text TEXT NOT NULL DEFAULT '', author TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS assistant_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, kaiten_id INTEGER UNIQUE, title TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Входящие и идеи', order_index INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS assistant_task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES assistant_tasks(id) ON DELETE CASCADE, kaiten_id INTEGER UNIQUE, text TEXT NOT NULL DEFAULT '', author TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS task_files (id INTEGER PRIMARY KEY AUTOINCREMENT, task_type TEXT NOT NULL, task_id INTEGER NOT NULL, original_name TEXT NOT NULL, file_path TEXT NOT NULL, mime_type TEXT DEFAULT '', file_size INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS task_checklist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, task_type TEXT NOT NULL, task_id INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', done INTEGER DEFAULT 0, order_index INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, notion_page_id TEXT, name TEXT NOT NULL DEFAULT '', telegram_nick TEXT DEFAULT '', telegram_id TEXT DEFAULT '', phone TEXT DEFAULT '', status TEXT DEFAULT 'Контакт', source TEXT DEFAULT '', last_account TEXT DEFAULT '', last_contact TEXT DEFAULT '', next_step TEXT DEFAULT '', summary TEXT DEFAULT '', follow_up_date TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS deals (id INTEGER PRIMARY KEY AUTOINCREMENT, notion_page_id TEXT, client_id INTEGER REFERENCES clients(id), title TEXT NOT NULL, status TEXT DEFAULT 'Ожидает', amount REAL DEFAULT 0, paid REAL DEFAULT 0, purchase_date TEXT DEFAULT '', sessions_total INTEGER DEFAULT 0, sessions_conducted INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS test_results (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id), telegram_id TEXT DEFAULT '', name TEXT DEFAULT '', phone TEXT DEFAULT '', age INTEGER, test_type TEXT DEFAULT 'female', freedom_score INTEGER DEFAULT 0, sexuality_score INTEGER DEFAULT 0, diagnosis TEXT DEFAULT '', utm_source TEXT DEFAULT '', utm_medium TEXT DEFAULT '', utm_campaign TEXT DEFAULT '', answers TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS quiz_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "INSERT OR IGNORE INTO quiz_meta (key, value) VALUES ('female_count', '157')",
            "INSERT OR IGNORE INTO quiz_meta (key, value) VALUES ('live_increment', '0')",
            "CREATE TABLE IF NOT EXISTS quiz_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL DEFAULT '', metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS test_funnel (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id), quiz_name TEXT DEFAULT '', state TEXT DEFAULT '', telegram_id TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id), text TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id), title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'follow_up', due_date TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS telegram_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER REFERENCES clients(id), telegram_id TEXT DEFAULT '', sender_type TEXT NOT NULL DEFAULT 'client', text TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE INDEX IF NOT EXISTS idx_tg_client ON telegram_messages(client_id)",
            "CREATE INDEX IF NOT EXISTS idx_tg_created ON telegram_messages(created_at)",
            "CREATE TABLE IF NOT EXISTS mira_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT DEFAULT 'Новый чат', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
            "CREATE TABLE IF NOT EXISTS mira_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER REFERENCES mira_sessions(id), role TEXT NOT NULL DEFAULT 'user', content TEXT NOT NULL DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
            "CREATE INDEX IF NOT EXISTS idx_mira_session ON mira_messages(session_id)",
        ]:
            conn.execute(stmt)
        conn.commit()
        conn.close()


_init_db()

# Migration: add columns to notes (each in its own connection to avoid aborted txns)
for col in ["is_pinned INTEGER DEFAULT 0", "updated_at TEXT DEFAULT (datetime('now'))"]:
    try:
        c = _get_db()
        c.execute(f"ALTER TABLE notes ADD COLUMN {col}")
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# Migration: add columns to clients (only missing ones)
if USE_PG:
    for col in [
        "ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS age INTEGER",
        "ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false",
        "ADD COLUMN IF NOT EXISTS utm_medium TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS utm_campaign TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS utm_content TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS utm_term TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS erid TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS start_param TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS utm_source TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS pseudonym TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS previous_username TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '[]'",
        "ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT ''",
    ]:
        try:
            c = _get_db()
            c.execute(f"ALTER TABLE clients {col}")
            c.commit()
            c.close()
        except Exception:
            _pg_conn and _pg_conn.rollback()

    for col in [
        "ADD COLUMN IF NOT EXISTS sessions TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS payment_info TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS sessions_total INTEGER DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS sessions_conducted INTEGER DEFAULT 0",
    ]:
        try:
            c = _get_db()
            c.execute(f"ALTER TABLE deals {col}")
            c.commit()
            c.close()
        except Exception:
            _pg_conn and _pg_conn.rollback()

    for col in [
        "ADD COLUMN IF NOT EXISTS utm_content TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS utm_term TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS erid TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS start_param TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false",
        "ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0",
        "ADD COLUMN IF NOT EXISTS pdf_sent BOOLEAN DEFAULT false",
        "ADD COLUMN IF NOT EXISTS level TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS state TEXT DEFAULT ''",
        "ADD COLUMN IF NOT EXISTS current_question INTEGER DEFAULT 0",
    ]:
        try:
            c = _get_db()
            c.execute(f"ALTER TABLE test_results {col}")
            c.commit()
            c.close()
        except Exception:
            _pg_conn and _pg_conn.rollback()

    try:
        c = _get_db()
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_dedup ON telegram_messages(client_id, COALESCE(telegram_id, ''), md5(text), created_at)")
        c.commit()
        c.close()
    except Exception:
        _pg_conn and _pg_conn.rollback()
try:
    c = _get_db()
    c.execute("UPDATE notes SET updated_at = created_at WHERE updated_at IS NULL")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass
try:
    c = _get_db()
    c.execute("ALTER TABLE clients ADD COLUMN responsible_person TEXT DEFAULT ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass

# Migration: fix tasks status default
try:
    c = _get_db()
    if USE_PG:
        c.execute("ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'pending'")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass
try:
    c = _get_db()
    c.execute("UPDATE tasks SET status = 'pending' WHERE status IS NULL OR status = ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass

# Migration: add birthday, pseudonym, previous_username to clients
for _col in ["birthday", "pseudonym", "previous_username"]:
    try:
        c = _get_db()
        c.execute(f"ALTER TABLE clients ADD COLUMN {_col} TEXT DEFAULT ''")
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# Migration: add responsible_person to tasks
try:
    c = _get_db()
    c.execute("ALTER TABLE tasks ADD COLUMN responsible_person TEXT DEFAULT ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass
try:
    c = _get_db()
    co = "coalesce" if USE_PG else "ifnull"
    c.execute(f"UPDATE tasks SET responsible_person = (SELECT {co}(responsible_person, '') FROM clients WHERE clients.id = tasks.client_id) WHERE responsible_person IS NULL OR responsible_person = ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass

# Migration: add description to tasks
try:
    c = _get_db()
    c.execute("ALTER TABLE tasks ADD COLUMN description TEXT DEFAULT ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass

# Migration: add columns to deals
for col in ["sessions TEXT DEFAULT ''", "payment_info TEXT DEFAULT ''", "sessions_total INTEGER DEFAULT 0", "sessions_conducted INTEGER DEFAULT 0", "source TEXT DEFAULT ''"]:
    try:
        c = _get_db()
        c.execute(f"ALTER TABLE deals ADD COLUMN {col}")
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# Migration: add archived column to clients and deals
for table in ["clients", "deals"]:
    try:
        c = _get_db()
        c.execute(f"ALTER TABLE {table} ADD COLUMN archived INTEGER DEFAULT 0")
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# Migration: add is_archived to antons_tasks
try:
    c = _get_db()
    if USE_PG:
        c.execute("ALTER TABLE antons_tasks ADD COLUMN IF NOT EXISTS is_archived INTEGER DEFAULT 0")
    else:
        c.execute("ALTER TABLE antons_tasks ADD COLUMN is_archived INTEGER DEFAULT 0")
    c.commit()
    c.close()
except Exception:
    pass

# Migration: add priority to antons_tasks
try:
    c = _get_db()
    if USE_PG:
        c.execute("ALTER TABLE antons_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT ''")
    else:
        c.execute("ALTER TABLE antons_tasks ADD COLUMN priority TEXT DEFAULT ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass

# Migration: add priority to assistant_tasks
try:
    c = _get_db()
    if USE_PG:
        c.execute("ALTER TABLE assistant_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT ''")
    else:
        c.execute("ALTER TABLE assistant_tasks ADD COLUMN priority TEXT DEFAULT ''")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass

# Migration: add referrer fields to clients
for col in ["referrer_id INTEGER REFERENCES clients(id)", "referrer_color TEXT DEFAULT ''"]:
    try:
        c = _get_db()
        if USE_PG:
            c.execute(f"ALTER TABLE clients ADD COLUMN IF NOT EXISTS {col}")
        else:
            c.execute(f"ALTER TABLE clients ADD COLUMN {col}")
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# Migration: create labels tables
for stmt in ([
    "CREATE TABLE IF NOT EXISTS labels (id SERIAL PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#6366f1', created_at TEXT DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS client_labels (client_id INTEGER REFERENCES clients(id), label_id INTEGER REFERENCES labels(id), PRIMARY KEY (client_id, label_id))",
] if USE_PG else [
    "CREATE TABLE IF NOT EXISTS labels (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT DEFAULT '#6366f1', created_at TEXT DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS client_labels (client_id INTEGER REFERENCES clients(id), label_id INTEGER REFERENCES labels(id), PRIMARY KEY (client_id, label_id))",
]):
    try:
        c = _get_db()
        c.execute(stmt)
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass
# Migration: add columns to test_results
for col in ["total_score INTEGER DEFAULT 0", "level TEXT DEFAULT ''", "intent TEXT DEFAULT ''", "state TEXT DEFAULT ''"]:
    try:
        c = _get_db()
        c.execute(f"ALTER TABLE test_results ADD COLUMN {col}")
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass
# Migration: dedup index for telegram_messages
try:
    c = _get_db()
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_tg_dedup ON telegram_messages(client_id, COALESCE(telegram_id,''), MD5(text), created_at)")
    c.commit()
    c.close()
except Exception:
    if USE_PG:
        _pg_conn and _pg_conn.rollback()
    pass


# Migration: create tags tables
for stmt in ([
    "CREATE TABLE IF NOT EXISTS tags (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#6366f1', created_at TEXT DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS client_tags (client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE, tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (client_id, tag_id))",
] if USE_PG else [
    "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#6366f1', created_at TEXT DEFAULT (datetime('now')))",
    "CREATE TABLE IF NOT EXISTS client_tags (client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE, tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (client_id, tag_id))",
]):
    try:
        c = _get_db()
        c.execute(stmt)
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# Migration: create chain tables (прогрев сообщений)
_chain_sql = [
    "CREATE TABLE IF NOT EXISTS chain_messages (id SERIAL PRIMARY KEY, test_type TEXT NOT NULL, trigger TEXT NOT NULL, step INTEGER NOT NULL, delay_minutes INTEGER NOT NULL, text_template TEXT NOT NULL, is_active INTEGER DEFAULT 1)",
    "CREATE TABLE IF NOT EXISTS chain_state (id SERIAL PRIMARY KEY, test_result_id INTEGER, telegram_id TEXT DEFAULT '', test_type TEXT NOT NULL, trigger TEXT NOT NULL, current_step INTEGER DEFAULT 0, last_sent_at TEXT, next_send_at TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')))",
] if USE_PG else [
    "CREATE TABLE IF NOT EXISTS chain_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, test_type TEXT NOT NULL, trigger TEXT NOT NULL, step INTEGER NOT NULL, delay_minutes INTEGER NOT NULL, text_template TEXT NOT NULL, is_active INTEGER DEFAULT 1)",
    "CREATE TABLE IF NOT EXISTS chain_state (id INTEGER PRIMARY KEY AUTOINCREMENT, test_result_id INTEGER, telegram_id TEXT DEFAULT '', test_type TEXT NOT NULL, trigger TEXT NOT NULL, current_step INTEGER DEFAULT 0, last_sent_at TEXT, next_send_at TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')))",
]
for stmt in _chain_sql:
    try:
        c = _get_db()
        c.execute(stmt)
        c.commit()
        c.close()
    except Exception:
        if USE_PG:
            _pg_conn and _pg_conn.rollback()
        pass

# ─── Models ───────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str = ""
    telegram_nick: str = ""
    telegram_id: str = ""
    phone: str = ""
    status: str = "Контакт"
    source: str = ""
    last_account: str = ""
    next_step: str = ""
    summary: str = ""
    responsible_person: str = ""


class QuizSubmit(BaseModel):
    telegram_id: str | None = None
    telegram_username: str | None = None
    name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    age: int | None = None
    test_type: str = "female"
    freedom_score: int = 0
    sexuality_score: int = 0
    total_score: int = 0
    score: int = 0
    level: str = ""
    diagnosis: str = ""
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_content: str | None = None
    utm_term: str | None = None
    answers: list | dict | None = None
    contact: str | None = None
    phone_requested: bool = False
    intent: str | None = None
    state: str | None = None
    quiz_name: str | None = None
    start_param: str | None = None
    current_question: int = 0
    video_key: str | None = None


class ChainMessageCreate(BaseModel):
    test_type: str
    trigger: str
    step: int
    delay_minutes: int
    text_template: str
    is_active: int = 1


class ChainMessageUpdate(BaseModel):
    text_template: str | None = None
    delay_minutes: int | None = None
    is_active: int | None = None


class SendPdfRequest(BaseModel):
    telegram_id: str
    pdf_base64: str
    test_type: str = "female"


# ─── Notion helpers ───────────────────────────────────────────────────────────

def _notion_headers() -> dict:
    return {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }


async def _notion_find_client(http: httpx.AsyncClient, username: str) -> dict | None:
    resp = await http.post(
        f"{NOTION_BASE}/databases/{NOTION_CLIENTS_DB_ID}/query",
        json={"filter": {"property": "Telegram Ник", "rich_text": {"contains": username}}, "page_size": 5},
    )
    resp.raise_for_status()
    for page in resp.json().get("results", []):
        nick = "".join(t.get("plain_text", "") for t in page["properties"].get("Telegram Ник", {}).get("rich_text", []))
        if nick.lstrip("@").lower() == username.lstrip("@").lower():
            return page
    return None


async def _notion_create_client(http: httpx.AsyncClient, data: ClientCreate) -> str:
    props: dict = {
        "Имя": {"title": [{"text": {"content": data.name or data.telegram_nick or "Аноним"}}]},
        "Статус": {"status": {"name": data.status}},
    }
    if data.telegram_nick:
        props["Telegram Ник"] = {"rich_text": [{"text": {"content": data.telegram_nick}}]}
    if data.source:
        props["Источник"] = {"select": {"name": data.source}}
    if data.telegram_id:
        props["Telegram ID"] = {"rich_text": [{"text": {"content": data.telegram_id}}]}
    if data.summary:
        props["Контекст / Саммари"] = {"rich_text": [{"text": {"content": data.summary[:2000]}}]}

    resp = await http.post(f"{NOTION_BASE}/pages", json={
        "parent": {"database_id": NOTION_CLIENTS_DB_ID},
        "properties": props,
    })
    resp.raise_for_status()
    return resp.json()["id"]


async def _notion_notify_quiz(result: QuizSubmit) -> None:
    if not NOTIFY_BOT_TOKEN or not ASSISTANT_CHAT_ID:
        return

    def e(t: str | None) -> str:
        return html.escape(t or "—")

    # Mens test purchase notification → topic "Чит-код 1%"
    if result.intent == "purchase_tripwire" and result.test_type == "mens":
        total_score = result.total_score or result.score or 0
        video_line = "✅ Просмотрено"  # always true at this point
        text = (
            f"🔥💰 <b>ПОКУПКА ЧИТ-КОДА</b>\n\n"
            f"👤 Telegram: @{e(result.telegram_username or result.contact or '—')}\n"
            f"📊 Уровень: {e(result.level)}\n"
            f"⭐ Баллы: {total_score}/30\n"
            f"🎂 Возраст: {e(str(result.age) if result.age else chr(45))}\n"
            f"🎥 Видео: {video_line}\n"
            f"🎯 Источник: {e(result.utm_source or '—')}\n\n"
            f"💳 Нужно прислать реквизиты для оплаты 4990₽"
        )
        url = f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as tg:
            # To assistant group chat (topic will be configured separately)
            resp = await tg.post(url, json={
                "chat_id": ASSISTANT_CHAT_ID, "text": text,
                "parse_mode": "HTML", "message_thread_id": CHITKOD_TOPIC_ID,
            })
            if resp.status_code != 200:
                logger.warning("Telegram chitkod notify failed: %s", resp.text)
        return

    # Mens test completed notification → topic "Чит-код 1%"
    if result.state == "completed_test" and result.test_type == "mens":
        total_score = result.total_score or result.score or 0
        contact = result.telegram_username or result.telegram_id or "—"
        logger.info("Mens test submit: tg_id=%s, age=%s, level=%s, score=%s, utm=%s",
                    result.telegram_id, result.age, result.level, total_score, result.utm_source)
        text = (
            f"🧪 <b>«Лучший любовник» пройден</b>\n\n"
            f"👤 Контакт: {e('@' + contact) if contact != '—' and not contact.startswith('ID ') else e(contact)}\n"
            f"📊 Уровень: {e(result.level)}\n"
            f"⭐ Баллы: {total_score}/30\n"
            f"🎂 Возраст: {e(str(result.age) if result.age else chr(45))}\n"
            f"🎯 Источник: {e(result.utm_source or '—')}"
        )
        url = f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as tg:
            resp = await tg.post(url, json={
                "chat_id": ASSISTANT_CHAT_ID, "text": text,
                "parse_mode": "HTML", "message_thread_id": CHITKOD_TOPIC_ID,
            })
            if resp.status_code != 200:
                logger.warning("Telegram mens completed notify failed: %s", resp.text)
        return

    # Default notification for female quiz results → topic 2372
    contact_str = ""
    if result.telegram_username:
        contact_str = f" (@{e(result.telegram_username)})"
    elif result.telegram_id:
        contact_str = f" (ID {e(result.telegram_id)})"
    name_display = result.name or result.telegram_username or result.telegram_id or "Аноним"
    text = (
        f"🧪 <b>Новый результат — женский тест</b>\n"
        f"👤 {e(name_display)}{contact_str}"
        + f"\n🔓 Свобода: {result.freedom_score}/40"
        + f"\n💋 Сексуальность: {result.sexuality_score}/60"
        + f"\n🎯 Диагноз: {e(result.diagnosis)}"
        + (f"\n📊 UTM: {e(result.utm_source)}" if result.utm_source else "")
    )
    url = f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as tg:
        resp = await tg.post(url, json={"chat_id": ASSISTANT_CHAT_ID, "text": text, "parse_mode": "HTML", "message_thread_id": 2372})
        if resp.status_code != 200:
            logger.warning("Telegram notify failed: %s", resp.text)


# ─── API: Auth ────────────────────────────────────────────────────────────────

@app.post("/api/auth/telegram")
async def auth_telegram(data: dict):
    uid = _verify_telegram_login(data)
    if uid is None:
        raise HTTPException(401, "Unauthorized")
    token = _create_jwt(uid)
    return {"token": token, "user_id": uid}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    uid = _get_current_user(request)
    if uid is None:
        raise HTTPException(401, "Unauthorized")
    return {"user_id": uid}


# ─── API: Notes ──────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    text: str

@app.get("/api/clients/{client_id}/notes")
async def get_notes(client_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM notes WHERE client_id = ? ORDER BY is_pinned DESC, created_at DESC", (client_id,)
    ).fetchall()
    conn.close()
    return {"notes": [_row(r) for r in rows]}

@app.post("/api/clients/{client_id}/notes")
async def create_note(client_id: int, data: NoteCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO notes (client_id, text, created_at, is_pinned, updated_at) VALUES (?, ?, datetime('now'), 0, datetime('now'))",
        (client_id, data.text),
    )
    conn.execute("UPDATE clients SET last_contact = datetime('now') WHERE id = ?", (client_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


class NotePatch(BaseModel):
    text: Optional[str] = None
    is_pinned: Optional[int] = None


@app.patch("/api/clients/{client_id}/notes/{note_id}")
async def update_note(client_id: int, note_id: int, data: NotePatch):
    conn = _get_db()
    updates = []
    params = []
    if data.text is not None:
        text = data.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        updates.append("text = ?")
        params.append(text)
    if data.is_pinned is not None:
        updates.append("is_pinned = ?")
        params.append(data.is_pinned)
    if not updates:
        conn.close()
        return {"ok": True}
    updates.append("updated_at = datetime('now')")
    params.append(note_id)
    params.append(client_id)
    conn.execute("UPDATE notes SET " + ", ".join(updates) + " WHERE id = ? AND client_id = ?", params)
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"note": dict(row)}


@app.delete("/api/clients/{client_id}/notes/{note_id}")
async def delete_note(client_id: int, note_id: int):
    """Удалить заметку."""
    conn = _get_db()
    conn.execute("DELETE FROM notes WHERE id = ? AND client_id = ?", (note_id, client_id))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── API: Tasks ────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    task_type: str = "follow_up"
    due_date: str = ""
    client_id: Optional[int] = None
    description: str = ""

class TaskPatch(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    task_type: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None

# ─── Антон's Tasks API ──────────────────────────────────────────────────────────

class AntonTaskPatch(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    is_archived: Optional[bool] = None
    priority: Optional[str] = None

class AntonTaskCreate(BaseModel):
    title: str
    status: str = "Идеи"

class AntonTaskCommentCreate(BaseModel):
    text: str
    author: str = ""

class AntonTaskReorderItem(BaseModel):
    task_id: int
    order_index: int

class AntonTaskReorder(BaseModel):
    status: str
    items: list[AntonTaskReorderItem]

ANTON_TASK_STATUSES = ["Идеи", "Очередь", "15 задач на неделю", "Делаю сейчас", "Рефлексия", "Готово"]

@app.get("/api/antons-tasks")
async def list_antons_tasks(archived: Optional[bool] = Query(False)):
    conn = _get_db()
    where = "WHERE (at.is_archived IS NULL OR at.is_archived = 0)" if not archived else "WHERE at.is_archived = 1"
    rows = conn.execute(
        f"SELECT at.*, (SELECT COUNT(*) FROM antons_task_comments WHERE task_id = at.id) as comments_count "
        f"FROM antons_tasks at {where} ORDER BY at.status, at.order_index, at.created_at DESC"
    ).fetchall()
    conn.close()
    return {"tasks": [_row(r) for r in rows]}

@app.post("/api/antons-tasks")
async def create_anton_task(data: AntonTaskCreate):
    conn = _get_db()
    if data.status not in ANTON_TASK_STATUSES:
        conn.close()
        raise HTTPException(400, f"Invalid status. Must be one of: {ANTON_TASK_STATUSES}")
    conn.execute(
        "INSERT INTO antons_tasks (title, status, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
        (data.title, data.status)
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/antons-tasks/{task_id}")
async def patch_anton_task(task_id: int, data: AntonTaskPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.status is not None:
        if data.status not in ANTON_TASK_STATUSES:
            conn.close()
            raise HTTPException(400, f"Invalid status. Must be one of: {ANTON_TASK_STATUSES}")
        updates.append("status = ?")
        params.append(data.status)
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if data.order_index is not None:
        updates.append("order_index = ?")
        params.append(data.order_index)
    if data.priority is not None:
        updates.append("priority = ?")
        params.append(data.priority)
    if data.is_archived is not None:
        updates.append("is_archived = ?")
        params.append(int(data.is_archived))
    if not updates:
        conn.close()
        return {"ok": True}
    updates.append("updated_at = datetime('now')")
    params.append(task_id)
    conn.execute(f"UPDATE antons_tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/antons-tasks/{task_id}/comments")
async def get_anton_task_comments(task_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM antons_task_comments WHERE task_id = ? ORDER BY created_at ASC",
        (task_id,)
    ).fetchall()
    conn.close()
    return {"comments": [_row(r) for r in rows]}

@app.post("/api/antons-tasks/{task_id}/comments")
async def create_anton_task_comment(task_id: int, data: AntonTaskCommentCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO antons_task_comments (task_id, text, author, created_at) VALUES (?, ?, ?, datetime('now'))",
        (task_id, data.text, data.author)
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.delete("/api/antons-tasks/{task_id}")
async def delete_anton_task(task_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM antons_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/antons-tasks/{task_id}/comments/{comment_id}")
async def delete_anton_task_comment(task_id: int, comment_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM antons_task_comments WHERE id = ? AND task_id = ?", (comment_id, task_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/antons-tasks/reorder")
async def reorder_anton_tasks(data: AntonTaskReorder):
    conn = _get_db()
    for item in data.items:
        conn.execute(
            "UPDATE antons_tasks SET order_index = ?, updated_at = datetime('now') WHERE id = ?",
            (item.order_index, item.task_id)
        )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/antons-tasks/statuses")
async def list_antons_task_statuses():
    """Возвращает список допустимых статусов."""
    return {"statuses": ANTON_TASK_STATUSES}

# ─── Ассистент's Tasks API ───────────────────────────────────────────────────────

ASSISTANT_TASK_STATUSES = ["Входящие и идеи", "Очередь", "15 задач на неделю", "Делаю сейчас", "Рефлексия", "Готово", "Важное"]

class AssistantTaskPatch(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    is_archived: Optional[bool] = None
    priority: Optional[str] = None

class AssistantTaskCreate(BaseModel):
    title: str
    status: str = "Входящие и идеи"

class AssistantTaskCommentCreate(BaseModel):
    text: str
    author: str = ""

class AssistantTaskReorderItem(BaseModel):
    task_id: int
    order_index: int

class AssistantTaskReorder(BaseModel):
    status: str
    items: list[AssistantTaskReorderItem]

@app.get("/api/assistant-tasks")
async def list_assistant_tasks(archived: Optional[bool] = Query(False)):
    conn = _get_db()
    where = "WHERE (at.is_archived IS NULL OR at.is_archived = 0)" if not archived else "WHERE at.is_archived = 1"
    rows = conn.execute(
        f"SELECT at.*, (SELECT COUNT(*) FROM assistant_task_comments WHERE task_id = at.id) as comments_count "
        f"FROM assistant_tasks at {where} ORDER BY at.status, at.order_index, at.created_at DESC"
    ).fetchall()
    conn.close()
    return {"tasks": [_row(r) for r in rows]}

@app.post("/api/assistant-tasks")
async def create_assistant_task(data: AssistantTaskCreate):
    conn = _get_db()
    if data.status not in ASSISTANT_TASK_STATUSES:
        conn.close()
        raise HTTPException(400, f"Invalid status. Must be one of: {ASSISTANT_TASK_STATUSES}")
    conn.execute(
        "INSERT INTO assistant_tasks (title, status, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
        (data.title, data.status)
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/assistant-tasks/{task_id}")
async def patch_assistant_task(task_id: int, data: AssistantTaskPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.status is not None:
        if data.status not in ASSISTANT_TASK_STATUSES:
            conn.close()
            raise HTTPException(400, f"Invalid status. Must be one of: {ASSISTANT_TASK_STATUSES}")
        updates.append("status = ?")
        params.append(data.status)
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if data.order_index is not None:
        updates.append("order_index = ?")
        params.append(data.order_index)
    if data.priority is not None:
        updates.append("priority = ?")
        params.append(data.priority)
    if data.is_archived is not None:
        updates.append("is_archived = ?")
        params.append(int(data.is_archived))
    if not updates:
        conn.close()
        return {"ok": True}
    updates.append("updated_at = datetime('now')")
    params.append(task_id)
    conn.execute(f"UPDATE assistant_tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/assistant-tasks/{task_id}")
async def delete_assistant_task(task_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM assistant_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/assistant-tasks/{task_id}/comments")
async def get_assistant_task_comments(task_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM assistant_task_comments WHERE task_id = ? ORDER BY created_at ASC",
        (task_id,)
    ).fetchall()
    conn.close()
    return {"comments": [_row(r) for r in rows]}

@app.post("/api/assistant-tasks/{task_id}/comments")
async def create_assistant_task_comment(task_id: int, data: AssistantTaskCommentCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO assistant_task_comments (task_id, text, author, created_at) VALUES (?, ?, ?, datetime('now'))",
        (task_id, data.text, data.author)
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.delete("/api/assistant-tasks/{task_id}/comments/{comment_id}")
async def delete_assistant_task_comment(task_id: int, comment_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM assistant_task_comments WHERE id = ? AND task_id = ?", (comment_id, task_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/assistant-tasks/reorder")
async def reorder_assistant_tasks(data: AssistantTaskReorder):
    conn = _get_db()
    for item in data.items:
        conn.execute(
            "UPDATE assistant_tasks SET order_index = ?, updated_at = datetime('now') WHERE id = ?",
            (item.order_index, item.task_id)
        )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/assistant-tasks/statuses")
async def list_assistant_task_statuses():
    return {"statuses": ASSISTANT_TASK_STATUSES}

# ─── Файлы к задачам ──────────────────────────────────────────────────────────

UPLOAD_DIR = "/root/crm-uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# http://localhost:8003/api/upload - POST multipart/form-data
# Поля: task_type (text), task_id (int), file (file)
@app.post("/api/upload")
async def upload_file(request: Request):
    """Загрузить файл и прикрепить к задаче (multipart/form-data)."""
    form = await request.form()
    task_type = form.get("task_type")
    task_id = int(form.get("task_id"))
    file = form.get("file")
    if not file:
        raise HTTPException(400, "file required")
    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ""
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    conn = _get_db()
    conn.execute(
        "INSERT INTO task_files (task_type, task_id, original_name, file_path, mime_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
        (task_type, task_id, file.filename, filename, file.content_type or "", len(content)),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.get("/api/tasks/{task_type}/{task_id}/files")
async def get_task_files(task_type: str, task_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM task_files WHERE task_type = ? AND task_id = ? ORDER BY created_at DESC",
        (task_type, task_id),
    ).fetchall()
    conn.close()
    files = []
    for r in rows:
        f = dict(r)
        f["download_url"] = f"/api/files/{f['id']}/download"
        files.append(f)
    return {"files": files}

@app.get("/api/files/{file_id}/download")
async def download_file(file_id: int):
    conn = _get_db()
    row = conn.execute("SELECT * FROM task_files WHERE id = ?", (file_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "File not found")
    r = dict(row)
    file_path = os.path.join(UPLOAD_DIR, r["file_path"])
    if not os.path.exists(file_path):
        raise HTTPException(404, "File not found on disk")
    return FileResponse(file_path, filename=r["original_name"], media_type=r["mime_type"] or "application/octet-stream")

@app.delete("/api/files/{file_id}")
async def delete_task_file(file_id: int):
    conn = _get_db()
    row = conn.execute("SELECT * FROM task_files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "File not found")
    r = dict(row)
    file_path = os.path.join(UPLOAD_DIR, r["file_path"])
    if os.path.exists(file_path):
        os.remove(file_path)
    conn.execute("DELETE FROM task_files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ─── Чеклисты к задачам ──────────────────────────────────────────────────────

@app.get("/api/tasks/{task_type}/{task_id}/checklist")
async def get_task_checklist(task_type: str, task_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM task_checklist_items WHERE task_type = ? AND task_id = ? ORDER BY order_index, id",
        (task_type, task_id),
    ).fetchall()
    conn.close()
    return {"items": [_row(r) for r in rows]}

@app.post("/api/tasks/{task_type}/{task_id}/checklist")
async def add_checklist_item(task_type: str, task_id: int, data: dict):
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(400, "text required")
    conn = _get_db()
    # Получаем следующий order_index
    row = conn.execute(
        "SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM task_checklist_items WHERE task_type = ? AND task_id = ?",
        (task_type, task_id),
    ).fetchone()
    next_idx = _scalar(row) if row else 0
    conn.execute(
        "INSERT INTO task_checklist_items (task_type, task_id, text, order_index, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
        (task_type, task_id, text, next_idx),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/tasks/{task_type}/{task_id}/checklist/{item_id}")
async def toggle_checklist_item(task_type: str, task_id: int, item_id: int, data: dict):
    conn = _get_db()
    item = conn.execute(
        "SELECT * FROM task_checklist_items WHERE id = ? AND task_type = ? AND task_id = ?",
        (item_id, task_type, task_id),
    ).fetchone()
    if not item:
        conn.close()
        raise HTTPException(404, "Item not found")
    if "done" in data:
        conn.execute("UPDATE task_checklist_items SET done = ? WHERE id = ?", (int(data["done"]), item_id))
    if "text" in data:
        conn.execute("UPDATE task_checklist_items SET text = ? WHERE id = ?", (data["text"], item_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/tasks/{task_type}/{task_id}/checklist/{item_id}")
async def delete_checklist_item(task_type: str, task_id: int, item_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM task_checklist_items WHERE id = ? AND task_type = ? AND task_id = ?", (item_id, task_type, task_id))
    conn.commit()
    conn.close()
    return {"ok": True}

# ─── Client Tasks API ───────────────────────────────────────────────────────────

@app.get("/api/tasks")
async def list_all_tasks(status: Optional[str] = Query(None), due_date: Optional[str] = Query(None)):
    """Глобальный список задач с именем клиента."""
    conn = _get_db()
    sql = "SELECT tasks.*, clients.name as client_name, clients.telegram_nick, COALESCE(NULLIF(clients.responsible_person, ''), NULLIF(tasks.responsible_person, ''), (SELECT tm.sender_type FROM telegram_messages tm WHERE tm.client_id = tasks.client_id AND tm.sender_type != 'client' ORDER BY tm.created_at DESC LIMIT 1)) as responsible_person FROM tasks LEFT JOIN clients ON tasks.client_id = clients.id"
    where = []
    params = []
    if status:
        where.append("tasks.status = ?")
        params.append(status)
    if due_date:
        where.append("tasks.due_date = ?")
        params.append(due_date)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY tasks.created_at DESC LIMIT 500"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    tasks = [_row(r) for r in rows]
    for t in tasks:
        if t.get("responsible_person") == "personal":
            t["responsible_person"] = "Антон"
        elif t.get("responsible_person") == "assistant":
            t["responsible_person"] = "Ассистент"
    return {"tasks": tasks}


@app.get("/api/clients/{client_id}/tasks")
async def get_client_tasks(client_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM tasks WHERE client_id = ? ORDER BY created_at DESC", (client_id,)
    ).fetchall()
    conn.close()
    return {"tasks": [_row(r) for r in rows]}


@app.post("/api/tasks")
async def create_task(data: TaskCreate):
    """Создать задачу без привязки к клиенту (или с client_id)."""
    conn = _get_db()
    cid = data.client_id if data.client_id else None
    desc = data.description or ""
    if cid is None:
        conn.execute(
            "INSERT INTO tasks (client_id, title, type, due_date, created_at, description) VALUES (NULL, ?, ?, ?, datetime('now'), ?)",
            (data.title, data.task_type, data.due_date or "", desc),
        )
    else:
        rp = conn.execute(
            "SELECT COALESCE(responsible_person, '') FROM clients WHERE id = ?", (cid,)
        ).fetchone()
        rp_val = rp["coalesce"] if rp else ""
        conn.execute(
            "INSERT INTO tasks (client_id, title, type, due_date, created_at, responsible_person, description) VALUES (?, ?, ?, ?, datetime('now'), ?, ?)",
            (cid, data.title, data.task_type, data.due_date or "", rp_val, desc),
        )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}


@app.post("/api/clients/{client_id}/tasks")
async def create_client_task(client_id: int, data: TaskCreate):
    conn = _get_db()
    rp = conn.execute(
        "SELECT COALESCE(responsible_person, '') FROM clients WHERE id = ?", (client_id,)
    ).fetchone()
    rp_val = rp["coalesce"] if rp else ""
    desc = data.description or ""
    conn.execute(
        "INSERT INTO tasks (client_id, title, type, due_date, created_at, responsible_person, description) VALUES (?, ?, ?, ?, datetime('now'), ?, ?)",
        (client_id, data.title, data.task_type, data.due_date or "", rp_val, desc),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}


@app.patch("/api/tasks/{task_id}")
async def patch_task(task_id: int, data: TaskPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status)
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.task_type is not None:
        updates.append("type = ?")
        params.append(data.task_type)
    if data.due_date is not None:
        updates.append("due_date = ?")
        params.append(data.due_date)
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if not updates:
        conn.close()
        return {"ok": True}
    params.append(task_id)
    conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int):
    """Удалить задачу."""
    conn = _get_db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── API: Timeline & Messages ─────────────────────────────────────────────────

class IncomingMessage(BaseModel):
    telegram_username: str = ""
    telegram_id: str = ""
    sender_type: str = "client"   # client | personal | assistant
    text: str = ""
    client_id: int | None = None  # direct client ID (from UI)
    account: str = "personal"     # personal | assistant — какой аккаунт принял сообщение

@app.get("/api/clients/{client_id}/timeline")
async def get_timeline(client_id: int, limit: int = 50, account: str = None, before_id: int = 0):
    """
    Get telegram messages for a client. account=personal|assistant filters by account.
    Pagination via before_id: pass the id of the oldest message on screen to load older ones.
    Returns items ASC (old→new for chat display) + oldest_id for next page.
    """
    conn = _get_db()

    if account:
        account_clause = "AND tm.account = :account"
        account_params = {"account": account}
    else:
        account_clause = ""
        account_params = {}

    if before_id > 0:
        ref = conn.execute(
            "SELECT created_at FROM telegram_messages WHERE id = :id", {"id": before_id}
        ).fetchone()
        if ref:
            before_ts = ref["created_at"] if isinstance(ref, dict) else ref[0]
            msgs = conn.execute(
                f"SELECT id, 'message' as type, sender_type as sender, text, created_at FROM telegram_messages tm "
                f"WHERE client_id = :cid {account_clause} AND created_at < :ts ORDER BY created_at DESC LIMIT :lim",
                {"cid": client_id, "ts": before_ts, "lim": limit, **account_params},
            ).fetchall()
        else:
            msgs = []
    else:
        msgs = conn.execute(
            f"SELECT id, 'message' as type, sender_type as sender, text, created_at FROM telegram_messages tm "
            f"WHERE client_id = :cid {account_clause} ORDER BY created_at DESC LIMIT :lim",
            {"cid": client_id, "lim": limit, **account_params},
        ).fetchall()

    conn.close()

    items = list(msgs)[::-1]  # DESC → ASC (oldest first)

    oldest = items[0] if items else None
    oldest_id = oldest["id"] if oldest else 0

    return {"items": items, "oldest_id": oldest_id, "has_more": len(msgs) >= limit}


@app.post("/api/messages")
async def receive_message(msg: IncomingMessage):
    """Принять сообщение от Gateway/Telethon и записать в БД."""
    if not msg.text.strip():
        return {"ok": False, "error": "empty text"}

    conn = _get_db()
    client_id = msg.client_id  # direct client ID from UI

    if not client_id:
        # Try to find client by telegram_username first, then by telegram_id
        if msg.telegram_username:
            row = conn.execute(
                "SELECT id FROM clients WHERE telegram_nick = ?",
                (msg.telegram_username.lstrip("@"),)
            ).fetchone()
            if row:
                client_id = row["id"]

        if not client_id and msg.telegram_id:
            row = conn.execute(
                "SELECT id FROM clients WHERE telegram_id = ?",
                (msg.telegram_id,)
            ).fetchone()
            if row:
                cid = row["id"]
                # Guard: skip catch-all client "Telegram"
                name_row = conn.execute(
                    "SELECT name, telegram_nick FROM clients WHERE id = ?", (cid,)
                ).fetchone()
                if name_row and name_row["name"] != "Telegram" and name_row["telegram_nick"]:
                    client_id = cid

    if not client_id:
        if not msg.telegram_id:
            conn.close()
            logger.info("Message from unknown user without telegram_id, ignored")
            return {"ok": True, "ignored": True}
        # Проверяем, не создал ли конкурентный запрос этого клиента
        row = conn.execute(
            "SELECT id FROM clients WHERE telegram_id = ?", (msg.telegram_id,)
        ).fetchone()
        if row:
            client_id = row["id"]
        else:
            # Создаём нового клиента для незнакомого telegram_id
            name = msg.telegram_username.lstrip("@") if msg.telegram_username else msg.telegram_id
            try:
                conn.execute(
                    "INSERT INTO clients (name, telegram_nick, telegram_id, status, source, last_contact, created_at) "
                    "VALUES (?, ?, ?, 'Выдать контент', 'Личка', datetime('now'), datetime('now'))",
                    (name, msg.telegram_username.lstrip("@") if msg.telegram_username else "", msg.telegram_id),
                )
                client_id = conn.lastrowid
                logger.info("Created client %s for unknown user %s", client_id, msg.telegram_username or msg.telegram_id)
            except Exception:
                # Гонка: конкурентный запрос уже создал клиента — перечитываем
                row = conn.execute(
                    "SELECT id FROM clients WHERE telegram_id = ?", (msg.telegram_id,)
                ).fetchone()
                if row:
                    client_id = row["id"]
                else:
                    raise

    conn.execute(
        "INSERT INTO telegram_messages (client_id, telegram_id, sender_type, text, account, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (client_id, msg.telegram_id, msg.sender_type, msg.text, msg.account),
    )
    # Не сбрасываем статус клиентам в воронке
    cur_status = conn.execute("SELECT status FROM clients WHERE id = ?", (client_id,)).fetchone()
    if cur_status and cur_status.get("status") in ("", "Контакт", None):
        conn.execute("UPDATE clients SET last_contact = datetime('now'), status = 'Контакт', updated_at = datetime('now') WHERE id = ?", (client_id,))
    else:
        conn.execute("UPDATE clients SET last_contact = datetime('now'), updated_at = datetime('now') WHERE id = ?", (client_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "client_id": client_id}


class ClientMessageCreate(BaseModel):
    text: str
    sender: str = "note"  # note | personal | assistant
    send_to_telegram: bool = False


@app.post("/api/clients/{client_id}/messages")
async def create_client_message(client_id: int, data: ClientMessageCreate):
    """Универсальный эндпоинт: заметка → notes, сообщение → telegram_messages + отправка в Telegram."""
    if not data.text.strip():
        return {"ok": False, "error": "empty text"}

    conn = _get_db()

    if data.sender == "note":
        conn.execute("INSERT INTO notes (client_id, text) VALUES (?, ?)", (client_id, data.text))
        conn.commit()
        conn.close()
        return {"ok": True, "type": "note"}

    # Сохраняем сообщение с account
    logger.info("[SAVE] client_id=%s sender=%s text='%s'", client_id, data.sender, data.text[:60])
    try:
        conn.execute(
            "INSERT INTO telegram_messages (client_id, sender_type, text, account, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
            (client_id, data.sender, data.text, data.sender),
        )
        # Не сбрасываем статус клиентам в воронке
        cur_status = conn.execute("SELECT status FROM clients WHERE id = ?", (client_id,)).fetchone()
        if cur_status and cur_status.get("status") in ("", "Контакт", None):
            conn.execute("UPDATE clients SET last_contact = datetime('now'), status = 'Контакт', updated_at = datetime('now') WHERE id = ?", (client_id,))
        else:
            conn.execute("UPDATE clients SET last_contact = datetime('now'), updated_at = datetime('now') WHERE id = ?", (client_id,))
        conn.commit()
        logger.info("[SAVE] OK")
    except Exception as e:
        logger.error("[SAVE] FAILED: %s", e)
        raise

    # Отправка в Telegram клиенту, если запрошено
    if data.send_to_telegram:
        row = conn.execute("SELECT telegram_id, telegram_nick, name FROM clients WHERE id = ?", (client_id,)).fetchone()
        if row and row.get("telegram_id"):
            tg_id = row["telegram_id"]
            client_name = row.get("name", "") or row.get("telegram_nick", "") or f"id={client_id}"
            logger.info("[SEND] Отправка сообщения клиенту %s (id=%s, tg_id=%s, текст='%s')",
                        client_name, client_id, tg_id, data.text[:80])

            sent = False

            # Попытка 1: Bot API (если есть токен)
            if NOTIFY_BOT_TOKEN and not sent:
                try:
                    url = f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/sendMessage"
                    async with httpx.AsyncClient(timeout=10) as tg:
                        resp = await tg.post(url, json={
                            "chat_id": tg_id,
                            "text": data.text,
                            "parse_mode": "HTML",
                        })
                        resp_data = resp.json()
                        if resp_data.get("ok"):
                            logger.info("[SEND] Bot API: успешно клиенту %s (tg_id=%s)", client_name, tg_id)
                            sent = True
                        else:
                            err_desc = resp_data.get("description", "")
                            logger.warning("[SEND] Bot API: ошибка %s — %s", resp_data.get("error_code"), err_desc)
                except Exception as e:
                    logger.warning("[SEND] Bot API: исключение для %s: %s", client_name, e)

            # Попытка 2: Sender Bridge (Telethon), если Bot API не сработал
            if not sent and TELEGRAM_SENDER_URL:
                # Сопоставление sender → аккаунт Telethon
                telethon_account = "assistant" if data.sender == "assistant" else "personal"
                try:
                    async with httpx.AsyncClient(timeout=15) as tg:
                        resp = await tg.post(
                            f"{TELEGRAM_SENDER_URL}/send",
                            json={"chat_id": tg_id, "text": data.text, "account": telethon_account},
                        )
                        result = resp.json()
                        if result.get("ok"):
                            logger.info("[SEND] Sender Bridge (%s): успешно клиенту %s, msg_id=%s",
                                        telethon_account, client_name, result.get("message_id"))
                            sent = True
                        else:
                            logger.warning("[SEND] Sender Bridge (%s): ошибка — %s",
                                           telethon_account, result.get("error"))
                except Exception as e:
                    logger.warning("[SEND] Sender Bridge: исключение для %s: %s", client_name, e)

            if not sent:
                logger.warning("[SEND] НЕ УДАЛОСЬ отправить клиенту %s (tg_id=%s) ни через Bot API, ни через Sender Bridge",
                               client_name, tg_id)

        else:
            nick = row.get("telegram_nick", "—") if row else "—"
            logger.warning("[SEND] Нет telegram_id у клиента %s (id=%s, nick=%s), отправка невозможна",
                           client_name if row else f"id={client_id}", client_id, nick)

    conn.close()
    return {"ok": True, "type": "message"}


# ─── API: Clients ─────────────────────────────────────────────────────────────

@app.post("/api/clients")
async def create_client(data: ClientCreate):
    """Создать клиента в локальной БД + Notion. Проверяет дубликаты по телефону и telegram."""
    conn = _get_db()

    # Duplicate check by phone
    if data.phone:
        dup = conn.execute(
            "SELECT id, name FROM clients WHERE phone = ? AND phone != '' LIMIT 1",
            (data.phone,),
        ).fetchone()
        if dup:
            conn.close()
            return {"ok": True, "duplicate": True, "existing_id": dup["id"], "existing_name": dup["name"], "match_by": "phone"}

    # Duplicate check by telegram_nick
    nick = data.telegram_nick.lstrip("@").strip().lower()
    if nick:
        dup = conn.execute(
            "SELECT id, name FROM clients WHERE LOWER(telegram_nick) = ? AND telegram_nick != '' LIMIT 1",
            (nick,),
        ).fetchone()
        if dup:
            conn.close()
            return {"ok": True, "duplicate": True, "existing_id": dup["id"], "existing_name": dup["name"], "match_by": "telegram"}

    # Duplicate check by telegram_id
    if data.telegram_id:
        dup = conn.execute(
            "SELECT id, name FROM clients WHERE telegram_id = ? AND telegram_id != '' LIMIT 1",
            (data.telegram_id,),
        ).fetchone()
        if dup:
            conn.close()
            return {"ok": True, "duplicate": True, "existing_id": dup["id"], "existing_name": dup["name"], "match_by": "telegram_id"}

    notion_id = None
    try:
        async with httpx.AsyncClient(headers=_notion_headers(), timeout=15) as http:
            notion_id = await _notion_create_client(http, data)
    except Exception as e:
        logger.warning("Notion create failed (continuing with local): %s", e)

    cur = conn.execute(
        "INSERT INTO clients (notion_page_id, name, telegram_nick, telegram_id, phone, status, source, last_account, summary) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (notion_id, data.name, data.telegram_nick, data.telegram_id, data.phone,
         data.status, data.source, data.last_account, data.summary))
    client_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": client_id, "notion_page_id": notion_id}


@app.get("/api/clients")
async def list_clients(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    limit: int = Query(100),
    offset: int = Query(0),
):
    conn = _get_db()
    where = []
    params = []
    if not archived:
        where.append("(archived IS NULL OR archived = 0)")
    if status:
        where.append("status = ?")
        params.append(status)
    if source:
        where.append("source = ?")
        params.append(source)
    if search:
        where.append("(name LIKE ? OR telegram_nick LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    where_clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = _scalar(conn.execute(f"SELECT COUNT(*) FROM clients{where_clause}", params).fetchone())
    select_cols = "c.*"
    order_clause = "ORDER BY COALESCE((SELECT MAX(tm.created_at) FROM telegram_messages tm WHERE tm.client_id = c.id), '1970-01-01') DESC, c.updated_at DESC"
    if USE_PG:
        rows = conn.execute(
            f"SELECT c.*, (SELECT MAX(tm.created_at) FROM telegram_messages tm WHERE tm.client_id = c.id) as actual_last_contact, COALESCE(NULLIF(c.responsible_person, ''), (SELECT tm2.sender_type FROM telegram_messages tm2 WHERE tm2.client_id = c.id AND tm2.sender_type != 'client' ORDER BY tm2.created_at DESC LIMIT 1)) as responsible_person, (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id AND (d.archived IS NULL OR d.archived = 0)) as deal_count, (SELECT COUNT(*) FROM tasks t WHERE t.client_id = c.id AND t.status = 'pending') as tasks_pending FROM clients c{where_clause} {order_clause} LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT c.*, (SELECT MAX(tm.created_at) FROM telegram_messages tm WHERE tm.client_id = c.id) as actual_last_contact, COALESCE(NULLIF(c.responsible_person, ''), (SELECT tm2.sender_type FROM telegram_messages tm2 WHERE tm2.client_id = c.id AND tm2.sender_type != 'client' ORDER BY tm2.created_at DESC LIMIT 1)) as responsible_person, (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id AND (d.archived IS NULL OR d.archived = 0)) as deal_count, (SELECT COUNT(*) FROM tasks t WHERE t.client_id = c.id AND t.status = 'pending') as tasks_pending FROM clients c{where_clause} {order_clause} LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    conn.close()
    clients = [_row(r) for r in rows]
    # Attach labels and tags to each client
    if clients:
        ids = [c["id"] for c in clients]
        conn2 = _get_db()
        placeholders = ",".join("?" * len(ids))
        label_rows = conn2.execute(
            f"SELECT cl.client_id, l.id as label_id, l.name as label_name, l.color as label_color FROM client_labels cl JOIN labels l ON cl.label_id = l.id WHERE cl.client_id IN ({placeholders})",
            ids,
        ).fetchall()
        tag_rows = conn2.execute(
            f"SELECT ct.client_id, t.id as tag_id, t.name as tag_name, t.color as tag_color FROM tags t "
            f"JOIN client_tags ct ON t.id = ct.tag_id WHERE ct.client_id IN ({placeholders})",
            ids,
        ).fetchall()
        conn2.close()
        labels_by_client: dict[int, list[dict]] = {}
        for lr in label_rows:
            labels_by_client.setdefault(lr["client_id"], []).append({"id": lr["label_id"], "name": lr["label_name"], "color": lr["label_color"]})
        tags_by_client: dict[int, list[dict]] = {}
        for tr in tag_rows:
            tags_by_client.setdefault(tr["client_id"], []).append({"id": tr["tag_id"], "name": tr["tag_name"], "color": tr["tag_color"]})
        for c in clients:
            c["labels"] = labels_by_client.get(c["id"], [])
            c["tags"] = tags_by_client.get(c["id"], [])
    return {"clients": clients, "total": total, "limit": limit, "offset": offset}


@app.get("/api/clients/search")
async def search_clients(q: str = Query(...), limit: int = Query(10)):
    """Поиск клиентов по имени, @username или телефону. Используется в диалогах сделок."""
    conn = _get_db()
    pattern = f"%{q}%"
    rows = conn.execute(
        "SELECT id, name, telegram_nick, phone, status FROM clients WHERE name LIKE ? OR telegram_nick LIKE ? OR phone LIKE ? ORDER BY last_contact DESC NULLS LAST LIMIT ?",
        (pattern, pattern, pattern, limit),
    ).fetchall()
    conn.close()
    return {"clients": [_row(r) for r in rows]}


@app.get("/api/clients/{client_id}")
async def get_client(client_id: int):
    conn = _get_db()
    row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    deals = conn.execute("SELECT * FROM deals WHERE client_id = ? ORDER BY created_at DESC", (client_id,)).fetchall()
    test_results = conn.execute("SELECT * FROM test_results WHERE client_id = ? ORDER BY created_at DESC", (client_id,)).fetchall()
    last_tg_msg = _scalar(conn.execute(
        "SELECT MAX(created_at) FROM telegram_messages WHERE client_id = ?", (client_id,)
    ).fetchone())
    label_rows = conn.execute(
        "SELECT l.* FROM labels l JOIN client_labels cl ON l.id = cl.label_id WHERE cl.client_id = ?", (client_id,)
    ).fetchall()
    tag_rows = conn.execute(
        "SELECT t.* FROM tags t JOIN client_tags ct ON t.id = ct.tag_id WHERE ct.client_id = ?", (client_id,)
    ).fetchall()
    conn.close()
    if not row:
        raise HTTPException(404, "Client not found")
    result = dict(row)
    if last_tg_msg and (not result.get("last_contact") or last_tg_msg > result["last_contact"]):
        result["last_contact"] = last_tg_msg
    # Fallback: если responsible_person не назначен — вычисляем из последнего сообщения
    if not result.get("responsible_person"):
        last_sender = _scalar(conn.execute(
            "SELECT sender_type FROM telegram_messages WHERE client_id = ? AND sender_type != 'client' ORDER BY created_at DESC LIMIT 1",
            (client_id,),
        ).fetchone())
        if last_sender:
            result["responsible_person"] = "Ассистент" if last_sender == "assistant" else ("Антон" if last_sender == "personal" else last_sender)
    return {
        "client": result,
        "deals": [dict(d) for d in deals],
        "test_results": [dict(t) for t in test_results],
        "labels": [dict(l) for l in label_rows],
        "tags": [dict(t) for t in tag_rows],
    }


# ─── PATCH клиента ─────────────────────────────────────────────────────────────

class ClientPatch(BaseModel):
    status: Optional[str] = None
    next_step: Optional[str] = None
    summary: Optional[str] = None
    phone: Optional[str] = None
    telegram_nick: Optional[str] = None
    name: Optional[str] = None
    full_name: Optional[str] = None
    archived: Optional[bool] = None
    source: Optional[str] = None
    responsible_person: Optional[str] = None
    referrer_id: Optional[int] = None
    referrer_color: Optional[str] = None
    birthday: Optional[str] = None
    pseudonym: Optional[str] = None
    previous_username: Optional[str] = None

@app.patch("/api/clients/{client_id}")
async def patch_client(client_id: int, data: ClientPatch):
    """Обновить клиента (статус, поля)."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Client not found")

    updates = []
    params = []
    notion_props = {}

    if data.status:
        updates.append("status = ?")
        params.append(data.status)
        notion_props["Статус"] = {"status": {"name": data.status}}
    if data.next_step is not None:
        updates.append("next_step = ?")
        params.append(data.next_step)
        notion_props["Следующий шаг"] = {"rich_text": [{"text": {"content": data.next_step}}]}
    if data.phone is not None:
        updates.append("phone = ?")
        params.append(data.phone)
    if data.summary is not None:
        updates.append("summary = ?")
        params.append(data.summary)
        notion_props["Контекст / Саммари"] = {"rich_text": [{"text": {"content": data.summary[:2000]}}]}
    if data.telegram_nick is not None:
        updates.append("telegram_nick = ?")
        params.append(data.telegram_nick)
        notion_props["Telegram Ник"] = {"rich_text": [{"text": {"content": data.telegram_nick}}]}
    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name)
        notion_props["Имя"] = {"title": [{"text": {"content": data.name}}]}
    if data.full_name is not None:
        updates.append("full_name = ?")
        params.append(data.full_name)
    if data.archived is not None:
        updates.append("archived = ?")
        params.append(1 if data.archived else 0)
    if data.source is not None:
        updates.append("source = ?")
        params.append(data.source)
        notion_props["Источник"] = {"select": {"name": data.source}}
    if data.responsible_person is not None:
        updates.append("responsible_person = ?")
        params.append(data.responsible_person)
    if data.birthday is not None:
        updates.append("birthday = ?")
        params.append(data.birthday)
    if data.pseudonym is not None:
        updates.append("pseudonym = ?")
        params.append(data.pseudonym)
    if data.previous_username is not None:
        updates.append("previous_username = ?")
        params.append(data.previous_username)
    patch_dict = data.model_dump(exclude_unset=True)
    if "referrer_id" in patch_dict:
        updates.append("referrer_id = ?")
        params.append(patch_dict["referrer_id"])
    if "referrer_color" in patch_dict:
        updates.append("referrer_color = ?")
        params.append(patch_dict["referrer_color"])

    # Обновление в Notion
    notion_id = row["notion_page_id"]
    if notion_id and notion_props:
        try:
            async with httpx.AsyncClient(headers=_notion_headers(), timeout=15) as http:
                await http.patch(f"{NOTION_BASE}/pages/{notion_id}", json={"properties": notion_props})
        except Exception as e:
            logger.warning("Notion patch failed for %s: %s", client_id, e)

    updates.append("updated_at = datetime('now')")
    params.append(client_id)

    conn.execute(f"UPDATE clients SET {', '.join(updates)} WHERE id = ?", params)
    # Если сменился ответственный у клиента — обновить ВСЕ его задачи
    if data.responsible_person is not None:
        conn.execute(
            "UPDATE tasks SET responsible_person = ? WHERE client_id = ?",
            (data.responsible_person, client_id),
        )
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── API: Client Search ─────────────────────────────────────────────────────

@app.get("/api/clients/search")
async def search_clients(q: str = ""):
    """Search clients by name, nickname or pseudonym for referrer selection."""
    if not q or len(q.strip()) < 2:
        return {"clients": []}
    q = q.strip()
    conn = _get_db()
    like = f"%{q}%"
    rows = conn.execute(
        "SELECT id, name, telegram_nick, pseudonym FROM clients "
        "WHERE (name LIKE ? OR telegram_nick LIKE ? OR pseudonym LIKE ?) AND (archived IS NULL OR archived = 0) "
        "ORDER BY name LIMIT 20",
        (like, like, like)
    ).fetchall()
    conn.close()
    return {"clients": [{"id": r["id"], "name": r["name"], "telegram_nick": r["telegram_nick"], "pseudonym": r["pseudonym"]} for r in rows]}

# ─── API: Quiz ────────────────────────────────────────────────────────────────

@app.post("/api/quiz/submit")
async def quiz_submit(result: QuizSubmit):
    """Принять результат теста. Пишет в локальную БД + Notion."""
    source_label = "ШШ Женский" if result.test_type == "female" else "Лучший любовник"

    # Не сохраняем анонимов без контакта
    has_contact = bool(result.telegram_id or result.telegram_username or result.name or result.phone)
    if not has_contact:
        return {"ok": True, "skipped": True, "reason": "no contact info"}

    # Параллельное создание в Notion (пропускаем для авто-регистрации)
    notion_id = None
    if result.state == "started":
        pass
    else:
        try:
            async with httpx.AsyncClient(headers=_notion_headers(), timeout=15) as http:
                # поищем существующего
                existing = None
                if result.telegram_username:
                    existing = await _notion_find_client(http, result.telegram_username)

                context_lines = [
                    f"Источник: {source_label}",
                    f"Диагноз: {result.diagnosis}",
                    f"Свобода: {result.freedom_score}/40",
                    f"Сексуальность: {result.sexuality_score}/60",
                ]
                utm_parts = []
                if result.utm_source:
                    utm_parts.append(f"source={result.utm_source}")
                if result.utm_medium:
                    utm_parts.append(f"medium={result.utm_medium}")
                if result.utm_campaign:
                    utm_parts.append(f"campaign={result.utm_campaign}")
                if result.start_param:
                    utm_parts.append(f"start_param={result.start_param}")
                if utm_parts:
                    context_lines.append(f"UTM: {' '.join(utm_parts)}")
                context = "\n".join(context_lines)

                props = {
                    "Статус": {"status": {"name": "Выдать контент"}},
                    "Источник": {"select": {"name": source_label}},
                    "Контекст / Саммари": {"rich_text": [{"text": {"content": context[:2000]}}]},
                }
                if result.telegram_username:
                    props["Telegram Ник"] = {"rich_text": [{"text": {"content": result.telegram_username}}]}

                if existing:
                    notion_id = existing["id"]
                    await http.patch(f"{NOTION_BASE}/pages/{notion_id}", json={"properties": props})
                else:
                    name = result.name or result.telegram_username or "Аноним"
                    props["Имя"] = {"title": [{"text": {"content": name}}]}
                    resp = await http.post(f"{NOTION_BASE}/pages", json={
                        "parent": {"database_id": NOTION_CLIENTS_DB_ID}, "properties": props,
                    })
                    resp.raise_for_status()
                    notion_id = resp.json()["id"]
        except Exception as e:
            logger.warning("Notion quiz submit failed (local only): %s", e)

    # Пишем локально
    conn = _get_db()

    # ── Вспомогательная ф-ция: найти существующую mens-запись по нику ──
    def _find_mens_result(conn, telegram_id: str = "", username: str = "") -> int | None:
        nick = username.strip() if username else ""
        tid = telegram_id.strip() if telegram_id else ""
        if not nick and not tid:
            return None
        conds = []
        params = []
        if tid:
            conds.append("(tr.telegram_id = ? OR c.telegram_id = ?)")
            params += [tid, tid]
        if nick:
            conds.append("(c.telegram_nick = ? OR tr.name = ? OR tr.name LIKE ?)")
            params += [nick, f"@{nick}", f"%{nick}%"]
        row = conn.execute(
            "SELECT tr.id FROM test_results tr "
            "LEFT JOIN clients c ON tr.client_id = c.id "
            "WHERE (" + " OR ".join(conds) + ") AND tr.test_type = 'mens' "
            "ORDER BY tr.id DESC LIMIT 1",
            tuple(params)
        ).fetchone()
        return row["id"] if row else None

    # ── UPSERT для in_progress — только обновление test_results ──
    if result.state == "in_progress":
        existing_id = _find_mens_result(conn, telegram_id=result.telegram_id or "", username=result.telegram_username or "")

        if existing_id:
            conn.execute(
                "UPDATE test_results SET answers = ?, state = 'in_progress', current_question = ?, "
                "created_at = COALESCE(created_at, datetime('now')) WHERE id = ?",
                (json.dumps(result.answers or []), result.current_question, existing_id)
            )
        else:
            conn.execute(
                "INSERT INTO test_results (telegram_id, telegram_username, name, test_type, answers, state, current_question, created_at) "
                "VALUES (?, ?, ?, 'mens', ?, 'in_progress', ?, datetime('now'))",
                (result.telegram_id or "", result.telegram_username or "",
                 f"@{result.telegram_username}" if result.telegram_username else (result.name or ""),
                 json.dumps(result.answers or []), result.current_question)
            )

        if USE_PG:
            conn.commit()
        conn.commit()
        conn.close()
        # Запуск цепочки прогрева для незавершённого теста
        if result.telegram_id:
            asyncio.ensure_future(_start_chain(existing_id or 0, result.telegram_id, result.telegram_username or '', result.test_type or 'mens', 'in_progress'))
        return {"ok": True, "client_id": None, "notion_page_id": None}

    # ── purchase_tripwire — UPSERT (обновить существующую запись) ──
    if result.state == "purchase_tripwire":
        # Создать/найти клиента
        client_id = None
        if result.telegram_username:
            row = conn.execute("SELECT id FROM clients WHERE telegram_nick = ?", (result.telegram_username,)).fetchone()
            if row:
                client_id = row["id"]
        if not client_id and result.telegram_id:
            row = conn.execute("SELECT id FROM clients WHERE telegram_id = ?", (result.telegram_id,)).fetchone()
            if row:
                client_id = row["id"]
        if not client_id:
            cur = conn.execute(
                "INSERT INTO clients (notion_page_id, name, telegram_nick, telegram_id, phone, status, source) "
                "VALUES (?, ?, ?, ?, ?, 'Выдать контент', ?)",
                (notion_id, result.name or result.telegram_username or result.telegram_id or "Аноним",
                 result.telegram_username or "", result.telegram_id or "", result.phone or "", source_label))
            if USE_PG:
                conn.commit()
                client_id = cur.fetchone()["id"] if cur.description else None
            else:
                client_id = cur.lastrowid
        else:
            # Ставим 'Выдать контент' только если клиент ещё не продвинулся по воронке
            cur_status = conn.execute("SELECT status FROM clients WHERE id = ?", (client_id,)).fetchone()
            if cur_status and cur_status["status"] in ("Контакт", None, ""):
                conn.execute(
                    "UPDATE clients SET status = 'Выдать контент', updated_at = datetime('now') WHERE id = ?",
                    (client_id,),
                )
        if USE_PG:
            conn.commit()

        existing_id = _find_mens_result(conn, telegram_id=result.telegram_id or "", username=result.telegram_username or "")

        total_score = result.total_score or result.score or 0
        # Если phone_requested или phone уже проставлен — не затираем, оставляем для поллинга
        if result.phone_requested:
            phone_value = None  # не трогаем поле phone (поллинг проставит)
        else:
            phone_value = result.phone or result.contact or None
        if existing_id:
            conn.execute(
                "UPDATE test_results SET client_id = ?, telegram_username = ?, total_score = ?, level = ?, age = ?, intent = ?, state = 'purchase_tripwire', "
                "utm_source = ?, utm_medium = ?, utm_campaign = ?, start_param = ?, phone = ?, "
                "created_at = COALESCE(created_at, datetime('now')) WHERE id = ?",
                (client_id, result.telegram_username or "",
                 total_score, result.level or "", result.age or None, result.intent or "",
                 result.utm_source or "", result.utm_medium or "", result.utm_campaign or "",
                 result.start_param or "", phone_value if phone_value is not None else (result.phone or result.contact or None),
                 existing_id)
            )
        else:
            insert_cols = "client_id, telegram_id, telegram_username, name, age, test_type, total_score, level, utm_source, utm_medium, utm_campaign, start_param, intent, state, created_at"
            insert_vals = "?, ?, ?, ?, ?, 'mens', ?, ?, ?, ?, ?, ?, ?, 'purchase_tripwire', datetime('now')"
            insert_params = [client_id, result.telegram_id or "", result.telegram_username or "", result.name or "", result.age or None,
                             total_score, result.level or "",
                             result.utm_source or "", result.utm_medium or "", result.utm_campaign or "",
                             result.start_param or "", result.intent or ""]
            if phone_value is not None:
                insert_cols += ", phone"
                insert_vals += ", ?"
                insert_params.append(phone_value)
            conn.execute(
                f"INSERT INTO test_results ({insert_cols}) VALUES ({insert_vals})",
                tuple(insert_params)
            )

        if USE_PG:
            conn.commit()

        # Заметка
        conn.execute(
            "INSERT INTO notes (client_id, text) VALUES (?, ?)",
            (client_id, f"🔥 Хочет купить Чит-код: {result.level or '—'} ({total_score}/10)"),
        )
        if USE_PG:
            conn.commit()
        conn.commit()
        conn.close()

        # Уведомление — fire-and-forget, не ждём
        asyncio.ensure_future(_notion_notify_quiz(result))
        return {"ok": True, "client_id": client_id, "notion_page_id": notion_id}

    # ── Полноценная запись для started / completed ──
    # Ищем существующего клиента по tg нику или tg id
    client_id = None
    if result.telegram_username:
        row = conn.execute("SELECT id FROM clients WHERE telegram_nick = ?", (result.telegram_username,)).fetchone()
        if row:
            client_id = row["id"]
    if not client_id and result.telegram_id:
        row = conn.execute("SELECT id FROM clients WHERE telegram_id = ?", (result.telegram_id,)).fetchone()
        if row:
            client_id = row["id"]

    if not client_id:
        cur = conn.execute(
            "INSERT INTO clients (notion_page_id, name, telegram_nick, telegram_id, phone, status, source) "
            "VALUES (?, ?, ?, ?, ?, 'Выдать контент', ?)",
            (notion_id, result.name or result.telegram_username or "Аноним",
             result.telegram_username or result.telegram_id or "", result.telegram_id or "", result.phone or "", source_label))
        if USE_PG:
            conn.commit()
            client_id = cur.fetchone()["id"] if cur.description else None
        else:
            client_id = cur.lastrowid

    total_score = result.total_score or result.score or 0
    phone = result.phone or result.contact or ""

    # UPSERT для mens completed_test — найти существующую запись и обновить
    if result.test_type == "mens" and result.state == "completed_test":
        existing_id = _find_mens_result(conn, telegram_id=result.telegram_id or "", username=result.telegram_username or "")

        if existing_id:
            conn.execute(
                "UPDATE test_results SET client_id = ?, telegram_id = ?, telegram_username = ?, name = ?, total_score = ?, level = ?, age = ?, "
                "utm_source = ?, utm_medium = ?, utm_campaign = ?, start_param = ?, answers = ?, state = 'completed_test', "
                "created_at = COALESCE(created_at, datetime('now')) WHERE id = ?",
                (client_id, result.telegram_id or "", result.telegram_username or "", result.name or "", total_score, result.level or "", result.age or None,
                 result.utm_source or "", result.utm_medium or "", result.utm_campaign or "",
                 result.start_param or "", json.dumps(result.answers or []), existing_id)
            )
        else:
            conn.execute(
                "INSERT INTO test_results (client_id, telegram_id, telegram_username, name, phone, age, test_type, total_score, level, "
                "utm_source, utm_medium, utm_campaign, start_param, answers, state, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 'mens', ?, ?, ?, ?, ?, ?, ?, 'completed_test', datetime('now'))",
                (client_id, result.telegram_id or "", result.telegram_username or "", result.name or "", phone, result.age or None,
                 total_score, result.level or "",
                 result.utm_source or "", result.utm_medium or "", result.utm_campaign or "",
                 result.start_param or "", json.dumps(result.answers or []))
            )
    else:
        # Female test — INSERT как обычно
        conn.execute(
            "INSERT INTO test_results (client_id, telegram_id, telegram_username, name, last_name, phone, age, test_type, "
            "freedom_score, sexuality_score, total_score, level, diagnosis, utm_source, utm_medium, utm_campaign, start_param, intent, state, answers) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (client_id, result.telegram_id or "", result.telegram_username or "", result.name or "", result.last_name or "",
             phone, result.age,
             result.test_type, result.freedom_score, result.sexuality_score, total_score,
             result.level, result.diagnosis, result.utm_source or "", result.utm_medium or "", result.utm_campaign or "",
             result.start_param or "", result.intent or "", result.state or "", json.dumps(result.answers or [])))

    if USE_PG:
        conn.commit()

    # Заметка
    if result.state == "completed_test":
        test_label = "ШШ Женский" if result.test_type == "female" else "Лучший любовник"
        conn.execute(
            "INSERT INTO notes (client_id, text) VALUES (?, ?)",
            (client_id, f"📊 Прошёл(ла) {test_label} — {total_score}/{'30' if result.test_type == 'mens' else '10'}, уровень: {result.level or '—'}"),
        )

    if USE_PG:
        conn.commit()

    # Инкремент счётчика
    if result.state == "completed_test":
        conn.execute("UPDATE quiz_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'live_increment'")

    # Получаем id результата для цепочки прогрева (до закрытия conn)
    tr_id = None
    if result.state == "completed_test" and result.telegram_id:
        tr = conn.execute(
            "SELECT id FROM test_results WHERE telegram_id = ? AND test_type = ? ORDER BY id DESC LIMIT 1",
            (result.telegram_id, result.test_type)
        ).fetchone()
        if tr:
            tr_id = tr["id"]

    conn.commit()
    conn.close()

    # Уведомление
    if result.state == "completed_test":
        await _notion_notify_quiz(result)

    # Запуск цепочки прогрева (только если есть контакт)
    if tr_id:
        asyncio.ensure_future(_start_chain(tr_id, result.telegram_id, result.telegram_username or '', result.test_type, 'completed'))

    # Отправка видео в бота при completed_test
    # Для мужского теста видео1 отправляется по клику на странице результатов, а не авто
    if result.state == "completed_test" and result.telegram_id and result.test_type != "mens":
        vkey = result.video_key or "video1"
        logger.info("Auto-sending video %s to %s (test_type=%s)", vkey, result.telegram_id, result.test_type)
        asyncio.ensure_future(_send_video_to_user(result.telegram_id, result.test_type, vkey))

    return {"ok": True, "client_id": client_id, "notion_page_id": notion_id}


@app.get("/api/quiz/count")
async def quiz_count():
    conn = _get_db()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM test_results WHERE test_type = 'female' AND (state = 'completed_test' OR (diagnosis IS NOT NULL AND diagnosis != ''))"
    ).fetchone()
    conn.close()
    return {"count": row["cnt"]}


@app.get("/api/quiz/results")
async def quiz_results(test_type: str = Query("all"), limit: int = 200, offset: int = 0):
    """Результаты тестов: test_type = female, mens, rpp, или all."""
    conn = _get_db()
    where = []
    params = []
    if test_type != "all":
        where.append("test_type = ?")
        params.append(test_type)
    w = (" WHERE " + " AND ".join(where)) if where else ""
    total = _scalar(conn.execute(f"SELECT COUNT(*) FROM test_results{w}", params).fetchone())
    rows = conn.execute(
        f"SELECT tr.*, c.name as client_name, c.telegram_nick as client_telegram_nick FROM test_results tr LEFT JOIN clients c ON tr.client_id = c.id{w} ORDER BY tr.created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    conn.close()
    items = []
    for r in rows:
        item = _row(r)
        # telegram_username: приоритет — собственное поле tr.telegram_username,
        # затем client_telegram_nick (для старых записей без миграции),
        # затем name с @ (для совсем старых)
        if not item.get("telegram_username"):
            if item.get("client_telegram_nick"):
                item["telegram_username"] = item["client_telegram_nick"]
            elif item.get("name", "").startswith("@"):
                item["telegram_username"] = item["name"].lstrip("@")
        del item["client_telegram_nick"]
        # Если client_id нет — пытаемся найти по telegram_username или telegram_id
        if not item.get("client_id"):
            tun = (item.get("telegram_username") or "").strip()
            tid = (item.get("telegram_id") or "").strip()
            if tun:
                c = conn.execute("SELECT id FROM clients WHERE telegram_nick = ?", (tun,)).fetchone()
                if c:
                    item["client_id"] = c["id"]
            if not item.get("client_id") and tid:
                c = conn.execute("SELECT id FROM clients WHERE telegram_id = ?", (tid,)).fetchone()
                if c:
                    item["client_id"] = c["id"]
        if isinstance(item.get("answers"), str):
            try:
                item["answers"] = json.loads(item["answers"])
            except (json.JSONDecodeError, TypeError):
                item["answers"] = {}
        items.append(item)
    return {"items": items, "total": total}


@app.delete("/api/quiz/results/{result_id}")
async def quiz_delete_result(result_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM test_results WHERE id = ?", (result_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


class UpdateResultRequest(BaseModel):
    name: str | None = None
    telegram_username: str | None = None
    phone: str | None = None
    utm_source: str | None = None


@app.patch("/api/quiz/results/{result_id}")
async def quiz_patch_result(result_id: int, data: UpdateResultRequest):
    conn = _get_db()
    updates = []
    params = []
    for field in ("name", "telegram_username", "phone", "utm_source"):
        val = getattr(data, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)
    if not updates:
        conn.close()
        return {"ok": False, "error": "no fields to update"}
    params.append(result_id)
    conn.execute(f"UPDATE test_results SET {', '.join(updates)} WHERE id = ?", params)

    # Синхронизация: если обновили telegram_username — обновить и clients.telegram_nick
    if data.telegram_username is not None:
        row = conn.execute("SELECT client_id FROM test_results WHERE id = ?", (result_id,)).fetchone()
        if row and row["client_id"]:
            conn.execute(
                "UPDATE clients SET telegram_nick = ? WHERE id = ?",
                (data.telegram_username.lstrip("@"), row["client_id"])
            )

    conn.commit()
    conn.close()
    return {"ok": True}


# Исторические UTM-данные мужского теста (из старой CRM до 10.05.2026)
# Приплюсовываются к динамическим данным из БД
LEGACY_UTM_DATA: dict[str, dict] = {
    "amoralshtychka": {"total": 118, "opened": 118, "passed": 73, "video1": 53, "video2": 14, "booked": 5, "purchase": 3, "call": 2},
    "sexafishapiter": {"total": 73, "opened": 73, "passed": 53, "video1": 41, "video2": 4, "booked": 5, "purchase": 1, "call": 4},
    "zapiskimariki": {"total": 69, "opened": 69, "passed": 61, "video1": 31, "video2": 7, "booked": 3, "purchase": 0, "call": 3},
    "itistinder": {"total": 60, "opened": 60, "passed": 53, "video1": 26, "video2": 14, "booked": 2, "purchase": 2, "call": 0},
    "sexinstryktorsha": {"total": 47, "opened": 47, "passed": 43, "video1": 19, "video2": 7, "booked": 0, "purchase": 0, "call": 0},
    "kydashodit18": {"total": 43, "opened": 43, "passed": 38, "video1": 20, "video2": 7, "booked": 2, "purchase": 0, "call": 2},
    "KatrinBranko": {"total": 38, "opened": 38, "passed": 33, "video1": 13, "video2": 0, "booked": 0, "purchase": 0, "call": 0},
    "sexafihaspb": {"total": 23, "opened": 23, "passed": 21, "video1": 7, "video2": 2, "booked": 0, "purchase": 0, "call": 0},
    "katotnosheniya": {"total": 20, "opened": 20, "passed": 19, "video1": 15, "video2": 1, "booked": 2, "purchase": 1, "call": 1},
    "stateofshumkin": {"total": 15, "opened": 15, "passed": 13, "video1": 10, "video2": 3, "booked": 3, "purchase": 0, "call": 3},
    "sexafihamsk": {"total": 15, "opened": 15, "passed": 12, "video1": 4, "video2": 2, "booked": 0, "purchase": 0, "call": 0},
    "ellisssa": {"total": 14, "opened": 14, "passed": 14, "video1": 6, "video2": 2, "booked": 2, "purchase": 0, "call": 2},
    "silavoob": {"total": 12, "opened": 12, "passed": 10, "video1": 6, "video2": 4, "booked": 0, "purchase": 0, "call": 0},
    "assistant": {"total": 3, "opened": 3, "passed": 1, "video1": 0, "video2": 0, "booked": 0, "purchase": 0, "call": 0},
    "vkanton": {"total": 2, "opened": 2, "passed": 1, "video1": 1, "video2": 0, "booked": 0, "purchase": 0, "call": 0},
    "instashumkin": {"total": 2, "opened": 2, "passed": 1, "video1": 0, "video2": 0, "booked": 0, "purchase": 0, "call": 0},
}

@app.get("/api/quiz/mens-stats")
async def quiz_mens_stats():
    """Статистика по мужскому тесту для дашборда."""
    conn = _get_db()

    # Все записи мужского теста
    has_tun_col = False
    try:
        conn.execute("SELECT telegram_username FROM test_results LIMIT 1")
        has_tun_col = True
    except Exception:
        pass

    if has_tun_col:
        all_rows = conn.execute(
            "SELECT id, telegram_id, telegram_username, name, total_score, level, diagnosis, "
            "utm_source, utm_medium, utm_campaign, phone, created_at FROM test_results WHERE test_type = 'mens' ORDER BY created_at DESC"
        ).fetchall()
    else:
        all_rows = conn.execute(
            "SELECT id, telegram_id, '' as telegram_username, name, total_score, level, diagnosis, "
            "utm_source, utm_medium, utm_campaign, phone, created_at FROM test_results WHERE test_type = 'mens' ORDER BY created_at DESC"
        ).fetchall()

    # uniqueResults: дедупликация по telegram_id, затем по telegram_username
    seen_ids: set[str] = set()
    seen_usernames: set[str] = set()
    unique: list[dict] = []
    for r in all_rows:
        tid = (r["telegram_id"] or "").strip()
        tun = (r["telegram_username"] or "").strip()
        if tid and tid in seen_ids:
            continue
        if tun and tun in seen_usernames:
            continue
        if tid:
            seen_ids.add(tid)
        if tun:
            seen_usernames.add(tun)
        unique.append(dict(r))

    total = len(unique)
    opened = sum(1 for r in unique if r.get("total_score", 0) or r.get("diagnosis", ""))
    completed = sum(1 for r in unique if r.get("total_score", 0) or r.get("diagnosis", ""))
    booked_db = sum(1 for r in unique if (r.get("phone") or "").strip())
    scores = [r["total_score"] for r in unique if r.get("total_score", 0) > 0]
    avg_score = round(sum(scores) / len(scores)) if scores else 0

    # Уровни
    level_map: dict[str, int] = {}
    for r in unique:
        lvl = r.get("level") or r.get("diagnosis") or "Не указан"
        level_map[lvl] = level_map.get(lvl, 0) + 1
    levels_list = [{"name": k, "count": v} for k, v in sorted(level_map.items(), key=lambda x: -x[1])]

    # UTM breakdown: слияние legacy + БД в одну строку на источник
    db_utm: dict[str, dict] = {}
    for r in unique:
        src = (r.get("utm_source") or "").strip() or "—"
        med = (r.get("utm_medium") or "").strip()
        cam = (r.get("utm_campaign") or "").strip()
        key = f"{src}|{med}|{cam}"
        if key not in db_utm:
            db_utm[key] = {"source": src, "medium": med, "campaign": cam, "total": 0, "completed": 0, "booked": 0}
        db_utm[key]["total"] += 1
        db_utm[key]["completed"] += 1 if (r.get("total_score") or 0) > 0 else 0
        db_utm[key]["booked"] += 1 if (r.get("phone") or "").strip() else 0

    conn.close()

    # Слияние: legacy + БД — один проход, один словарь
    sources_map: dict[str, dict] = {}
    # 1. Сначала legacy-данные (ключи — плоские source, без medium/campaign)
    LEGACY = LEGACY_UTM_DATA
    for src, leg in LEGACY.items():
        sources_map[src] = {
            "source": src, "medium": "", "campaign": "",
            "total": leg["total"],
            "opened": leg["opened"],
            "completed": leg["passed"],
            "video1": leg["video1"],
            "video2": leg["video2"],
            "booked": leg["booked"],
            "purchase": leg["purchase"],
            "call": leg["call"],
        }
    # 2. Прибавить данные из БД (сгруппированные по source)
    for db in db_utm.values():
        src = db["source"]
        med = db["medium"]
        cam = db["campaign"]
        if src in sources_map:
            # Legacy source — мержим в одну строку, medium/campaign из первой записи БД
            entry = sources_map[src]
            if med and not entry["medium"]:
                entry["medium"] = med
            if cam and not entry["campaign"]:
                entry["campaign"] = cam
            entry["total"] += db["total"]
            entry["opened"] += db["total"]
            entry["completed"] += db["completed"]
            entry["booked"] += db["booked"]
        else:
            # Новый source — просто добавляем
            if src not in sources_map:
                sources_map[src] = {
                    "source": src, "medium": med, "campaign": cam,
                    "total": 0, "opened": 0, "completed": 0,
                    "video1": 0, "video2": 0, "booked": 0, "purchase": 0, "call": 0,
                }
            entry = sources_map[src]
            entry["total"] += db["total"]
            entry["opened"] += db["total"]
            entry["completed"] += db["completed"]
            entry["booked"] += db["booked"]

    sources_list = []
    for src, entry in sorted(sources_map.items(), key=lambda x: -x[1]["total"]):
        target_actions = entry["booked"] + entry["purchase"] + entry["call"]
        base_total = max(entry["opened"], 1)
        entry["conversion"] = min(round(target_actions / base_total * 100), 100)
        sources_list.append(entry)

    return {
        "total": total,
        "opened": opened,
        "completed": completed,
        "avg_score": avg_score,
        "levels": levels_list,
        "booked": booked_db,
        "by_source": sources_list,
        "legacy_totals": {
            "total": total,
            "opened": opened,
            "completed": completed,
            "booked": booked_db,
            "video1": sum(leg["video1"] for leg in LEGACY_UTM_DATA.values()),
            "video2": sum(leg["video2"] for leg in LEGACY_UTM_DATA.values()),
            "purchase_intent": sum(leg["purchase"] for leg in LEGACY_UTM_DATA.values()),
            "call_intent": sum(leg["call"] for leg in LEGACY_UTM_DATA.values()),
        },
    }


class MensEvent(BaseModel):
    event: str
    metadata: dict = {}


@app.post("/api/quiz/mens-event")
async def quiz_mens_event(data: MensEvent):
    """Принимает события с мужского теста (просмотры видео и т.д.)."""
    now = (datetime.utcnow() + timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S")
    db = _get_db()
    try:
        db.execute(
            "INSERT INTO quiz_events (event, metadata, created_at) VALUES (?, ?, ?)",
            (data.event, json.dumps(data.metadata), now)
        )
        db.commit()
    finally:
        db.close()
    return {"ok": True}


VIDEO_CATALOG = {
    "mens": {
        "video1": {
            "file_id": "BAACAgIAAxkBAAIErGolk-SdQIdpuxEZfH4JV7-mExatAALtqwACjHUxSR-KcPGxQlroOwQ",
            "buttons": [
                [{"text": "📺 YouTube", "url": "https://youtu.be/kUMMKAXRDFY"}],
                [{"text": "▶️ VK Видео", "url": "https://vkvideo.ru/video-215480274_456239113?list=ln-9HzJPeBkBWJRV8irsp"}],
                [{"text": "🎬 RuTube", "url": "https://rutube.ru/video/private/478bb90b5834121b2d3e5f64313b2346/?p=A4Mfhes2Lyim2-FmEuSvug"}],
            ],
            "caption": (
                "<b>Как ты можешь делать своих девушек возбужденными и мокрыми через слова?</b>\n\n"
                "Смотреть на площадках →\n\n"
                "00:00 — Как свести девушку с ума без прикосновений\n"
                "00:10 — Секс-фейлы, которые всё портят\n"
                "01:27 — Негативные последствия в жизни без секса\n"
                "01:42 — Слова, от которых она тает\n"
                "02:34 — Как меняется жизнь с качественным сексом?\n"
                "02:49 — Как стать её лучшим?"
            ),
        },
        "video2": {
            "file_id": "BAACAgIAAxkBAAIErWolldZi4L_abckZxxCfb5N-ZIZ1AAIdrAACjHUxSdl2ykmlI3Q1OwQ",
            "buttons": [
                [{"text": "📺 YouTube", "url": "https://youtu.be/CtVRDg7sHZY"}],
                [{"text": "▶️ VK Видео", "url": "https://vkvideo.ru/video-215480274_456239114?list=ln-rC09dwEy7kN0J8ZRhd"}],
                [{"text": "🎬 RuTube", "url": "https://rutube.ru/video/private/a305d2cea2b881f72ae8982272e3bb04/?p=y3MZn4J8-0E2-ok96V-xCA"}],
            ],
            "caption": (
                "<b>Как работает трансовый (гипнотический) оргазм?</b>\n\n"
                "Смотреть на площадках →\n\n"
                "Понравился контент? Перешли другу.\U0001f609\n\n"
                "0:00 — Почему тема гипнотических оргазмов важна\n"
                "0:34 — Как это работает?\n"
                "1:20 — До и после освоения гипнооргазма\n"
                "2:13 — Где и как можно вызвать гипнооргазм?\n"
                "2:42 — Что происходит с девушкой после опыта гипнооргазма\n"
                "3:56 — До и после — тело как высокочувствительный инструмент\n"
                "4:47 — Кто я такой?\n"
                "5:52 — Как обучиться гипнооргазму?\n"
                "6:37 — Отзывы участников курса\n"
                "8:50 — Пример реальной техники гипнотического внушения\n"
                "10:07 — Как стать лучшим любовником.\n\n"
                "<i>Если что-то внутри отозвалось — ты знаешь, куда идти. Решение за тобой.</i>"
            ),
        },
    },
    "female": {
        "video1": {
            "file_id": "BAACAgIAAxkBAAPHaiWXyJi886oQo81KXQ9oWBDYWboAAmGrAAI_SDBJOOQN9ekl79Q7BA",
            "buttons": [
                [{"text": "📺 YouTube", "url": "https://youtu.be/9I1vZ3VmtIU"}],
                [{"text": "▶️ VK Видео", "url": "https://vkvideo.ru/video-215480274_456239111"}],
                [{"text": "🎬 RuTube", "url": "https://rutube.ru/video/private/010f54cce51f609c72ae1c97fad7ea0b/?p=LD0i3hl3F0PvCKjj2EZ-wA"}],
            ],
            "caption": (
                "<b>Как ты через прокачку сексуальности и оргазмичности станешь счастливее, здоровее, реализованнее и укрепишь свои отношения?</b>\n\n"
                "Смотреть на площадках →\n\n"
                "Таймкоды:\n"
                "00:19 — Как я делаю девушек богинями секса?\n"
                "00:20 — Типичные трудности в сексе у женщин\n"
                "01:20 — Мифы и установки о собственной \"инаковости\"\n"
                "02:22 — Сценарии секса без удовлетворения\n"
                "03:43 — Как это влияет на психику женщины\n"
                "04:51 — Влияние на мужчину и отношения\n"
                "05:59 — Оргазмичность как первооснова женского развития\n"
                "06:54 — Решение: как можно иначе?\n"
                "07:31 — Методика без магии и эзотерики\n"
                "08:17 — Влияние на жизнь, отношения и карьеру\n"
                "09:01 — Что даёт женщине оргазмичность?\n\n"
                "Нравится контент? Перешли подруге.\U0001f609"
            ),
        },
        "video2": {
            "file_id": "BAACAgIAAxkBAAPLaiWb7sPxOLHOXDvGC-wltEW9OqQAArmrAAI_SDBJfe1QwToJtpY7BA",
            "buttons": [
                [{"text": "📺 YouTube", "url": "https://youtu.be/mdFxZxb6Ti8"}],
                [{"text": "▶️ VK Видео", "url": "https://vkvideo.ru/video-215480274_456239112"}],
                [{"text": "🎬 RuTube", "url": "https://rutube.ru/video/private/003e4b0087f4c2c970f51ad809a125ca/?p=CV0VfL2mcuA9PRVNiSM6rA"}],
            ],
            "caption": (
                "<b>«Женская Природа»: как это работает? Презентация</b>\n\n"
                "Смотреть на площадках →\n\n"
                "00:00 — Женский оргазм: что скрывается за этим понятием\n"
                "00:33 — Возбуждение во сне: как это объясняет гипнооргазм\n"
                "00:57 — Как сила слова создаёт оргазм: волшебство или наука?\n"
                "01:23 — Эволюция оргазма: от 30 секунд до 10 минут удовольствия\n"
                "02:41 — Метаморфозы тела: от обычного автомобиля до Ferrari\n"
                "02:50 — Кто я такой?\n"
                "03:26 — Как убрать препятствия на пути к наслаждению\n"
                "03:51 — Как этому научиться?\n"
                "04:47 — Преобразование: от умения расслабляться до уверенности\n"
                "04:42 — Отзывы реальных женщин\n"
                "07:11 — Путь к раскрытию сексуальности\n"
                "08:42 — Секреты оргазма без прикосновений\n"
                "11:04 — Новая версия себя: уверенная, сексуальная\n\n"
                "Нравится контент? Перешли подруге.\U0001f609\n\n"
                "<i>Если где-то внутри откликается — ты знаешь, куда идти. Можно зайти. Можно закрыть. Выбор твой.</i>"
            ),
        },
    },
}


@app.post("/api/quiz/send-video")
async def quiz_send_video(data: dict):
    """Отправить пользователю видео в бота (дубль при просмотре в тесте)."""
    telegram_id = data.get("telegram_id")
    test_type = data.get("test_type", "mens")
    video_key = data.get("video_key", "video1")
    ok, err = await _send_video_to_user(telegram_id, test_type, video_key)
    return {"ok": ok, "error": err}

@app.get("/api/quiz/trigger-video")
async def quiz_trigger_video(telegram_id: str, video_key: str = "video1", test_type: str = "mens"):
    """Вызов через Image-маяк (GET без CORS-preflight) из Telegram WebView."""
    ok, err = await _send_video_to_user(telegram_id, test_type, video_key)
    return {"ok": ok, "error": err}



@app.get("/api/quiz/events")
async def quiz_events(event_filter: Optional[str] = Query(None)):
    """Возвращает события quiz_events. Фильтр: event=CTA_QUICKSTART_CLICKED,CTA_ZHP_CLICKED"""
    db = _get_db()
    try:
        if event_filter:
            events_list = [e.strip() for e in event_filter.split(",")]
            placeholders = ", ".join("%s" for _ in events_list)
            rows = db.execute(
                f"SELECT * FROM quiz_events WHERE event IN ({placeholders}) ORDER BY created_at DESC",
                events_list
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM quiz_events ORDER BY created_at DESC").fetchall()
    finally:
        db.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@app.post("/api/quiz/send-pdf")
async def send_pdf(req: SendPdfRequest):
    bot_token = MENS_BOT_TOKEN if req.test_type == "mens" else QUIZ_BOT_TOKEN
    if not bot_token:
        logging.warning("send_pdf: bot token not configured for test_type=%s", req.test_type)
        return {"ok": False, "error": "bot token not configured"}

    try:
        pdf_bytes = base64.b64decode(req.pdf_base64)
        logging.info("send_pdf: decoded base64, size=%d bytes, tg_id=%s, test_type=%s",
                     len(pdf_bytes), req.telegram_id, req.test_type)
    except Exception as e:
        logging.error("send_pdf: base64 decode failed: %s", e)
        return {"ok": False, "error": "invalid base64"}

    url = f"https://api.telegram.org/bot{bot_token}/sendDocument"
    try:
        async with httpx.AsyncClient(timeout=60) as tg:
            resp = await tg.post(
                url,
                data={"chat_id": req.telegram_id, "caption": "Твои результаты диагностики 🔥"},
                files={"document": ("diagnostics.pdf", pdf_bytes, "application/pdf")},
            )
            data = resp.json()
            logging.info("send_pdf: Telegram response ok=%s, status=%s",
                        data.get("ok"), resp.status_code)
            if not data.get("ok"):
                logging.error("send_pdf: Telegram error: %s", data.get("description", "unknown"))
                return {"ok": False, "error": data.get("description", "telegram_error")}
    except Exception as e:
        logging.error("send_pdf: HTTP request failed: %s", e)
        return {"ok": False, "error": str(e)}
    return {"ok": True}


# ─── API: Request Contact from Telegram Mini App ─────────────────────

@app.post("/api/quiz/request-contact")
async def quiz_request_contact(data: dict):
    """Запустить фоновый поллинг для ловли контакта после requestContact из Mini App."""
    token = MENS_BOT_TOKEN or QUIZ_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "bot token not configured"}
    telegram_id = data.get("telegram_id") or data.get("chat_id")
    if not telegram_id:
        return {"ok": False, "error": "telegram_id required"}

    request_id = f"contact_{telegram_id}_{int(datetime.now().timestamp())}"
    asyncio.ensure_future(_poll_contact(telegram_id, request_id, token))

    return {"ok": True, "request_id": request_id}


@app.get("/api/quiz/results/{test_id}/download")
async def download_test_result(test_id: int):
    """Вернуть данные теста в JSON для скачивания/печати."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM test_results WHERE id = ?", (test_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Test result not found")
    result = dict(row)
    # Отдаём HTML с результатами для печати
    is_female = result.get("test_type") == "female"
    html_content = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Результаты теста</title>
<style>
body {{ font-family: system-ui, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; color: #222; }}
h1 {{ font-size: 1.5rem; margin-bottom: 0.5rem; }}
.meta {{ color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }}
.scores {{ display: flex; gap: 2rem; margin: 1.5rem 0; }}
.score {{ background: #f5f5f5; padding: 1rem 1.5rem; border-radius: 0.75rem; text-align: center; }}
.score .label {{ font-size: 0.8rem; color: #666; }}
.score .value {{ font-size: 1.5rem; font-weight: bold; }}
.diagnosis {{ background: #f0f0ff; padding: 1rem; border-radius: 0.75rem; margin: 1rem 0; }}
.diagnosis h3 {{ margin: 0 0 0.5rem; font-size: 0.9rem; color: #555; }}
.diagnosis p {{ margin: 0; font-size: 1rem; }}
@media print {{ body {{ padding: 0; }} }}
</style></head><body>
<h1>{'ШШ Женский' if is_female else 'Лучший любовник'}</h1>
<div class="meta">{result.get('name', '')} &middot; {result.get('created_at', '')}</div>
<div class="scores">
<div class="score"><div class="label">Свобода</div><div class="value">{result.get('freedom_score', 0)}/40</div></div>
<div class="score"><div class="label">{'Раскрепощённость' if is_female else 'Сексуальность'}</div><div class="value">{result.get('sexuality_score', 0)}/60</div></div>
</div>
"""
    if result.get("diagnosis"):
        html_content += f'<div class="diagnosis"><h3>Результат</h3><p>{result["diagnosis"]}</p></div>'
    html_content += "</body></html>"
    return HTMLResponse(content=html_content, status_code=200)


@app.get("/api/quiz/check-contact")
async def quiz_check_contact(request_id: str = Query(...)):
    """Проверить, пришёл ли контакт от пользователя."""
    if not request_id.startswith("contact_"):
        return {"ok": False, "error": "invalid request_id"}
    parts = request_id.split("_")
    telegram_id = parts[1]
    db = _get_db()
    try:
        row = db.execute(
            "SELECT phone, telegram_id, name FROM test_results "
            "WHERE telegram_id = ? AND phone IS NOT NULL AND phone != '' "
            "ORDER BY created_at DESC LIMIT 1",
            (telegram_id,)
        ).fetchone()
        if row and row["phone"]:
            return {"ok": True, "phone": row["phone"]}
    finally:
        db.close()
    return {"ok": False, "phone": None}


async def _poll_contact(telegram_id: str | int, request_id: str, bot_token: str):
    """Фоновый поллинг getUpdates в течение 35 секунд для ловли контакта.

    Не отправляет пользователю никаких сообщений — просто сохраняет номер в БД.
    """
    tid = int(telegram_id)
    url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
    offset = 0
    deadline = datetime.now() + timedelta(seconds=35)
    logger.info("[poll_contact] started for telegram_id=%s, deadline=%s", tid, deadline.isoformat())

    while datetime.now() < deadline:
        try:
            async with httpx.AsyncClient(timeout=10) as tg:
                resp = await tg.post(url, json={"offset": offset, "timeout": 5})
                data = resp.json()
                if not data.get("ok"):
                    logger.warning("[poll_contact] getUpdates not ok for tid=%s: %s", tid, data.get("description", "no description"))
                    await asyncio.sleep(2)
                    continue
                for update in data.get("result", []):
                    update_id = update.get("update_id", 0)
                    if update_id >= offset:
                        offset = update_id + 1
                    msg = update.get("message", {})
                    contact = msg.get("contact")
                    if not contact:
                        continue
                    user_id = msg.get("from", {}).get("id")
                    if user_id != tid:
                        logger.info("[poll_contact] contact from different user %s (waiting %s), skipping", user_id, tid)
                        continue
                    phone = contact.get("phone_number", "")
                    name = contact.get("first_name", "")
                    if phone:
                        logger.info("[poll_contact] found phone=%s name=%s for tid=%s", phone, name, tid)
                        # Используем прямое подключение без DB() — у DB баг с глобальным _pg_conn
                        try:
                            pg = psycopg2.connect(PG_URL)
                            pg.autocommit = False
                            cur = pg.cursor()
                            # Ждём появления записи в test_results (если ещё не создана)
                            for attempt in range(20):
                                cur.execute(
                                    "SELECT id FROM test_results WHERE telegram_id = %s LIMIT 1",
                                    (str(tid),)
                                )
                                row = cur.fetchone()
                                logger.info("[poll_contact] wait attempt=%s tid=%s row=%s", attempt, tid, row)
                                if row:
                                    break
                                await asyncio.sleep(0.5)
                            cur.execute(
                                "UPDATE test_results SET phone = %s, name = COALESCE(NULLIF(name, ''), %s) "
                                "WHERE telegram_id = %s",
                                (phone, name, str(tid))
                            )
                            logger.info("[poll_contact] test_results update: rowcount=%s", cur.rowcount)
                            cur.execute(
                                "UPDATE clients SET phone = %s WHERE telegram_id = %s AND (phone IS NULL OR phone = '')",
                                (phone, str(tid))
                            )
                            logger.info("[poll_contact] clients update: rowcount=%s", cur.rowcount)
                            pg.commit()
                            logger.info("[poll_contact] committed for tid=%s", tid)
                            cur.close()
                            pg.close()
                        except Exception as e:
                            logger.error("[poll_contact] db error for tid=%s: %s", tid, e, exc_info=True)
                        return
                await asyncio.sleep(1)
        except Exception as e:
            logger.warning("[poll_contact] network error for tid=%s: %s", tid, e)
            await asyncio.sleep(2)

    logger.info("[poll_contact] timeout reached for tid=%s, no contact found", tid)


# ─── API: Цепочки сообщений (прогрев) ──────────────────────────────────────

def _contact_display(telegram_username: str, telegram_id: str) -> str:
    """Вернуть @username или ID {id} для отображения."""
    if telegram_username:
        return f"@{telegram_username}"
    if telegram_id:
        return f"ID {telegram_id}"
    return "—"


@app.get("/api/chain/messages")
async def chain_messages_list(test_type: str = Query("all")):
    conn = _get_db()
    if test_type != "all":
        rows = conn.execute("SELECT * FROM chain_messages WHERE test_type = ? ORDER BY trigger, step", (test_type,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM chain_messages ORDER BY test_type, trigger, step").fetchall()
    conn.close()
    return {"items": [_row(r) for r in rows]}


@app.post("/api/chain/messages")
async def chain_messages_create(data: ChainMessageCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO chain_messages (test_type, trigger, step, delay_minutes, text_template, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        (data.test_type, data.trigger, data.step, data.delay_minutes, data.text_template, data.is_active)
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.patch("/api/chain/messages/{msg_id}")
async def chain_messages_update(msg_id: int, data: ChainMessageUpdate):
    conn = _get_db()
    sets, params = [], []
    if data.text_template is not None:
        sets.append("text_template = ?"); params.append(data.text_template)
    if data.delay_minutes is not None:
        sets.append("delay_minutes = ?"); params.append(data.delay_minutes)
    if data.is_active is not None:
        sets.append("is_active = ?"); params.append(data.is_active)
    if not sets:
        conn.close(); return {"error": "no fields"}
    params.append(msg_id)
    conn.execute(f"UPDATE chain_messages SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/chain/state")
async def chain_state_list(test_type: str = Query("all"), status: str = Query("active")):
    conn = _get_db()
    where, params = [], []
    if test_type != "all":
        where.append("cs.test_type = ?"); params.append(test_type)
    if status != "all":
        where.append("cs.status = ?"); params.append(status)
    w = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT cs.*, tr.name as result_name, tr.telegram_username, tr.telegram_id "
        f"FROM chain_state cs LEFT JOIN test_results tr ON cs.test_result_id = tr.id{w} "
        f"ORDER BY cs.created_at DESC LIMIT 100",
        params
    ).fetchall()
    conn.close()
    return {"items": [_row(r) for r in rows]}


async def _send_chain_message(telegram_id: str, text: str, test_type: str) -> bool:
    """Отправить сообщение через бота (только бот, без fallback на личный аккаунт)."""
    bot_token = QUIZ_BOT_TOKEN if test_type == "female" else MENS_BOT_TOKEN
    if not bot_token:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as tg:
            resp = await tg.post(url, json={"chat_id": telegram_id, "text": text, "parse_mode": "HTML"})
            if resp.status_code == 200 and resp.json().get("ok"):
                return True
    except Exception:
        pass
    return False


async def _send_video_to_user(telegram_id: str | None, test_type: str, video_key: str) -> tuple[bool, str | None]:
    """Отправить видео пользователю в Telegram. Возвращает (ok, error)."""
    if not telegram_id:
        return False, "no telegram_id"
    video_info = VIDEO_CATALOG.get(test_type, {}).get(video_key)
    if not video_info:
        return False, "unknown video"
    bot_token = MENS_BOT_TOKEN if test_type == "mens" else QUIZ_BOT_TOKEN
    if not bot_token:
        return False, "no bot token"
    try:
        async with httpx.AsyncClient(timeout=30) as tg:
            payload = {
                "chat_id": telegram_id, "video": video_info["file_id"],
                "caption": video_info["caption"], "parse_mode": "HTML",
            }
            if video_info.get("buttons"):
                payload["reply_markup"] = {"inline_keyboard": video_info["buttons"]}
            resp = await tg.post(f"https://api.telegram.org/bot{bot_token}/sendVideo", json=payload)
            r = resp.json()
            return r.get("ok", False), r.get("description") if not r.get("ok") else None
    except Exception as e:
        return False, str(e)


async def _start_chain(test_result_id: int, telegram_id: str, telegram_username: str, test_type: str, trigger: str):
    """Запустить цепочку для пользователя. Отменяет конфликтующую цепочку (in_progress ↔ completed)."""
    conn = _get_db()
    try:
        # Если стартуем completed — отменить in_progress, и наоборот
        other_trigger = "in_progress" if trigger == "completed" else "completed"
        conn.execute(
            "UPDATE chain_state SET status = 'cancelled' WHERE test_result_id = ? AND test_type = ? AND trigger = ? AND status = 'active'",
            (test_result_id, test_type, other_trigger)
        )

        # Проверим, нет ли уже активной цепочки с таким же trigger
        existing = conn.execute(
            "SELECT id FROM chain_state WHERE test_result_id = ? AND test_type = ? AND trigger = ? AND status = 'active'",
            (test_result_id, test_type, trigger)
        ).fetchone()
        if existing:
            return
        conn.execute(
            "INSERT INTO chain_state (test_result_id, telegram_id, test_type, trigger, current_step, status) VALUES (?, ?, ?, ?, 0, 'active')",
            (test_result_id, telegram_id, test_type, trigger)
        )
        conn.commit()
    finally:
        conn.close()


async def _process_chains():
    """Периодическая задача: проверяет цепочки и отправляет следующие сообщения."""
    conn = _get_db()
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        rows = conn.execute(
            "SELECT cs.* FROM chain_state cs WHERE cs.status = 'active' AND (cs.next_send_at IS NULL OR cs.next_send_at <= ?)",
            (now_str,)
        ).fetchall()
        # Дедупликация: не больше 1 сообщения за цикл на один telegram_id
        sent_tg_ids: set[str] = set()
        for cs in rows:
            if cs["telegram_id"] in sent_tg_ids:
                continue

            trigger = cs["trigger"]
            next_step = cs["current_step"] + 1
            msgs = conn.execute(
                "SELECT * FROM chain_messages WHERE test_type = ? AND trigger = ? AND step = ? AND is_active = 1 ORDER BY step LIMIT 1",
                (cs["test_type"], trigger, next_step)
            ).fetchall()
            if not msgs:
                # Цепочка завершена
                conn.execute("UPDATE chain_state SET status = 'completed' WHERE id = ?", (cs["id"],))
                conn.commit()
                continue
            msg = msgs[0]
            text = msg["text_template"]
            sent = await _send_chain_message(cs["telegram_id"], text, cs["test_type"])
            if sent:
                sent_tg_ids.add(cs["telegram_id"])
                delay = msg["delay_minutes"]
                next_send = datetime.now() + timedelta(minutes=delay)
                conn.execute(
                    "UPDATE chain_state SET current_step = ?, last_sent_at = ?, next_send_at = ? WHERE id = ?",
                    (next_step, now_str, next_send.strftime("%Y-%m-%d %H:%M:%S"), cs["id"])
                )
            else:
                # Не смогли отправить — отменяем цепочку
                conn.execute("UPDATE chain_state SET status = 'cancelled' WHERE id = ?", (cs["id"],))
            conn.commit()
    finally:
        conn.close()


# ─── Bot Inbox Polling (пересылка ответов в топик + ответы от имени бота) ──

# Карта: topic_message_id → (user_chat_id, bot_token, bot_label, user_name)
_topic_msg_map: dict[int, dict] = {}
_topic_msg_map_lock = asyncio.Lock()


def _read_offset(bot_label: str) -> int:
    """Читает последний offset из quiz_meta для бота."""
    try:
        conn = _get_db()
        row = conn.execute(
            "SELECT value FROM quiz_meta WHERE key = ?",
            (f"inbox_offset_{bot_label}",)
        ).fetchone()
        conn.close()
        return int(row["value"]) if row else 0
    except Exception:
        return 0


def _write_offset(bot_label: str, offset: int):
    """Сохраняет offset в quiz_meta."""
    try:
        conn = _get_db()
        if USE_PG:
            conn.execute(
                "INSERT INTO quiz_meta (key, value) VALUES (%s, %s) "
                "ON CONFLICT (key) DO UPDATE SET value = %s",
                (f"inbox_offset_{bot_label}", str(offset), str(offset))
            )
        else:
            conn.execute(
                "INSERT OR REPLACE INTO quiz_meta (key, value) VALUES (?, ?)",
                (f"inbox_offset_{bot_label}", str(offset))
            )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning("Failed to save offset for %s: %s", bot_label, e)


async def _poll_bot_inbox(bot_token: str, bot_label: str, offset: int = 0):
    """Polling для одного бота: пересылает входящие сообщения в топик 'Нам пишут'."""
    if offset == 0:
        offset = _read_offset(bot_label)
        logger.info("Bot %s: starting from offset %d", bot_label, offset)
    url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
    ASSISTANT_GROUP = -1003969188406
    INBOX_TOPIC = 3876
    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as tg:
                resp = await tg.post(url, json={"offset": offset, "timeout": 10})
                data = resp.json()
                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue
                for update in data.get("result", []):
                    offset = update.get("update_id", 0) + 1
                    msg = update.get("message") or update.get("callback_query", {}).get("message")
                    if not msg:
                        continue
                    user = msg.get("from", {})
                    chat = msg.get("chat", {})
                    user_id = user.get("id")
                    username = user.get("username") or user.get("first_name", "пользователь")
                    text = msg.get("text", "") or msg.get("caption", "")
                    contact = msg.get("contact")
                    if not text and not contact:
                        continue
                    # Пропускаем служебные /start (пустые, без полезного текста)
                    if text and text.strip().startswith("/start") and len(text.strip()) <= 7:
                        continue
                    # Собираем информацию
                    nick = f"@{username}" if user.get("username") else username
                    if text:
                        content = text[:500]
                    elif contact:
                        content = f"📞 Поделился контактом: {contact.get('phone_number', '')}"
                    else:
                        continue
                    # Отправляем в топик
                    forward_text = (
                        f"📩 <b>{bot_label}</b> — {nick}\n"
                        f"└ {content}"
                    )
                    fwd_resp = await tg.post(
                        f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/sendMessage",
                        json={
                            "chat_id": ASSISTANT_GROUP,
                            "text": forward_text,
                            "parse_mode": "HTML",
                            "message_thread_id": INBOX_TOPIC,
                        }
                    )
                    # Сохраняем связку topic_msg_id → пользователь, чтобы можно было ответить
                    try:
                        fwd_data = fwd_resp.json()
                        if fwd_data.get("ok") and fwd_data.get("result", {}).get("message_id"):
                            tmid = fwd_data["result"]["message_id"]
                            async with _topic_msg_map_lock:
                                _topic_msg_map[tmid] = {
                                    "user_chat_id": user_id,
                                    "user_name": nick,
                                    "bot_token": bot_token,
                                    "bot_label": bot_label,
                                }
                                # Чистим старые (>500 записей)
                                if len(_topic_msg_map) > 500:
                                    oldest = sorted(_topic_msg_map.keys())[:200]
                                    for k in oldest:
                                        del _topic_msg_map[k]
                    except Exception:
                        pass
                    # Сохраняем offset после каждого сообщения
                    _write_offset(bot_label, offset)
                    # Если есть telegram_id — сохраняем входящее сообщение в БД как ответ на цепочку
                    user_tid = str(user_id)
                    try:
                        conn = _get_db()
                        conn.execute(
                            "UPDATE chain_state SET status = 'cancelled' WHERE telegram_id = ? AND status = 'active'",
                            (user_tid,)
                        )
                        conn.commit()
                        conn.close()
                    except Exception:
                        pass
                # Сохраняем offset после обработки батча
                _write_offset(bot_label, offset)
        except Exception as e:
            logger.warning("Bot inbox poll error for %s: %s", bot_label, e)
            await asyncio.sleep(5)


async def _poll_notify_bot_replies():
    """Мониторит ответы в топике 'Нам пишут' и пересылает их пользователям от имени тест-бота."""
    if not NOTIFY_BOT_TOKEN:
        logger.info("NOTIFY_BOT_TOKEN not set — reply polling skipped")
        return
    offset = _read_offset("notify_bot_replies")
    logger.info("Reply poller: starting from offset %d", offset)
    url = f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/getUpdates"
    ASSISTANT_GROUP_ID = -1003969188406
    # ID Антона и ассистента, чьи ответы пересылаем
    ALLOWED_REPLIERS = {121119366, 5673658238}  # ahilleon, tonyroar
    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as tg:
                resp = await tg.post(url, json={"offset": offset, "timeout": 10})
                data = resp.json()
                if not data.get("ok"):
                    await asyncio.sleep(5)
                    continue
                for update in data.get("result", []):
                    offset = update.get("update_id", 0) + 1
                    msg = update.get("message")
                    if not msg:
                        continue
                    # Только сообщения из группы ассистента и только reply
                    chat = msg.get("chat", {})
                    if chat.get("id") != ASSISTANT_GROUP_ID:
                        continue
                    reply_to = msg.get("reply_to_message")
                    if not reply_to:
                        continue
                    reply_to_id = reply_to.get("message_id")
                    # Ищем связку в topic_msg_map
                    async with _topic_msg_map_lock:
                        entry = _topic_msg_map.get(reply_to_id)
                    if not entry:
                        continue
                    # Проверяем отправителя
                    sender = msg.get("from", {})
                    sender_id = sender.get("id")
                    if sender_id not in ALLOWED_REPLIERS:
                        continue
                    sender_name = sender.get("first_name", "ассистент")
                    reply_text = msg.get("text", "") or msg.get("caption", "")
                    if not reply_text:
                        continue
                    # Отправляем ответ пользователю от имени тест-бота
                    user_chat_id = entry["user_chat_id"]
                    bot_token = entry["bot_token"]
                    bot_label = entry["bot_label"]
                    user_name = entry["user_name"]
                    await tg.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={
                            "chat_id": user_chat_id,
                            "text": reply_text,
                            "parse_mode": "HTML",
                        }
                    )
                    # Уведомляем в топик что ответ отправлен
                    await tg.post(
                        f"https://api.telegram.org/bot{NOTIFY_BOT_TOKEN}/sendMessage",
                        json={
                            "chat_id": ASSISTANT_GROUP_ID,
                            "text": f"✅ Ответ от {sender_name} отправлен → {user_name} (через {bot_label})",
                            "parse_mode": "HTML",
                            "message_thread_id": msg.get("message_thread_id", 0),
                            "reply_to_message_id": reply_to_id,
                        }
                    )
                _write_offset("notify_bot_replies", offset)
        except Exception as e:
            logger.warning("Reply poller error: %s", e)
            await asyncio.sleep(5)


async def _start_bot_polling():
    """Запустить поллинг для всех ботов + мониторинг ответов."""
    tasks = []
    if QUIZ_BOT_TOKEN:
        tasks.append(asyncio.ensure_future(_poll_bot_inbox(QUIZ_BOT_TOKEN, "ШШ Женский")))
    if MENS_BOT_TOKEN:
        tasks.append(asyncio.ensure_future(_poll_bot_inbox(MENS_BOT_TOKEN, "Лучший любовник")))
    if NOTIFY_BOT_TOKEN:
        tasks.append(asyncio.ensure_future(_poll_notify_bot_replies()))
    logger.info("Bot inbox polling started (inbox + reply monitor)")
    await asyncio.gather(*tasks)


# ─── API: Labels ───────────────────────────────────────────────────────────────

class LabelCreate(BaseModel):
    name: str
    color: str = "#6366f1"

class LabelPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

@app.get("/api/labels")
async def list_labels():
    conn = _get_db()
    rows = conn.execute("SELECT * FROM labels ORDER BY name ASC").fetchall()
    conn.close()
    return {"labels": [_row(r) for r in rows]}

@app.post("/api/labels")
async def create_label(data: LabelCreate):
    conn = _get_db()
    conn.execute("INSERT INTO labels (name, color) VALUES (?, ?)", (data.name.strip(), data.color))
    label_id = conn.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM labels WHERE id = ?", (label_id,)).fetchone()
    conn.close()
    return {"label": dict(row)}

@app.patch("/api/labels/{label_id}")
async def patch_label(label_id: int, data: LabelPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name.strip())
    if data.color is not None:
        updates.append("color = ?")
        params.append(data.color)
    if not updates:
        conn.close()
        return {"ok": True}
    params.append(label_id)
    conn.execute("UPDATE labels SET " + ", ".join(updates) + " WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/labels/{label_id}")
async def delete_label(label_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM client_labels WHERE label_id = ?", (label_id,))
    conn.execute("DELETE FROM labels WHERE id = ?", (label_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/clients/{client_id}/labels")
async def add_client_label(client_id: int, data: dict):
    label_id = data.get("label_id")
    if not label_id:
        raise HTTPException(400, "label_id required")
    conn = _get_db()
    conn.execute("INSERT OR IGNORE INTO client_labels (client_id, label_id) VALUES (?, ?)", (client_id, label_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/clients/{client_id}/labels/{label_id}")
async def remove_client_label(client_id: int, label_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM client_labels WHERE client_id = ? AND label_id = ?", (client_id, label_id))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── API: Tags ─────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str
    color: str = "#6366f1"

@app.get("/api/tags")
async def list_tags():
    conn = _get_db()
    rows = conn.execute("SELECT * FROM tags ORDER BY name ASC").fetchall()
    conn.close()
    return {"tags": [_row(r) for r in rows]}

@app.post("/api/tags")
async def create_tag(data: TagCreate):
    conn = _get_db()
    try:
        conn.execute("INSERT INTO tags (name, color) VALUES (?, ?)", (data.name.strip(), data.color))
        tag_id = conn.lastrowid
        conn.commit()
        row = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
        conn.close()
        return {"tag": dict(row)}
    except Exception:
        conn.close()
        # Tag might already exist — try to fetch it
        conn2 = _get_db()
        row = conn2.execute("SELECT * FROM tags WHERE name = ?", (data.name.strip(),)).fetchone()
        conn2.close()
        if row:
            return {"tag": dict(row)}
        raise HTTPException(400, "Failed to create tag")

class TagPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

@app.patch("/api/tags/{tag_id}")
async def patch_tag(tag_id: int, data: TagPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.name is not None:
        updates.append("name = ?")
        params.append(data.name.strip())
    if data.color is not None:
        updates.append("color = ?")
        params.append(data.color)
    if not updates:
        conn.close()
        return {"ok": True}
    params.append(tag_id)
    conn.execute("UPDATE tags SET " + ", ".join(updates) + " WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM client_tags WHERE tag_id = ?", (tag_id,))
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/clients/{client_id}/tags")
async def add_client_tag(client_id: int, data: dict):
    tag_id = data.get("tag_id")
    if not tag_id:
        raise HTTPException(400, "tag_id required")
    conn = _get_db()
    if USE_PG:
        conn.execute("INSERT INTO client_tags (client_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING", (client_id, tag_id))
    else:
        conn.execute("INSERT OR IGNORE INTO client_tags (client_id, tag_id) VALUES (?, ?)", (client_id, tag_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/clients/{client_id}/tags/{tag_id}")
async def remove_client_tag(client_id: int, tag_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM client_tags WHERE client_id = ? AND tag_id = ?", (client_id, tag_id))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── API: Deals ────────────────────────────────────────────────────────────────

class DealCreate(BaseModel):
    title: str
    client_id: int | None = None
    client_name: str = ""
    status: str = "Ожидает"
    amount: float = 0
    paid: float = 0
    purchase_date: str = ""
    product: str = ""
    reg_number: str = ""
    sessions_count: str = ""
    sessions_total: int = 0
    sessions_conducted: int = 0
    contract_status: str = ""
    contract_with: str = ""
    contract_date: str = ""
    act_status: str = ""
    assistant_pct: str = ""
    source: str = ""
    referral_pct: str = ""
    referral_paid: str = ""


@app.get("/api/deals")
async def list_deals(
    id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    amount_min: Optional[float] = Query(None),
    amount_max: Optional[float] = Query(None),
    archived: Optional[bool] = Query(False),
    debt_only: Optional[bool] = Query(False),
    product: Optional[str] = Query(None),
    limit: int = Query(100),
    offset: int = Query(0),
):
    conn = _get_db()
    where = []
    params = []
    if id is not None:
        where.append("d.id = ?")
        params.append(id)
    if search:
        where.append("(d.title ILIKE ? OR c.name ILIKE ? OR c.telegram_nick ILIKE ? OR d.product ILIKE ?)")
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])
    if not archived:
        where.append("(d.archived IS NULL OR d.archived = 0)")
    if debt_only:
        where.append("(COALESCE(d.amount, 0) - COALESCE(d.paid, 0)) > 0")
    if product:
        where.append("d.product = ?")
        params.append(product)
    if status:
        where.append("d.status = ?")
        params.append(status)
    if date_from:
        where.append("d.purchase_date >= ?")
        params.append(date_from)
    if date_to:
        where.append("d.purchase_date <= ?")
        params.append(date_to)
    if amount_min is not None:
        where.append("CAST(d.amount AS REAL) >= ?")
        params.append(amount_min)
    if amount_max is not None:
        where.append("CAST(d.amount AS REAL) <= ?")
        params.append(amount_max)
    where_clause = (" WHERE " + " AND ".join(where)) if where else ""

    total = _scalar(conn.execute(f"SELECT COUNT(*) FROM deals d LEFT JOIN clients c ON d.client_id = c.id{where_clause}", params).fetchone())
    rows = conn.execute(
        f"SELECT d.*, c.name as client_name, c.telegram_nick FROM deals d LEFT JOIN clients c ON d.client_id = c.id{where_clause} "
        "ORDER BY d.created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    conn.close()
    return {"deals": [_row(r) for r in rows], "total": total}


class DealPatch(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    amount: Optional[float] = None
    paid: Optional[float] = None
    purchase_date: Optional[str] = None
    sessions: Optional[str] = None
    payment_info: Optional[str] = None
    archived: Optional[bool] = None
    client_id: Optional[int] = None
    product: Optional[str] = None
    reg_number: Optional[str] = None
    sessions_count: Optional[str] = None
    sessions_total: Optional[int] = None
    sessions_conducted: Optional[int] = None
    contract_status: Optional[str] = None
    contract_with: Optional[str] = None
    contract_date: Optional[str] = None
    act_status: Optional[str] = None
    assistant_pct: Optional[str] = None
    source: Optional[str] = None
    referral_pct: Optional[str] = None
    referral_paid: Optional[str] = None

@app.patch("/api/deals/{deal_id}")
async def patch_deal(deal_id: int, data: DealPatch):
    conn = _get_db()
    row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Deal not found")
    updates = []
    params = []
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status)
    if data.amount is not None:
        updates.append("amount = ?")
        params.append(data.amount)
    if data.paid is not None:
        updates.append("paid = ?")
        params.append(data.paid)
    if data.purchase_date is not None:
        updates.append("purchase_date = ?")
        params.append(data.purchase_date)
    if data.sessions is not None:
        updates.append("sessions = ?")
        params.append(data.sessions)
    if data.payment_info is not None:
        updates.append("payment_info = ?")
        params.append(data.payment_info)
    if data.archived is not None:
        updates.append("archived = ?")
        params.append(1 if data.archived else 0)
    if data.sessions_total is not None:
        updates.append("sessions_total = ?")
        params.append(data.sessions_total)
    if data.sessions_conducted is not None:
        updates.append("sessions_conducted = ?")
        params.append(data.sessions_conducted)
    if data.client_id is not None:
        updates.append("client_id = ?")
        params.append(data.client_id)

    for field in ["product", "reg_number", "sessions_count", "contract_status", "contract_with", "contract_date", "act_status", "assistant_pct", "source", "referral_pct", "referral_paid"]:
        val = getattr(data, field, None)
        if val is not None:
            updates.append(f"{field} = ?")
            params.append(val)

    # Auto-update title when product or client_id changes
    if data.product is not None or data.client_id is not None:
        current = dict(row)
        new_product = data.product if data.product is not None else (current.get("product") or "Без продукта")
        new_client_id = data.client_id if data.client_id is not None else current.get("client_id")
        client_name = ""
        if new_client_id:
            c = conn.execute("SELECT name FROM clients WHERE id = ?", (new_client_id,)).fetchone()
            if c:
                client_name = c["name"]
        new_title = f"{new_product} — {client_name}" if client_name else new_product
        updates.append("title = ?")
        params.append(new_title)

    if not updates:
        conn.close()
        return {"ok": True}
    updates.append("updated_at = datetime('now')")
    params.append(deal_id)
    conn.execute(f"UPDATE deals SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/deals")
async def create_deal(data: DealCreate | None = None):
    """Создать сделку в локальной БД + Notion."""
    if data is None:
        data = DealCreate()

    notion_id = None
    client_name = data.client_name or ""
    if data.client_id:
        conn = _get_db()
        row = conn.execute("SELECT name FROM clients WHERE id = ?", (data.client_id,)).fetchone()
        conn.close()
        if row:
            client_name = row["name"]

    # Генерируем title из product + client_name
    product = data.product or "Без продукта"
    title = f"{product} — {client_name}" if client_name else product
    # Если дата не указана — ставим сегодня
    purchase_date = data.purchase_date or datetime.now().strftime("%Y-%m-%d")

    async def _notion_create_deal():
        nonlocal notion_id
        props = {
            "Сделка": {"title": [{"text": {"content": title}}]},
            "Статус": {"status": {"name": data.status or "Ожидает"}},
        }
        if data.amount:
            props["Сумма"] = {"number": data.amount}
        if data.paid:
            props["Оплачено"] = {"number": data.paid}
        if data.purchase_date:
            props["Дата покупки"] = {"date": {"start": data.purchase_date}}
        async with httpx.AsyncClient(headers=_notion_headers(), timeout=15) as http:
            resp = await http.post(f"{NOTION_BASE}/pages", json={
                "parent": {"database_id": NOTION_DEALS_DB_ID}, "properties": props,
            })
            notion_id = resp.json()["id"]

    try:
        await _notion_create_deal()
    except Exception as e:
        logger.warning("Notion deal create failed (local only): %s", e)

    conn = _get_db()
    cur = conn.execute(
        "INSERT INTO deals (notion_page_id, client_id, title, product, status, amount, paid, purchase_date, sessions_total, sessions_conducted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (notion_id, data.client_id, title, data.product or "", data.status or "Ожидает", data.amount or 0, data.paid or 0, purchase_date, data.sessions_total or 0, data.sessions_conducted or 0))
    deal_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": deal_id}


@app.delete("/api/deals/{deal_id}")
async def delete_deal(deal_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM deals WHERE id = ?", (deal_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── Mira Tools ────────────────────────────────────────────────────────────────

class MiraChatRequest(BaseModel):
    prompt: str
    context_type: str = "global"
    client_id: int | None = None
    context_data: dict = {}

MIRA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_client_task",
            "description": "Создаёт задачу для контакта в CRM. Используй когда нужно создать напоминание, фоллоу-ап, проверку оплаты и т.д.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID контакта в CRM"},
                    "title": {"type": "string", "description": "Название задачи"},
                    "task_type": {"type": "string", "enum": ["follow_up", "session", "payment", "contract", "schedule", "content", "feedback"], "description": "Тип задачи"},
                    "due_date": {"type": "string", "description": "Дата выполнения (YYYY-MM-DD), если не указана — сегодня"},
                },
                "required": ["client_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_deal_status",
            "description": "Обновляет статус сделки. Используй когда клиент говорит об оплате или изменении договорённостей.",
            "parameters": {
                "type": "object",
                "properties": {
                    "deal_id": {"type": "integer", "description": "ID сделки"},
                    "status": {"type": "string", "enum": ["Ожидает", "В процессе", "Оплачено", "Возврат"], "description": "Новый статус"},
                },
                "required": ["deal_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_anton_task",
            "description": "Создаёт задачу Антона (личную задачу). Статусы: Идеи, Очередь, 15 задач на неделю, Делаю сейчас, Рефлексия, Готово. Используй когда Антон просит что-то записать в его задачи.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Название задачи"},
                    "status": {"type": "string", "enum": ["Идеи", "Очередь", "15 задач на неделю", "Делаю сейчас", "Рефлексия", "Готово"], "description": "Статус (колонка)"},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_anton_tasks",
            "description": "Показывает список задач Антона. Можно отфильтровать по статусу.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["Идеи", "Очередь", "15 задач на неделю", "Делаю сейчас", "Рефлексия", "Готово"], "description": "Статус для фильтрации"},
                    "archived": {"type": "boolean", "description": "Показать архивные"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patch_anton_task",
            "description": "Обновляет задачу Антона: перенести в другой статус, изменить название, описание.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer", "description": "ID задачи Антона"},
                    "status": {"type": "string", "enum": ["Идеи", "Очередь", "15 задач на неделю", "Делаю сейчас", "Рефлексия", "Готово"], "description": "Новый статус"},
                    "title": {"type": "string", "description": "Новое название"},
                    "description": {"type": "string", "description": "Новое описание"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_clients",
            "description": "Ищет клиентов в CRM по имени, никнейму или телефону. Используй когда нужно найти контакт.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Поисковый запрос (имя, @ник, телефон)"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_client_info",
            "description": "Показывает подробную информацию о клиенте: контакты, заметки, задачи. Используй когда нужно узнать контекст перед ответом.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента в CRM"},
                },
                "required": ["client_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "Создаёт заметку в карточке клиента. Используй когда нужно записать результат разговора, наблюдение или договорённость.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента в CRM"},
                    "text": {"type": "string", "description": "Текст заметки"},
                },
                "required": ["client_id", "text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patch_client_status",
            "description": "Изменяет статус (этап воронки) клиента. Статусы: Контакт, Выдать контент, Квалифицировать, Довести до решения, Проработать, Работа завершена (Архив). Используй когда клиент перешёл на следующий этап.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента в CRM"},
                    "status": {"type": "string", "description": "Новый статус клиента"},
                },
                "required": ["client_id", "status"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_deal",
            "description": "Создаёт сделку для клиента. Используй когда клиент согласился на покупку, выбрал тариф, оплатил.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента в CRM"},
                    "title": {"type": "string", "description": "Название сделки (например, тариф или услуга)"},
                    "amount": {"type": "number", "description": "Сумма сделки в рублях"},
                    "status": {"type": "string", "enum": ["Ожидает", "В процессе", "Оплачено", "Возврат"], "description": "Статус сделки"},
                },
                "required": ["client_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_timeline",
            "description": "Показывает последние сообщения из переписки с клиентом (по умолчанию 20 последних). Используй когда нужно вспомнить о чём говорили, проверить историю общения.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "integer", "description": "ID клиента в CRM"},
                    "limit": {"type": "integer", "description": "Сколько сообщений показать (по умолчанию 20)"},
                },
                "required": ["client_id"],
            },
        },
    },
]


async def _execute_tool(tool_call: dict) -> str:
    """Выполняет вызов инструмента от Миры. Возвращает строку-результат для role: tool."""
    func = tool_call.get("function", {})
    name = func.get("name", "")
    args = json.loads(func.get("arguments", "{}"))

    if name == "create_client_task":
        client_id = args.get("client_id")
        title = args.get("title")
        task_type = args.get("task_type", "follow_up")
        due_date = args.get("due_date", "")
        if not client_id or not title:
            return json.dumps({"error": "client_id and title required"})
        conn = _get_db()
        conn.execute(
            "INSERT INTO tasks (client_id, title, type, due_date, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
            (client_id, title, task_type, due_date),
        )
        new_id = conn.lastrowid
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "task_id": new_id, "title": title, "client_id": client_id})

    if name == "update_deal_status":
        deal_id = args.get("deal_id")
        status = args.get("status")
        if not deal_id or not status:
            return json.dumps({"error": "deal_id and status required"})
        conn = _get_db()
        conn.execute("UPDATE deals SET status = ?, updated_at = datetime('now') WHERE id = ?", (status, deal_id))
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "deal_id": deal_id, "status": status})

    if name == "create_anton_task":
        title = args.get("title")
        status = args.get("status", "Идеи")
        if not title:
            return json.dumps({"error": "title required"})
        conn = _get_db()
        conn.execute(
            "INSERT INTO antons_tasks (title, status, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
            (title, status),
        )
        new_id = conn.lastrowid
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "task_id": new_id, "title": title, "status": status})

    if name == "list_anton_tasks":
        status = args.get("status")
        archived = args.get("archived", False)
        conn = _get_db()
        where = "WHERE (at.is_archived IS NULL OR at.is_archived = 0)" if not archived else "WHERE at.is_archived = 1"
        params = []
        if status:
            where += " AND at.status = ?"
            params.append(status)
        rows = conn.execute(
            f"SELECT at.id, at.title, at.status, at.order_index, (SELECT COUNT(*) FROM antons_task_comments WHERE task_id = at.id) as comments_count "
            f"FROM antons_tasks at {where} ORDER BY at.status, at.order_index",
            params,
        ).fetchall()
        conn.close()
        tasks = [_row(r) for r in rows]
        return json.dumps({"ok": True, "tasks": tasks, "count": len(tasks)})

    if name == "patch_anton_task":
        task_id = args.get("task_id")
        if not task_id:
            return json.dumps({"error": "task_id required"})
        conn = _get_db()
        updates = []
        params = []
        for field in ("status", "title", "description"):
            val = args.get(field)
            if val is not None:
                updates.append(f"{'status' if field == 'status' else field} = ?")
                params.append(val)
        if not updates:
            conn.close()
            return json.dumps({"ok": True, "no_changes": True})
        updates.append("updated_at = datetime('now')")
        params.append(task_id)
        conn.execute(f"UPDATE antons_tasks SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "task_id": task_id})

    if name == "search_clients":
        query = args.get("query", "")
        if not query:
            return json.dumps({"error": "query required"})
        pattern = f"%{query}%"
        conn = _get_db()
        rows = conn.execute(
            "SELECT id, name, telegram_nick, phone, status, source FROM clients WHERE name LIKE ? OR telegram_nick LIKE ? OR phone LIKE ? ORDER BY last_contact DESC NULLS LAST LIMIT 10",
            (pattern, pattern, pattern),
        ).fetchall()
        conn.close()
        clients = [_row(r) for r in rows]
        return json.dumps({"ok": True, "clients": clients, "count": len(clients)})

    if name == "get_client_info":
        client_id = args.get("client_id")
        if not client_id:
            return json.dumps({"error": "client_id required"})
        conn = _get_db()
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not row:
            conn.close()
            return json.dumps({"error": "Client not found"})
        client = dict(row)
        notes = conn.execute("SELECT id, text, created_at FROM notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 5", (client_id,)).fetchall()
        client["recent_notes"] = [dict(n) for n in notes]
        tasks = conn.execute("SELECT id, title, type, status, due_date FROM tasks WHERE client_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 10", (client_id,)).fetchall()
        client["pending_tasks"] = [dict(t) for t in tasks]
        deals = conn.execute("SELECT id, title, status, amount FROM deals WHERE client_id = ? ORDER BY created_at DESC LIMIT 5", (client_id,)).fetchall()
        client["deals"] = [dict(d) for d in deals]
        conn.close()
        return json.dumps({"ok": True, "client": client})

    if name == "create_note":
        client_id = args.get("client_id")
        text = args.get("text", "").strip()
        if not client_id or not text:
            return json.dumps({"error": "client_id and text required"})
        conn = _get_db()
        conn.execute(
            "INSERT INTO notes (client_id, text, created_at) VALUES (?, ?, datetime('now'))",
            (client_id, text),
        )
        new_id = conn.lastrowid
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "note_id": new_id, "client_id": client_id})

    if name == "patch_client_status":
        client_id = args.get("client_id")
        status = args.get("status")
        if not client_id or not status:
            return json.dumps({"error": "client_id and status required"})
        conn = _get_db()
        conn.execute(
            "UPDATE clients SET status = ?, updated_at = datetime('now') WHERE id = ?",
            (status, client_id),
        )
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "client_id": client_id, "status": status})

    if name == "create_deal":
        client_id = args.get("client_id")
        title = args.get("title")
        amount = args.get("amount", 0)
        deal_status = args.get("status", "Ожидает")
        if not client_id or not title:
            return json.dumps({"error": "client_id and title required"})
        conn = _get_db()
        conn.execute(
            "INSERT INTO deals (client_id, title, amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
            (client_id, title, amount, deal_status),
        )
        new_id = conn.lastrowid
        conn.commit()
        conn.close()
        return json.dumps({"ok": True, "deal_id": new_id, "title": title, "amount": amount})

    if name == "get_timeline":
        client_id = args.get("client_id")
        limit = args.get("limit", 20)
        if not client_id:
            return json.dumps({"error": "client_id required"})
        conn = _get_db()
        rows = conn.execute(
            "SELECT sender_type as sender, text, created_at FROM telegram_messages WHERE client_id = ? ORDER BY created_at DESC LIMIT ?",
            (client_id, limit),
        ).fetchall()
        conn.close()
        messages = [dict(r) for r in reversed(rows)]
        return json.dumps({"ok": True, "messages": messages, "count": len(messages)})

    return json.dumps({"error": f"Unknown tool: {name}"})


async def _call_mira(prompt: str, context_str: str = "", prev_messages: list = None, tools_enabled: bool = False) -> dict:
    """Вызов Миры через LiteLLM с поддержкой tool_calls."""
    messages = [{"role": "system", "content": "Ты — Мира, AI-ассистент CRM Personal OS. Отвечай кратко, по-русски. Используй инструменты когда нужно выполнить действие.\n\nТвои возможности:\n\n📋 ЗАДАЧИ АНТОНА — create_anton_task (создать), list_anton_tasks (список), patch_anton_task (изменить/перенести)\nСтатусы: Идеи, Очередь, 15 задач на неделю, Делаю сейчас, Рефлексия, Готово\n\n👤 КЛИЕНТЫ CRM — search_clients (поиск), get_client_info (карточка)\n📝 create_note — записать заметку в карточку клиента\n🔄 patch_client_status — перевести клиента на другой этап воронки\n📊 create_deal — создать сделку (когда клиент выбрал тариф)\n💬 get_timeline — показать историю переписки с клиентом\n📌 create_client_task — создать задачу для клиента (типы: follow_up — фоллоу-ап, session — сессия, payment — оплата, contract — договор, schedule — запись, content — контент, feedback — обратная связь)\n\n💰 СДЕЛКИ — update_deal_status (изменить статус)\nСтатусы: Ожидает, В процессе, Оплачено, Возврат\n\nВАЖНО: Когда пользователь просит что-то сделать — сначала найди клиента (search_clients), посмотри карточку (get_client_info), а потом действуй." + (f"\n\nКонтекст:\n{context_str}" if context_str else "")}]
    if prev_messages:
        messages.extend(prev_messages)
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": MIRA_MODEL,
        "messages": messages,
        "max_tokens": 2048,
    }
    if tools_enabled:
        payload["tools"] = MIRA_TOOLS
        payload["tool_choice"] = "auto"

    async with httpx.AsyncClient(timeout=30) as http:
        resp = await http.post(LITELLM_URL, json=payload)
        return resp.json()


@app.post("/api/mira/chat")
async def mira_chat(data: MiraChatRequest):
    """Мост к Мире с поддержкой tool_calls."""
    context_str = ""
    if data.context_type == "local" and data.context_data.get("timeline"):
        msgs = data.context_data["timeline"]
        context_str = "\n".join(f"[{m.get('sender','?')}] {m.get('text','')}" for m in msgs[-10:])

    try:
        body = await _call_mira(data.prompt, context_str=context_str, tools_enabled=True)
        choice = body.get("choices", [{}])[0]
        msg = choice.get("message", {})

        # Handle tool_calls
        if msg.get("tool_calls"):
            tool_results = []
            for tc in msg["tool_calls"]:
                result = await _execute_tool(tc)
                tool_results.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})
                logger.info("Mira executed tool: %s → %s", tc.get("function", {}).get("name"), result[:80])

            # Send tool results back to Mira for final answer
            messages = [
                {"role": "system", "content": "Ты — Мира, AI-ассистент CRM."},
            ]
            messages.append(msg)  # assistant message with tool_calls
            messages.extend(tool_results)
            messages.append({"role": "user", "content": "Опиши результат пользователю кратко, по-русски."})

            final = await _call_mira("Опиши результат", prev_messages=messages[:-1], tools_enabled=False)
            reply = final.get("choices", [{}])[0].get("message", {}).get("content", "") or "Готово."
            return {"response": reply}

        reply = msg.get("content", "") or "Нет ответа"
        return {"response": reply}

    except httpx.ConnectError:
        return {"response": f"✨ Мира настраивается. Запрос: «{data.prompt[:50]}»"}
    except Exception as e:
        logger.error("Mira error: %s", e, exc_info=True)
        return {"response": f"Ошибка: {e}"}


@app.post("/api/mira/chat/session")
async def mira_new_session():
    """Создать новую сессию чата с Мирой."""
    conn = _get_db()
    cur = conn.execute("INSERT INTO mira_sessions (title) VALUES ('Новый чат')")
    sid = db.lastrowid
    conn.commit()
    conn.close()
    return {"session_id": sid}


@app.get("/api/mira/sessions")
async def mira_list_sessions():
    conn = _get_db()
    rows = conn.execute("SELECT * FROM mira_sessions ORDER BY updated_at DESC LIMIT 50").fetchall()
    conn.close()
    return {"sessions": [_row(r) for r in rows]}


@app.get("/api/mira/sessions/{session_id}/messages")
async def mira_get_messages(session_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM mira_messages WHERE session_id = ? ORDER BY created_at ASC",
        (session_id,),
    ).fetchall()
    conn.close()
    return {"messages": [_row(r) for r in rows]}


def _save_mira_messages(session_id: int, messages: list) -> None:
    """Сохраняет пачку сообщений (user+assistant+tool) в БД сессии."""
    conn = _get_db()
    for m in messages:
        role = m.get("role", "")
        content = m.get("content", "")
        if role in ("user", "assistant") and content:
            conn.execute(
                "INSERT INTO mira_messages (session_id, role, content) VALUES (?, ?, ?)",
                (session_id, role, content),
            )
        elif role == "tool" and content:
            conn.execute(
                "INSERT INTO mira_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
                (session_id, f"[tool] {content[:500]}"),
            )
    conn.execute("UPDATE mira_sessions SET updated_at = datetime('now') WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()


async def _auto_rename_session(session_id: int, first_prompt: str) -> None:
    """Генерирует название сессии через AI."""
    try:
        payload = {
            "model": MIRA_MODEL,
            "messages": [
                {"role": "system", "content": "Сгенерируй короткое название (2-4 слова) для этого диалога. Только название, без кавычек."},
                {"role": "user", "content": f"Первое сообщение: {first_prompt[:200]}"},
            ],
            "max_tokens": 30,
        }
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(LITELLM_URL, json=payload)
            title = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip().strip('"\'')
            if title and len(title) < 100:
                c = _get_db()
                c.execute("UPDATE mira_sessions SET title = ? WHERE id = ?", (title, session_id))
                c.commit()
                c.close()
    except Exception:
        pass


@app.post("/api/mira/chat/{session_id}")
async def mira_chat_session(session_id: int, data: MiraChatRequest):
    """Чат с Мирой в рамках сессии с tool_calls."""
    # Save user message
    _save_mira_messages(session_id, [{"role": "user", "content": data.prompt}])

    # Auto-rename session on first message
    try:
        c = _get_db()
        count = _scalar(c.execute("SELECT COUNT(*) FROM mira_messages WHERE session_id = ? AND role = 'user'", (session_id,)).fetchone())
        c.close()
        if count == 1:
            asyncio.create_task(_auto_rename_session(session_id, data.prompt))
    except Exception:
        pass

    # Load last 20 messages for context
    conn = _get_db()
    prev = conn.execute(
        "SELECT role, content FROM mira_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 20",
        (session_id,),
    ).fetchall()
    prev.reverse()
    conn.close()

    context_str = data.context_data.get("timeline", "") if data.context_data else ""

    reply = "Нет ответа"
    try:
        body = await _call_mira(data.prompt, context_str=context_str, prev_messages=[
            {"role": p["role"], "content": p["content"]} for p in prev if p["role"] != "tool"
        ], tools_enabled=True)
        choice = body.get("choices", [{}])[0]
        msg = choice.get("message", {})

        saved = [msg]

        if msg.get("tool_calls"):
            tool_results = []
            for tc in msg["tool_calls"]:
                result = await _execute_tool(tc)
                tool_results.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": result})
                logger.info("Mira tool: %s → %s", tc.get("function", {}).get("name"), result[:80])

            saved.extend(tool_results)

            # Send tool results back for final answer
            final_messages = [
                {"role": "system", "content": "Ты — Мира, AI-ассистент CRM."},
                msg,
            ]
            final_messages.extend(tool_results)
            final_messages.append({"role": "user", "content": "Опиши результат пользователю кратко, по-русски."})

            final = await _call_mira("Опиши результат", prev_messages=final_messages[:-1], tools_enabled=False)
            final_reply = final.get("choices", [{}])[0].get("message", {}).get("content", "") or "Готово."
            reply = final_reply
            saved.append({"role": "assistant", "content": final_reply})
        else:
            reply = msg.get("content", "") or "Нет ответа"
            saved.append({"role": "assistant", "content": reply})

        _save_mira_messages(session_id, saved)

    except httpx.ConnectError:
        reply = f"✨ Мира настраивается. Запрос: «{data.prompt[:50]}»"
    except Exception as e:
        logger.error("Mira session error: %s", e, exc_info=True)
        reply = f"Ошибка: {e}"

    return {"response": reply, "session_id": session_id}


@app.delete("/api/mira/sessions/{session_id}")
async def mira_delete_session(session_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM mira_messages WHERE session_id = ?", (session_id,))
    conn.execute("DELETE FROM mira_sessions WHERE id = ?", (session_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ─── API: Stats ────────────────────────────────────────────────────────────────

@app.get("/api/stats")
async def stats():
    """Статистика воронки."""
    conn = _get_db()
    total = _scalar(conn.execute("SELECT COUNT(*) FROM clients WHERE archived IS NULL OR archived = 0").fetchone())
    by_status = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM clients WHERE archived IS NULL OR archived = 0 GROUP BY status ORDER BY cnt DESC"
    ).fetchall()
    total_deals = _scalar(conn.execute("SELECT COUNT(*) FROM deals WHERE archived IS NULL OR archived = 0").fetchone())
    deals_sum = _scalar(conn.execute("SELECT COALESCE(SUM(amount), 0) FROM deals WHERE archived IS NULL OR archived = 0").fetchone())
    # Клиенты без активных задач по статусам
    without_tasks = conn.execute(
        "SELECT c.status, COUNT(*) as cnt FROM clients c WHERE (c.archived IS NULL OR c.archived = 0) "
        "AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.client_id = c.id AND t.status = 'pending') "
        "GROUP BY c.status"
    ).fetchall()
    # Referrer statistics
    referrer_stats = conn.execute(
        "SELECT c2.id, c2.name, c2.telegram_nick, c2.referrer_color, COUNT(*) as cnt "
        "FROM clients c1 JOIN clients c2 ON c1.referrer_id = c2.id "
        "WHERE (c1.archived IS NULL OR c1.archived = 0) "
        "GROUP BY c2.id, c2.name, c2.telegram_nick, c2.referrer_color ORDER BY cnt DESC"
    ).fetchall()
    conn.close()
    without_tasks_map = {r["status"]: r["cnt"] for r in without_tasks}
    return {
        "total_clients": total,
        "by_status": [{"status": r["status"], "count": r["cnt"], "without_task": without_tasks_map.get(r["status"], 0)} for r in by_status],
        "total_deals": total_deals,
        "deals_sum": deals_sum,
        "referrer_stats": [{"id": r["id"], "name": r["name"], "telegram_nick": r["telegram_nick"], "color": r["referrer_color"], "count": r["cnt"]} for r in referrer_stats],
    }


@app.get("/api/stats/global")
async def stats_global():
    """Глобальная статистика для дашборда Сводка."""
    conn = _get_db()
    total_clients = _scalar(conn.execute("SELECT COUNT(*) FROM clients").fetchone()) or 0
    if USE_PG:
        new_week = _scalar(conn.execute(
            "SELECT COUNT(*) FROM clients WHERE created_at >= to_char(now() - interval '7 days', 'YYYY-MM-DD\"T\"HH24:MI:SS')"
        ).fetchone()) or 0
    else:
        new_week = _scalar(conn.execute(
            "SELECT COUNT(*) FROM clients WHERE created_at >= datetime('now', '-7 days')"
        ).fetchone()) or 0
    by_source = conn.execute(
        "SELECT source, COUNT(*) as cnt FROM clients WHERE source IS NOT NULL AND source != '' GROUP BY source ORDER BY cnt DESC"
    ).fetchall()
    messages_total = _scalar(conn.execute("SELECT COUNT(*) FROM telegram_messages").fetchone()) or 0
    female_count = _scalar(conn.execute("SELECT COUNT(*) FROM test_results WHERE test_type = 'female'").fetchone()) or 0
    mens_count = _scalar(conn.execute("SELECT COUNT(*) FROM test_results WHERE test_type = 'mens'").fetchone()) or 0
    total_deals = _scalar(conn.execute("SELECT COUNT(*) FROM deals").fetchone()) or 0
    utm_rows = conn.execute(
        "SELECT utm_source, COUNT(*) as cnt FROM test_results WHERE utm_source IS NOT NULL AND utm_source != '' GROUP BY utm_source ORDER BY cnt DESC"
    ).fetchall()
    conn.close()
    return {
        "leads": {
            "total": total_clients,
            "new_week": new_week,
            "by_source": [{"source": r["source"], "count": r["cnt"]} for r in by_source],
        },
        "utm": [{"source": r["utm_source"], "leads": r["cnt"], "tests": r["cnt"], "deals": 0} for r in utm_rows],
        "messages_total": messages_total,
        "funnel_female": {
            "opened_bot": female_count,
            "started_test": female_count,
            "completed_test": female_count,
            "clicked_extended": total_deals,
        },
        "funnel_male": {
            "opened_bot": mens_count,
            "started_test": mens_count,
            "completed_test": mens_count,
            "clicked_extended": 0,
        },
        "funnel_rpp": {"opened_bot": 0, "started_test": 0, "completed_test": 0, "clicked_extended": 0},
        "rpp": {"total": 0, "avg_score": 0},
    }


# ─── API: Поиск по воронке ────────────────────────────────────────────────────

class FunnelSearchResult(BaseModel):
    items: list
    total: int
    query: str

@app.get("/api/funnel/search")
async def funnel_search(
    q: str = Query(..., min_length=2),
    archived: Optional[bool] = Query(False),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Поиск по всей воронке: клиенты, сделки, тесты, заметки.
    Ищет по name, telegram_nick, telegram_id, phone, status, source, summary,
    а также по title сделок, diagnosis тестов и text заметок.
    """
    conn = _get_db()
    pattern = f"%{q}%"

    where_clauses = [
        "c.name LIKE ?",
        "c.telegram_nick LIKE ?",
        "c.telegram_id LIKE ?",
        "c.phone LIKE ?",
        "c.status LIKE ?",
        "c.source LIKE ?",
        "c.summary LIKE ?",
        "d.title LIKE ?",
        "tr.diagnosis LIKE ?",
        "n.text LIKE ?",
    ]
    archive_filter = "c.archived IS NOT NULL AND c.archived = 1" if archived else "(c.archived IS NULL OR c.archived = 0)"
    where_sql = f"({archive_filter}) AND ({' OR '.join(where_clauses)})"
    params = [pattern] * 10

    # Total distinct clients matching
    total = _scalar(
        conn.execute(
            f"SELECT COUNT(DISTINCT c.id) FROM clients c "
            f"LEFT JOIN deals d ON d.client_id = c.id "
            f"LEFT JOIN test_results tr ON tr.client_id = c.id "
            f"LEFT JOIN notes n ON n.client_id = c.id "
            f"WHERE {where_sql}",
            params,
        ).fetchone()
    )

    # Results with funnel context
    rows = conn.execute(
        f"SELECT DISTINCT c.id, c.name, c.telegram_nick, c.telegram_id, "
        f"c.phone, c.status, c.source, c.summary, c.last_contact, c.created_at, "
        f"(SELECT COUNT(*) FROM deals d2 WHERE d2.client_id = c.id) AS deal_count, "
        f"(SELECT COALESCE(SUM(d2.amount), 0) FROM deals d2 WHERE d2.client_id = c.id) AS deal_total_amount, "
        f"(SELECT d2.title FROM deals d2 WHERE d2.client_id = c.id ORDER BY d2.created_at DESC LIMIT 1) AS last_deal_title, "
        f"(SELECT tr2.test_type FROM test_results tr2 WHERE tr2.client_id = c.id ORDER BY tr2.created_at DESC LIMIT 1) AS last_test_type, "
        f"(SELECT tr2.diagnosis FROM test_results tr2 WHERE tr2.client_id = c.id ORDER BY tr2.created_at DESC LIMIT 1) AS last_test_diagnosis, "
        f"(SELECT tr2.total_score FROM test_results tr2 WHERE tr2.client_id = c.id ORDER BY tr2.created_at DESC LIMIT 1) AS last_test_total_score, "
        f"(SELECT COUNT(*) FROM notes n2 WHERE n2.client_id = c.id) AS notes_count, "
        f"(SELECT COUNT(*) FROM tasks t WHERE t.client_id = c.id AND t.status = 'pending') AS tasks_pending "
        f"FROM clients c "
        f"LEFT JOIN deals d ON d.client_id = c.id "
        f"LEFT JOIN test_results tr ON tr.client_id = c.id "
        f"LEFT JOIN notes n ON n.client_id = c.id "
        f"WHERE {where_sql} "
        f"ORDER BY c.id DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    conn.close()

    if USE_PG:
        # rollback any aborted transaction from potential failed queries
        pass

    seen = set()
    items = []
    client_ids = []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        client_ids.append(r["id"])
        test_type = r.get("last_test_type")
        items.append(
            {
                "client": {
                    "id": r["id"],
                    "name": r["name"],
                    "telegram_nick": r["telegram_nick"],
                    "telegram_id": r["telegram_id"],
                    "phone": r["phone"],
                    "status": r["status"],
                    "source": r["source"],
                    "summary": r["summary"],
                    "created_at": r["created_at"],
                },
                "funnel_stage": r["status"],
                "deal_summary": (
                    {
                        "total": r["deal_count"],
                        "total_amount": r["deal_total_amount"],
                        "last_deal": r["last_deal_title"] or "",
                    }
                    if r["deal_count"] > 0
                    else None
                ),
                "latest_test": (
                    {
                        "test_type": test_type,
                        "diagnosis": r["last_test_diagnosis"],
                        "score": r["last_test_total_score"],
                    }
                    if test_type
                    else None
                ),
                "notes_count": r["notes_count"],
                "tasks_pending": r["tasks_pending"],
                "last_contact": r.get("last_contact"),
            }
        )

    # Load tags for all found clients
    if client_ids:
        conn2 = _get_db()
        placeholders = ",".join(["?"] * len(client_ids))
        tag_rows = conn2.execute(
            f"SELECT ct.client_id, t.id, t.name, t.color FROM tags t "
            f"JOIN client_tags ct ON t.id = ct.tag_id "
            f"WHERE ct.client_id IN ({placeholders})",
            client_ids,
        ).fetchall()
        conn2.close()
        tags_by_client: dict[int, list[dict]] = {}
        for tr in tag_rows:
            tags_by_client.setdefault(tr["client_id"], []).append(
                {"id": tr["id"], "name": tr["name"], "color": tr["color"]}
            )
        for item in items:
            cid = item["client"]["id"]
            if cid in tags_by_client:
                item["client"]["tags"] = tags_by_client[cid]
            else:
                item["client"]["tags"] = []
    else:
        for item in items:
            item["client"]["tags"] = []

    return {"items": items, "total": total, "query": q}


# ─── Notion Comments Import ────────────────────────────────────────────────────

@app.post("/api/notion/import-comments")
async def import_notion_comments():
    """Массовый импорт комментариев из Notion → заметки CRM для всех клиентов."""
    conn = _get_db()
    clients = conn.execute(
        "SELECT id, notion_page_id, name FROM clients WHERE notion_page_id IS NOT NULL AND notion_page_id != ''"
    ).fetchall()
    conn.close()

    COMMENTS_API = "https://api.notion.com/v1/comments"
    total_imported = 0
    total_skipped = 0
    total_errors = 0
    seen = 0

    for row in clients:
        cid = row["id"]
        page_id = row["notion_page_id"]
        seen += 1

        try:
            async with httpx.AsyncClient(timeout=15) as http:
                headers = {
                    "Authorization": f"Bearer {NOTION_API_KEY}",
                    "Notion-Version": "2025-09-03",
                }
                start_cursor = None
                while True:
                    params: dict = {"block_id": page_id}
                    if start_cursor:
                        params["start_cursor"] = start_cursor
                    resp = await http.get(COMMENTS_API, headers=headers, params=params)
                    if resp.status_code != 200:
                        logger.warning("Notion API error for %s (%s): %d", row["name"], page_id, resp.status_code)
                        total_errors += 1
                        break

                    data = resp.json()
                    results = data.get("results", [])
                    if not results:
                        break

                    conn2 = _get_db()
                    try:
                        for comment in results:
                            rich_text = comment.get("rich_text", [])
                            text = "".join(
                                t.get("plain_text", "") for t in rich_text
                            )
                            created_at = comment.get("created_time", "")
                            if not text:
                                continue
                            # Форматируем created_at из ISO в YYYY-MM-DD HH:MM:SS
                            created_at_local = created_at[:10] + " " + created_at[11:19] if len(created_at) >= 19 else created_at
                            # Проверка дубликата
                            dup = conn2.execute(
                                "SELECT id FROM notes WHERE client_id = ? AND text = ? AND created_at = ? LIMIT 1",
                                (cid, text, created_at_local),
                            ).fetchone()
                            if dup:
                                total_skipped += 1
                                continue
                            conn2.execute(
                                "INSERT INTO notes (client_id, text, created_at, is_pinned, updated_at) VALUES (?, ?, ?, 0, ?)",
                                (cid, text, created_at_local, created_at_local),
                            )
                            total_imported += 1
                        conn2.commit()
                    finally:
                        conn2.close()

                    if not data.get("has_more"):
                        break
                    start_cursor = data.get("next_cursor")
        except Exception as e:
            logger.warning("Failed to import comments for %s (%s): %s", row["name"], page_id, e)
            total_errors += 1

    return {
        "ok": True,
        "processed": seen,
        "imported": total_imported,
        "skipped_duplicates": total_skipped,
        "errors": total_errors,
    }


# ─── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ─── Mira API ──────────────────────────────────────────────────────────────────
# Внутренние эндпоинты для Миры — без авторизации (Мира = встроенный ассистент)

# ─── Mira API: Задачи Антона ───────────────────────────────────────────────────

@app.get("/api/mira/antons-tasks")
async def mira_list_antons_tasks(archived: Optional[bool] = Query(False), status: Optional[str] = Query(None)):
    conn = _get_db()
    where = "WHERE (at.is_archived IS NULL OR at.is_archived = 0)" if not archived else "WHERE at.is_archived = 1"
    params = []
    if status:
        where += " AND at.status = ?"
        params.append(status)
    rows = conn.execute(
        f"SELECT at.*, (SELECT COUNT(*) FROM antons_task_comments WHERE task_id = at.id) as comments_count "
        f"FROM antons_tasks at {where} ORDER BY at.status, at.order_index, at.created_at DESC",
        params,
    ).fetchall()
    conn.close()
    return {"ok": True, "tasks": [_row(r) for r in rows]}

@app.post("/api/mira/antons-tasks")
async def mira_create_anton_task(data: AntonTaskCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO antons_tasks (title, status, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
        (data.title, data.status),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/mira/antons-tasks/{task_id}")
async def mira_patch_anton_task(task_id: int, data: AntonTaskPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status)
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if data.order_index is not None:
        updates.append("order_index = ?")
        params.append(data.order_index)
    if data.priority is not None:
        updates.append("priority = ?")
        params.append(data.priority)
    if data.is_archived is not None:
        updates.append("is_archived = ?")
        params.append(int(data.is_archived))
    if not updates:
        conn.close()
        return {"ok": True}
    updates.append("updated_at = datetime('now')")
    params.append(task_id)
    conn.execute(f"UPDATE antons_tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/mira/antons-tasks/{task_id}")
async def mira_delete_anton_task(task_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM antons_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/mira/antons-tasks/{task_id}/comments")
async def mira_anton_task_comments(task_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM antons_task_comments WHERE task_id = ? ORDER BY created_at ASC",
        (task_id,),
    ).fetchall()
    conn.close()
    return {"ok": True, "comments": [_row(r) for r in rows]}

@app.post("/api/mira/antons-tasks/{task_id}/comments")
async def mira_create_anton_comment(task_id: int, data: AntonTaskCommentCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO antons_task_comments (task_id, text, author, created_at) VALUES (?, ?, ?, datetime('now'))",
        (task_id, data.text, data.author),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.delete("/api/mira/antons-tasks/{task_id}/comments/{comment_id}")
async def mira_delete_anton_comment(task_id: int, comment_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM antons_task_comments WHERE id = ? AND task_id = ?", (comment_id, task_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/mira/antons-tasks/reorder")
async def mira_reorder_anton_tasks(data: AntonTaskReorder):
    conn = _get_db()
    for item in data.items:
        conn.execute(
            "UPDATE antons_tasks SET order_index = ?, updated_at = datetime('now') WHERE id = ?",
            (item.order_index, item.task_id),
        )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/mira/antons-tasks/statuses")
async def mira_anton_task_statuses():
    return {"ok": True, "statuses": ANTON_TASK_STATUSES}

# ─── Mira API: Задачи Ассистента ──────────────────────────────────────────────

@app.get("/api/mira/assistant-tasks")
async def mira_list_assistant_tasks(archived: Optional[bool] = Query(False), status: Optional[str] = Query(None)):
    conn = _get_db()
    where = "WHERE (at.is_archived IS NULL OR at.is_archived = 0)" if not archived else "WHERE at.is_archived = 1"
    params = []
    if status:
        where += " AND at.status = ?"
        params.append(status)
    rows = conn.execute(
        f"SELECT at.*, (SELECT COUNT(*) FROM assistant_task_comments WHERE task_id = at.id) as comments_count "
        f"FROM assistant_tasks at {where} ORDER BY at.status, at.order_index, at.created_at DESC",
        params,
    ).fetchall()
    conn.close()
    return {"ok": True, "tasks": [_row(r) for r in rows]}

@app.post("/api/mira/assistant-tasks")
async def mira_create_assistant_task(data: AssistantTaskCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO assistant_tasks (title, status, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
        (data.title, data.status),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/mira/assistant-tasks/{task_id}")
async def mira_patch_assistant_task(task_id: int, data: AssistantTaskPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status)
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if data.order_index is not None:
        updates.append("order_index = ?")
        params.append(data.order_index)
    if data.priority is not None:
        updates.append("priority = ?")
        params.append(data.priority)
    if data.is_archived is not None:
        updates.append("is_archived = ?")
        params.append(int(data.is_archived))
    if not updates:
        conn.close()
        return {"ok": True}
    updates.append("updated_at = datetime('now')")
    params.append(task_id)
    conn.execute(f"UPDATE assistant_tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/mira/assistant-tasks/{task_id}")
async def mira_delete_assistant_task(task_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM assistant_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/mira/assistant-tasks/{task_id}/comments")
async def mira_assistant_task_comments(task_id: int):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM assistant_task_comments WHERE task_id = ? ORDER BY created_at ASC",
        (task_id,),
    ).fetchall()
    conn.close()
    return {"ok": True, "comments": [_row(r) for r in rows]}

@app.post("/api/mira/assistant-tasks/{task_id}/comments")
async def mira_create_assistant_comment(task_id: int, data: AssistantTaskCommentCreate):
    conn = _get_db()
    conn.execute(
        "INSERT INTO assistant_task_comments (task_id, text, author, created_at) VALUES (?, ?, ?, datetime('now'))",
        (task_id, data.text, data.author),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.delete("/api/mira/assistant-tasks/{task_id}/comments/{comment_id}")
async def mira_delete_assistant_comment(task_id: int, comment_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM assistant_task_comments WHERE id = ? AND task_id = ?", (comment_id, task_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.post("/api/mira/assistant-tasks/reorder")
async def mira_reorder_assistant_tasks(data: AssistantTaskReorder):
    conn = _get_db()
    for item in data.items:
        conn.execute(
            "UPDATE assistant_tasks SET order_index = ?, updated_at = datetime('now') WHERE id = ?",
            (item.order_index, item.task_id),
        )
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/mira/assistant-tasks/statuses")
async def mira_assistant_task_statuses():
    return {"ok": True, "statuses": ASSISTANT_TASK_STATUSES}

@app.get("/api/mira/stats")
async def mira_stats():
    """Статистика для Миры: клиенты без активных задач по статусам."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT c.status, COUNT(*) as total, "
        "SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM tasks t WHERE t.client_id = c.id AND t.status = 'pending') THEN 1 ELSE 0 END) as without_pending "
        "FROM clients c WHERE (c.archived IS NULL OR c.archived = 0) GROUP BY c.status ORDER BY total DESC"
    ).fetchall()
    conn.close()
    return {"ok": True, "stats": [_row(r) for r in rows]}

# ─── Mira API: Задачи по клиентам (tasks) ──────────────────────────────────────

@app.get("/api/mira/client-tasks")
async def mira_list_client_tasks(client_id: Optional[int] = Query(None)):
    conn = _get_db()
    if client_id:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE client_id = ? ORDER BY created_at DESC", (client_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT t.*, c.name as client_name, c.telegram_nick FROM tasks t LEFT JOIN clients c ON t.client_id = c.id ORDER BY t.created_at DESC LIMIT 100"
        ).fetchall()
    conn.close()
    return {"ok": True, "tasks": [_row(r) for r in rows]}

@app.post("/api/mira/client-tasks")
async def mira_create_client_task(data: TaskCreate):
    conn = _get_db()
    if not data.client_id:
        conn.close()
        raise HTTPException(400, "client_id is required")
    conn.execute(
        "INSERT INTO tasks (client_id, title, type, due_date, description, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
        (data.client_id, data.title, data.task_type, data.due_date, data.description),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/mira/client-tasks/{task_id}")
async def mira_patch_client_task(task_id: int, data: TaskPatch):
    conn = _get_db()
    updates = []
    params = []
    if data.status is not None:
        updates.append("status = ?")
        params.append(data.status)
    if data.title is not None:
        updates.append("title = ?")
        params.append(data.title)
    if data.task_type is not None:
        updates.append("type = ?")
        params.append(data.task_type)
    if data.due_date is not None:
        updates.append("due_date = ?")
        params.append(data.due_date)
    if data.description is not None:
        updates.append("description = ?")
        params.append(data.description)
    if not updates:
        conn.close()
        return {"ok": True}
    params.append(task_id)
    conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/mira/client-tasks/{task_id}")
async def mira_delete_client_task(task_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ─── Mira API: Файлы и чеклисты ───────────────────────────────────────────────

@app.get("/api/mira/task-files")
async def mira_list_task_files(task_type: str = Query(...), task_id: int = Query(...)):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM task_files WHERE task_type = ? AND task_id = ? ORDER BY created_at DESC",
        (task_type, task_id),
    ).fetchall()
    conn.close()
    files = []
    for r in rows:
        f = dict(r)
        f["download_url"] = f"/api/files/{f['id']}/download"
        files.append(f)
    return {"ok": True, "files": files}

@app.post("/api/mira/task-files")
async def mira_create_task_file(data: dict):
    conn = _get_db()
    conn.execute(
        "INSERT INTO task_files (task_type, task_id, original_name, file_path, mime_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
        (data["task_type"], data["task_id"], data["original_name"], data.get("file_path", ""), data.get("mime_type", ""), int(data.get("file_size", 0))),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.delete("/api/mira/task-files/{file_id}")
async def mira_delete_task_file(file_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM task_files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/mira/task-checklist")
async def mira_list_task_checklist(task_type: str = Query(...), task_id: int = Query(...)):
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM task_checklist_items WHERE task_type = ? AND task_id = ? ORDER BY order_index, id",
        (task_type, task_id),
    ).fetchall()
    conn.close()
    return {"ok": True, "items": [_row(r) for r in rows]}

@app.post("/api/mira/task-checklist")
async def mira_create_checklist_item(data: dict):
    text = data.get("text", "").strip()
    task_type = data.get("task_type", "")
    task_id = data.get("task_id")
    if not text or not task_id:
        raise HTTPException(400, "text and task_id required")
    conn = _get_db()
    row = conn.execute(
        "SELECT COALESCE(MAX(order_index), -1) + 1 as next FROM task_checklist_items WHERE task_type = ? AND task_id = ?",
        (task_type, task_id),
    ).fetchone()
    next_idx = _scalar(row) if row else 0
    conn.execute(
        "INSERT INTO task_checklist_items (task_type, task_id, text, order_index, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
        (task_type, task_id, text, next_idx),
    )
    new_id = conn.lastrowid
    conn.commit()
    conn.close()
    return {"ok": True, "id": new_id}

@app.patch("/api/mira/task-checklist/{item_id}")
async def mira_patch_checklist_item(item_id: int, data: dict):
    conn = _get_db()
    if "done" in data:
        conn.execute("UPDATE task_checklist_items SET done = ? WHERE id = ?", (int(data["done"]), item_id))
    if "text" in data:
        conn.execute("UPDATE task_checklist_items SET text = ? WHERE id = ?", (data["text"], item_id))
    conn.commit()
    conn.close()
    return {"ok": True}

@app.delete("/api/mira/task-checklist/{item_id}")
async def mira_delete_checklist_item(item_id: int):
    conn = _get_db()
    conn.execute("DELETE FROM task_checklist_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# ─── Mira API: Поиск по всем задачам ──────────────────────────────────────────

@app.get("/api/mira/tasks/search")
async def mira_search_tasks(q: str = Query(...)):
    pattern = f"%{q}%"
    conn = _get_db()
    results = []
    # Антон
    rows = conn.execute(
        "SELECT id, title, description, status, 'antons' as source, created_at FROM antons_tasks WHERE title LIKE ? OR description LIKE ? ORDER BY created_at DESC LIMIT 20",
        (pattern, pattern),
    ).fetchall()
    results.extend(_row(r) for r in rows)
    # Ассистент
    rows = conn.execute(
        "SELECT id, title, description, status, 'assistant' as source, created_at FROM assistant_tasks WHERE title LIKE ? OR description LIKE ? ORDER BY created_at DESC LIMIT 20",
        (pattern, pattern),
    ).fetchall()
    results.extend(_row(r) for r in rows)
    # Клиентские
    rows = conn.execute(
        "SELECT t.id, t.title, t.description, t.status, 'client' as source, t.created_at, c.name as client_name FROM tasks t LEFT JOIN clients c ON t.client_id = c.id WHERE t.title LIKE ? OR t.description LIKE ? ORDER BY t.created_at DESC LIMIT 20",
        (pattern, pattern),
    ).fetchall()
    results.extend(_row(r) for r in rows)
    conn.close()
    return {"ok": True, "results": results}


# ─── Mira API: Клиенты (ограниченный доступ для Миры) ─────────────────────────

@app.get("/api/mira/clients")
async def mira_list_clients(search: Optional[str] = Query(None), limit: int = Query(20)):
    conn = _get_db()
    if search:
        pattern = f"%{search}%"
        rows = conn.execute(
            "SELECT id, name, telegram_nick, phone, status, source, last_contact FROM clients WHERE name LIKE ? OR telegram_nick LIKE ? OR phone LIKE ? ORDER BY last_contact DESC NULLS LAST LIMIT ?",
            (pattern, pattern, pattern, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, name, telegram_nick, phone, status, source, last_contact FROM clients ORDER BY last_contact DESC NULLS LAST LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return {"ok": True, "clients": [_row(r) for r in rows]}

@app.get("/api/mira/clients/{client_id}")
async def mira_get_client(client_id: int):
    conn = _get_db()
    row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Client not found")
    client = dict(row)
    # Последние заметки
    notes = conn.execute("SELECT id, text, created_at FROM notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 10", (client_id,)).fetchall()
    client["recent_notes"] = [dict(n) for n in notes]
    # Последние задачи
    tasks = conn.execute("SELECT id, title, type, status, due_date, created_at FROM tasks WHERE client_id = ? ORDER BY created_at DESC LIMIT 10", (client_id,)).fetchall()
    client["recent_tasks"] = [dict(t) for t in tasks]
    conn.close()
    return {"ok": True, "client": client}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8002, reload=True)
