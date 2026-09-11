from aiogram.types import Update
from fastapi import APIRouter, Header, HTTPException, Request, status

from app.bot.bot import get_bot, get_dispatcher
from app.core.config import settings
from app.core.security import constant_time_equals

router = APIRouter(tags=["telegram"])


@router.post("/telegram/webhook", include_in_schema=False)
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(default=""),
) -> dict:
    if not settings.telegram_webhook_secret:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Webhook disabled")
    if not constant_time_equals(x_telegram_bot_api_secret_token, settings.telegram_webhook_secret):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad secret token")

    bot = get_bot()
    if bot is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Bot is not configured")

    body = await request.json()
    await get_dispatcher().feed_update(bot, Update.model_validate(body, context={"bot": bot}))
    return {"ok": True}
