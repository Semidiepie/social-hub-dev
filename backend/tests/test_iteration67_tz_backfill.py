"""
Iteration 67 — regression test for the "AI characters don't know real time" bug.

The fix: a per-user `ai_tz` is persisted globally on the admin user doc AND
backfilled onto EVERY one of their characters' `ai_char_state` whenever /send
or /voice-turn receives a `tz`. The `_now_context` fallback also uses the
admin's saved `ai_tz` when a character's own `state.tz` is empty.

Credit-safety:
- We only hit POST /send (which schedules a reply but does NOT itself call LLM).
- We immediately unset `pending_reply_at` + delete the user message in Mongo to
  prevent the background reply loop from spending Emergent LLM credits.
- We do NOT exercise /voice-turn here (its tz branch is after a 400 guard that
  would require sending `text`, which triggers LLM + ElevenLabs TTS). The
  voice-turn wiring is covered by a code-inspection assertion against the
  source file.
"""
import os
import re
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "postmeplex")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PIN = "7455"

CHAR_1 = "ab80854a-3e21-424e-ba75-4f208bc3a5a1"
CHAR_2 = "3d0e38a1-3acc-47b6-ab27-7f577c38f26e"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login-pin",
        json={"identifier": FOUNDER_EMAIL, "pin": FOUNDER_PIN},
        timeout=30,
    )
    assert r.status_code == 200, f"login-pin failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_user(admin_token):
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(event_loop):
    client = AsyncIOMotorClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


async def _run(coro):
    return await coro


# ---------- helpers ----------
def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


async def _reset_tz(db, admin_id):
    """Clear tz on user + both characters so each test starts clean."""
    await db.users.update_one({"id": admin_id}, {"$unset": {"ai_tz": ""}})
    await db.ai_char_state.update_many(
        {"admin_id": admin_id, "character_id": {"$in": [CHAR_1, CHAR_2]}},
        {"$unset": {"tz": ""}},
    )


async def _cleanup_pending_and_msg(db, admin_id, char_id, text_marker):
    """Prevent the reply loop from firing an LLM call for our test message."""
    await db.ai_char_state.update_one(
        {"admin_id": admin_id, "character_id": char_id},
        {"$unset": {"pending_reply_at": "", "pending_from": ""}},
    )
    # delete our test user message so it doesn't pollute the chat
    await db.ai_char_messages.delete_many(
        {"admin_id": admin_id, "character_id": char_id, "role": "user", "text": text_marker}
    )


# ---------- tests ----------
class TestTzBackfill:
    """POST /send with tz backfills onto user.ai_tz + ALL character states."""

    def test_characters_exist(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/ai-characters",
            headers=_auth(admin_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        ids = {c["id"] for c in r.json()}
        assert CHAR_1 in ids, f"CHAR_1 missing from character list: {ids}"
        assert CHAR_2 in ids, f"CHAR_2 missing from character list: {ids}"

    def test_send_with_tz_backfills_user_and_all_characters(self, event_loop, db, admin_token, admin_user):
        admin_id = admin_user["id"]
        tz = "America/New_York"
        marker = "TEST_TZ_BACKFILL_PING_1"

        event_loop.run_until_complete(_reset_tz(db, admin_id))

        # verify preconditions: tz is cleared
        user_before = event_loop.run_until_complete(db.users.find_one({"id": admin_id}, {"_id": 0, "ai_tz": 1})) or {}
        assert not user_before.get("ai_tz"), f"precondition: ai_tz should be unset, got {user_before.get('ai_tz')!r}"

        # fire /send with tz on character #1 only
        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{CHAR_1}/send",
            headers=_auth(admin_token),
            json={"text": marker, "tz": tz},
            timeout=30,
        )
        assert r.status_code == 200, f"/send failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("pending") is True
        assert "reply_at" in body

        # cleanup BEFORE the reply loop fires (keep LLM usage at zero)
        event_loop.run_until_complete(_cleanup_pending_and_msg(db, admin_id, CHAR_1, marker))

        # user.ai_tz is set
        user_after = event_loop.run_until_complete(db.users.find_one({"id": admin_id}, {"_id": 0, "ai_tz": 1})) or {}
        assert user_after.get("ai_tz") == tz, f"user.ai_tz expected {tz!r}, got {user_after.get('ai_tz')!r}"

        # BOTH characters' states carry the tz, not just CHAR_1
        st1 = event_loop.run_until_complete(
            db.ai_char_state.find_one(
                {"admin_id": admin_id, "character_id": CHAR_1}, {"_id": 0, "tz": 1}
            )
        ) or {}
        st2 = event_loop.run_until_complete(
            db.ai_char_state.find_one(
                {"admin_id": admin_id, "character_id": CHAR_2}, {"_id": 0, "tz": 1}
            )
        ) or {}
        assert st1.get("tz") == tz, f"CHAR_1 state.tz expected {tz!r}, got {st1.get('tz')!r}"
        assert st2.get("tz") == tz, (
            f"CHAR_2 state.tz expected {tz!r} (backfill failed), got {st2.get('tz')!r}"
        )

    def test_send_overwrites_tz_everywhere(self, event_loop, db, admin_token, admin_user):
        """A second /send with a DIFFERENT tz must overwrite on both characters + user."""
        admin_id = admin_user["id"]
        new_tz = "Europe/London"
        marker = "TEST_TZ_BACKFILL_PING_2"

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{CHAR_1}/send",
            headers=_auth(admin_token),
            json={"text": marker, "tz": new_tz},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        event_loop.run_until_complete(_cleanup_pending_and_msg(db, admin_id, CHAR_1, marker))

        user_after = event_loop.run_until_complete(db.users.find_one({"id": admin_id}, {"_id": 0, "ai_tz": 1})) or {}
        assert user_after.get("ai_tz") == new_tz

        for cid in (CHAR_1, CHAR_2):
            st = event_loop.run_until_complete(
                db.ai_char_state.find_one(
                    {"admin_id": admin_id, "character_id": cid}, {"_id": 0, "tz": 1}
                )
            ) or {}
            assert st.get("tz") == new_tz, f"{cid} state.tz expected {new_tz!r}, got {st.get('tz')!r}"

    def test_send_without_tz_does_not_wipe_existing_tz(self, event_loop, db, admin_token, admin_user):
        """Regression: a /send that omits tz must NOT clear previously saved tz."""
        admin_id = admin_user["id"]
        marker = "TEST_TZ_BACKFILL_PING_3"

        pre = event_loop.run_until_complete(db.users.find_one({"id": admin_id}, {"_id": 0, "ai_tz": 1})) or {}
        pre_tz = pre.get("ai_tz")
        assert pre_tz, "expected prior tests to have populated user.ai_tz"

        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{CHAR_2}/send",
            headers=_auth(admin_token),
            json={"text": marker},  # no tz
            timeout=30,
        )
        assert r.status_code == 200, r.text
        event_loop.run_until_complete(_cleanup_pending_and_msg(db, admin_id, CHAR_2, marker))

        post = event_loop.run_until_complete(db.users.find_one({"id": admin_id}, {"_id": 0, "ai_tz": 1})) or {}
        assert post.get("ai_tz") == pre_tz, f"ai_tz got wiped by tz-less /send: {pre_tz!r} -> {post.get('ai_tz')!r}"


class TestCodeWiring:
    """Static source checks — no LLM/TTS cost — confirming the fix shape."""

    SRC = "/app/backend/routes/ai_characters.py"

    def _read(self):
        with open(self.SRC) as f:
            return f.read()

    def test_remember_tz_backfills_both_user_and_all_states(self):
        src = self._read()
        # The helper must set users.ai_tz AND update_many onto ai_char_state
        assert re.search(
            r"async def _remember_tz\(.*?update_one\(\{\"id\": admin_id\}, \{\"\$set\": \{\"ai_tz\": tz\}\}\).*?update_many\(\{\"admin_id\": admin_id\}, \{\"\$set\": \{\"tz\": tz\}\}\)",
            src,
            re.S,
        ), "_remember_tz must set users.ai_tz AND update_many on ai_char_state"

    def test_send_endpoint_calls_remember_tz(self):
        src = self._read()
        # Find /send handler and ensure it calls _remember_tz when body.tz is present
        send_block = re.search(r"@router\.post\(\"/api/ai-characters/\{char_id\}/send\"\)(.*?)@router\.post", src, re.S)
        assert send_block, "could not locate /send handler"
        body = send_block.group(1)
        assert "_remember_tz(current[\"id\"], body.tz)" in body, "/send must call _remember_tz with body.tz"

    def test_voice_turn_endpoint_calls_remember_tz(self):
        src = self._read()
        vt_block = re.search(r"@router\.post\(\"/api/ai-characters/\{char_id\}/voice-turn\"\)(.*?)@router\.post", src, re.S)
        assert vt_block, "could not locate /voice-turn handler"
        body = vt_block.group(1)
        assert "_remember_tz(current[\"id\"], body.tz)" in body, "/voice-turn must call _remember_tz with body.tz"

    def test_now_context_falls_back_to_admin_tz(self):
        """Every _now_context call site must use `state.tz or _admin_tz(admin_id)`
        (or a `tzv` local that was itself computed with that fallback)."""
        src = self._read()
        lines = src.splitlines()
        bad = []
        for i, line in enumerate(lines, start=1):
            if "_now_context(" not in line:
                continue
            if "def _now_context" in line:
                continue
            # inspect this line + next line so multi-line calls are covered
            window = line + " " + (lines[i] if i < len(lines) else "")
            if "_admin_tz" not in window and "tzv" not in window:
                bad.append(f"L{i}: {line.strip()}")
        assert bad == [], f"_now_context call sites missing _admin_tz fallback: {bad}"
        # And confirm there IS at least one properly-wired call site
        assert "_admin_tz(admin_id)" in src, "_admin_tz(admin_id) fallback not wired anywhere"


class TestCleanup:
    """Final cleanup — leave the DB tidy and don't let the reply loop spend credits."""

    def test_final_cleanup(self, event_loop, db, admin_user):
        admin_id = admin_user["id"]
        # strip ALL pending reply timers created by this test module
        event_loop.run_until_complete(db.ai_char_state.update_many(
            {"admin_id": admin_id, "character_id": {"$in": [CHAR_1, CHAR_2]}},
            {"$unset": {"pending_reply_at": "", "pending_from": ""}},
        ))
        # purge any lingering TEST_ messages
        event_loop.run_until_complete(db.ai_char_messages.delete_many(
            {"admin_id": admin_id, "text": {"$regex": "^TEST_TZ_BACKFILL_PING_"}}
        ))
