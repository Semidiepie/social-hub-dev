"""Virtual Pet ("Sage AI") router — a cheap Tamagotchi-style pet.

Care logic (feed/play/bath, XP, leveling, decaying stats) is all free and runs
on our backend. The ONLY paid action is Sage AI image generation (Gemini
"Nano Banana"), which runs solely on pet creation and on explicit restyle, and
the resulting image is cached (uploaded to Cloudinary) so we never regenerate.

Avoids `from __future__ import annotations` (breaks closure-local Depends).
"""
import asyncio
import base64
import io
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

import httpx
import numpy as np
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import settings_store

NANO_BANANA = "gemini-3.1-flash-image-preview"

# Care cooldowns (seconds) and the stat each refills.
COOLDOWNS = {"play": 2 * 3600, "feed": 4 * 3600, "bath": 6 * 3600}
XP_PER = {"play": 20, "feed": 15, "bath": 10}
XP_PER_LEVEL = 100
MAX_LEVEL = 10

# Per-hour decay of each stat.
DECAY = {"hunger": 8.0, "happiness": 5.0, "cleanliness": 6.0}


class CreatePetBody(BaseModel):
    description: str = Field(min_length=2, max_length=200)
    name: Optional[str] = Field(default=None, max_length=40)


class RenameBody(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class StyleBody(BaseModel):
    style: str = Field(min_length=2, max_length=200)


class BackgroundBody(BaseModel):
    prompt: str = Field(min_length=2, max_length=200)


def _clamp(v: float) -> int:
    return max(0, min(100, round(v)))


def _chroma_key_to_transparent(image_b64: str) -> str:
    """Knock out the flat magenta (#FF00FF) background Sage AI is prompted to use,
    producing a real transparent PNG. Returns base64 PNG data."""
    raw = base64.b64decode(image_b64)
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    arr = np.array(im).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    tol = 90
    # Magenta = high red, low green, high blue.
    mask = (r > 255 - tol) & (g < tol) & (b > 255 - tol)
    arr[..., 3][mask] = 0
    out = Image.fromarray(arr.astype(np.uint8), "RGBA")
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


async def _cloudinary_upload(image_b64: str) -> str:
    """Upload a base64 PNG to Cloudinary (unsigned) and return the secure URL.
    Forces PNG so the alpha channel (transparency) is preserved."""
    data_uri = f"data:image/png;base64,{image_b64}"
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"https://api.cloudinary.com/v1_1/{settings_store.get('CLOUDINARY_CLOUD_NAME')}/image/upload",
            data={"upload_preset": settings_store.get("CLOUDINARY_UPLOAD_PRESET"), "file": data_uri},
        )
    j = r.json()
    if r.status_code >= 400 or not j.get("secure_url"):
        raise HTTPException(502, f"Image upload failed: {j.get('error')}")
    return j["secure_url"]


async def _sage_generate(prompt: str, reference_b64: Optional[str] = None) -> str:
    """Generate a pet image with Sage AI (Nano Banana). Returns base64 PNG data."""
    if not settings_store.get("EMERGENT_LLM_KEY"):
        raise HTTPException(503, "Sage AI is not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    chat = LlmChat(
        api_key=settings_store.get("EMERGENT_LLM_KEY"),
        session_id=f"sage-pet-{uuid.uuid4()}",
        system_message="You are Sage AI, an expert cartoon pet-character artist.",
    )
    chat.with_model("gemini", NANO_BANANA).with_params(modalities=["image", "text"])
    if reference_b64:
        msg = UserMessage(text=prompt, file_contents=[ImageContent(reference_b64)])
    else:
        msg = UserMessage(text=prompt)
    _, images = await chat.send_message_multimodal_response(msg)
    if not images:
        raise HTTPException(502, "Sage AI could not generate an image, try a different description")
    return images[0]["data"]


def _style_block() -> str:
    return (
        "Rendered in a polished 3D Pixar / DreamWorks-style animated-movie look: "
        "glossy soft-shaded surfaces, subsurface scattering, big glossy expressive "
        "eyes with bright catchlights, rounded chunky friendly proportions, rosy "
        "cheeks, warm cinematic studio lighting, soft ambient occlusion, ultra "
        "high-quality 3D render, adorable mascot character, centered, full body. "
        "Place the character on a completely flat, solid, uniform pure magenta "
        "background (exact hex #FF00FF). The background must be ONLY magenta — no "
        "gradient, no shadow, no scenery, no other colors in the background."
    )


def _create_prompt(description: str) -> str:
    return f"An adorable cute 3D cartoon virtual pet: {description}. {_style_block()}"


def _style_prompt(style: str) -> str:
    return (
        f"Restyle this exact same pet character: {style}. "
        "Keep the same species, colors, face and pose. "
        f"{_style_block()}"
    )


def _background_prompt(prompt: str) -> str:
    return (
        f"A beautiful, cute environment/background scene for a virtual pet: {prompt}. "
        "Full-frame scenery ONLY — absolutely NO animals, pets, characters or people in it. "
        "Polished 3D Pixar / DreamWorks-style animated-movie look, soft dreamy depth-of-field, "
        "bright and cheerful, gentle lighting, vertical portrait composition with an open area "
        "in the lower-middle where a pet could sit. No text, no watermark, no UI."
    )


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    router = APIRouter(tags=["pets"])

    def _to_dt(v):
        if isinstance(v, datetime):
            return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v)
            except ValueError:
                return None
        return None

    def _settle(pet: dict) -> dict:
        """Apply time-based stat decay from `updated_at` to now (in memory)."""
        if pet.get("is_dead"):
            p = dict(pet)
            p.update(hunger=0, happiness=0, cleanliness=0, health=0)
            return p
        base = _to_dt(pet.get("updated_at")) or now()
        hours = max(0.0, (now() - base).total_seconds() / 3600.0)
        hunger = _clamp(pet["hunger"] - DECAY["hunger"] * hours)
        happiness = _clamp(pet["happiness"] - DECAY["happiness"] * hours)
        cleanliness = _clamp(pet["cleanliness"] - DECAY["cleanliness"] * hours)
        # Health drops when neglected (hungry/dirty), otherwise slowly recovers.
        neglected = hunger < 25 or cleanliness < 25
        health = _clamp(pet["health"] + (-8.0 if neglected else 3.0) * hours)
        pet = dict(pet)
        pet.update(hunger=hunger, happiness=happiness, cleanliness=cleanliness, health=health)
        return pet

    def _mood(pet: dict) -> str:
        if pet.get("is_dead"):
            return "Passed away 🕊️"
        avg = (pet["hunger"] + pet["happiness"] + pet["cleanliness"] + pet["health"]) / 4
        if avg >= 80:
            return "Super happy!"
        if avg >= 55:
            return "Content"
        if avg >= 30:
            return "Grumpy"
        return "Needs care!"

    def _stage(level: int) -> str:
        if level <= 2:
            return "Baby"
        if level <= 6:
            return "Teen"
        return "Adult"

    def _public(pet: dict) -> dict:
        p = _settle(pet)
        cds = {}
        for action, secs in COOLDOWNS.items():
            last = _to_dt(pet.get(f"last_{action}"))
            remaining = 0
            if last:
                remaining = max(0, int(secs - (now() - last).total_seconds()))
            cds[action] = remaining
        return {
            "id": p["id"],
            "name": p.get("name") or "Unnamed",
            "description": p.get("description"),
            "image_url": p.get("image_url"),
            "background_url": p.get("background_url"),
            "ai_styled": p.get("ai_styled", False),
            "is_dead": bool(pet.get("is_dead")),
            "died_at": pet["died_at"].isoformat() if isinstance(pet.get("died_at"), datetime) else pet.get("died_at"),
            "level": p["level"],
            "xp": p["xp"],
            "xp_to_level": XP_PER_LEVEL,
            "stage": _stage(p["level"]),
            "hunger": p["hunger"],
            "happiness": p["happiness"],
            "cleanliness": p["cleanliness"],
            "health": p["health"],
            "mood": _mood(p),
            "cooldowns": cds,
            "created_at": p["created_at"].isoformat() if isinstance(p.get("created_at"), datetime) else p.get("created_at"),
        }

    @router.get("/api/pet")
    async def get_pet(current: Annotated[dict, Depends(get_current_user)]):
        pet = await db.pets.find_one({"owner_id": current["id"]}, {"_id": 0})
        if not pet:
            return {"pet": None}
        # Persist death from neglect the moment we observe health at 0.
        if not pet.get("is_dead"):
            settled = _settle(pet)
            if settled["health"] <= 0:
                await db.pets.update_one(
                    {"id": pet["id"]},
                    {"$set": {"is_dead": True, "died_at": now(), "health": 0}},
                )
                pet["is_dead"] = True
                pet["died_at"] = now()
                pet["health"] = 0
        return {"pet": _public(pet)}

    @router.post("/api/pet")
    async def create_pet(body: CreatePetBody, current: Annotated[dict, Depends(get_current_user)]):
        if not current.get("is_verified"):
            raise HTTPException(403, "Only verified users can adopt a pet")
        existing = await db.pets.find_one({"owner_id": current["id"]}, {"_id": 0})
        if existing:
            raise HTTPException(400, "You already have a pet")
        img_b64 = await _sage_generate(_create_prompt(body.description))
        img_b64 = _chroma_key_to_transparent(img_b64)
        image_url = await _cloudinary_upload(img_b64)
        pet = {
            "id": str(uuid.uuid4()),
            "owner_id": current["id"],
            "description": body.description,
            "name": body.name or "Unnamed",
            "image_url": image_url,
            "ai_styled": True,
            "level": 1,
            "xp": 0,
            "hunger": 100,
            "happiness": 100,
            "cleanliness": 100,
            "health": 100,
            "last_play": None,
            "last_feed": None,
            "last_bath": None,
            "updated_at": now(),
            "created_at": now(),
        }
        await db.pets.insert_one(dict(pet))
        return {"pet": _public(pet)}

    async def _do_action(current: dict, action: str, stat: str):
        pet = await db.pets.find_one({"owner_id": current["id"]})
        if not pet:
            raise HTTPException(404, "No pet yet")
        if pet.get("is_dead"):
            raise HTTPException(410, "Your pet has passed away. Release it to adopt a new one.")
        last = _to_dt(pet.get(f"last_{action}"))
        if last:
            remaining = COOLDOWNS[action] - (now() - last).total_seconds()
            if remaining > 0:
                raise HTTPException(429, f"{action} is on cooldown for {int(remaining)}s")
        settled = _settle(pet)
        settled[stat] = 100
        # Care nudges health up a little too.
        settled["health"] = _clamp(settled["health"] + 5)
        xp = pet["xp"] + XP_PER[action]
        level = pet["level"]
        while xp >= XP_PER_LEVEL and level < MAX_LEVEL:
            xp -= XP_PER_LEVEL
            level += 1
        if level >= MAX_LEVEL:
            xp = min(xp, XP_PER_LEVEL)
        update = {
            "hunger": settled["hunger"],
            "happiness": settled["happiness"],
            "cleanliness": settled["cleanliness"],
            "health": settled["health"],
            "xp": xp,
            "level": level,
            f"last_{action}": now(),
            "updated_at": now(),
        }
        await db.pets.update_one({"id": pet["id"]}, {"$set": update})
        pet.update(update)
        return {"pet": _public(pet)}

    @router.post("/api/pet/feed")
    async def feed(current: Annotated[dict, Depends(get_current_user)]):
        return await _do_action(current, "feed", "hunger")

    @router.post("/api/pet/play")
    async def play(current: Annotated[dict, Depends(get_current_user)]):
        return await _do_action(current, "play", "happiness")

    @router.post("/api/pet/bath")
    async def bath(current: Annotated[dict, Depends(get_current_user)]):
        return await _do_action(current, "bath", "cleanliness")

    @router.patch("/api/pet")
    async def rename(body: RenameBody, current: Annotated[dict, Depends(get_current_user)]):
        pet = await db.pets.find_one({"owner_id": current["id"]})
        if not pet:
            raise HTTPException(404, "No pet yet")
        await db.pets.update_one({"id": pet["id"]}, {"$set": {"name": body.name}})
        pet["name"] = body.name
        return {"pet": _public(pet)}

    @router.post("/api/pet/style")
    async def style(body: StyleBody, current: Annotated[dict, Depends(get_current_user)]):
        pet = await db.pets.find_one({"owner_id": current["id"]})
        if not pet:
            raise HTTPException(404, "No pet yet")
        if pet.get("is_dead"):
            raise HTTPException(410, "Your pet has passed away. Release it to adopt a new one.")
        reference_b64 = None
        if pet.get("image_url"):
            try:
                async with httpx.AsyncClient(timeout=30) as c:
                    resp = await c.get(pet["image_url"])
                if resp.status_code < 400:
                    reference_b64 = base64.b64encode(resp.content).decode("utf-8")
            except Exception as e:
                logger.warning(f"pet reference fetch failed: {e}")
        img_b64 = await _sage_generate(_style_prompt(body.style), reference_b64=reference_b64)
        img_b64 = _chroma_key_to_transparent(img_b64)
        image_url = await _cloudinary_upload(img_b64)
        await db.pets.update_one({"id": pet["id"]}, {"$set": {"image_url": image_url, "ai_styled": True}})
        pet.update(image_url=image_url, ai_styled=True)
        return {"pet": _public(pet)}

    @router.post("/api/pet/background")
    async def background(body: BackgroundBody, current: Annotated[dict, Depends(get_current_user)]):
        pet = await db.pets.find_one({"owner_id": current["id"]})
        if not pet:
            raise HTTPException(404, "No pet yet")
        if pet.get("is_dead"):
            raise HTTPException(410, "Your pet has passed away. Release it to adopt a new one.")
        img_b64 = await _sage_generate(_background_prompt(body.prompt))
        background_url = await _cloudinary_upload(img_b64)
        await db.pets.update_one({"id": pet["id"]}, {"$set": {"background_url": background_url}})
        pet.update(background_url=background_url)
        return {"pet": _public(pet)}

    @router.delete("/api/pet")
    async def delete_pet(current: Annotated[dict, Depends(get_current_user)]):
        await db.pets.delete_one({"owner_id": current["id"]})
        return {"status": "deleted"}

    async def _notify(user_id: str, title: str, body: str):
        """Create an in-app notification + fire a browser Web Push (both best-effort)."""
        try:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "type": "pet",
                "actor_id": user_id,
                "actor_name": "Sage AI",
                "actor_avatar": getattr(ctx, "default_avatar_url", ""),
                "text": body,
                "read": False,
                "created_at": now(),
            })
        except Exception as e:
            logger.warning(f"pet notify insert failed: {e}")
        try:
            await ctx.send_web_push(user_id, title, body, "/pet")
        except Exception as e:
            logger.warning(f"pet web push failed: {e}")

    async def _scan_pets_once():
        """Detect neglected pets → nudge the owner; detect dead pets → mark + notify."""
        pets = await db.pets.find({}).to_list(2000)
        for pet in pets:
            try:
                if pet.get("is_dead"):
                    continue
                settled = _settle(pet)
                if settled["health"] <= 0:
                    await db.pets.update_one(
                        {"id": pet["id"]},
                        {"$set": {"is_dead": True, "died_at": now(), "health": 0}},
                    )
                    await _notify(
                        pet["owner_id"],
                        f"{pet.get('name') or 'Your pet'} has passed away 🕊️",
                        "Your pet didn't survive the neglect. Open Sage AI to adopt a new one.",
                    )
                    continue
                needs_care = (
                    settled["hunger"] < 30
                    or settled["cleanliness"] < 30
                    or settled["happiness"] < 30
                    or settled["health"] < 40
                )
                if not needs_care:
                    continue
                last = _to_dt(pet.get("last_reminded_at"))
                if last and (now() - last).total_seconds() < 8 * 3600:
                    continue
                await db.pets.update_one({"id": pet["id"]}, {"$set": {"last_reminded_at": now()}})
                await _notify(
                    pet["owner_id"],
                    f"{pet.get('name') or 'Your pet'} needs you! 🐾",
                    "Your pet is hungry, dirty or sad — care for it before it's too late.",
                )
            except Exception as e:
                logger.warning(f"pet scan error for {pet.get('id')}: {e}")

    async def pet_reminder_loop():
        # small initial delay so startup isn't blocked
        await asyncio.sleep(60)
        while True:
            try:
                await _scan_pets_once()
            except Exception as e:
                logger.warning(f"pet_reminder_loop error: {e}")
            await asyncio.sleep(30 * 60)  # every 30 minutes

    router.pet_reminder_loop = pet_reminder_loop
    return router
