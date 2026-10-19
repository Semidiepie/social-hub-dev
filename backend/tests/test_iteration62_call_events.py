"""
Iteration 62 — AI character call-event labels + voice-note caption removal.

Covers:
  * POST /api/ai-characters/{id}/call-event {event:'start'} → 200 returns a
    message with role=='system' and text=='📞 Call started'.
  * POST {event:'end', duration:192} → text=='📞 Call ended · 3m 12s'.
  * POST {event:'end', duration:45}  → '📞 Call ended · 45s'.
  * Each creates a message retrievable via GET /thread (role=='system') in
    chronological order alongside user/ai messages.
  * The 'end' event sets ai_char_state.last_call_ended_at.
  * REGRESSION: with a system call-event message present, a normal text send
    still triggers an ai-role reply (the _tline helper renders system rows as
    [..] without crashing the transcript). Also /voice-turn still returns a
    structured {reply, audio_url} response.

Only the TEST_-prefixed character created by this file is mutated. It (and its
ai_char_messages / ai_char_state) is cleaned up on teardown. The user's real
characters are not touched.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://social-hub-dev-4.preview.emergentagent.com",
).rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"

VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel — public ElevenLabs premade

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
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def founder_id(founder_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=founder_headers, timeout=20)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def character(founder_headers, mongo):
    body = {
        "name": f"TEST_Caller_{uuid.uuid4().hex[:6]}",
        "username": f"test_{uuid.uuid4().hex[:8]}",
        "persona": "Friendly test character used only by automated call-event tests.",
        "voice": VOICE_ID,
        "your_name": "Sam",
        "nickname": "Sam",
        "relationship": "test",
        "age": 30,
        "affection": "warm",
        "allow_calls": True,
        "allow_live": True,
        "relationships": [],
    }
    r = requests.post(
        f"{BASE_URL}/api/ai-characters",
        json=body, headers=founder_headers, timeout=30,
    )
    assert r.status_code == 200, f"create char failed: {r.status_code} {r.text}"
    c = r.json()
    yield c

    # ---- teardown ----
    try:
        requests.delete(
            f"{BASE_URL}/api/ai-characters/{c['id']}",
            headers=founder_headers, timeout=15,
        )
    except Exception:
        pass
    try:
        mongo.ai_char_messages.delete_many({"character_id": c["id"]})
        mongo.ai_char_state.delete_many({"character_id": c["id"]})
    except Exception:
        pass


# ---------- helpers ----------

def _thread(headers, char_id):
    r = requests.get(
        f"{BASE_URL}/api/ai-characters/{char_id}/thread",
        headers=headers, timeout=20,
    )
    assert r.status_code == 200, f"thread fetch failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("messages", [])


def _call_event(headers, char_id, event, duration=0):
    return requests.post(
        f"{BASE_URL}/api/ai-characters/{char_id}/call-event",
        json={"event": event, "duration": duration},
        headers=headers, timeout=20,
    )


# ============================================================
# CALL-EVENT labels
# ============================================================
class TestCallEventLabels:
    def test_call_started_message(self, founder_headers, character):
        r = _call_event(founder_headers, character["id"], "start")
        assert r.status_code == 200, f"start failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["role"] == "system"
        assert data["text"] == "📞 Call started"
        assert "id" in data and "created_at" in data

    def test_call_ended_with_minutes_and_seconds(self, founder_headers, character):
        r = _call_event(founder_headers, character["id"], "end", duration=192)
        assert r.status_code == 200, f"end(192) failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["role"] == "system"
        # 192s -> 3m 12s
        assert data["text"] == "📞 Call ended · 3m 12s", data["text"]

    def test_call_ended_seconds_only(self, founder_headers, character):
        r = _call_event(founder_headers, character["id"], "end", duration=45)
        assert r.status_code == 200, f"end(45) failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["role"] == "system"
        assert data["text"] == "📞 Call ended · 45s", data["text"]

    def test_thread_contains_system_messages_chronologically(
        self, founder_headers, character
    ):
        msgs = _thread(founder_headers, character["id"])
        sys_msgs = [m for m in msgs if m.get("role") == "system"]
        # at least the 3 we posted above
        assert len(sys_msgs) >= 3, f"expected ≥3 system msgs, got {len(sys_msgs)}"
        texts = [m["text"] for m in sys_msgs]
        assert "📞 Call started" in texts
        assert "📞 Call ended · 3m 12s" in texts
        assert "📞 Call ended · 45s" in texts
        # chronological order (created_at ascending)
        timestamps = [m["created_at"] for m in msgs]
        assert timestamps == sorted(timestamps), "thread not in chronological order"

    def test_end_sets_last_call_ended_at(
        self, founder_headers, founder_id, character, mongo
    ):
        # fire one more 'end' event and verify state is updated
        r = _call_event(founder_headers, character["id"], "end", duration=10)
        assert r.status_code == 200
        st = mongo.ai_char_state.find_one(
            {"character_id": character["id"], "admin_id": founder_id}
        )
        assert st is not None, "ai_char_state row missing after end-event"
        assert st.get("last_call_ended_at") is not None, \
            "last_call_ended_at not set after end event"


# ============================================================
# Regression: a normal text reply still works after system events
# ============================================================
class TestRegressionAfterCallEvent:
    def test_text_send_still_produces_ai_reply(self, founder_headers, character):
        # Fire a few system events first (iteration under test) — already fired
        # by TestCallEventLabels, but ensure one exists for isolation if class
        # ordering ever changes.
        _call_event(founder_headers, character["id"], "start")

        # Send a normal text; backend queues a pending reply (reply_at in future).
        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{character['id']}/send",
            json={"text": "hey", "local_time": "2026-06-01 12:00", "tz": "UTC"},
            headers=founder_headers, timeout=30,
        )
        assert r.status_code == 200, f"send failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("pending") is True
        assert "reply_at" in d

        # Poll the thread for up to ~45s for an ai-role reply (the reply loop
        # ticks every ~5-10s depending on scheduler). The _tline helper must
        # successfully render the earlier role=='system' messages as [..]
        # without raising — if it crashed, no ai reply would ever appear.
        ai_reply = None
        deadline = time.time() + 60
        while time.time() < deadline:
            msgs = _thread(founder_headers, character["id"])
            for m in msgs:
                if m.get("role") == "ai" and m.get("text"):
                    ai_reply = m
                    break
            if ai_reply:
                break
            time.sleep(5)

        assert ai_reply is not None, (
            "no ai reply produced after text send (reply loop may have "
            "crashed on system-role transcript rows)"
        )

    def test_voice_turn_still_works(self, founder_headers, character):
        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{character['id']}/voice-turn",
            json={"text": "how are you", "local_time": "2026-06-01 12:05", "tz": "UTC"},
            headers=founder_headers, timeout=60,
        )
        assert r.status_code == 200, f"voice-turn failed: {r.status_code} {r.text}"
        d = r.json()
        assert "reply" in d, f"missing reply key: {d}"
        assert isinstance(d["reply"], str) and d["reply"].strip()
        # audio_url may be None if ElevenLabs is unavailable; just check present
        assert "audio_url" in d
