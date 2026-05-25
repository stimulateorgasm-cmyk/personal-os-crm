"""Импорт мужских тестеров в таблицу clients."""
import os
import sys
sys.path.insert(0, '/root/apps/crm/backend')

os.environ['USE_PG'] = 'true'
os.environ['DATABASE_URL'] = 'postgresql://personal_os:personal_os_pg@127.0.0.1:5432/personal_os'

import psycopg2
import psycopg2.extras

conn = psycopg2.connect('postgresql://personal_os:personal_os_pg@127.0.0.1:5432/personal_os')
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def q(sql, params=None):
    cur.execute(sql, params or ())
    return cur

# 1. Создаём контакты для тех у кого @username
q("SELECT id, name, telegram_id, utm_source FROM test_results WHERE test_type = 'mens' AND name LIKE '@%'")
rows = cur.fetchall()

created = 0
skipped = 0
for r in rows:
    username = r['name'].lstrip('@')
    q("SELECT id FROM clients WHERE telegram_nick = %s", (username,))
    existing = cur.fetchone()
    if existing:
        q("UPDATE test_results SET client_id = %s WHERE id = %s", (existing['id'], r['id']))
        skipped += 1
        continue

    q("INSERT INTO clients (notion_page_id, name, telegram_nick, telegram_id, status, source) VALUES (NULL, %s, %s, %s, 'Контакт', %s)",
      (username, username, r['telegram_id'] or '', r.get('utm_source') or ''))
    q("SELECT lastval()")
    new_id = cur.fetchone()[0]
    q("UPDATE test_results SET client_id = %s WHERE id = %s", (new_id, r['id']))
    created += 1

conn.commit()
print(f"@username: создано {created}, пропущено (уже есть) {skipped}")

# 2. Создаём контакты для тех у кого только telegram_id
q("SELECT id, telegram_id FROM test_results WHERE test_type = 'mens' AND (name IS NULL OR name = '') AND COALESCE(telegram_id,'') != ''")
rows2 = cur.fetchall()

created2 = 0
skipped2 = 0
for r in rows2:
    tid = r['telegram_id']
    q("SELECT id FROM clients WHERE telegram_id = %s", (tid,))
    existing = cur.fetchone()
    if existing:
        q("UPDATE test_results SET client_id = %s WHERE id = %s", (existing['id'], r['id']))
        skipped2 += 1
        continue

    q("INSERT INTO clients (notion_page_id, name, telegram_nick, telegram_id, status, source) VALUES (NULL, %s, '', %s, 'Контакт', 'Тест на мастерство')",
      (f"tg_{tid}", tid))
    q("SELECT lastval()")
    new_id = cur.fetchone()[0]
    q("UPDATE test_results SET client_id = %s WHERE id = %s", (new_id, r['id']))
    created2 += 1

conn.commit()
print(f"telegram_id: создано {created2}, пропущено (уже есть) {skipped2}")

# 3. Удаляем результаты без идентификаторов
q("DELETE FROM test_results WHERE test_type = 'mens' AND (name IS NULL OR name = '') AND (telegram_id IS NULL OR telegram_id = '')")
deleted = cur.rowcount
conn.commit()
print(f"Удалено записей без идентификаторов: {deleted}")

# Итог
q("SELECT COUNT(*) FROM test_results WHERE test_type = 'mens'")
total = cur.fetchone()[0]
print(f"Осталось записей: {total}")

conn.close()
