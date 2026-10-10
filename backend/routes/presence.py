"""Presence — who's active right now among mutual-follow friends.

A lightweight heartbeat model (no WebSocket): clients POST /presence/ping every
~45s while the app is open. We store `last_active_at` on the user. The active
list returns friends you MUTUALLY follow (both directions) who pinged recently.

Reciprocal privacy: if the caller has turned on "appear offline", they neither
broadcast their status nor see anyone else's (standard social-app behavior).

NOTE: intentionally avoids `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends

ONLINE_WINDOW = 120       # seconds → counts as "active now" (live green dot)
RECENT_WINDOW = 15 * 60   # seconds → still surfaced as "active Xm ago"


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    get_current_user = ctx.get_current_user
    avatar_or_default = ctx.avatar_or_default
    blocked_ids_for = ctx.blocked_ids_for

    router = APIRouter(tags=["presence"])

    def _aware(t):
        if isinstance(t, datetime):
            return t if t.tzinfo is not None else t.replace(tzinfo=timezone.utc)
        return None

    @router.post("/api/presence/ping")
    async def presence_ping(current: Annotated[dict, Depends(get_current_user)]):
        """Heartbeat — mark the current user as active right now."""
        await db.users.update_one({"id": current["id"]}, {"$set": {"last_active_at": now()}})
        return {"status": "ok"}

    @router.get("/api/presence/active")
    async def active_friends(current: Annotated[dict, Depends(get_current_user)]):
        """Mutually-followed friends active within the recent window.
        Each friend carries `online` (within 2 min) vs recent ("active Xm ago")."""
        me = current["id"]
        # Reciprocal privacy: if I'm invisible, I don't see others either.
        if current.get("appear_offline"):
            return {"appear_offline": True, "friends": []}

        i_follow_rows = await db.follows.find({"follower_id": me}, {"_id": 0, "followee_id": 1}).to_list(10000)
        follow_me_rows = await db.follows.find({"followee_id": me}, {"_id": 0, "follower_id": 1}).to_list(10000)
        mutual = {r["followee_id"] for r in i_follow_rows} & {r["follower_id"] for r in follow_me_rows}
        if not mutual:
            return {"appear_offline": False, "friends": []}

        blocked = await blocked_ids_for(me)
        ids = [u for u in mutual if u not in blocked]
        if not ids:
            return {"appear_offline": False, "friends": []}

        cutoff = now() - timedelta(seconds=RECENT_WINDOW)
        rows = await db.users.find(
            {"id": {"$in": ids}, "appear_offline": {"$ne": True}, "last_active_at": {"$gte": cutoff}},
            {"_id": 0, "id": 1, "username": 1, "display_name": 1, "avatar_url": 1,
             "is_verified": 1, "verified_color": 1, "last_active_at": 1},
        ).to_list(200)

        online_cut = now() - timedelta(seconds=ONLINE_WINDOW)
        friends = []
        for u in rows:
            la = _aware(u.get("last_active_at"))
            if not la:
                continue
            friends.append({
                "id": u["id"],
                "username": u["username"],
                "display_name": u["display_name"],
                "avatar_url": avatar_or_default(u.get("avatar_url")),
                "is_verified": bool(u.get("is_verified", False)),
                "verified_color": u.get("verified_color"),
                "online": la >= online_cut,
                "last_active_at": la.isoformat(),
            })
        # Online first, then most-recently active.
        friends.sort(key=lambda f: f["last_active_at"], reverse=True)
        friends.sort(key=lambda f: not f["online"])
        return {"appear_offline": False, "friends": friends}

    return router
