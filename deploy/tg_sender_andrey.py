"""
Telegram Sender — для сервера Андрея.
HTTP-сервис для отправки сообщений через Telethon.
"""
import asyncio, logging, os, sys
from pathlib import Path

from aiohttp import web
from dotenv import load_dotenv
from telethon import TelegramClient

load_dotenv(Path(__file__).parent / ".env")

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
PORT = int(os.environ.get("SENDER_PORT", "8012"))

SESSION_DIR = Path.home() / ".personal-os" / "sessions"

ACCOUNTS = {
    "andrey": str(SESSION_DIR / "andrey"),
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] sender: %(message)s")
logger = logging.getLogger("sender-andrey")

_clients: dict[str, TelegramClient] = {}

async def get_client(account: str) -> TelegramClient | None:
    if account in _clients:
        return _clients[account]
    session_path = ACCOUNTS.get(account)
    if not session_path:
        logger.error("Unknown account: %s", account)
        return None
    client = TelegramClient(session_path, API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        logger.error("Account %s not authorized", account)
        await client.disconnect()
        return None
    me = await client.get_me()
    logger.info("Account %s authorized as @%s", account, me.username)
    _clients[account] = client
    return client

async def send_handler(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400)
    chat_id = body.get("chat_id", "").strip()
    text = body.get("text", "").strip()
    account = body.get("account", "andrey").strip()
    if not chat_id or not text:
        return web.json_response({"ok": False, "error": "chat_id and text required"}, status=400)
    client = await get_client(account)
    if not client:
        return web.json_response({"ok": False, "error": "account not available"}, status=502)
    try:
        target = int(chat_id) if chat_id.isdigit() else chat_id
        sent = await client.send_message(target, text)
        return web.json_response({"ok": True, "message_id": sent.id})
    except Exception as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)

async def health(request: web.Request) -> web.Response:
    ready = []
    for name, cli in _clients.items():
        ready.append({"account": name, "connected": cli.is_connected()})
    return web.json_response({"status": "ok", "accounts": ready})

async def shutdown(app: web.Application) -> None:
    for name, cli in _clients.items():
        try:
            await cli.disconnect()
        except Exception:
            pass

def main():
    app = web.Application()
    app.on_shutdown.append(shutdown)
    app.router.add_post("/send", send_handler)
    app.router.add_get("/health", health)
    logger.info("Starting sender on 0.0.0.0:%d", PORT)
    web.run_app(app, host="0.0.0.0", port=PORT, print=lambda _: None)

if __name__ == "__main__":
    main()
