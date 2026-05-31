#!/usr/bin/env python3
"""Одноразовая миграция сделок через psql на хосте.
1. Проставить product из title для сделок без product
2. Привязать сделки к клиентам по имени из title
3. Смержить дубли Аверкин (удалить лишние)
4. Привести product к каноническим значениям
"""
import subprocess
import sys

PSQL = ['docker', 'exec', '-i', 'postgres', 'psql', '-U', 'personal_os', '-t', '-A']

PRODUCT_MAP = {
    "Оргазмы": "Обуч. оргазмы",
    "МК Оргазмы": "Обуч. оргазмы",
    "МК Гипнооргазмы": "Обуч. оргазмы",
    "Обучение оргазмам": "Обуч. оргазмы",
    "Обучение гипнооргазмам": "Обуч. оргазмы",
    "Видеокурс Гипнооргазмы": "Обуч. оргазмы",
    "Тренинг Гипнооргазмы": "Обуч. оргазмы",
    "Тренинг Оргазмы оффлайн": "Обуч. оргазмы",
    "Быстрый старт": "М-Быстрый старт",
    "ЖП 1": "ЖП",
    "ЖП 2": "ЖП",
    "Женская Природа": "ЖП",
    "Женская Природа 2": "ЖП",
    "ЖП индивидуально": "ЖП",
    "Терапия 2": "Терапия",
    "Терапия 3": "Терапия",
    "Терапия – жизненная стратегия": "Терапия",
}

def psql(sql):
    result = subprocess.run(
        PSQL + ['-c', sql],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        err = result.stderr.strip()
        if err:
            print(f"  [SQL WARN] {err[:120]}")
        if result.stdout.strip():
            pass  # psql prints warnings to stderr but still succeeds
    lines = [l.strip() for l in result.stdout.strip().split('\n') if l.strip()]
    return lines

def esc(val):
    return val.replace("'", "''")

def main():
    total_changes = 0

    # ---- 1. Проставить product из title ----
    print("=== 1. Проставляем product из title ===")
    rows = psql("""
        SELECT id, title, COALESCE(product, '') as product FROM deals
        WHERE (archived IS NULL OR archived = 0)
          AND (product IS NULL OR product = '')
          AND title LIKE '% — %'
          AND title != ''
    """)
    for row in rows:
        parts = row.split('|')
        if len(parts) < 2:
            continue
        deal_id, title = parts[0], parts[1]
        title_product = title.split(" — ")[0].strip()
        canonical = PRODUCT_MAP.get(title_product, title_product)
        psql(f"UPDATE deals SET product = '{esc(canonical)}' WHERE id = {deal_id}")
        print(f"  id={deal_id}: product='{canonical}' (from title '{title_product}')")
        total_changes += 1
    print(f"\n  Итого проставлено product: {len(rows)}")

    # ---- 2. Привязать сделки к клиентам ----
    print("\n=== 2. Привязываем сделки без client_id ===")
    rows = psql("""
        SELECT id, title FROM deals
        WHERE (archived IS NULL OR archived = 0)
          AND client_id IS NULL
          AND title LIKE '% — %'
          AND title != ''
    """)
    for row in rows:
        parts = row.split('|')
        if len(parts) < 2:
            continue
        deal_id, title = parts[0], parts[1]
        title_parts = title.split(" — ", 1)
        if len(title_parts) < 2:
            continue
        client_hint = title_parts[1].strip()

        res = psql(f"SELECT id, name FROM clients WHERE name = '{esc(client_hint)}'")
        if len(res) == 1:
            cid = res[0].split('|')[0]
            psql(f"UPDATE deals SET client_id = {cid} WHERE id = {deal_id}")
            print(f"  id={deal_id}: title='{title}' -> client_id={cid} ({client_hint})")
            total_changes += 1
        else:
            res = psql(f"SELECT id, name FROM clients WHERE name LIKE '%{esc(client_hint)}%'")
            if len(res) >= 1:
                matches = [r.split('|') for r in res if '|' in r]
                print(f"  id={deal_id}: title='{title}' -> [{len(matches)} matches] — SKIP")
                for m in matches[:3]:
                    print(f"    - id={m[0]}: {m[1]}")
                if len(matches) > 3:
                    print(f"    ... и ещё {len(matches)-3}")
            else:
                print(f"  id={deal_id}: title='{title}' -> [0 matches] — SKIP")

    # ---- 3. Удалить дубли Аверкин ----
    print("\n=== 3. Чистим дубли (Аверкин) ===")
    res = psql("SELECT id, title FROM deals WHERE id IN (188, 310, 311)")
    if len(res) == 3:
        for r in res:
            parts = r.split('|')
            psql(f"DELETE FROM deals WHERE id = {parts[0]}")
            print(f"  Удалён дубль id={parts[0]}: {parts[1]}")
            total_changes += 1
    else:
        print(f"  Найдено только {len(res)} из 3 ожидаемых дублей")

    # ---- 4. Привести product к каноническим значениям ----
    print("\n=== 4. Приводим product к каноническим значениям ===")
    for old, new in PRODUCT_MAP.items():
        res = psql(f"""
            SELECT COUNT(*) FROM deals
            WHERE product = '{esc(old)}' AND (archived IS NULL OR archived = 0)
        """)
        count = int(res[0]) if res else 0
        if count > 0:
            psql(f"""
                UPDATE deals SET product = '{esc(new)}'
                WHERE product = '{esc(old)}' AND (archived IS NULL OR archived = 0)
            """)
            print(f"  '{old}' -> '{new}': {count} сделок")
            total_changes += count

    print(f"\n{'='*50}")
    print(f"Всего изменений: {total_changes}")

if __name__ == "__main__":
    main()

