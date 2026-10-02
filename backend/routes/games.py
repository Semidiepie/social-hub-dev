"""Games router — PostMePlex arcade.

A pluggable games hub. The first game kind is `match3` (a Candy-Crush-style
match-3). Games are admin-managed documents (title, tile theme, level count,
difficulty); per-level parameters (target score, moves, star thresholds) are
derived deterministically from the game config so there's a single source of
truth shared by every player. Per-user progress (unlocked level, stars, best
score) is persisted so the saga-style level map resumes where you left off.

NOTE: intentionally NO `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

# Default PostMePlex-themed match-3 tile set (lucide icon name + brand color).
DEFAULT_TILES = [
    {"id": "zap", "icon": "Zap", "color": "#FF6B3D"},
    {"id": "heart", "icon": "Heart", "color": "#FF4D6D"},
    {"id": "chat", "icon": "MessageCircle", "color": "#4FC3F7"},
    {"id": "camera", "icon": "Camera", "color": "#A78BFA"},
    {"id": "star", "icon": "Star", "color": "#FFD166"},
    {"id": "note", "icon": "Music", "color": "#2DD4BF"},
]

DEFAULT_GAME = {
    "slug": "postmeplex-match",
    "title": "PostMePlex Match",
    "description": "Swap and match three or more PostMePlex icons to clear the board. Chain combos, build boosters and beat the target before you run out of moves!",
    "kind": "match3",
    "cover_emoji": "⚡",
    "tiles": DEFAULT_TILES,
    "level_count": 30,
    "base_moves": 28,
    "base_target": 1500,
    "difficulty": 1.0,
    "is_active": True,
    "sort": 0,
}


def level_params(game: dict, n: int) -> dict:
    """Deterministic per-level config derived from the game. Shared by client
    (to render the level) and server (to validate the submitted score)."""
    n = max(1, int(n))
    base_target = int(game.get("base_target", 1500))
    base_moves = int(game.get("base_moves", 28))
    difficulty = float(game.get("difficulty", 1.0))
    step = round(base_target * 0.55 * difficulty)
    target = base_target + (n - 1) * step
    moves = max(12, base_moves - (n // 4))
    types = max(4, min(6, len(game.get("tiles", DEFAULT_TILES))))
    # Slightly fewer colors early = easier; ramps to full palette.
    colors = min(types, 4 + (n // 8))
    return {
        "level": n,
        "target": target,
        "star2": round(target * 1.5),
        "star3": round(target * 2.0),
        "moves": moves,
        "rows": 8,
        "cols": 8,
        "colors": colors,
    }


def stars_for(params: dict, score: int) -> int:
    if score >= params["star3"]:
        return 3
    if score >= params["star2"]:
        return 2
    if score >= params["target"]:
        return 1
    return 0


class CreateGameBody(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=400)
    tiles: Optional[list] = None
    cover_emoji: str = Field(default="🎮", max_length=8)
    level_count: int = Field(default=30, ge=1, le=500)
    base_moves: int = Field(default=28, ge=8, le=80)
    base_target: int = Field(default=1500, ge=200, le=100000)
    difficulty: float = Field(default=1.0, ge=0.3, le=4.0)
    is_active: bool = True


class UpdateGameBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=60)
    description: Optional[str] = Field(default=None, max_length=400)
    tiles: Optional[list] = None
    cover_emoji: Optional[str] = Field(default=None, max_length=8)
    level_count: Optional[int] = Field(default=None, ge=1, le=500)
    base_moves: Optional[int] = Field(default=None, ge=8, le=80)
    base_target: Optional[int] = Field(default=None, ge=200, le=100000)
    difficulty: Optional[float] = Field(default=None, ge=0.3, le=4.0)
    is_active: Optional[bool] = None


class CompleteBody(BaseModel):
    score: int = Field(ge=0)


def _public_game(g: dict) -> dict:
    return {
        "id": g["id"],
        "slug": g["slug"],
        "title": g["title"],
        "description": g.get("description", ""),
        "kind": g.get("kind", "match3"),
        "cover_emoji": g.get("cover_emoji", "🎮"),
        "tiles": g.get("tiles", DEFAULT_TILES),
        "level_count": g.get("level_count", 30),
        "base_moves": g.get("base_moves", 28),
        "base_target": g.get("base_target", 1500),
        "difficulty": g.get("difficulty", 1.0),
        "is_active": g.get("is_active", True),
    }


async def seed_default_game(db, now):
    existing = await db.games.find_one({"slug": DEFAULT_GAME["slug"]})
    if existing:
        return
    await db.games.insert_one({"id": str(uuid.uuid4()), "created_at": now(), **DEFAULT_GAME})


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    get_current_user = ctx.get_current_user
    get_optional_user = ctx.get_optional_user
    router = APIRouter(tags=["games"])

    def _require_admin(current):
        if not current.get("is_super_admin"):
            raise HTTPException(403, "Admins only")

    async def _progress(user_id: str, game_id: str) -> dict:
        p = await db.game_progress.find_one({"user_id": user_id, "game_id": game_id}, {"_id": 0})
        if not p:
            return {"unlocked": 1, "levels": {}}
        return {"unlocked": p.get("unlocked", 1), "levels": p.get("levels", {})}

    # ---------- Public ----------
    @router.get("/api/games")
    async def list_games(current: Annotated[Optional[dict], Depends(get_optional_user)] = None):
        rows = await db.games.find({"is_active": True}, {"_id": 0}).sort("sort", 1).to_list(100)
        out = []
        for g in rows:
            item = _public_game(g)
            if current:
                pr = await _progress(current["id"], g["id"])
                levels = pr["levels"]
                item["progress"] = {
                    "unlocked": pr["unlocked"],
                    "completed": sum(1 for v in levels.values() if v.get("completed")),
                    "stars": sum(int(v.get("stars", 0)) for v in levels.values()),
                }
            out.append(item)
        return out

    @router.get("/api/games/{slug}")
    async def get_game(slug: str, current: Annotated[Optional[dict], Depends(get_optional_user)] = None):
        g = await db.games.find_one({"slug": slug}, {"_id": 0})
        if not g or not g.get("is_active", True):
            raise HTTPException(404, "Game not found")
        item = _public_game(g)
        item["progress"] = await _progress(current["id"], g["id"]) if current else {"unlocked": 1, "levels": {}}
        return item

    @router.get("/api/games/{slug}/levels/{n}")
    async def get_level(slug: str, n: int, current: Annotated[Optional[dict], Depends(get_optional_user)] = None):
        g = await db.games.find_one({"slug": slug}, {"_id": 0})
        if not g or not g.get("is_active", True):
            raise HTTPException(404, "Game not found")
        if n < 1 or n > g.get("level_count", 30):
            raise HTTPException(404, "Level not found")
        return {"game_id": g["id"], "tiles": g.get("tiles", DEFAULT_TILES), **level_params(g, n)}

    @router.post("/api/games/{slug}/levels/{n}/complete")
    async def complete_level(slug: str, n: int, body: CompleteBody, current: Annotated[dict, Depends(get_current_user)]):
        g = await db.games.find_one({"slug": slug}, {"_id": 0})
        if not g or not g.get("is_active", True):
            raise HTTPException(404, "Game not found")
        if n < 1 or n > g.get("level_count", 30):
            raise HTTPException(404, "Level not found")
        params = level_params(g, n)
        # Clamp to a sane ceiling to reject absurd client scores.
        score = min(int(body.score), params["star3"] * 6)
        earned = stars_for(params, score)
        won = earned >= 1
        pr = await _progress(current["id"], g["id"])
        levels = pr["levels"]
        key = str(n)
        prev = levels.get(key, {})
        levels[key] = {
            "stars": max(int(prev.get("stars", 0)), earned),
            "best": max(int(prev.get("best", 0)), score),
            "completed": bool(prev.get("completed")) or won,
        }
        unlocked = pr["unlocked"]
        if won and n + 1 <= g.get("level_count", 30):
            unlocked = max(unlocked, n + 1)
        await db.game_progress.update_one(
            {"user_id": current["id"], "game_id": g["id"]},
            {"$set": {"unlocked": unlocked, "levels": levels, "updated_at": now()},
             "$setOnInsert": {"id": str(uuid.uuid4()), "user_id": current["id"], "game_id": g["id"]}},
            upsert=True,
        )
        return {"level": n, "score": score, "stars": earned, "won": won,
                "target": params["target"], "unlocked": unlocked, "best": levels[key]["best"]}

    # ---------- Admin ----------
    @router.get("/api/admin/games")
    async def admin_list(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        rows = await db.games.find({}, {"_id": 0}).sort("sort", 1).to_list(200)
        return [_public_game(g) for g in rows]

    @router.post("/api/admin/games")
    async def admin_create(body: CreateGameBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        base = slug = "-".join(
            "".join(c for c in w.lower() if c.isalnum()) for w in body.title.split()
        ).strip("-") or "game"
        i = 2
        while await db.games.find_one({"slug": slug}):
            slug = f"{base}-{i}"
            i += 1
        count = await db.games.count_documents({})
        tiles = body.tiles if (body.tiles and len(body.tiles) >= 4) else DEFAULT_TILES
        doc = {
            "id": str(uuid.uuid4()),
            "slug": slug,
            "title": body.title,
            "description": body.description,
            "kind": "match3",
            "cover_emoji": body.cover_emoji or "🎮",
            "tiles": tiles[:6],
            "level_count": body.level_count,
            "base_moves": body.base_moves,
            "base_target": body.base_target,
            "difficulty": body.difficulty,
            "is_active": body.is_active,
            "sort": count,
            "created_at": now(),
        }
        await db.games.insert_one(doc)
        return _public_game(doc)

    @router.put("/api/admin/games/{game_id}")
    async def admin_update(game_id: str, body: UpdateGameBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        g = await db.games.find_one({"id": game_id})
        if not g:
            raise HTTPException(404, "Game not found")
        upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if "tiles" in upd:
            if not upd["tiles"] or len(upd["tiles"]) < 4:
                upd.pop("tiles")
            else:
                upd["tiles"] = upd["tiles"][:6]
        if upd:
            await db.games.update_one({"id": game_id}, {"$set": upd})
        g = await db.games.find_one({"id": game_id}, {"_id": 0})
        return _public_game(g)

    @router.delete("/api/admin/games/{game_id}")
    async def admin_delete(game_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        g = await db.games.find_one({"id": game_id})
        if not g:
            raise HTTPException(404, "Game not found")
        await db.games.delete_one({"id": game_id})
        await db.game_progress.delete_many({"game_id": game_id})
        return {"status": "deleted", "id": game_id}

    return router
