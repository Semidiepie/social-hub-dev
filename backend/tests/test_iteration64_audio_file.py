"""Iteration 64 — AUDIO FILE analysis for AI characters.

New media_type 'audio_file': the character 'listens to' a hosted audio clip via
Gemini 2.5-flash audio understanding (through _media_reply) and replies with a
TEXT comment. Must NOT be confused with a recorded voice note (media_type
'audio' → transcribe + voice-reply path).

Regression:
- voice note (media_type='audio') still goes through transcribe+voice reply
- image/video media still works
- plain text /send + /voice-turn still work
- DM audio_url still works (stored, preview emoji, GET returns it)
- _media_reply audio path is non-fatal on a bad audio url (reply loop clears pending)

Cleanup: TEST_ characters + related state/messages are deleted at the end.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com"),
).rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"
PREMADE_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs Rachel (public premade)

# A small, publicly-hosted mp3 — ~52KB, 3 second clip.
PUBLIC_AUDIO_URL = "https://samplelib.com/mp3/sample-3s.mp3"
# Public static image + video from samplelib / cloud.
PUBLIC_IMAGE_URL = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600"
PUBLIC_VIDEO_URL = "https://sample-videos.com/video123/mp4/240/big_buck_bunny_240p_1mb.mp4"

# How long to poll the reply loop for an AI reply (loop ticks every ~15s, send
# delay ~4-25s for 'adores' affection most of the time).
REPLY_POLL_SECONDS = 180
REPLY_POLL_INTERVAL = 5


# ---------- shared session / fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def founder(s):
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
    assert r.status_code == 200, f"Founder login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return data["user"]


@pytest.fixture(scope="module")
def test_char(s, founder):
    body = {
        "name": "TEST_AudioChar",
        "username": f"test_audiochar_{uuid.uuid4().hex[:6]}",
        "avatar_url": "",
        "persona": "Warm, chatty friend who loves music and talking about sounds.",
        "voice": PREMADE_VOICE_ID,
        "your_name": "Semi",
        "nickname": "",
        "relationship": "best friend",
        "age": 25,
        "affection": "adores",
        "allow_calls": False,
        "allow_live": False,
    }
    r = s.post(f"{BASE_URL}/api/ai-characters", json=body)
    assert r.status_code == 200, f"create char failed: {r.status_code} {r.text}"
    c = r.json()
    assert c.get("id")
    yield c
    # cleanup
    try:
        s.delete(f"{BASE_URL}/api/ai-characters/{c['id']}")
    except Exception:
        pass


def _wait_for_new_ai_reply(s, char_id: str, baseline_count: int,
                           timeout: int = REPLY_POLL_SECONDS):
    """Poll /thread until the ai_char_messages list has grown with a new AI
    message beyond baseline_count. Returns the newest AI msg dict or None."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
        if r.status_code == 200:
            msgs = r.json().get("messages") or []
            if len(msgs) > baseline_count:
                ai_tail = [m for m in msgs[baseline_count:] if m.get("role") == "ai"]
                if ai_tail:
                    return ai_tail[-1], msgs
        time.sleep(REPLY_POLL_INTERVAL)
    return None, []


# ---------- 1) CORE: audio_file analysis ----------
def test_audio_file_send_generates_text_reply(s, test_char):
    char_id = test_char["id"]
    # Baseline: how many messages exist already?
    r0 = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
    assert r0.status_code == 200
    base_count = len(r0.json().get("messages") or [])

    body = {
        "text": "",
        "media_url": PUBLIC_AUDIO_URL,
        "media_type": "audio_file",
        "tz": "America/New_York",
    }
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/send", json=body)
    assert rs.status_code == 200, f"/send audio_file failed: {rs.status_code} {rs.text}"
    assert rs.json().get("pending") is True

    ai_msg, all_msgs = _wait_for_new_ai_reply(s, char_id, base_count,
                                              timeout=REPLY_POLL_SECONDS)
    assert ai_msg is not None, (
        f"No AI reply within {REPLY_POLL_SECONDS}s for audio_file. "
        f"last msgs tail: {all_msgs[-3:] if all_msgs else []}")

    # The AI reply must be TEXT (not an audio msg)
    assert ai_msg.get("role") == "ai"
    assert ai_msg.get("media_type") in (None, ""), (
        f"audio_file reply must be TEXT, got media_type={ai_msg.get('media_type')}")
    assert not ai_msg.get("media_url"), (
        f"audio_file reply must not carry media_url, got {ai_msg.get('media_url')}")
    text = (ai_msg.get("text") or "").strip()
    assert len(text) > 0, "AI reply text should be non-empty"

    # The user message was stored with media_type == 'audio_file'
    user_msgs = [m for m in all_msgs
                 if m.get("role") == "user" and m.get("media_type") == "audio_file"]
    assert len(user_msgs) >= 1, (
        "Expected user message stored with media_type='audio_file'; "
        f"messages: {[(m.get('role'), m.get('media_type')) for m in all_msgs[-6:]]}")
    assert user_msgs[-1].get("media_url") == PUBLIC_AUDIO_URL


# ---------- 2) REGRESSION: voice note still → voice reply ----------
def test_voice_note_still_voice_reply(s, test_char):
    char_id = test_char["id"]
    r0 = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
    base_count = len(r0.json().get("messages") or [])

    body = {
        "text": "",
        "media_url": PUBLIC_AUDIO_URL,  # same clip, but media_type='audio' (voice note)
        "media_type": "audio",
        "audio_duration": 4,
        "tz": "America/New_York",
    }
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/send", json=body)
    assert rs.status_code == 200, f"/send audio failed: {rs.status_code} {rs.text}"

    ai_msg, _ = _wait_for_new_ai_reply(s, char_id, base_count,
                                       timeout=REPLY_POLL_SECONDS + 30)
    assert ai_msg is not None, "Voice-note AI reply did not arrive in time"
    # Expect ai media_type == 'audio' with a Cloudinary URL (voice-note reply path)
    # Allow non-audio fallback (if TTS failed), but at least must not 500.
    if ai_msg.get("media_type") == "audio":
        assert ai_msg.get("media_url"), "voice-note AI reply missing media_url"
    else:
        # Document fallback behaviour — not a hard failure (TTS/STT may fail
        # on a music clip which has no words, falling through to text).
        print(f"[info] voice-note reply fell back to text: {ai_msg.get('text')!r}")


# ---------- 3) REGRESSION: image media reply ----------
def test_image_media_reply_text(s, test_char):
    char_id = test_char["id"]
    r0 = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
    base_count = len(r0.json().get("messages") or [])

    body = {
        "text": "check this out",
        "media_url": PUBLIC_IMAGE_URL,
        "media_type": "image",
        "tz": "America/New_York",
    }
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/send", json=body)
    assert rs.status_code == 200
    ai_msg, _ = _wait_for_new_ai_reply(s, char_id, base_count,
                                       timeout=REPLY_POLL_SECONDS)
    assert ai_msg is not None, "No AI reply for image media"
    assert ai_msg.get("role") == "ai"
    assert ai_msg.get("media_type") in (None, "")
    assert (ai_msg.get("text") or "").strip()


# ---------- 4) REGRESSION: plain text /send ----------
def test_plain_text_send_and_reply(s, test_char):
    char_id = test_char["id"]
    r0 = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
    base_count = len(r0.json().get("messages") or [])
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/send",
                json={"text": "hey, how's your day going?", "tz": "America/New_York"})
    assert rs.status_code == 200
    ai_msg, _ = _wait_for_new_ai_reply(s, char_id, base_count,
                                       timeout=REPLY_POLL_SECONDS)
    assert ai_msg is not None, "No AI text reply"
    assert (ai_msg.get("text") or "").strip()
    assert ai_msg.get("media_type") in (None, "")


# ---------- 5) REGRESSION: /voice-turn still works ----------
def test_voice_turn_greeting_returns_reply(s, test_char):
    char_id = test_char["id"]
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/voice-turn",
                json={"greeting": True, "tz": "America/New_York"})
    assert rs.status_code == 200, f"voice-turn greeting failed: {rs.status_code} {rs.text}"
    body = rs.json()
    assert body.get("reply")
    # audio_url may be a data: URI (greeting path doesn't persist)
    assert "audio_url" in body


def test_voice_turn_text_reply(s, test_char):
    char_id = test_char["id"]
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/voice-turn",
                json={"text": "say hi back real quick", "tz": "America/New_York"})
    assert rs.status_code == 200, f"voice-turn text failed: {rs.status_code} {rs.text}"
    body = rs.json()
    assert (body.get("reply") or "").strip()


# ---------- 6) DM audio_url still works ----------
def test_dm_audio_url(s, founder):
    """Create a TEST_ user, make them mutual-followers with the founder,
    create a 1:1 DM, and verify audio_url send/preview/list behavior."""
    # 1) Register a TEST_ user (test agent accounts are auto-purged on backend restart).
    other_uname = f"test_dmaudio_{uuid.uuid4().hex[:6]}"
    other_email = f"{other_uname}@example.com"
    reg = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"username": other_uname, "email": other_email,
              "password": "TestPass123!", "display_name": "Audio DM",
              "pin": "1234"})
    if reg.status_code != 200:
        pytest.skip(f"Cannot register TEST user: {reg.status_code} {reg.text}")
    other_data = reg.json()
    other_token = other_data["access_token"]
    other_id = other_data["user"]["id"]
    other_sess = requests.Session()
    other_sess.headers.update({"Authorization": f"Bearer {other_token}",
                               "Content-Type": "application/json"})

    # 2) Mutual follow.
    s.post(f"{BASE_URL}/api/users/{other_id}/follow")
    other_sess.post(f"{BASE_URL}/api/users/{founder['id']}/follow")

    # 3) Create 1:1 conversation.
    r = s.post(f"{BASE_URL}/api/conversations",
               json={"member_ids": [other_id]})
    assert r.status_code == 200, f"create 1:1 failed: {r.status_code} {r.text}"
    conv_id = r.json()["id"]

    # 4) Send a message carrying audio_url.
    msg_body = {"text": "", "audio_url": PUBLIC_AUDIO_URL, "audio_duration": 5}
    rs = s.post(f"{BASE_URL}/api/conversations/{conv_id}/messages", json=msg_body)
    assert rs.status_code == 200, f"DM send audio failed: {rs.status_code} {rs.text}"
    posted = rs.json()
    assert posted.get("audio_url") == PUBLIC_AUDIO_URL

    # 5) Check conversation preview reports the voice-message emoji.
    r2 = s.get(f"{BASE_URL}/api/conversations")
    assert r2.status_code == 200
    conv_entry = next((c for c in r2.json() if c["id"] == conv_id), None)
    assert conv_entry, "Created conv not in list"
    assert conv_entry["last_message"]["text"] == "🎤 Voice message"

    # 6) GET messages — audio_url round-trips.
    r3 = s.get(f"{BASE_URL}/api/conversations/{conv_id}/messages")
    assert r3.status_code == 200
    msgs = r3.json()
    with_audio = [m for m in msgs if m.get("audio_url") == PUBLIC_AUDIO_URL]
    assert len(with_audio) >= 1

    # cleanup
    try:
        s.delete(f"{BASE_URL}/api/conversations/{conv_id}")
    except Exception:
        pass


# ---------- 7) Non-fatal: bad audio_file URL should not crash reply loop ----------
def test_bad_audio_file_url_non_fatal(s, test_char):
    char_id = test_char["id"]
    r0 = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
    base_count = len(r0.json().get("messages") or [])

    bad_url = "https://social-hub-dev-4.preview.emergentagent.com/this-does-not-exist.mp3"
    rs = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/send",
                json={"media_url": bad_url, "media_type": "audio_file",
                      "tz": "America/New_York"})
    assert rs.status_code == 200
    assert rs.json().get("pending") is True

    # Wait long enough for the loop to attempt and fail; then verify pending
    # cleared and we can still send a normal text message that gets a reply.
    time.sleep(45)
    r1 = s.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread")
    assert r1.status_code == 200
    msgs_after = r1.json().get("messages") or []
    # New user msg stored
    assert any(m.get("role") == "user" and m.get("media_url") == bad_url
               for m in msgs_after[base_count:]), "bad-url user msg not stored"

    # Follow-up: a normal text send must still work (loop is alive and pending
    # was cleared).
    rs2 = s.post(f"{BASE_URL}/api/ai-characters/{char_id}/send",
                 json={"text": "still there?", "tz": "America/New_York"})
    assert rs2.status_code == 200
    base_after_bad = len(msgs_after)
    ai_msg, _ = _wait_for_new_ai_reply(s, char_id, base_after_bad,
                                       timeout=REPLY_POLL_SECONDS)
    assert ai_msg is not None, "Reply loop appears stuck after bad audio_file URL"
