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
import random
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None


def _local_now(tz: str):
    """Current time in the user's IANA timezone, or None if unknown/invalid."""
    if tz and ZoneInfo:
        try:
            return datetime.now(ZoneInfo(tz))
        except Exception:
            return None
    return None


def _next_local_hour_utc(local_now, target_hour: int):
    """UTC datetime of the next time the user's local clock hits target_hour."""
    target = local_now.replace(hour=target_hour, minute=random.randint(0, 30), second=0, microsecond=0)
    if target <= local_now:
        target += timedelta(days=1)
    return target.astimezone(timezone.utc)


def _routine_anchors(age, sleep_start, sleep_end):
    """Natural moments (local decimal hours) a school-age kid has a free beat to text."""
    if age is None or age > 17:
        return []
    goodnight = (sleep_start - 0.5) % 24       # right before bed
    morning = (sleep_end + 0.25) % 24          # just after waking
    base = [morning, 7.5, 10.25, 12.25, 15.25, 17.5, goodnight]  # wake, leave-for-school, recess, lunch, after-school, evening, goodnight
    return sorted({round(h, 2) for h in base})


def _next_anchor_utc(local_now, anchors):
    """UTC datetime of the next routine anchor after ~36min from now, else None."""
    if not anchors:
        return None
    cur = local_now.hour + local_now.minute / 60
    ahead = [h for h in anchors if h > cur + 0.6]
    if ahead:
        h, day = min(ahead), local_now
    else:
        h, day = min(anchors), local_now + timedelta(days=1)
    hh = int(h)
    mm = int(round((h - hh) * 60)) % 60
    target = day.replace(hour=hh, minute=mm, second=0, microsecond=0)
    return target.astimezone(timezone.utc)


# words that mean "I'll contact you again at <moment>", mapped to a local decimal hour
_CONTACT_MOMENTS = [
    (re.compile(r"\brecess\b"), 10.25),
    (re.compile(r"\blunch(\s*break|\s*time)?\b"), 12.25),
    (re.compile(r"\b(after school|get(ting)? home|home from school|out of school|end of school)\b"), 15.25),
    (re.compile(r"\b(leave|leaving|head(ing)? (out|to school)|on my way to school|before school)\b"), 7.5),
    (re.compile(r"\b(tonight|this evening)\b"), 19.0),
]


def _parse_next_contact(text, local_now, sleep_start, sleep_end):
    """Scan the character's OWN outgoing text for a promise to reach out again and
    return the next matching local time as a UTC datetime (soonest wins), else None.
    Pure/free — no LLM. Honors things like 'I'll text you at 8:30am' or 'at lunch'."""
    if not text or local_now is None:
        return None
    t = text.lower()

    def _build(hour_f, require_future=True):
        hh = int(hour_f)
        mm = int(round((hour_f - hh) * 60)) % 60
        d = local_now.replace(hour=hh % 24, minute=mm, second=0, microsecond=0)
        if require_future and d <= local_now:
            d += timedelta(days=1)
        return d

    cands = []
    # explicit clock times: "8:30 am", "at 3pm", "around 10 pm"
    for m in re.finditer(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)", t):
        hr = int(m.group(1))
        mn = int(m.group(2) or 0)
        if hr == 0 or hr > 12 or mn > 59:
            continue
        pm = m.group(3).startswith("p")
        hr24 = (hr % 12) + (12 if pm else 0)
        cands.append(_build(hr24 + mn / 60))
    # named daily moments
    for rx, hour_f in _CONTACT_MOMENTS:
        if rx.search(t):
            cands.append(_build(hour_f))
    # good-morning / before-bed relative to this character's own schedule
    if re.search(r"\b(good ?morning|in the morning|when i wake)\b", t):
        cands.append(_build((sleep_end + 0.25) % 24))
    if re.search(r"\b(good ?night|goodnight|before bed|before i sleep|bed ?time)\b", t):
        cands.append(_build((sleep_start - 0.5) % 24))
    # "tomorrow" with no specific time → next morning
    if re.search(r"\btomorrow\b", t) and not cands:
        d = _build((sleep_end + 1) % 24)
        if d <= local_now:
            d += timedelta(days=1)
        cands.append(d)

    future = [c for c in cands if c > local_now]
    return min(future).astimezone(timezone.utc) if future else None

import settings_store

TTS_MODEL = "eleven_v3"  # most expressive — supports audio tags ([laughs], [sighs], [crying]…)
TTS_FALLBACK_MODEL = "eleven_multilingual_v2"  # used if v3 is unavailable for the account/voice

# Proactive "human-like" texting. Cadence is PERSONALITY-PACED: each character picks
# its own next check-in time — someone attached texts within hours (even daily), a
# distant/upset one waits days or doesn't reach out at all.
PROACTIVE_TICK_SEC = 900          # scheduler wakes every 15 min
PROACTIVE_MIN_IDLE_MIN = 60       # at least 1h of quiet before a character considers reaching out
PROACTIVE_NEXT_MIN_H = 1          # clamp the character's self-chosen next check-in (hours)
PROACTIVE_NEXT_MAX_H = 120        # distant characters can go up to ~5 days
PROACTIVE_MAX_UNANSWERED = 3      # stop texting after this many ignored check-ins (until they reply)

# Emotion / non-verbal cues the character may embed in replies; performed by eleven_v3
# and stripped from the text shown on screen.
AUDIO_TAG_RE = re.compile(r"\[[a-zA-Z][a-zA-Z '\-]{0,24}\]")

_WEATHER_CACHE = {}  # (lat2, lon2) -> (context_str, epoch_seconds); 15-min TTL to avoid per-turn latency

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


ACTION_RE = re.compile(r"\*+[^*\n]{1,100}?\*+")  # *laughs softly* / **grins** roleplay actions


def _strip_actions(text: str) -> str:
    """Remove *roleplay actions* from TEXT messages (kept during calls). Also tidies
    leftover spacing/punctuation."""
    cleaned = ACTION_RE.sub("", text or "")
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return re.sub(r"\s+([,.!?])", r"\1", cleaned).strip()


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


AFFECTION_LEVELS = {
    "adores": "You adore them and are deeply attached — warm, affectionate and attentive. You hate going long without talking.",
    "warm": "You like them and are friendly and warm. You enjoy talking with them.",
    "neutral": "You're cordial but not especially warm — polite, measured.",
    "distant": "You're somewhat distant and reserved with them. You rarely reach out first.",
    "dislikes": "You don't particularly like them — curt, keep your distance, and almost never reach out first.",
}


class CreateCharacterBody(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    username: str = Field(min_length=1, max_length=30)
    avatar_url: Optional[str] = None
    persona: str = Field(min_length=1, max_length=1500)
    voice: str = Field(default="", max_length=400)  # raw voice id or ElevenLabs link
    your_name: str = Field(default="", max_length=60)      # the person's real name
    nickname: str = Field(default="", max_length=60)       # what the character calls them
    relationship: str = Field(default="", max_length=500)  # how they know each other
    age: Optional[int] = Field(default=None, ge=1, le=120)  # drives age-appropriate talk + bedtime
    affection: str = Field(default="warm", max_length=20)   # how much they like the user
    sleep_start: Optional[int] = Field(default=None, ge=0, le=23)  # bedtime hour override (0-23)
    sleep_end: Optional[int] = Field(default=None, ge=0, le=23)    # wake hour override (0-23)


def _age_sleep_default(age: Optional[int]):
    """A realistic (bedtime_hour, wake_hour) in local time for a given age."""
    if age is None:
        return (23, 7)
    if age <= 5:
        return (19, 7)
    if age <= 12:
        return (20, 7)
    if age <= 17:
        return (22, 7)
    if age <= 25:
        return (0, 8)
    if age <= 64:
        return (23, 7)
    return (22, 6)


def _sleep_window(c: dict):
    start = c.get("sleep_start")
    end = c.get("sleep_end")
    d_start, d_end = _age_sleep_default(c.get("age"))
    return (d_start if start is None else int(start), d_end if end is None else int(end))


def _is_asleep(hour: int, start: int, end: int) -> bool:
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end  # window wraps past midnight


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
            "age": c.get("age"),
            "affection": c.get("affection", "warm"),
            "sleep_start": c.get("sleep_start"),
            "sleep_end": c.get("sleep_end"),
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
        if c.get("age"):
            age = int(c["age"])
            who.append(f"You are {age} years old — talk, think, react and reference your daily life exactly like "
                       f"someone that age would (vocabulary, interests, school/work, energy, bedtime).")
        aff = AFFECTION_LEVELS.get(c.get("affection", "warm"))
        if aff:
            who.append(f"How you genuinely feel about them: {aff}")
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
                     "breathing and pauses. Never read a tag out loud or explain it. Keep each reply to 1-3 short "
                     "sentences so you respond quickly and the call feels snappy.")
        return base

    async def _realworld_context(local_time: str, tz: str, lat, lon) -> str:
        """Builds a 'this is true right now' block from the user's device clock and live weather."""
        parts = []
        if local_time:
            parts.append(f"Current local time on their phone: {local_time}" + (f" ({tz})" if tz else ""))
        if lat is not None and lon is not None:
            key = (round(float(lat), 2), round(float(lon), 2))
            cached = _WEATHER_CACHE.get(key)
            nowts = datetime.now(timezone.utc).timestamp()
            if cached and nowts - cached[1] < 900:  # reuse weather for 15 min (avoids per-turn latency)
                if cached[0]:
                    parts.append(cached[0])
            else:
                wx = ""
                try:
                    async with httpx.AsyncClient(timeout=4) as client:
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
                except Exception as e:
                    logger.warning(f"weather lookup failed: {e}")
                _WEATHER_CACHE[key] = (wx, nowts)
                if wx:
                    parts.append(wx)
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
            # Faithful to the pasted voice, NO added accent/theatrical drift:
            # max similarity to the source voice + zero style keeps delivery neutral.
            stream = client.text_to_speech.convert(
                text=text, voice_id=voice_id, model_id=model_id, output_format="mp3_44100_128",
                voice_settings=VoiceSettings(stability=0.5, similarity_boost=1.0, style=0.0, use_speaker_boost=True),
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
        out = []
        for c in rows:
            pub = _char_public(c)
            last = await db.ai_char_messages.find_one(
                {"character_id": c["id"], "admin_id": current["id"]}, sort=[("created_at", -1)])
            pub["last_message"] = _msg_out(last) if last else None
            state = await db.ai_char_state.find_one({"character_id": c["id"], "admin_id": current["id"]}) or {}
            last_read = await _coerce_dt(state.get("last_read_at"))
            q = {"character_id": c["id"], "admin_id": current["id"], "role": "ai"}
            if last_read:
                q["created_at"] = {"$gt": last_read}
            pub["unread"] = await db.ai_char_messages.count_documents(q)
            out.append(pub)
        # surface threads with the most recent activity first
        out.sort(key=lambda p: (p.get("last_message") or {}).get("created_at") or "", reverse=True)
        return out

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
            "age": body.age,
            "affection": (body.affection or "warm").strip().lower(),
            "sleep_start": body.sleep_start,
            "sleep_end": body.sleep_end,
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
            "age": body.age,
            "affection": (body.affection or "warm").strip().lower(),
            "sleep_start": body.sleep_start,
            "sleep_end": body.sleep_end,
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
        # opening the thread marks it read (clears the unread badge)
        await db.ai_char_state.update_one(
            {"character_id": char_id, "admin_id": current["id"]},
            {"$set": {"last_read_at": _now()}}, upsert=True)
        return {"character": _char_public(c), "messages": [_msg_out(r) for r in rows]}

    @router.delete("/api/ai-characters/{char_id}/thread")
    async def clear_thread(char_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.ai_char_messages.delete_many({"character_id": char_id, "admin_id": current["id"]})
        return {"status": "cleared"}

    async def _capture_promise(char_id: str, admin_id: str, ai_text: str, tz: str):
        """If the character's own reply promises a next contact time ('I'll text you at
        8:30am', 'at lunch', 'after school'), schedule a proactive text for then (free, no LLM)."""
        local_now = _local_now(tz)
        if local_now is None:
            return
        c = await db.ai_characters.find_one({"id": char_id})
        if not c:
            return
        s_start, s_end = _sleep_window(c)
        when = _parse_next_contact(ai_text, local_now, s_start, s_end)
        if not when:
            return
        state = await db.ai_char_state.find_one({"character_id": char_id, "admin_id": admin_id}) or {}
        cur_eval = await _coerce_dt(state.get("next_eval_at"))
        upd = {"promised_at": when}
        if not cur_eval or when < cur_eval:
            upd["next_eval_at"] = when
        await db.ai_char_state.update_one(
            {"character_id": char_id, "admin_id": admin_id}, {"$set": upd}, upsert=True)

    @router.post("/api/ai-characters/{char_id}/send")
    async def send(char_id: str, body: SendBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        c = await _get_char(char_id)
        await _store(char_id, current["id"], "user", body.text)
        if body.tz:
            await db.ai_char_state.update_one(
                {"character_id": char_id, "admin_id": current["id"]},
                {"$set": {"tz": body.tz}}, upsert=True)
        context = await _realworld_context(body.local_time, body.tz, body.lat, body.lon)
        try:
            reply = await _reply(c, current["id"], body.text, spoken=False, context=context)
        except Exception as e:
            logger.warning(f"ai-char reply error: {e}")
            raise HTTPException(502, f"{c['name']} is having trouble responding right now")
        clean = _strip_actions(_strip_tags(reply))
        msg = await _store(char_id, current["id"], "ai", clean)
        # If she said she'd reach out again at a set time/moment, remember it so she keeps her word.
        await _capture_promise(char_id, current["id"], clean, body.tz)
        # Texting is silent by design — voice only plays during a call (/voice-turn).
        # NOTE: we intentionally do NOT push here. This reply is a response to a message
        # the user JUST sent while looking at the chat, and the client reveals it with a
        # realistic "thinking + typing" delay. Pushing now would fire a banner BEFORE the
        # typing finishes. The client shows a notification itself only if the tab is hidden
        # when the reply actually renders. (Proactive, unprompted texts still push.)
        return {"message": _msg_out(msg), "audio_url": None}

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
            if body.tz:
                await db.ai_char_state.update_one(
                    {"character_id": char_id, "admin_id": current["id"]},
                    {"$set": {"tz": body.tz}}, upsert=True)
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

    # ---------- Proactive human-like texting (#4) ----------
    async def _coerce_dt(v):
        if isinstance(v, str):
            try:
                v = datetime.fromisoformat(v)
            except Exception:
                return None
        if isinstance(v, datetime) and v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v if isinstance(v, datetime) else None

    async def _proactive_decide(c: dict, transcript: str, idle_min: int, unanswered: int, time_ctx: str = ""):
        """Ask the character (in-character) whether a real person with their personality
        would text right now, what they'd say, AND when they'd naturally reach out next.
        Returns (should_send, message, next_hours)."""
        import json
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys = _system(c, spoken=False)
        sys += (
            "\n\nRIGHT NOW you are deciding whether to TEXT this person on your own — unprompted — because "
            "time has passed since you last talked. Behave EXACTLY like a real person with YOUR personality, "
            "YOUR age, and YOUR genuine feelings about them would. Weigh ALL of these together: your personality, "
            "how much you like them, your age and daily routine, the current time of day for them, and what you "
            "last talked about.\n"
            "- Deeply attached (a devoted parent, child, partner, best friend who adores them): you reach out "
            "OFTEN — you'd hate going a day without a word; check in, say you miss them, ask about their day, "
            "reference your chats. A child who loves them says goodnight before bed and good morning.\n"
            "- Friendly / normal: you reach out within a day or so.\n"
            "- Cold / distant / annoyed / dislikes them: you rarely text first, keep it short if you do — or you "
            "don't reach out at all.\n"
            "- Respect your age's routine: a young kid is in bed early and texts around after-school/evening; a "
            "teen or adult stays up later. NEVER text in the middle of your own sleeping hours.\n"
            + (time_ctx + "\n" if time_ctx else "")
            + f"- It's been about {idle_min} minutes of silence. You've sent {unanswered} unanswered check-in(s); "
            "if they keep ignoring you and that's not your nature, give them space.\n"
            "ALSO decide when you'd naturally message again next, as a NUMBER OF HOURS from now: deeply attached "
            "~2-8 (even a few times a day), friendly ~12-24, distant ~24-72, cold/upset ~72-120.\n"
            "Reply with STRICT JSON and nothing else: {\"text\": true|false, \"message\": \"...\", \"next_hours\": <number>}. "
            "If you wouldn't reach out now, still set text=false but give next_hours. The message is a single, "
            "natural text of 1-2 sentences — no markdown, no stage directions, no surrounding quotes, in your voice."
        )
        chat = LlmChat(
            api_key=settings_store.get("EMERGENT_LLM_KEY"),
            session_id=f"aichar-proactive-{c['id']}",
            system_message=sys,
        ).with_model("anthropic", "claude-sonnet-4-6")
        prompt = (f"Recent conversation:\n{transcript}\n\n" if transcript else "You two haven't talked in a while.\n\n") + "Decide now."
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = (resp or "").strip()
        try:
            data = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
            try:
                nh = float(data.get("next_hours"))
            except (TypeError, ValueError):
                nh = 24.0
            return (bool(data.get("text")),
                    _strip_actions(_strip_tags(str(data.get("message") or ""))).strip(),
                    nh)
        except Exception:
            return False, "", 24.0

    async def _proactive_once():
        now = datetime.now(timezone.utc)
        chars = await db.ai_characters.find({}).to_list(500)
        # Flatten to (character, admin) pairs, shuffle so the same character isn't
        # always first, and send AT MOST ONE proactive text per admin per pass — so a
        # user never gets several characters texting at the same moment. Passes are
        # 15 min apart and each thread's next check is randomly spread over hours.
        pairs = []
        for c in chars:
            for admin_id in await db.ai_char_messages.distinct("admin_id", {"character_id": c["id"]}):
                pairs.append((c, admin_id))
        random.shuffle(pairs)
        sent_admins = set()
        for c, admin_id in pairs:
            if admin_id in sent_admins:
                continue
            try:
                last = await db.ai_char_messages.find_one(
                    {"character_id": c["id"], "admin_id": admin_id}, sort=[("created_at", -1)])
                if not last:
                    continue
                state = await db.ai_char_state.find_one({"character_id": c["id"], "admin_id": admin_id}) or {}
                unanswered = int(state.get("unanswered", 0) or 0)
                # user replied since our last check-in → reset the ignore counter
                if last.get("role") == "user" and unanswered:
                    await db.ai_char_state.update_one(
                        {"character_id": c["id"], "admin_id": admin_id},
                        {"$set": {"unanswered": 0}}, upsert=True)
                    unanswered = 0
                last_at = await _coerce_dt(last.get("created_at"))
                if not last_at:
                    continue
                idle_min = (now - last_at).total_seconds() / 60

                # A promise she made ("I'll text you at 8:30 / at lunch") that's now due
                # overrides the normal quiet/pacing gates — she keeps her word.
                promised = await _coerce_dt(state.get("promised_at"))
                promise_due = bool(promised and now >= promised)

                if idle_min < PROACTIVE_MIN_IDLE_MIN and not promise_due:
                    continue
                # Each thread re-checks at its own personality-paced time. Not due yet → skip.
                next_eval = await _coerce_dt(state.get("next_eval_at"))
                if next_eval and now < next_eval and not promise_due:
                    continue

                # Age-appropriate realism: compute the user's local time + this character's
                # sleep window and daily-routine anchor points up front.
                local_now = _local_now(state.get("tz"))
                sleep_start, sleep_end = _sleep_window(c)
                anchors = _routine_anchors(c.get("age"), sleep_start, sleep_end) \
                    if (c.get("affection", "warm") in ("adores", "warm")) else []

                def _schedule(next_hours):
                    # clamp + ±15% jitter so it's not clockwork
                    h = max(PROACTIVE_NEXT_MIN_H, min(PROACTIVE_NEXT_MAX_H, next_hours or 24))
                    h *= 0.85 + random.random() * 0.3
                    nxt = now + timedelta(hours=h)
                    # For school-age, warm/attached kids, snap to the next natural routine
                    # moment (recess, lunch, after-school, goodnight) if it comes sooner —
                    # so she texts around her real daily beats, not just every N hours.
                    if local_now is not None and anchors:
                        a = _next_anchor_utc(local_now, anchors)
                        if a and now + timedelta(minutes=40) < a < nxt:
                            nxt = a
                    return {"last_checked_at": now, "next_eval_at": nxt, "promised_at": None}

                time_ctx = ""
                if local_now is not None:
                    lh = local_now.hour
                    time_ctx = (f"- It is currently {local_now.strftime('%A %I:%M %p')} where they are. "
                                f"Your usual bedtime is about {sleep_start:02d}:00 and you wake around {sleep_end:02d}:00.")
                    if _is_asleep(lh, sleep_start, sleep_end):
                        wake_utc = _next_local_hour_utc(local_now, sleep_end)
                        await db.ai_char_state.update_one(
                            {"character_id": c["id"], "admin_id": admin_id},
                            {"$set": {"last_checked_at": now, "next_eval_at": wake_utc, "promised_at": None}}, upsert=True)
                        continue

                if unanswered >= PROACTIVE_MAX_UNANSWERED and not promise_due:
                    await db.ai_char_state.update_one(
                        {"character_id": c["id"], "admin_id": admin_id}, {"$set": _schedule(72)}, upsert=True)
                    continue
                if promise_due:
                    time_ctx += ("\n- IMPORTANT: Earlier you told them you'd reach out right about now "
                                 "(you promised a specific time/moment). Keep your word — send that text now.")
                hist = await db.ai_char_messages.find(
                    {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "role": 1, "text": 1}
                ).sort("created_at", -1).limit(30).to_list(30)
                hist.reverse()
                transcript = "\n".join(f"{'User' if m['role'] == 'user' else c['name']}: {m['text']}" for m in hist)
                should, message, next_hours = await _proactive_decide(c, transcript, int(idle_min), unanswered, time_ctx)
                if promise_due:
                    should = True  # a promise is honored as long as she produced a message
                if not should or not message:
                    # character chose not to reach out now — recheck at their own pace
                    await db.ai_char_state.update_one(
                        {"character_id": c["id"], "admin_id": admin_id}, {"$set": _schedule(next_hours)}, upsert=True)
                    continue
                await _store(c["id"], admin_id, "ai", message)
                upd = _schedule(next_hours)
                upd["last_proactive_at"] = now
                await db.ai_char_state.update_one(
                    {"character_id": c["id"], "admin_id": admin_id},
                    {"$set": upd, "$inc": {"unanswered": 1}}, upsert=True)
                # if this proactive text itself promises a next moment, honor that too
                await _capture_promise(c["id"], admin_id, message, state.get("tz"))
                sent_admins.add(admin_id)
                try:
                    await send_web_push(admin_id, c["name"], message, url=f"/messages/ai_{c['id']}", extra={"suppressIfFocused": True})
                except Exception:
                    pass
            except Exception as e:
                logger.warning(f"ai-char proactive error {c.get('id')}/{admin_id}: {e}")

    async def proactive_loop():
        await asyncio.sleep(60)  # let the app finish booting
        while True:
            try:
                if settings_store.get("EMERGENT_LLM_KEY"):
                    await _proactive_once()
            except Exception as e:
                logger.warning(f"ai-char proactive_loop error: {e}")
            await asyncio.sleep(PROACTIVE_TICK_SEC)

    router.proactive_loop = proactive_loop
    return router
