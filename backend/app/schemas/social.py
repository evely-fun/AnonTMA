from datetime import datetime

from pydantic import Field

from app.schemas.common import ApiModel


class FriendView(ApiModel):
    id: int
    anon_name: str = Field(alias="anonName")
    avatar_seed: str = Field(alias="avatarSeed")
    alias: str | None = None
    level: int
    title: str
    favourite: bool = False
    is_online: bool = Field(default=False, alias="isOnline")
    activity: str | None = None
    last_seen_at: datetime | None = Field(default=None, alias="lastSeenAt")


class FriendRequestView(ApiModel):
    id: int
    user_id: int = Field(alias="userId")
    anon_name: str = Field(alias="anonName")
    avatar_seed: str = Field(alias="avatarSeed")
    level: int
    direction: str
    message: str | None = None
    created_at: datetime = Field(alias="createdAt")


class FriendRequestCreate(ApiModel):
    user_id: int = Field(alias="userId")
    message: str | None = Field(default=None, max_length=200)


class RoomCreate(ApiModel):
    title: str = Field(max_length=64, min_length=2)
    topic: str | None = Field(default=None, max_length=120)
    emoji: str = Field(default="🎧", max_length=8)
    kind: str = Field(default="voice", max_length=8)
    visibility: str = Field(default="public", max_length=8)
    max_participants: int = Field(default=8, alias="maxParticipants", ge=2, le=12)
    language: str = Field(default="en", max_length=8)
    game_key: str | None = Field(default=None, alias="gameKey", max_length=32)


class RoomMemberView(ApiModel):
    user_id: int = Field(alias="userId")
    anon_name: str = Field(alias="anonName")
    avatar_seed: str = Field(alias="avatarSeed")
    level: int
    role: str
    muted: bool = False
    speaking: bool = False


class RoomView(ApiModel):
    id: int
    code: str
    title: str
    topic: str | None = None
    emoji: str
    kind: str
    visibility: str
    language: str
    game_key: str | None = Field(default=None, alias="gameKey")
    owner_id: int = Field(alias="ownerId")
    max_participants: int = Field(alias="maxParticipants")
    participants: int = 0
    members: list[RoomMemberView] = []
    created_at: datetime = Field(alias="createdAt")
