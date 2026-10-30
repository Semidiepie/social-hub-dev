"""Holiday Theme Generator (HTG) — SAGE-powered, GLOBAL, site-wide seasonal skins.

An admin describes a holiday ("Halloween", "our 1 year anniversary", or any custom
occasion with an explanation) and SAGE (Claude) designs a theme: a holiday color
palette + a decoration "pack" + a falling-particle effect + a short banner. The
admin previews it (only in their own browser) and then applies it live for EVERY
visitor and user of the website. One global switch; a one-tap "off" reverts to normal.

This is SEPARATE from the per-user cosmetic themes in lib/cosmetics — this one is
global and admin-controlled. Web only.
"""
import json
import re
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import settings_store

PACKS = ["halloween", "christmas", "valentines", "newyear", "thanksgiving", "easter", "anniversary", "generic"]
EFFECTS = ["snow", "leaves", "hearts", "confetti", "sparkles", "bats", "none"]
_HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# Baseline for every pack — SAGE overrides fields it wants; anything missing/invalid
# falls back here so a theme is ALWAYS complete and renders cleanly.
PACK_PRESETS = {
    "halloween":   {"name": "Halloween", "mode": "dark", "primary": "#FF7518", "accent": "#7B2FF7",
                    "background": "#0E0B16", "foreground": "#F4ECFF", "effect": "bats",
                    "banner": "🎃 Happy Halloween from PostMePlex",
                    "decorations": ["cobweb", "spider", "ghost", "pumpkin", "bat"]},
    "christmas":   {"name": "Christmas", "mode": "dark", "primary": "#E23B3B", "accent": "#2E9E5B",
                    "background": "#0C1A12", "foreground": "#F2FBF4", "effect": "snow",
                    "banner": "🎄 Merry Christmas from PostMePlex",
                    "decorations": ["lights", "tree", "snowflake", "candycane", "ornament"]},
    "valentines":  {"name": "Valentine's Day", "mode": "dark", "primary": "#FF4D8D", "accent": "#FF8FB1",
                    "background": "#1A0D15", "foreground": "#FFEAF2", "effect": "hearts",
                    "banner": "💖 Happy Valentine's Day",
                    "decorations": ["heartCorner", "heartFloat"]},
    "newyear":     {"name": "New Year", "mode": "dark", "primary": "#F5C542", "accent": "#6C8BFF",
                    "background": "#0A0A14", "foreground": "#FFF8E6", "effect": "confetti",
                    "banner": "🎉 Happy New Year from PostMePlex",
                    "decorations": ["fireworks", "confetti", "sparkle"]},
    "thanksgiving": {"name": "Thanksgiving", "mode": "dark", "primary": "#C9712B", "accent": "#E0A93B",
                     "background": "#17100A", "foreground": "#FBF0E2", "effect": "leaves",
                     "banner": "🦃 Happy Thanksgiving",
                     "decorations": ["leafCorner", "pumpkin", "turkey"]},
    "easter":      {"name": "Easter", "mode": "light", "primary": "#C58BE8", "accent": "#7FD1B9",
                    "background": "#FBF4FF", "foreground": "#3A2E4A", "effect": "sparkles",
                    "banner": "🐣 Happy Easter",
                    "decorations": ["egg", "flower"]},
    "anniversary": {"name": "PostMePlex 1 Year Anniversary", "mode": "dark", "primary": "#FF6B3D", "accent": "#F5C542",
                    "background": "#0E0B08", "foreground": "#FFF3E9", "effect": "confetti",
                    "banner": "🎉 1 Year of PostMePlex — thank you!",
                    "decorations": ["balloon", "confetti", "sparkle", "cake"]},
    "generic":     {"name": "Celebration", "mode": "dark", "primary": "#FF6B3D", "accent": "#6C8BFF",
                    "background": "#0E0B16", "foreground": "#F4ECFF", "effect": "sparkles",
                    "banner": "✨ Celebrating with PostMePlex",
                    "decorations": ["sparkle"]},
}

SYSTEM = (
    "You are SAGE, the in-house holiday theme designer for the social platform PostMePlex. "
    "Given a holiday or occasion, you design a tasteful, immersive website skin. "
    "You ALWAYS respond with ONE strict JSON object and nothing else — no prose, no markdown fences.\n\n"
    "Schema (all fields required):\n"
    '{\n'
    '  "name": string,            // short display name of the holiday, e.g. "Halloween"\n'
    '  "pack": one of ' + json.dumps(PACKS) + ",   // the decoration set closest to this holiday; use \"anniversary\" ONLY for a PostMePlex anniversary; use \"generic\" if none fit\n"
    '  "mode": "dark" | "light",  // base brightness that best suits the holiday\n'
    '  "primary": "#RRGGBB",      // the holiday\'s signature color\n'
    '  "accent": "#RRGGBB",       // a complementary secondary color\n'
    '  "background": "#RRGGBB",   // page background; deep & rich for dark mode, soft & pale for light mode\n'
    '  "foreground": "#RRGGBB",   // main text color; MUST have strong contrast against background\n'
    '  "effect": one of ' + json.dumps(EFFECTS) + ",  // the falling-particle ambiance\n"
    '  "banner": string           // a short celebratory banner line (max ~60 chars), may include one emoji\n'
    "}\n\n"
    "Use colors TRUE to the real holiday (Halloween = orange & purple on near-black; Christmas = red & green; "
    "Valentine's = pinks/reds; etc.). Ensure foreground vs background contrast is excellent and readable. "
    "Pick the single closest decoration pack. Keep the banner warm and brief."
)


def _now():
    return datetime.now(timezone.utc)


def _valid_hex(v) -> bool:
    return isinstance(v, str) and bool(_HEX.match(v.strip()))


def _normalize(raw: dict) -> dict:
    """Merge a (possibly partial / untrusted) spec onto its pack preset so the result
    is always complete and safe to render."""
    raw = raw if isinstance(raw, dict) else {}
    pack = raw.get("pack")
    if pack not in PACKS:
        pack = "generic"
    base = dict(PACK_PRESETS[pack])
    spec = {"pack": pack, "decorations": base["decorations"]}
    spec["name"] = (str(raw.get("name")).strip()[:40] or base["name"]) if raw.get("name") else base["name"]
    spec["mode"] = raw.get("mode") if raw.get("mode") in ("dark", "light") else base["mode"]
    for k in ("primary", "accent", "background", "foreground"):
        spec[k] = raw[k].strip() if _valid_hex(raw.get(k)) else base[k]
    spec["effect"] = raw.get("effect") if raw.get("effect") in EFFECTS else base["effect"]
    banner = raw.get("banner")
    spec["banner"] = (str(banner).strip()[:80]) if banner else base["banner"]
    return spec


class GenerateBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=300)
    explanation: str = Field(default="", max_length=600)


class ApplyBody(BaseModel):
    spec: dict


def build_router(ctx) -> APIRouter:
    db = ctx.db
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    router = APIRouter(tags=["holiday-theme"])

    def _require_admin(user: dict):
        if not user.get("is_super_admin"):
            raise HTTPException(403, "Admins only")

    async def _current() -> dict:
        return await db.site_theme.find_one({"_id": "global"}, {"_id": 0}) or {"active": False}

    @router.get("/api/theme")
    async def get_theme():
        """PUBLIC — every client fetches this on load to apply the live holiday theme."""
        doc = await _current()
        if not doc.get("active") or not doc.get("spec"):
            return {"active": False}
        return {"active": True, "spec": doc["spec"], "updated_at": doc.get("updated_at")}

    @router.get("/api/admin/theme")
    async def admin_get_theme(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        return await _current()

    @router.post("/api/admin/theme/generate")
    async def admin_generate(body: GenerateBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        ask = f'Design a PostMePlex holiday theme for: "{body.prompt.strip()}".'
        if body.explanation.strip():
            ask += f"\n\nWhat this occasion is / represents: {body.explanation.strip()}"
        ask += "\n\nRespond with ONLY the JSON object."
        try:
            chat = LlmChat(
                api_key=settings_store.get("EMERGENT_LLM_KEY"),
                session_id=f"htg-{current['id']}",
                system_message=SYSTEM,
            ).with_model("anthropic", "claude-sonnet-4-6")
            resp = await chat.send_message(UserMessage(text=ask))
        except Exception as e:
            logger.warning(f"htg generate error: {e}")
            raise HTTPException(502, "SAGE couldn't design that theme right now — try again")
        text = (resp or "").strip()
        # Strip markdown fences / extract the JSON object.
        m = re.search(r"\{.*\}", text, re.DOTALL)
        raw = {}
        if m:
            try:
                raw = json.loads(m.group(0))
            except Exception:
                raw = {}
        spec = _normalize(raw)
        return {"spec": spec}

    @router.post("/api/admin/theme/apply")
    async def admin_apply(body: ApplyBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        spec = _normalize(body.spec or {})
        await db.site_theme.update_one(
            {"_id": "global"},
            {"$set": {"active": True, "spec": spec, "updated_at": _now().isoformat(),
                      "set_by": current.get("username") or current.get("id")}},
            upsert=True,
        )
        return {"active": True, "spec": spec}

    @router.post("/api/admin/theme/off")
    async def admin_off(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.site_theme.update_one(
            {"_id": "global"}, {"$set": {"active": False, "updated_at": _now().isoformat()}}, upsert=True)
        return {"active": False}

    return router
