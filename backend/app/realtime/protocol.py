from typing import Any

import orjson
from pydantic import BaseModel, Field, ValidationError

MAX_FRAME_BYTES = 64 * 1024


class Envelope(BaseModel):
    type: str = Field(max_length=48)
    payload: dict[str, Any] = Field(default_factory=dict)
    ack: str | None = Field(default=None, max_length=48)


def encode(message: dict[str, Any]) -> str:
    return orjson.dumps(message).decode()


def decode(raw: str) -> Envelope | None:
    if len(raw) > MAX_FRAME_BYTES:
        return None
    try:
        return Envelope.model_validate(orjson.loads(raw))
    except (orjson.JSONDecodeError, ValidationError, TypeError):
        return None


def event(name: str, payload: dict[str, Any] | None = None, ack: str | None = None) -> dict:
    frame: dict[str, Any] = {"type": name, "payload": payload or {}}
    if ack:
        frame["ack"] = ack
    return frame


def error(code: str, message: str, ack: str | None = None) -> dict:
    return event("error", {"code": code, "message": message}, ack)
