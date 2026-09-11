import base64
import hashlib
import hmac
import os
import secrets
import time
import uuid
from typing import Any, Literal

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    pass


def _derive_key(material: str) -> bytes:
    return hashlib.sha256(material.encode()).digest()


def create_token(subject: int, token_type: TokenType, session_id: str | None = None) -> str:
    now = int(time.time())
    ttl = (
        settings.access_token_ttl_seconds
        if token_type == "access"
        else settings.refresh_token_ttl_seconds
    )
    payload = {
        "sub": str(subject),
        "typ": token_type,
        "sid": session_id or uuid.uuid4().hex,
        "iat": now,
        "nbf": now,
        "exp": now + ttl,
        "jti": uuid.uuid4().hex,
        "iss": settings.app_name,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.app_name,
            options={"require": ["exp", "iat", "sub", "typ"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("typ") != expected_type:
        raise TokenError("unexpected token type")
    return payload


class PayloadCipher:
    def __init__(self, key_material: str) -> None:
        self._aead = AESGCM(_derive_key(key_material or settings.jwt_secret))

    def encrypt(self, plaintext: str, aad: str = "") -> str:
        nonce = os.urandom(12)
        blob = self._aead.encrypt(nonce, plaintext.encode(), aad.encode() or None)
        return base64.urlsafe_b64encode(nonce + blob).decode()

    def decrypt(self, token: str, aad: str = "") -> str:
        raw = base64.urlsafe_b64decode(token.encode())
        nonce, blob = raw[:12], raw[12:]
        return self._aead.decrypt(nonce, blob, aad.encode() or None).decode()


cipher = PayloadCipher(settings.payload_encryption_key)


def anonymous_handle(user_id: int, scope: str) -> str:
    digest = hmac.new(
        settings.jwt_secret.encode(), f"{scope}:{user_id}".encode(), hashlib.sha256
    ).hexdigest()
    return digest[:16]


def new_secret(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def constant_time_equals(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)
