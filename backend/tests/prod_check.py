import asyncio
import hashlib
import hmac
import json
import os
import random
import sys
import time
from urllib.parse import urlencode

import httpx
import websockets

API = os.environ["PROD_API"]
TOKEN = os.environ["PROD_BOT_TOKEN"]
WS = API.replace("https://", "wss://") + "/ws"


def sign_init_data(user_id: int, first_name: str) -> str:
    payload = {
        "auth_date": str(int(time.time())),
        "user": json.dumps(
            {"id": user_id, "first_name": first_name, "username": f"probe{user_id}", "language_code": "en"},
            separators=(",", ":"),
        ),
    }
    check_string = "\n".join(f"{key}={payload[key]}" for key in sorted(payload))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    payload["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(payload)


async def read_until(socket, wanted: set[str], timeout: float = 25.0) -> dict:
    async def pump():
        while True:
            frame = json.loads(await socket.recv())
            if frame.get("type") in wanted:
                return frame

    return await asyncio.wait_for(pump(), timeout)


async def send(socket, kind: str, payload: dict | None = None) -> None:
    await socket.send(json.dumps({"type": kind, "payload": payload or {}}))


async def main() -> int:
    async with httpx.AsyncClient(timeout=60) as client:
        tokens = []
        base = 990000 + random.randint(0, 8999)
        for user_id, name in ((base, "Deploy Check A"), (base + 1, "Deploy Check B")):
            response = await client.post(
                f"{API}/api/v1/auth/telegram",
                json={"initData": sign_init_data(user_id, name)},
            )
            response.raise_for_status()
            tokens.append(response.json()["accessToken"])
        print("initData auth accepted, tokens issued")

        me = await client.get(
            f"{API}/api/v1/users/me", headers={"Authorization": f"Bearer {tokens[0]}"}
        )
        me.raise_for_status()
        body = me.json()
        print(f"user persisted in postgres: id={body['id']} mask={body['anonName']}")

        boot = await client.get(
            f"{API}/api/v1/config/bootstrap", headers={"Authorization": f"Bearer {tokens[0]}"}
        )
        boot.raise_for_status()
        print(f"catalog: {len(boot.json()['games'])} games, presence {boot.json()['presence']}")

    async with websockets.connect(f"{WS}?token={tokens[0]}") as first, websockets.connect(
        f"{WS}?token={tokens[1]}"
    ) as second:
        await read_until(first, {"ready"})
        await read_until(second, {"ready"})
        print("websockets connected through render")

        await send(first, "match.start", {"mode": "text"})
        await read_until(first, {"match.searching", "match.found"})
        await send(second, "match.start", {"mode": "text"})
        matched = await read_until(first, {"match.found"})
        print(f"matched over redis: dialog {matched['payload']['dialogId']}")

        await send(first, "dialog.message", {"text": "production probe"})
        delivered = await read_until(second, {"dialog.message"})
        assert delivered["payload"]["text"] == "production probe"
        print("message delivered across sockets")

        await send(first, "rtc.signal", {"kind": "offer", "to": matched["payload"]["partnerId"], "sdp": "v=0 probe"})
        await read_until(second, {"rtc.offer"})
        print("webrtc signalling relayed")

        await send(first, "dialog.end")
        ended = await read_until(second, {"dialog.ended"})
        print(f"dialog closed, reward {ended['payload']['reward']}")

    print("\nPRODUCTION END TO END OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
