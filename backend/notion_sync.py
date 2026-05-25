#!/usr/bin/env python3
"""Sync all clients and deals from local PostgreSQL → Notion.
Notion is the source of truth; local PG pushes changes to Notion.

Runs every 3 hours via cron to ensure Notion stays in sync.
Also handles new records that don't have a notion_page_id yet.
"""
import os, sys, json, time, logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('notion_sync')

NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
NOTION_CLIENTS_DB_ID = os.environ.get("NOTION_CLIENTS_DB_ID", "")
NOTION_DEALS_DB_ID = os.environ.get("NOTION_DEALS_DB_ID", "")

DB_URL = os.environ.get("DATABASE_URL", "postgresql://personal_os:personal_os_pg@postgres:5432/personal_os")

NOTION_BASE = "https://api.notion.com/v1"


def notion_headers():
    return {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }


def notion_update_page(page_id: str, properties: dict):
    """Update a Notion page. Returns True on success."""
    import httpx
    try:
        with httpx.Client(headers=notion_headers(), timeout=15) as client:
            resp = client.patch(f"{NOTION_BASE}/pages/{page_id}", json={"properties": properties})
            if resp.status_code != 200:
                log.warning(f"  Failed to update {page_id}: HTTP {resp.status_code}")
                return False
            return True
    except Exception as e:
        log.warning(f"  Exception updating {page_id}: {e}")
        return False


def notion_create_page(db_id: str, properties: dict) -> str | None:
    """Create a new page in a Notion database. Returns page_id."""
    import httpx
    try:
        with httpx.Client(headers=notion_headers(), timeout=15) as client:
            resp = client.post(f"{NOTION_BASE}/pages", json={
                "parent": {"database_id": db_id},
                "properties": properties,
            })
            if resp.status_code != 200:
                log.warning(f"  Failed to create in Notion: HTTP {resp.status_code}")
                return None
            return resp.json().get("id")
    except Exception as e:
        log.warning(f"  Exception creating page: {e}")
        return None


def sync_clients(pg_conn):
    """Push local PG clients → Notion. Create missing *and* update existing."""
    log.info("Syncing clients to Notion...")
    cur = pg_conn.cursor()

    # Grab ALL clients
    cur.execute("""
        SELECT id, notion_page_id, name, telegram_nick, phone, status, source,
               summary, next_step, last_account, follow_up_date
        FROM clients ORDER BY id
    """)
    rows = cur.fetchall()
    colnames = [desc[0] for desc in cur.description]
    clients = [dict(zip(colnames, r)) for r in rows]
    log.info(f"Loaded {len(clients)} clients from local DB")

    created = 0
    updated = 0
    skipped = 0

    for c in clients:
        props = {}
        if c.get("name"):
            props["Имя"] = {"title": [{"text": {"content": c["name"][:100]}}]}
        if c.get("telegram_nick"):
            props["Telegram Ник"] = {"rich_text": [{"text": {"content": c["telegram_nick"]}}]}
        if c.get("phone"):
            props["Телефон"] = {"phone_number": c["phone"]}
        if c.get("status"):
            props["Статус"] = {"status": {"name": c["status"]}}
        if c.get("source"):
            props["Источник"] = {"select": {"name": c["source"]}}
        if c.get("summary"):
            props["Контекст / Саммари"] = {"rich_text": [{"text": {"content": c["summary"][:2000]}}]}
        if c.get("next_step"):
            props["Следующий шаг"] = {"rich_text": [{"text": {"content": c["next_step"]}}]}

        notion_id = c.get("notion_page_id")

        if notion_id:
            # Update existing Notion page
            ok = notion_update_page(notion_id, props)
            if ok:
                updated += 1
            else:
                skipped += 1
        else:
            # Create new Notion page, then save the id locally
            new_id = notion_create_page(NOTION_CLIENTS_DB_ID, props)
            if new_id:
                cur.execute("UPDATE clients SET notion_page_id = %s WHERE id = %s", (new_id, c["id"]))
                pg_conn.commit()
                created += 1
            else:
                skipped += 1

        if (created + updated + skipped) % 500 == 0:
            log.info(f"  Progress: {created} created, {updated} updated, {skipped} skipped...")

    cur.close()
    log.info(f"Clients done: {created} created, {updated} updated, {skipped} skipped/errors")


def sync_deals(pg_conn):
    """Push local PG deals → Notion."""
    log.info("Syncing deals to Notion...")
    cur = pg_conn.cursor()

    # Build client_id → notion_page_id map
    cur.execute("SELECT id, notion_page_id FROM clients WHERE notion_page_id IS NOT NULL")
    client_notion_map = {row[0]: row[1] for row in cur.fetchall()}

    cur.execute("""
        SELECT id, notion_page_id, client_id, title, status, amount, paid, purchase_date
        FROM deals ORDER BY id
    """)
    rows = cur.fetchall()
    colnames = [desc[0] for desc in cur.description]
    deals = [dict(zip(colnames, r)) for r in rows]
    log.info(f"Loaded {len(deals)} deals from local DB")

    created = 0
    updated = 0
    skipped = 0

    for d in deals:
        client_notion_id = client_notion_map.get(d.get("client_id"))

        props = {}
        if d.get("title"):
            props["Сделка"] = {"title": [{"text": {"content": d["title"][:100]}}]}
        if d.get("amount"):
            props["Сумма"] = {"number": float(d["amount"])}
        if d.get("paid"):
            props["Оплачено"] = {"number": float(d["paid"])}
        if d.get("status"):
            props["Статус"] = {"status": {"name": d["status"]}}
        if client_notion_id:
            props["Клиент"] = {"relation": [{"id": client_notion_id}]}

        notion_id = d.get("notion_page_id")

        if notion_id:
            ok = notion_update_page(notion_id, props)
            if ok:
                updated += 1
            else:
                skipped += 1
        else:
            new_id = notion_create_page(NOTION_DEALS_DB_ID, props)
            if new_id:
                cur.execute("UPDATE deals SET notion_page_id = %s WHERE id = %s", (new_id, d["id"]))
                pg_conn.commit()
                created += 1
            else:
                skipped += 1

        if (created + updated + skipped) % 200 == 0:
            log.info(f"  Progress: {created} created, {updated} updated, {skipped} skipped...")

    cur.close()
    log.info(f"Deals done: {created} created, {updated} updated, {skipped} skipped/errors")


def main():
    import psycopg2
    conn = psycopg2.connect(DB_URL)

    sync_clients(conn)
    sync_deals(conn)
    conn.close()
    log.info("Sync complete!")


if __name__ == "__main__":
    main()
