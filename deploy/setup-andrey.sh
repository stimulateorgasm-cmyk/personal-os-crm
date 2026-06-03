#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# setup-andrey.sh — Развёртывание CRM для Андрея на Indigo VPS
# ─────────────────────────────────────────────────────────────
# Использование:
#   1. Заполнить .env.andrey (см. ниже)
#   2. Запустить: bash setup-andrey.sh
# ─────────────────────────────────────────────────────────────

DOMAIN="${DOMAIN:-crm.indigolab.ru}"
CRM_DIR="/root/apps/crm"
BACKEND_PORT="${BACKEND_PORT:-8004}"
GIT_REPO="https://github.com/stimulateorgasm-cmyk/personal-os-crm.git"
GIT_BRANCH="main"

# ─── Telegram (общие, от Андрея) ─────────────────────────────
TELEGRAM_API_ID="${TELEGRAM_API_ID}"
TELEGRAM_API_HASH="${TELEGRAM_API_HASH}"

# ─── Telegram боты (создать через @BotFather) ────────────────
NOTIFY_BOT_TOKEN="${NOTIFY_BOT_TOKEN}"           # Для входа в CRM + уведомления
QUIZ_BOT_TOKEN="${QUIZ_BOT_TOKEN:-}"             # Бот тестов (необязательно)
MENS_BOT_TOKEN="${MENS_BOT_TOKEN:-}"             # Бот мужского теста (необязательно)

# ─── Chat ID Telegram пользователей для входа ────────────────
ANDREY_CHAT_ID="${ANDREY_CHAT_ID}"               # Андрей (узнать: @userinfobot)
ASSISTANT_CHAT_ID="${ASSISTANT_CHAT_ID:-}"       # Ассистент (ID группы)
CHITKOD_TOPIC_ID="${CHITKOD_TOPIC_ID:-0}"        # Топик в группе (если есть)

# ─── DeepSeek для Hermes ─────────────────────────────────────
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY}"

# ─── ALLOWED_CHAT_IDS (для входа в CRM) ─────────────────────
ALLOWED_CHAT_IDS="${ANDREY_CHAT_ID}${ASSISTANT_CHAT_ID:+,$ASSISTANT_CHAT_ID}"

# ─── Postgres ────────────────────────────────────────────────
PG_USER="personal_os"
PG_PASS="personal_os_andrey"
PG_DB="personal_os_andrey"
PG_LOCAL_PORT="5432"  # postgres уже крутится на сервере

echo "▸ Установка Docker..."

if ! command -v docker &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq && apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
fi

echo "▸ Установка Caddy..."

if ! command -v caddy &>/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

echo "▸ Установка Git..."

if ! command -v git &>/dev/null; then
  apt-get install -y -qq git
fi

echo "▸ Клонирование репозитория..."

if [ ! -d "$CRM_DIR" ]; then
  mkdir -p /root/apps
  git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" "$CRM_DIR"
else
  cd "$CRM_DIR" && git pull origin "$GIT_BRANCH"
fi

echo "▸ Создание .env для бэкенда..."

cat > "$CRM_DIR/backend/.env" <<ENVEOF
# ─── Telegram ────────────────────────────────────────────────
TELEGRAM_API_ID=${TELEGRAM_API_ID}
TELEGRAM_API_HASH=${TELEGRAM_API_HASH}
TELEGRAM_PHONE=

# ─── Notion (опционально) ────────────────────────────────────
NOTION_API_KEY=
NOTION_CLIENTS_DB_ID=
NOTION_DEALS_DB_ID=

# ─── DeepSeek ────────────────────────────────────────────────
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}

# ─── Assistant Telegram account ──────────────────────────────
ASSISTANT_TELEGRAM_PHONE=

# ─── Bot notifications ──────────────────────────────────────
NOTIFY_BOT_TOKEN=${NOTIFY_BOT_TOKEN}
ALLOWED_CHAT_IDS=${ANDREY_CHAT_ID}${ASSISTANT_CHAT_ID:+,$ASSISTANT_CHAT_ID}
CHITKOD_TOPIC_ID=${CHITKOD_TOPIC_ID}

# ─── Quiz bots (опционально) ─────────────────────────────────
QUIZ_BOT_TOKEN=${QUIZ_BOT_TOKEN}
MENS_BOT_TOKEN=${MENS_BOT_TOKEN}

# ─── Other ──────────────────────────────────────────────────
KAITEN_API_KEY=

echo "▸ Создание второй БД в уже существующем postgres..."

su - postgres -c "psql -c \"CREATE DATABASE ${PG_DB};\"" 2>/dev/null || echo "  БД уже существует"
su - postgres -c "psql -c \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\"" 2>/dev/null || echo "  Пользователь уже существует"
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};\"" 2>/dev/null
su - postgres -c "psql -d ${PG_DB} -c \"GRANT ALL ON SCHEMA public TO ${PG_USER};\"" 2>/dev/null
su - postgres -c "psql -d ${PG_DB} -c \"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${PG_USER};\"" 2>/dev/null

echo "▸ Создание docker-compose.override.yml для Андрея..."

cat > "$CRM_DIR/docker-compose.override.yml" <<DEOF
services:
  crm-backend:
    container_name: crm-backend-andrey
    environment:
      DATABASE_URL: postgresql://${PG_USER}:${PG_PASS}@host.docker.internal:${PG_LOCAL_PORT}/${PG_DB}
      USE_PG: "true"
      NOTIFY_BOT_TOKEN: "${NOTIFY_BOT_TOKEN}"
      ALLOWED_CHAT_IDS: "${ALLOWED_CHAT_IDS}"
      CHITKOD_TOPIC_ID: "${CHITKOD_TOPIC_ID}"
      MIRA_API_URL: ""
      TELEGRAM_SENDER_URL: ""
    ports:
      - "127.0.0.1:${BACKEND_PORT}:8000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - personal_os_andrey

networks:
  personal_os_andrey:
    driver: bridge
DEOF

echo "▸ Запуск бэкенда..."

cd "$CRM_DIR"
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build crm-backend
echo "  Бэкенд запущен на порту ${BACKEND_PORT}"

echo "▸ Сборка фронтенда..."

cd "$CRM_DIR/frontend"
npm install --silent
npm run build

echo "▸ Копируем фронтенд..."

mkdir -p /var/www/crm-dist-andrey
rm -rf /var/www/crm-dist-andrey/*
cp -r dist/* /var/www/crm-dist-andrey/

echo "▸ Настройка Caddy для ${DOMAIN}..."

cat > /etc/caddy/conf.d/crm-indigolab.conf <<CADDYEOF
${DOMAIN} {
    root * /var/www/crm-dist-andrey
    file_server

    handle /api/* {
        reverse_proxy 127.0.0.1:${BACKEND_PORT}
    }

    handle /health {
        reverse_proxy 127.0.0.1:${BACKEND_PORT}
    }

    handle {
        try_files {path} /index.html
        file_server
        header /index.html {
            Cache-Control "no-cache, no-store, must-revalidate"
            Pragma "no-cache"
            Expires "0"
        }
        header /assets/* {
            Cache-Control "public, max-age=31536000, immutable"
        }
    }
}
CADDYEOF

systemctl reload caddy
echo "  Caddy перезагружен"

echo "▸ Установка Telegram сенсоров..."

cp "$(dirname "$0")/tg_personal_listener_andrey.py" "$CRM_DIR/backend/tg_personal_listener_andrey.py"
cp "$(dirname "$0")/tg_sender_andrey.py" "$CRM_DIR/backend/tg_sender_andrey.py"

pip3 install telethon aiohttp httpx python-dotenv 2>/dev/null

# ─── systemd: sender ─────────────────────────────────────────
cat > /etc/systemd/system/tg-sender-andrey.service <<UNIT
[Unit]
Description=Telegram Sender (Andrey)
After=network.target

[Service]
Type=simple
WorkingDirectory=$CRM_DIR/backend
ExecStart=/usr/bin/python3 tg_sender_andrey.py
Restart=on-failure
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
UNIT

# ─── systemd: listener ───────────────────────────────────────
cat > /etc/systemd/system/tg-listener-andrey.service <<UNIT
[Unit]
Description=Telegram Listener (Andrey)
After=network.target tg-sender-andrey.service

[Service]
Type=simple
WorkingDirectory=$CRM_DIR/backend
ExecStart=/usr/bin/python3 tg_personal_listener_andrey.py
Restart=on-failure
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable tg-sender-andrey tg-listener-andrey 2>/dev/null
# Не запускаем — надо сначала авторизовать аккаунт

echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ Развёртывание завершено!"
echo ""
echo "   Сайт:    https://${DOMAIN}"
echo "   Бэкенд:  http://127.0.0.1:${BACKEND_PORT}/api/stats"
echo "   БД:      ${PG_DB}"
echo ""
echo "   ⚠ Обязательные шаги после запуска:"
echo ""
echo "   1. Авторизовать Telegram аккаунт Андрея:"
echo "      cd $CRM_DIR/backend"
echo "      python3 -c \"import asyncio; from telethon import TelegramClient; \
echo c=TelegramClient('${SESSION_DIR}/andrey', $TELEGRAM_API_ID, '$TELEGRAM_API_HASH'); \
echo asyncio.run(c.start()); print('OK', asyncio.run(c.get_me()).username)\""
echo ""
echo "   2. Запустить сенсоры:"
echo "      systemctl start tg-sender-andrey tg-listener-andrey"
echo ""
echo "   3. Проверить CRM:"
echo "      curl -s http://127.0.0.1:$BACKEND_PORT/api/stats"
echo ""
echo "   4. Заполнить NOTIFY_BOT_TOKEN в .env (для входа через Telegram)"
echo "═══════════════════════════════════════════════════"
