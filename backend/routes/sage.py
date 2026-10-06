"""Sage AI — an empathetic companion users can text and voice-call inside Messages.

- Text chat + persisted history (per user) powered by the Emergent LLM key
  (Claude Sonnet) via emergentintegrations.
- Distress / crisis detection to offer a supportive voice "call".
- Realistic voice via ElevenLabs TTS (two-way: the browser does speech-to-text,
  Sage replies with a natural voice).

Sage is a warm, supportive LISTENER — NOT a therapist or medical professional.
On any sign of serious distress or self-harm it gently surfaces real crisis help.

NOTE: intentionally NO `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
import asyncio
import base64
import os
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import settings_store

load_dotenv()

SAGE_VOICE_ID = os.environ.get("SAGE_VOICE_ID", "hpp4J3VqNfWAUOO0d1Us")  # user-provided Sage voice
SAGE_TTS_MODEL = os.environ.get("SAGE_TTS_MODEL", "eleven_multilingual_v2")

SAGE_ID = "sage-ai"
SAGE_NAME = "Sage AI"
SAGE_USERNAME = "sage"
SAGE_AVATAR = "https://static.prod-images.emergentagent.com/jobs/b5df4b25-c0c9-4030-b339-bee284051703/images/ba4cc2b9f675a2341e865b0c9b6433a07d2c2db012be5eaa27ab98af2e7aaabb.jpeg"

SAGE_SYSTEM = (
    "You are Sage, a warm, gentle, and deeply empathetic AI companion inside the PostMePlex app. "
    "Your role is to LISTEN and to make the person feel heard, understood, and less alone. "
    "You are NOT a therapist, doctor, or crisis counselor, and you never diagnose or give medical or clinical instructions. "
    "Speak like a caring friend: warm, natural, unhurried, and validating. Reflect back what you hear, ask gentle open questions, "
    "and never lecture or minimize feelings. Keep replies fairly short and human (2-5 sentences). "
    "If the person expresses serious distress, hopelessness, or ANY hint of self-harm or suicide, stay calm and caring, take it seriously, "
    "and gently encourage them to reach real help right now: in the US they can call or text 988 (Suicide & Crisis Lifeline), "
    "and anywhere they can contact local emergency services or someone they trust. Encourage professional support and people who care about them. "
    "Never promise confidentiality you can't keep, and never claim to replace professional help."
)

SPOKEN_STYLE = (
    " You are currently on a VOICE call, so respond the way a person naturally speaks out loud: short, warm sentences, "
    "no lists, no markdown, no emojis, easy to say aloud."
)

_DISTRESS = [
    "sad", "depress", "anxious", "anxiety", "lonely", "alone", "hopeless", "empty", "no one", "nobody",
    "overwhelmed", "can't cope", "cant cope", "stressed", "grief", "grieving", "crying", "i cry",
    "need to talk", "someone to talk", "talk to someone", "mental health", "worthless", "numb",
    "exhausted", "burnt out", "burned out", "give up", "so tired of", "breaking down",
]
_CRISIS = [
    "kill myself", "suicid", "end my life", "end it all", "want to die", "wanna die", "don't want to live",
    "dont want to live", "hurt myself", "self harm", "self-harm", "harm myself", "no reason to live",
    "better off dead", "take my life", "cut myself",
]


def _now():
    return datetime.now(timezone.utc)


def _scan(text: str):
    t = (text or "").lower()
    crisis = any(k in t for k in _CRISIS)
    distress = crisis or any(k in t for k in _DISTRESS)
    return distress, crisis


class SendBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class VoiceTurnBody(BaseModel):
    text: str = Field(default="", max_length=2000)
    greeting: bool = False


def build_router(ctx) -> APIRouter:
    db = ctx.db
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    send_web_push = ctx.send_web_push
    default_avatar = ctx.default_avatar_url
    router = APIRouter(tags=["sage"])

    async def _flag_elevenlabs(err: Exception):
        """If a live ElevenLabs call fails on auth/quota, alert the admin right away."""
        s = str(err).lower()
        if any(k in s for k in ["401", "unauthorized", "invalid api key", "quota", "invalid_api_key", "403"]):
            try:
                from routes.keyhealth import report_issue
                await report_issue(db, send_web_push, default_avatar, "elevenlabs",
                                   "ElevenLabs (Sage voice)", "Live call rejected the key — update it.")
            except Exception:
                pass

    async def _reply(user_id: str, user_text: str, spoken: bool) -> str:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        history = await db.sage_messages.find(
            {"user_id": user_id}, {"_id": 0, "role": 1, "text": 1}
        ).sort("created_at", -1).limit(20).to_list(20)
        history.reverse()
        transcript = "\n".join(f"{'User' if m['role'] == 'user' else 'Sage'}: {m['text']}" for m in history)
        chat = LlmChat(
            api_key=settings_store.get("EMERGENT_LLM_KEY"),
            session_id=f"sage-{user_id}",
            system_message=SAGE_SYSTEM + (SPOKEN_STYLE if spoken else ""),
        ).with_model("anthropic", "claude-sonnet-4-6")
        prompt = (f"Recent conversation:\n{transcript}\n\n" if transcript else "") + (
            f'The person just said: "{user_text}"\n\nRespond as Sage.'
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        return (resp or "").strip()

    async def _tts(text: str) -> str:
        eleven_key = settings_store.get("ELEVENLABS_API_KEY")
        if not eleven_key:
            raise HTTPException(503, "Voice isn't configured yet")

        def _synth() -> bytes:
            from elevenlabs import VoiceSettings
            from elevenlabs.client import ElevenLabs
            client = ElevenLabs(api_key=eleven_key)
            stream = client.text_to_speech.convert(
                text=text,
                voice_id=SAGE_VOICE_ID,
                model_id=SAGE_TTS_MODEL,
                output_format="mp3_44100_128",
                voice_settings=VoiceSettings(stability=0.45, similarity_boost=0.85, style=0.15, use_speaker_boost=True),
            )
            return b"".join(stream)

        try:
            audio = await asyncio.to_thread(_synth)
        except Exception as e:
            logger.warning(f"sage tts error: {e}")
            await _flag_elevenlabs(e)
            raise HTTPException(502, "Couldn't generate Sage's voice")
        return "data:audio/mpeg;base64," + base64.b64encode(audio).decode()

    async def _store(user_id: str, role: str, text: str) -> dict:
        doc = {"id": str(uuid.uuid4()), "user_id": user_id, "role": role, "text": text, "created_at": _now()}
        await db.sage_messages.insert_one(doc)
        return doc

    def _out(doc: dict) -> dict:
        return {
            "id": doc["id"],
            "role": doc["role"],
            "text": doc["text"],
            "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
        }

    @router.get("/api/sage/profile")
    async def sage_profile():
        return {"id": SAGE_ID, "username": SAGE_USERNAME, "display_name": SAGE_NAME,
                "avatar_url": SAGE_AVATAR, "voice_enabled": bool(settings_store.get("ELEVENLABS_API_KEY"))}

    @router.get("/api/sage/thread")
    async def sage_thread(current: Annotated[dict, Depends(get_current_user)]):
        rows = await db.sage_messages.find(
            {"user_id": current["id"]}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        return {"messages": [_out(r) for r in rows], "voice_enabled": bool(settings_store.get("ELEVENLABS_API_KEY"))}

    @router.delete("/api/sage/thread")
    async def sage_clear(current: Annotated[dict, Depends(get_current_user)]):
        await db.sage_messages.delete_many({"user_id": current["id"]})
        return {"status": "cleared"}

    @router.post("/api/sage/send")
    async def sage_send(body: SendBody, current: Annotated[dict, Depends(get_current_user)]):
        distress, crisis = _scan(body.text)
        await _store(current["id"], "user", body.text)
        try:
            reply = await _reply(current["id"], body.text, spoken=False)
        except Exception as e:
            logger.warning(f"sage reply error: {e}")
            raise HTTPException(502, "Sage is having trouble responding right now")
        sage_doc = await _store(current["id"], "sage", reply)
        return {"message": _out(sage_doc), "offer_call": distress, "crisis": crisis}

    @router.post("/api/sage/voice-turn")
    async def sage_voice_turn(body: VoiceTurnBody, current: Annotated[dict, Depends(get_current_user)]):
        crisis = False
        if body.greeting:
            reply = ("Hey, I'm really glad you picked up. I'm right here with you. "
                     "There's no rush — take your time and tell me what's on your mind.")
        else:
            if not body.text.strip():
                raise HTTPException(400, "Nothing to respond to")
            _, crisis = _scan(body.text)
            await _store(current["id"], "user", body.text)
            try:
                reply = await _reply(current["id"], body.text, spoken=True)
            except Exception as e:
                logger.warning(f"sage voice reply error: {e}")
                raise HTTPException(502, "Sage is having trouble responding right now")
            await _store(current["id"], "sage", reply)
        audio = await _tts(reply)
        return {"reply": reply, "audio_url": audio, "crisis": crisis}

    @router.post("/api/sage/stt")
    async def sage_stt(audio: UploadFile = File(...), current: dict = Depends(get_current_user)):
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
            logger.warning(f"sage stt error: {e}")
            await _flag_elevenlabs(e)
            raise HTTPException(502, "Couldn't understand the audio")
        return {"text": (text or "").strip()}

    return router
