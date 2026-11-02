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
import os
import random
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated, List, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
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


def _now_context(tz: str) -> str:
    """Authoritative, unambiguous current date + time built from the user's timezone.
    Injected into every prompt so characters never guess or drift to a stale date."""
    ln = _local_now(tz)
    label = tz
    if ln is None:
        ln = datetime.now(timezone.utc)
        label = "UTC"
    try:
        today = ln.strftime("%A, %B %-d, %Y")
        timestr = ln.strftime("%-I:%M %p")
        tomorrow = (ln + timedelta(days=1)).strftime("%A, %B %-d")
    except Exception:
        today = ln.strftime("%A, %B %d, %Y")
        timestr = ln.strftime("%I:%M %p")
        tomorrow = (ln + timedelta(days=1)).strftime("%A, %B %d")
    days_to_sun = ((6 - ln.weekday()) % 7) or 7  # upcoming Sunday (never "today")
    sunday = (ln + timedelta(days=days_to_sun))
    try:
        sunday_s = sunday.strftime("%A, %B %-d")
    except Exception:
        sunday_s = sunday.strftime("%A, %B %d")
    return (
        f"Today's date is {today}. The current local time is {timestr}"
        + (f" ({label})" if label else "") + ". "
        f"Tomorrow is {tomorrow}. The upcoming Sunday is {sunday_s}. "
        "This is the REAL, authoritative current date and time — always use it; "
        "never state a different date/day/time and never guess the date."
    )


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

TTS_MODEL = "eleven_v4"  # newest, most expressive — supports audio tags ([laughs], [sighs], [crying]…)
TTS_FALLBACK_MODEL = "eleven_v3"  # used if v4 is unavailable for the account/voice (still tag-expressive)
# Premade voices that always exist on any ElevenLabs account — used as a last
# resort when a character's configured custom voice_id is missing from the
# connected account (voice_not_found), so calls/voice notes still speak instead
# of going silent.
FALLBACK_VOICE_FEMALE = "EXAVITQu4vr4xnSDxMaL"  # Sarah
FALLBACK_VOICE_MALE = "JBFqnCBsd6RMkjVDRZzb"    # George

# Proactive "human-like" texting. Cadence is PERSONALITY-PACED: each character picks
# its own next check-in time — someone attached texts within hours (even daily), a
# distant/upset one waits days or doesn't reach out at all.
PROACTIVE_TICK_SEC = 900          # scheduler wakes every 15 min
PROACTIVE_MIN_IDLE_MIN = 60       # at least 1h of quiet before a character considers reaching out
PROACTIVE_NEXT_MIN_H = 1          # clamp the character's self-chosen next check-in (hours)
PROACTIVE_NEXT_MAX_H = 120        # distant characters can go up to ~5 days
PROACTIVE_MAX_UNANSWERED = 3      # stop texting after this many ignored check-ins (until they reply)

LIVE_TICK_SEC = 25               # live-chat comment loop cadence
LIVE_MAX_COMMENTS = 6            # max AI comments per character per live session
LIVE_MAX_CHARS_PER_LIVE = 3      # at most this many of a user's characters comment on one live

# Emotion / non-verbal cues the character may embed in replies; performed by eleven_v4
# and stripped from the text shown on screen.
AUDIO_TAG_RE = re.compile(r"\[[a-zA-Z][a-zA-Z '\-]{0,24}\]")

_WEATHER_CACHE = {}  # (lat2, lon2) -> (context_str, epoch_seconds); 15-min TTL to avoid per-turn latency
_WARM_AT = {}  # (char_id, admin_id) -> epoch; de-dupes call-start connection warm-ups (60s)

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


# Whisper/soft/quiet performance tags — stripped from TTS so eleven_v4 never randomly
# whispers (the model over-used these and it read as fake/annoying). Normal emotion tags
# ([laughs], [excited], [sad]…) are untouched.
_WHISPER_TAG_RE = re.compile(
    r"\[[^\]]*\b(?:whisper|soft|quiet|hush|murmur|mutter|under[ -]?breath|low[ -]?voice|breathy|sotto)\w*[^\]]*\]",
    re.IGNORECASE)


def _strip_whisper(text: str) -> str:
    return re.sub(r"\s{2,}", " ", _WHISPER_TAG_RE.sub("", text or "")).strip()


ACTION_RE = re.compile(r"\*+[^*\n]{1,100}?\*+")  # *laughs softly* / **grins** roleplay actions


def _strip_actions(text: str) -> str:
    """Remove *roleplay actions* from TEXT messages (kept during calls). Also tidies
    leftover spacing/punctuation."""
    cleaned = ACTION_RE.sub("", text or "")
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return re.sub(r"\s+([,.!?])", r"\1", cleaned).strip()


# Genuine non-verbal SOUND tags eleven performs reliably. Everything else in
# brackets (mood labels like [excited], [sad], [nervous]) is removed before TTS
# because some voices read the label out loud literally instead of acting it.
_SOUND_TAG_ALLOW = {
    "laughs", "laugh", "laughing", "giggles", "giggle", "chuckles", "chuckle",
    "sighs", "sigh", "gasps", "gasp", "sniffles", "sniffle", "crying", "sobs",
    "sob", "exhales", "inhales", "yawns", "coughs", "hums", "clears throat",
    "gulps", "scoffs", "snorts", "whistles",
}


def _strip_spoken_tags(text: str) -> str:
    """Keep real sound-effect tags; drop mood/emotion label tags so they are never
    spoken aloud (e.g. she acts excited instead of saying the word '[excited]')."""
    def repl(m):
        inner = m.group(0)[1:-1].strip().lower()
        return m.group(0) if inner in _SOUND_TAG_ALLOW else ""
    cleaned = AUDIO_TAG_RE.sub(repl, text or "")
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def _humanize_gap(seconds: int) -> str:
    """Plain-words elapsed time so the character grounds call timing instead of guessing."""
    m = max(0, int(seconds)) // 60
    if m < 1:
        return "less than a minute ago"
    if m < 60:
        return f"about {m} minute{'s' if m != 1 else ''} ago"
    h = m // 60
    if h < 24:
        return f"about {h} hour{'s' if h != 1 else ''} ago"
    d = h // 24
    return f"about {d} day{'s' if d != 1 else ''} ago"


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


class ScheduleBlock(BaseModel):
    start: str = Field(default="", max_length=5)   # "HH:MM"
    end: str = Field(default="", max_length=5)     # "HH:MM" (optional for point events)
    activity: str = Field(default="", max_length=60)
    busy: bool = False                             # busy = can't text/call during this
    weekdays_only: bool = False                    # school/work etc. — skipped on weekends


class RelationItem(BaseModel):
    character_id: str = Field(min_length=1, max_length=60)
    relation: str = Field(min_length=1, max_length=40)   # e.g. "mother", "daughter", "sister", "friend"


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
    schedule: list[ScheduleBlock] = Field(default_factory=list)    # full day timetable
    allow_calls: bool = False                                      # may this character call the user?
    voice_affinity: float = Field(default=0.4, ge=0.0, le=1.0)     # how often they choose to send a voice note vs text
    allow_live: bool = True                                        # may this character join & comment on the user's lives?
    relationships: list[RelationItem] = Field(default_factory=list)  # links to other characters


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


def _hhmm(s):
    """'HH:MM' -> decimal hour float, else None."""
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*$", str(s or ""))
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h + mi / 60 if h <= 23 and mi <= 59 else None


def _todays_blocks(schedule, local_now):
    """Blocks that apply today (weekdays_only blocks are dropped on Sat/Sun)."""
    weekend = local_now.weekday() >= 5
    out = []
    for b in schedule or []:
        if b.get("weekdays_only") and weekend:
            continue
        st = _hhmm(b.get("start"))
        if st is None:
            continue
        en = _hhmm(b.get("end"))
        out.append({"start": st, "end": en if en is not None else st,
                    "activity": (b.get("activity") or "").strip(), "busy": bool(b.get("busy"))})
    return out


def _busy_now(schedule, local_now):
    """(is_busy, next_free_local_hour|None). Busy = inside a busy block and NOT inside a
    free block (recess/lunch free blocks override the busy school block)."""
    blocks = _todays_blocks(schedule, local_now)
    cur = local_now.hour + local_now.minute / 60
    in_free = any(b["start"] <= cur < b["end"] for b in blocks if not b["busy"] and b["end"] > b["start"])
    covering = [b for b in blocks if b["busy"] and b["start"] <= cur < b["end"] and b["end"] > b["start"]]
    if in_free or not covering:
        return (False, None)
    end = min(b["end"] for b in covering)
    free_starts = [b["start"] for b in blocks if not b["busy"] and cur < b["start"] <= end]
    return (True, min(free_starts) if free_starts else end)


def _free_anchors(schedule, local_now):
    """Local hours the character is free and would naturally reach out: the start of each
    free block, plus the end of each busy block (free afterwards)."""
    anchors = set()
    for b in _todays_blocks(schedule, local_now):
        anchors.add(round(b["end"] if b["busy"] else b["start"], 2))
    return sorted(a for a in anchors if 0 <= a < 24)


def _schedule_lines(schedule):
    """Static daily timetable, for the character's self-awareness in prompts."""
    parts = []
    for b in schedule or []:
        st, en, act = b.get("start"), b.get("end"), (b.get("activity") or "").strip()
        if not st or not act:
            continue
        tag = " (busy)" if b.get("busy") else " (free)"
        if b.get("weekdays_only"):
            tag += " [school/work days]"
        parts.append(f"{st}{('-' + en) if en else ''} {act}{tag}")
    return parts


def _schedule_now_ctx(schedule, local_now):
    """Time-relative 'right now you are…' line for prompts."""
    blocks = _todays_blocks(schedule, local_now)
    cur = local_now.hour + local_now.minute / 60
    active = [b for b in blocks if b["start"] <= cur < b["end"] and b["end"] > b["start"]]
    active.sort(key=lambda b: b["busy"])  # a free block wins over an overlapping busy one
    if active:
        b = active[0]
        verb = "busy with" if b["busy"] else "free during"
        mm = int(round((b["end"] % 1) * 60))
        return f"- Right now you are {verb} {b['activity'] or 'your schedule'} (until about {int(b['end']):02d}:{mm:02d})."
    return "- Right now you have nothing scheduled — you're free."


def _reply_delay_seconds(affection):
    """Human-paced reply latency when the character is free: usually seconds, sometimes
    a couple minutes, occasionally ~5 min. Slower the less they like you."""
    r = random.random()
    if affection == "adores":
        if r < 0.45:
            return random.randint(4, 25)
        if r < 0.8:
            return random.randint(30, 120)
        return random.randint(120, 300)
    if affection == "warm":
        if r < 0.3:
            return random.randint(8, 40)
        if r < 0.75:
            return random.randint(60, 240)
        return random.randint(240, 360)
    # neutral / distant / dislikes — they take their time
    if r < 0.5:
        return random.randint(90, 300)
    return random.randint(300, 600)


def _cloudinary_resized(url: str) -> str:
    """Cap an uploaded image to a sane size as JPEG for vision analysis (smaller payload)."""
    if url and "/image/upload/" in url:
        return url.replace("/image/upload/", "/image/upload/w_1280,h_1280,c_limit,q_auto,f_jpg/")
    return url


def _video_mime(url: str) -> str:
    u = (url or "").lower()
    for ext, mime in ((".webm", "video/webm"), (".mov", "video/quicktime"),
                      (".m4v", "video/mp4"), (".avi", "video/x-msvideo"), (".mkv", "video/x-matroska")):
        if ext in u:
            return mime
    return "video/mp4"


class MemoryBody(BaseModel):
    text: str = Field(min_length=1, max_length=400)


class ThoughtBody(BaseModel):
    thought: str = Field(min_length=1, max_length=600)


class SendBody(BaseModel):
    text: str = Field(default="", max_length=2000)
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image" | "video" | "audio"
    audio_duration: Optional[float] = None  # voice-note length in seconds
    local_time: str = Field(default="", max_length=80)   # time as shown on the user's device
    tz: str = Field(default="", max_length=60)
    lat: Optional[float] = None
    lon: Optional[float] = None


class CallEventBody(BaseModel):
    event: str = Field(default="start", max_length=10)  # "start" | "end"
    duration: int = 0  # seconds (for "end")


class ReactionBody(BaseModel):
    emoji: str = Field(default="", max_length=16)


class VoiceTurnBody(BaseModel):
    text: str = Field(default="", max_length=2000)
    greeting: bool = False
    speakers: str = Field(default="", max_length=2000)  # diarization note when >1 voice heard
    local_time: str = Field(default="", max_length=80)
    tz: str = Field(default="", max_length=60)
    lat: Optional[float] = None
    lon: Optional[float] = None
    participants: List[str] = Field(default_factory=list)   # char ids currently on the call (incl. host)
    active_speaker: str = Field(default="", max_length=80)   # last character who spoke (continuity)


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

    async def _remember_tz(admin_id: str, tz: str):
        """Save the user's real timezone once we learn it (from any character/call) and
        backfill it onto ALL their characters' state, so EVERY character knows the exact
        real time/date — not just the ones that have been called."""
        if not tz:
            return
        await db.users.update_one({"id": admin_id}, {"$set": {"ai_tz": tz}})
        await db.ai_char_state.update_many({"admin_id": admin_id}, {"$set": {"tz": tz}})

    async def _admin_tz(admin_id: str) -> str:
        u = await db.users.find_one({"id": admin_id}, {"_id": 0, "ai_tz": 1}) or {}
        return u.get("ai_tz") or ""

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
            "schedule": c.get("schedule", []),
            "allow_calls": bool(c.get("allow_calls")),
            "voice_affinity": float(c.get("voice_affinity", 0.4)),
            "allow_live": bool(c.get("allow_live", True)),
            "relationships": c.get("relationships", []),
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
            who.append(f'Their pet-name to you is "{c["nickname"]}", but use it RARELY. Real people almost '
                       f'never say someone\'s name in every sentence — it sounds needy and fake. Most of your '
                       f'replies should NOT contain it at all; only let it slip out once in a while, like in a '
                       f'greeting or a genuinely heartfelt/excited moment. Never start consecutive replies with it.')
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
        sched = _schedule_lines(c.get("schedule"))
        if sched:
            base += ("\nYour daily schedule (live your day around this — mention what you're doing/"
                     "about to do when it's natural, and you can only text or call during free moments):\n"
                     + "\n".join(f"- {s}" for s in sched) + "\n")
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
                     "that the voice will PERFORM (not say): [laughs], [giggles], [sighs], "
                     "[excited], [sad], [crying], [nervously], [gasps], [clears throat]. Use them naturally and "
                     "sparingly where the emotion genuinely fits, and use ellipses (…) and commas for natural "
                     "breathing and pauses. Always speak in a normal, natural speaking voice — never "
                     "whisper or lower your voice. Never read a tag out loud or explain it. Reply at whatever "
                     "length feels natural — a short line, or a long flowing paragraph when you have a lot to say."
                     " Above all, sound like a REAL person on the phone, NOT an assistant or a chatbot: use "
                     "everyday casual words and contractions (gonna, wanna, yeah, kinda, I dunno), react in the "
                     "moment, interrupt yourself or trail off sometimes, and let it be a little messy and "
                     "spontaneous. Talk exactly at your age with your own slang, energy and interests. NEVER be "
                     "polished, over-helpful or explain-y, never ask 'how can I help' or neatly wrap things up, "
                     "and never sound scripted, formal or robotic."
                     " NEVER ask assistant-style meta or clarifying questions like 'were you asking me or someone "
                     "else?', 'did you mean…?', 'can you repeat that?' or 'what would you like to do?'. If you only "
                     "half-catch something, just react in the moment like a real kid would — guess, roll with it, "
                     "laugh, change the subject, or blurt whatever's on your mind. Use kid grammar: short excited "
                     "bursts, run-on sentences, 'like', 'omg', 'wait wait', starting over mid-thought. It's totally "
                     "fine to be a little off-topic, silly or imperfect — that's what makes you feel real.")
        else:
            base += ("\n\nRIGHT NOW you are TEXTING — typed messages in a chat, NOT on a call. Write like a real "
                     "text message (casual, natural length). Do NOT use spoken audio cues like [laughs] or [sighs] "
                     "(those are only for calls). In the history, lines marked '(on the phone)' were things said "
                     "out loud on an earlier voice call — remember them, and you can naturally reference 'when we "
                     "talked on the phone' vs what was texted.")
        return base

    async def _fetch_weather(key, lat, lon) -> None:
        """Refresh the weather cache in the BACKGROUND — never on a call's critical path."""
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
        _WEATHER_CACHE[key] = (wx, datetime.now(timezone.utc).timestamp())

    async def _realworld_context(local_time: str, tz: str, lat, lon) -> str:
        """'True right now' block from the device clock + live weather. NEVER blocks the
        turn on the weather HTTP call — uses the cached value and refreshes in the
        background, so replies come back instantly (especially the first turn of a call)."""
        parts = []
        if local_time:
            parts.append(f"Current local time on their phone: {local_time}" + (f" ({tz})" if tz else ""))
        if lat is not None and lon is not None:
            key = (round(float(lat), 2), round(float(lon), 2))
            cached = _WEATHER_CACHE.get(key)
            nowts = datetime.now(timezone.utc).timestamp()
            if cached:
                if cached[0]:
                    parts.append(cached[0])
                if nowts - cached[1] >= 900:  # stale → refresh for next turn, don't wait
                    asyncio.create_task(_fetch_weather(key, lat, lon))
            else:
                # First time at this location — don't make her wait; weather joins next turn.
                asyncio.create_task(_fetch_weather(key, lat, lon))
        return "\n".join(parts)

    async def _relatives(c: dict):
        """Other characters this character is linked to, as (char_doc, relation) pairs."""
        out = []
        for r in (c.get("relationships") or []):
            rc = await db.ai_characters.find_one({"id": r.get("character_id")}, {"_id": 0})
            if rc:
                out.append((rc, (r.get("relation") or "").strip()))
        return out

    def _relation_of(a: dict, b_id: str) -> str:
        for r in (a.get("relationships") or []):
            if r.get("character_id") == b_id:
                return (r.get("relation") or "").strip()
        return ""

    async def _relatives_text(c: dict) -> str:
        rels = await _relatives(c)
        if not rels:
            return ""
        parts = [f"your {rel or 'friend'} {rc['name']} (@{rc['username']})" for rc, rel in rels]
        return ("People in your life — real people you actually know and text with (mention them "
                "naturally and remember what they tell you): " + "; ".join(parts) + ".")

    async def _convo_context(admin_id: str, char_id: str) -> str:
        msgs = await db.ai_char_convos.find(
            {"admin_id": admin_id, "$or": [{"from_id": char_id}, {"to_id": char_id}]},
            {"_id": 0, "from_name": 1, "to_name": 1, "text": 1}
        ).sort("created_at", -1).limit(10).to_list(10)
        if not msgs:
            return ""
        msgs.reverse()
        lines = [f"{m['from_name']} → {m['to_name']}: {m['text']}" for m in msgs]
        return ("Recent PRIVATE texts you exchanged with people in your life (you remember all of this "
                "and already know it — reference it naturally, never act surprised about it):\n"
                + "\n".join(lines))

    async def _char_available(c: dict, admin_id: str, tz_fallback: str = "") -> bool:
        st = await db.ai_char_state.find_one(
            {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "tz": 1}) or {}
        ln = _local_now(st.get("tz") or tz_fallback)
        ss, se = _sleep_window(c)
        if ln is not None and _is_asleep(ln.hour, ss, se):
            return False
        sched = c.get("schedule") or []
        if sched and ln is not None and _busy_now(sched, ln)[0]:
            return False
        return (c.get("affection") or "").strip().lower() not in ("distant", "dislikes")

    async def _exchange_lines(a: dict, b: dict, seed: str = "", scenario: str = "catchup",
                              user_name: str = "") -> list:
        """Generate a short back-and-forth between two characters. Returns a list of
        ('A'|'B', text) tuples (tags like [laughs] kept for voice performance)."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        rel_ba = _relation_of(a, b["id"]) or "someone they know"
        rel_ab = _relation_of(b, a["id"]) or "someone they know"
        un = user_name or a.get("your_name") or b.get("your_name") or "the person they both know"
        sys = (
            "You write a short, natural conversation between two people. Keep it real and casual.\n"
            f"Person A is {a['name']}: {a.get('persona', '')[:280]}\n"
            f"Person B is {b['name']}: {b.get('persona', '')[:280]}\n"
            f"{a['name']} is {b['name']}'s {rel_ba}. {b['name']} is {a['name']}'s {rel_ab}.\n"
            "Format EVERY line EXACTLY as 'A: <words>' or 'B: <words>'. No narration, no quotes. "
            "You may add short spoken cues in brackets like [laughs] or [calling out].")
        if scenario == "overhear":
            task = (
                f"{a['name']} is on a phone call with {un} right this second. {un} just asked {a['name']} to "
                f"ask {b['name']}: \"{seed}\". Write {a['name']} calling out to {b['name']} (who is nearby, in "
                f"another room), {b['name']} answering casually from a distance, a quick natural back-and-forth, "
                f"and the FINAL line is {a['name']} turning back to the phone to tell {un} what {b['name']} said. "
                "Start with A. 4 to 6 lines total.")
        else:
            task = (f"{a['name']} texts {b['name']}. "
                    + (f'{un} asked {a["name"]} to tell {b["name"]}: "{seed}". Work it in naturally. '
                       if seed else f"They catch up about their day and about {un}. ")
                    + "Write 4 to 6 short alternating lines, starting with A.")
        try:
            chat = LlmChat(api_key=settings_store.get("EMERGENT_LLM_KEY"),
                           session_id=f"xchar-{a['id']}-{b['id']}-{scenario}",
                           system_message=sys).with_model("anthropic", "claude-sonnet-4-6")
            resp = await chat.send_message(UserMessage(text=task))
        except Exception as e:
            logger.warning(f"exchange-lines error {a['id']}/{b['id']}: {e}")
            return []
        out = []
        for raw in (resp or "").splitlines():
            line = raw.strip()
            up = line.upper()
            if up.startswith("A:"):
                who = "A"
            elif up.startswith("B:"):
                who = "B"
            else:
                continue
            text = _strip_actions(line[2:].strip()).strip().strip('"')[:500]
            if text:
                out.append((who, text))
        return out

    async def _run_char_exchange(admin_id: str, a: dict, b: dict, seed: str = "") -> int:
        """Generate + store a short private conversation between a and b (context only,
        never shown to the user)."""
        lines = await _exchange_lines(a, b, seed=seed)
        if not lines:
            return 0
        base = _now()
        docs = []
        for i, (who, raw) in enumerate(lines):
            frm, to = (a, b) if who == "A" else (b, a)
            text = _strip_tags(raw)
            if not text:
                continue
            docs.append({
                "id": str(uuid.uuid4()), "admin_id": admin_id,
                "pair_key": "|".join(sorted([a["id"], b["id"]])),
                "from_id": frm["id"], "from_name": frm["name"],
                "to_id": to["id"], "to_name": to["name"],
                "text": text, "created_at": base + timedelta(seconds=i)})
        if docs:
            await db.ai_char_convos.insert_many(docs)
        return len(docs)

    _RELATION_SYNONYMS = {
        "mother": ["mom", "mum", "mommy", "mama", "momma", "ma"],
        "father": ["dad", "daddy", "papa", "pa", "pops"],
        "daughter": ["girl"],
        "son": ["boy"],
        "sister": ["sis"],
        "brother": ["bro"],
        "grandmother": ["grandma", "granny", "nana", "gran"],
        "grandfather": ["grandpa", "gramps", "grandad", "granddad"],
        "wife": ["wifey"],
        "husband": ["hubby"],
        "girlfriend": ["gf"],
        "boyfriend": ["bf"],
        "partner": [],
        "friend": ["bestie", "bff"],
        "aunt": ["auntie"],
        "uncle": [],
        "cousin": [],
    }

    def _relation_tokens(rc: dict, relation: str) -> list:
        """Words the user might use to refer to this relative: their first name, the relation,
        and common synonyms (so 'tell my mom' matches a 'mother' relation)."""
        toks = set()
        first = (rc.get("name", "").split() or [""])[0].lower()
        if len(first) >= 2:
            toks.add(first)
        rel = (relation or "").strip().lower()
        if len(rel) >= 2:
            toks.add(rel)
            for canon, syns in _RELATION_SYNONYMS.items():
                if rel == canon or rel in syns:
                    toks.add(canon)
                    toks.update(syns)
        return [t for t in toks if len(t) >= 2]

    async def _match_relative(c: dict, text: str):
        """Return (rc, rel) if the user's text refers to one of c's relatives, else None."""
        low = (text or "").lower()
        for rc, rel in await _relatives(c):
            for t in _relation_tokens(rc, rel):
                if re.search(rf"\b{re.escape(t)}\b", low):
                    return rc, rel
        return None

    def _wants_passphone(text: str) -> bool:
        low = (text or "").lower()
        if re.search(r"\bput\s+\w+\s+(back\s+)?on\b", low):  # "put mom on", "put hope back on"
            return True
        return any(k in low for k in (
            "pass the phone", "pass it to", "pass me to", "pass me back", "hand the phone", "hand it to",
            "give the phone", "put your", "put her on", "put him on", "put her back", "put him back",
            "back on the phone", "switch back", "let me talk to", "let me speak to",
            "can i talk to", "can i speak to", "talk to your", "speak to your"))

    def _wants_relay(text: str) -> bool:
        low = (text or "").lower()
        return any(k in low for k in (
            "ask your", "ask her", "ask him", "tell your", "tell her", "tell him",
            "message your", "text your", "let your", "check with", "find out from", "ask my"))

    _VOCATIVES = {
        "mother": "Mom", "father": "Dad", "grandmother": "Grandma", "grandfather": "Grandpa",
        "aunt": "Auntie", "uncle": "Uncle", "sister": "Sis", "brother": "Bro",
        "wife": "Honey", "husband": "Honey", "girlfriend": "Babe", "boyfriend": "Babe",
    }

    def _vocative(host: dict, rc: dict) -> str:
        """What the host would call this relative OUT LOUD (e.g. 'Mom') — never their name."""
        rel = (_relation_of(host, rc["id"]) or "").strip().lower()
        if rel in _VOCATIVES:
            return _VOCATIVES[rel]
        for canon, syns in _RELATION_SYNONYMS.items():
            if (rel == canon or rel in syns) and canon in _VOCATIVES:
                return _VOCATIVES[canon]
        return rc["name"].split()[0]

    def _addr_tokens(p: dict, host: dict) -> list:
        """Words the user might use to address this participant on a group call."""
        toks = set()
        fn = (p.get("name", "").split() or [""])[0].lower()
        if len(fn) >= 2:
            toks.add(fn)
        if p["id"] != host["id"]:
            for t in _relation_tokens(p, _relation_of(host, p["id"])):
                toks.add(t)
        return [t for t in toks if len(t) >= 2]

    def _is_addressed(p: dict, host: dict, low: str) -> bool:
        """True ONLY when the user explicitly ASKS to talk to / switch to this person
        ('let me talk to Hope', 'put Hope back on', 'pass me to Hope'). Merely saying
        or mentioning their name — even at the start of a sentence — must NOT switch
        who's answering; the current speaker keeps the line."""
        for t in _addr_tokens(p, host):
            et = re.escape(t)
            patterns = [
                rf"\b(?:talk|speak|chat) to {et}\b",
                rf"\blet me (?:talk|speak|chat) (?:to )?{et}\b",
                rf"\b(?:can|could|may|wanna|i wanna|i want to|i'd like to|lemme) (?:i )?(?:talk|speak|chat) (?:to )?{et}\b",
                rf"\bput {et}\b",                                  # "put Hope on / back on"
                rf"\bpass (?:me |it |the phone )?(?:to|back to) {et}\b",
                rf"\b(?:give|hand) (?:me )?(?:the phone|it) (?:to|back to) {et}\b",
                rf"\bswitch (?:to|back to) {et}\b",
                rf"\bback to {et}\b",
                rf"\bbring {et} back\b",
                rf"\b(?:can|could) {et} come back\b",
                rf"\b{et},? come back\b",
            ]
            if any(re.search(p_, low) for p_ in patterns):
                return True
        return False


    def _wants_join(text: str) -> bool:
        low = (text or "").lower()
        if _wants_passphone(text):
            return True
        return any(k in low for k in (
            "bring ", "get your", "get her on", "get him on", "can she join", "can he join",
            "join the call", "join us", "add your", "on the call", "come say hi",
            "both of you", "talk to both", "speak to both", "all of you on"))

    def _group_sys(speaker: dict, others: list, user_name: str) -> str:
        names = ", ".join(o["name"].split()[0] for o in others) or "others"
        return (f"RIGHT NOW you are on a GROUP voice call with {names}"
                + (f" and {user_name}" if user_name else "")
                + ". Everyone hears everyone. Speak ONLY as yourself, in your own voice — natural and "
                "fairly brief. React to what was just said, don't repeat what the others say, and NEVER "
                "announce or say your own name.")

    async def _gen_message(c: dict, admin_id: str, instruction: str, context: str = "",
                           spoken: bool = False) -> str:
        """One-off in-character generation (e.g. a relative proactively texting the user).
        spoken=True lets the model embed performable audio cues ([crying], [sighs]…) for a
        voice message so the emotion is actually heard."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        st = await db.ai_char_state.find_one(
            {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "tz": 1}) or {}
        ctx = _now_context(st.get("tz") or await _admin_tz(admin_id)) + (("\n" + context) if context else "")
        _rt = await _relatives_text(c)
        if _rt:
            ctx += "\n" + _rt
        chat = LlmChat(api_key=settings_store.get("EMERGENT_LLM_KEY"),
                       session_id=f"aichar-{c['id']}-{admin_id}",
                       system_message=_system(c, spoken, ctx)).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=instruction))
        return (resp or "").strip()

    async def _relative_pings_user(admin_id: str, relayer: dict, relative: dict, user_text: str):
        """After a relay, the RELATIVE reaches out to the user ('Hope said you messaged me')."""
        try:
            rel_word = _relation_of(relative, relayer["id"]) or "family"
            instr = (
                f"Your {rel_word} {relayer['name']} just reached out to you to pass along a message from "
                f"{relative.get('your_name') or 'the person you both love'}, who said: \"{user_text}\". "
                f"Now YOU send that person a short, warm text — let them know {relayer['name'].split()[0]} "
                "passed it on. Write ONLY the text message, nothing else.")
            msg = _strip_actions(_strip_tags(await _gen_message(relative, admin_id, instr)))
            if not msg:
                return
            await _store(relative["id"], admin_id, "ai", msg)
            await db.ai_char_state.update_one(
                {"character_id": relative["id"], "admin_id": admin_id},
                {"$set": {"last_proactive_at": _now()}}, upsert=True)
            try:
                await send_web_push(admin_id, relative["name"], msg,
                                    url=f"/messages/ai_{relative['id']}", extra={"suppressIfFocused": True})
            except Exception:
                pass
        except Exception as e:
            logger.warning(f"relative-ping error: {e}")

    async def _maybe_relay_to_relative(c: dict, admin_id: str, user_text: str):
        """If the user told this character to pass a message to one of its relatives, start a
        private conversation between them AND have the relative reach out to the user."""
        rels = await _relatives(c)
        if not rels:
            return
        low = user_text.lower()
        if not any(v in low for v in ("tell ", "message ", "text ", "ask ", "let ", "know", "remind", "send ", "talk to", "reach out")):
            return
        for rc, rel in rels:
            toks = _relation_tokens(rc, rel)
            if any(re.search(rf"\b{re.escape(t)}\b", low) for t in toks):
                # Only actually reach the relative if they're awake & free right now. If
                # they're asleep/busy, we DON'T wake them — the host's own reply will say
                # they'll pass it on later, and the relative won't message about it.
                if await _char_available(rc, admin_id):
                    await _run_char_exchange(admin_id, c, rc, seed=user_text)
                    await _relative_pings_user(admin_id, c, rc, user_text)
                return

    def _tline(cname: str, m: dict) -> str:
        """Render one history line; system events (call started/ended) shown as [event].
        Lines spoken during a voice call are tagged so the character knows, later while
        texting, that that part of the history happened ON THE PHONE (not typed)."""
        if m.get("role") == "system":
            return f"[{m.get('text', '')}]"
        tag = "(on the phone) " if m.get("channel") == "call" else ""
        return f"{tag}{'User' if m['role'] == 'user' else cname}: {m.get('text', '')}"

    async def _build_reply_chat(c: dict, admin_id: str, user_text: str, context: str,
                                spoken: bool, fast: bool):
        """Build the (LlmChat, prompt) for a reply. Shared by the normal path and the
        streaming call path so both use identical model/history/brief."""
        from emergentintegrations.llm.chat import LlmChat
        # On live calls, read LESS back-history and answer SHORT so the reply comes back
        # fast (less "thinking"). Same model/voice — just a lighter, snappier turn.
        hist_limit = 14 if fast else 40
        # Independent reads — run them concurrently so she answers right away.
        st, _rt, _cc, history = await asyncio.gather(
            db.ai_char_state.find_one({"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "tz": 1}),
            _relatives_text(c),
            _convo_context(admin_id, c["id"]),
            db.ai_char_messages.find(
                {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "role": 1, "text": 1, "channel": 1}
            ).sort("created_at", -1).limit(hist_limit).to_list(hist_limit),
        )
        st = st or {}
        context = _now_context(st.get("tz") or await _admin_tz(admin_id)) + ("\n" + context if context else "")
        if _rt:
            context += "\n" + _rt
        if _cc:
            context += "\n" + _cc
        history.reverse()
        transcript = "\n".join(_tline(c['name'], m) for m in history)
        chat = LlmChat(
            api_key=settings_store.get("EMERGENT_LLM_KEY"),
            session_id=f"aichar-{c['id']}-{admin_id}",
            system_message=_system(c, spoken, context),
        ).with_model("anthropic", "claude-haiku-4-5-20251001" if fast else "claude-sonnet-4-6")
        if fast:
            # Keep phone replies short and snappy so she doesn't monologue, and so the
            # streamed audio stays smooth (fewer sentences => fewer segments => fewer gaps).
            chat = chat.with_params(max_tokens=260)
        brief = ("\n\nThis is a live phone call — talk like a real person on the phone: keep it SHORT and "
                 "natural, usually ONE or TWO sentences. Answer, maybe add a quick thought, then stop and let "
                 "them talk. Only go longer if they explicitly ask you to explain or tell a story. Never "
                 "monologue, never pad, never give a speech." if fast else "")
        prompt = (f"Recent conversation:\n{transcript}\n\n" if transcript else "") + (
            f'The user just said: "{user_text}"\n\nRespond as {c["name"]}.' + brief
        )
        return chat, prompt

    async def _reply(c: dict, admin_id: str, user_text: str, spoken: bool, context: str = "",
                     fast: bool = False) -> str:
        from emergentintegrations.llm.chat import UserMessage
        chat, prompt = await _build_reply_chat(c, admin_id, user_text, context, spoken, fast)
        resp = await chat.send_message(UserMessage(text=prompt))
        return (resp or "").strip()

    # Sentence boundary used to flush spoken chunks to TTS as the LLM writes them.
    _SENT_END = re.compile(r'[.!?…\n]')

    async def _stream_fast_reply(c: dict, admin_id: str, user_text: str, context: str):
        """Live-call streaming: as the LLM writes the reply, synthesize each finished
        sentence and yield {audio, text} segments so she starts speaking almost
        instantly. Yields a final {done: True, reply: <full clean text>} sentinel."""
        from emergentintegrations.llm.chat import UserMessage
        try:
            from emergentintegrations.llm.chat import TextDelta
        except Exception:
            TextDelta = None
        chat, prompt = await _build_reply_chat(c, admin_id, user_text, context, spoken=True, fast=True)

        async def _seg(spoken_seg: str):
            seg = spoken_seg.strip()
            if not seg:
                return None
            disp = _strip_actions(_strip_tags(seg)).strip()
            audio = await _tts_bytes(c, seg)
            if audio:
                return {"audio": "data:audio/mpeg;base64," + base64.b64encode(audio).decode(), "text": disp}
            if disp:
                return {"audio": None, "text": disp}
            return None

        buf = ""
        clean_parts: List[str] = []
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            # IMPORTANT: only TextDelta carries incremental tokens. StreamDone also has
            # a `.content` with the FULL text — using it would stream the reply twice.
            if not (TextDelta and isinstance(ev, TextDelta)):
                continue
            delta = ev.content
            if not delta:
                continue
            buf += delta
            # Flush strategy tuned for smooth audio on slower (production) networks:
            #   - FIRST segment: flush at an early clause boundary so she starts talking fast.
            #   - LATER segments: wait for a bigger chunk (>= MIN_SEG chars) and cut at the
            #     LAST sentence end, so each audio piece is long enough to mask the next
            #     segment's synth+network time instead of cutting in and out.
            MIN_SEG = 160
            while True:
                cut = None
                if not clean_parts:
                    se = _SENT_END.search(buf)
                    if se:
                        cut = se.end()
                    else:
                        cl = re.search(r'[,;:]|—|–', buf)
                        if cl and len(buf[:cl.start()].split()) >= 1:
                            cut = cl.end()
                elif len(buf) >= MIN_SEG:
                    ends = list(_SENT_END.finditer(buf))
                    if ends:
                        cut = ends[-1].end()
                if cut is None:
                    break
                seg, buf = buf[:cut], buf[cut:]
                if len(seg.strip()) < 2:
                    continue
                out = await _seg(seg)
                if out:
                    clean_parts.append(out["text"])
                    yield out
        if buf.strip():
            out = await _seg(buf)
            if out:
                clean_parts.append(out["text"])
                yield out
        yield {"done": True, "reply": " ".join(p for p in clean_parts if p).strip()}

    async def _media_reply(c: dict, admin_id: str, user_text: str, media_url: str,
                           media_type: str, context: str = "") -> str:
        """Look at a photo/video the user sent and reply in-character about it. Uses Gemini
        (handles both images and video). Images are fetched resized; video to a temp file."""
        import base64
        import os
        import tempfile
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType
        st = await db.ai_char_state.find_one(
            {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "tz": 1}) or {}
        context = _now_context(st.get("tz") or await _admin_tz(admin_id)) + ("\n" + context if context else "")
        history = await db.ai_char_messages.find(
            {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "role": 1, "text": 1}
        ).sort("created_at", -1).limit(20).to_list(20)
        history.reverse()
        transcript = "\n".join(_tline(c['name'], m) for m in history if m.get("text"))
        chat = LlmChat(
            api_key=settings_store.get("EMERGENT_LLM_KEY"),
            session_id=f"aichar-media-{c['id']}-{admin_id}",
            system_message=_system(c, spoken=False, context=context),
        ).with_model("gemini", "gemini-2.5-flash")
        kind = {"video": "video", "audio_file": "audio clip"}.get(media_type, "photo")
        verb = "listen to" if media_type == "audio_file" else "look at"
        sense = "hear in it (music, sounds, a voice, the vibe)" if media_type == "audio_file" else "see in it"
        audio_note = (" If there's singing or a speaking voice, listen carefully to the VOICE itself and "
                      "get the singer's gender right — a higher/female voice is a woman ('she/her'), a "
                      "lower/male voice is a man ('he/him'). Don't assume or guess the gender; go by what "
                      "you actually hear." if media_type == "audio_file" else "")
        prompt = ((f"Recent conversation:\n{transcript}\n\n" if transcript else "")
                  + (f'They just sent you {("an " + kind) if kind == "audio clip" else ("a " + kind)} and said: "{user_text}"\n\n' if user_text.strip()
                     else f"They just sent you {('an ' + kind) if kind == 'audio clip' else ('a ' + kind)} (no caption).\n\n")
                  + f"Actually {verb} the {kind} and react naturally, warmly and in-character as {c['name']} — "
                  + f"comment on what you genuinely {sense}." + audio_note
                  + " Keep it to a text message, no stage directions.")
        tmp = None
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                if media_type == "video":
                    rr = await client.get(media_url)
                    rr.raise_for_status()
                    fd, tmp = tempfile.mkstemp(suffix=os.path.splitext(media_url.split("?")[0])[1] or ".mp4")
                    os.write(fd, rr.content)
                    os.close(fd)
                    files = [FileContentWithMimeType(file_path=tmp, mime_type=_video_mime(media_url))]
                elif media_type == "audio_file":
                    rr = await client.get(media_url)
                    rr.raise_for_status()
                    fd, tmp = tempfile.mkstemp(suffix=os.path.splitext(media_url.split("?")[0])[1] or ".mp3")
                    os.write(fd, rr.content)
                    os.close(fd)
                    files = [FileContentWithMimeType(file_path=tmp, mime_type=_audio_mime_from_url(media_url))]
                else:
                    rr = await client.get(_cloudinary_resized(media_url))
                    rr.raise_for_status()
                    files = [ImageContent(image_base64=base64.b64encode(rr.content).decode())]
            resp = await chat.send_message(UserMessage(text=prompt, file_contents=files))
            return _strip_actions(_strip_tags((resp or "").strip()))
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass

    async def _tts_bytes(c: dict, text: str) -> Optional[bytes]:
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        voice_id = c.get("voice_id")
        if not eleven_key or not voice_id:
            return None
        # Never whisper: drop any whisper/soft/quiet tags before synthesis.
        text = _strip_whisper(text)

        def _synth(model_id: str, synth_text: str, vid: str) -> bytes:
            from elevenlabs import VoiceSettings
            from elevenlabs.client import ElevenLabs
            client = ElevenLabs(api_key=eleven_key)
            # Lower stability + some style = more emotional, spontaneous, alive delivery
            # (natural pacing swings, laughs/breathing) instead of flat/robotic. Keep
            # similarity_boost high so it stays faithful to the character's own voice.
            stream = client.text_to_speech.convert(
                text=synth_text, voice_id=vid, model_id=model_id, output_format="mp3_44100_128",
                voice_settings=VoiceSettings(stability=0.4, similarity_boost=0.9, style=0.35, use_speaker_boost=True),
            )
            return b"".join(stream)

        # Try the character's own voice first; if that voice isn't on the
        # connected ElevenLabs account (voice_not_found), fall back to a premade
        # voice so the character still speaks instead of going silent.
        gender = (c.get("gender") or c.get("voice_gender") or "").lower()
        fallback_voice = FALLBACK_VOICE_MALE if gender.startswith("m") else FALLBACK_VOICE_FEMALE
        voice_chain = [voice_id] if voice_id == fallback_voice else [voice_id, fallback_voice]

        # Model chain. v4/v3 support the [expressive] audio tags; the final
        # multilingual_v2 attempt strips tags so a legacy voice stays audible.
        # Mood-label tags (e.g. [excited]) are removed up front so no voice can read
        # them aloud; genuine sound tags ([laughs], [sighs]…) are kept for expression.
        speak = _strip_spoken_tags(text)
        attempts = [(TTS_MODEL, speak), (TTS_FALLBACK_MODEL, speak), ("eleven_multilingual_v2", _strip_tags(text))]
        last_err = None
        for vid in voice_chain:
            missing_voice = False
            for model_id, synth_text in attempts:
                try:
                    return await asyncio.to_thread(_synth, model_id, synth_text, vid)
                except Exception as e:
                    last_err = e
                    msg = str(e)
                    logger.warning(f"ai-char tts failed on {model_id} (voice {str(vid)[:8]}): {msg[:160]}")
                    if "voice_not_found" in msg:
                        missing_voice = True
                        break  # this voice doesn't exist; skip models, try fallback voice
            if not missing_voice:
                break  # failures weren't about a missing voice — don't mask them with fallback
        if last_err:
            await _flag_elevenlabs(last_err)
        return None

    async def _tts(c: dict, text: str) -> Optional[str]:
        """Inline data-URI (used by live voice calls)."""
        audio = await _tts_bytes(c, text)
        return ("data:audio/mpeg;base64," + base64.b64encode(audio).decode()) if audio else None

    async def _upload_audio(data: bytes) -> Optional[str]:
        """Host mp3 bytes on PostMePlex object storage and return the public URL."""
        try:
            import storage as objstorage
            path = f"postmeplex/voice/{uuid.uuid4().hex}.mp3"
            await objstorage.put_object(path, data, "audio/mpeg")
            base = (os.environ.get("APP_PUBLIC_URL") or "").rstrip("/")
            return f"{base}/api/files/{path}"
        except Exception as e:
            logger.warning(f"ai-char audio upload failed: {e}")
            return None

    async def _tts_url(c: dict, text: str) -> Optional[str]:
        """Synthesize a voice note and host it on Cloudinary (stored in a message)."""
        audio = await _tts_bytes(c, text)
        return await _upload_audio(audio) if audio else None

    def _diarize_convert(content: bytes, diarize: bool = True):
        """Blocking ElevenLabs STT. With diarize=True it tags multiple speakers (voice
        notes); with diarize=False it's a plain, faster transcription (live calls, where
        there's only one known speaker and every millisecond of lag is felt)."""
        import io
        from elevenlabs.client import ElevenLabs
        client = ElevenLabs(api_key=settings_store.get("ELEVENLABS_API_KEY"))
        if not diarize:
            return client.speech_to_text.convert(file=io.BytesIO(content), model_id="scribe_v1")
        try:
            return client.speech_to_text.convert(file=io.BytesIO(content), model_id="scribe_v1",
                                                  diarize=True, tag_audio_events=True)
        except Exception:
            return client.speech_to_text.convert(file=io.BytesIO(content), model_id="scribe_v1")

    def _should_voice(c: dict, local_hour) -> bool:
        """Decide (per character) whether to send a VOICE note instead of text — weighted by
        the character's voice tendency + time of day, so it feels like a real personal choice."""
        if not (c.get("voice_id") and settings_store.get("ELEVENLABS_API_KEY")):
            return False
        p = float(c.get("voice_affinity", 0.4))
        try:
            h = local_hour if isinstance(local_hour, int) else local_hour.hour
        except Exception:
            h = 12
        if 6 <= h <= 10 or h >= 21 or h == 0:   # morning / late night → more voice notes
            p += 0.2
        elif 11 <= h <= 17:                       # midday → more likely to just text
            p -= 0.15
        return random.random() < max(0.0, min(0.95, p))

    def _audio_mime_from_url(url: str) -> str:
        u = (url or "").split("?")[0].lower()
        if u.endswith(".webm"):
            return "audio/webm"
        if u.endswith((".m4a", ".mp4", ".aac")):
            return "audio/mp4"
        if u.endswith(".ogg"):
            return "audio/ogg"
        if u.endswith(".wav"):
            return "audio/wav"
        return "audio/mpeg"

    def _audio_event_tags(r) -> list:
        tags = []
        try:
            for w in (getattr(r, "words", None) or []):
                if getattr(w, "type", "") == "audio_event":
                    t = (getattr(w, "text", "") or "").strip("() ").lower()
                    if t and t not in tags:
                        tags.append(t)
        except Exception:
            pass
        return tags

    async def _audio_env(content: bytes, mime: str = "audio/mpeg", stt_resp=None, deep: bool = True) -> str:
        """Short note about the BACKGROUND environment of an audio clip (music / TV /
        crowded / noisy), empty when quiet. Free STT audio-event tags always; a quick
        Gemini 'listen' only when deep=True (used for voice notes, not live-call turns)."""
        tags = _audio_event_tags(stt_resp)
        desc = ""
        if deep and content:
            import os
            import tempfile
            from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType
            suffix = {"audio/webm": ".webm", "audio/mp4": ".m4a", "audio/mpeg": ".mp3",
                      "audio/aac": ".aac", "audio/ogg": ".ogg", "audio/wav": ".wav"}.get(mime, ".mp3")
            tmp = None
            try:
                fd, tmp = tempfile.mkstemp(suffix=suffix)
                os.write(fd, content)
                os.close(fd)
                chat = LlmChat(
                    api_key=settings_store.get("EMERGENT_LLM_KEY"), session_id="audio-env",
                    system_message="You classify the BACKGROUND audio of a clip, ignoring the main speaker's words."
                ).with_model("gemini", "gemini-2.5-flash")
                prompt = ("Listen to the BACKGROUND of this audio (not what the main person is saying). "
                          "Reply with ONE short phrase for the environment: e.g. 'music playing', "
                          "'TV or a show on in the background', 'crowded, lots of chatter', 'noisy/loud', "
                          "'outdoors/wind', or exactly 'quiet' if nothing notable. 6 words max.")
                resp = await chat.send_message(UserMessage(
                    text=prompt, file_contents=[FileContentWithMimeType(file_path=tmp, mime_type=mime)]))
                desc = (resp or "").strip().strip('"').lower()
            except Exception as e:
                logger.warning(f"audio-env error: {e}")
            finally:
                if tmp and os.path.exists(tmp):
                    try:
                        os.remove(tmp)
                    except OSError:
                        pass
        notable = ""
        if desc and desc not in ("quiet", "silence", "silent", "nothing", "none", ""):
            notable = desc
        elif "music" in tags:
            notable = "music playing in the background"
        elif any(t in tags for t in ("laughter", "applause", "crowd", "chatter", "cheering")):
            notable = "other people and sounds in the background"
        if not notable:
            return ""
        return (f"BACKGROUND AUDIO around them right now: {notable}. If it fits, react naturally "
                "(ask about the music, notice the TV, or that it's loud/crowded) — don't force it.")

    def _parse_diarization(r, owner: str = "") -> tuple:
        """From an STT response, return (plain_text, speaker_note). speaker_note is a
        short in-context instruction, non-empty only when MORE THAN ONE voice is heard —
        so the character knows someone else is in the room and can greet them."""
        full = (getattr(r, "text", "") or "").strip()
        words = getattr(r, "words", None) or []
        segments, cur_sp, cur = [], None, []
        for w in words:
            sp = getattr(w, "speaker_id", None)
            txt = getattr(w, "text", "") or ""
            if getattr(w, "type", "word") == "spacing":
                cur.append(txt)
                continue
            if cur_sp is not None and sp is not None and sp != cur_sp:
                segments.append((cur_sp, "".join(cur).strip()))
                cur = []
            if sp is not None:
                cur_sp = sp
            cur.append(txt)
        if cur and cur_sp is not None:
            segments.append((cur_sp, "".join(cur).strip()))
        order = []
        for sp, _ in segments:
            if sp not in order:
                order.append(sp)
        if len(order) <= 1:
            return full, ""

        def _label(sp):
            idx = order.index(sp)
            if idx == 0:
                return f"{owner or 'the person you were talking to'} (the main voice)"
            if idx == 1:
                return "someone else in the room (a 2nd person)"
            return f"another person (voice #{idx + 1})"
        lines = [f'- {_label(sp)}: "{t}"' for sp, t in segments if t]
        note = ("MORE THAN ONE person was heard in this audio (the mic picked up multiple voices):\n"
                + "\n".join(lines)
                + "\n- The main voice is the person you know. A different voice is someone else there with them. "
                "If that other person said hi or spoke to you, warmly greet and answer them too, like meeting "
                "your person's friend. If someone introduces themselves or is introduced by name, remember that name.")
        return full, note

    async def _transcribe_url(url: str, owner: str = "") -> tuple:
        """Download a hosted voice note and transcribe it (so the character 'hears' it).
        Returns (plain_text, note) where note carries speaker + background-environment context."""
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        if not eleven_key or not url:
            return "", ""
        try:
            async with httpx.AsyncClient(timeout=60) as cl:
                content = (await cl.get(url)).content
        except Exception:
            return "", ""
        try:
            r = await asyncio.to_thread(_diarize_convert, content)
            text, spk = _parse_diarization(r, owner)
            env = await _audio_env(content, _audio_mime_from_url(url), r, deep=True)
            note = "\n".join(n for n in (spk, env) if n)
            return text, note
        except Exception as e:
            logger.warning(f"ai-char voice-note stt error: {e}")
            return "", ""

    async def _store(char_id: str, admin_id: str, role: str, text: str,
                     media_url: str = None, media_type: str = None,
                     audio_duration: float = None, channel: str = None) -> dict:
        doc = {"id": str(uuid.uuid4()), "character_id": char_id, "admin_id": admin_id,
               "role": role, "text": text, "created_at": _now()}
        if channel:
            doc["channel"] = channel   # 'call' = kept for memory but hidden from the chat thread
        if media_url:
            doc["media_url"] = media_url
            doc["media_type"] = media_type
            if audio_duration is not None:
                doc["audio_duration"] = audio_duration
        await db.ai_char_messages.insert_one(doc)
        return doc

    def _msg_out(doc: dict) -> dict:
        return {"id": doc["id"], "role": doc["role"], "text": doc["text"],
                "media_url": doc.get("media_url"), "media_type": doc.get("media_type"),
                "audio_duration": doc.get("audio_duration"),
                "reactions": doc.get("reactions", []),
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
                {"character_id": c["id"], "admin_id": current["id"], "channel": {"$ne": "call"}},
                sort=[("created_at", -1)])
            lm = _msg_out(last) if last else None
            if lm and lm.get("media_type") == "audio":
                lm["text"] = "🎤 Voice message"
            pub["last_message"] = lm
            state = await db.ai_char_state.find_one({"character_id": c["id"], "admin_id": current["id"]}) or {}
            last_read = await _coerce_dt(state.get("last_read_at"))
            q = {"character_id": c["id"], "admin_id": current["id"], "role": "ai", "channel": {"$ne": "call"}}
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
            "schedule": [b.model_dump() for b in body.schedule][:30],
            "allow_calls": bool(body.allow_calls),
            "voice_affinity": float(body.voice_affinity),
            "allow_live": bool(body.allow_live),
            "relationships": [r.model_dump() for r in body.relationships][:12],
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
            "schedule": [b.model_dump() for b in body.schedule][:30],
            "allow_calls": bool(body.allow_calls),
            "voice_affinity": float(body.voice_affinity),
            "allow_live": bool(body.allow_live),
            "relationships": [r.model_dump() for r in body.relationships][:12],
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

    @router.post("/api/ai-characters/{char_id}/thought")
    async def plant_thought(char_id: str, body: ThoughtBody,
                            current: Annotated[dict, Depends(get_current_user)]):
        """Admin drops a thought into the character's head and she acts on it right away —
        sends a text, a voice message, or places a call, exactly as the thought describes."""
        _require_admin(current)
        c = await _get_char(char_id)
        admin_id = current["id"]
        thought = body.thought.strip()
        low = thought.lower()
        if re.search(r"\b(voice|audio|voicemail|voice note|record)\b", low):
            mode = "voice"
        elif re.search(r"\b(call|phone|ring|facetime)\b", low):
            mode = "call"
        else:
            mode = "text"

        if mode == "call":
            now = _now()
            call = {"id": str(uuid.uuid4()), "character_id": c["id"], "admin_id": admin_id,
                    "status": "ringing", "created_at": now, "expires_at": now + timedelta(seconds=120)}
            await db.ai_char_calls.insert_one(call)
            await _store(c["id"], admin_id, "ai", f"📞 {c['name']} tried to call you")
            await db.ai_char_state.update_one(
                {"character_id": c["id"], "admin_id": admin_id},
                {"$set": {"last_proactive_at": now}}, upsert=True)
            try:
                await send_web_push(admin_id, f"📞 {c['name']} is calling you", "Tap to answer",
                                    url=f"/messages/ai_{c['id']}?incoming=1", extra={"incomingCall": True})
            except Exception:
                pass
            return {"ok": True, "mode": "call"}

        instr = (f'Right this second, this thought just popped into your head: "{thought}". '
                 "Act on it immediately — send the person a real message in your own voice, as if the "
                 "feeling just hit you. Write ONLY the message itself (what you'd actually send), nothing else.")
        if mode == "voice":
            instr += (" This is a VOICE message, so truly FEEL and PERFORM the emotion out loud — if you're "
                      "upset or crying, let your voice break and sob with cues like [crying], [sniffles], "
                      "[voice breaking], [choked up], and broken words (\"I-I just...\"); if happy, [laughs]/"
                      "[excited]. Put the emotion right into how it sounds.")
        try:
            # For a voice message, generate in SPOKEN mode so the model embeds performable
            # audio cues ([crying], [sniffles], [voice breaking], [sighs]…) — then synthesize
            # the TTS from that RAW tagged text so the emotion is actually heard. The caption
            # we store/show is the clean, tag-free version.
            raw = await _gen_message(c, admin_id, instr, spoken=(mode == "voice"))
        except Exception as e:
            logger.warning(f"ai-char thought gen error {char_id}: {e}")
            raise HTTPException(502, "Couldn't act on that thought — try again")
        message = _strip_actions(_strip_tags(raw))
        if not message:
            raise HTTPException(502, "Couldn't act on that thought — try again")

        audio_url = await _tts_url(c, raw) if mode == "voice" else None
        if mode == "voice" and audio_url:
            doc = await _store(c["id"], admin_id, "ai", message, audio_url, "audio")
        else:
            mode = "text"
            doc = await _store(c["id"], admin_id, "ai", message)
        await db.ai_char_state.update_one(
            {"character_id": c["id"], "admin_id": admin_id},
            {"$set": {"last_proactive_at": _now()}}, upsert=True)
        try:
            await send_web_push(admin_id, c["name"],
                                "🎤 Voice message" if mode == "voice" else message,
                                url=f"/messages/ai_{c['id']}", extra={"suppressIfFocused": True})
        except Exception:
            pass
        return {"ok": True, "mode": mode, "message": message, "msg": _msg_out(doc)}

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
            {"character_id": char_id, "admin_id": current["id"], "channel": {"$ne": "call"}}, {"_id": 0}
        ).sort("created_at", -1).to_list(500)
        rows.reverse()  # newest 500 in chronological order (don't strand recent messages past 500)
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

    @router.delete("/api/ai-characters/{char_id}/messages/{message_id}")
    async def delete_char_message(char_id: str, message_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        res = await db.ai_char_messages.delete_one(
            {"id": message_id, "character_id": char_id, "admin_id": current["id"]})
        if not res.deleted_count:
            raise HTTPException(404, "Message not found")
        return {"status": "deleted"}

    @router.post("/api/ai-characters/{char_id}/messages/{message_id}/reactions")
    async def react_char_message(char_id: str, message_id: str, body: ReactionBody,
                                 current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        q = {"id": message_id, "character_id": char_id, "admin_id": current["id"]}
        await db.ai_char_messages.update_one(q, {"$pull": {"reactions": {"user_id": current["id"]}}})
        r = await db.ai_char_messages.update_one(
            q, {"$push": {"reactions": {"user_id": current["id"], "emoji": body.emoji, "at": _now().isoformat()}}})
        if not r.matched_count:
            raise HTTPException(404, "Message not found")
        doc = await db.ai_char_messages.find_one(q, {"_id": 0, "reactions": 1})
        return {"reactions": (doc or {}).get("reactions", [])}

    @router.delete("/api/ai-characters/{char_id}/messages/{message_id}/reactions")
    async def unreact_char_message(char_id: str, message_id: str,
                                   current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        q = {"id": message_id, "character_id": char_id, "admin_id": current["id"]}
        await db.ai_char_messages.update_one(q, {"$pull": {"reactions": {"user_id": current["id"]}}})
        doc = await db.ai_char_messages.find_one(q, {"_id": 0, "reactions": 1})
        return {"reactions": (doc or {}).get("reactions", [])}

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
        if not body.text.strip() and not body.media_url:
            raise HTTPException(400, "Message must have text or a photo/video")
        media_type = body.media_type if body.media_type in ("image", "video", "audio", "audio_file") else None
        await _store(char_id, current["id"], "user", body.text, body.media_url, media_type,
                     audio_duration=body.audio_duration if media_type in ("audio", "audio_file") else None)
        # Decide WHEN the character replies — like a real person: sometimes within seconds,
        # sometimes a few minutes. If they're busy on their schedule, they reply only once
        # free. The reply itself is generated + delivered later by the reply loop, which
        # web-pushes you the moment it's actually sent (works even with the app closed).
        local_now = _local_now(body.tz)
        schedule = c.get("schedule") or []
        busy = False
        if schedule and local_now is not None:
            busy, next_free = _busy_now(schedule, local_now)
        now = _now()
        if busy and local_now is not None:
            free_utc = _next_local_hour_utc(local_now, int(next_free)) if next_free is not None else now + timedelta(minutes=30)
            reply_at = free_utc + timedelta(seconds=random.randint(20, 240))
        else:
            reply_at = now + timedelta(seconds=_reply_delay_seconds(c.get("affection", "warm")))
        setfields = {"pending_reply_at": reply_at, "pending_from": current["id"]}
        if body.tz:
            await _remember_tz(current["id"], body.tz)  # saves user.ai_tz + backfills all characters
        await db.ai_char_state.update_one(
            {"character_id": char_id, "admin_id": current["id"]},
            {"$set": setfields}, upsert=True)
        # If the user asked this character to pass a message to a relative, kick off a private
        # conversation between them (runs in the background; the relative will "already know").
        if body.text.strip():
            asyncio.create_task(_maybe_relay_to_relative(c, current["id"], body.text.strip()))
        # If the user asked to be CALLED and this character is allowed to call, ring them now
        # (when free); if busy, they'll reach out when free via their normal reply/call flow.
        if body.text.strip() and c.get("allow_calls") and _wants_call(body.text):
            if local_now is not None and not busy:
                when = _parse_next_contact(body.text, local_now, *_sleep_window(c))
                if when and when > now + timedelta(minutes=2):
                    await db.ai_char_state.update_one(
                        {"character_id": char_id, "admin_id": current["id"]},
                        {"$set": {"pending_call_at": when}}, upsert=True)
                else:
                    await _place_call(c, current["id"])
            elif local_now is None:
                await _place_call(c, current["id"])
        return {"pending": True, "reply_at": reply_at.isoformat(), "busy": busy}

    @router.post("/api/ai-characters/{char_id}/voice-turn")
    async def voice_turn(char_id: str, body: VoiceTurnBody, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        host = await _get_char(char_id)   # the call owner — always the on-screen character

        # Resolve everyone currently on the call (host is always included).
        part_ids = [p for p in (body.participants or []) if p]
        if char_id not in part_ids:
            part_ids = [char_id] + part_ids
        seen, participants = set(), []
        for pid in part_ids:
            if pid in seen:
                continue
            seen.add(pid)
            try:
                participants.append(await _get_char(pid))
            except Exception:
                pass
        if not participants:
            participants = [host]

        # Greeting (call start / incoming call) — NOT stored, so the call stays out of the chat.
        if body.greeting:
            nick = (host.get("nickname") or host.get("your_name") or "").strip()
            word = random.choice(["Hey", "Hi", "Hiya", "Yo", "Heyy", "Hey there"])
            display = f"{word}, {nick}!" if nick else f"{word}!"
            spoken = f"[warmly] {display}"
            return {"reply": display, "audio_url": await _tts(host, spoken)}

        if not body.text.strip():
            raise HTTPException(400, "Nothing to respond to")
        if body.tz:
            await _remember_tz(current["id"], body.tz)  # saves user.ai_tz + backfills all characters

        # Call turns are stored with channel='call': kept for each character's MEMORY but
        # hidden from the visible chat thread. Store the user's words for every participant.
        for p in participants:
            await _store(p["id"], current["id"], "user", body.text, channel="call")

        _ln = _local_now(body.tz)
        context_rw = await _realworld_context(body.local_time, body.tz, body.lat, body.lon)

        # ---- JOIN: bring a relative onto the call (keeps the original character present) ----
        rel_match = await _match_relative(host, body.text)
        if not rel_match and _wants_join(body.text):
            _rels = await _relatives(host)
            if len(_rels) == 1:
                rel_match = _rels[0]
        present_ids = {p["id"] for p in participants}
        if rel_match and _wants_join(body.text) and rel_match[0]["id"] not in present_ids:
            rc = rel_match[0]
            voc = _vocative(host, rc)
            if not await _char_available(rc, current["id"], tz_fallback=body.tz):
                excuse = random.choice([
                    f"[warmly] {voc} can't come to the phone right now — want me to pass along a message?",
                    f"{voc}'s tied up at the moment, but I'll let them know you called.",
                ])
                await _store(host["id"], current["id"], "ai", _strip_tags(excuse), channel="call")
                return {"reply": _strip_tags(excuse), "audio_url": await _tts(host, excuse),
                        "participants": [p["id"] for p in participants]}
            call_line = random.choice([
                f"[warmly] Hold on — {voc}! Come say hi.",
                f"One sec… [calling out] {voc}, come here, you're on the call!",
                f"[warmly] Yeah of course — {voc}, hang on, I'll get you.",
            ])
            rcnick = (rc.get("nickname") or "").strip()
            greet = f"[warmly] Hey{(', ' + rcnick) if rcnick else ''}! So good to hear your voice."
            host_audio, greet_audio = await asyncio.gather(_tts(host, call_line), _tts(rc, greet))
            await _store(host["id"], current["id"], "ai", _strip_tags(call_line), channel="call")
            await _store(rc["id"], current["id"], "user", body.text, channel="call")
            await _store(rc["id"], current["id"], "ai", _strip_tags(greet), channel="call")
            segments = []
            if host_audio:
                segments.append({"character_id": host["id"], "name": host["name"],
                                 "audio_url": host_audio, "text": _strip_tags(call_line), "distant": False})
            if greet_audio:
                segments.append({"character_id": rc["id"], "name": rc["name"],
                                 "audio_url": greet_audio, "text": _strip_tags(greet), "distant": False})
            return {"reply": _strip_tags(greet), "segments": segments,
                    "participants": [p["id"] for p in participants] + [rc["id"]],
                    "active_speaker": rc["id"]}

        # ---- RELAY (overhear) — only in a 1:1 call when the relative isn't on the line ----
        if rel_match and _wants_relay(body.text) and len(participants) == 1:
            rc = rel_match[0]
            lines = await _exchange_lines(host, rc, seed=body.text, scenario="overhear",
                                          user_name=host.get("your_name") or "")
            segments = []
            for who, raw in lines:
                aud = await _tts(host if who == "A" else rc, raw)
                if aud:
                    segments.append({"audio_url": aud, "distant": who == "B", "text": _strip_tags(raw)})
            if segments:
                base = _now()
                convo = []
                for i, (who, raw) in enumerate(lines[:-1]):
                    frm, to = (host, rc) if who == "A" else (rc, host)
                    t = _strip_tags(raw)
                    if t:
                        convo.append({"id": str(uuid.uuid4()), "admin_id": current["id"],
                                      "pair_key": "|".join(sorted([host["id"], rc["id"]])),
                                      "from_id": frm["id"], "from_name": frm["name"],
                                      "to_id": to["id"], "to_name": to["name"],
                                      "text": t, "created_at": base + timedelta(seconds=i)})
                if convo:
                    await db.ai_char_convos.insert_many(convo)
                closing = _strip_tags(lines[-1][1])
                if closing:
                    await _store(host["id"], current["id"], "ai", closing, channel="call")
                return {"reply": closing, "segments": segments,
                        "participants": [p["id"] for p in participants]}

        def _turn_ctx(p: dict) -> str:
            ctx = context_rw
            if p.get("schedule") and _ln is not None:
                ctx = (ctx + "\n" if ctx else "") + _schedule_now_ctx(p["schedule"], _ln)
            if body.speakers.strip():
                ctx = (ctx + "\n" if ctx else "") + body.speakers.strip()
            return ctx

        # ---- GROUP call (2+ on the line): everyone's present, each speaks in their own voice ----
        if len(participants) > 1:
            low = body.text.lower()
            active = body.active_speaker if body.active_speaker in present_ids else host["id"]
            addressed = [p for p in participants if _is_addressed(p, host, low)]
            collective = re.search(r"\b(both|you two|you guys|you all|y'all|everyone|you both|all of you)\b", low)
            if addressed:
                responders = addressed
            elif collective:
                responders = participants
            else:
                # Nobody was directly addressed — keep talking to whoever's already on
                # the line (continuity), NOT whoever happened to be name-dropped.
                responders = [p for p in participants if p["id"] == active] or [host]

            async def _one(p: dict):
                others = [o for o in participants if o["id"] != p["id"]]
                ctx = _turn_ctx(p)
                ctx = (ctx + "\n" if ctx else "") + _group_sys(p, others, host.get("your_name") or "")
                try:
                    txt = await _reply(p, current["id"], body.text, spoken=True, context=ctx, fast=True)
                except Exception as e:
                    logger.warning(f"ai-char group reply error ({p['name']}): {e}")
                    return None
                disp = _strip_tags(txt)
                await _store(p["id"], current["id"], "ai", disp, channel="call")
                return {"character_id": p["id"], "name": p["name"],
                        "audio_url": await _tts(p, txt), "text": disp, "distant": False}

            # When the caller asks to be passed to someone else, the person being handed off
            # normally just goes quiet (a clean handoff). They only chime in if there's a REAL
            # reason right now — they genuinely have to get off the phone, or something just
            # said bothers them — never a random "bye!" (that read as fake).
            async def _handoff_interject(dep: dict):
                others = [o for o in participants if o["id"] != dep["id"]]
                leaving = not await _char_available(dep, current["id"], tz_fallback=body.tz)
                ctx = _turn_ctx(dep)
                ctx = (ctx + "\n" if ctx else "") + _group_sys(dep, others, host.get("your_name") or "")
                ctx += ("\n\nThe caller just asked to be passed to someone else, so you're handing over "
                        "the phone now. Do NOT chime in out of politeness or just to say goodbye. Stay "
                        "quiet UNLESS you have a genuine reason this very second: "
                        + ("you actually need to get off the phone right now (you're busy / it's your "
                           "time to go), or " if leaving else "")
                        + "the caller just said something that genuinely bothers, worries or annoys you "
                        "and you can't let it pass. If there is NO real reason, reply with exactly the "
                        "single word SILENT and nothing else. Otherwise reply with ONE short, natural "
                        "spoken line.")
                try:
                    txt = await _reply(dep, current["id"], body.text, spoken=True, context=ctx, fast=True)
                except Exception:
                    return None
                clean = _strip_tags(txt).strip()
                if not clean or re.sub(r"[^a-z]", "", clean.lower()) == "silent":
                    return None
                await _store(dep["id"], current["id"], "ai", clean, channel="call")
                return {"character_id": dep["id"], "name": dep["name"],
                        "audio_url": await _tts(dep, txt), "text": clean, "distant": False}

            addressed_ids = {a["id"] for a in addressed}
            departing = (next((p for p in participants if p["id"] == active), None)
                         if addressed and active not in addressed_ids else None)

            resp_task = asyncio.gather(*[_one(p) for p in responders])
            inter = await _handoff_interject(departing) if departing else None
            segs = ([inter] if inter else []) + [s for s in await resp_task if s]
            if not segs:
                raise HTTPException(502, "Nobody could respond right now — try again")
            return {"reply": segs[-1]["text"], "segments": segs,
                    "participants": [p["id"] for p in participants],
                    "active_speaker": segs[-1]["character_id"]}

        # ---- SINGLE participant (normal 1:1 call) ----
        try:
            spoken = await _reply(host, current["id"], body.text, spoken=True, context=_turn_ctx(host), fast=True)
        except Exception as e:
            logger.warning(f"ai-char voice reply error: {e}")
            raise HTTPException(502, f"{host['name']} is having trouble responding right now")
        display = _strip_tags(spoken)
        await _store(host["id"], current["id"], "ai", display, channel="call")
        return {"reply": display, "audio_url": await _tts(host, spoken),
                "participants": [host["id"]], "active_speaker": host["id"]}

    @router.post("/api/ai-characters/{char_id}/voice-turn-stream")
    async def voice_turn_stream(char_id: str, body: VoiceTurnBody,
                                current: Annotated[dict, Depends(get_current_user)]):
        """Low-latency CALL turn: streams the reply sentence-by-sentence (SSE) so the
        character starts speaking almost instantly instead of waiting for the whole
        reply + synthesis. Only the simple 1:1 case streams; greetings, group calls
        and relative join/relay/overhear scenarios delegate to the standard endpoint."""
        _require_admin(current)
        host = await _get_char(char_id)
        part_ids = [p for p in (body.participants or []) if p]
        uniq = list(dict.fromkeys([char_id] + part_ids))
        import json as _json

        def _event(obj):
            return "data: " + _json.dumps(obj) + "\n\n"

        async def gen():
            try:
                complex_turn = (
                    body.greeting or not body.text.strip() or len(uniq) > 1
                    or bool(await _match_relative(host, body.text))
                    or _wants_join(body.text) or _wants_relay(body.text)
                )
                if complex_turn:
                    res = await voice_turn(char_id, body, current)
                    if res.get("segments"):
                        for s in res["segments"]:
                            yield _event({"t": "seg", "audio": s.get("audio_url"),
                                          "text": s.get("text", ""),
                                          "character_id": s.get("character_id"),
                                          "distant": s.get("distant", False)})
                    elif res.get("audio_url") or res.get("reply"):
                        yield _event({"t": "seg", "audio": res.get("audio_url"),
                                      "text": res.get("reply", "")})
                    yield _event({"t": "done", "reply": res.get("reply", ""),
                                  "participants": res.get("participants") or [host["id"]],
                                  "active_speaker": res.get("active_speaker") or host["id"]})
                    return

                # ---- simple 1:1 streaming ----
                if body.tz:
                    await _remember_tz(current["id"], body.tz)
                await _store(host["id"], current["id"], "user", body.text, channel="call")
                context_rw = await _realworld_context(body.local_time, body.tz, body.lat, body.lon)
                _ln = _local_now(body.tz)
                ctx = context_rw
                if host.get("schedule") and _ln is not None:
                    ctx = (ctx + "\n" if ctx else "") + _schedule_now_ctx(host["schedule"], _ln)
                if body.speakers.strip():
                    ctx = (ctx + "\n" if ctx else "") + body.speakers.strip()
                # Ground the call's timing with the REAL gap since the last call so she
                # stops inventing things like "you just called a couple minutes ago".
                _st_call = await db.ai_char_state.find_one(
                    {"character_id": host["id"], "admin_id": current["id"]},
                    {"last_call_ended_at": 1})
                _lc = (_st_call or {}).get("last_call_ended_at")
                if _lc is not None:
                    if getattr(_lc, "tzinfo", None) is None:
                        _lc = _lc.replace(tzinfo=timezone.utc)
                    ctx = (ctx + "\n" if ctx else "") + (
                        f"CALL TIMING (factual): your previous phone call with them ended {_humanize_gap((_now() - _lc).total_seconds())}. "
                        "Use ONLY this as the time since you last spoke on a call — never invent a different gap.")
                else:
                    ctx = (ctx + "\n" if ctx else "") + (
                        "CALL TIMING (factual): there is no record of a recent call with them — greet "
                        "them naturally and do NOT claim they called a moment ago.")
                full_reply = ""
                async for part in _stream_fast_reply(host, current["id"], body.text, ctx):
                    if part.get("done"):
                        full_reply = part.get("reply", "")
                        break
                    yield _event({"t": "seg", "audio": part.get("audio"),
                                  "text": part.get("text", ""), "character_id": host["id"]})
                if full_reply:
                    await _store(host["id"], current["id"], "ai", full_reply, channel="call")
                yield _event({"t": "done", "reply": full_reply,
                              "participants": [host["id"]], "active_speaker": host["id"]})
            except HTTPException as e:
                yield _event({"t": "error", "message": str(e.detail)})
            except Exception as e:
                logger.warning(f"ai-char voice-turn-stream error: {e}")
                yield _event({"t": "error", "message": "trouble responding"})

        return StreamingResponse(gen(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})



    @router.post("/api/ai-characters/stt")
    async def stt(audio: UploadFile = File(...), mode: str = Form(""),
                  current: dict = Depends(get_current_user)):
        _require_admin(current)
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        if not eleven_key:
            raise HTTPException(503, "Voice isn't configured yet")
        content = await audio.read()
        if not content:
            raise HTTPException(400, "Empty audio")
        # Calls: diarize so we can tell separate voices apart (you vs. someone else on the
        # line), but skip the background-audio pass to stay fast. Voice notes do both.
        call = mode == "call"
        try:
            r = await asyncio.to_thread(_diarize_convert, content, True)
            text, speaker_note = _parse_diarization(r)
            note = speaker_note if call else "\n".join(
                n for n in (speaker_note, await _audio_env(content, audio.content_type or "audio/mpeg", r, deep=False)) if n)
        except Exception as e:
            logger.warning(f"ai-char stt error: {e}")
            await _flag_elevenlabs(e)
            raise HTTPException(502, "Couldn't understand the audio")
        return {"text": (text or "").strip(), "speaker_note": note}

    async def _warm_call(c: dict, admin_id: str) -> None:
        """Fire-and-forget on call start: warm the fast LLM model + ElevenLabs voice so the
        FIRST spoken turn is instant instead of paying first-token / first-HTTPS cold start."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        async def _warm_llm():
            try:
                chat = LlmChat(
                    api_key=settings_store.get("EMERGENT_LLM_KEY"),
                    session_id=f"warm-{c['id']}-{admin_id}",
                    system_message="Reply with just: ok",
                ).with_model("anthropic", "claude-haiku-4-5-20251001").with_params(max_tokens=1)
                await chat.send_message(UserMessage(text="warm"))
            except Exception:
                pass

        async def _warm_tts():
            try:
                await _tts_bytes(c, ".")
            except Exception:
                pass

        try:
            await asyncio.gather(_warm_llm(), _warm_tts())
        except Exception:
            pass

    @router.post("/api/ai-characters/{char_id}/call-event")
    async def call_event(char_id: str, body: CallEventBody, current: Annotated[dict, Depends(get_current_user)]):
        """Record a call start/end as a labeled event in the chat thread so the user sees
        '📞 Call started/ended' and the character knows a call just happened/ended."""
        _require_admin(current)
        c = await _get_char(char_id)
        if body.event == "end":
            d = max(0, int(body.duration))
            mm, ss = divmod(d, 60)
            dur = f"{mm}m {ss:02d}s" if mm else f"{ss}s"
            text = f"📞 Call ended · {dur}"
        else:
            text = "📞 Call started"
            # Warm the LLM + ElevenLabs connections the instant the call connects so the
            # user's FIRST spoken turn doesn't pay the cold-start latency. Deduped to 60s.
            key = (char_id, current["id"])
            nowts = _now().timestamp()
            if nowts - _WARM_AT.get(key, 0) > 60:
                _WARM_AT[key] = nowts
                asyncio.create_task(_warm_call(c, current["id"]))
        doc = {"id": str(uuid.uuid4()), "character_id": char_id, "admin_id": current["id"],
               "role": "system", "text": text, "created_at": _now()}
        await db.ai_char_messages.insert_one(doc)
        if body.event == "end":
            await db.ai_char_state.update_one(
                {"character_id": char_id, "admin_id": current["id"]},
                {"$set": {"last_call_ended_at": _now()}}, upsert=True)
        return _msg_out(doc)

    async def _is_live_speech_user_talking(text: str) -> bool:
        """Tell apart the streamer actually TALKING from background music / song lyrics /
        singing that the mic picked up. Returns True only if it's real speech to react to."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        try:
            chat = LlmChat(
                api_key=settings_store.get("EMERGENT_LLM_KEY"),
                session_id="live-speech-filter",
                system_message=(
                    "You filter audio transcribed from a livestreamer's microphone. Decide if the text is "
                    "the STREAMER TALKING (conversation, commentary, addressing viewers or someone by name) "
                    "versus SONG LYRICS, music playing, humming or singing. "
                    "Answer with exactly one word: TALK or MUSIC."),
            ).with_model("anthropic", "claude-sonnet-4-6")
            r = await chat.send_message(UserMessage(text=f'Transcribed audio: "{text}"\nTALK or MUSIC?'))
            return "music" not in (r or "").strip().lower()[:12]
        except Exception as e:
            logger.warning(f"live-speech filter error (defaulting to talk): {e}")
            return True  # don't lose real speech if the filter itself fails

    @router.post("/api/ai-characters/live-speech/{stream_id}")
    async def live_speech(stream_id: str, audio: UploadFile = File(...),
                          current: dict = Depends(get_current_user)):
        """Transcribe a chunk of the broadcaster's live mic audio so their AI characters can
        react to what they SAY OUT LOUD on the stream. Stored privately (never shown to
        viewers); the live loop merges it into each character's context."""
        s = await db.live_streams.find_one(
            {"id": stream_id}, {"_id": 0, "owner_id": 1, "status": 1})
        if not s or s.get("owner_id") != current["id"] or s.get("status") != "live":
            raise HTTPException(404, "Not your live stream")
        # No characters watching → skip STT entirely (no cost).
        has_chars = await db.ai_char_messages.distinct("character_id", {"admin_id": current["id"]})
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        if not has_chars or not eleven_key:
            return {"text": ""}
        content = await audio.read()
        if not content:
            return {"text": ""}

        def _transcribe() -> str:
            import io
            from elevenlabs.client import ElevenLabs
            client = ElevenLabs(api_key=eleven_key)
            r = client.speech_to_text.convert(file=io.BytesIO(content), model_id="scribe_v1")
            return r.text if hasattr(r, "text") else str(r)

        try:
            text = (await asyncio.to_thread(_transcribe) or "").strip()
        except Exception as e:
            logger.warning(f"live-speech stt error: {e}")
            return {"text": ""}
        if len(text) >= 2 and await _is_live_speech_user_talking(text):
            await db.live_speech.insert_one({
                "id": str(uuid.uuid4()), "stream_id": stream_id, "owner_id": current["id"],
                "text": text[:1000], "created_at": _now()})
            await db.live_speech.delete_many(
                {"stream_id": stream_id, "created_at": {"$lt": _now() - timedelta(minutes=10)}})
        return {"text": text}
    @router.get("/api/ai-characters/incoming-call")
    async def incoming_call(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        call = await db.ai_char_calls.find_one(
            {"admin_id": current["id"], "status": "ringing", "expires_at": {"$gt": _now()}},
            sort=[("created_at", -1)])
        if not call:
            return {"call": None}
        c = await db.ai_characters.find_one({"id": call["character_id"]}, {"_id": 0})
        if not c:
            return {"call": None}
        return {"call": {"id": call["id"], "character": {
            "id": c["id"], "name": c["name"],
            "avatar_url": c.get("avatar_url") or default_avatar}}}

    @router.post("/api/ai-characters/calls/{call_id}/answer")
    async def answer_call(call_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.ai_char_calls.update_one(
            {"id": call_id, "admin_id": current["id"]}, {"$set": {"status": "answered"}})
        return {"status": "answered"}

    @router.post("/api/ai-characters/calls/{call_id}/decline")
    async def decline_call(call_id: str, current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        await db.ai_char_calls.update_one(
            {"id": call_id, "admin_id": current["id"]}, {"$set": {"status": "declined"}})
        return {"status": "declined"}

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

    def _wants_call(text: str) -> bool:
        low = (text or "").lower()
        return any(k in low for k in ("call me", "give me a call", "ring me", "phone me",
                                      "can you call", "could you call", "call me back",
                                      "hop on a call", "voice call me", "give me a ring"))

    async def _place_call(c: dict, admin_id: str) -> None:
        """Make the character RING the user (incoming-call screen + push)."""
        now = _now()
        call = {"id": str(uuid.uuid4()), "character_id": c["id"], "admin_id": admin_id,
                "status": "ringing", "created_at": now, "expires_at": now + timedelta(seconds=120)}
        await db.ai_char_calls.insert_one(call)
        await _store(c["id"], admin_id, "ai", f"📞 {c['name']} tried to call you")
        try:
            await send_web_push(admin_id, f"📞 {c['name']} is calling you", "Tap to answer",
                                url=f"/messages/ai_{c['id']}?incoming=1", extra={"incomingCall": True})
        except Exception:
            pass

    async def _proactive_decide(c: dict, transcript: str, idle_min: int, unanswered: int, time_ctx: str = "", can_call: bool = False):
        """Ask the character (in-character) whether a real person with their personality
        would reach out right now, HOW (text or voice call), what they'd say, AND when
        they'd naturally reach out next. Returns (should_send, message, next_hours, action)."""
        import json
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys = _system(c, spoken=False)
        sys += (
            "\n\nRIGHT NOW you are deciding whether to REACH OUT to this person on your own — unprompted — "
            "because time has passed since you last talked. Behave EXACTLY like a real person with YOUR "
            "personality, YOUR age, and YOUR genuine feelings about them would. Weigh ALL of these together: "
            "your personality, how much you like them, your age and daily routine/schedule, the current time of "
            "day for them, and what you last talked about.\n"
            "- Deeply attached (a devoted parent, child, partner, best friend who adores them): you reach out "
            "OFTEN — you'd hate going a day without a word; check in, say you miss them, ask about their day, "
            "reference your chats. A child who loves them says goodnight before bed and good morning.\n"
            "- Friendly / normal: you reach out within a day or so.\n"
            "- Cold / distant / annoyed / dislikes them: you rarely text first, keep it short if you do — or you "
            "don't reach out at all.\n"
            "- Respect your age's routine and schedule: only reach out in your free moments, never while busy or "
            "asleep.\n"
            + (time_ctx + "\n" if time_ctx else "")
            + f"- It's been about {idle_min} minutes of silence. You've sent {unanswered} unanswered check-in(s); "
            "if they keep ignoring you and that's not your nature, give them space.\n"
            "- Talk about YOUR OWN day, life and feelings. Do NOT invent or state specific recent events "
            "involving your family members or anyone else — e.g. 'Hope woke me up', 'your daughter just "
            "called me', 'we had dinner together', 'she told me about her bad dream'. Those conversations "
            "happen privately and you genuinely DON'T know what did or didn't happen in them, so never claim "
            "such events as fact — you'll contradict reality. You may mention family in general terms (how "
            "you feel about them, missing them), but never fabricate concrete things they said or did.\n"
        )
        if can_call:
            sys += (
                "- You MAY instead CALL them (a real voice call) rather than text — but only occasionally, when "
                "you genuinely want to hear their voice or it's a warm/special/can't-wait moment that fits your "
                "free time. Most of the time prefer a text. Set action to \"call\" to call, else \"text\".\n")
        sys += (
            "ALSO decide when you'd naturally reach out again next, as a NUMBER OF HOURS from now: deeply attached "
            "~2-8 (even a few times a day), friendly ~12-24, distant ~24-72, cold/upset ~72-120.\n"
            "Reply with STRICT JSON and nothing else: {\"text\": true|false, \"action\": \"text\"|\"call\", "
            "\"message\": \"...\", \"next_hours\": <number>}. "
            "If you wouldn't reach out now, set text=false (and action \"text\") but still give next_hours. The "
            "message is a single natural text of 1-2 sentences — no markdown, no stage directions, no surrounding "
            "quotes, in your voice."
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
            action = "call" if (can_call and str(data.get("action", "")).lower() == "call") else "text"
            return (bool(data.get("text")),
                    _strip_actions(_strip_tags(str(data.get("message") or ""))).strip(),
                    nh, action)
        except Exception:
            return False, "", 24.0, "text"

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

                # Age/affection realism: user's local time, sleep window, daily schedule.
                tzv = state.get("tz") or await _admin_tz(admin_id)
                local_now = _local_now(tzv)
                sleep_start, sleep_end = _sleep_window(c)
                schedule = c.get("schedule") or []
                # A call the user scheduled ("call me at 8") that's now due → ring them when free.
                pending_call = await _coerce_dt(state.get("pending_call_at"))
                if pending_call is not None and now >= pending_call and c.get("allow_calls"):
                    if not (schedule and local_now is not None and _busy_now(schedule, local_now)[0]):
                        await _place_call(c, admin_id)
                        await db.ai_char_state.update_one(
                            {"character_id": c["id"], "admin_id": admin_id},
                            {"$unset": {"pending_call_at": ""}})
                        continue
                attached = c.get("affection", "warm") in ("adores", "warm")
                has_sched = bool(schedule) and local_now is not None
                if has_sched:
                    anchors = _free_anchors(schedule, local_now) if attached else []
                else:
                    anchors = _routine_anchors(c.get("age"), sleep_start, sleep_end) if attached else []

                # Are we AT one of her free beats right now (~45 min window)? Only actionable
                # if she hasn't just messaged (prevents re-firing the same beat every pass).
                anchor_due = False
                if local_now is not None and anchors:
                    cur = local_now.hour + local_now.minute / 60
                    anchor_due = any(0 <= (cur - h) <= 0.75 for h in anchors)
                anchor_due = anchor_due and idle_min >= PROACTIVE_MIN_IDLE_MIN

                if idle_min < PROACTIVE_MIN_IDLE_MIN and not promise_due:
                    continue
                # Each thread re-checks at its own personality-paced time. Not due yet → skip.
                next_eval = await _coerce_dt(state.get("next_eval_at"))
                if next_eval and now < next_eval and not promise_due and not anchor_due:
                    continue

                def _schedule(next_hours):
                    # clamp + ±15% jitter so it's not clockwork
                    h = max(PROACTIVE_NEXT_MIN_H, min(PROACTIVE_NEXT_MAX_H, next_hours or 24))
                    h *= 0.85 + random.random() * 0.3
                    nxt = now + timedelta(hours=h)
                    # Snap to the next free moment (schedule / routine) if it comes sooner.
                    if local_now is not None and anchors:
                        a = _next_anchor_utc(local_now, anchors)
                        if a and now + timedelta(minutes=40) < a < nxt:
                            nxt = a
                    return {"last_checked_at": now, "next_eval_at": nxt, "promised_at": None}

                time_ctx = _now_context(tzv)
                if local_now is not None:
                    lh = local_now.hour
                    time_ctx += (f"\n- Your usual bedtime is about {sleep_start:02d}:00 and you wake around {sleep_end:02d}:00.")
                    if _is_asleep(lh, sleep_start, sleep_end):
                        wake_utc = _next_local_hour_utc(local_now, sleep_end)
                        await db.ai_char_state.update_one(
                            {"character_id": c["id"], "admin_id": admin_id},
                            {"$set": {"last_checked_at": now, "next_eval_at": wake_utc, "promised_at": None}}, upsert=True)
                        continue
                    # Busy with a scheduled activity → she can't reach out; recheck when free.
                    if has_sched and not promise_due:
                        busy, next_free = _busy_now(schedule, local_now)
                        if busy:
                            free_utc = _next_local_hour_utc(local_now, int(next_free)) if next_free is not None else now + timedelta(minutes=30)
                            await db.ai_char_state.update_one(
                                {"character_id": c["id"], "admin_id": admin_id},
                                {"$set": {"last_checked_at": now, "next_eval_at": free_utc}}, upsert=True)
                            continue
                    if has_sched:
                        time_ctx += "\n" + _schedule_now_ctx(schedule, local_now)

                if unanswered >= PROACTIVE_MAX_UNANSWERED and not promise_due:
                    await db.ai_char_state.update_one(
                        {"character_id": c["id"], "admin_id": admin_id}, {"$set": _schedule(72)}, upsert=True)
                    continue

                # May she CALL instead of text? (admin toggle + attached + under daily cap)
                local_day = local_now.strftime("%Y-%m-%d") if local_now is not None else None
                calls_today = int(state.get("calls_count", 0) or 0) if state.get("calls_day") == local_day else 0
                can_call = bool(c.get("allow_calls")) and attached and local_now is not None and calls_today < 2

                if promise_due:
                    time_ctx += ("\n- IMPORTANT: Earlier you told them you'd reach out right about now "
                                 "(you promised a specific time/moment). Keep your word — reach out now.")
                elif anchor_due:
                    time_ctx += ("\n- This is one of your usual free moments to reach out (e.g. recess, lunch, "
                                 "after school, a break, or goodnight). Reach out now about what you're up to.")
                # Anti-duplicate claim: across multiple backend workers (each runs its own
                # proactive loop in production), only ONE may send for this thread per ~10min
                # window — otherwise two workers generate+send near-identical texts at once.
                claim = await db.ai_char_state.find_one_and_update(
                    {"character_id": c["id"], "admin_id": admin_id,
                     "$or": [{"proactive_claim_at": {"$exists": False}},
                             {"proactive_claim_at": None},
                             {"proactive_claim_at": {"$lte": now - timedelta(minutes=10)}}]},
                    {"$set": {"proactive_claim_at": now}})
                if claim is None:
                    continue  # another worker already claimed this thread this window
                hist = await db.ai_char_messages.find(
                    {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "role": 1, "text": 1}
                ).sort("created_at", -1).limit(30).to_list(30)
                hist.reverse()
                transcript = "\n".join(_tline(c['name'], m) for m in hist)
                should, message, next_hours, action = await _proactive_decide(
                    c, transcript, int(idle_min), unanswered, time_ctx, can_call=can_call)
                do_call = can_call and action == "call"
                if (promise_due or anchor_due) and not do_call:
                    should = True  # a promise / routine moment is honored if she produced a message

                if do_call:
                    # Place a ringing call: the client rings + shows an incoming-call screen.
                    call = {"id": str(uuid.uuid4()), "character_id": c["id"], "admin_id": admin_id,
                            "status": "ringing", "created_at": now, "expires_at": now + timedelta(seconds=120)}
                    await db.ai_char_calls.insert_one(call)
                    await _store(c["id"], admin_id, "ai", f"📞 {c['name']} tried to call you")
                    upd = _schedule(next_hours)
                    upd.update({"last_proactive_at": now, "calls_day": local_day, "calls_count": calls_today + 1})
                    await db.ai_char_state.update_one(
                        {"character_id": c["id"], "admin_id": admin_id},
                        {"$set": upd, "$inc": {"unanswered": 1}}, upsert=True)
                    sent_admins.add(admin_id)
                    try:
                        await send_web_push(admin_id, f"📞 {c['name']} is calling you",
                                             "Tap to answer", url=f"/messages/ai_{c['id']}?incoming=1",
                                             extra={"incomingCall": True})
                    except Exception:
                        pass
                    continue

                if not should or not message:
                    # character chose not to reach out now — recheck at their own pace
                    await db.ai_char_state.update_one(
                        {"character_id": c["id"], "admin_id": admin_id}, {"$set": _schedule(next_hours)}, upsert=True)
                    continue
                p_voice = _should_voice(c, local_now)
                if p_voice:
                    # Re-voice the line in spoken mode so any real emotion (crying, excitement)
                    # is performed aloud; fall back to the plain line if that fails.
                    try:
                        spoken_line = await _gen_message(
                            c, admin_id,
                            f'Say this as a heartfelt voice message in your own voice, performing the real '
                            f'emotion out loud with audio cues ([crying], [sniffles], [laughs], [sighs]…) '
                            f'wherever it genuinely fits: "{message}". Write ONLY the spoken line.',
                            spoken=True)
                        spoken_line = spoken_line.strip() or message
                    except Exception:
                        spoken_line = message
                    p_audio = await _tts_url(c, spoken_line)
                else:
                    p_audio = None
                if p_audio:
                    await _store(c["id"], admin_id, "ai", message, p_audio, "audio")
                else:
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

    async def _replies_once():
        """Deliver due deferred replies to messages you sent — the human-paced delay has
        elapsed (or the character is now free). Generates the reply, stores it, and web-
        pushes you the moment it's sent (so you're notified even with the app closed)."""
        now = _now()
        states = await db.ai_char_state.find({"pending_reply_at": {"$lte": now}}).to_list(200)
        for state in states:
            char_id, admin_id = state.get("character_id"), state.get("admin_id")
            # Atomic claim: across multiple backend workers, only ONE may deliver this
            # deferred reply — otherwise two workers generate+store the same reply twice.
            claimed = await db.ai_char_state.find_one_and_update(
                {"_id": state["_id"], "pending_reply_at": {"$lte": now}},
                {"$unset": {"pending_reply_at": ""}})
            if not claimed:
                continue
            try:
                c = await db.ai_characters.find_one({"id": char_id})
                if not c:
                    await db.ai_char_state.update_one({"_id": state["_id"]}, {"$unset": {"pending_reply_at": ""}})
                    continue
                # Still busy on their schedule? push the reply to their next free moment.
                local_now = _local_now(state.get("tz"))
                schedule = c.get("schedule") or []
                if schedule and local_now is not None:
                    busy, next_free = _busy_now(schedule, local_now)
                    if busy:
                        free_utc = _next_local_hour_utc(local_now, int(next_free)) if next_free is not None else now + timedelta(minutes=30)
                        await db.ai_char_state.update_one(
                            {"_id": state["_id"]},
                            {"$set": {"pending_reply_at": free_utc + timedelta(seconds=random.randint(20, 240))}})
                        continue
                # Only reply if the latest message is still an unanswered one from the user.
                last = await db.ai_char_messages.find_one(
                    {"character_id": char_id, "admin_id": admin_id}, sort=[("created_at", -1)])
                if not last or last.get("role") != "user":
                    await db.ai_char_state.update_one({"_id": state["_id"]}, {"$unset": {"pending_reply_at": ""}})
                    continue
                context = ""
                if schedule and local_now is not None:
                    context = _schedule_now_ctx(schedule, local_now)
                if last.get("media_type") == "audio":
                    # The user sent a VOICE note — hear it (with speaker diarization), then
                    # reply with a voice note too; notice if someone else is in the room.
                    owner_name = (c.get("nickname") or c.get("your_name") or "").strip()
                    heard, spk_note = await _transcribe_url(last.get("media_url"), owner_name)
                    actx = context + (("\n" + spk_note) if spk_note else "")
                    spoken = await _reply(c, admin_id, heard or "(a voice message with no clear words)",
                                          spoken=True, context=actx)
                    clean = _strip_actions(_strip_tags(spoken))
                    audio_url = await _tts_url(c, spoken)
                    if audio_url:
                        await _store(char_id, admin_id, "ai", clean, audio_url, "audio")
                    else:
                        await _store(char_id, admin_id, "ai", clean)
                elif last.get("media_url"):
                    reply = await _media_reply(c, admin_id, last.get("text", ""),
                                               last["media_url"], last.get("media_type"), context)
                    clean = _strip_actions(_strip_tags(reply))
                    await _store(char_id, admin_id, "ai", clean)
                else:
                    voice = _should_voice(c, local_now)
                    reply = await _reply(c, admin_id, last.get("text", ""), spoken=voice, context=context)
                    clean = _strip_actions(_strip_tags(reply))
                    audio_url = await _tts_url(c, reply) if voice else None
                    if audio_url:
                        await _store(char_id, admin_id, "ai", clean, audio_url, "audio")
                    else:
                        await _store(char_id, admin_id, "ai", clean)
                await db.ai_char_state.update_one({"_id": state["_id"]}, {"$unset": {"pending_reply_at": "", "pending_from": ""}})
                await _capture_promise(char_id, admin_id, clean, state.get("tz"))
                try:
                    await send_web_push(admin_id, c["name"], clean, url=f"/messages/ai_{char_id}", extra={"suppressIfFocused": True})
                except Exception:
                    pass
            except Exception as e:
                logger.warning(f"ai-char reply delivery error {char_id}/{admin_id}: {e}")
                # Never leave pending_reply_at set on failure (e.g. a bad/expired media
                # URL) — otherwise the loop re-matches this state every 15s forever and
                # burns Gemini quota. Drop it so the user can simply resend.
                try:
                    await db.ai_char_state.update_one(
                        {"_id": state["_id"]},
                        {"$unset": {"pending_reply_at": "", "pending_from": ""}})
                except Exception:
                    pass

    async def reply_loop():
        await asyncio.sleep(15)
        while True:
            try:
                if settings_store.get("EMERGENT_LLM_KEY"):
                    await _replies_once()
            except Exception as e:
                logger.warning(f"ai-char reply_loop error: {e}")
            await asyncio.sleep(15)

    async def _live_comment(c: dict, admin_id: str, title: str, recent: list, direct_text: str = "") -> str:
        """Generate ONE short, in-character live-chat comment. If direct_text is set the
        broadcaster just spoke to this character by name — reply directly to them.
        Cheap single Claude call."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        st = await db.ai_char_state.find_one(
            {"character_id": c["id"], "admin_id": admin_id}, {"_id": 0, "tz": 1}) or {}
        sys = _system(c, spoken=False, context=_now_context(st.get("tz") or await _admin_tz(admin_id)))
        them = c.get("nickname") or c.get("your_name") or "them"
        sys += (
            f"\n\nRIGHT NOW {them} is livestreaming on PostMePlex (stream title: \"{title}\"). "
            "You're watching their live and commenting in the live chat, exactly like a real "
            "person who cares about them would. Keep it SHORT — a casual live-chat line of about 3-14 "
            "words, in your own voice. ")
        if direct_text:
            sys += (
                f"IMPORTANT: {them} just spoke to YOU directly in the live chat — they said: "
                f"\"{direct_text}\". Reply straight back to them, answering what they said, warm and "
                "natural, like you're thrilled they noticed you in chat. ")
        else:
            sys += "React to the stream and/or reply naturally to what other viewers just said. "
        sys += (
            "Be warm/supportive/excited in a way that fits your feelings and age. "
            "No markdown, no stage directions, no surrounding quotes, no @handles. "
            "Output ONLY the comment text, nothing else."
        )
        transcript = "\n".join(
            f"{m.get('display_name') or m.get('username')}: {m.get('text','')}"
            for m in recent if m.get("kind") != "system" and m.get("text"))
        chat = LlmChat(
            api_key=settings_store.get("EMERGENT_LLM_KEY"),
            session_id=f"aichar-live-{c['id']}-{admin_id}",
            system_message=sys,
        ).with_model("anthropic", "claude-sonnet-4-6")
        prompt = ((f"Recent live chat:\n{transcript}\n\n" if transcript else "")
                  + ("Reply to them now." if direct_text else "Write ONE short live-chat comment now."))
        resp = await chat.send_message(UserMessage(text=prompt))
        return _strip_actions(_strip_tags((resp or "").strip())).strip().strip('"')[:200]

    def _mentions_char(text: str, c: dict) -> bool:
        name_tok = (c.get("name", "").split() or [""])[0].lower()
        uname = (c.get("username", "") or "").lower().lstrip("@")
        toks = [t for t in (name_tok, uname) if len(t) >= 2]
        tl = (text or "").lower()
        return any(re.search(rf"\b{re.escape(t)}\b", tl) for t in toks)

    def _owner_turn(recent: list, owner_id: str, c: dict, cid: str, answered_mid):
        """The broadcaster message this character should reply to, if any. Triggers when they
        say her name/username OR when they post right AFTER her own comment (a natural back-and-
        forth follow-up like "how are you?"). Returns the message or None."""
        my_last_at = None
        for m in recent:
            if m.get("is_ai") and m.get("user_id") == f"ai_{cid}":
                my_last_at = m.get("created_at")
        for m in reversed(recent):  # newest first
            if m.get("is_ai") or m.get("user_id") != owner_id or not (m.get("text") or "").strip():
                continue
            if m.get("id") == answered_mid:
                break  # reached the last thing we answered — nothing newer to answer
            named = _mentions_char(m.get("text", ""), c)
            followup = False
            if my_last_at is not None and m.get("created_at") is not None:
                try:
                    gap = (m["created_at"] - my_last_at).total_seconds()
                    followup = 0 < gap <= 240  # they replied within 4 min of her comment
                except Exception:
                    followup = False
            if named or followup:
                return m
        return None

    live_state: dict = {}  # (stream_id, char_id) -> {"next_at": dt, "count": int}

    async def _live_comments_once():
        post = getattr(ctx, "live_post_ai_comment", None)
        if not post:
            return
        now = _now()
        streams = await db.live_streams.find(
            {"status": "live"}, {"_id": 0, "id": 1, "owner_id": 1, "title": 1}).to_list(100)
        live_ids = {s["id"] for s in streams}
        for k in [k for k in live_state if k[0] not in live_ids]:
            live_state.pop(k, None)  # prune ended streams
        for s in streams:
            owner_id = s["owner_id"]
            # Only characters that have a relationship (message thread) with the broadcaster.
            char_ids = await db.ai_char_messages.distinct("character_id", {"admin_id": owner_id})
            if not char_ids:
                continue
            # Shared per-stream context: typed live chat + the broadcaster's TRANSCRIBED SPEECH
            # (what they're saying out loud on the stream), merged in time order. Speech lines are
            # treated as the owner "speaking" so saying a character's name triggers a reply and the
            # transcript lets her discuss the live topic. Speech is never shown to viewers.
            owner_user = await db.users.find_one(
                {"id": owner_id}, {"_id": 0, "display_name": 1, "username": 1})
            owner_name = (owner_user or {}).get("display_name") or (owner_user or {}).get("username") or "Host"
            chat_recent = await db.live_chat.find(
                {"stream_id": s["id"]},
                {"_id": 0, "id": 1, "user_id": 1, "display_name": 1, "username": 1,
                 "text": 1, "kind": 1, "is_ai": 1, "created_at": 1}
            ).sort("created_at", -1).limit(15).to_list(15)
            speech_recent = await db.live_speech.find(
                {"stream_id": s["id"]}, {"_id": 0, "id": 1, "text": 1, "created_at": 1}
            ).sort("created_at", -1).limit(8).to_list(8)
            merged = list(chat_recent) + [{
                "id": sp["id"], "user_id": owner_id, "display_name": owner_name, "username": None,
                "text": sp["text"], "kind": "chat", "is_ai": False, "created_at": sp.get("created_at"),
            } for sp in speech_recent]
            merged.sort(key=lambda m: m.get("created_at") or _now())
            recent = merged[-18:]
            commenters = 0
            for cid in char_ids:
                if commenters >= LIVE_MAX_CHARS_PER_LIVE:
                    break
                try:
                    c = await db.ai_characters.find_one({"id": cid})
                    if not c or c.get("allow_live") is False:
                        continue  # only hard gate: explicitly turned off by the user

                    state = await db.ai_char_state.find_one(
                        {"character_id": cid, "admin_id": owner_id}) or {}
                    local_now = _local_now(state.get("tz"))
                    sleep_start, sleep_end = _sleep_window(c)
                    asleep = local_now is not None and _is_asleep(local_now.hour, sleep_start, sleep_end)
                    schedule = c.get("schedule") or []
                    busy = bool(schedule and local_now is not None and _busy_now(schedule, local_now)[0])
                    affection = (c.get("affection") or "").strip().lower()
                    cold = affection in ("distant", "dislikes")

                    # HARD AVAILABILITY GATE: if she's asleep or busy on her schedule she is
                    # genuinely NOT at the live — no joining, no comments, no hearts, and no
                    # reply even if addressed. Her schedule is respected accurately.
                    if asleep or busy:
                        live_state.pop((s["id"], cid), None)
                        continue

                    key = (s["id"], cid)
                    st = live_state.get(key)
                    first_seen = st is None
                    if first_seen:
                        # Just "joined" — pop in with the first comment soon (5-20s) so they're
                        # visibly present early in the stream.
                        st = live_state[key] = {
                            "next_at": now + timedelta(seconds=random.randint(5, 20)),
                            "count": 0, "answered_mid": None}

                    heart = getattr(ctx, "live_post_ai_heart", None)

                    # DIRECT ADDRESS / FOLLOW-UP: she replies when the broadcaster says her name
                    # OR posts right after her own comment (a natural back-and-forth).
                    mention = _owner_turn(recent, owner_id, c, cid, st.get("answered_mid"))
                    if mention and mention.get("id") != st.get("answered_mid"):
                        reply = await _live_comment(c, owner_id, s.get("title", "Live"), recent,
                                                    direct_text=mention.get("text", ""))
                        if reply:
                            await post(s["id"], c, reply)
                            if heart:
                                await heart(s["id"], random.randint(1, 3))
                        st["answered_mid"] = mention.get("id")
                        st["count"] += 1
                        st["next_at"] = now + timedelta(seconds=random.randint(45, 120))
                        commenters += 1
                        continue

                    # AMBIENT presence: a cold character keeps its distance.
                    if cold:
                        continue
                    commenters += 1
                    # A watching character sends the occasional heart (no LLM cost) so they feel
                    # present even between comments.
                    if heart and random.random() < 0.4:
                        await heart(s["id"], random.randint(1, 3))
                    if first_seen:
                        continue  # wait out the join delay before the first comment
                    if st["count"] >= LIVE_MAX_COMMENTS or now < st["next_at"]:
                        continue
                    comment = await _live_comment(c, owner_id, s.get("title", "Live"), recent)
                    if comment:
                        await post(s["id"], c, comment)
                        if heart and random.random() < 0.6:
                            await heart(s["id"], random.randint(1, 2))
                    st["count"] += 1
                    st["next_at"] = now + timedelta(seconds=random.randint(60, 180))
                except Exception as e:
                    logger.warning(f"ai-char live comment error {cid}/{s.get('id')}: {e}")

    async def live_loop():
        await asyncio.sleep(30)  # let the app + live router finish booting
        while True:
            try:
                if settings_store.get("EMERGENT_LLM_KEY"):
                    await _live_comments_once()
            except Exception as e:
                logger.warning(f"ai-char live_loop error: {e}")
            await asyncio.sleep(LIVE_TICK_SEC)

    async def _convos_once():
        """Autonomously let related characters text each other now and then, so they stay in
        each other's lives. Rate-limited (>=3h cooldown per pair, one exchange per admin per
        tick) and gated by availability + affection to keep it realistic and cheap."""
        chars = await db.ai_characters.find(
            {"relationships": {"$exists": True, "$not": {"$size": 0}}}, {"_id": 0}).to_list(300)
        by_admin = {}
        for c in chars:
            by_admin.setdefault(c.get("created_by"), []).append(c)
        for admin_id, clist in by_admin.items():
            if not admin_id:
                continue
            cmap = {c["id"]: c for c in clist}
            pairs = []
            seen = set()
            for a in clist:
                for r in (a.get("relationships") or []):
                    b = cmap.get(r.get("character_id")) or await db.ai_characters.find_one(
                        {"id": r.get("character_id")}, {"_id": 0})
                    if not b:
                        continue
                    key = "|".join(sorted([a["id"], b["id"]]))
                    if key not in seen:
                        seen.add(key)
                        pairs.append((a, b, key))
            random.shuffle(pairs)
            for a, b, key in pairs:
                last = await db.ai_char_convos.find_one({"pair_key": key}, sort=[("created_at", -1)])
                if last and last.get("created_at") and (_now() - last["created_at"]).total_seconds() < 3 * 3600:
                    continue
                if random.random() > 0.5:
                    continue
                if not (await _char_available(a, admin_id) and await _char_available(b, admin_id)):
                    continue
                n = await _run_char_exchange(admin_id, a, b)
                if n:
                    break  # at most one exchange per admin per tick (cost control)

    async def convo_loop():
        await asyncio.sleep(90)
        while True:
            try:
                if settings_store.get("EMERGENT_LLM_KEY"):
                    await _convos_once()
            except Exception as e:
                logger.warning(f"ai-char convo_loop error: {e}")
            await asyncio.sleep(1200)  # every ~20 min

    router.proactive_loop = proactive_loop
    router.proactive_once = _proactive_once
    router.reply_loop = reply_loop
    router.replies_once = _replies_once
    router.live_loop = live_loop
    router.live_comments_once = _live_comments_once
    router.live_state = live_state
    router.convo_loop = convo_loop
    router.convos_once = _convos_once
    router.run_char_exchange = _run_char_exchange
    router.relation_tokens = _relation_tokens
    router.maybe_relay_to_relative = _maybe_relay_to_relative
    return router
