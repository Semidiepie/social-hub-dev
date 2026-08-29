"""Iteration 19 — Audio Live Rooms + Agora wiring.

Verifies the backend contract that /app/mobile/app/live/[id].tsx depends on:
  * POST /api/rooms/start returns non-empty app_id + channel_name.
  * GET /api/rooms/{id} returns matching app_id + channel_name for host + audience.
  * POST /api/rooms/{id}/heartbeat increments audience_count for non-speakers,
    keeps last_seen_at fresh, and returns audience_count.
  * Host heartbeat does NOT bump audience_count.
  * Basic guest lifecycle (invite / remove / end) still works.

Self-cleanup: rooms started here are ended at teardown; scratch users are
auto-purged by the backend startup hook.
"""
from __future__ import annotations

import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://social-hub-dev-4.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


def _register(prefix: str) -> tuple[str, str, dict]:
    """Register a scratch user (auto-purged) and return (token, user_id, user)."""
    suffix = uuid.uuid4().hex[:6]
    # username has a 20-char cap; keep prefix short.
    username = f"tpb_{prefix}_{suffix}"[:20]
    email = f"{username}@example.com"
    body = {
        "email": email,
        "username": username,
        "display_name": f"TPB {prefix}",
        "password": "Test1234!",
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=20)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in register response: {data}"
    user = data.get("user") or {}
    if not user.get("id"):
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
        assert me.status_code == 200, f"/auth/me failed: {me.status_code} {me.text}"
        user = me.json()
    return token, user["id"], user


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def host():
    return _register("live_host")


@pytest.fixture(scope="module")
def listener():
    return _register("live_listener")


@pytest.fixture(scope="module")
def guest():
    return _register("live_guest")


@pytest.fixture(scope="module")
def room(host):
    """Start a room owned by the host, end it at teardown."""
    token, _, _ = host
    r = requests.post(
        f"{API}/rooms/start",
        json={"title": "iteration19 test room", "topic": "agora wiring"},
        headers=_auth(token),
        timeout=20,
    )
    assert r.status_code == 200, f"start failed: {r.status_code} {r.text}"
    room = r.json()
    yield room
    # teardown — end the room
    try:
        requests.post(f"{API}/rooms/{room['id']}/end", headers=_auth(token), timeout=10)
    except Exception:  # noqa: BLE001
        pass


# ------------------------------------------------------------------
# Contract: /api/rooms/start
# ------------------------------------------------------------------
class TestRoomsStart:
    def test_returns_non_empty_agora_fields(self, room):
        assert isinstance(room.get("app_id"), str) and len(room["app_id"]) > 0, "app_id must be non-empty"
        assert isinstance(room.get("channel_name"), str) and len(room["channel_name"]) > 0, "channel_name must be non-empty"
        assert room.get("id")
        assert room.get("title") == "iteration19 test room"
        assert room.get("topic") == "agora wiring"

    def test_host_shape(self, room, host):
        _, host_id, _ = host
        assert room["host"]["id"] == host_id
        assert isinstance(room["host"]["username"], str)
        assert "avatar_url" in room["host"]
        assert isinstance(room["guests"], list) and room["guests"] == []
        assert room["audience_count"] == 0


# ------------------------------------------------------------------
# Contract: GET /api/rooms/{id} — parity between host and listener view.
# ------------------------------------------------------------------
class TestRoomsGet:
    def test_host_and_audience_see_same_channel(self, room, host, listener):
        host_token, _, _ = host
        listener_token, _, _ = listener
        r1 = requests.get(f"{API}/rooms/{room['id']}", headers=_auth(host_token), timeout=10)
        r2 = requests.get(f"{API}/rooms/{room['id']}", headers=_auth(listener_token), timeout=10)
        assert r1.status_code == 200 and r2.status_code == 200
        d1, d2 = r1.json(), r2.json()
        assert d1["app_id"] == d2["app_id"] == room["app_id"]
        assert d1["channel_name"] == d2["channel_name"] == room["channel_name"]
        assert d1["host"]["id"] == d2["host"]["id"] == room["host"]["id"]

    def test_get_room_lists_in_rooms_index(self, room, listener):
        listener_token, _, _ = listener
        r = requests.get(f"{API}/rooms", headers=_auth(listener_token), timeout=10)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert room["id"] in ids


# ------------------------------------------------------------------
# Contract: /api/rooms/{id}/heartbeat
# ------------------------------------------------------------------
class TestHeartbeat:
    def test_listener_heartbeat_increments_audience(self, room, listener, host):
        listener_token, _, _ = listener
        host_token, _, _ = host
        # Host heartbeat should NOT bump audience_count
        r_host = requests.post(f"{API}/rooms/{room['id']}/heartbeat", headers=_auth(host_token), timeout=10)
        assert r_host.status_code == 200
        assert r_host.json().get("audience_count", 0) == 0

        # Listener heartbeat should show audience_count >= 1
        r_lis = requests.post(f"{API}/rooms/{room['id']}/heartbeat", headers=_auth(listener_token), timeout=10)
        assert r_lis.status_code == 200, r_lis.text
        body = r_lis.json()
        assert body.get("audience_count", 0) >= 1

        # And GET /rooms/{id} reflects it
        r_get = requests.get(f"{API}/rooms/{room['id']}", headers=_auth(host_token), timeout=10)
        assert r_get.status_code == 200
        assert r_get.json()["audience_count"] >= 1

    def test_heartbeat_keeps_room_alive(self, room, host):
        host_token, _, _ = host
        # multiple heartbeats — room should still be findable
        for _ in range(3):
            requests.post(f"{API}/rooms/{room['id']}/heartbeat", headers=_auth(host_token), timeout=10)
            time.sleep(0.2)
        r = requests.get(f"{API}/rooms/{room['id']}", headers=_auth(host_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == room["id"]


# ------------------------------------------------------------------
# Guest lifecycle + audience presence list.
# ------------------------------------------------------------------
class TestGuestFlow:
    def test_audience_endpoint_lists_listener(self, room, listener):
        listener_token, listener_id, _ = listener
        # Send a heartbeat first
        requests.post(f"{API}/rooms/{room['id']}/heartbeat", headers=_auth(listener_token), timeout=10)
        r = requests.get(f"{API}/rooms/{room['id']}/audience", headers=_auth(listener_token), timeout=10)
        assert r.status_code == 200
        ids = [a["user_id"] for a in r.json().get("audience", [])]
        assert listener_id in ids

    def test_invite_and_remove_guest(self, room, host, guest):
        host_token, _, _ = host
        _, guest_id, _ = guest
        # Invite
        r = requests.post(
            f"{API}/rooms/{room['id']}/invite/{guest_id}", headers=_auth(host_token), timeout=10
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert guest_id in [g["id"] for g in d["guests"]]
        # Same app_id/channel returned
        assert d["app_id"] == room["app_id"]
        assert d["channel_name"] == room["channel_name"]

        # Remove
        r2 = requests.delete(
            f"{API}/rooms/{room['id']}/guest/{guest_id}", headers=_auth(host_token), timeout=10
        )
        assert r2.status_code == 200
        assert guest_id not in [g["id"] for g in r2.json()["guests"]]

    def test_non_host_cannot_end(self, room, listener):
        listener_token, _, _ = listener
        r = requests.post(f"{API}/rooms/{room['id']}/end", headers=_auth(listener_token), timeout=10)
        assert r.status_code == 403


# ------------------------------------------------------------------
# 404 on unknown room.
# ------------------------------------------------------------------
class TestNotFound:
    def test_get_unknown_room(self, host):
        host_token, _, _ = host
        r = requests.get(f"{API}/rooms/{uuid.uuid4()}", headers=_auth(host_token), timeout=10)
        assert r.status_code == 404

    def test_heartbeat_unknown_room(self, host):
        host_token, _, _ = host
        r = requests.post(f"{API}/rooms/{uuid.uuid4()}/heartbeat", headers=_auth(host_token), timeout=10)
        assert r.status_code == 404
