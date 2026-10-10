"""Iteration 51 — Presence (active friends) + reciprocal appear_offline + Sage AI text (no voice).

Covers:
- POST /api/presence/ping heartbeat updates last_active_at
- GET /api/presence/active returns mutual-follow friends active within 15min with online flag
- GET/PUT /api/users/me/privacy exposes appear_offline (reciprocal visibility)
- POST /api/sage/send returns TEXT ONLY — no audio_url field, no voice artefacts
- GET /api/sage/thread returns persisted messages
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _register(suffix: str):
    """Register a fresh test_* user. These are auto-purged on backend restart."""
    uid = uuid.uuid4().hex[:8]
    username = f"test_pres_{suffix}_{uid}"
    email = f"test_pres_{suffix}_{uid}@example.com"
    body = {
        "username": username,
        "email": email,
        "password": "Test123!",
        "display_name": f"Pres {suffix} {uid}",
        "pin": "1234",
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=30)
    assert r.status_code in (200, 201), f"register failed {r.status_code}: {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no access_token in register response: {data}"
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15).json()
    return {"token": token, "id": me["id"], "username": me["username"], "email": email}


@pytest.fixture(scope="module")
def userA():
    return _register("a")


@pytest.fixture(scope="module")
def userB():
    return _register("b")


def _h(u):
    return {"Authorization": f"Bearer {u['token']}"}


class TestPresenceCore:
    """Presence ping + active list for mutual-follow friends."""

    def test_01_mutual_follow_setup(self, userA, userB):
        # A follows B
        r = requests.post(f"{API}/users/{userB['id']}/follow", headers=_h(userA), timeout=15)
        assert r.status_code in (200, 201), r.text
        # B follows A
        r = requests.post(f"{API}/users/{userA['id']}/follow", headers=_h(userB), timeout=15)
        assert r.status_code in (200, 201), r.text

    def test_02_ping_ok(self, userA, userB):
        for u in (userA, userB):
            r = requests.post(f"{API}/presence/ping", headers=_h(u), timeout=15)
            assert r.status_code == 200
            assert r.json().get("status") == "ok"

    def test_03_active_sees_mutual_friend_online(self, userA, userB):
        # Both just pinged — A should see B as online
        r = requests.get(f"{API}/presence/active", headers=_h(userA), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["appear_offline"] is False
        ids = [f["id"] for f in data["friends"]]
        assert userB["id"] in ids, f"userB not in active list: {data}"
        b = next(f for f in data["friends"] if f["id"] == userB["id"])
        assert b["online"] is True
        assert "last_active_at" in b
        assert b.get("avatar_url"), "avatar_url should fallback to default"
        # No _id leakage
        assert "_id" not in b

    def test_04_active_reverse(self, userA, userB):
        r = requests.get(f"{API}/presence/active", headers=_h(userB), timeout=15)
        assert r.status_code == 200
        ids = [f["id"] for f in r.json()["friends"]]
        assert userA["id"] in ids


class TestAppearOfflineReciprocal:
    """appear_offline toggle on PUT /users/me/privacy and reciprocal hide."""

    def test_01_privacy_get_includes_appear_offline(self, userA):
        r = requests.get(f"{API}/users/me/privacy", headers=_h(userA), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "appear_offline" in data
        assert data["appear_offline"] is False

    def test_02_turn_on_appear_offline_a(self, userA):
        r = requests.put(f"{API}/users/me/privacy", json={"appear_offline": True}, headers=_h(userA), timeout=15)
        assert r.status_code == 200
        assert r.json()["appear_offline"] is True

    def test_03_a_sees_empty_list_when_invisible(self, userA):
        # Reciprocal — A can't see others either
        r = requests.get(f"{API}/presence/active", headers=_h(userA), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["appear_offline"] is True
        assert data["friends"] == []

    def test_04_b_cannot_see_a_anymore(self, userA, userB):
        # B needs to ping to be active themselves; A is invisible from B's list
        requests.post(f"{API}/presence/ping", headers=_h(userB), timeout=15)
        r = requests.get(f"{API}/presence/active", headers=_h(userB), timeout=15)
        assert r.status_code == 200
        ids = [f["id"] for f in r.json()["friends"]]
        assert userA["id"] not in ids, f"invisible A still visible to B: {r.json()}"

    def test_05_turn_off_restores_visibility(self, userA, userB):
        requests.put(f"{API}/users/me/privacy", json={"appear_offline": False}, headers=_h(userA), timeout=15)
        requests.post(f"{API}/presence/ping", headers=_h(userA), timeout=15)
        requests.post(f"{API}/presence/ping", headers=_h(userB), timeout=15)
        r = requests.get(f"{API}/presence/active", headers=_h(userB), timeout=15)
        assert r.status_code == 200
        ids = [f["id"] for f in r.json()["friends"]]
        assert userA["id"] in ids


class TestSageTextNoVoice:
    """Sage AI text chat must return TEXT ONLY — no audio playback."""

    def test_01_sage_profile(self, userA):
        r = requests.get(f"{API}/sage/profile", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "sage-ai"
        assert "voice_enabled" in data

    def test_02_sage_send_text_only(self, userA):
        r = requests.post(
            f"{API}/sage/send",
            json={"text": "Hi Sage, just saying hello."},
            headers=_h(userA),
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "message" in data
        msg = data["message"]
        assert msg["role"] == "sage"
        assert isinstance(msg["text"], str) and len(msg["text"]) > 0
        # CRITICAL: no audio in text send path
        assert "audio_url" not in data, f"Sage text /send leaked audio_url! {list(data.keys())}"
        assert "audio_url" not in msg
        assert "offer_call" in data
        assert "crisis" in data

    def test_03_sage_thread_persists(self, userA):
        r = requests.get(f"{API}/sage/thread", headers=_h(userA), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "messages" in data
        assert len(data["messages"]) >= 2  # user + sage
        roles = [m["role"] for m in data["messages"]]
        assert "user" in roles and "sage" in roles
        # No audio artefacts stored in thread
        for m in data["messages"]:
            assert "audio_url" not in m


class TestTypingIndicator:
    """DM typing heartbeat → peer sees typing within 5s window."""

    def test_01_create_dm_and_typing(self, userA, userB):
        # Create 1:1 (mutual follow already in place)
        r = requests.post(
            f"{API}/conversations",
            json={"member_ids": [userB["id"]]},
            headers=_h(userA),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        conv_id = r.json()["id"]
        # A starts typing
        r = requests.post(f"{API}/conversations/{conv_id}/typing", headers=_h(userA), timeout=15)
        assert r.status_code == 200
        # B asks who's typing
        r = requests.get(f"{API}/conversations/{conv_id}/typing", headers=_h(userB), timeout=15)
        assert r.status_code == 200
        users = r.json()["users"]
        ids = [u["id"] for u in users]
        assert userA["id"] in ids, f"typing not reflected: {users}"

    def test_02_typing_expires(self, userA, userB):
        # Create or reuse conv
        r = requests.post(f"{API}/conversations", json={"member_ids": [userB["id"]]}, headers=_h(userA), timeout=15)
        conv_id = r.json()["id"]
        requests.post(f"{API}/conversations/{conv_id}/typing", headers=_h(userA), timeout=15)
        time.sleep(6)  # typing window is 5s
        r = requests.get(f"{API}/conversations/{conv_id}/typing", headers=_h(userB), timeout=15)
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()["users"]]
        assert userA["id"] not in ids, f"typing should have expired: {r.json()}"
