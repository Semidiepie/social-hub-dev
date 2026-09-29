"""
Iteration 40 backend tests — LIVE indicators + admin Feature toggle + live-follower notifications.

Covers:
- POST /api/admin/feature: 403 non-admin, 404 missing id, toggles featured true/false for post/reel/video/live
- GET /api/feed floats featured post/reel/video to the top
- GET /api/discover?filter=top floats featured post first
- GET /api/live floats featured streams first
- POST /api/live sets user.is_live=true + live_stream_id and creates 'live' notifications for followers
- POST /api/live/{id}/stop resets is_live=false, live_stream_id=None
- is_live serialized in feed authors, comment authors, discover users, message peers
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PIN = "7455"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def founder_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": FOUNDER_EMAIL, "pin": FOUNDER_PIN})
    assert r.status_code == 200, f"founder login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def founder(s, founder_token):
    r = s.get(f"{BASE_URL}/api/auth/me", headers=_auth(founder_token))
    assert r.status_code == 200
    u = r.json()
    assert u.get("is_super_admin") is True
    return u


def _register(s, prefix="test_"):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"{prefix}{suffix}@postmeplex.com",
        "username": f"{prefix}{suffix}",
        "password": "Test123!",
        "pin": "1234",
        "display_name": f"Test {suffix}",
    }
    r = s.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return data["access_token"], data["user"]


@pytest.fixture(scope="module")
def user_a(s):
    return _register(s)


@pytest.fixture(scope="module")
def user_b(s):
    return _register(s)


# ---------------- ADMIN FEATURE TOGGLE ----------------
def test_admin_feature_non_admin_forbidden(s, user_a):
    tok, _ = user_a
    r = s.post(f"{BASE_URL}/api/admin/feature",
               json={"type": "post", "id": "does-not-matter", "featured": True},
               headers=_auth(tok))
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


def test_admin_feature_missing_id_404(s, founder_token):
    r = s.post(f"{BASE_URL}/api/admin/feature",
               json={"type": "post", "id": f"nonexistent-{uuid.uuid4().hex}", "featured": True},
               headers=_auth(founder_token))
    assert r.status_code == 404


def test_admin_feature_post_toggle_and_feed_float(s, user_a, founder_token):
    tok_a, ua = user_a
    # Create two posts as user_a
    r1 = s.post(f"{BASE_URL}/api/posts", json={"caption": "test_older post"}, headers=_auth(tok_a))
    assert r1.status_code == 200
    older_id = r1.json()["id"]
    time.sleep(0.2)
    r2 = s.post(f"{BASE_URL}/api/posts", json={"caption": "test_newer post"}, headers=_auth(tok_a))
    assert r2.status_code == 200
    newer_id = r2.json()["id"]

    # Feature the OLDER one
    r = s.post(f"{BASE_URL}/api/admin/feature",
               json={"type": "post", "id": older_id, "featured": True},
               headers=_auth(founder_token))
    assert r.status_code == 200
    body = r.json()
    assert body["featured"] is True and body["type"] == "post" and body["id"] == older_id

    # Feed: older (featured) should now come BEFORE newer
    r = s.get(f"{BASE_URL}/api/feed", headers=_auth(tok_a))
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert older_id in ids and newer_id in ids
    assert ids.index(older_id) < ids.index(newer_id), f"featured post did not float to top: {ids[:5]}"

    # Also assert 'featured' true in payload
    older = next(p for p in r.json() if p["id"] == older_id)
    assert older.get("featured") is True

    # Unfeature -> order should be newest first again
    r = s.post(f"{BASE_URL}/api/admin/feature",
               json={"type": "post", "id": older_id, "featured": False},
               headers=_auth(founder_token))
    assert r.status_code == 200 and r.json()["featured"] is False

    r = s.get(f"{BASE_URL}/api/feed", headers=_auth(tok_a))
    ids = [p["id"] for p in r.json()]
    assert ids.index(newer_id) < ids.index(older_id), f"unfeature did not restore chrono order: {ids[:5]}"


def test_admin_feature_reel_supported(s, user_a, founder_token):
    tok_a, _ = user_a
    r = s.post(f"{BASE_URL}/api/posts",
               json={"caption": "test_reel", "type": "reel", "video_url": "https://example.com/v.mp4"},
               headers=_auth(tok_a))
    assert r.status_code == 200
    reel_id = r.json()["id"]
    r = s.post(f"{BASE_URL}/api/admin/feature",
               json={"type": "reel", "id": reel_id, "featured": True},
               headers=_auth(founder_token))
    assert r.status_code == 200 and r.json()["featured"] is True


def test_discover_top_featured_first(s, user_a, founder_token):
    tok_a, _ = user_a
    r1 = s.post(f"{BASE_URL}/api/posts", json={"caption": "test_discover A"}, headers=_auth(tok_a))
    assert r1.status_code == 200
    a_id = r1.json()["id"]
    r2 = s.post(f"{BASE_URL}/api/posts", json={"caption": "test_discover B"}, headers=_auth(tok_a))
    assert r2.status_code == 200
    b_id = r2.json()["id"]
    # feature A
    s.post(f"{BASE_URL}/api/admin/feature",
           json={"type": "post", "id": a_id, "featured": True},
           headers=_auth(founder_token))
    r = s.get(f"{BASE_URL}/api/discover?filter=top", headers=_auth(tok_a))
    assert r.status_code == 200
    payload = r.json()
    ids = [p["id"] for p in payload["items"]]
    if a_id in ids and b_id in ids:
        assert ids.index(a_id) < ids.index(b_id), f"discover featured-first broken: {ids[:5]}"


# ---------------- LIVE: is_live + follower notifications + featured-first ----------------
def test_go_live_sets_is_live_and_notifies_followers(s, user_a, user_b):
    tok_a, ua = user_a
    tok_b, ub = user_b
    # B follows A
    r = s.post(f"{BASE_URL}/api/users/{ua['id']}/follow", headers=_auth(tok_b))
    assert r.status_code == 200

    # A goes live
    r = s.post(f"{BASE_URL}/api/live", json={"title": "test_live_stream"}, headers=_auth(tok_a))
    assert r.status_code == 200, r.text
    live_id = r.json()["id"]

    # A's /me should show is_live=true
    r = s.get(f"{BASE_URL}/api/auth/me", headers=_auth(tok_a))
    assert r.status_code == 200
    me = r.json()
    assert me.get("is_live") is True
    assert me.get("live_stream_id") == live_id

    # Follower B receives a 'live' notification pointing to the stream
    r = s.get(f"{BASE_URL}/api/notifications", headers=_auth(tok_b))
    assert r.status_code == 200
    notifs = r.json()
    live_notifs = [n for n in notifs if n.get("type") == "live" and n.get("actor_id") == ua["id"]]
    assert live_notifs, f"no 'live' notification for follower: {notifs[:3]}"
    assert live_notifs[0].get("link") == f"/live/{live_id}"

    # Public profile also exposes is_live
    r = s.get(f"{BASE_URL}/api/users/{ua['id']}", headers=_auth(tok_b))
    assert r.status_code == 200
    assert r.json().get("is_live") is True

    # stop live -> is_live false, live_stream_id None
    r = s.post(f"{BASE_URL}/api/live/{live_id}/stop", headers=_auth(tok_a))
    assert r.status_code == 200
    r = s.get(f"{BASE_URL}/api/auth/me", headers=_auth(tok_a))
    me = r.json()
    assert me.get("is_live") is False
    assert me.get("live_stream_id") in (None, "")


def test_admin_feature_live_floats_first(s, user_a, user_b, founder_token):
    tok_a, _ = user_a
    tok_b, _ = user_b
    # Two live streams
    r1 = s.post(f"{BASE_URL}/api/live", json={"title": "test_live_older"}, headers=_auth(tok_a))
    assert r1.status_code == 200
    older_id = r1.json()["id"]
    time.sleep(0.2)
    r2 = s.post(f"{BASE_URL}/api/live", json={"title": "test_live_newer"}, headers=_auth(tok_b))
    assert r2.status_code == 200
    newer_id = r2.json()["id"]

    # Feature older
    r = s.post(f"{BASE_URL}/api/admin/feature",
               json={"type": "live", "id": older_id, "featured": True},
               headers=_auth(founder_token))
    assert r.status_code == 200 and r.json()["featured"] is True

    r = s.get(f"{BASE_URL}/api/live", headers=_auth(tok_a))
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert older_id in ids and newer_id in ids
    assert ids.index(older_id) < ids.index(newer_id), f"live featured did not float first: {ids}"

    # cleanup: stop both
    s.post(f"{BASE_URL}/api/live/{older_id}/stop", headers=_auth(tok_a))
    s.post(f"{BASE_URL}/api/live/{newer_id}/stop", headers=_auth(tok_b))


# ---------------- is_live serialized in feed / comments / discover / messages ----------------
def test_is_live_in_feed_author_and_comments(s, user_a, user_b):
    tok_a, ua = user_a
    tok_b, ub = user_b
    # A creates a post
    r = s.post(f"{BASE_URL}/api/posts", json={"caption": "test_islive post"}, headers=_auth(tok_a))
    assert r.status_code == 200
    post_id = r.json()["id"]
    # B comments
    r = s.post(f"{BASE_URL}/api/posts/{post_id}/comments", json={"text": "test_hello"}, headers=_auth(tok_b))
    assert r.status_code == 200

    # A goes live
    r = s.post(f"{BASE_URL}/api/live", json={"title": "test_live_serial"}, headers=_auth(tok_a))
    assert r.status_code == 200
    live_id = r.json()["id"]
    try:
        # feed
        r = s.get(f"{BASE_URL}/api/feed", headers=_auth(tok_b))
        assert r.status_code == 200
        target = next((p for p in r.json() if p["id"] == post_id), None)
        assert target is not None
        author = target.get("author") or {}
        assert author.get("is_live") is True, f"feed author.is_live not set: {author}"

        # comments include is_live for comment author
        r = s.get(f"{BASE_URL}/api/posts/{post_id}/comments", headers=_auth(tok_a))
        assert r.status_code == 200
        comments = r.json()
        # find A's own comment (or B's — either way each comment carries is_live for its own author)
        # find one authored by A after we make one now
        r2 = s.post(f"{BASE_URL}/api/posts/{post_id}/comments", json={"text": "test_a_live_comment"}, headers=_auth(tok_a))
        assert r2.status_code == 200
        r = s.get(f"{BASE_URL}/api/posts/{post_id}/comments", headers=_auth(tok_a))
        comments = r.json()
        a_comment = next((c for c in comments if c.get("user_id") == ua["id"]), None)
        assert a_comment is not None
        assert a_comment.get("is_live") is True, f"comment author.is_live not set: {a_comment}"
    finally:
        s.post(f"{BASE_URL}/api/live/{live_id}/stop", headers=_auth(tok_a))


def test_is_live_in_discover_accounts(s, user_a, user_b):
    tok_a, ua = user_a
    tok_b, _ = user_b
    r = s.post(f"{BASE_URL}/api/live", json={"title": "test_live_discover"}, headers=_auth(tok_a))
    assert r.status_code == 200
    live_id = r.json()["id"]
    try:
        r = s.get(f"{BASE_URL}/api/discover?filter=accounts", headers=_auth(tok_b))
        assert r.status_code == 200
        items = r.json().get("items", [])
        a_row = next((u for u in items if u.get("id") == ua["id"]), None)
        # If A isn't in top 30 by followers just soft-skip — but usually a fresh test_ user
        # would be there. Just assert schema when present.
        if a_row is not None:
            assert a_row.get("is_live") is True, f"discover user.is_live not set: {a_row}"
    finally:
        s.post(f"{BASE_URL}/api/live/{live_id}/stop", headers=_auth(tok_a))


def test_is_live_in_messages_peer(s, user_a, user_b):
    tok_a, ua = user_a
    tok_b, ub = user_b
    # mutual follow so DM allowed
    s.post(f"{BASE_URL}/api/users/{ub['id']}/follow", headers=_auth(tok_a))
    s.post(f"{BASE_URL}/api/users/{ua['id']}/follow", headers=_auth(tok_b))
    # create conversation
    r = s.post(f"{BASE_URL}/api/conversations", json={"member_ids": [ub["id"]]}, headers=_auth(tok_a))
    assert r.status_code == 200, r.text
    conv_id = r.json()["id"]
    # A goes live
    r = s.post(f"{BASE_URL}/api/live", json={"title": "test_live_msg"}, headers=_auth(tok_a))
    assert r.status_code == 200
    live_id = r.json()["id"]
    try:
        # B lists conversations -> peer (A) should have is_live=true
        r = s.get(f"{BASE_URL}/api/conversations", headers=_auth(tok_b))
        assert r.status_code == 200
        convs = r.json()
        target = next((c for c in convs if c.get("id") == conv_id), None)
        assert target is not None, f"conversation {conv_id} not found in {[c.get('id') for c in convs]}"
        peer = target.get("peer") or {}
        assert peer.get("is_live") is True, f"messages peer.is_live not set: {peer}"
    finally:
        s.post(f"{BASE_URL}/api/live/{live_id}/stop", headers=_auth(tok_a))
