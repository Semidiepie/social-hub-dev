"""Admin-only custom AI characters that live in Messages.

An admin creates a character (name, @username, avatar, personality, ElevenLabs
voice) and can chat with it by TYPING or TALKING. The character auto-replies via
the Emergent LLM key (in-character) and speaks the reply with a real ElevenLabs
voice. Everything here is restricted to super-admins — only admins can create
these characters and hear their voices.

NOTE: intentionally NO `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
import asyncio
import base64
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import settings_store

TTS_MODEL = "eleven_v3"  # most expressive — supports audio tags ([laughs], [sighs], [crying]…)
TTS_FALLBACK_MODEL = "eleven_multilingual_v2"  # used if v3 is unavailable for the account/voice

# Emotion / non-verbal cues the character may embed in replies; performed by eleven_v3
# and stripped from the text shown on screen.
AUDIO_TAG_RE = re.compile(r"\[[a-zA-Z][a-zA-Z '\-]{0,24}\]")

# WMO weather codes → plain words the character can speak naturally.
WEATHER_CODES = {
    0: "clear skies", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "raining",
    65: "heavy rain", 66: "freezing rain", 67: "freezing rain", 71: "light snow",
    73: "snowing", 75: "heavy snow", 77: "snow grains", 80: "rain showers",
    81: "rain showers", 82: "heavy rain showers", 85: "snow showers", 86: "snow showers",
    95: "a thunderstorm", 96: "a thunderstorm with hail", 99: "a severe thunderstorm",
}


def _now():
    return datetime.now(timezone.utc)


def _strip_tags(text: str) -> str:
    """Remove ElevenLabs audio tags like [laughs] from text shown on screen / stored."""
    cleaned = AUDIO_TAG_RE.sub("", text or "")
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def parse_voice_id(raw: str) -> str:
    """Accept a raw ElevenLabs Voice ID or any ElevenLabs URL and extract the id."""
    raw = (raw or "").strip()
    if not raw:
        return ""
    m = re.search(r"voiceId=([A-Za-z0-9]{15,32})", raw)
    if m:
        return m.group(1)
    m = re.search(r"/voices?/([A-Za-z0-9]{15,32})", raw)
    if m:
        return m.group(1)
    m = re.search(r"\b([A-Za-z0-9]{20})\b", raw)  # bare 20-char id
    if m:
        return m.group(1)
    return raw[:40]


class CreateCharacterBody(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    username: str = Field(min_length=1, max_length=30)
    avatar_url: Optional[str] = None
    persona: str = Field(min_length=1, max_length=1500)
    voice: str = Field(default="", max_length=400)  # raw voice id or ElevenLabs link
    your_name: str = Field(default="", max_length=60)      # the person's real name
    nickname: str = Field(default="", max_length=60)       # what the character calls them
    relationship: str = Field(default="", max_length=500)  # how they know each other


class MemoryBody(BaseModel):
    text: str = Field(min_length=1, max_length=400)


class SendBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    local_time: str = Field(default="", max_length=80)   # time as shown on the user's device
    tz: str = Field(default="", max_length=60)
    lat: Optional[float] = None
    lon: Optional[float] = None


class VoiceTurnBody(BaseModel):
    text: str = Field(default="", max_length=2000)
    greeting: bool = False
    local_time: str = Field(default="", max_length=80)
    tz: str = Field(default="", max_length=60)
    lat: Optional[float] = None
    lon: Optional[float] = None


def build_router(ctx) -> APIRouter:
    db = ctx.db
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    send_web_push = ctx.send_web_push
    default_avatar = ctx.default_avatar_url
    router = APIRouter(tags=["ai-characters"])

    def _require_admin(user: dict):
        if not user.get("is_super_admin"):
            raise HTTPException(403, "Super admin only")

    async def _get_char(char_id: str) -> dict:
        c = await db.ai_characters.find_one({"id": char_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Character not found")
        return c

    def _char_public(c: dict) -> dict:
        return {
            "id": c["id"],
            "name": c["name"],
            "username": c["username"],
            "avatar_url": c.get("avatar_url") or default_avatar,
            "persona": c.get("persona", ""),
            "your_name": c.get("your_name", ""),
            "nickname": c.get("nickname", ""),
            "relationship": c.get("relationship", ""),
            "memories": c.get("memories", []),
            "voice_id": c.get("voice_id", ""),
            "voice_enabled": bool(c.get("voice_id") and settings_store.get("ELEVENLABS_API_KEY")),
            "voice_valid": c.get("voice_valid", None),
            "created_at": c["created_at"].isoformat() if isinstance(c.get("created_at"), datetime) else c.get("created_at"),
        }

    async def _voice_exists(voice_id: str) -> Optional[bool]:
        """Check the pasted voice is usable by the configured ElevenLabs account.
        None = can't tell (no key); True/False = exists or not."""
        key = settings_store.get("ELEVENLABS_API_KEY")
        if not key:
            return None
        if not voice_id:
            return False

        def _chk() -> bool:
            from elevenlabs.client import ElevenLabs
            client = ElevenLabs(api_key=key)
            client.voices.get(voice_id=voice_id)
            return True

        try:
            return await asyncio.to_thread(_chk)
        except Exception:
            return False

    async def _flag_elevenlabs(err: Exception):
        s = str(err).lower()
        if any(k in s for k in ["401", "unauthorized", "invalid api key", "quota", "invalid_api_key", "403"]):
            try:
                from routes.keyhealth import report_issue
                await report_issue(db, send_web_push, default_avatar, "elevenlabs",
                                   "ElevenLabs (AI character voice)", "A character voice call rejected the key — update it.")
            except Exception:
                pass

    def _system(c: dict, spoken: bool, context: str = "") -> str:
        base = (
            f"You are {c['name']} (@{c['username']}), a character chatting inside the PostMePlex app. "
            f"Stay FULLY in character at all times and never say you are an AI or a language model.\n\n"
            f"Your personality and how you talk:\n{c.get('persona', '')}\n"
        )
        who = []
        if c.get("your_name"):
            who.append(f"The person you're talking to is named {c['your_name']}.")
        if c.get("nickname"):
            who.append(f'You affectionately call them "{c["nickname"]}" — use it naturally now and then.')
        if c.get("relationship"):
            who.append(f"How you two know each other: {c['relationship']}")
        if who:
            base += "\nAbout the person you're talking to:\n" + "\n".join(who) + "\n"
        mems = [m.get("text", "") for m in c.get("memories", []) if m.get("text")]
        if mems:
            base += ("\nThings you ALWAYS remember about them (treat as established fact, weave in naturally, "
                     "and NEVER ask about them again):\n" + "\n".join(f"- {m}" for m in mems) + "\n")
        base += (
            "\nRemember the whole conversation so far and never make the person repeat themselves. "
            "Never say you can't remember. Keep replies short, natural and conversational (2-5 sentences)."
        )
        if context:
            base += (
                "\n\nREAL-WORLD CONTEXT (this is actually true for the person RIGHT NOW — treat it as fact, "
                "reference it naturally when relevant, and never contradict it):\n" + context + "\n"
            )
        if spoken:
            base += (" You are on a VOICE call, so answer the way a person naturally speaks out loud: "
                     "short warm sentences, no markdown, no bullet lists, no emojis, easy to say aloud. "
                     "To sound truly human, express real emotion with inline audio cues in square brackets "
                     "that the voice will PERFORM (not say): [laughs], [giggles], [sighs], [whispers], "
                     "[excited], [sad], [crying], [nervously], [gasps], [clears throat]. Use them naturally and "
                     "sparingly where the emotion genuinely fits, and use ellipses (…) and commas for natural "
                     "breathing and pauses. Never read a tag out loud or explain it.")
        return base

    async def _realworld_context(local_time: str, tz: str, lat, lon) -> str:
        """Builds a 'this is true right now' block from the user's device clock and live weather."""
        parts = []
        if local_time:
            parts.append(f"Current local time on their phone: {local_time}" + (f" ({tz})" if tz else ""))
        if lat is not None and lon is not None:
            try:
                async with httpx.AsyncClient(timeout=6) as client:
                    r = await client.get("https://api.open-meteo.com/v1/forecast", params={
                        "latitude": lat, "longitude": lon,
                        "current": "temperature_2m,weather_code,is_day", "temperature_unit": "celsius"})
                if r.status_code < 400:
                    cur = r.json().get("current", {})
                    desc = WEATHER_CODES.get(cur.get("weather_code"), "")
                    temp = cur.get("temperature_2m")
                    day = "daytime" if cur.get("is_day") else "nighttime"
                    if desc or temp is not None:
                        wx = f"Weather where they are right now: {desc}" if desc else "Weather where they are right now"
                        if temp is not None:
                            wx += f", about {round(temp)}°C"
                        wx += f" ({day})."
                        parts.append(wx)
            except Exception as e:
                logger.warning(f"weather lookup failed: {e}")
        return "\n".join(parts)

    async def _reply(c: dict, admin_id: str, user_text: str, spoken: bool, context: str = "") -> str:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        history = await db.ai_char_messages.find(
            {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "role": 1, "text": 1}
        ).sort("created_at", -1).limit(40).to_list(40)
        history.reverse()
        transcript = "\n".join(f"{'User' if m['role'] == 'user' else c['name']}: {m['text']}" for m in history)
        chat = LlmChat(
            api_key=settings_store.get("EMERGENT_LLM_KEY"),
            session_id=f"aichar-{c['id']}-{admin_id}",
            system_message=_system(c, spoken, context),
        ).with_model("anthropic", "claude-sonnet-4-6")
        prompt = (f"Recent conversation:\n{transcript}\n\n" if transcript else "") + (
            f'The user just said: "{user_text}"\n\nRespond as {c["name"]}.'
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        return (resp or "").strip()

    async def _tts(c: dict, text: str) -> Optional[str]:
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        voice_id = c.get("voice_id")
        if not eleven_key or not voice_id:
            return None

        def _synth(model_id: str) -> bytes:
            from elevenlabs import VoiceSettings
            from elevenlabs.client import ElevenLabs
            client = ElevenLabs(api_key=eleven_key)
            # Lower stability + higher style = more emotional, spontaneous delivery (laughs/breathing).
            stream = client.text_to_speech.convert(
                text=text, voice_id=voice_id, model_id=model_id, output_format="mp3_44100_128",
                voice_settings=VoiceSettings(stability=0.4, similarity_boost=0.8, style=0.5, use_speaker_boost=True),
            )
            return b"".join(stream)

        try:
            audio = await asyncio.to_thread(_synth, TTS_MODEL)
        except Exception as e:
            logger.warning(f"ai-char v3 tts failed, falling back to {TTS_FALLBACK_MODEL}: {e}")
            try:
                audio = await asyncio.to_thread(_synth, TTS_FALLBACK_MODEL)
            except Exception as e2:
                logger.warning(f"ai-char tts error: {e2}")
                await _flag_elevenlabs(e2)
                return None
        return "data:audio/mpeg;base64," + base64.b64encode(audio).decode()

    async def _store(char_id: str, admin_id: str, role: str, text: str) -> dict:
        doc = {"id": str(uuid.uuid4()), "character_id": char_id, "admin_id": admin_id,
               "role": role, "text": text, "created_at": _now()}
        await db.ai_char_messages.insert_one(doc)
        return doc

    def _msg_out(doc: dict) -> dict:
        return {"id": doc["id"], "role": doc["role"], "text": doc["text"],
                "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at")}

    # ---------- Character CRUD (admin) ----------
    @router.get("/api/ai-characters")
    async def list_characters(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        rows = await db.ai_characters.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return [_char_public(c) for c in rows]

    @router.post("/api/ai-characters")
    async def create_character(body: CreateCharacterBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        voice_id = parse_voice_id(body.voice)
        doc = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "username": body.username.strip().lstrip("@")[:30],
            "avatar_url": (body.avatar_url or "").strip() or default_avatar,
            "persona": body.persona.strip(),
            "your_name": body.your_name.strip(),
            "nickname": body.nickname.strip(),
            "relationship": body.relationship.strip(),
            "memories": [],
            "voice_id": voice_id,
            "voice_valid": await _voice_exists(voice_id),
            "created_by": current["id"],
            "created_at": _now(),
        }
        await db.ai_characters.insert_one(dict(doc))
        return _char_public(doc)

    @router.put("/api/ai-characters/{char_id}")
    async def update_character(char_id: str, body: CreateCharacterBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await _get_char(char_id)
        voice_id = parse_voice_id(body.voice)
        upd = {
            "name": body.name.strip(),
            "username": body.username.strip().lstrip("@")[:30],
            "avatar_url": (body.avatar_url or "").strip() or default_avatar,
            "persona": body.persona.strip(),
            "your_name": body.your_name.strip(),
            "nickname": body.nickname.strip(),
            "relationship": body.relationship.strip(),
            "voice_id": voice_id,
            "voice_valid": await _voice_exists(voice_id),
        }
        await db.ai_characters.update_one({"id": char_id}, {"$set": upd})
        return _char_public(await _get_char(char_id))

    @router.post("/api/ai-characters/{char_id}/memory")
    async def add_memory(char_id: str, body: MemoryBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await _get_char(char_id)
        mem = {"id": str(uuid.uuid4()), "text": body.text.strip(), "created_at": _now().isoformat()}
        await db.ai_characters.update_one({"id": char_id}, {"$push": {"memories": mem}})
        return _char_public(await _get_char(char_id))

    @router.delete("/api/ai-characters/{char_id}/memory/{mem_id}")
    async def delete_memory(char_id: str, mem_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await _get_char(char_id)
        await db.ai_characters.update_one({"id": char_id}, {"$pull": {"memories": {"id": mem_id}}})
        return _char_public(await _get_char(char_id))

    @router.delete("/api/ai-characters/{char_id}")
    async def delete_character(char_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await _get_char(char_id)
        await db.ai_characters.delete_one({"id": char_id})
        await db.ai_char_messages.delete_many({"character_id": char_id})
        return {"status": "deleted", "id": char_id}

    # ---------- Chat (admin) ----------
    @router.get("/api/ai-characters/{char_id}/thread")
    async def get_thread(char_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        c = await _get_char(char_id)
        rows = await db.ai_char_messages.find(
            {"character_id": char_id, "admin_id": current["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        return {"character": _char_public(c), "messages": [_msg_out(r) for r in rows]}

    @router.delete("/api/ai-characters/{char_id}/thread")
    async def clear_thread(char_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.ai_char_messages.delete_many({"character_id": char_id, "admin_id": current["id"]})
        return {"status": "cleared"}

    @router.post("/api/ai-characters/{char_id}/send")
    async def send(char_id: str, body: SendBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        c = await _get_char(char_id)
        await _store(char_id, current["id"], "user", body.text)
        context = await _realworld_context(body.local_time, body.tz, body.lat, body.lon)
        try:
            reply = await _reply(c, current["id"], body.text, spoken=False, context=context)
        except Exception as e:
            logger.warning(f"ai-char reply error: {e}")
            raise HTTPException(502, f"{c['name']} is having trouble responding right now")
        msg = await _store(char_id, current["id"], "ai", _strip_tags(reply))
        audio = await _tts(c, reply)
        return {"message": _msg_out(msg), "audio_url": audio}

    @router.post("/api/ai-characters/{char_id}/voice-turn")
    async def voice_turn(char_id: str, body: VoiceTurnBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        c = await _get_char(char_id)
        if body.greeting:
            import random
            nick = (c.get("nickname") or c.get("your_name") or "").strip()
            word = random.choice(["Hey", "Hi", "Hiya", "Yo", "Heyy", "Hey there"])
            display = f"{word}, {nick}!" if nick else f"{word}!"
            spoken = f"[warmly] {display}"  # performed by the voice, stripped from the caption
        else:
            if not body.text.strip():
                raise HTTPException(400, "Nothing to respond to")
            await _store(char_id, current["id"], "user", body.text)
            context = await _realworld_context(body.local_time, body.tz, body.lat, body.lon)
            try:
                spoken = await _reply(c, current["id"], body.text, spoken=True, context=context)
            except Exception as e:
                logger.warning(f"ai-char voice reply error: {e}")
                raise HTTPException(502, f"{c['name']} is having trouble responding right now")
            display = _strip_tags(spoken)
            await _store(char_id, current["id"], "ai", display)
        audio = await _tts(c, spoken)
        return {"reply": display, "audio_url": audio}

    @router.post("/api/ai-characters/stt")
    async def stt(audio: UploadFile = File(...), current: dict = Depends(get_current_user)):
        _require_admin(current)
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        if not eleven_key:
            raise HTTPException(503, "Voice isn't configured yet")
        content = await audio.read()
        if not content:
            raise HTTPException(400, "Empty audio")

        def _transcribe() -> str:
            import io
            from elevenlabs.client import ElevenLabs
            client = ElevenLabs(api_key=eleven_key)
            r = client.speech_to_text.convert(file=io.BytesIO(content), model_id="scribe_v1")
            return r.text if hasattr(r, "text") else str(r)

        try:
            text = await asyncio.to_thread(_transcribe)
        except Exception as e:
            logger.warning(f"ai-char stt error: {e}")
            await _flag_elevenlabs(e)
            raise HTTPException(502, "Couldn't understand the audio")
        return {"text": (text or "").strip()}

    return router
