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
import json
import re
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import settings_store

# Lucide icon names the match-3 board can render (keep in sync with Match3Board).
ALLOWED_ICONS = [
    "Zap", "Heart", "MessageCircle", "Camera", "Star", "Music", "Flame", "Gem",
    "Crown", "Rocket", "Smile", "Sparkles", "Ghost", "Leaf", "Moon", "Sun",
    "Cloud", "Bell", "Trophy", "Apple", "Candy", "IceCream", "Pizza", "Diamond",
]
PALETTE = ["#FF6B3D", "#FF4D6D", "#4FC3F7", "#A78BFA", "#FFD166", "#2DD4BF"]
AI_MODEL = ("openai", "gpt-4.1-mini")  # fast + cheap, conserves LLM credits

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
    "control": "tap",
    "is_active": True,
    "sort": 0,
}


KINDS = ("match3", "memory", "quiz", "tapper", "farm")

# Starter content for AI fallbacks / defaults.
DEFAULT_MEMORY_EMOJIS = ["⚡", "❤️", "💬", "📸", "⭐", "🎵", "🔥", "🏆", "🚀", "🌙", "🍕", "👻"]
DEFAULT_CROPS = [
    {"id": "c0", "name": "Wheat", "emoji": "🌾", "seed_cost": 5, "grow_seconds": 20, "sell_price": 12, "xp": 2},
    {"id": "c1", "name": "Carrot", "emoji": "🥕", "seed_cost": 10, "grow_seconds": 40, "sell_price": 25, "xp": 3},
    {"id": "c2", "name": "Corn", "emoji": "🌽", "seed_cost": 20, "grow_seconds": 75, "sell_price": 50, "xp": 5},
    {"id": "c3", "name": "Tomato", "emoji": "🍅", "seed_cost": 35, "grow_seconds": 120, "sell_price": 90, "xp": 8},
]


def _cfg(game: dict) -> dict:
    """The kind-specific config. match3 keeps its fields at top level (so the
    manual admin editor keeps working); the other kinds store everything under
    `config`."""
    if game.get("kind", "match3") == "match3":
        return {
            "tiles": game.get("tiles", DEFAULT_TILES),
            "base_moves": game.get("base_moves", 28),
            "base_target": game.get("base_target", 1500),
            "difficulty": game.get("difficulty", 1.0),
            "control": game.get("control", "tap"),
        }
    return game.get("config") or {}


def level_params(game: dict, n: int) -> dict:
    """Deterministic per-level config + content, branched by game kind. Shared by
    client (to render) and server (to score). Always returns target/star2/star3."""
    n = max(1, int(n))
    kind = game.get("kind", "match3")
    c = _cfg(game)

    if kind == "memory":
        emojis = [e for e in (c.get("emojis") or DEFAULT_MEMORY_EMOJIS) if isinstance(e, str)][:12] or DEFAULT_MEMORY_EMOJIS
        base_pairs = int(c.get("base_pairs", 6))
        base_seconds = int(c.get("base_seconds", 60))
        pairs = max(3, min(len(emojis), base_pairs + n // 2, 12))
        seconds = max(20, base_seconds - 3 * (n - 1))
        target = pairs * 100
        return {"level": n, "kind": kind, "pairs": pairs, "seconds": seconds,
                "emojis": emojis[:pairs],
                "target": target, "star2": target + round(seconds * 5 * 0.25), "star3": target + round(seconds * 5 * 0.55)}

    if kind == "quiz":
        bank = c.get("questions") or []
        per = max(3, min(5, len(bank) or 5))
        seconds_per_q = int(c.get("seconds_per_q", 15))
        start = ((n - 1) * per) % max(1, len(bank)) if bank else 0
        qs = [bank[(start + i) % len(bank)] for i in range(per)] if bank else []
        target = (per * 3 + 2) // 5 * 100  # ~60%
        return {"level": n, "kind": kind, "questions": qs, "seconds_per_q": seconds_per_q,
                "count": per, "target": max(100, round(per * 0.6) * 100),
                "star2": round(per * 0.8) * 100, "star3": per * 100}

    if kind == "tapper":
        emoji = c.get("emoji") or "⚡"
        bg = c.get("bg") or "#12141c"
        base_duration = int(c.get("base_duration", 20))
        base_spawn = int(c.get("base_spawn_ms", 900))
        duration = base_duration
        spawn_ms = max(350, base_spawn - (n - 1) * 45)
        hits_needed = 8 + round(n * 1.5)
        target = hits_needed * 100
        return {"level": n, "kind": kind, "emoji": emoji, "bg": bg,
                "duration": duration, "spawn_ms": spawn_ms,
                "target": target, "star2": round(target * 1.35), "star3": round(target * 1.75)}

    # ---- match3 (default) ----
    base_target = int(c.get("base_target", 1500))
    base_moves = int(c.get("base_moves", 28))
    difficulty = float(c.get("difficulty", 1.0))
    step = round(base_target * 0.55 * difficulty)
    target = base_target + (n - 1) * step
    moves = max(12, base_moves - (n // 4))
    types = max(4, min(6, len(c.get("tiles", DEFAULT_TILES))))
    colors = min(types, 4 + (n // 8))
    return {
        "level": n, "kind": "match3", "target": target,
        "star2": round(target * 1.5), "star3": round(target * 2.0),
        "moves": moves, "rows": 8, "cols": 8, "colors": colors,
        "tiles": c.get("tiles", DEFAULT_TILES), "control": c.get("control", "tap"),
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
    control: str = Field(default="tap")
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
    control: Optional[str] = None
    is_active: Optional[bool] = None
    visibility: Optional[str] = None


class CompleteBody(BaseModel):
    score: int = Field(ge=0)


class AIPromptBody(BaseModel):
    prompt: str = Field(min_length=2, max_length=600)


class AIGenerateBody(BaseModel):
    prompt: str = Field(min_length=2, max_length=1000)
    kind: Optional[str] = None            # "auto" or a specific kind
    difficulty: Optional[str] = None      # "easy" | "normal" | "hard"
    control: Optional[str] = None         # match3 only: "tap" | "slide"
    level_count: Optional[int] = Field(default=None, ge=1, le=200)


_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _validate_config(kind: str, c) -> dict:
    """Clean + clamp a kind-specific config. Raises 502 if truly unusable."""
    c = c if isinstance(c, dict) else {}
    if kind == "memory":
        emojis = [e for e in (c.get("emojis") or []) if isinstance(e, str) and e.strip()][:12]
        if len(emojis) < 4:
            emojis = DEFAULT_MEMORY_EMOJIS[:]
        return {
            "emojis": emojis,
            "base_pairs": max(3, min(len(emojis), int(c.get("base_pairs") or 6))),
            "base_seconds": max(20, min(180, int(c.get("base_seconds") or 60))),
        }
    if kind == "quiz":
        qs = []
        for q in (c.get("questions") or []):
            if not isinstance(q, dict):
                continue
            text = str(q.get("q") or q.get("question") or "").strip()
            choices = [str(x).strip() for x in (q.get("choices") or q.get("options") or []) if str(x).strip()][:4]
            if not text or len(choices) < 2:
                continue
            try:
                ans = int(q.get("answer"))
            except Exception:
                ans = 0
            if ans < 0 or ans >= len(choices):
                ans = 0
            qs.append({"q": text[:220], "choices": choices, "answer": ans})
        if len(qs) < 3:
            raise HTTPException(502, "Sage couldn't write enough quiz questions — try a clearer topic.")
        return {"questions": qs[:40], "seconds_per_q": max(5, min(60, int(c.get("seconds_per_q") or 15)))}
    if kind == "tapper":
        bg = c.get("bg") if isinstance(c.get("bg"), str) and _HEX.match(str(c.get("bg"))) else "#12141c"
        return {
            "emoji": str(c.get("emoji") or "⚡")[:8],
            "bg": bg,
            "base_duration": max(10, min(60, int(c.get("base_duration") or 20))),
            "base_spawn_ms": max(350, min(2000, int(c.get("base_spawn_ms") or 900))),
        }
    if kind == "farm":
        crops = []
        for i, cr in enumerate((c.get("crops") or [])[:8]):
            if not isinstance(cr, dict):
                continue
            name = str(cr.get("name") or "").strip()[:24]
            if not name:
                continue
            seed = max(1, min(5000, int(cr.get("seed_cost") or 10)))
            grow = max(5, min(86400, int(cr.get("grow_seconds") or 30)))
            sell = max(seed + 1, min(50000, int(cr.get("sell_price") or seed * 2)))
            xp = max(1, min(1000, int(cr.get("xp") or 2)))
            crops.append({"id": f"c{i}", "name": name, "emoji": str(cr.get("emoji") or "🌱")[:4],
                          "seed_cost": seed, "grow_seconds": grow, "sell_price": sell, "xp": xp})
        if len(crops) < 2:
            crops = DEFAULT_CROPS
        return {
            "crops": crops,
            "start_coins": max(0, min(100000, int(c.get("start_coins") or 100))),
            "start_plots": max(2, min(12, int(c.get("start_plots") or 4))),
        }
    # match3
    tiles = _coerce_tiles(c.get("tiles")) or DEFAULT_TILES
    return {
        "tiles": tiles,
        "base_moves": max(8, min(80, int(c.get("base_moves") or 28))),
        "base_target": max(200, min(100000, int(c.get("base_target") or 1500))),
        "difficulty": max(0.3, min(4.0, round(float(c.get("difficulty") or 1.0), 2))),
        "control": c.get("control") if c.get("control") in ("tap", "slide") else "tap",
    }


def _coerce_tiles(raw) -> Optional[list]:
    """Validate an AI-proposed tile set: 4–6 tiles, each with an allowed lucide
    icon and a valid hex color. Returns None if unusable (keep the old tiles)."""
    if not isinstance(raw, list) or len(raw) < 4:
        return None
    out = []
    for i, t in enumerate(raw[:6]):
        if not isinstance(t, dict):
            continue
        icon = t.get("icon")
        if icon not in ALLOWED_ICONS:
            icon = ALLOWED_ICONS[i % len(ALLOWED_ICONS)]
        color = t.get("color")
        if not (isinstance(color, str) and _HEX.match(color)):
            color = PALETTE[i % len(PALETTE)]
        tid = str(t.get("id") or icon.lower())[:20]
        out.append({"id": tid, "icon": icon, "color": color})
    return out if len(out) >= 4 else None


def _apply_patch(doc: dict, patch: dict) -> dict:
    """Apply only known, validated fields from an AI patch onto a game doc."""
    upd = {}
    if isinstance(patch.get("title"), str) and patch["title"].strip():
        upd["title"] = patch["title"].strip()[:60]
    if isinstance(patch.get("description"), str):
        upd["description"] = patch["description"].strip()[:400]
    if isinstance(patch.get("cover_emoji"), str) and patch["cover_emoji"].strip():
        upd["cover_emoji"] = patch["cover_emoji"].strip()[:8]
    if isinstance(patch.get("level_count"), (int, float)):
        upd["level_count"] = max(1, min(500, int(patch["level_count"])))
    if isinstance(patch.get("base_moves"), (int, float)):
        upd["base_moves"] = max(8, min(80, int(patch["base_moves"])))
    if isinstance(patch.get("base_target"), (int, float)):
        upd["base_target"] = max(200, min(100000, int(patch["base_target"])))
    if isinstance(patch.get("difficulty"), (int, float)):
        upd["difficulty"] = max(0.3, min(4.0, round(float(patch["difficulty"]), 2)))
    if patch.get("control") in ("tap", "slide"):
        upd["control"] = patch["control"]
    tiles = _coerce_tiles(patch.get("tiles"))
    if tiles:
        upd["tiles"] = tiles
    return upd


def _parse_json(text: str) -> dict:
    """Pull the first JSON object out of an LLM reply (handles code fences/prose)."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[t.find("{"):]
    s, e = t.find("{"), t.rfind("}")
    if s == -1 or e == -1:
        raise ValueError("no json")
    return json.loads(t[s:e + 1])


async def _ai_design(prompt: str, base: Optional[dict], logger) -> dict:
    """Ask Sage (LLM) to design/patch a match-3 game config from a description.
    Returns a validated patch dict. Raises HTTPException on failure."""
    key = settings_store.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "Sage AI isn't configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    icon_list = ", ".join(ALLOWED_ICONS)
    system = (
        "You are Sage, a game designer for a PostMePlex match-3 (Candy-Crush-style) puzzle. "
        "Given an admin's instruction, output ONLY a compact JSON object describing the game's tunable "
        "settings. Do not include any prose, markdown, or explanation. Allowed keys:\n"
        '  "title" (string), "description" (string, <=200 chars), "cover_emoji" (ONE emoji),\n'
        '  "level_count" (int 1-200), "base_moves" (int 8-60), "base_target" (int 500-20000),\n'
        '  "difficulty" (number 0.3-4.0, higher = harder),\n'
        '  "control" ("tap" = tap two tiles to swap, OR "slide" = swipe/drag a tile to swap),\n'
        '  "tiles" (array of EXACTLY 6 objects: {"id":short-string,"icon":<one of the allowed icons>,"color":"#RRGGBB"}).\n'
        f"Allowed icon names (use ONLY these): {icon_list}.\n"
        "Pick icons + colors that fit the theme. 'physics'/'harder' => raise difficulty and base_target, "
        "lower base_moves. 'easier' => the opposite. 'slide'/'swipe physics' => set control to 'slide'; "
        "'tap' => set control to 'tap'. Only include keys you intend to change."
    )
    if base:
        current = {k: base.get(k) for k in ("title", "description", "cover_emoji", "level_count", "base_moves", "base_target", "difficulty", "control", "tiles")}
        user = f"Current game settings:\n{json.dumps(current)}\n\nAdmin instruction: {prompt}\n\nReturn the updated settings as JSON (only the keys that should change)."
    else:
        user = f"Design a brand-new match-3 game from this description: {prompt}\n\nReturn the full settings as JSON including all keys and 6 themed tiles."

    chat = LlmChat(api_key=key, session_id=f"sage-game-{uuid.uuid4()}", system_message=system).with_model(*AI_MODEL)
    try:
        resp = await chat.send_message(UserMessage(text=user))
        patch = _parse_json(resp)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[games] AI design failed: {e}")
        raise HTTPException(502, "Sage couldn't design that — try rephrasing.")
    applied = _apply_patch(base or {}, patch)
    if not applied:
        raise HTTPException(502, "Sage didn't return any usable changes — try being more specific.")
    return applied


GEN_SYSTEM = (
    "You are Sage, a game designer for the PostMePlex arcade. From an admin's description you design a "
    "complete, playable game and output ONLY one compact JSON object (no prose, no markdown).\n"
    "First choose the best-fitting `kind` for what they describe:\n"
    '  - "match3": swap/slide tiles to match 3+ (puzzle, gems, candy, icons).\n'
    '  - "memory": flip cards to find matching pairs (concentration, memory).\n'
    '  - "quiz": trivia / multiple-choice questions on a topic.\n'
    '  - "tapper": tap/whack targets that pop up fast within a time limit (reflex, arcade).\n'
    '  - "farm": a farming/economy SIMULATOR (like Hay Day / FarmVille): plant seeds, wait for crops to grow in real time, harvest, sell for coins, level up. Use this for any "simulator", "tycoon", "farm", "restaurant", "city builder" or "idle/economy" request.\n'
    "Then output JSON: {\n"
    '  "kind": one of the above,\n'
    '  "title": string (<=50), "description": string (<=180), "cover_emoji": ONE emoji,\n'
    '  "level_count": int 1-60,\n'
    '  "config": kind-specific object:\n'
    '    match3 -> {"tiles":[EXACTLY 6 {"id","icon","color":"#RRGGBB"}], "base_moves":8-60, "base_target":500-20000, "difficulty":0.3-4.0, "control":"tap"|"slide"}\n'
    '    memory -> {"emojis":[8-12 single emojis fitting the theme], "base_pairs":4-8, "base_seconds":30-120}\n'
    '    quiz   -> {"questions":[8-20 {"q":string,"choices":[3-4 strings],"answer":index-int}], "seconds_per_q":8-30}\n'
    '    tapper -> {"emoji":ONE emoji to tap, "bg":"#RRGGBB", "base_duration":15-40, "base_spawn_ms":500-1200}\n'
    '    farm   -> {"crops":[4-8 {"name":string,"emoji":ONE emoji,"seed_cost":int,"grow_seconds":int(10-600),"sell_price":int>seed_cost,"xp":int}], "start_coins":50-500, "start_plots":4-8}\n'
    "For match3 tiles use ONLY these icon names: " + ", ".join(ALLOWED_ICONS) + ".\n"
    "Make content genuinely fit the theme (real trivia answers, themed emojis). Respect difficulty hints."
)


async def _ai_generate(body, logger) -> dict:
    """Design a brand-new game of ANY supported kind from a description."""
    key = settings_store.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "Sage AI isn't configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    hints = {
        "preferred_kind": body.kind if body.kind in KINDS else "auto",
        "difficulty": body.difficulty or "normal",
        "control": body.control or "auto",
    }
    user = f"Admin description: {body.prompt}\nHints: {json.dumps(hints)}\nDesign the game now. Output ONLY the JSON."
    chat = LlmChat(api_key=key, session_id=f"sage-gen-{uuid.uuid4()}", system_message=GEN_SYSTEM).with_model(*AI_MODEL)
    try:
        resp = await chat.send_message(UserMessage(text=user))
        spec = _parse_json(resp)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[games] AI generate failed: {e}")
        raise HTTPException(502, "Sage couldn't design that — try rephrasing.")

    kind = body.kind if body.kind in KINDS else spec.get("kind")
    if kind not in KINDS:
        kind = "match3"
    config = _validate_config(kind, spec.get("config") or {})
    if body.control in ("tap", "slide") and kind == "match3":
        config["control"] = body.control
    return {
        "kind": kind,
        "title": (spec.get("title") or "Sage Game").strip()[:60] or "Sage Game",
        "description": (spec.get("description") or "").strip()[:400],
        "cover_emoji": (spec.get("cover_emoji") or "🎮").strip()[:8] or "🎮",
        "level_count": int(body.level_count or spec.get("level_count") or 20),
        "config": config,
    }


async def _ai_edit_other(game: dict, prompt: str, logger) -> dict:
    """Edit a non-match3 game's config via natural language. Returns a $set dict."""
    key = settings_store.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "Sage AI isn't configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    kind = game.get("kind")
    current = {"kind": kind, "title": game["title"], "description": game.get("description", ""),
               "cover_emoji": game.get("cover_emoji", "🎮"), "level_count": game.get("level_count", 20),
               "config": _cfg(game)}
    system = GEN_SYSTEM + "\nYou are EDITING an existing game. Keep the SAME kind. Return the COMPLETE updated JSON including any content you are not changing."
    user = f"Current game JSON:\n{json.dumps(current)}\n\nAdmin instruction: {prompt}\n\nReturn the full updated JSON now. Output ONLY JSON."
    chat = LlmChat(api_key=key, session_id=f"sage-edit-{uuid.uuid4()}", system_message=system).with_model(*AI_MODEL)
    try:
        resp = await chat.send_message(UserMessage(text=user))
        spec = _parse_json(resp)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[games] AI edit failed: {e}")
        raise HTTPException(502, "Sage couldn't edit that — try rephrasing.")

    upd = {"config": _validate_config(kind, spec.get("config") or current["config"])}
    if isinstance(spec.get("title"), str) and spec["title"].strip():
        upd["title"] = spec["title"].strip()[:60]
    if isinstance(spec.get("description"), str):
        upd["description"] = spec["description"].strip()[:400]
    if isinstance(spec.get("cover_emoji"), str) and spec["cover_emoji"].strip():
        upd["cover_emoji"] = spec["cover_emoji"].strip()[:8]
    if isinstance(spec.get("level_count"), (int, float)):
        upd["level_count"] = max(1, min(200, int(spec["level_count"])))
    return upd


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
        "control": g.get("control", "tap"),
        "config": _cfg(g),
        "is_active": g.get("is_active", True),
        "visibility": g.get("visibility", "public"),
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

    async def _unique_slug(title: str) -> str:
        base = slug = "-".join(
            "".join(c for c in w.lower() if c.isalnum()) for w in title.split()
        ).strip("-") or "game"
        i = 2
        while await db.games.find_one({"slug": slug}):
            slug = f"{base}-{i}"
            i += 1
        return slug

    async def _progress(user_id: str, game_id: str) -> dict:
        p = await db.game_progress.find_one({"user_id": user_id, "game_id": game_id}, {"_id": 0})
        if not p:
            return {"unlocked": 1, "levels": {}}
        return {"unlocked": p.get("unlocked", 1), "levels": p.get("levels", {})}

    # ---------- Public ----------
    @router.get("/api/games")
    async def list_games(current: Annotated[Optional[dict], Depends(get_optional_user)] = None):
        is_admin = bool(current and current.get("is_super_admin"))
        q = {"is_active": True}
        if not is_admin:
            q["visibility"] = {"$ne": "private"}
        rows = await db.games.find(q, {"_id": 0}).sort("sort", 1).to_list(100)
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
        is_admin = bool(current and current.get("is_super_admin"))
        if g.get("visibility") == "private" and not is_admin:
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
        return {"game_id": g["id"], "kind": g.get("kind", "match3"), **level_params(g, n)}

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

    # ---------- Farm simulator (not level-based) ----------
    def _epoch() -> int:
        return int(now().timestamp())

    def _farm_level(xp: int) -> int:
        return 1 + int(xp) // 100

    def _farm_out(state: dict, game: dict) -> dict:
        c = _cfg(game)
        return {
            "coins": state["coins"],
            "xp": state["xp"],
            "level": _farm_level(state["xp"]),
            "plots": state["plots"],
            "inventory": state.get("inventory", {}),
            "crops": c.get("crops", DEFAULT_CROPS),
            "now": _epoch(),
        }

    async def _get_farm(user_id: str, game: dict) -> dict:
        s = await db.farm_state.find_one({"user_id": user_id, "game_id": game["id"]}, {"_id": 0})
        if s:
            return s
        c = _cfg(game)
        s = {
            "id": str(uuid.uuid4()), "user_id": user_id, "game_id": game["id"],
            "coins": int(c.get("start_coins", 100)), "xp": 0,
            "plots": [{"crop": None, "ready_at": None} for _ in range(int(c.get("start_plots", 4)))],
            "inventory": {}, "created_at": now(), "updated_at": now(),
        }
        await db.farm_state.insert_one(dict(s))
        return s

    async def _save_farm(state: dict):
        state["updated_at"] = now()
        await db.farm_state.update_one(
            {"user_id": state["user_id"], "game_id": state["game_id"]},
            {"$set": {k: state[k] for k in ("coins", "xp", "plots", "inventory", "updated_at")}},
        )

    async def _farm_game(slug: str, current):
        g = await db.games.find_one({"slug": slug}, {"_id": 0})
        if not g or not g.get("is_active", True) or g.get("kind") != "farm":
            raise HTTPException(404, "Farm not found")
        if g.get("visibility") == "private" and not current.get("is_super_admin"):
            raise HTTPException(404, "Farm not found")
        return g

    @router.get("/api/games/{slug}/farm")
    async def farm_state(slug: str, current: Annotated[dict, Depends(get_current_user)]):
        g = await _farm_game(slug, current)
        s = await _get_farm(current["id"], g)
        return _farm_out(s, g)

    @router.post("/api/games/{slug}/farm/plant")
    async def farm_plant(slug: str, body: dict, current: Annotated[dict, Depends(get_current_user)]):
        g = await _farm_game(slug, current)
        s = await _get_farm(current["id"], g)
        crops = {c["id"]: c for c in _cfg(g).get("crops", DEFAULT_CROPS)}
        plot_i = int(body.get("plot", -1))
        crop = crops.get(body.get("crop"))
        if plot_i < 0 or plot_i >= len(s["plots"]):
            raise HTTPException(400, "Invalid plot")
        if not crop:
            raise HTTPException(400, "Unknown crop")
        if s["plots"][plot_i]["crop"]:
            raise HTTPException(400, "Plot is busy")
        if s["coins"] < crop["seed_cost"]:
            raise HTTPException(400, "Not enough coins")
        s["coins"] -= crop["seed_cost"]
        s["plots"][plot_i] = {"crop": crop["id"], "ready_at": _epoch() + crop["grow_seconds"]}
        await _save_farm(s)
        return _farm_out(s, g)

    @router.post("/api/games/{slug}/farm/harvest")
    async def farm_harvest(slug: str, body: dict, current: Annotated[dict, Depends(get_current_user)]):
        g = await _farm_game(slug, current)
        s = await _get_farm(current["id"], g)
        crops = {c["id"]: c for c in _cfg(g).get("crops", DEFAULT_CROPS)}
        plot_i = int(body.get("plot", -1))
        if plot_i < 0 or plot_i >= len(s["plots"]):
            raise HTTPException(400, "Invalid plot")
        plot = s["plots"][plot_i]
        if not plot["crop"]:
            raise HTTPException(400, "Nothing planted")
        if _epoch() < (plot["ready_at"] or 0):
            raise HTTPException(400, "Not ready yet")
        cid = plot["crop"]
        s["inventory"][cid] = int(s["inventory"].get(cid, 0)) + 1
        s["xp"] += crops.get(cid, {}).get("xp", 1)
        s["plots"][plot_i] = {"crop": None, "ready_at": None}
        await _save_farm(s)
        return _farm_out(s, g)

    @router.post("/api/games/{slug}/farm/sell")
    async def farm_sell(slug: str, body: dict, current: Annotated[dict, Depends(get_current_user)]):
        g = await _farm_game(slug, current)
        s = await _get_farm(current["id"], g)
        crops = {c["id"]: c for c in _cfg(g).get("crops", DEFAULT_CROPS)}
        cid = body.get("crop")
        have = int(s["inventory"].get(cid, 0))
        qty = max(1, min(int(body.get("qty", 1)), have))
        if not crops.get(cid) or have <= 0:
            raise HTTPException(400, "Nothing to sell")
        s["coins"] += crops[cid]["sell_price"] * qty
        s["xp"] += qty
        left = have - qty
        if left > 0:
            s["inventory"][cid] = left
        else:
            s["inventory"].pop(cid, None)
        await _save_farm(s)
        return _farm_out(s, g)

    @router.post("/api/games/{slug}/farm/buy-plot")
    async def farm_buy_plot(slug: str, current: Annotated[dict, Depends(get_current_user)]):
        g = await _farm_game(slug, current)
        s = await _get_farm(current["id"], g)
        if len(s["plots"]) >= 16:
            raise HTTPException(400, "Max plots reached")
        cost = 50 * len(s["plots"])
        if s["coins"] < cost:
            raise HTTPException(400, "Not enough coins")
        s["coins"] -= cost
        s["plots"].append({"crop": None, "ready_at": None})
        await _save_farm(s)
        return {**_farm_out(s, g), "plot_cost": cost}

    # ---------- Admin ----------
    @router.get("/api/admin/games")
    async def admin_list(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        rows = await db.games.find({}, {"_id": 0}).sort("sort", 1).to_list(200)
        return [_public_game(g) for g in rows]

    @router.post("/api/admin/games")
    async def admin_create(body: CreateGameBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        slug = await _unique_slug(body.title)
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
            "control": body.control if body.control in ("tap", "slide") else "tap",
            "is_active": body.is_active,
            "visibility": "public",
            "sort": count,
            "created_at": now(),
        }
        await db.games.insert_one(doc)
        return _public_game(doc)

    @router.post("/api/admin/games/ai-create")
    async def admin_ai_create(body: AIGenerateBody, current: Annotated[dict, Depends(get_current_user)]):
        """Sage designs a brand-new game of ANY supported kind from a description.
        Saved PRIVATE so the admin can preview it, then flip it public."""
        _require_admin(current)
        spec = await _ai_generate(body, ctx.logger)
        slug = await _unique_slug(spec["title"])
        count = await db.games.count_documents({})
        doc = {
            "id": str(uuid.uuid4()),
            "slug": slug,
            "title": spec["title"],
            "description": spec["description"],
            "kind": spec["kind"],
            "cover_emoji": spec["cover_emoji"],
            "level_count": 1 if spec["kind"] == "farm" else spec["level_count"],
            "is_active": True,
            "visibility": "private",
            "sort": count,
            "created_at": now(),
        }
        if spec["kind"] == "match3":
            # match3 mirrors config to top-level fields (manual editor reads them).
            doc.update({
                "tiles": spec["config"]["tiles"],
                "base_moves": spec["config"]["base_moves"],
                "base_target": spec["config"]["base_target"],
                "difficulty": spec["config"]["difficulty"],
                "control": spec["config"]["control"],
            })
        else:
            doc["config"] = spec["config"]
        await db.games.insert_one(doc)
        return _public_game(doc)

    @router.post("/api/admin/games/{game_id}/ai-edit")
    async def admin_ai_edit(game_id: str, body: AIPromptBody, current: Annotated[dict, Depends(get_current_user)]):
        """Sage edits an existing game's settings ("physics", content and theme)
        from a natural-language instruction. Applies live — affects public too."""
        _require_admin(current)
        g = await db.games.find_one({"id": game_id}, {"_id": 0})
        if not g:
            raise HTTPException(404, "Game not found")
        if g.get("kind", "match3") == "match3":
            patch = await _ai_design(body.prompt, g, ctx.logger)
        else:
            patch = await _ai_edit_other(g, body.prompt, ctx.logger)
        await db.games.update_one({"id": game_id}, {"$set": patch})
        g = await db.games.find_one({"id": game_id}, {"_id": 0})
        return {"game": _public_game(g), "changed": [k for k in patch.keys() if k != "config"] + (["content/settings"] if "config" in patch else [])}

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
        if "visibility" in upd and upd["visibility"] not in ("public", "private"):
            upd.pop("visibility")
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
        await db.farm_state.delete_many({"game_id": game_id})
        return {"status": "deleted", "id": game_id}

    return router
