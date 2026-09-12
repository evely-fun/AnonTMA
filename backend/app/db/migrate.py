from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.logging import get_logger
from app.db.base import Base

logger = get_logger("migrate")

TYPE_OVERRIDES = {
    "TIMESTAMP WITH TIME ZONE": {"sqlite": "DATETIME"},
    "BIGINT": {"sqlite": "INTEGER"},
}


def _column_ddl(dialect: str, column) -> str:
    raw = str(column.type)
    mapped = TYPE_OVERRIDES.get(raw, {}).get(dialect, raw)
    parts = [f'"{column.name}"', mapped]
    if column.default is not None and column.default.is_scalar:
        value = column.default.arg
        if isinstance(value, bool):
            literal = "TRUE" if value else "FALSE"
            if dialect == "sqlite":
                literal = "1" if value else "0"
        elif isinstance(value, (int, float)):
            literal = str(value)
        elif isinstance(value, str):
            literal = "'" + value.replace("'", "''") + "'"
        else:
            literal = None
        if literal is not None:
            parts.append(f"DEFAULT {literal}")
    return " ".join(parts)


async def add_missing_columns(connection: AsyncConnection) -> None:
    dialect = connection.dialect.name

    def collect(sync_connection) -> dict[str, set[str]]:
        inspector = inspect(sync_connection)
        existing: dict[str, set[str]] = {}
        for table in inspector.get_table_names():
            existing[table] = {column["name"] for column in inspector.get_columns(table)}
        return existing

    existing = await connection.run_sync(collect)

    for table in Base.metadata.sorted_tables:
        if table.name not in existing:
            continue
        present = existing[table.name]
        for column in table.columns:
            if column.name in present:
                continue
            ddl = f'ALTER TABLE "{table.name}" ADD COLUMN {_column_ddl(dialect, column)}'
            try:
                await connection.execute(text(ddl))
                logger.info("column added", table=table.name, column=column.name)
            except Exception as exc:
                logger.warning(
                    "column add failed", table=table.name, column=column.name, error=str(exc)
                )
