"""
Восстановить @username для test_results по telegram_id через Telegram Bot API.
"""

import os, sys, asyncio
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

USE_PG = os.environ.get("USE_PG", "").lower() in ("true", "1", "yes")

if USE_PG:
    import psycopg2
    import psycopg2.extras
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    def _exec(sql, params):
        cur.execute(sql, params)
        conn.commit()
else:
    import sqlite3
    conn = sqlite3.connect(str(Path(__file__).parent / "crm.db"))
    cur = conn
    def _exec(sql, params):
        cur.execute(sql, params)
        conn.commit()

BOT_TOKEN = os.environ.get("QUIZ_BOT_TOKEN") or os.environ.get("MENS_BOT_TOKEN")
TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

async def get_chat_username(tg_id):
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.get(f"{TG_API}/getChat", params={"chat_id": tg_id})
            data = resp.json()
            if data.get("ok"):
                return data["result"].get("username", "").strip().lower() or None
            return None
    except Exception:
        return None

async def main():
    print("🔍 Шаг 1: Поиск username по telegram_id\n")

    if USE_PG:
        cur.execute("""
            SELECT id, telegram_id, telegram_username, name, test_type
            FROM test_results
            WHERE telegram_id IS NOT NULL AND telegram_id != ''
              AND (telegram_username IS NULL OR telegram_username = '')
            ORDER BY id
        """)
        rows = cur.fetchall()
    else:
        cur.execute("""
            SELECT id, telegram_id, telegram_username, name, test_type
            FROM test_results
            WHERE telegram_id IS NOT NULL AND telegram_id != ''
              AND (telegram_username IS NULL OR telegram_username = '')
            ORDER BY id
        """)
        rows = cur.fetchall()

    print(f"Найдено {len(rows)} записей без username (но с telegram_id).\n")

    found = 0
    for r in rows:
        tid = r["telegram_id"].strip()
        username = await get_chat_username(tid)
        if username:
            print(f"  ✅ id={r['id']} ({r['test_type']}) tg_id={tid} -> @{username}")
            _exec("UPDATE test_results SET telegram_username = %s WHERE id = %s", (username, r["id"]))
            found += 1
        else:
            print(f"  ❌ id={r['id']} ({r['test_type']}) tg_id={tid} — бот не знает")
        await asyncio.sleep(0.3)

    print(f"\n📊 Найдено username: {found} из {len(rows)}")

    print("\n🔍 Шаг 2: Поиск telegram_id по username (через clients)\n")

    if USE_PG:
        cur.execute("""
            SELECT tr.id, tr.telegram_username, c.telegram_id as client_tg_id
            FROM test_results tr
            LEFT JOIN clients c ON c.telegram_nick = tr.telegram_username
            WHERE tr.telegram_username IS NOT NULL AND tr.telegram_username != ''
              AND (tr.telegram_id IS NULL OR tr.telegram_id = '')
              AND c.telegram_id IS NOT NULL AND c.telegram_id != ''
        """)
        rows = cur.fetchall()
    else:
        cur.execute("""
            SELECT tr.id, tr.telegram_username, c.telegram_id as client_tg_id
            FROM test_results tr
            LEFT JOIN clients c ON c.telegram_nick = tr.telegram_username
            WHERE tr.telegram_username IS NOT NULL AND tr.telegram_username != ''
              AND (tr.telegram_id IS NULL OR tr.telegram_id = '')
              AND c.telegram_id IS NOT NULL AND c.telegram_id != ''
        """)
        rows = cur.fetchall()

    print(f"Найдено {len(rows)} записей для восстановления telegram_id из clients.\n")
    for r in rows:
        print(f"  ✅ id={r['id']} username=@{r['telegram_username']} -> telegram_id={r['client_tg_id']}")
        _exec("UPDATE test_results SET telegram_id = %s WHERE id = %s", (r["client_tg_id"], r["id"]))

    print("\n✅ Готово!")

if __name__ == "__main__":
    asyncio.run(main())
