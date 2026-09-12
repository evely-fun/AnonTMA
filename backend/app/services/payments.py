import secrets
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.db.models import Purchase, User, UserStats
from app.services.economy import add_energy, grant_premium, is_premium

logger = get_logger("payments")

SUBSCRIPTION_PERIOD = 30 * 24 * 60 * 60


@dataclass(frozen=True, slots=True)
class Product:
    key: str
    title: str
    description: str
    stars: int
    days: int
    energy: int
    recurring: bool


CATALOG: tuple[Product, ...] = (
    Product(
        key="premium_month",
        title="Premium, 1 month",
        description="Unlimited energy, voice changer, every theme and priority matching.",
        stars=199,
        days=30,
        energy=0,
        recurring=True,
    ),
    Product(
        key="premium_week",
        title="Premium, 1 week",
        description="The same perks for seven days, no renewal.",
        stars=59,
        days=7,
        energy=0,
        recurring=False,
    ),
    Product(
        key="energy_pack",
        title="Energy pack",
        description="Refill your energy to the cap right away.",
        stars=25,
        days=0,
        energy=120,
        recurring=False,
    ),
)

BY_KEY = {product.key: product for product in CATALOG}


def catalog_payload() -> list[dict]:
    return [
        {
            "key": product.key,
            "title": product.title,
            "description": product.description,
            "stars": product.stars,
            "days": product.days,
            "energy": product.energy,
            "recurring": product.recurring,
        }
        for product in CATALOG
    ]


async def _apply(session: AsyncSession, user: User, product: Product) -> dict:
    stats = await session.get(UserStats, user.id)
    granted = {"premiumDays": 0, "energy": 0}
    if product.days:
        grant_premium(user, product.days)
        granted["premiumDays"] = product.days
    if product.energy and stats:
        granted["energy"] = add_energy(stats, is_premium(user), product.energy)
    return granted


async def start_purchase(session: AsyncSession, user: User, product_key: str) -> dict:
    product = BY_KEY.get(product_key)
    if product is None:
        return {"error": "unknown_product"}

    payload = f"{product.key}:{user.id}:{secrets.token_hex(8)}"
    record = Purchase(
        user_id=user.id,
        product=product.key,
        mode=settings.payments_mode,
        stars=product.stars,
        days=product.days,
        payload=payload,
        status="pending",
    )
    session.add(record)

    if settings.payments_mode != "live":
        granted = await _apply(session, user, product)
        record.status = "granted"
        return {
            "mode": "test",
            "granted": granted,
            "premiumUntil": user.premium_until.isoformat() if user.premium_until else None,
        }

    from app.bot.bot import get_bot

    bot = get_bot()
    if bot is None:
        return {"error": "payments_unavailable"}

    try:
        link = await bot.create_invoice_link(
            title=product.title,
            description=product.description,
            payload=payload,
            currency="XTR",
            prices=[{"label": product.title, "amount": product.stars}],
            subscription_period=SUBSCRIPTION_PERIOD if product.recurring else None,
        )
    except Exception as exc:
        logger.warning("invoice failed", product=product.key, error=str(exc))
        return {"error": "invoice_failed"}

    return {"mode": "live", "url": link, "stars": product.stars}


async def complete_purchase(
    session: AsyncSession, payload: str, charge_id: str | None
) -> dict | None:
    rows = await session.execute(select(Purchase).where(Purchase.payload == payload))
    record = rows.scalar_one_or_none()
    if record is None or record.status == "granted":
        return None

    product = BY_KEY.get(record.product)
    user = await session.get(User, record.user_id)
    if product is None or user is None:
        return None

    granted = await _apply(session, user, product)
    record.status = "granted"
    record.charge_id = charge_id
    logger.info("purchase granted", user=user.id, product=product.key)
    return {"userId": user.id, "product": product.key, "granted": granted}
