"""
Resolve missing telegram_id for CRM clients via Telegram Bot API getChat.
Сначала пробует NOTIFY_BOT_TOKEN, затем QUIZ_BOT_TOKEN.

Usage: python3 resolve_tg_ids.py
"""
import os, sys, time, json
import psycopg2
import httpx
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

NOTIFY_BOT_TOKEN = os.environ.get("NOTIFY_BOT_TOKEN", "")
QUIZ_BOT_TOKEN = os.environ.get("QUIZ_BOT_TOKEN", "")
PG_URL = os.environ.get("DATABASE_URL", "postgresql://personal_os:personal_os_pg@localhost:5432/personal_os")

BOT_TOKENS = []
if NOTIFY_BOT_TOKEN:
    BOT_TOKENS.append(("notify", NOTIFY_BOT_TOKEN))
if QUIZ_BOT_TOKEN:
    BOT_TOKENS.append(("quiz", QUIZ_BOT_TOKEN))

if not BOT_TOKENS:
    print("No bot tokens found!")
    sys.exit(1)


def get_clients_without_tg_id():
    conn = psycopg2.connect(PG_URL)
    cur = conn.cursor()
    # Активные клиенты (не архив, не Контакт) с telegram_nick но без telegram_id
    cur.execute("""
        SELECT id, telegram_nick, status FROM clients
        WHERE (telegram_id IS NULL OR telegram_id = '')
        AND telegram_nick IS NOT NULL AND telegram_nick != ''
        AND telegram_nick LIKE '@%'
        AND (archived IS NULL OR archived = 0)
        AND status NOT IN ('Контакт')
        ORDER BY id
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def update_client_tg_id(client_id, telegram_id):
    conn = psycopg2.connect(PG_URL)
    cur = conn.cursor()
    cur.execute("UPDATE clients SET telegram_id = %s WHERE id = %s", (str(telegram_id), client_id))
    conn.commit()
    cur.close()
    conn.close()


def resolve_via_getchat(username, token_name, token):
    """Try to resolve @username to numeric ID via getChat."""
    url = f"https://api.telegram.org/bot{token}/getChat?chat_id={username}"
    try:
        resp = httpx.get(url, timeout=10)
        data = resp.json()
        if data.get("ok") and data.get("result", {}).get("id"):
            return str(data["result"]["id"])
        if data.get("error_code") == 429:
            # Rate limited
            retry_after = data.get("parameters", {}).get("retry_after", 10)
            print(f"  Rate limited ({token_name}), waiting {retry_after}s...")
            time.sleep(retry_after)
            return None
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def main():
    clients = get_clients_without_tg_id()
    print(f"Found {len(clients)} clients without telegram_id")

    resolved = 0
    not_found = 0
    errors = 0
    rate_limited = False

    for i, (cid, nick, status) in enumerate(clients):
        if rate_limited:
            print(f"[{i+1}/{len(clients)}] Skipping (rate limited)")
            continue

        nick_clean = nick.strip()
        print(f"[{i+1}/{len(clients)}] id={cid} nick={nick_clean} status={status} -> ", end="", flush=True)

        found = False
        for token_name, token in BOT_TOKENS:
            tg_id = resolve_via_getchat(nick_clean, token_name, token)
            if tg_id:
                update_client_tg_id(cid, tg_id)
                print(f"RESOLVED via {token_name}: {tg_id}")
                resolved += 1
                found = True
                time.sleep(0.3)  # небольшая задержка между запросами
                break
            elif tg_id is None and token_name == "notify":
                # None means rate limited or error, try next token
                continue

        if not found:
            print("NOT FOUND")
            not_found += 1
            time.sleep(0.1)

    print(f"\nDone! Resolved: {resolved}, Not found: {not_found}, Errors: {errors}")


if __name__ == "__main__":
    main()
