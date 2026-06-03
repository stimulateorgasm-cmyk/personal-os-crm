"""
Telethon Listener — для сервера Андрея.
Слушает личные сообщения его аккаунта, шлёт в CRM.
"""
import asyncio, json, logging, os, sys
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.tl.types import User

load_dotenv(Path(__file__).parent / ".env")

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
PHONE = os.environ.get("TELEGRAM_PHONE", "")
CRM_API = os.environ.get("CRM_API_URL", "http://127.0.0.1:8004")
NOTIFY_BOT_TOKEN = os.environ.get("NOTIFY_BOT_TOKEN", "")

SESSION_DIR = Path.home() / ".personal-os" / "sessions"
SESSION_DIR.mkdir(parents=True, exist_ok=True)
SESSION_PATH = str(SESSION_DIR / "andrey")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] tg-listener: %(message)s")
logger = logging.getLogger("tg-listener-andrey")

def send_to_crm(client_id: int | None, text: str, sender_id: int, is_from_client: bool, msg_id: int) -> None:
    try:
        payload = {
            "client_id": client_id,
            "text": text,
            "sender_id": sender_id,
            "is_from_client": is_from_client,
            "telegram_id": str(msg_id),
            "created_at": datetime.now().isoformat(),
        }
        httpx.post(f"{CRM_API}/api/telegram/message", json=payload, timeout=5)
        logger.info("sent to CRM: client=%s len=%d", client_id, len(text))
    except Exception as e:
        logger.warning("failed to send to CRM: %s", e)

def find_client_by_username(username: str) -> int | None:
    try:
        r = httpx.get(f"{CRM_API}/api/clients/search?q=@{username}", timeout=5)
        data = r.json()
        items = data.get("clients") or data.get("items") or []
        if items:
            return items[0].get("id")
    except Exception:
        pass
    return None

async def main():
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)

    @client.on(events.NewMessage(incoming=True))
    async def handler(event):
        sender = await event.get_sender()
        if not isinstance(sender, User) or sender.bot:
            return
        if sender.is_self:
            return

        text = event.message.message or ""
        if not text.strip():
            return

        logger.info("msg from @%s (id=%d): %s", sender.username, sender.id, text[:60])

        chat_id = event.chat_id
        username = sender.username or ""
        is_from_client = True

        # Ищем клиента в CRM
        client_id = None
        if username:
            client_id = find_client_by_username(f"@{username}")

        send_to_crm(
            client_id=client_id,
            text=text,
            sender_id=chat_id,
            is_from_client=is_from_client,
            msg_id=event.message.id,
        )

    await client.start(phone=PHONE)
    me = await client.get_me()
    logger.info("✅ Запущен как @%s (id=%d)", me.username, me.id)
    await client.run_until_disconnected()

if __name__ == "__main__":
    asyncio.run(main())
