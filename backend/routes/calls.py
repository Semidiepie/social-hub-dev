"""Audio / video call signaling relay (WebRTC) + Agora token service.

A single personal WebSocket per user (`/api/rtc/ws?token=JWT`) delivers
incoming-call invites and coordinates a call "room" (who is ringing / joined).
The actual audio/video MEDIA is carried by **Agora** (agora-rtc-sdk-ng on the
web client) — reliable SFU, no TURN needed. `POST /api/rtc/agora-token` mints a
short-lived RTC token (App ID + App Certificate from env) for the call channel.

NOTE: intentionally NO `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
import hashlib
import os
import time
import uuid
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

try:
    from agora_token_builder import RtcTokenBuilder
except Exception:  # pragma: no cover - import guard
    RtcTokenBuilder = None

AGORA_APP_ID = os.environ.get("AGORA_APP_ID", "")
AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "")
AGORA_TOKEN_TTL = 3600  # 1 hour
_ROLE_PUBLISHER = 1

_DEFAULT_AVATAR = ""


def _av(url: Optional[str]) -> str:
    return url or _DEFAULT_AVATAR


def agora_uid(user_id: str) -> int:
    """Deterministic uint32 Agora UID derived from our user id, so the token
    UID and the signaling-advertised UID always match for a given user."""
    return int(hashlib.md5(user_id.encode()).hexdigest(), 16) % 2_000_000_000 + 1


class AgoraTokenBody(BaseModel):
    channel: str = Field(min_length=1, max_length=64)


class RtcHub:
    """Tracks each user's live personal sockets + active call rooms."""

    def __init__(self):
        self.users: dict[str, set[WebSocket]] = {}
        # call_id -> set(user_id) currently joined
        self.rooms: dict[str, set[str]] = {}
        # call_id -> set(user_id) allowed (the conversation's members at invite)
        self.allowed: dict[str, set[str]] = {}

    def set_allowed(self, call_id: str, member_ids):
        self.allowed[call_id] = set(member_ids)

    def is_allowed(self, call_id: str, user_id: str) -> bool:
        allow = self.allowed.get(call_id)
        # If we have no record (e.g. after restart), fall back to room membership.
        return user_id in allow if allow is not None else user_id in self.rooms.get(call_id, set())

    def in_room(self, call_id: str, user_id: str) -> bool:
        return user_id in self.rooms.get(call_id, set())

    def add(self, user_id: str, ws: WebSocket):
        self.users.setdefault(user_id, set()).add(ws)

    def remove(self, user_id: str, ws: WebSocket):
        conns = self.users.get(user_id)
        if conns:
            conns.discard(ws)
            if not conns:
                self.users.pop(user_id, None)

    def is_online(self, user_id: str) -> bool:
        return bool(self.users.get(user_id))

    async def send_to_user(self, user_id: str, payload: dict):
        for ws in list(self.users.get(user_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.remove(user_id, ws)

    def join_room(self, call_id: str, user_id: str) -> list:
        room = self.rooms.setdefault(call_id, set())
        existing = list(room)
        room.add(user_id)
        return existing

    def leave_room(self, call_id: str, user_id: str) -> list:
        room = self.rooms.get(call_id)
        if not room:
            return []
        room.discard(user_id)
        if not room:
            self.rooms.pop(call_id, None)
            self.allowed.pop(call_id, None)
            return []
        return list(room)


hub = RtcHub()


def build_router(ctx) -> APIRouter:
    global _DEFAULT_AVATAR
    _DEFAULT_AVATAR = getattr(ctx, "default_avatar_url", "") or ""
    db = ctx.db
    logger = ctx.logger
    user_from_token = ctx.user_from_token
    get_current_user = ctx.get_current_user

    router = APIRouter(tags=["calls"])

    @router.post("/api/rtc/agora-token")
    async def agora_token(body: AgoraTokenBody, current: Annotated[dict, Depends(get_current_user)]):
        """Mint a short-lived Agora RTC publisher token for a call channel.
        The UID is derived from the authenticated user (never client-supplied)."""
        if not (AGORA_APP_ID and AGORA_APP_CERTIFICATE and RtcTokenBuilder):
            raise HTTPException(503, "Calling is not configured")
        uid = agora_uid(current["id"])
        expire_at = int(time.time()) + AGORA_TOKEN_TTL
        token = RtcTokenBuilder.buildTokenWithUid(
            AGORA_APP_ID, AGORA_APP_CERTIFICATE, body.channel, uid, _ROLE_PUBLISHER, expire_at
        )
        return {"app_id": AGORA_APP_ID, "channel": body.channel, "uid": uid, "token": token, "expires_in": AGORA_TOKEN_TTL}

    @router.websocket("/api/rtc/ws")
    async def rtc_socket(websocket: WebSocket):
        token = websocket.query_params.get("token")
        user = await user_from_token(token)
        await websocket.accept()
        if not user:
            await websocket.send_json({"type": "error", "detail": "auth_required"})
            await websocket.close(code=4401)
            return
        uid = user["id"]
        hub.add(uid, websocket)
        me = {
            "id": uid,
            "username": user["username"],
            "display_name": user.get("display_name", user["username"]),
            "avatar_url": _av(user.get("avatar_url")),
            "is_verified": user.get("is_verified", False),
            "verified_color": user.get("verified_color"),
            "remembering": user.get("remembering", False),
            "equipped_frame": user.get("equipped_frame") if user.get("frame_enabled", True) else None,
            "agora_uid": agora_uid(uid),
        }
        active_calls: set[str] = set()
        try:
            await websocket.send_json({"type": "ready"})
            while True:
                data = await websocket.receive_json()
                t = data.get("type")

                if t == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue

                if t == "invite":
                    # Caller starts a call in a conversation. Verify membership,
                    # then ring every other member who is online.
                    conv_id = data.get("conv_id")
                    call_id = data.get("call_id") or str(uuid.uuid4())
                    media = "video" if data.get("media") == "video" else "audio"
                    c = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
                    if not c or uid not in c["member_ids"]:
                        await websocket.send_json({"type": "call_error", "detail": "not_a_member"})
                        continue
                    hub.set_allowed(call_id, c["member_ids"])
                    hub.join_room(call_id, uid)
                    active_calls.add(call_id)
                    is_group = len(c["member_ids"]) > 2 or bool(c.get("name"))
                    title = c.get("name") if is_group else me["display_name"]
                    others = [m for m in c["member_ids"] if m != uid]
                    ringing = [m for m in others if hub.is_online(m)]
                    invite = {
                        "type": "call_invite",
                        "call_id": call_id,
                        "conv_id": conv_id,
                        "media": media,
                        "is_group": is_group,
                        "conv_title": title,
                        "from": me,
                    }
                    for m in ringing:
                        await hub.send_to_user(m, invite)
                    await websocket.send_json({
                        "type": "call_started",
                        "call_id": call_id,
                        "conv_id": conv_id,
                        "media": media,
                        "ringing": ringing,
                        "offline": [m for m in others if m not in ringing],
                    })
                    continue

                if t == "accept":
                    # Callee accepts. Must be a member of the invited conversation.
                    call_id = data.get("call_id")
                    if not hub.is_allowed(call_id, uid):
                        await websocket.send_json({"type": "call_error", "detail": "not_invited"})
                        continue
                    existing = hub.join_room(call_id, uid)
                    active_calls.add(call_id)
                    await websocket.send_json({"type": "call_peers", "call_id": call_id, "peers": existing})
                    for peer in existing:
                        await hub.send_to_user(peer, {"type": "peer_joined", "call_id": call_id, "from": me})
                    continue

                if t in ("decline", "busy", "cancel"):
                    call_id = data.get("call_id")
                    to = data.get("to")
                    payload = {"type": t, "call_id": call_id, "from": uid}
                    if to:
                        await hub.send_to_user(to, payload)
                    else:
                        for peer in hub.leave_room(call_id, uid):
                            await hub.send_to_user(peer, payload)
                    active_calls.discard(call_id)
                    continue

                if t in ("offer", "answer", "ice"):
                    # Relay WebRTC signaling to a specific peer — only between
                    # users who have both joined this call room.
                    call_id = data.get("call_id")
                    to = data.get("to")
                    if to and hub.in_room(call_id, uid) and hub.in_room(call_id, to):
                        await hub.send_to_user(to, {
                            "type": t,
                            "call_id": call_id,
                            "from": uid,
                            "sdp": data.get("sdp"),
                            "candidate": data.get("candidate"),
                        })
                    continue

                if t in ("bye", "leave"):
                    call_id = data.get("call_id")
                    for peer in hub.leave_room(call_id, uid):
                        await hub.send_to_user(peer, {"type": "peer_left", "call_id": call_id, "from": uid})
                    active_calls.discard(call_id)
                    continue

        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning(f"rtc ws error: {e}")
        finally:
            hub.remove(uid, websocket)
            # If this socket had active calls and the user has no other sockets,
            # tell peers they left.
            if not hub.is_online(uid):
                for call_id in list(active_calls):
                    for peer in hub.leave_room(call_id, uid):
                        await hub.send_to_user(peer, {"type": "peer_left", "call_id": call_id, "from": uid})

    return router


_ = datetime  # keep import used for parity with sibling modules
