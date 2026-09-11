import asyncio
import json
import sys

import httpx
import websockets

BASE = "http://127.0.0.1:8000"
WS = "ws://127.0.0.1:8000/ws"


async def login(client: httpx.AsyncClient, tg_id: int) -> str:
    response = await client.post(f"{BASE}/api/v1/auth/dev", params={"tg_id": tg_id})
    response.raise_for_status()
    return response.json()["accessToken"]


async def read_until(socket, wanted: set[str], timeout: float = 10.0) -> dict:
    async def pump():
        while True:
            frame = json.loads(await socket.recv())
            if frame.get("type") in wanted:
                return frame

    return await asyncio.wait_for(pump(), timeout)


async def send(socket, kind: str, payload: dict | None = None) -> None:
    await socket.send(json.dumps({"type": kind, "payload": payload or {}}))


async def main() -> int:
    failures: list[str] = []

    async with httpx.AsyncClient(timeout=20) as client:
        health = await client.get(f"{BASE}/health")
        assert health.json()["status"] == "ok", "health failed"
        print("health ok")

        alice_token = await login(client, 900001)
        bob_token = await login(client, 900002)
        print("auth ok")

        profile = await client.get(
            f"{BASE}/api/v1/users/me", headers={"Authorization": f"Bearer {alice_token}"}
        )
        profile.raise_for_status()
        print("profile ok:", profile.json()["anonName"], "level", profile.json()["stats"]["level"])

        boot = await client.get(
            f"{BASE}/api/v1/config/bootstrap", headers={"Authorization": f"Bearer {alice_token}"}
        )
        boot.raise_for_status()
        print("games in catalog:", len(boot.json()["games"]))

    async with websockets.connect(f"{WS}?token={alice_token}") as alice, websockets.connect(
        f"{WS}?token={bob_token}"
    ) as bob:
        await read_until(alice, {"ready"})
        await read_until(bob, {"ready"})
        print("sockets ready")

        await send(alice, "match.start", {"mode": "text"})
        await read_until(alice, {"match.searching", "match.found"})
        await send(bob, "match.start", {"mode": "text"})

        alice_match = await read_until(alice, {"match.found"})
        bob_match = await read_until(bob, {"match.found"})
        dialog_id = alice_match["payload"]["dialogId"]
        assert dialog_id == bob_match["payload"]["dialogId"], "dialog mismatch"
        print("matched, dialog", dialog_id, "mask:", alice_match["payload"]["partner"]["name"])

        await send(alice, "dialog.message", {"text": "hello stranger"})
        incoming = await read_until(bob, {"dialog.message"})
        assert incoming["payload"]["text"] == "hello stranger", "message lost"
        print("dialog message ok")

        await send(alice, "dialog.message", {"text": "join me at https://spam.example"})
        blocked = await read_until(alice, {"error"})
        assert blocked["payload"]["code"] == "blocked_content", "spam filter failed"
        print("spam filter ok")

        await send(alice, "rtc.signal", {"kind": "offer", "to": alice_match["payload"]["partnerId"], "sdp": "v=0 fake"})
        offer = await read_until(bob, {"rtc.offer"})
        assert offer["payload"]["description"]["sdp"].startswith("v=0"), "sdp relay failed"
        print("webrtc signaling ok")

        await send(alice, "dialog.like")
        await asyncio.sleep(0.3)
        await send(bob, "dialog.like")
        liked = await read_until(bob, {"dialog.liked"})
        assert liked["payload"]["mutual"] is True, "mutual like failed"
        print("likes ok")

        await send(alice, "dialog.end")
        ended = await read_until(bob, {"dialog.ended"})
        print("dialog ended, reward:", ended["payload"]["reward"])

        await send(alice, "game.create", {"gameKey": "tictactoe", "options": {"withBot": True}})
        created = await read_until(alice, {"game.created"})
        game_id = created["payload"]["gameId"]
        await send(alice, "game.start", {"gameId": game_id})
        state = await read_until(alice, {"game.state"})
        view = state["payload"]["view"]
        print("tictactoe started, your mark", view["yourMark"], "turn", view["turn"])

        for index in range(9):
            await send(alice, "game.action", {"gameId": game_id, "action": "move", "payload": {"index": index}})
            frame = await read_until(alice, {"game.state"})
            view = frame["payload"]["view"]
            if view["phase"] == "finished" or view["round"] > 1:
                break
        print("tictactoe played, board:", view["board"], "wins:", view["wins"])

    if failures:
        for item in failures:
            print("FAIL:", item)
        return 1
    print("\nALL SMOKE CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
