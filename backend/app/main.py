import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.api.v1 import auth, config, economy, friends, games, rooms, telegram, users
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.bot.bot import setup_webhook, shutdown as shutdown_bot
from app.core.redis_client import close_redis
from app.db.session import init_models
from app.games.runtime import ticker
from app.realtime import presence
from app.realtime.gateway import router as ws_router
from app.realtime.hub import hub

logger = get_logger("app")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "microphone=(self), camera=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


async def _presence_janitor() -> None:
    while True:
        try:
            await presence.prune()
        except Exception as exc:
            logger.warning("presence prune failed", error=str(exc))
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(application: FastAPI):
    configure_logging()
    await init_models()
    await hub.start()
    tasks = [asyncio.create_task(ticker()), asyncio.create_task(_presence_janitor())]
    await setup_webhook()
    logger.info("service started", environment=settings.environment)
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await hub.stop()
        await shutdown_bot()
        await close_redis()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    default_response_class=ORJSONResponse,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "environment": settings.environment}


for module in (auth, users, friends, rooms, games, config, economy):
    app.include_router(module.router, prefix=settings.api_prefix)

app.include_router(telegram.router)
app.include_router(ws_router)
