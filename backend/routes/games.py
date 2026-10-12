"""Admin-curated embedded Games hub: games catalog, per-user save/follow/play
history + privacy, and admin CRUD + game updates. Web-only (Phase 1)."""
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import wallet_core


class GameBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    play_url: str = Field(min_length=4, max_length=2000)
    icon_url: str = Field(min_length=4, max_length=2000)
    banner_url: Optional[str] = None
    description: str = Field(default="", max_length=2000)
    developer: str = Field(default="", max_length=120)
    category: str = Field(default="", max_length=60)
    is_verified: bool = True


class GameUpdateBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    message: str = Field(min_length=1, max_length=4000)


class GamePrivacyBody(BaseModel):
    visible: bool


class GameCommentBody(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    parent_id: Optional[str] = None


def build_router(ctx):
    db = ctx.db
    now = ctx.now
    get_current_user = ctx.get_current_user
    get_optional_user = ctx.get_optional_user
    router = APIRouter()

    def _require_admin(u):
        if not (u and (u.get("is_admin") or u.get("is_super_admin"))):
            raise HTTPException(403, "Admin only")

    def _iso(v):
        return v.isoformat() if isinstance(v, datetime) else v

    async def serialize_game(g, viewer_id=None):
        followers = await db.game_follows.count_documents({"game_id": g["id"]})
        out = {
            "id": g["id"],
            "name": g.get("name", ""),
            "play_url": g.get("play_url", ""),
            "icon_url": g.get("icon_url"),
            "banner_url": g.get("banner_url"),
            "description": g.get("description", ""),
            "developer": g.get("developer", ""),
            "category": g.get("category", ""),
            "is_verified": g.get("is_verified", True),
            "followers": followers,
            "created_at": _iso(g.get("created_at")),
            "saved": False,
            "following": False,
            "last_played": None,
            "activity_visible": True,
            "unseen_updates": 0,
        }
        if viewer_id:
            out["saved"] = await db.game_saves.find_one({"user_id": viewer_id, "game_id": g["id"]}) is not None
            out["following"] = await db.game_follows.find_one({"user_id": viewer_id, "game_id": g["id"]}) is not None
            play = await db.game_plays.find_one({"user_id": viewer_id, "game_id": g["id"]})
            if play:
                out["last_played"] = _iso(play.get("last_played_at"))
                out["activity_visible"] = play.get("visible", True)
            total = await db.game_updates.count_documents({"game_id": g["id"]})
            if total:
                seen = await db.game_update_seen.find_one({"user_id": viewer_id, "game_id": g["id"]})
                q = {"game_id": g["id"]}
                if seen and seen.get("last_seen_at"):
                    q["created_at"] = {"$gt": seen["last_seen_at"]}
                out["unseen_updates"] = await db.game_updates.count_documents(q)
        return out

    async def _public_users(ids):
        out = {}
        if not ids:
            return out
        proj = {"_id": 0, "id": 1, "username": 1, "display_name": 1, "avatar_url": 1, "is_verified": 1,
                "verified_color": 1, "equipped_frame": 1, "custom_frame": 1, "frame_enabled": 1,
                "is_live": 1, "remembering": 1}
        async for u in db.users.find({"id": {"$in": list(ids)}}, proj):
            out[u["id"]] = {
                "id": u["id"], "username": u.get("username"), "display_name": u.get("display_name"),
                "avatar_url": ctx.avatar_or_default(u.get("avatar_url")),
                "is_verified": bool(u.get("is_verified", False)),
                "verified_color": u.get("verified_color"),
                "equipped_frame": u.get("equipped_frame"), "custom_frame": u.get("custom_frame"),
                "frame_enabled": u.get("frame_enabled", True),
                "is_live": bool(u.get("is_live", False)),
                "remembering": bool(u.get("remembering", False)),
            }
        return out

    def _serialize_comment(c, author=None):
        a = author or {}
        return {
            "id": c["id"], "text": c.get("text", ""), "parent_id": c.get("parent_id"),
            "created_at": _iso(c.get("created_at")), "user_id": c.get("user_id"),
            "username": a.get("username", c.get("username")),
            "display_name": a.get("display_name", c.get("display_name")),
            "avatar_url": a.get("avatar_url") or ctx.avatar_or_default(c.get("avatar_url")),
            "is_verified": a.get("is_verified", c.get("is_verified", False)),
            "verified_color": a.get("verified_color", c.get("verified_color")),
            "remembering": a.get("remembering", c.get("remembering", False)),
            "equipped_frame": a.get("equipped_frame", c.get("equipped_frame")),
            "custom_frame": a.get("custom_frame", c.get("custom_frame")),
            "frame_enabled": a.get("frame_enabled", c.get("frame_enabled", True)),
        }

    # ---------- Member: catalog ----------
    @router.get("/api/games/count")
    async def games_count(viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        return {"count": await db.games.count_documents({})}

    @router.get("/api/games/recent")
    async def games_recent(current: Annotated[dict, Depends(get_current_user)]):
        plays = await db.game_plays.find({"user_id": current["id"]}).sort("last_played_at", -1).to_list(30)
        out = []
        for p in plays:
            g = await db.games.find_one({"id": p["game_id"]})
            if g:
                out.append(await serialize_game(g, current["id"]))
        return out

    @router.get("/api/games")
    async def list_games(viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        rows = await db.games.find({}).sort("created_at", -1).to_list(500)
        vid = viewer["id"] if viewer else None
        return [await serialize_game(g, vid) for g in rows]

    @router.get("/api/games/{game_id}")
    async def get_game(game_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        g = await db.games.find_one({"id": game_id})
        if not g:
            raise HTTPException(404, "Game not found")
        return await serialize_game(g, viewer["id"] if viewer else None)

    @router.get("/api/games/{game_id}/related")
    async def related_games(game_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        g = await db.games.find_one({"id": game_id})
        if not g:
            raise HTTPException(404, "Game not found")
        vid = viewer["id"] if viewer else None
        rows = []
        if g.get("category"):
            rows = await db.games.find({"category": g["category"], "id": {"$ne": game_id}}).sort("created_at", -1).to_list(12)
        if len(rows) < 6:
            seen = {r["id"] for r in rows} | {game_id}
            extra = await db.games.find({"id": {"$nin": list(seen)}}).sort("created_at", -1).to_list(12)
            rows += extra
        return [await serialize_game(r, vid) for r in rows[:12]]

    # ---------- Member: updates ----------
    @router.get("/api/games/{game_id}/updates")
    async def game_updates(game_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        rows = await db.game_updates.find({"game_id": game_id}).sort("created_at", -1).to_list(100)
        return [{"id": u["id"], "title": u["title"], "message": u["message"], "created_at": _iso(u["created_at"])} for u in rows]

    @router.post("/api/games/{game_id}/updates/seen")
    async def mark_updates_seen(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        await db.game_update_seen.update_one(
            {"user_id": current["id"], "game_id": game_id},
            {"$set": {"last_seen_at": now()}},
            upsert=True,
        )
        return {"ok": True}

    # ---------- Member: save / follow / play / privacy ----------
    @router.post("/api/games/{game_id}/save")
    async def toggle_save(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        if not await db.games.find_one({"id": game_id}):
            raise HTTPException(404, "Game not found")
        existing = await db.game_saves.find_one({"user_id": current["id"], "game_id": game_id})
        if existing:
            await db.game_saves.delete_one({"user_id": current["id"], "game_id": game_id})
            return {"saved": False}
        await db.game_saves.insert_one({"id": str(uuid.uuid4()), "user_id": current["id"], "game_id": game_id, "created_at": now()})
        return {"saved": True}

    @router.post("/api/games/{game_id}/follow")
    async def toggle_follow(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        if not await db.games.find_one({"id": game_id}):
            raise HTTPException(404, "Game not found")
        existing = await db.game_follows.find_one({"user_id": current["id"], "game_id": game_id})
        if existing:
            await db.game_follows.delete_one({"user_id": current["id"], "game_id": game_id})
            following = False
        else:
            await db.game_follows.insert_one({"id": str(uuid.uuid4()), "user_id": current["id"], "game_id": game_id, "created_at": now()})
            following = True
        followers = await db.game_follows.count_documents({"game_id": game_id})
        return {"following": following, "followers": followers}

    @router.post("/api/games/{game_id}/play")
    async def register_play(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        if not await db.games.find_one({"id": game_id}):
            raise HTTPException(404, "Game not found")
        await db.game_plays.update_one(
            {"user_id": current["id"], "game_id": game_id},
            {"$set": {"last_played_at": now()}, "$setOnInsert": {"id": str(uuid.uuid4()), "visible": True}},
            upsert=True,
        )
        return {"ok": True}

    @router.post("/api/games/{game_id}/earn")
    async def earn_tokens(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        """Heartbeat from the IN-APP player: credits metered play tokens. Only the
        embedded player calls this, so games opened in a new tab earn nothing.
        Server validates timing (anti-idle / anti-spam) and a rolling-20h cap."""
        game = await db.games.find_one({"id": game_id})
        if not game:
            raise HTTPException(404, "Game not found")
        uid = current["id"]
        now_dt = now()
        play = await db.game_plays.find_one({"user_id": uid, "game_id": game_id})
        last = play.get("last_earn_at") if play else None
        granted, status, set_clock = 0, "started", True
        if last is not None:
            if getattr(last, "tzinfo", None) is None:
                last = last.replace(tzinfo=timezone.utc)
            elapsed = (now_dt - last).total_seconds()
            if elapsed > 120:
                status = "resumed"      # long gap (tab hidden/away) — reset clock, no credit
            elif elapsed < 50:
                status, set_clock = "throttled", False  # ticked too soon — keep the clock running
            else:
                status = "earned"
                res = await wallet_core.grant_game_play(
                    db, now, uid, wallet_core.GAME_PLAY_EARN_PER_MIN,
                    note=f"Played {game.get('name', 'a game')}",
                )
                granted = res["granted"]
                if granted == 0 and res["remaining"] == 0:
                    status = "capped"
        update = {"$set": {"last_played_at": now_dt}, "$setOnInsert": {"id": str(uuid.uuid4()), "visible": True}}
        if set_clock:
            update["$set"]["last_earn_at"] = now_dt
        await db.game_plays.update_one({"user_id": uid, "game_id": game_id}, update, upsert=True)
        earned_window = await wallet_core.kind_earned_recently(db, now_dt, uid, wallet_core.GAME_PLAY_KIND)
        return {
            "granted": granted,
            "status": status,
            "balance": await wallet_core.get_balance(db, uid),
            "rate_per_min": wallet_core.GAME_PLAY_EARN_PER_MIN,
            "earned_today": earned_window,
            "daily_cap": wallet_core.GAME_PLAY_DAILY_CAP,
            "remaining": max(0, wallet_core.GAME_PLAY_DAILY_CAP - earned_window),
        }

    @router.post("/api/games/{game_id}/privacy")
    async def set_privacy(game_id: str, body: GamePrivacyBody, current: Annotated[dict, Depends(get_current_user)]):
        await db.game_plays.update_one(
            {"user_id": current["id"], "game_id": game_id},
            {"$set": {"visible": body.visible}, "$setOnInsert": {"id": str(uuid.uuid4()), "last_played_at": now()}},
            upsert=True,
        )
        return {"activity_visible": body.visible}

    # ---------- Member: community (followers / players / comments) ----------
    @router.get("/api/games/{game_id}/followers")
    async def game_followers(game_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        rows = await db.game_follows.find({"game_id": game_id}).sort("created_at", -1).to_list(300)
        ids = [r["user_id"] for r in rows]
        users = await _public_users(set(ids))
        return {"count": len(ids), "users": [users[i] for i in ids if i in users]}

    @router.get("/api/games/{game_id}/players")
    async def game_players(game_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        rows = await db.game_plays.find({"game_id": game_id, "visible": {"$ne": False}}).sort("last_played_at", -1).to_list(300)
        ids = [r["user_id"] for r in rows]
        users = await _public_users(set(ids))
        out = []
        for r in rows:
            u = users.get(r["user_id"])
            if u:
                out.append({**u, "last_played": _iso(r.get("last_played_at"))})
        return {"count": len(out), "users": out}

    @router.get("/api/games/{game_id}/comments")
    async def game_comments(game_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        rows = await db.game_comments.find({"game_id": game_id}).sort("created_at", -1).to_list(400)
        users = await _public_users({c.get("user_id") for c in rows if c.get("user_id")})
        return [_serialize_comment(c, users.get(c.get("user_id"))) for c in rows]

    @router.post("/api/games/{game_id}/comments", status_code=201)
    async def create_game_comment(game_id: str, body: GameCommentBody, current: Annotated[dict, Depends(get_current_user)]):
        if not await db.games.find_one({"id": game_id}):
            raise HTTPException(404, "Game not found")
        parent_id = None
        if body.parent_id:
            parent = await db.game_comments.find_one({"id": body.parent_id, "game_id": game_id})
            if not parent:
                raise HTTPException(404, "Parent comment not found")
            parent_id = parent.get("parent_id") or parent["id"]
        doc = {
            "id": str(uuid.uuid4()), "game_id": game_id, "parent_id": parent_id,
            "user_id": current["id"], "username": current.get("username"),
            "display_name": current.get("display_name"),
            "avatar_url": ctx.avatar_or_default(current.get("avatar_url")),
            "is_verified": bool(current.get("is_verified", False)),
            "verified_color": current.get("verified_color"),
            "remembering": bool(current.get("remembering", False)),
            "equipped_frame": current.get("equipped_frame"), "custom_frame": current.get("custom_frame"),
            "frame_enabled": current.get("frame_enabled", True),
            "text": body.text.strip(), "created_at": now(),
        }
        await db.game_comments.insert_one(doc)
        return _serialize_comment(doc)

    @router.delete("/api/games/{game_id}/comments/{comment_id}")
    async def delete_game_comment(game_id: str, comment_id: str, current: Annotated[dict, Depends(get_current_user)]):
        c = await db.game_comments.find_one({"id": comment_id, "game_id": game_id})
        if not c:
            raise HTTPException(404, "Comment not found")
        if c.get("user_id") != current["id"] and not (current.get("is_admin") or current.get("is_super_admin")):
            raise HTTPException(403, "Not allowed")
        removed = 1
        if not c.get("parent_id"):
            rep = await db.game_comments.delete_many({"parent_id": comment_id, "game_id": game_id})
            removed += rep.deleted_count
        await db.game_comments.delete_one({"id": comment_id, "game_id": game_id})
        return {"removed": removed}

    # ---------- Admin: CRUD ----------
    @router.get("/api/admin/games")
    async def admin_list_games(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        rows = await db.games.find({}).sort("created_at", -1).to_list(500)
        out = []
        for g in rows:
            s = await serialize_game(g, current["id"])
            s["updates_count"] = await db.game_updates.count_documents({"game_id": g["id"]})
            out.append(s)
        return out

    @router.post("/api/admin/games", status_code=201)
    async def create_game(body: GameBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        doc = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "play_url": body.play_url.strip(),
            "icon_url": body.icon_url.strip(),
            "banner_url": (body.banner_url or "").strip() or None,
            "description": body.description.strip(),
            "developer": body.developer.strip(),
            "category": body.category.strip(),
            "is_verified": body.is_verified,
            "created_at": now(),
            "updated_at": now(),
        }
        await db.games.insert_one(doc)
        return await serialize_game(doc, current["id"])

    @router.patch("/api/admin/games/{game_id}")
    async def update_game(game_id: str, body: GameBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        g = await db.games.find_one({"id": game_id})
        if not g:
            raise HTTPException(404, "Game not found")
        await db.games.update_one({"id": game_id}, {"$set": {
            "name": body.name.strip(),
            "play_url": body.play_url.strip(),
            "icon_url": body.icon_url.strip(),
            "banner_url": (body.banner_url or "").strip() or None,
            "description": body.description.strip(),
            "developer": body.developer.strip(),
            "category": body.category.strip(),
            "is_verified": body.is_verified,
            "updated_at": now(),
        }})
        g = await db.games.find_one({"id": game_id})
        return await serialize_game(g, current["id"])

    @router.delete("/api/admin/games/{game_id}")
    async def delete_game(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.games.delete_one({"id": game_id})
        for coll in ("game_updates", "game_follows", "game_saves", "game_plays", "game_update_seen", "game_comments"):
            await db[coll].delete_many({"game_id": game_id})
        return {"status": "deleted"}

    # ---------- Admin: game updates ----------
    @router.post("/api/admin/games/{game_id}/updates", status_code=201)
    async def create_update(game_id: str, body: GameUpdateBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        if not await db.games.find_one({"id": game_id}):
            raise HTTPException(404, "Game not found")
        doc = {"id": str(uuid.uuid4()), "game_id": game_id, "title": body.title.strip(), "message": body.message.strip(), "created_at": now()}
        await db.game_updates.insert_one(doc)
        return {"id": doc["id"], "title": doc["title"], "message": doc["message"], "created_at": _iso(doc["created_at"])}

    @router.delete("/api/admin/games/{game_id}/updates/{update_id}")
    async def delete_update(game_id: str, update_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.game_updates.delete_one({"id": update_id, "game_id": game_id})
        return {"status": "deleted"}

    return router
