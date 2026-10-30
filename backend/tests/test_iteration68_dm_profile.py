"""Iteration 68 — DM backend verification.

Covers the recent main-agent fixes for Messages page:
  (A) GET /api/conversations/{id}/messages returns `read_by` on each message
      and, as a side-effect, marks the peer's messages read (read_by ← reader)
      and sets conversation read_by for the caller.
  (B) Typing endpoints: POST /api/conversations/{id}/typing then
      GET /typing returns the typing user within the 5s window, and the user
      drops off after ~5s of no pings.
  (C) GET /api/conversations: a GROUP with no custom avatar_url returns
      avatar_url == "" (so the frontend can render a centered group icon),
      while 1:1 chats still return the peer's avatar.

All test data is prefixed TEST_ / tpb_ so it is auto-purged on backend restart.
This suite is credit-neutral (no AI character messaging).
"""
import os
import time
import uuid
import pytest
import requests


def _resolve_base_url() -> str:
    env = os.environ.get("REACT_APP_BACKEND_URL")
    if env:
        return env.rstrip("/")
    try:
        with open("/app/frontend/.env", "r", encoding="utf-8") as f:
            for ln in f:
                if ln.strip().startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().strip('"').rstrip("/")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _resolve_base_url()

FOUNDER_IDENTIFIER = "semidiepie@gmail.com"
FOUNDER_PIN = "7455"


# ---------- helpers ---------------------------------------------------------
def _login_pin(identifier: str, pin: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/auth/login-pin",
        json={"identifier": identifier, "pin": pin},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _register(username: str, pin: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "username": username,
            "display_name": username,
            "email": f"{username}@example.com",
            "password": "Testpass123!",
            "pin": pin,
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _follow(follower_tok: str, followee_id: str):
    r = requests.post(
        f"{BASE_URL}/api/users/{followee_id}/follow",
        headers=_hdr(follower_tok),
        timeout=15,
    )
    assert r.status_code in (200, 201, 204), r.text


# ---------- fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def founder():
    data = _login_pin(FOUNDER_IDENTIFIER, FOUNDER_PIN)
    return {"token": data["access_token"], "user": data["user"]}


@pytest.fixture(scope="module")
def two_mutual_users():
    """Create two mutually-following TEST_ users (needed for a brand-new 1:1)."""
    u1_name = f"tpb_dm_a_{uuid.uuid4().hex[:6]}"
    u2_name = f"tpb_dm_b_{uuid.uuid4().hex[:6]}"
    a = _register(u1_name, "1234")
    b = _register(u2_name, "5678")
    _follow(a["access_token"], b["user"]["id"])
    _follow(b["access_token"], a["user"]["id"])
    return {
        "a": {"token": a["access_token"], "user": a["user"]},
        "b": {"token": b["access_token"], "user": b["user"]},
    }


@pytest.fixture(scope="module")
def one_to_one_conv(two_mutual_users):
    a = two_mutual_users["a"]
    b = two_mutual_users["b"]
    r = requests.post(
        f"{BASE_URL}/api/conversations",
        headers=_hdr(a["token"]),
        json={"member_ids": [b["user"]["id"]]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------- (A) read receipts ----------------------------------------------
class TestReadReceipts:
    def test_messages_endpoint_marks_peer_messages_read(self, two_mutual_users, one_to_one_conv):
        a = two_mutual_users["a"]
        b = two_mutual_users["b"]
        conv_id = one_to_one_conv["id"]

        # A sends a message
        send = requests.post(
            f"{BASE_URL}/api/conversations/{conv_id}/messages",
            headers=_hdr(a["token"]),
            json={"text": "TEST_RR hello from A"},
            timeout=15,
        )
        assert send.status_code == 200, send.text
        sent_msg = send.json()
        assert sent_msg["sender_id"] == a["user"]["id"]
        # Sender should be in read_by immediately
        assert a["user"]["id"] in sent_msg["read_by"]
        # Peer B has NOT read yet
        assert b["user"]["id"] not in sent_msg["read_by"]

        # Before B opens the chat: A refetches, B is not in read_by
        pre = requests.get(
            f"{BASE_URL}/api/conversations/{conv_id}/messages",
            headers=_hdr(a["token"]),
            timeout=15,
        )
        assert pre.status_code == 200
        rows = pre.json()
        target = [m for m in rows if m["id"] == sent_msg["id"]][0]
        assert b["user"]["id"] not in target["read_by"]

        # B opens (GET /messages) — this is what the frontend does on open
        opened = requests.get(
            f"{BASE_URL}/api/conversations/{conv_id}/messages",
            headers=_hdr(b["token"]),
            timeout=15,
        )
        assert opened.status_code == 200

        # A refetches: now B should be in read_by of A's message
        after = requests.get(
            f"{BASE_URL}/api/conversations/{conv_id}/messages",
            headers=_hdr(a["token"]),
            timeout=15,
        )
        assert after.status_code == 200
        after_rows = after.json()
        target_after = [m for m in after_rows if m["id"] == sent_msg["id"]][0]
        assert b["user"]["id"] in target_after["read_by"], (
            f"peer should be in read_by after they open; got {target_after['read_by']}"
        )
        # Each message carries a read_by list field
        for m in after_rows:
            assert isinstance(m.get("read_by"), list)


# ---------- (B) typing ------------------------------------------------------
class TestTyping:
    def test_typing_appears_then_expires(self, two_mutual_users, one_to_one_conv):
        a = two_mutual_users["a"]
        b = two_mutual_users["b"]
        conv_id = one_to_one_conv["id"]

        # B pings typing
        ping = requests.post(
            f"{BASE_URL}/api/conversations/{conv_id}/typing",
            headers=_hdr(b["token"]),
            timeout=15,
        )
        assert ping.status_code == 200, ping.text

        # A immediately polls — should see B
        got = requests.get(
            f"{BASE_URL}/api/conversations/{conv_id}/typing",
            headers=_hdr(a["token"]),
            timeout=15,
        )
        assert got.status_code == 200
        users = got.json().get("users", [])
        assert any(u["id"] == b["user"]["id"] for u in users), f"expected B typing; got {users}"

        # Caller never appears in their own typing list
        self_poll = requests.get(
            f"{BASE_URL}/api/conversations/{conv_id}/typing",
            headers=_hdr(b["token"]),
            timeout=15,
        )
        assert self_poll.status_code == 200
        assert all(u["id"] != b["user"]["id"] for u in self_poll.json().get("users", []))

        # Wait ~6s (window is 5s) — B should drop off
        time.sleep(6)
        got2 = requests.get(
            f"{BASE_URL}/api/conversations/{conv_id}/typing",
            headers=_hdr(a["token"]),
            timeout=15,
        )
        assert got2.status_code == 200
        users2 = got2.json().get("users", [])
        assert all(u["id"] != b["user"]["id"] for u in users2), (
            f"B should have expired from typing after 5s; got {users2}"
        )


# ---------- (C) group avatar fallback --------------------------------------
class TestGroupAvatarFallback:
    def test_group_without_avatar_returns_empty_string(self, founder, two_mutual_users):
        """GROUP with no custom avatar should return avatar_url == '' so the UI
        can render a centered group icon (not a cropped member/logo image)."""
        a = two_mutual_users["a"]
        b = two_mutual_users["b"]
        # Make a group: a + b + founder (3 members)
        r = requests.post(
            f"{BASE_URL}/api/conversations",
            headers=_hdr(a["token"]),
            json={
                "member_ids": [b["user"]["id"], founder["user"]["id"]],
                "name": "TEST_GroupNoAvatar",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        preview = r.json()
        assert preview["is_group"] is True
        assert preview["avatar_url"] == "", f"group avatar_url should be empty string, got {preview['avatar_url']!r}"

        # Also verify via LIST endpoint (what the UI actually uses)
        lst = requests.get(
            f"{BASE_URL}/api/conversations",
            headers=_hdr(a["token"]),
            timeout=15,
        )
        assert lst.status_code == 200
        groups = [c for c in lst.json() if c.get("title") == "TEST_GroupNoAvatar"]
        assert groups and groups[0]["avatar_url"] == ""

    def test_1to1_still_returns_peer_avatar(self, two_mutual_users, one_to_one_conv):
        a = two_mutual_users["a"]
        lst = requests.get(
            f"{BASE_URL}/api/conversations",
            headers=_hdr(a["token"]),
            timeout=15,
        )
        assert lst.status_code == 200
        row = [c for c in lst.json() if c["id"] == one_to_one_conv["id"]][0]
        assert row["is_group"] is False
        # In a 1:1 the avatar field is the peer avatar (defaults to the
        # PostMePlex logo string, never empty — _av() falls back).
        assert isinstance(row["avatar_url"], str)
        assert row["avatar_url"] != "", "1:1 avatar_url should fall back to default/peer avatar, not empty"
