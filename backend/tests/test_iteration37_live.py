"""Tests for TikTok-style Live feature (iteration 37).

Covers:
- REST: gifts catalog, create/list/get/stop stream
- Public payload does NOT leak input_id or whip_url
- Ownership enforcement on /stop (403 for non-owner)
- WebSocket: auth guard, init backlog, chat/heart/gift broadcast,
  viewer count increments and decrements across two clients.
"""
import asyncio
import json
import os
import time
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


# ---------- helpers ----------

def _register(prefix: str):
    short = f"{prefix[:6]}{uuid.uuid4().hex[:8]}"  # <= 20 chars, starts with tec_
    body = {
        "email": f"{short}@postmeplex.com",
        "username": short,
        "password": "Test123!",
        "display_name": short,
        "pin": "1234",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body, timeout=20)
    assert r.status_code in (200, 201), f"register failed {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data.get("user") or data.get("user_data") or {}


@pytest.fixture(scope="module")
def owner():
    tok, user = _register("tec_live_owner")
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def viewer():
    tok, user = _register("tec_live_view")
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def viewer2():
    tok, user = _register("tec_live_view2")
    return {"token": tok, "user": user}


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- REST tests ----------

def test_gifts_catalog(owner):
    r = requests.get(f"{BASE_URL}/api/live/gifts", headers=_headers(owner["token"]), timeout=10)
    assert r.status_code == 200
    gifts = r.json()
    assert isinstance(gifts, list) and len(gifts) == 7
    ids = {g["id"] for g in gifts}
    assert ids == {"rose", "heart", "star", "fire", "rocket", "crown", "diamond"}
    for g in gifts:
        for k in ("id", "name", "glyph", "coins", "color"):
            assert k in g


def test_create_list_get_stop_lifecycle(owner, viewer):
    # create
    r = requests.post(f"{BASE_URL}/api/live", headers=_headers(owner["token"]),
                      json={"title": "TEC live test", "mode": "webrtc"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created["is_owner"] is True
    assert "provider_configured" in created
    # demo mode expected
    assert created["provider_configured"] is False
    assert created.get("whip_url") is None
    assert created["mode"] == "webrtc"
    assert created["status"] == "live"
    sid = created["id"]

    # list contains this stream
    lst = requests.get(f"{BASE_URL}/api/live", headers=_headers(owner["token"]), timeout=10)
    assert lst.status_code == 200
    ids = [s["id"] for s in lst.json()]
    assert sid in ids
    got = next(s for s in lst.json() if s["id"] == sid)
    # public listing must not leak internal fields
    assert "input_id" not in got
    assert "whip_url" not in got
    assert "viewer_count" in got and "hearts" in got

    # get by id (viewer, non-owner)
    g = requests.get(f"{BASE_URL}/api/live/{sid}", headers=_headers(viewer["token"]), timeout=10)
    assert g.status_code == 200
    pub = g.json()
    assert pub["is_owner"] is False
    assert "input_id" not in pub
    assert "whip_url" not in pub

    # non-owner cannot stop
    bad = requests.post(f"{BASE_URL}/api/live/{sid}/stop", headers=_headers(viewer["token"]), timeout=10)
    assert bad.status_code == 403

    # owner stops
    ok = requests.post(f"{BASE_URL}/api/live/{sid}/stop", headers=_headers(owner["token"]), timeout=10)
    assert ok.status_code == 200
    assert ok.json().get("status") == "ended"

    # after stop, listing no longer includes it
    lst2 = requests.get(f"{BASE_URL}/api/live", headers=_headers(owner["token"]), timeout=10)
    assert sid not in [s["id"] for s in lst2.json()]

    # 404 for unknown stream
    nf = requests.post(f"{BASE_URL}/api/live/does-not-exist/stop", headers=_headers(owner["token"]), timeout=10)
    assert nf.status_code == 404


def test_chat_history_empty_returns_list(owner):
    # create a fresh stream
    r = requests.post(f"{BASE_URL}/api/live", headers=_headers(owner["token"]),
                      json={"title": "TEC chat history"}, timeout=15)
    sid = r.json()["id"]
    try:
        h = requests.get(f"{BASE_URL}/api/live/{sid}/chat", headers=_headers(owner["token"]), timeout=10)
        assert h.status_code == 200
        assert isinstance(h.json(), list)
    finally:
        requests.post(f"{BASE_URL}/api/live/{sid}/stop", headers=_headers(owner["token"]), timeout=10)


# ---------- WebSocket tests ----------

@pytest.mark.asyncio
async def test_ws_auth_required(owner):
    r = requests.post(f"{BASE_URL}/api/live", headers=_headers(owner["token"]),
                      json={"title": "TEC ws auth"}, timeout=15)
    sid = r.json()["id"]
    try:
        url = f"{WS_BASE}/api/live/{sid}/ws?token=bogus"
        # Server accepts then sends error and closes.
        async with websockets.connect(url, open_timeout=10) as ws:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            assert msg.get("type") == "error"
            assert msg.get("detail") == "auth_required"
    finally:
        requests.post(f"{BASE_URL}/api/live/{sid}/stop", headers=_headers(owner["token"]), timeout=10)


async def _recv_until(ws, want_types, timeout=6):
    """Collect messages until every type in want_types has been seen at least once."""
    seen = {}
    deadline = time.time() + timeout
    while time.time() < deadline and not all(t in seen for t in want_types):
        remaining = max(0.1, deadline - time.time())
        raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        m = json.loads(raw)
        seen.setdefault(m["type"], []).append(m)
    return seen


@pytest.mark.asyncio
async def test_ws_realtime_layer(owner, viewer, viewer2):
    # Owner creates a fresh stream
    r = requests.post(f"{BASE_URL}/api/live", headers=_headers(owner["token"]),
                      json={"title": "TEC realtime"}, timeout=15)
    sid = r.json()["id"]

    try:
        u_owner = f"{WS_BASE}/api/live/{sid}/ws?token={owner['token']}"
        u_v1 = f"{WS_BASE}/api/live/{sid}/ws?token={viewer['token']}"
        u_v2 = f"{WS_BASE}/api/live/{sid}/ws?token={viewer2['token']}"

        async with websockets.connect(u_owner, open_timeout=10) as ws_o:
            init_o = json.loads(await asyncio.wait_for(ws_o.recv(), timeout=5))
            assert init_o["type"] == "init"
            assert "chat" in init_o and "gifts" in init_o and init_o["hearts"] == 0
            assert len(init_o["gifts"]) == 7

            # Owner should also receive its own viewers=1 and system-join
            _ = await _recv_until(ws_o, {"viewers"}, timeout=5)

            # Viewer joins
            async with websockets.connect(u_v1, open_timeout=10) as ws_v1:
                init_v1 = json.loads(await asyncio.wait_for(ws_v1.recv(), timeout=5))
                assert init_v1["type"] == "init"

                # Both sides should see viewers=2
                seen_o = await _recv_until(ws_o, {"viewers"}, timeout=5)
                latest_o = seen_o["viewers"][-1]["count"]
                assert latest_o >= 2, f"expected owner to see >=2 viewers, got {latest_o}"

                # Viewer sends chat -> owner receives
                await ws_v1.send(json.dumps({"type": "chat", "text": "hello from viewer"}))
                seen_o2 = await _recv_until(ws_o, {"chat"}, timeout=5)
                assert any(m["message"]["text"] == "hello from viewer" for m in seen_o2["chat"])

                # Viewer sends heart -> owner receives heart broadcast
                await ws_v1.send(json.dumps({"type": "heart"}))
                seen_o3 = await _recv_until(ws_o, {"heart"}, timeout=5)
                assert seen_o3["heart"], "owner did not receive heart"

                # Viewer sends gift -> owner receives gift broadcast with payload
                await ws_v1.send(json.dumps({"type": "gift", "gift_id": "rose"}))
                seen_o4 = await _recv_until(ws_o, {"gift"}, timeout=5)
                assert seen_o4["gift"][0]["message"]["gift"]["id"] == "rose"

                # Second viewer joins => viewers>=3
                async with websockets.connect(u_v2, open_timeout=10) as ws_v2:
                    _ = json.loads(await asyncio.wait_for(ws_v2.recv(), timeout=5))
                    seen_o5 = await _recv_until(ws_o, {"viewers"}, timeout=5)
                    assert seen_o5["viewers"][-1]["count"] >= 3

                # After ws_v2 closes, viewer count decrements
                await asyncio.sleep(0.5)
                seen_o6 = await _recv_until(ws_o, {"viewers"}, timeout=5)
                assert seen_o6["viewers"][-1]["count"] <= 2

        # Verify hearts persisted after everyone disconnected
        pub = requests.get(f"{BASE_URL}/api/live/{sid}", headers=_headers(owner["token"]), timeout=10).json()
        assert pub["hearts"] >= 1

        # Chat history persisted
        hist = requests.get(f"{BASE_URL}/api/live/{sid}/chat", headers=_headers(owner["token"]), timeout=10).json()
        assert any(m.get("text") == "hello from viewer" for m in hist)

    finally:
        requests.post(f"{BASE_URL}/api/live/{sid}/stop", headers=_headers(owner["token"]), timeout=10)


@pytest.mark.asyncio
async def test_ws_stream_not_live(owner):
    r = requests.post(f"{BASE_URL}/api/live", headers=_headers(owner["token"]),
                      json={"title": "TEC ended"}, timeout=15)
    sid = r.json()["id"]
    requests.post(f"{BASE_URL}/api/live/{sid}/stop", headers=_headers(owner["token"]), timeout=10)

    url = f"{WS_BASE}/api/live/{sid}/ws?token={owner['token']}"
    async with websockets.connect(url, open_timeout=10) as ws:
        m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert m["type"] == "error"
        assert m["detail"] == "stream_not_live"
