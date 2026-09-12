from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_is_sqlite = settings.sqlalchemy_url.startswith("sqlite")

engine = create_async_engine(
    settings.sqlalchemy_url,
    echo=False,
    pool_pre_ping=True,
    **({} if _is_sqlite else {"pool_size": 10, "max_overflow": 20, "pool_recycle": 1800}),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_models() -> None:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.migrate import add_missing_columns

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await add_missing_columns(engine)
