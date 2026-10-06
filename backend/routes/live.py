"""Live streaming router — TikTok-style livestream.

Two layers:
1. Video control plane (Cloudflare Stream Live): create/stop live inputs and
   hand the broadcaster a WHIP publish URL + viewers a WHEP/HLS playback URL.
   Requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN in the env. When those
   are absent the stream is created in "demo" mode (no video) so the real-time
   interactive layer still works end-to-end in preview.
2. Real-time interactive layer (our own WebSocket): live chat, floating hearts,
   virtual gifts and a live viewer counter — runs on our infra, no provider.

NOTE: this module intentionally avoids `from __future__ import annotations`
(postponed annotations break closure-local `Depends` in these routers).
"""
import os
import uuid
from datetime import datetime
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import settings_store
import wallet_core

CF_BASE = "https://api.cloudflare.com/client/v4"

_DEFAULT_AVATAR = ""


def _av(url: Optional[str]) -> str:
    return url or _DEFAULT_AVATAR


# Free animated gifts (glyphs are gift CONTENT, not app iconography).
GIFTS = [
    {"id": "rose", "name": "Rose", "glyph": "🌹", "coins": 1, "color": "#f43f5e"},
    {"id": "heart", "name": "Heart", "glyph": "❤️", "coins": 1, "color": "#ef4444"},
    {"id": "star", "name": "Star", "glyph": "⭐", "coins": 5, "color": "#f59e0b"},
    {"id": "fire", "name": "Fire", "glyph": "🔥", "coins": 10, "color": "#fb923c"},
    {"id": "rocket", "name": "Rocket", "glyph": "🚀", "coins": 20, "color": "#6366f1"},
    {"id": "crown", "name": "Crown", "glyph": "👑", "coins": 50, "color": "#eab308"},
    {"id": "diamond", "name": "Diamond", "glyph": "💎", "coins": 100, "color": "#06b6d4"},
]
GIFTS_BY_ID = {g["id"]: g for g in GIFTS}


class CreateLiveBody(BaseModel):
    title: str = Field(default="Live", max_length=120)
    mode: str = Field(default="webrtc")  # "webrtc" (low latency) | "hls" (scale)
    audio_only: bool = False             # audio room — viewers see a pulsing avatar, no video
    visibility: str = Field(default="public")  # "public" | "followers"
    chat_enabled: bool = True
    gifts_enabled: bool = True


class LiveHub:
    """In-memory fan-out of WebSocket connections per stream."""

    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}

    def add(self, sid: str, ws: WebSocket):
        self.rooms.setdefault(sid, set()).add(ws)

    def remove(self, sid: str, ws: WebSocket):
        conns = self.rooms.get(sid)
        if conns:
            conns.discard(ws)
            if not conns:
                self.rooms.pop(sid, None)

    def count(self, sid: str) -> int:
        return len(self.rooms.get(sid, ()))

    async def broadcast(self, sid: str, payload: dict):
        for ws in list(self.rooms.get(sid, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.remove(sid, ws)


hub = LiveHub()


async def _cf(method: str, path: str, json: Optional[dict] = None):
    headers = {"Authorization": f"Bearer {settings_store.get('CLOUDFLARE_API_TOKEN')}", "Content-Type": "application/json"}
    url = f"{CF_BASE}/accounts/{settings_store.get('CLOUDFLARE_ACCOUNT_ID')}{path}"
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.request(method, url, headers=headers, json=json)
    data = r.json()
    if r.status_code >= 400 or not data.get("success"):
        raise HTTPException(502, f"Streaming provider error: {data.get('errors') or r.status_code}")
    return data["result"]


def build_router(ctx) -> APIRouter:
    global _DEFAULT_AVATAR
    _DEFAULT_AVATAR = getattr(ctx, "default_avatar_url", "") or ""
    db = ctx.db
    now = ctx.now
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    user_from_token = ctx.user_from_token
    send_push = getattr(ctx, "send_push", None)
    send_web_push = getattr(ctx, "send_web_push", None)

    router = APIRouter(tags=["live"])

    def public_stream(s: dict) -> dict:
        return {
            "id": s["id"],
            "title": s.get("title", "Live"),
            "mode": s.get("mode", "webrtc"),
            "audio_only": bool(s.get("audio_only", False)),
            "visibility": s.get("visibility", "public"),
            "chat_enabled": bool(s.get("chat_enabled", True)),
            "gifts_enabled": bool(s.get("gifts_enabled", True)),
            "status": s.get("status", "live"),
            "has_video": bool(not s.get("audio_only", False) and (s.get("whep_url") or s.get("hls_url"))),
            "whep_url": s.get("whep_url"),
            "hls_url": s.get("hls_url"),
            "viewer_count": hub.count(s["id"]) if s.get("status") == "live" else 0,
            "hearts": s.get("hearts", 0),
            "featured": bool(s.get("featured", False)),
            "owner": {
                "id": s.get("owner_id"),
                "username": s.get("owner_username"),
                "display_name": s.get("owner_display_name"),
                "avatar_url": _av(s.get("owner_avatar")),
                "is_verified": s.get("owner_verified", False),
                "verified_color": s.get("owner_verified_color"),
            },
            "created_at": s["created_at"].isoformat() if isinstance(s.get("created_at"), datetime) else s.get("created_at"),
        }

    @router.get("/api/live/gifts")
    async def list_gifts():
        return GIFTS

    @router.get("/api/live")
    async def list_live(current: Annotated[dict, Depends(get_current_user)]):
        rows = await db.live_streams.find({"status": "live"}, {"_id": 0}).sort("created_at", -1).to_list(100)
        rows.sort(key=lambda s: not s.get("featured", False))
        return [public_stream(s) for s in rows]

    @router.post("/api/live")
    async def create_live(body: CreateLiveBody, current: Annotated[dict, Depends(get_current_user)]):
        # One active stream per user: end any previous.
        await db.live_streams.update_many(
            {"owner_id": current["id"], "status": "live"},
            {"$set": {"status": "ended", "ended_at": now()}},
        )
        mode = body.mode if body.mode in ("webrtc", "hls") else "webrtc"
        if body.audio_only:
            mode = "webrtc"  # audio rooms always use low-latency WebRTC ingest
        whip_url = whep_url = hls_url = input_id = None
        provider_ok = False
        if settings_store.get("CLOUDFLARE_ACCOUNT_ID") and settings_store.get("CLOUDFLARE_API_TOKEN"):
            payload: dict = {"meta": {"name": body.title, "owner": current["id"]}, "preferLowLatency": True}
            if mode == "hls":
                payload["recording"] = {"mode": "automatic"}
            try:
                res = await _cf("POST", "/stream/live_inputs", json=payload)
                input_id = res["uid"]
                if mode == "webrtc":
                    whip_url = (res.get("webRTC") or {}).get("url")
                    whep_url = (res.get("webRTCPlayback") or {}).get("url")
                else:
                    hls_url = (res.get("playback") or {}).get("hls")
                provider_ok = True
            except Exception as e:
                # Keys present but not usable yet (token invalid / Stream not enabled).
                # Fall back to demo mode so the interactive layer still works.
                logger.warning(f"Cloudflare live input creation failed, using demo mode: {e}")
        doc = {
            "id": str(uuid.uuid4()),
            "owner_id": current["id"],
            "owner_username": current["username"],
            "owner_display_name": current.get("display_name", current["username"]),
            "owner_avatar": _av(current.get("avatar_url")),
            "owner_verified": current.get("is_verified", False),
            "owner_verified_color": current.get("verified_color"),
            "title": body.title,
            "mode": mode,
            "audio_only": bool(body.audio_only),
            "visibility": body.visibility if body.visibility in ("public", "followers") else "public",
            "chat_enabled": bool(body.chat_enabled),
            "gifts_enabled": bool(body.gifts_enabled),
            "input_id": input_id,           # provider handle (never returned publicly)
            "whep_url": whep_url,            # viewer WebRTC playback (safe to share)
            "hls_url": hls_url,              # viewer HLS playback (safe to share)
            "status": "live",
            "hearts": 0,
            "peak_viewers": 0,
            "created_at": now(),
            "ended_at": None,
        }
        await db.live_streams.insert_one(doc)
        # Mark the creator live everywhere (profile banner + avatar ring app-wide).
        await db.users.update_one({"id": current["id"]}, {"$set": {"is_live": True, "live_stream_id": doc["id"]}})
        # Notify followers that this creator just went live.
        try:
            frows = await db.follows.find({"followee_id": current["id"]}, {"_id": 0, "follower_id": 1}).to_list(100000)
            follower_ids = [r["follower_id"] for r in frows]
            for fid in follower_ids:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": fid,
                    "type": "live",
                    "actor_id": current["id"],
                    "actor_name": current.get("display_name", current["username"]),
                    "actor_avatar": _av(current.get("avatar_url")),
                    "text": "is live now — tap to watch",
                    "link": f"/live/{doc['id']}",
                    "live_stream_id": doc["id"],
                    "read": False,
                    "created_at": now(),
                })
            if follower_ids and send_push:
                await send_push(
                    recipients=follower_ids,
                    data={"title": f"{current.get('display_name', current['username'])} is live!",
                          "message": "Tap to join the stream.", "action_url": f"/live/{doc['id']}"},
                )
            if follower_ids and send_web_push:
                for fid in follower_ids:
                    await send_web_push(fid, f"{current.get('display_name', current['username'])} is live!",
                                        "Tap to join the stream.", f"/live/{doc['id']}")
        except Exception as e:
            logger.warning(f"live notify failed (non-blocking): {e}")
        out = public_stream(doc)
        out["whip_url"] = whip_url  # publish credential — only ever to the owner, at creation
        out["is_owner"] = True
        out["provider_configured"] = provider_ok
        return out

    @router.get("/api/live/{stream_id}")
    async def get_live(stream_id: str, current: Annotated[dict, Depends(get_current_user)]):
        s = await db.live_streams.find_one({"id": stream_id}, {"_id": 0})
        if not s:
            raise HTTPException(404, "Stream not found")
        is_owner = s.get("owner_id") == current["id"]
        if s.get("visibility") == "followers" and not is_owner:
            follows = await db.follows.find_one({"follower_id": current["id"], "followee_id": s.get("owner_id")})
            if not follows:
                raise HTTPException(403, "This is a followers-only live — follow to watch")
        out = public_stream(s)
        out["is_owner"] = is_owner
        return out

    @router.get("/api/live/{stream_id}/chat")
    async def chat_history(stream_id: str, current: Annotated[dict, Depends(get_current_user)]):
        rows = await db.live_chat.find({"stream_id": stream_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
        for m in rows:
            if isinstance(m.get("created_at"), datetime):
                m["created_at"] = m["created_at"].isoformat()
        return rows

    @router.post("/api/live/{stream_id}/stop")
    async def stop_live(stream_id: str, current: Annotated[dict, Depends(get_current_user)]):
        s = await db.live_streams.find_one({"id": stream_id})
        if not s:
            raise HTTPException(404, "Stream not found")
        if s.get("owner_id") != current["id"]:
            raise HTTPException(403, "Only the broadcaster can end this stream")
        if s.get("input_id") and settings_store.get("CLOUDFLARE_ACCOUNT_ID") and settings_store.get("CLOUDFLARE_API_TOKEN"):
            try:
                await _cf("PUT", f"/stream/live_inputs/{s['input_id']}", json={"enabled": False})
            except Exception as e:
                logger.warning(f"Cloudflare stop failed: {e}")
        await db.live_streams.update_one({"id": stream_id}, {"$set": {"status": "ended", "ended_at": now()}})
        await db.users.update_one({"id": current["id"]}, {"$set": {"is_live": False, "live_stream_id": None}})
        await hub.broadcast(stream_id, {"type": "ended"})
        return {"status": "ended"}

    @router.websocket("/api/live/{stream_id}/ws")
    async def live_socket(websocket: WebSocket, stream_id: str):
        token = websocket.query_params.get("token")
        user = await user_from_token(token)
        await websocket.accept()
        if not user:
            await websocket.send_json({"type": "error", "detail": "auth_required"})
            await websocket.close(code=4401)
            return
        s = await db.live_streams.find_one({"id": stream_id})
        if not s or s.get("status") != "live":
            await websocket.send_json({"type": "error", "detail": "stream_not_live"})
            await websocket.close(code=4404)
            return

        hub.add(stream_id, websocket)
        me = {
            "user_id": user["id"],
            "username": user["username"],
            "display_name": user.get("display_name", user["username"]),
            "avatar_url": _av(user.get("avatar_url")),
            "is_verified": user.get("is_verified", False),
            "verified_color": user.get("verified_color"),
            "remembering": user.get("remembering", False),
        }
        try:
            # Backlog to the joiner.
            backlog = await db.live_chat.find({"stream_id": stream_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
            for m in backlog:
                if isinstance(m.get("created_at"), datetime):
                    m["created_at"] = m["created_at"].isoformat()
            bal = await wallet_core.get_balance(db, me["user_id"])
            await websocket.send_json({"type": "init", "chat": backlog, "hearts": s.get("hearts", 0), "gifts": GIFTS, "balance": bal})
            count = hub.count(stream_id)
            await db.live_streams.update_one(
                {"id": stream_id},
                {"$set": {"viewer_count": count}, "$max": {"peak_viewers": count}},
            )
            await hub.broadcast(stream_id, {"type": "viewers", "count": count})
            await hub.broadcast(stream_id, {"type": "system", "text": f"{me['display_name']} joined"})

            while True:
                data = await websocket.receive_json()
                t = data.get("type")
                if t == "ping":
                    await websocket.send_json({"type": "pong"})
                elif t == "chat":
                    if not s.get("chat_enabled", True):
                        continue
                    text = str(data.get("text", "")).strip()[:500]
                    if not text:
                        continue
                    msg = {
                        "id": str(uuid.uuid4()),
                        "stream_id": stream_id,
                        "kind": "chat",
                        **me,
                        "text": text,
                        "created_at": now(),
                    }
                    await db.live_chat.insert_one(dict(msg))
                    msg["created_at"] = msg["created_at"].isoformat()
                    msg.pop("_id", None)
                    await hub.broadcast(stream_id, {"type": "chat", "message": msg})
                elif t == "heart":
                    await db.live_streams.update_one({"id": stream_id}, {"$inc": {"hearts": 1}})
                    await hub.broadcast(stream_id, {"type": "heart", "user_id": me["user_id"]})
                elif t == "gift":
                    if not s.get("gifts_enabled", True):
                        await websocket.send_json({"type": "error", "detail": "gifts_disabled"})
                        continue
                    gift = GIFTS_BY_ID.get(str(data.get("gift_id")))
                    if not gift:
                        continue
                    cost = int(gift.get("coins", 0))
                    # Charge the sender; credit the broadcaster. Never overdraw.
                    new_bal = await wallet_core.spend(
                        db, now, me["user_id"], cost, "gift_sent",
                        f"Gift {gift['name']} to @{s.get('owner_username', '')}")
                    if new_bal is None:
                        await websocket.send_json({"type": "error", "detail": "insufficient_tokens"})
                        continue
                    owner_id = s.get("owner_id")
                    if owner_id and owner_id != me["user_id"] and cost > 0:
                        await wallet_core.grant(db, now, owner_id, cost, "gift_received",
                                                f"Gift {gift['name']} from @{me['username']}")
                    await websocket.send_json({"type": "wallet", "balance": new_bal})
                    msg = {
                        "id": str(uuid.uuid4()),
                        "stream_id": stream_id,
                        "kind": "gift",
                        **me,
                        "text": f"sent {gift['name']}",
                        "gift": gift,
                        "created_at": now(),
                    }
                    await db.live_chat.insert_one(dict(msg))
                    msg["created_at"] = msg["created_at"].isoformat()
                    msg.pop("_id", None)
                    await hub.broadcast(stream_id, {"type": "gift", "message": msg})
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning(f"live ws error: {e}")
        finally:
            hub.remove(stream_id, websocket)
            count = hub.count(stream_id)
            await db.live_streams.update_one({"id": stream_id}, {"$set": {"viewer_count": count}})
            await hub.broadcast(stream_id, {"type": "viewers", "count": count})

    return router
