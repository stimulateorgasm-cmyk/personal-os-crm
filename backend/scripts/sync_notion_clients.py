#!/usr/bin/env python3
"""
Sync CRM clients with Notion:
1. Find notion_page_id for CRM clients that don't have one
2. Pull missing phones from Notion to CRM
3. Only updates, never deletes
"""
import json, urllib.request, time, sys, os

NOTION_API_KEY = os.environ.get("NOTION_API_KEY", "")
NOTION_CLIENTS_DB_ID = os.environ.get("NOTION_CLIENTS_DB_ID", "")

if not NOTION_API_KEY or not NOTION_CLIENTS_DB_ID:
    # Try .env
    for env_path in ["/root/.env", "/root/.personal-os/.env", "/root/apps/crm/backend/.env"]:
        try:
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("NOTION_API_KEY="):
                        NOTION_API_KEY = line.split("=", 1)[1]
                    if line.startswith("NOTION_CLIENTS_DB_ID="):
                        NOTION_CLIENTS_DB_ID = line.split("=", 1)[1]
        except:
            pass

CRMPG = "postgresql://personal_os:personal_os_pg@127.0.0.1:5432/personal_os"

def notion_post(path, body):
    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(f"https://api.notion.com/v1{path}",
        data=json.dumps(body).encode(), headers=headers, method="POST")
    return json.loads(urllib.request.urlopen(req).read())

def notion_get(path):
    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": "2022-06-28",
    }
    req = urllib.request.Request(f"https://api.notion.com/v1{path}", headers=headers)
    return json.loads(urllib.request.urlopen(req).read())

def notion_patch_page(page_id, properties):
    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    data = {"properties": properties}
    req = urllib.request.Request(f"https://api.notion.com/v1/pages/{page_id}",
        data=json.dumps(data).encode(), headers=headers, method="PATCH")
    return json.loads(urllib.request.urlopen(req).read())

def pg_query(sql, params=None):
    import psycopg2
    conn = psycopg2.connect(CRMPG)
    cur = conn.cursor()
    if params:
        cur.execute(sql, params)
    else:
        cur.execute(sql)
    try:
        rows = cur.fetchall()
    except:
        rows = []
    conn.commit()
    conn.close()
    return rows

def pg_execute(sql, params):
    import psycopg2
    conn = psycopg2.connect(CRMPG)
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    conn.close()

# 1. Load Notion clients index
print("Loading Notion clients...")
notion_clients = []
cursor = None
while True:
    body = {"page_size": 100}
    if cursor:
        body["start_cursor"] = cursor
    try:
        resp = notion_post(f"/databases/{NOTION_CLIENTS_DB_ID}/query", body)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    notion_clients.extend(resp.get("results", []))
    if not resp.get("has_more"):
        break
    cursor = resp.get("next_cursor")
    time.sleep(0.3)

print(f"Loaded {len(notion_clients)} Notion clients")

# Index by telegram_nick (normalized) and name
notion_by_nick = {}
notion_by_name = {}
for r in notion_clients:
    props = r.get("properties", {})

    # Get name
    name = "".join([t.get("plain_text", "") for t in props.get("Имя", {}).get("title", [])]).lower().strip()

    # Get telegram_nick
    nick = "".join([t.get("plain_text", "") for t in props.get("Telegram Ник", {}).get("rich_text", [])]).lower().strip().lstrip("@")

    # Get phone
    phone = props.get("Телефон", {}).get("phone_number", "") or ""
    phone_clean = phone.replace("+", "").replace("-", "").replace(" ", "").strip()

    notion_by_nick[nick] = r
    if name:
        notion_by_name[name] = r

# 2. Load CRM clients without notion_page_id
print("Loading CRM clients without notion_page_id...")
rows = pg_query("SELECT id, name, telegram_nick, phone, notion_page_id FROM clients WHERE notion_page_id IS NULL OR notion_page_id = ''")
print(f"Found {len(rows)} CRM clients without notion_id")

updated_notion_ids = 0
updated_phones = 0
not_found = []

for row in rows:
    cid, cname, cnick, cphone, cnotion_id = row

    if cnotion_id and cnotion_id.strip():
        continue

    name = (cname or "").lower().strip()
    nick = (cnick or "").lower().strip().lstrip("@")

    # Try to find in Notion
    match = None

    # 1. Try telegram_nick
    if nick and nick in notion_by_nick:
        match = notion_by_nick[nick]
        print(f"  [{cname}] matched by nick @{nick}")

    # 2. Try name
    if not match and name and name in notion_by_name:
        match = notion_by_name[name]
        print(f"  [{cname}] matched by name '{name}'")

    if not match:
        not_found.append((cid, cname, cnick))
        continue

    page_id = match["id"]

    # Get phone from Notion
    match_props = match.get("properties", {})
    notion_phone = match_props.get("Телефон", {}).get("phone_number", "") or ""

    # Update notion_page_id in CRM
    pg_execute("UPDATE clients SET notion_page_id = %s WHERE id = %s", (page_id, cid))
    updated_notion_ids += 1

    # Update phone if CRM doesn't have one
    if notion_phone and not cphone:
        pg_execute("UPDATE clients SET phone = %s WHERE id = %s", (notion_phone, cid))
        print(f"    phone synced: '{notion_phone}'")
        updated_phones += 1

print(f"\n=== Result ===")
print(f"Updated notion_page_id: {updated_notion_ids}")
print(f"Updated phones: {updated_phones}")
print(f"Not found in Notion: {len(not_found)}")
if not_found:
    print(f"\nNot found (first 20):")
    for cid, name, nick in not_found[:20]:
        print(f"  id={cid} | {name} | @{nick}")
    if len(not_found) > 20:
        print(f"  ... and {len(not_found)-20} more")

# 3. Now push phone updates FROM CRM TO Notion for clients that have phone in CRM but not in Notion
print(f"\n--- Step 2: Push phones from CRM to Notion ---")
rows_with_phone = pg_query(
    "SELECT id, name, telegram_nick, phone, notion_page_id FROM clients "
    "WHERE notion_page_id IS NOT NULL AND notion_page_id != '' AND phone IS NOT NULL AND phone != ''"
)
pushed_phones = 0
for row in rows_with_phone:
    cid, cname, cnick, cphone, cnotion_id = row

    # Check Notion page for phone
    try:
        notion_page = notion_get(f"/pages/{cnotion_id}")
        notion_phone = notion_page.get("properties", {}).get("Телефон", {}).get("phone_number", "") or ""
    except:
        continue

    if not notion_phone and cphone:
        try:
            notion_patch_page(cnotion_id, {"Телефон": {"phone_number": cphone}})
            print(f"  [{cname}] phone pushed to Notion: {cphone}")
            pushed_phones += 1
            time.sleep(0.3)
        except Exception as e:
            print(f"  [{cname}] FAILED to push phone: {e}")

print(f"\nPhones pushed to Notion: {pushed_phones}")
print("Done!")
