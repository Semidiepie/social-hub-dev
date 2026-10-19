"""
Iteration 61 — inter-character voice/send behaviors on AI characters.

Covers:
  * RELAY WITH REPLY-BACK  (POST /send on A → background _maybe_relay_to_relative;
    expect ai_char_convos rows for the A|B pair AND a new ai-role message in B's thread)
  * OVERHEAR DURING A CALL  (POST /voice-turn on A → multi-voice 'segments' array;
    at least one segment distant=true, one distant=false, convo rows persisted)
  * PASS THE PHONE          (POST /voice-turn on A → 'handoff' object with B's id,
    name, avatar, greeting_text, greeting_audio)
  * REGRESSION: plain voice turn (no relative mention) → no segments / no handoff
  * REGRESSION: mentions relative WITHOUT pass/relay intent (e.g. "I miss your mom")
    → no segments / no handoff (gating still works)

Only the TEST_-prefixed characters created by this file are mutated. They (and
their ai_char_messages, ai_char_state, ai_char_convos) are cleaned up on teardown.
The user's real characters are not touched.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://social-hub-dev-4.preview.emergentagent.com",
).rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"

# Public premade ElevenLabs voices used purely for the TTS path. If the
# account doesn't actually have access to them, _tts returns null audio but
# segments/handoff still come back structurally — assertions reflect that.
VOICE_A = "21m00Tcm4TlvDq8ikWAM"   # Rachel
VOICE_B = "EXAVITQu4vr4xnSDxMaL"   # Bella

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "postmeplex")


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def founder_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"founder login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


def _create_char(headers, name, voice_id, your_name="Sam"):
    body = {
        "name": name,
        "username": f"test_{uuid.uuid4().hex[:8]}",
        "persona": f"{name} is a friendly test character used only in automated tests.",
        "voice": voice_id,
        "your_name": your_name,
        "nickname": your_name,
        "relationship": "test",
        "age": 30,
        "affection": "warm",
        "allow_calls": True,
        "allow_live": True,
        "relationships": [],
    }
    r = requests.post(f"{BASE_URL}/api/ai-characters", json=body, headers=headers, timeout=30)
    assert r.status_code == 200, f"create char {name} failed: {r.status_code} {r.text}"
    return r.json()


def _set_relationships(headers, char, voice_id, rels, your_name="Sam"):
    """Re-PUT the whole character to set relationships (route uses full-body PUT)."""
    body = {
        "name": char["name"],
        "username": char["username"],
        "avatar_url": char.get("avatar_url"),
        "persona": char.get("persona", "test persona"),
        "voice": voice_id,
        "your_name": your_name,
        "nickname": your_name,
        "relationship": "test",
        "age": char.get("age") or 30,
        "affection": char.get("affection", "warm"),
        "allow_calls": True,
        "allow_live": True,
        "relationships": rels,
    }
    r = requests.put(
        f"{BASE_URL}/api/ai-characters/{char['id']}",
        json=body, headers=headers, timeout=30,
    )
    assert r.status_code == 200, f"PUT char {char['id']} failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def chars(founder_headers, mongo):
    """Create A (Rachel/daughter) and B (Bella/mother) with mutual relationships."""
    a = _create_char(founder_headers, f"TEST_Alice_{uuid.uuid4().hex[:6]}", VOICE_A)
    b = _create_char(founder_headers, f"TEST_Barbara_{uuid.uuid4().hex[:6]}", VOICE_B)

    # Mutual: A's mother is B, B's daughter is A
    _set_relationships(founder_headers, a, VOICE_A,
                       [{"character_id": b["id"], "relation": "mother"}])
    _set_relationships(founder_headers, b, VOICE_B,
                       [{"character_id": a["id"], "relation": "daughter"}])

    yield a, b

    # ---- teardown: delete both chars + their messages/state/convos ----
    for c in (a, b):
        try:
            requests.delete(
                f"{BASE_URL}/api/ai-characters/{c['id']}",
                headers=founder_headers, timeout=15,
            )
        except Exception:
            pass
    try:
        pair_key = "|".join(sorted([a["id"], b["id"]]))
        mongo.ai_char_convos.delete_many({"pair_key": pair_key})
        mongo.ai_char_state.delete_many({"character_id": {"$in": [a["id"], b["id"]]}})
        mongo.ai_char_messages.delete_many({"character_id": {"$in": [a["id"], b["id"]]}})
    except Exception:
        pass


# ---------- helpers ----------

def _thread(headers, char_id):
    r = requests.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread",
                     headers=headers, timeout=20)
    assert r.status_code == 200, f"thread fetch failed: {r.status_code} {r.text}"
    data = r.json()
    # route returns {messages: [...]} per iteration-60 context
    return data.get("messages", data if isinstance(data, list) else [])


# ============================================================
# RELAY WITH REPLY-BACK
# ============================================================
class TestRelayReplyBack:
    def test_relay_creates_convo_and_pings_user(self, founder_headers, chars, mongo):
        a, b = chars
        pair_key = "|".join(sorted([a["id"], b["id"]]))

        # baseline: count B's existing ai messages
        before = _thread(founder_headers, b["id"])
        before_ai = [m for m in before if m.get("role") == "ai"]
        before_count = len(before_ai)

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{a['id']}/send",
            json={"text": "tell your mom I love her", "tz": "America/New_York"},
            headers=founder_headers, timeout=30,
        )
        assert r.status_code == 200, f"send failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("pending") is True, body

        # Poll up to ~90s for the background relay task:
        #   1) ai_char_convos has rows for A|B
        #   2) B's thread gains a NEW ai-role message
        got_convos = False
        got_relative_ping = False
        deadline = time.time() + 90
        while time.time() < deadline:
            if not got_convos:
                if mongo.ai_char_convos.count_documents({"pair_key": pair_key}) > 0:
                    got_convos = True
            if not got_relative_ping:
                thread_b = _thread(founder_headers, b["id"])
                ai_msgs = [m for m in thread_b if m.get("role") == "ai"]
                if len(ai_msgs) > before_count:
                    got_relative_ping = True
                    new_msg = ai_msgs[-1]
            if got_convos and got_relative_ping:
                break
            time.sleep(3)

        assert got_convos, (
            f"ai_char_convos has no rows for A|B after 90s. "
            f"count={mongo.ai_char_convos.count_documents({'pair_key': pair_key})}"
        )
        assert got_relative_ping, (
            f"B's thread did not gain a new ai-role message after 90s "
            f"(before={before_count})"
        )

        # Sanity: the new ai message has non-empty text
        assert new_msg.get("text", "").strip(), f"empty new ai msg: {new_msg}"


# ============================================================
# OVERHEAR (segments)
# ============================================================
class TestOverhear:
    def test_voice_turn_overhear_returns_segments(self, founder_headers, chars, mongo):
        a, b = chars
        pair_key = "|".join(sorted([a["id"], b["id"]]))
        convos_before = mongo.ai_char_convos.count_documents({"pair_key": pair_key})

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{a['id']}/voice-turn",
            json={"text": "can you ask your mom what is for dinner",
                  "tz": "America/New_York"},
            headers=founder_headers, timeout=120,
        )
        assert r.status_code == 200, f"voice-turn failed: {r.status_code} {r.text}"
        body = r.json()
        assert "segments" in body, f"no 'segments' in body: {body}"
        assert "handoff" not in body, f"unexpected handoff: {body}"
        segs = body["segments"]
        assert isinstance(segs, list) and len(segs) >= 2, f"segments={segs}"

        # Each segment has required keys with correct types
        for s in segs:
            assert "audio_url" in s and "distant" in s and "text" in s, s
            assert isinstance(s["distant"], bool), s
            # audio_url may be a data: URI or null (if ElevenLabs voice unavailable)
            if s["audio_url"] is not None:
                assert isinstance(s["audio_url"], str) and s["audio_url"], s
            assert isinstance(s["text"], str) and s["text"], s

        distants = [s["distant"] for s in segs]
        assert any(distants), f"no distant=true segment: {segs}"
        assert any(not d for d in distants), f"no distant=false segment: {segs}"

        # 'reply' is A's closing line to the user — present + non-empty
        assert isinstance(body.get("reply"), str) and body["reply"].strip(), body

        # Convo rows for the between-them lines got persisted
        convos_after = mongo.ai_char_convos.count_documents({"pair_key": pair_key})
        assert convos_after > convos_before, (
            f"ai_char_convos did not grow: before={convos_before} after={convos_after}"
        )


# ============================================================
# PASS THE PHONE (handoff)
# ============================================================
class TestPassThePhone:
    def test_voice_turn_pass_the_phone_returns_handoff(self, founder_headers, chars):
        a, b = chars

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{a['id']}/voice-turn",
            json={"text": "pass the phone to your mom", "tz": "America/New_York"},
            headers=founder_headers, timeout=90,
        )
        assert r.status_code == 200, f"voice-turn failed: {r.status_code} {r.text}"
        body = r.json()

        assert "handoff" in body, f"no handoff in body: {body}"
        assert "segments" not in body, f"unexpected segments: {body}"

        h = body["handoff"]
        assert h["character_id"] == b["id"], h
        assert h["name"] == b["name"], h
        assert "avatar_url" in h
        assert isinstance(h.get("greeting_text"), str) and h["greeting_text"].strip(), h
        # greeting_audio may be null (voice unavailable) OR data:audio/mpeg;base64,...
        assert "greeting_audio" in h

        # 'audio_url' is A's hand-off line (also may be null if TTS failed)
        assert "audio_url" in body
        # 'reply' is A's spoken line to the user
        assert isinstance(body.get("reply"), str) and body["reply"].strip(), body


# ============================================================
# REGRESSION: plain voice turn (no relative)
# ============================================================
class TestRegressionPlainVoiceTurn:
    def test_normal_voice_turn_no_handoff_no_segments(self, founder_headers, chars):
        a, _ = chars

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{a['id']}/voice-turn",
            json={"text": "how was your day?", "tz": "America/New_York"},
            headers=founder_headers, timeout=90,
        )
        assert r.status_code == 200, f"voice-turn failed: {r.status_code} {r.text}"
        body = r.json()
        assert "segments" not in body, f"unexpected segments: {body}"
        assert "handoff" not in body, f"unexpected handoff: {body}"
        assert isinstance(body.get("reply"), str) and body["reply"].strip(), body
        assert "audio_url" in body


# ============================================================
# REGRESSION: mentions relative but NO pass/relay intent
# ============================================================
class TestRegressionRelativeMentionNoIntent:
    def test_mention_relative_without_intent_no_handoff_no_segments(
        self, founder_headers, chars,
    ):
        a, _ = chars

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{a['id']}/voice-turn",
            json={"text": "I miss your mom", "tz": "America/New_York"},
            headers=founder_headers, timeout=90,
        )
        assert r.status_code == 200, f"voice-turn failed: {r.status_code} {r.text}"
        body = r.json()
        assert "segments" not in body, f"unexpected segments: {body}"
        assert "handoff" not in body, f"unexpected handoff: {body}"
        assert isinstance(body.get("reply"), str) and body["reply"].strip(), body
