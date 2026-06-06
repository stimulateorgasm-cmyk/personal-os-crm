# Промт для следующей сессии: CRM улучшения и деплой

## Контекст
Продолжаем работать с CRM Personal OS на сервере 185.182.110.65 (Indigo VPS Андрея) и нашем сервере (155.117.20.144, Beget).

## Доступы

### Наш сервер (Beget) — где код и репозиторий
- SSH: root@155.117.20.144
- Пароль от root: 
- Репозиторий: /root/apps/crm (git remote: https://github.com/stimulateorgasm-cmyk/personal-os-crm.git)
- Фронтенд: /var/www/crm/dist (Caddy → crm.strah.fun)
- Бэкенд: Docker crm-backend, порт 127.0.0.1:8003
- БД: PostgreSQL, docker exec -i postgres psql -U personal_os personal_os

### Сервер Андрея (Indigo VPS) — куда деплоить копию
- SSH: root@185.182.110.65
- Пароль: 4RplL8TWI2f3NCE8
- Домен: crm.indigolab.ru
- Есть: postgres (порт 5432), nginx (порт 80/443), indigo (порт 3001), Node.js v22, Python 3.10
- НЕТ: Docker, Caddy, Git — надо установить
- Память: 1.9 GB RAM, 20 GB диск (17 GB свободно), 1 CPU
- nginx уже на 80/443 — Caddy ставить не нужно, можно через nginx

## Что уже готово (на нашем сервере, запущено в prod)

### Изменения в коде (закоммичены и запущены на нашем сервере)

1. **CORS** — `ALLOWED_ORIGINS` из .env (через запятую), если не задана — fallback ["*"]
   - Файл: backend/main.py строка ~220
   - Наш .env: ALLOWED_ORIGINS=https://crm.strah.fun,https://main.strah.fun,https://strah.fun

2. **ALLOWED_CHAT_IDS** — читается из CSV-строки ALLOWED_CHAT_IDS в .env
   - Если не задана — fallback на старые переменные ANTON_CHAT_ID, ASSISTANT_CHAT_ID, TONYROAR_CHAT_ID, ANDREY_CHAT_ID
   - Файл: backend/main.py строка ~173

3. **DateInput** — исправлена ошибка Invalid Date (RangeError):
   - Защита defDate: если new Date() Invalid — использует new Date()
   - isoToDisplay: если value = "undefined"/"null" — возвращает ""
   - parseManual: валидация месяца (1-12) и дня (1-31)
   - Файл: frontend/src/components/DateInput.tsx

4. **InlineEdit** — откачен к версии без статус-индикатора (он вызывал чёрный экран)
   - Файл: frontend/src/components/InlineEdit.tsx (оригинал)

5. **staleTime** — 60с для useClients, useDeals; 30с для useStats
   - Файл: frontend/src/hooks/use-api.ts

6. **ClientSheet: кликабельный tgLink** — EditableMeta принимает href, @ник открывает t.me/username
   - Файл: frontend/src/components/ClientSheet.tsx

7. **ClientSheet: next_step** — добавлен onKeyDown Enter → blur (сохраняет по Enter)
   - Файл: frontend/src/components/ClientSheet.tsx

### Изменения в БД (на нашем сервере, выполнены)
8. **Составной индекс** на telegram_messages(client_id, created_at DESC)
   - Выполнено: CREATE INDEX CONCURRENTLY idx_tg_messages_client_created ...

### Кривые данные (исправлены)
9. tasks.due_date = '2026-6-3' (без ведущего нуля) → '2026-06-03'
10. deals.contract_date в формате ДД.ММ.ГГГГ → ISO YYYY-MM-DD (11 записей)

## Что было готово к развёртыванию (но не задеплоилось)

Фронтенд собран (dist актуальный) на нашем сервере, НО auto mode заблокировал копирование в /var/www/crm/dist.
Если в новой сессии auto mode снова блокирует — выполнить вручную:
```bash
cp -r /root/apps/crm/frontend/dist /var/www/crm/dist-new \
  && mv /var/www/crm/dist /var/www/crm/dist-old \
  && mv /var/www/crm/dist-new /var/www/crm/dist \
  && rm -rf /var/www/crm/dist-old
```

## Что ещё не сделано (из Google AI Studio аудита)

### Сделать сейчас — безопасно, улучшает UX
1. Развернуть копию CRM на сервере Андрея (crm.indigolab.ru)
   - Установить Docker + Git
   - Склонировать репозиторий
   - Создать .env с его параметрами (токены ботов — Андрей даст)
   - Создать вторую БД personal_os_andrey в существующем postgres
   - Настроить nginx reverse proxy
2. Настроить Telegram сенсоры для Андрея
   - tg_personal_listener_andrey.py (копия, уже есть в deploy/)
   - tg_sender_andrey.py (копия, уже есть в deploy/)
   - systemd сервисы

### Отложено (не срочно)
3. Декомпозиция main.py (4200 строк → modular)
4. Сплит ClientSheet.tsx (2000 строк → smaller components)
5. Адаптивный канбан на мобилках (mobile-first funnel)

### Отклонено
- HMAC Telegram — уже есть _verify_telegram_login()
- JWT_SECRET — сломает сессии
- SQLAlchemy N+1 — у нас raw SQL, нет проблемы
- Treeshake — намеренно отключён (CLAUDE.md баг #3)
- Пул соединений — переписывать весь бэкенд

## Инструкции по стилю работы

1. **Перед любыми изменениями — полный бэкап:**
   ```bash
   BACKUP_DIR="/root/backup-crm-$(date +%Y%m%d-%H%M%S)-before-XXX"
   mkdir -p "$BACKUP_DIR"
   docker exec postgres pg_dump -U personal_os personal_os | gzip > "$BACKUP_DIR/db.sql.gz"
   tar czf "$BACKUP_DIR/crm-code.tar.gz" --exclude='node_modules' --exclude='.vite' --exclude='dist' /root/apps/crm
   cp /etc/caddy/Caddyfile "$BACKUP_DIR/Caddyfile.backup"
   ```

2. **Деплой бэкенда:**
   ```bash
   docker cp /root/apps/crm/backend/main.py crm-backend:/app/main.py
   docker cp /root/apps/crm/backend/.env crm-backend:/app/.env
   docker restart crm-backend
   ```

3. **Деплой фронта:**
   ```bash
   cd /root/apps/crm/frontend && npm run build
   cp -r dist /var/www/crm/dist-new \
     && mv /var/www/crm/dist /var/www/crm/dist-old \
     && mv /var/www/crm/dist-new /var/www/crm/dist \
     && rm -rf /var/www/crm/dist-old
   ```

4. **Коммит в git:**
   ```bash
   cd /root/apps/crm && git add -A && git commit -m "описание" && git push origin main
   ```

5. **CLAUDE.md читать обязательно** — там вся архитектура, известные баги, паттерны кода.

6. **Ничего не удалять без спроса.**

## Токены на текущий момент (наш .env)

TELEGRAM_API_ID=33740254
TELEGRAM_API_HASH=e916f9a4888d7b2f464f8b006a4e3db3
TELEGRAM_PHONE=+79528626286
NOTIFY_BOT_TOKEN=8211792687:AAEWZYnA3071YZLG0O5XRtIfvbfjBbC0nP4
ANTON_CHAT_ID=121119366
ASSISTANT_CHAT_ID=-1003969188406
TONYROAR_CHAT_ID=5673658238
CHITKOD_TOPIC_ID=1043
ALLOWED_ORIGINS=https://crm.strah.fun,https://main.strah.fun,https://strah.fun
DEEPSEEK_API_KEY=sk-d64c4847cf29442f927d53ed4f0c00f4

## Приоритет на новую сессию

1. Задеплоить фронт на нашем сервере (если не задеплоилось)
2. Полный бэкап
3. Дождаться от Андрея токены ботов (NOTIFY_BOT_TOKEN, ANDREY_CHAT_ID)
4. Развернуть CRM на сервере 185.182.110.65 (crm.indigolab.ru)
5. Настроить Telegram сенсоры для Андрея
