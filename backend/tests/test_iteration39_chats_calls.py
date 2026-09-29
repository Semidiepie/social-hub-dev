"""Iteration 39 tests — messaging feature set:
- mutual-follow gate for NEW 1:1 conversations
- group CRUD (create/rename/photo/members/leave/auto-delete/admin-handoff)
- message enrichment + conv_preview shape
- call signaling WebSocket (/api/rtc/ws) full handshake
- public user endpoint exposes equipped_frame + frame_enabled
"""
import asyncio
import json
import os
import random
import string
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com"
).rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/rtc/ws"


def _rand(prefix="test_"):
    return prefix + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))


def _register(username_prefix="test_u"):
    uname = _rand(username_prefix)
    email = f"{uname}@example.com"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": email,
            "username": uname,
            "password": "Test123!",
            "display_name": uname.replace("_", " ").title(),
            "pin": "1234",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"register {uname}: {r.status_code} {r.text}"
    body = r.json()
    return {"token": body["access_token"], "user": body["user"]}


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _follow(follower_token, followee_id):
    r = requests.post(
        f"{BASE_URL}/api/users/{followee_id}/follow", headers=_h(follower_token), timeout=15
    )
    assert r.status_code == 200, f"follow failed {r.status_code} {r.text}"


# ---------- 1. Mutual-follow gate ----------

@pytest.fixture(scope="module")
def actors():
    a = _register("test_a")
    b = _register("test_b")
    c = _register("test_c")
    return a, b, c


def test_mutual_follow_gate_403_when_not_mutual(actors):
    a, b, _ = actors
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


def test_mutual_follow_gate_403_when_one_way(actors):
    a, b, _ = actors
    _follow(a["token"], b["user"]["id"])  # a->b only
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 403


def test_mutual_follow_gate_200_when_mutual(actors):
    a, b, _ = actors
    _follow(b["token"], a["user"]["id"])  # now mutual
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    conv = r.json()
    assert conv["is_group"] is False
    assert conv["peer"]["id"] == b["user"]["id"]
    assert "peer" in conv and conv["peer"] is not None
    # peer includes verified + frame fields
    for k in ("is_verified", "remembering", "equipped_frame", "frame_enabled"):
        assert k in conv["peer"], f"peer missing {k}"


def test_existing_1to1_returns_existing_without_gate(actors):
    # Unfollow to make it non-mutual, existing chat should still return
    a, b, _ = actors
    requests.delete(
        f"{BASE_URL}/api/users/{b['user']['id']}/follow",
        headers=_h(a["token"]),
        timeout=15,
    )
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    # existing 1:1 conv still returned
    assert r.status_code == 200, r.text


def test_group_exempt_from_gate(actors):
    # non-mutual a<->c, but adding a name makes it group -> allowed
    a, _, c = actors
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [c["user"]["id"]], "name": "TEST_group_gate_exempt"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    conv = r.json()
    assert conv["is_group"] is True
    assert conv["admin_id"] == a["user"]["id"]
    # cleanup
    requests.delete(f"{BASE_URL}/api/conversations/{conv['id']}", headers=_h(a["token"]))


# ---------- 2. Group CRUD ----------

@pytest.fixture(scope="module")
def group_setup(actors):
    a, b, c = actors
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"], c["user"]["id"]], "name": "TEST_squad"},
        timeout=15,
    )
    assert r.status_code == 200
    conv = r.json()
    return {"conv": conv, "a": a, "b": b, "c": c}


def test_group_created_with_admin_and_members(group_setup):
    conv = group_setup["conv"]
    assert conv["is_group"] is True
    assert conv["admin_id"] == group_setup["a"]["user"]["id"]
    assert len(conv["member_ids"]) == 3
    assert len(conv["members"]) == 3


def test_group_rename_admin_ok(group_setup):
    conv = group_setup["conv"]
    r = requests.patch(
        f"{BASE_URL}/api/conversations/{conv['id']}",
        headers=_h(group_setup["a"]["token"]),
        json={"name": "TEST_squad_renamed"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "TEST_squad_renamed"


def test_group_rename_non_admin_403(group_setup):
    conv = group_setup["conv"]
    r = requests.patch(
        f"{BASE_URL}/api/conversations/{conv['id']}",
        headers=_h(group_setup["b"]["token"]),
        json={"name": "hijack"},
        timeout=15,
    )
    assert r.status_code == 403


def test_patch_1to1_returns_400(actors):
    """PATCH on a 1:1 conv should be 400 (only groups editable)."""
    a, b, _ = actors
    # ensure existing 1:1 (mutual re-following to guarantee it)
    _follow(a["token"], b["user"]["id"])
    _follow(b["token"], a["user"]["id"])
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 200
    conv_id = r.json()["id"]
    r2 = requests.patch(
        f"{BASE_URL}/api/conversations/{conv_id}",
        headers=_h(a["token"]),
        json={"name": "nope"},
        timeout=15,
    )
    assert r2.status_code == 400


def test_group_add_member_admin_only(group_setup):
    conv = group_setup["conv"]
    # Register a 4th user
    d = _register("test_d")
    # non-admin (b) tries first
    r = requests.post(
        f"{BASE_URL}/api/conversations/{conv['id']}/members",
        headers=_h(group_setup["b"]["token"]),
        json={"member_ids": [d["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 403
    # admin (a) succeeds
    r2 = requests.post(
        f"{BASE_URL}/api/conversations/{conv['id']}/members",
        headers=_h(group_setup["a"]["token"]),
        json={"member_ids": [d["user"]["id"]]},
        timeout=15,
    )
    assert r2.status_code == 200, r2.text
    assert d["user"]["id"] in r2.json()["member_ids"]
    group_setup["d"] = d


def test_group_remove_member_admin(group_setup):
    conv_id = group_setup["conv"]["id"]
    d = group_setup["d"]
    r = requests.delete(
        f"{BASE_URL}/api/conversations/{conv_id}/members/{d['user']['id']}",
        headers=_h(group_setup["a"]["token"]),
        timeout=15,
    )
    assert r.status_code == 200


def test_group_self_leave_and_admin_handoff(group_setup):
    conv_id = group_setup["conv"]["id"]
    a, b, c = group_setup["a"], group_setup["b"], group_setup["c"]
    # admin (a) leaves -> handoff to remaining first (b or c)
    r = requests.delete(
        f"{BASE_URL}/api/conversations/{conv_id}/members/{a['user']['id']}",
        headers=_h(a["token"]),
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["deleted"] is False
    # verify admin_id changed
    convs = requests.get(f"{BASE_URL}/api/conversations", headers=_h(b["token"]), timeout=15).json()
    match = [x for x in convs if x["id"] == conv_id]
    assert match and match[0]["admin_id"] in (b["user"]["id"], c["user"]["id"])


def test_group_auto_delete_when_lt_2(group_setup):
    conv_id = group_setup["conv"]["id"]
    b, c = group_setup["b"], group_setup["c"]
    # b leaves — that makes 1 remaining => auto-delete
    r = requests.delete(
        f"{BASE_URL}/api/conversations/{conv_id}/members/{b['user']['id']}",
        headers=_h(b["token"]),
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True
    # c should no longer see it
    convs = requests.get(f"{BASE_URL}/api/conversations", headers=_h(c["token"]), timeout=15).json()
    assert not any(x["id"] == conv_id for x in convs)


# ---------- 3. Message enrichment ----------

def test_message_enrichment_and_preview(actors):
    a, b, _ = actors
    # ensure mutual
    _follow(a["token"], b["user"]["id"])
    _follow(b["token"], a["user"]["id"])
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 200
    conv = r.json()
    # conv_preview keys
    for k in ("is_group", "admin_id", "members", "peer"):
        assert k in conv
    assert isinstance(conv["members"], list) and len(conv["members"]) == 2
    for m in conv["members"]:
        for f in ("is_verified", "remembering", "equipped_frame", "frame_enabled"):
            assert f in m

    conv_id = conv["id"]
    s = requests.post(
        f"{BASE_URL}/api/conversations/{conv_id}/messages",
        headers=_h(a["token"]),
        json={"text": "hello from A"},
        timeout=15,
    )
    assert s.status_code == 200, s.text
    msg = s.json()
    for f in ("sender_verified", "sender_remembering", "sender_frame", "sender_display_name"):
        assert f in msg
    # list also enriches
    lm = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers=_h(b["token"]), timeout=15)
    assert lm.status_code == 200
    rows = lm.json()
    assert rows and all("sender_verified" in r for r in rows)


# ---------- 4. Public user exposes cosmetic frame ----------

def test_public_user_exposes_frame(actors):
    a, _, _ = actors
    r = requests.get(f"{BASE_URL}/api/users/{a['user']['id']}", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "equipped_frame" in body
    assert "frame_enabled" in body


# ---------- 5. Call signaling WebSocket ----------

@pytest.mark.asyncio
async def test_ws_call_signaling_handshake(actors):
    a, b, _ = actors
    # Ensure mutual + a conversation
    _follow(a["token"], b["user"]["id"])
    _follow(b["token"], a["user"]["id"])
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_h(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 200
    conv_id = r.json()["id"]

    async with websockets.connect(f"{WS_URL}?token={a['token']}") as wa, \
               websockets.connect(f"{WS_URL}?token={b['token']}") as wb:
        # ready messages
        ma = json.loads(await asyncio.wait_for(wa.recv(), 5))
        mb = json.loads(await asyncio.wait_for(wb.recv(), 5))
        assert ma["type"] == "ready" and mb["type"] == "ready"

        call_id = str(uuid.uuid4())
        # A invites
        await wa.send(json.dumps({
            "type": "invite", "conv_id": conv_id, "call_id": call_id, "media": "audio"
        }))
        # B receives call_invite
        inv = json.loads(await asyncio.wait_for(wb.recv(), 5))
        assert inv["type"] == "call_invite"
        assert inv["call_id"] == call_id
        assert inv["from"]["id"] == a["user"]["id"]
        # A gets call_started
        started = json.loads(await asyncio.wait_for(wa.recv(), 5))
        assert started["type"] == "call_started"
        assert b["user"]["id"] in started["ringing"]

        # B accepts
        await wb.send(json.dumps({"type": "accept", "call_id": call_id}))
        # B gets call_peers with A already inside
        peers = json.loads(await asyncio.wait_for(wb.recv(), 5))
        assert peers["type"] == "call_peers"
        assert a["user"]["id"] in peers["peers"]
        # A gets peer_joined
        pj = json.loads(await asyncio.wait_for(wa.recv(), 5))
        assert pj["type"] == "peer_joined"

        # relay offer
        await wa.send(json.dumps({
            "type": "offer", "call_id": call_id, "to": b["user"]["id"],
            "sdp": {"type": "offer", "sdp": "fake"}
        }))
        off = json.loads(await asyncio.wait_for(wb.recv(), 5))
        assert off["type"] == "offer" and off["from"] == a["user"]["id"]

        # bye
        await wa.send(json.dumps({"type": "bye", "call_id": call_id}))
        pl = json.loads(await asyncio.wait_for(wb.recv(), 5))
        assert pl["type"] == "peer_left"
