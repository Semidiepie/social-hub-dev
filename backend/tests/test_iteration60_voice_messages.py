"""Iteration 60: Voice messages in DMs & AI character chats + 500-cap fix + diarization STT.

Covers:
 - Human DM voice message storage/retrieval and preview text
 - 500-cap fix: GET /thread and GET /conversations/{id}/messages return ascending by created_at (newest included)
 - AI voice-for-voice: send audio → background reply_loop produces AI message with media_type='audio' + cloudinary URL
 - /api/ai-characters/stt returns both 'text' and 'speaker_note' keys
 - Normal AI text reply still works (reply_loop regression)
"""
import os
import time
import uuid
import io

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

# A small public audio file (short MP3). Using the standard Wikipedia English numbers one — a tiny valid MP3.
SMALL_PUBLIC_AUDIO = "https://download.samplelib.com/mp3/sample-3s.mp3"
PREMADE_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel — standard ElevenLabs premade voice


@pytest.fixture(scope="module")
def founder_token():
    r = requests.post(f"{API}/auth/login-pin",
                      json={"identifier": FOUNDER_IDENT, "pin": FOUNDER_PIN}, timeout=30)
    assert r.status_code == 200, f"login-pin failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no access_token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth(founder_token):
    return {"Authorization": f"Bearer {founder_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def founder_id(auth):
    r = requests.get(f"{API}/auth/me", headers=auth, timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def test_character(auth):
    """Create a TEST_-prefixed AI character for voice-reply testing. Cleaned up after."""
    body = {
        "name": "TEST_VoiceCharA",
        "username": f"TEST_voicechar_{uuid.uuid4().hex[:6]}",
        "persona": "You are a cheerful friend. Keep replies short.",
        "voice": PREMADE_VOICE_ID,
        "allow_calls": False,
        "allow_live": False,
    }
    r = requests.post(f"{API}/ai-characters", headers=auth, json=body, timeout=30)
    assert r.status_code == 200, f"create char failed: {r.status_code} {r.text}"
    c = r.json()
    yield c
    # Teardown
    try:
        requests.delete(f"{API}/ai-characters/{c['id']}", headers=auth, timeout=20)
    except Exception:
        pass


# ---------- Backend: Human DM voice message ----------
class TestDmVoiceMessage:
    """We send a DM voice to ourselves is not allowed (need 2 members), so we create a
    second TEST_ user, mutual-follow, create conv, and send a voice message."""

    @pytest.fixture(scope="class")
    def partner_token(self):
        uname = f"tpb_voice_{uuid.uuid4().hex[:6]}"  # keep <=20 chars
        reg = {
            "email": f"{uname}@example.com", "password": "Partner123!",
            "username": uname, "display_name": "Voice Partner", "pin": "1234",
        }
        r = requests.post(f"{API}/auth/register", json=reg, timeout=20)
        assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
        return r.json()["access_token"], r.json()["user"]["id"], uname

    def test_dm_voice_message_flow(self, auth, founder_id, partner_token):
        p_tok, p_id, p_uname = partner_token
        p_auth = {"Authorization": f"Bearer {p_tok}", "Content-Type": "application/json"}

        # Mutual follow
        r = requests.post(f"{API}/users/{p_id}/follow", headers=auth, timeout=10)
        assert r.status_code in (200, 201)
        r = requests.post(f"{API}/users/{founder_id}/follow", headers=p_auth, timeout=10)
        assert r.status_code in (200, 201)

        # Create 1:1 conversation
        r = requests.post(f"{API}/conversations", headers=auth,
                          json={"member_ids": [p_id]}, timeout=15)
        assert r.status_code == 200, f"create conv failed: {r.status_code} {r.text}"
        conv_id = r.json()["id"]

        # Send VOICE-ONLY message (no text) — this must NOT 400
        audio_url = "https://res.cloudinary.com/dpnrol54k/video/upload/sample.mp3"
        r = requests.post(f"{API}/conversations/{conv_id}/messages", headers=auth,
                          json={"audio_url": audio_url, "audio_duration": 4.2}, timeout=15)
        assert r.status_code == 200, f"send voice msg failed: {r.status_code} {r.text}"
        msg = r.json()
        assert msg.get("audio_url") == audio_url
        assert msg.get("audio_duration") == 4.2
        assert msg.get("text", "") == ""

        # GET messages — returns audio_url + audio_duration (via setdefault for older msgs too)
        r = requests.get(f"{API}/conversations/{conv_id}/messages", headers=auth, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(m.get("audio_url") == audio_url and m.get("audio_duration") == 4.2 for m in rows), \
            "voice message not returned in list"
        # All messages have the setdefault keys present
        for m in rows:
            assert "audio_url" in m
            assert "audio_duration" in m

        # Conversation preview must show '🎤 Voice message'
        r = requests.get(f"{API}/conversations", headers=auth, timeout=15)
        assert r.status_code == 200
        conv = next((c for c in r.json() if c["id"] == conv_id), None)
        assert conv is not None
        assert "Voice message" in (conv.get("last_message") or {}).get("text", "")

        # Cleanup — delete conversation
        requests.delete(f"{API}/conversations/{conv_id}", headers=auth, timeout=15)
        requests.delete(f"{API}/conversations/{conv_id}", headers=p_auth, timeout=15)


# ---------- Backend: 500-cap chronological ordering ----------
class TestChronologicalOrdering:
    def test_thread_order_ascending(self, auth, test_character):
        char_id = test_character["id"]
        # Send 3 text messages back to back via /send; but that defers the AI reply.
        # Instead we just verify the ordering invariant on whatever's in the thread.
        for i in range(3):
            requests.post(f"{API}/ai-characters/{char_id}/send", headers=auth,
                          json={"text": f"TEST ordering {i}", "tz": "America/New_York"}, timeout=15)
            time.sleep(0.5)
        r = requests.get(f"{API}/ai-characters/{char_id}/thread", headers=auth, timeout=15)
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) >= 3
        # ascending by created_at
        ts = [m["created_at"] for m in msgs]
        assert ts == sorted(ts), "thread messages not sorted ascending by created_at"
        # last message is one of the ones we sent (newest included)
        last_text = msgs[-1]["text"]
        assert last_text == "TEST ordering 2" or msgs[-1]["role"] == "ai", \
            f"newest message was unexpected: {msgs[-1]}"

    def test_dm_messages_order_ascending(self, auth, founder_id):
        # Reuse an existing conv if available, else skip
        r = requests.get(f"{API}/conversations", headers=auth, timeout=15)
        assert r.status_code == 200
        convs = r.json()
        if not convs:
            pytest.skip("no conversations to test ordering")
        conv_id = convs[0]["id"]
        r = requests.get(f"{API}/conversations/{conv_id}/messages", headers=auth, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        if len(rows) < 2:
            pytest.skip("not enough messages to assert ordering")
        ts = [m["created_at"] for m in rows]
        assert ts == sorted(ts), "DM messages not sorted ascending by created_at"


# ---------- Backend: STT endpoint returns text + speaker_note ----------
class TestSttEndpoint:
    def test_stt_returns_both_keys(self, founder_token):
        # Use a real small MP3 so ElevenLabs STT accepts it
        audio = requests.get(SMALL_PUBLIC_AUDIO, timeout=30).content
        files = {"audio": ("sample.mp3", io.BytesIO(audio), "audio/mpeg")}
        headers = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/ai-characters/stt", headers=headers, files=files, timeout=90)
        assert r.status_code != 500, f"stt returned 500: {r.text}"
        assert r.status_code == 200, f"stt failed: {r.status_code} {r.text}"
        j = r.json()
        assert "text" in j, f"missing 'text' key: {j}"
        assert "speaker_note" in j, f"missing 'speaker_note' key: {j}"
        assert isinstance(j["speaker_note"], str)


# ---------- Backend: AI voice-for-voice (deferred reply loop) ----------
class TestAiVoiceForVoice:
    def test_voice_in_yields_audio_reply(self, auth, test_character):
        char_id = test_character["id"]
        # Post a voice message to the character
        body = {
            "text": "", "media_url": SMALL_PUBLIC_AUDIO,
            "media_type": "audio", "audio_duration": 3, "tz": "America/New_York",
        }
        r = requests.post(f"{API}/ai-characters/{char_id}/send", headers=auth, json=body, timeout=20)
        assert r.status_code == 200, f"/send audio failed: {r.status_code} {r.text}"
        assert r.json().get("pending") is True

        # Poll /thread up to ~240s for an AI-role audio reply
        found = None
        deadline = time.time() + 240
        while time.time() < deadline:
            tr = requests.get(f"{API}/ai-characters/{char_id}/thread", headers=auth, timeout=15)
            if tr.status_code == 200:
                msgs = tr.json().get("messages", [])
                for m in msgs:
                    if m.get("role") == "ai" and m.get("media_type") == "audio" and m.get("media_url"):
                        found = m
                        break
                if found:
                    break
            time.sleep(5)

        assert found is not None, "AI did not produce a voice-note reply within 240s"
        url = found["media_url"]
        assert url.startswith("https://"), f"audio reply url not https: {url}"
        assert "cloudinary" in url.lower(), f"audio reply url not cloudinary: {url}"


# ---------- Backend: regression — normal AI text reply still works ----------
class TestAiTextReplyRegression:
    def test_text_in_yields_text_reply(self, auth, test_character):
        char_id = test_character["id"]
        r = requests.post(f"{API}/ai-characters/{char_id}/send", headers=auth,
                          json={"text": "hi there", "tz": "America/New_York"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("pending") is True
        # Poll for AI text message (media_type null)
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
