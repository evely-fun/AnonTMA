from sqlalchemy import Column, Table, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.logging import get_logger
from app.db.base import Base

logger = get_logger("migrate")


def _literal(value: object, dialect: str) -> str | None:
    if isinstance(value, bool):
        if dialect == "sqlite":
            return "1" if value else "0"
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    return None


def _column_ddl(engine: AsyncEngine, column: Column) -> str:
    parts = [f'"{column.name}"', column.type.compile(dialect=engine.dialect)]
    default = column.default
    if default is not None and default.is_scalar:
        literal = _literal(default.arg, engine.dialect.name)
        if literal is not None:
            parts.append(f"DEFAULT {literal}")
    return " ".join(parts)


def _collect(sync_connection) -> dict[str, set[str]]:
    inspector = inspect(sync_connection)
    return {
        name: {column["name"] for column in inspector.get_columns(name)}
        for name in inspector.get_table_names()
    }


async def add_missing_columns(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        existing = await connection.run_sync(_collect)

    pending: list[tuple[Table, Column]] = []
    for table in Base.metadata.sorted_tables:
        present = existing.get(table.name)
        if present is None:
            continue
        pending.extend(
            (table, column) for column in table.columns if column.name not in present
        )

    for table, column in pending:
        statement = f'ALTER TABLE "{table.name}" ADD COLUMN {_column_ddl(engine, column)}'
        try:
            async with engine.begin() as connection:
                await connection.execute(text(statement))
            logger.info("column added", table=table.name, column=column.name)
        except Exception as exc:
            logger.warning(
                "column add failed", table=table.name, column=column.name, error=str(exc)
            )
