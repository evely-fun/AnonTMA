from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    PreCheckoutQuery,
    WebAppInfo,
)

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("bot")

WELCOME = (
    "<b>Anteiku</b> is an anonymous voice and text space.\n\n"
    "Tap below to open the app, find a random companion in a second, "
    "join a voice room or start a game with friends."
)
HELP = (
    "<b>What you can do</b>\n"
    "• Random anonymous chat, text or voice\n"
    "• Voice rooms with topics\n"
    "• Mafia, Alias, Broken Telephone, Tic Tac Toe, Voice Flappy\n"
    "• Friends, calls and invites\n"
    "• Levels, coins, streaks and leaderboards\n\n"
    "Everything runs inside the mini app."
)

_bot: Bot | None = None
_dispatcher: Dispatcher | None = None


def app_url(start_param: str | None = None) -> str:
    username = settings.telegram_bot_username or "your_bot"
    base = f"https://t.me/{username}/app"
    return f"{base}?startapp={start_param}" if start_param else base


def keyboard(start_param: str | None = None) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton(text="🎧  Open Anteiku", web_app=WebAppInfo(url=settings.public_web_url))],
        [
            InlineKeyboardButton(
                text="🤝  Invite a friend",
                url=f"https://t.me/share/url?url={app_url(start_param)}",
            )
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_bot() -> Bot | None:
    global _bot
    if not settings.telegram_bot_token:
        return None
    if _bot is None:
        _bot = Bot(
            token=settings.telegram_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
    return _bot


def get_dispatcher() -> Dispatcher:
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = Dispatcher()
        _register(_dispatcher)
    return _dispatcher


def _register(dispatcher: Dispatcher) -> None:
    @dispatcher.message(CommandStart())
    async def on_start(message: Message, command: CommandObject) -> None:
        payload = command.args or None
        await message.answer(WELCOME, reply_markup=keyboard(payload))

    @dispatcher.message(F.text.startswith("/help"))
    async def on_help(message: Message) -> None:
        await message.answer(HELP, reply_markup=keyboard())

    @dispatcher.message(F.text.startswith("/app"))
    async def on_app(message: Message) -> None:
        await message.answer("Here you go:", reply_markup=keyboard())

    @dispatcher.message(F.text.startswith("/invite"))
    async def on_invite(message: Message) -> None:
        await message.answer(
            "Share this link, you both get coins when a friend joins:",
            reply_markup=keyboard(),
        )

    @dispatcher.pre_checkout_query()
    async def on_pre_checkout(query: PreCheckoutQuery) -> None:
        await query.answer(ok=True)

    @dispatcher.message(F.successful_payment)
    async def on_paid(message: Message) -> None:
        from app.db.session import SessionLocal
        from app.services.payments import complete_purchase

        payment = message.successful_payment
        if payment is None:
            return
        async with SessionLocal() as session:
            result = await complete_purchase(
                session, payment.invoice_payload, payment.telegram_payment_charge_id
            )
            await session.commit()
        if result:
            await message.answer("Payment received, your premium is active.", reply_markup=keyboard())


async def setup_webhook() -> None:
    bot = get_bot()
    if bot is None or not settings.telegram_webhook_secret or not settings.public_api_url:
        logger.info("bot webhook skipped")
        return
    url = f"{settings.public_api_url.rstrip('/')}/telegram/webhook"
    try:
        await bot.set_webhook(
            url=url,
            secret_token=settings.telegram_webhook_secret,
            drop_pending_updates=True,
            allowed_updates=["message", "callback_query", "inline_query", "pre_checkout_query"],
        )
        logger.info("bot webhook ready", url=url)
    except Exception as exc:
        logger.warning("bot webhook failed", error=str(exc))


async def notify(user_tg_id: int, text: str) -> None:
    bot = get_bot()
    if bot is None:
        return
    try:
        await bot.send_message(user_tg_id, text, reply_markup=keyboard())
    except Exception as exc:
        logger.info("notify failed", error=str(exc))


async def shutdown() -> None:
    if _bot is not None:
        await _bot.session.close()
