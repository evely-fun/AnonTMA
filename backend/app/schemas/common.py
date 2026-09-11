from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class Ok(ApiModel):
    ok: bool = True
    data: dict[str, Any] | None = None


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    has_more: bool = False
