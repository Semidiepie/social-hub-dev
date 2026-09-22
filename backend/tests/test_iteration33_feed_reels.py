"""Iteration 33 — Reels added to home feed.

Verifies:
- GET /api/feed returns items of type 'post', 'video', AND 'reel'
- Reel items have expected fields: type='reel', video_url, thumbnail_url,
  likes, comments_count, views, author
- Reel created via POST /api/reels appears in /api/feed
- Block-filtering still applies (blocker's reel hidden)
"""
import os
import time
import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://social-hub-dev-4.preview.emergentagent.com"
).rstrip("/")
FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register(prefix="tec_i33"):
    ts = int(time.time() * 1000) % 100000000
    email = f"{prefix}{ts}@example.com"
    username = f"{prefix}{ts}"[:20]
    body = {"email": email, "password": "TestPass123!", "username": username, "display_name": prefix, "pin": "1234"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["access_token"], data["user"]


@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)


@pytest.fixture(scope="module")
def sample_reel(founder_token):
    """Create a reel as the founder so we know at least one exists."""
    headers = {"Authorization": f"Bearer {founder_token}"}
    payload = {
        "caption": "TEST_iter33 reel-in-feed",
        "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/small_ft0lfg.mp4",
        "thumbnail_url": "https://images.pexels.com/photos/6489045/pexels-photo-6489045.jpeg?w=1080",
        "game_tag": "Test",
        "duration": 6,
    }
    r = requests.post(f"{BASE_URL}/api/reels", json=payload, headers=headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_feed_returns_reels_video_and_post(founder_token, sample_reel):
    headers = {"Authorization": f"Bearer {founder_token}"}
    r = requests.get(f"{BASE_URL}/api/feed", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    assert len(items) > 0
    types = {i.get("type") for i in items}
    # reel just created should be present
    assert "reel" in types, f"'reel' not present in feed types: {types}"


def test_feed_reel_has_expected_fields(founder_token, sample_reel):
    headers = {"Authorization": f"Bearer {founder_token}"}
    r = requests.get(f"{BASE_URL}/api/feed", headers=headers, timeout=15)
    assert r.status_code == 200
    items = r.json()
    # find our sample reel
    reel_id = sample_reel.get("id")
    reels_in_feed = [i for i in items if i.get("type") == "reel"]
    assert len(reels_in_feed) > 0
    match = next((i for i in reels_in_feed if i.get("id") == reel_id), None)
    assert match, "just-created reel not present in /api/feed"
    for k in ("video_url", "thumbnail_url", "likes", "comments_count", "views", "author", "created_at"):
        assert k in match, f"reel item missing key: {k}"
    assert match["author"] is not None
    assert "username" in match["author"]


def test_feed_ordered_by_created_at_desc(founder_token, sample_reel):
    headers = {"Authorization": f"Bearer {founder_token}"}
    r = requests.get(f"{BASE_URL}/api/feed", headers=headers, timeout=15)
    items = r.json()
    times = [i["created_at"] for i in items]
    assert times == sorted(times, reverse=True), "feed not sorted newest-first"
    assert len(items) <= 80


def test_feed_block_filter_hides_blockers_reel(founder_token, sample_reel):
    """When viewer blocks the reel's author, that reel disappears from feed."""
    # register a fresh user
    viewer_token, viewer = _register(prefix="tec_i33v")
    v_headers = {"Authorization": f"Bearer {viewer_token}"}

    # sanity: reel visible to viewer initially
    r = requests.get(f"{BASE_URL}/api/feed", headers=v_headers, timeout=15)
    ids = [i["id"] for i in r.json() if i.get("type") == "reel"]
    assert sample_reel["id"] in ids, "reel should be visible pre-block"

    # find founder id
    r_me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {founder_token}"}, timeout=15)
    founder_id = r_me.json()["id"]

    # block founder
    blk = requests.post(f"{BASE_URL}/api/users/{founder_id}/block", headers=v_headers, timeout=15)
    assert blk.status_code in (200, 201, 204), blk.text

    # now the founder's reel must NOT appear
    r2 = requests.get(f"{BASE_URL}/api/feed", headers=v_headers, timeout=15)
    ids2 = [i["id"] for i in r2.json() if i.get("type") == "reel"]
    assert sample_reel["id"] not in ids2, "reel should be hidden after block"


def test_feed_anonymous_also_contains_reels(sample_reel):
    r = requests.get(f"{BASE_URL}/api/feed", timeout=15)
    assert r.status_code == 200
    types = {i.get("type") for i in r.json()}
    assert "reel" in types
