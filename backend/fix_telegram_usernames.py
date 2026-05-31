"""
Восстановить @username для клиентов, у которых telegram_nick = числовой ID.

Использует Telegram Bot API (getChat) для получения username по telegram_id.
"""

import os, sys, json, httpx
from pathlib import Path

# Загружаем .env
load_dotenv = None
try:
    from dotenv import load_dotenv
except ImportError:
    pass

env_path = Path(__file__).parent / ".env"
if load_dotenv:
    load_dotenv(env_path)

# Определяем БД
USE_PG = os.environ.get("USE_PG", "").lower() in ("true", "1", "yes")

if USE_PG:
    import psycopg2
    import psycopg2.extras
    PG_URL = os.environ["DATABASE_URL"]

    def _get_db():
        conn = psycopg2.connect(PG_URL)
        return conn
else:
    import sqlite3
    DB_PATH = Path(__file__).parent / "crm.db"

    def _get_db():
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        return conn

# Берём токен любого бота
BOT_TOKEN = os.environ.get("QUIZ_BOT_TOKEN") or os.environ.get("MENS_BOT_TOKEN")
if not BOT_TOKEN:
    print("❌ Нет ни QUIZ_BOT_TOKEN, ни MENS_BOT_TOKEN")
    sys.exit(1)

TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


async def get_chat_username(tg_id: str) -> str | None:
    """Получить username пользователя по telegram_id через getChat."""
    async with httpx.AsyncClient(timeout=10) as http:
        try:
            resp = await http.get(f"{TG_API}/getChat", params={"chat_id": tg_id})
            data = resp.json()
            if data.get("ok"):
                chat = data["result"]
                username = chat.get("username", "") or ""
                return username.strip().lower() or None
            else:
                print(f"  ⚠️ getChat вернул ошибку: {data.get('description', 'unknown')}")
                return None
        except Exception as e:
            print(f"  ⚠️ Ошибка запроса: {e}")
            return None


async def main():
    conn = _get_db()
    try:
        # Находим клиентов с цифровым telegram_nick
        if USE_PG:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("""
                SELECT id, name, telegram_nick, telegram_id
                FROM clients
                WHERE telegram_nick ~ '^\d+$'
                  AND telegram_nick != ''
                ORDER BY id
            """)
            rows = cur.fetchall()
        else:
            cur = conn.execute("""
                SELECT id, name, telegram_nick, telegram_id
                FROM clients
                WHERE telegram_nick GLOB '[0-9]*'
                  AND telegram_nick != ''
                ORDER BY id
            """)
            rows = cur.fetchall()

        if not rows:
            print("✅ Нет клиентов с ID вместо ника.")
            return

        print(f"Найдено {len(rows)} клиентов с ID вместо ника:\n")

        for r in rows:
            tg_id = r["telegram_id"].strip() if r.get("telegram_id") else r["telegram_nick"].strip()
            print(f"  ID={r['id']}, name={r['name']!r}, telegram_nick={r['telegram_nick']!r}, telegram_id={tg_id}")

            print(f"  → Запрашиваю username для telegram_id={tg_id}...")
            username = await get_chat_username(tg_id)

            if username:
                print(f"  ✅ Найден username: @{username}")
                if USE_PG:
                    conn.execute("""
                        UPDATE clients SET telegram_nick = %s WHERE id = %s
                    """, (username, r["id"]))
                else:
                    conn.execute(
                        "UPDATE clients SET telegram_nick = ? WHERE id = ?",
                        (username, r["id"])
                    )
                conn.commit()
            else:
                print(f"  ⚠️ Не удалось получить username. telegram_id={tg_id} остаётся как есть.")

        print("\n✅ Готово!")

    finally:
        conn.close()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
