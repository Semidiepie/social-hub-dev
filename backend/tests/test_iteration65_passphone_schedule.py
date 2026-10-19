"""
Iteration 65 — Pass-the-phone HANDOFF contract on /voice-turn.

Covers the fix for the reported bug ("asking Hope to pass the phone to her mom
Juliette didn't make Juliette actually join"):

  * POST /voice-turn with 'pass the phone to your mom' → RESPONSE MUST contain a
    'handoff' object with character_id = relative's id, plus reply + audio_url.
  * Schedule gating: when the relative is ASLEEP (sleep window covers 'now' in
    their state tz) → RESPONSE MUST NOT contain 'handoff'; must return a plain
    reply/audio_url excuse instead (relative does not fake-join).
  * Switch-back phrasing variants ('put her back on', 'pass me back to Hope')
    are detected as pass-phone intent and still produce a handoff.
  * Normal voice turn with no relative mention → reply + audio_url, NO handoff,
    NO segments.
  * Relay intent ('ask your mom ...') → 'segments' array (unchanged regression).

Only TEST_-prefixed characters created by this file are touched; they and
all their messages / state / convos are purged on teardown.
"""
import os
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

# Public ElevenLabs preset voice ids used only for the TTS path. If the account
# doesn't have access, _tts returns null audio but the handoff/reply contract
# is still produced — assertions reflect that.
VOICE_HOST = "21m00Tcm4TlvDq8ikWAM"   # Rachel  (host — stays on screen)
VOICE_REL  = "EXAVITQu4vr4xnSDxMaL"   # Bella   (relative — "mom")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.environ.get("DB_NAME", "postmeplex")


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
        timeout=30,
    )
    assert r.status_code == 200, f"founder login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, f"no access_token: {r.json()}"
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _create_char(headers, name, voice_id, your_name="Sam", **overrides):
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
    body.update(overrides)
    r = requests.post(f"{BASE_URL}/api/ai-characters", json=body, headers=headers, timeout=30)
    assert r.status_code == 200, f"create char {name} failed: {r.status_code} {r.text}"
    return r.json()


def _put_char(headers, char, voice_id, **overrides):
    body = {
        "name": char["name"],
        "username": char["username"],
        "avatar_url": char.get("avatar_url"),
        "persona": char.get("persona", "test persona"),
        "voice": voice_id,
        "your_name": "Sam",
        "nickname": "Sam",
        "relationship": "test",
        "age": char.get("age") or 30,
        "affection": char.get("affection", "warm"),
        "allow_calls": True,
        "allow_live": True,
        "relationships": char.get("relationships", []),
    }
    body.update(overrides)
    r = requests.put(
        f"{BASE_URL}/api/ai-characters/{char['id']}",
        json=body, headers=headers, timeout=30,
    )
    assert r.status_code == 200, f"PUT char {char['id']} failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def chars(founder_headers, mongo):
    """A = host "Hope-like" daughter;  B = relative "Juliette-like" mother."""
    host = _create_char(founder_headers, f"TEST_Hope_{uuid.uuid4().hex[:6]}", VOICE_HOST)
    rel  = _create_char(founder_headers, f"TEST_Juliette_{uuid.uuid4().hex[:6]}", VOICE_REL)

    _put_char(founder_headers, host, VOICE_HOST,
              relationships=[{"character_id": rel["id"], "relation": "mother"}])
    _put_char(founder_headers, rel, VOICE_REL,
              relationships=[{"character_id": host["id"], "relation": "daughter"}])

    yield host, rel

    # ---- teardown ----
    for c in (host, rel):
        try:
            requests.delete(
                f"{BASE_URL}/api/ai-characters/{c['id']}",
                headers=founder_headers, timeout=15,
            )
        except Exception:
            pass
    try:
        pair_key = "|".join(sorted([host["id"], rel["id"]]))
        mongo.ai_char_convos.delete_many({"pair_key": pair_key})
        mongo.ai_char_state.delete_many({"character_id": {"$in": [host["id"], rel["id"]]}})
        mongo.ai_char_messages.delete_many({"character_id": {"$in": [host["id"], rel["id"]]}})
    except Exception:
        pass


def _voice_turn(headers, char_id, text):
    return requests.post(
        f"{BASE_URL}/api/ai-characters/{char_id}/voice-turn",
        json={"text": text, "tz": "America/New_York"},
        headers=headers, timeout=120,
    )


# ============================================================
# 1) PASS THE PHONE — handoff contract (relative AVAILABLE)
# ============================================================
class TestPassThePhoneHandoff:
    def test_pass_the_phone_to_mom_returns_handoff(self, founder_headers, chars):
        host, rel = chars
        r = _voice_turn(founder_headers, host["id"], "pass the phone to your mom")
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()

        # Core handoff contract
        assert "handoff" in body, f"missing handoff: {body}"
        assert "segments" not in body, f"unexpected segments: {body}"
        h = body["handoff"]
        assert h.get("character_id") == rel["id"], h
        assert h.get("name") == rel["name"], h
        assert "avatar_url" in h, h

        # Hand-off line from host — reply must be present
        assert isinstance(body.get("reply"), str) and body["reply"].strip(), body
        # audio_url key must exist (value may be null if TTS unavailable)
        assert "audio_url" in body, body

        # Relative's greeting line — text non-empty, audio key present
        assert isinstance(h.get("greeting_text"), str) and h["greeting_text"].strip(), h
        assert "greeting_audio" in h, h


# ============================================================
# 2) SCHEDULE GATING — relative ASLEEP must NOT hand off
# ============================================================
class TestScheduleGatingAsleep:
    def test_asleep_relative_does_not_handoff(self, founder_headers, chars, mongo):
        host, rel = chars

        # Force relative to be asleep "right now" by widening sleep window to cover
        # all 24h in their state's timezone. _char_available calls _is_asleep on
        # the relative's local hour; sleep_start==sleep_end disables it, so use
        # (0, 23) which covers almost every hour of the day. We also directly
        # seed the relative's state tz so _local_now(rel.tz) is not None (gating
        # path requires tz in state).
        mongo.ai_char_state.update_one(
            {"character_id": rel["id"]},
            {"$set": {"character_id": rel["id"],
                      "admin_id": None,  # will be overwritten by server on next write
                      "tz": "UTC"}},
            upsert=True,
        )

        _put_char(founder_headers, rel, VOICE_REL,
                  sleep_start=0, sleep_end=23,
                  relationships=[{"character_id": host["id"], "relation": "daughter"}])

        # Make sure the relative-state row for THIS admin has a tz so _char_available
        # computes local_now. The voice-turn only sets tz on the HOST state, so set
        # the relative's state row explicitly for the super-admin whose login we hold.
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=founder_headers, timeout=15)
        assert me.status_code == 200, me.text
        admin_id = me.json()["id"]
        mongo.ai_char_state.update_one(
            {"character_id": rel["id"], "admin_id": admin_id},
            {"$set": {"character_id": rel["id"], "admin_id": admin_id, "tz": "UTC"}},
            upsert=True,
        )

        try:
            r = _voice_turn(founder_headers, host["id"], "pass the phone to your mom")
            assert r.status_code == 200, f"{r.status_code} {r.text}"
            body = r.json()
            # Core gating assertion
            assert "handoff" not in body, (
                f"handoff must be absent when relative is asleep: {body}"
            )
            assert "segments" not in body, body
            # Must still return a plain reply + audio_url
            assert isinstance(body.get("reply"), str) and body["reply"].strip(), body
            assert "audio_url" in body, body
        finally:
            # restore relative to normal (awake) so later tests pass-handoff
            _put_char(founder_headers, rel, VOICE_REL,
                      sleep_start=None, sleep_end=None,
                      relationships=[{"character_id": host["id"], "relation": "daughter"}])


# ============================================================
# 3) SWITCH-BACK phrasing is detected as pass-phone intent
# ============================================================
class TestSwitchBackPhrases:
    @pytest.mark.parametrize("phrase", [
        "put her back on",
        "pass me back to mom",
        "can i talk to mom",
        "put mom on",
    ])
    def test_switchback_phrases_produce_handoff(self, founder_headers, chars, phrase):
        host, rel = chars
        r = _voice_turn(founder_headers, host["id"], phrase)
        assert r.status_code == 200, f"{phrase!r} → {r.status_code} {r.text}"
        body = r.json()
        assert "handoff" in body, f"{phrase!r} missing handoff: {body}"
        assert body["handoff"].get("character_id") == rel["id"], body["handoff"]
        assert "segments" not in body, body


# ============================================================
# 4) REGRESSION — normal voice turn, no relative mention
# ============================================================
class TestNormalVoiceTurn:
    def test_no_handoff_no_segments(self, founder_headers, chars):
        host, _ = chars
        r = _voice_turn(founder_headers, host["id"], "how was your day?")
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "handoff" not in body, body
        assert "segments" not in body, body
        assert isinstance(body.get("reply"), str) and body["reply"].strip(), body
        assert "audio_url" in body, body


# ============================================================
# 5) REGRESSION — relay intent still returns 'segments'
# ============================================================
class TestRelayStillReturnsSegments:
    def test_ask_your_mom_returns_segments(self, founder_headers, chars):
        host, _ = chars
        r = _voice_turn(founder_headers, host["id"],
                        "can you ask your mom what is for dinner")
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert "segments" in body, f"relay must still produce segments: {body}"
        assert "handoff" not in body, body
        segs = body["segments"]
        assert isinstance(segs, list) and len(segs) >= 2, segs
        # at least one distant=True and one distant=False (overhear structure)
        d = [s.get("distant") for s in segs]
        assert any(d) and any(not x for x in d), segs
