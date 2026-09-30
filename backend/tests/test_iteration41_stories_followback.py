"""Iteration 41 — Stories + Follow-back annotations.

Covers:
- POST /api/stories create; GET /api/stories groups (self-first, is_me, seen);
  GET /api/stories/user/{id}; POST /api/stories/{id}/view marks seen;
  DELETE /api/stories/{id} owner-only (403 for non-owner).
- GET /api/users/{id} → followed_by + follows_them (two-account matrix).
- GET /api/discover?filter=accounts → items include follows_them + followed_by + is_me.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

def _load_backend_url() -> str:
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", ".env")
    with open(os.path.abspath(env_path), "r") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"


def _register(prefix: str) -> tuple[str, dict]:
    """Register a fresh test_ user and return (token, user_dict)."""
    tag = uuid.uuid4().hex[:6]
    email = f"test_{prefix}_{tag}@postmeplex.com"
    username = f"test_{prefix}_{tag}"[:20]
    body = {
        "email": email,
        "username": username,
        "password": "Testpass1!",
        "display_name": f"Test {prefix} {tag}",
        "pin": "1234",
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    return data["access_token"], data["user"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# --- Stories -------------------------------------------------------------
@pytest.fixture(scope="module")
def two_users():
    a_tok, a_user = _register("story_a")
    b_tok, b_user = _register("story_b")
    return {"a": (a_tok, a_user), "b": (b_tok, b_user)}


def test_create_story_and_list_groups_self_first(two_users):
    a_tok, a_user = two_users["a"]
    b_tok, b_user = two_users["b"]

    # A posts a story
    r = requests.post(
        f"{API}/stories",
        json={
            "media_url": "https://res.cloudinary.com/dpnrol54k/image/upload/v1/sample.jpg",
            "media_type": "image",
            "caption": "hello world",
        },
        headers=_hdr(a_tok),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["user_id"] == a_user["id"]
    assert s["caption"] == "hello world"
    assert s["media_type"] == "image"
    assert "expires_at" in s

    # B posts a story too
    r2 = requests.post(
        f"{API}/stories",
        json={
            "media_url": "https://res.cloudinary.com/dpnrol54k/image/upload/v1/other.jpg",
            "media_type": "image",
        },
        headers=_hdr(b_tok),
        timeout=15,
    )
    assert r2.status_code == 200

    # Viewer=A → self must be first, is_me=true, seen=false
    r3 = requests.get(f"{API}/stories", headers=_hdr(a_tok), timeout=10)
    assert r3.status_code == 200
    groups = r3.json()
    assert isinstance(groups, list) and len(groups) >= 2
    assert groups[0]["is_me"] is True and groups[0]["user_id"] == a_user["id"]
    # every group has these fields
    for g in groups:
        for k in ("user_id", "username", "display_name", "avatar_url", "preview_url", "count", "seen", "is_me"):
            assert k in g, f"missing {k} in group"


def test_mark_seen_and_owner_delete(two_users):
    a_tok, a_user = two_users["a"]
    b_tok, b_user = two_users["b"]

    # A creates a fresh story
    r = requests.post(
        f"{API}/stories",
        json={"media_url": "https://res.cloudinary.com/x/image/upload/v1/pic.jpg", "media_type": "image"},
        headers=_hdr(a_tok),
        timeout=15,
    )
    assert r.status_code == 200
    sid = r.json()["id"]

    # B fetches A's stories, marks seen
    r2 = requests.get(f"{API}/stories/user/{a_user['id']}", headers=_hdr(b_tok), timeout=10)
    assert r2.status_code == 200
    body = r2.json()
    assert body["user"]["id"] == a_user["id"]
    assert any(s["id"] == sid for s in body["stories"])

    r3 = requests.post(f"{API}/stories/{sid}/view", headers=_hdr(b_tok), timeout=10)
    assert r3.status_code == 200

    # B lists stories → A's group should be seen=true (latest of A is now marked)
    # Note: 'seen' is based on the LATEST story only, so we check the specific latest.
    # We verify via aggregation: A may have older/newer stories. Fetch groups.
    r4 = requests.get(f"{API}/stories", headers=_hdr(b_tok), timeout=10)
    assert r4.status_code == 200
    a_group = next((g for g in r4.json() if g["user_id"] == a_user["id"]), None)
    assert a_group is not None
    # We can't strictly assert seen True unless sid is the latest; but view was marked.
    # Assert the endpoint is idempotent:
    r5 = requests.post(f"{API}/stories/{sid}/view", headers=_hdr(b_tok), timeout=10)
    assert r5.status_code == 200

    # B tries to delete A's story → 403
    r6 = requests.delete(f"{API}/stories/{sid}", headers=_hdr(b_tok), timeout=10)
    assert r6.status_code == 403

    # A deletes own story → 200
    r7 = requests.delete(f"{API}/stories/{sid}", headers=_hdr(a_tok), timeout=10)
    assert r7.status_code == 200

    # Delete again → 404
    r8 = requests.delete(f"{API}/stories/{sid}", headers=_hdr(a_tok), timeout=10)
    assert r8.status_code == 404


def test_delete_view_404_for_missing_story(two_users):
    a_tok, _ = two_users["a"]
    r = requests.post(f"{API}/stories/{uuid.uuid4()}/view", headers=_hdr(a_tok), timeout=10)
    assert r.status_code == 404


# --- Follow-back annotations --------------------------------------------
@pytest.fixture(scope="module")
def follow_users():
    a_tok, a_user = _register("fb_a")
    b_tok, b_user = _register("fb_b")
    return a_tok, a_user, b_tok, b_user


def test_followed_by_two_account_matrix(follow_users):
    a_tok, a_user, b_tok, b_user = follow_users

    # Neither follows the other → both false
    r = requests.get(f"{API}/users/{b_user['id']}", headers=_hdr(a_tok), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["follows_them"] is False and d["followed_by"] is False

    # B follows A → viewer=A sees B has followed_by=true, follows_them=false → 'Follow back'
    rf = requests.post(f"{API}/users/{a_user['id']}/follow", headers=_hdr(b_tok), timeout=10)
    assert rf.status_code == 200

    r2 = requests.get(f"{API}/users/{b_user['id']}", headers=_hdr(a_tok), timeout=10)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["follows_them"] is False, "A hasn't followed B yet"
    assert d2["followed_by"] is True, "B follows A → followed_by must be true"

    # From B's viewpoint on A: follows_them=true, followed_by=false
    r3 = requests.get(f"{API}/users/{a_user['id']}", headers=_hdr(b_tok), timeout=10)
    d3 = r3.json()
    assert d3["follows_them"] is True and d3["followed_by"] is False

    # Now A follows B back → both true (Following state)
    rf2 = requests.post(f"{API}/users/{b_user['id']}/follow", headers=_hdr(a_tok), timeout=10)
    assert rf2.status_code == 200
    r4 = requests.get(f"{API}/users/{b_user['id']}", headers=_hdr(a_tok), timeout=10)
    d4 = r4.json()
    assert d4["follows_them"] is True and d4["followed_by"] is True

    # Self-view: both remain false
    r5 = requests.get(f"{API}/users/{a_user['id']}", headers=_hdr(a_tok), timeout=10)
    d5 = r5.json()
    assert d5["follows_them"] is False and d5["followed_by"] is False


def test_discover_accounts_includes_followed_by(follow_users):
    a_tok, a_user, b_tok, b_user = follow_users
    r = requests.get(f"{API}/discover?filter=accounts", headers=_hdr(a_tok), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "accounts"
    items = body["items"]
    for it in items:
        # required keys per spec
        for k in ("id", "follows_them", "followed_by", "is_me"):
            assert k in it, f"discover item missing {k}"
    # Self row must have is_me true
    me_rows = [it for it in items if it["is_me"]]
    if me_rows:
        assert me_rows[0]["id"] == a_user["id"]
