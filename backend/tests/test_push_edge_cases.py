"""
Iteration 5 edge cases & regression sanity for push pipeline and other endpoints.

Covers:
  - /api/register-push with a very long device_token (256 chars)
  - Rapid-fire /api/register-push 5x same user (no idempotency lock)
  - /api/push/debug from a fresh-signup account
  - Regression: POST /api/posts, POST /api/reels, POST /api/stories,
    POST /api/users/{id}/follow, POST /api/users/{id}/block
"""
import uuid
import pytest
import requests

BASE_URL = "http://localhost:8001"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register_fresh(client) -> dict:
    """Register a fresh throw-away user and return {token, user}."""
    suffix = uuid.uuid4().hex[:6]
    payload = {
        "email": f"TEST_ec_{suffix}@example.com",
        "password": "Test123!",
        "username": f"tec_{suffix}",  # <= 20 chars
        "display_name": "TEST EdgeCase",
    }
    r = client.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    me = client.get(
        f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}
    ).json()
    return {"token": tok, "user": me}


@pytest.fixture(scope="module")
def user_a(client):
    return _register_fresh(client)


@pytest.fixture(scope="module")
def user_b(client):
    return _register_fresh(client)


# ---------- register-push edge cases ----------

class TestRegisterPushEdge:
    def test_register_push_long_token(self, client):
        """256-char device_token should still return 201 skipped (no crash)."""
        long_tok = "a" * 256
        r = client.post(
            f"{BASE_URL}/api/register-push",
            json={"user_id": "abc", "platform": "ios", "device_token": long_tok},
        )
        assert r.status_code == 201, f"got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("status") == "skipped", data

    def test_register_push_rapid_fire_same_user(self, client, user_a):
        """5 rapid calls for the same user_id should all 201 skipped."""
        uid = user_a["user"]["id"]
        results = []
        for i in range(5):
            r = client.post(
                f"{BASE_URL}/api/register-push",
                json={
                    "user_id": uid,
                    "platform": "ios",
                    "device_token": f"hex-rapid-{i}-{uuid.uuid4().hex}",
                },
            )
            results.append((r.status_code, r.json() if r.headers.get("content-type","").startswith("application/json") else r.text))
        for i, (code, body) in enumerate(results):
            assert code == 201, f"call #{i} returned {code}: {body}"
            assert body.get("status") == "skipped", f"call #{i} body: {body}"


# ---------- push/debug for a fresh user ----------

class TestPushDebugFreshUser:
    def test_push_debug_fresh_signup(self, client, user_b):
        r = client.get(
            f"{BASE_URL}/api/push/debug",
            headers={"Authorization": f"Bearer {user_b['token']}"},
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("key_configured") is False, data
        assert data.get("user_id") == user_b["user"]["id"], data
        assert data.get("upstream_status") is None, data
        assert data.get("upstream_body") == "", data


# ---------- regressions: content creation & social actions ----------

class TestContentCreation:
    def test_create_post(self, client, user_a):
        r = client.post(
            f"{BASE_URL}/api/posts",
            json={
                "caption": "TEST_ec post caption",
                "image_url": "https://example.com/x.png",
                "game_tag": "valorant",
            },
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert r.status_code in (200, 201), f"got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("id"), data
        assert data.get("caption") == "TEST_ec post caption", data
        # verify persistence via GET
        pid = data["id"]
        g = client.get(
            f"{BASE_URL}/api/posts/{pid}",
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert g.status_code == 200, f"GET post failed: {g.status_code} {g.text}"
        assert g.json().get("id") == pid

    def test_create_reel(self, client, user_a):
        r = client.post(
            f"{BASE_URL}/api/reels",
            json={
                "caption": "TEST_ec reel",
                "video_url": "https://example.com/v.mp4",
                "thumbnail_url": "https://example.com/thumb.jpg",
                "duration": 15.0,
                "game_tag": "apex",
            },
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert r.status_code in (200, 201), f"got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("id"), data
        assert data.get("video_url") == "https://example.com/v.mp4", data

    def test_create_story(self, client, user_a):
        r = client.post(
            f"{BASE_URL}/api/stories",
            json={
                "media_url": "https://example.com/story.jpg",
                "media_type": "image",
                "caption": "TEST_ec story",
            },
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert r.status_code in (200, 201), f"got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("id"), data
        assert data.get("media_url") == "https://example.com/story.jpg", data


class TestSocialActions:
    def test_follow_user(self, client, user_a, user_b):
        target = user_b["user"]["id"]
        r = client.post(
            f"{BASE_URL}/api/users/{target}/follow",
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert r.status_code in (200, 201), f"follow failed: {r.status_code} {r.text}"
        # verify by hitting followers of user_b
        g = client.get(
            f"{BASE_URL}/api/users/{target}/followers",
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert g.status_code == 200
        body = g.json()
        # endpoint returns either a bare list or {private, users:[...]}
        followers = body if isinstance(body, list) else body.get("users", [])
        follower_ids = [f.get("id") for f in followers]
        assert user_a["user"]["id"] in follower_ids, f"follower not found: {follower_ids}"

    def test_block_user(self, client, user_a, user_b):
        target = user_b["user"]["id"]
        r = client.post(
            f"{BASE_URL}/api/users/{target}/block",
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert r.status_code in (200, 201), f"block failed: {r.status_code} {r.text}"
        # verify /api/blocks lists them
        g = client.get(
            f"{BASE_URL}/api/blocks",
            headers={"Authorization": f"Bearer {user_a['token']}"},
        )
        assert g.status_code == 200, f"GET /api/blocks failed: {g.status_code} {g.text}"
        blocked = g.json()
        assert isinstance(blocked, list)
        blocked_ids = [b.get("id") for b in blocked]
        assert target in blocked_ids, f"target not in blocks list: {blocked_ids}"
