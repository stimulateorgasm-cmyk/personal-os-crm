# CRM for Andrey — развёртывание на Indigo VPS

## Быстрый старт

```bash
# 1. Создай .env.andrey (образец ниже)
# 2. Запусти:
bash setup-andrey.sh
```

## Переменные окружения (создать заранее)

```bash
export TELEGRAM_API_ID="ваш_api_id"
export TELEGRAM_API_HASH="ваш_api_hash"
export NOTIFY_BOT_TOKEN="токен_бота_для_входа"
export ANDREY_CHAT_ID="ваш_telegram_id"
export ASSISTANT_CHAT_ID="id_группы_ассистента"   # опционально
export CHITKOD_TOPIC_ID="id_топика"               # опционально
export DEEPSEEK_API_KEY="ключ_deepseek"
export DOMAIN="crm.indigolab.ru"                   # по умолчанию
export BACKEND_PORT="8004"                         # по умолчанию
```

## Что делает скрипт

1. Устанавливает Docker, Caddy, Git
2. Клонирует репозиторий crm
3. Создаёт отдельную БД `personal_os_andrey` в существующем postgres
4. Создаёт `.env` и `docker-compose.override.yml`
5. Запускает бэкенд (контейнер `crm-backend-andrey` на порту 8004)
6. Собирает и копирует фронтенд
7. Настраивает Caddy для домена
8. Копирует Telegram сенсоры и создаёт systemd-сервисы

## После скрипта

```bash
# 1. Авторизовать Telegram
cd /root/apps/crm/backend
python3 -c "
import asyncio
from telethon import TelegramClient
c = TelegramClient('/root/.personal-os/sessions/andrey', TELEGRAM_API_ID, 'TELEGRAM_API_HASH')
asyncio.run(c.start())
print('OK', asyncio.run(c.get_me()).username)
"

# 2. Запустить сенсоры
systemctl start tg-sender-andrey tg-listener-andrey

# 3. Проверить
curl -s http://127.0.0.1:8004/api/stats
```

## Hermes / Telegram бот ассистента

Бот ассистента (прослушка сообщений из группы ассистента) — будет отдельно, когда будут токены.
