"""Iteration 63: Background-audio environment awareness for AI characters.

Tests the new behavior in /app/backend/routes/ai_characters.py:
  - _diarize_convert now passes diarize=True + tag_audio_events=True to ElevenLabs
    scribe_v1 (with a plain-convert fallback if tag_audio_events is rejected).
  - _audio_env() builds a short "BACKGROUND AUDIO ..." note from STT event-tags
    (free) and, when deep=True, a quick Gemini 2.5-flash listen. Non-fatal on error.
  - _transcribe_url returns (text, note) with env folded in (deep=True) — used by
    the voice-note reply loop.
  - /api/ai-characters/stt folds env (deep=False) into speaker_note.

Scope:
  REGRESSION-first (critical) — the main risk is tag_audio_events breaking
  scribe_v1, or _audio_env raising and killing the STT path.

Covers:
  1. POST /api/ai-characters/stt → 200 with {text, speaker_note} and no 500.
  2. Voice-note AI reply pipeline still works end-to-end (send audio → ai audio reply).
  3. Normal text reply still works (/send text -> ai text reply).
  4. voice-turn /voice-turn still works (text -> {reply, audio_url}).
  5. (informational) audio-event tagging path doesn't crash on a short clip; if a
     music clip is reachable, STT still returns 200.

Cleanup: deletes any TEST_-prefixed characters this test created.
"""
import io
import os
import time
import uuid

import pytest
import requests


def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().strip('"').rstrip("/")
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

FOUNDER_IDENT = "semidiepie"
FOUNDER_PIN = "7455"

# Small public mp3s for STT (short clean speech + a short clip for the pipeline)
SMALL_PUBLIC_AUDIO = "https://download.samplelib.com/mp3/sample-3s.mp3"
# A short "music-ish" clip (also mp3) — used only informationally; test tolerates failure
MUSIC_PUBLIC_AUDIO = "https://download.samplelib.com/mp3/sample-6s.mp3"
PREMADE_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def founder_token():
    r = requests.post(f"{API}/auth/login-pin",
                      json={"identifier": FOUNDER_IDENT, "pin": FOUNDER_PIN}, timeout=30)
    assert r.status_code == 200, f"login-pin failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no access_token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth(founder_token):
    return {"Authorization": f"Bearer {founder_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def test_character(auth):
    """Create a TEST_-prefixed AI character for voice-reply testing. Cleaned up after."""
    body = {
        "name": "TEST_AudioEnvChar",
        "username": f"TEST_audenv_{uuid.uuid4().hex[:6]}",
        "persona": "You are a cheerful friend. Keep replies very short.",
        "voice": PREMADE_VOICE_ID,
        "allow_calls": False,
        "allow_live": False,
    }
    r = requests.post(f"{API}/ai-characters", headers=auth, json=body, timeout=30)
    assert r.status_code == 200, f"create char failed: {r.status_code} {r.text}"
    c = r.json()
    yield c
    try:
        requests.delete(f"{API}/ai-characters/{c['id']}", headers=auth, timeout=20)
    except Exception:
        pass


# ---------- 1. /stt regression ----------
class TestSttRegression:
    """tag_audio_events must NOT break scribe_v1 — /stt still returns 200
    with both keys ('text', 'speaker_note'), no 500."""

    def test_stt_returns_text_and_speaker_note_no_500(self, founder_token):
        audio = requests.get(SMALL_PUBLIC_AUDIO, timeout=30).content
        assert audio and len(audio) > 500, "could not fetch sample audio"
        files = {"audio": ("sample.mp3", io.BytesIO(audio), "audio/mpeg")}
        headers = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/ai-characters/stt", headers=headers, files=files, timeout=120)
        assert r.status_code != 500, f"stt returned 500: {r.text}"
        assert r.status_code == 200, f"stt failed: {r.status_code} {r.text}"
        j = r.json()
        assert "text" in j, f"missing 'text' key: {j}"
        assert "speaker_note" in j, f"missing 'speaker_note' key: {j}"
        assert isinstance(j["text"], str)
        assert isinstance(j["speaker_note"], str)

    def test_stt_empty_audio_rejected(self, founder_token):
        files = {"audio": ("empty.mp3", io.BytesIO(b""), "audio/mpeg")}
        headers = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/ai-characters/stt", headers=headers, files=files, timeout=30)
        # Should 400, NOT 500 (verifies _audio_env/_diarize_convert path doesn't blow up pre-validation)
        assert r.status_code == 400, f"expected 400 for empty audio, got {r.status_code}: {r.text}"


# ---------- 2. Voice-note AI reply pipeline regression ----------
class TestVoiceNoteReplyRegression:
    """_transcribe_url now runs _audio_env(deep=True) internally — confirm the
    reply loop still produces an AI voice-note reply with a Cloudinary URL."""

    def test_voice_in_yields_audio_reply(self, auth, test_character):
        char_id = test_character["id"]
        body = {
            "text": "", "media_url": SMALL_PUBLIC_AUDIO,
            "media_type": "audio", "audio_duration": 3, "tz": "America/New_York",
        }
        r = requests.post(f"{API}/ai-characters/{char_id}/send", headers=auth, json=body, timeout=20)
        assert r.status_code == 200, f"/send audio failed: {r.status_code} {r.text}"
        assert r.json().get("pending") is True

        found = None
        deadline = time.time() + 240
        while time.time() < deadline:
            tr = requests.get(f"{API}/ai-characters/{char_id}/thread", headers=auth, timeout=15)
            if tr.status_code == 200:
                for m in tr.json().get("messages", []):
                    if m.get("role") == "ai" and m.get("media_type") == "audio" and m.get("media_url"):
                        found = m
                        break
                if found:
                    break
            time.sleep(5)
        assert found is not None, "AI did not produce a voice-note reply within 240s (regression)"
        url = found["media_url"]
        assert url.startswith("https://"), f"audio reply url not https: {url}"
        assert "cloudinary" in url.lower(), f"audio reply url not cloudinary: {url}"


# ---------- 3. Normal text reply regression ----------
class TestTextReplyRegression:
    def test_text_in_yields_text_reply(self, auth, test_character):
        char_id = test_character["id"]
        r = requests.post(f"{API}/ai-characters/{char_id}/send", headers=auth,
                          json={"text": "hi", "tz": "America/New_York"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("pending") is True

        found = None
        deadline = time.time() + 240
        while time.time() < deadline:
            tr = requests.get(f"{API}/ai-characters/{char_id}/thread", headers=auth, timeout=15)
            if tr.status_code == 200:
                for m in tr.json().get("messages", []):
                    if m.get("role") == "ai" and (m.get("media_type") in (None, "")):
                        if (m.get("text") or "").strip():
                            found = m
                            break
                if found:
                    break
            time.sleep(4)
        assert found is not None, "AI did not produce a text reply within 240s"
        assert found.get("media_url") in (None, "")


# ---------- 4. voice-turn regression ----------
class TestVoiceTurnRegression:
    def test_voice_turn_text_in_yields_reply_and_audio(self, auth, test_character):
        char_id = test_character["id"]
        r = requests.post(f"{API}/ai-characters/{char_id}/voice-turn", headers=auth,
                          json={"text": "hey", "tz": "America/New_York"}, timeout=120)
        assert r.status_code == 200, f"/voice-turn failed: {r.status_code} {r.text}"
        j = r.json()
        assert "reply" in j, f"missing 'reply' key: {j}"
        assert isinstance(j["reply"], str) and j["reply"].strip(), f"empty reply: {j}"
        assert "audio_url" in j, f"missing 'audio_url' key: {j}"
        # audio_url can be None if ElevenLabs hiccups, but key must be present.
        # /voice-turn historically returns a data: URI (inline base64) for low-latency
        # playback — accept both forms.
        if j.get("audio_url"):
            assert j["audio_url"].startswith(("https://", "data:audio/")), \
                f"bad audio_url scheme: {j['audio_url'][:60]}"


# ---------- 5. Informational: _audio_env path doesn't crash on a music-ish clip ----------
class TestAudioEnvInformational:
    """Best-effort positive — exercise the audio-event tagging path on a 2nd public
    clip. We can't call _audio_env() directly from outside (it's a closure in
    build_router). The simplest proxy is to confirm /stt still returns 200 for
    this clip (meaning tag_audio_events + env-building did not crash the path)."""

    def test_stt_still_returns_200_for_second_clip(self, founder_token):
        try:
            audio = requests.get(MUSIC_PUBLIC_AUDIO, timeout=30).content
        except Exception as e:
            pytest.skip(f"couldn't fetch music clip: {e}")
        if not audio or len(audio) < 500:
            pytest.skip("music clip empty")
        files = {"audio": ("music.mp3", io.BytesIO(audio), "audio/mpeg")}
        headers = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/ai-characters/stt", headers=headers, files=files, timeout=120)
        assert r.status_code != 500, f"stt returned 500 on 2nd clip: {r.text}"
        assert r.status_code == 200, f"stt failed on 2nd clip: {r.status_code} {r.text}"
        j = r.json()
        assert "text" in j and "speaker_note" in j
        # Informational: log whether a BACKGROUND AUDIO note surfaced
        note = j.get("speaker_note", "")
        print(f"[info] 2nd-clip speaker_note (deep=False, tags-only): {note!r}")
