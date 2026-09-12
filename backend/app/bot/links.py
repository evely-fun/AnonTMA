from app.core.config import settings

INVITE_TEXT = "Talk to someone new behind a mask. Join me on Anteiku."


def mini_app_url(start_param: str | None = None) -> str:
    """Deep link for the bot's Main Mini App.

    A `/app` segment addresses a named Direct Mini App and only resolves when
    one is registered under that short name. This bot serves a Main Mini App,
    so the link carries the parameter on the bot itself.
    """
    username = settings.telegram_bot_username or "your_bot"
    base = f"https://t.me/{username}"
    if settings.mini_app_short_name:
        base = f"{base}/{settings.mini_app_short_name}"
    return f"{base}?startapp={start_param}" if start_param else base
