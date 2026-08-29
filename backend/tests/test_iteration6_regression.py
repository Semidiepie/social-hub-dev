"""Iteration 6 backend regression tests.

Focused regression run per the review request:
- Auth login for semidiepie (the ONLY seeded account per test_credentials.md)
- Read endpoints used by the new UI: /api/feed, /api/reels, /api/stories,
  /api/discover with all 4 filters
- Push endpoints unchanged smoke check

We do NOT rerun the full iteration 5 push pipeline suite here (per instructions).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com"
).rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def founder_token(client):
    r = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body
    return body["access_token"]


@pytest.fixture(scope="module")
def founder(client, founder_token):
    r = client.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {founder_token}"},
    )
    assert r.status_code == 200
    return r.json()


# ---- Auth ----
class TestFounderAuth:
    def test_login_success(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["token_type"] == "bearer"
        assert body["user"]["email"] == FOUNDER_EMAIL
        assert body["user"]["username"] == "semidiepie"

    def test_me(self, client, founder_token):
        r = client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert r.status_code == 200
        assert r.json()["email"] == FOUNDER_EMAIL


# ---- Read endpoints (drive the new UI screens) ----
class TestReadEndpoints:
    def test_feed_200_array(self, client):
        r = client.get(f"{BASE_URL}/api/feed")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_reels_200_array(self, client):
        r = client.get(f"{BASE_URL}/api/reels")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # If reels exist, each should carry video_url + author for the reels UI
        for r_ in data[:3]:
            assert "id" in r_
            assert r_.get("type") == "reel"

    def test_stories_200_array(self, client):
        r = client.get(f"{BASE_URL}/api/stories")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.parametrize("flt", ["top", "accounts", "tags", "live"])
    def test_discover_all_filters(self, client, flt):
        r = client.get(f"{BASE_URL}/api/discover", params={"filter": flt})
        assert r.status_code == 200
        body = r.json()
        assert body["type"] == flt
        assert isinstance(body.get("items"), list)


# ---- Push smoke (iteration 5 baseline unchanged) ----
class TestPushSmoke:
    def test_register_push_placeholder_ok(self, client, founder):
        r = client.post(
            f"{BASE_URL}/api/register-push",
            json={
                "user_id": founder["id"],
                "platform": "ios",
                "device_token": "TEST_iter6_devtoken_" + "x" * 8,
            },
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("status") in ("registered", "skipped")

    def test_register_push_missing_token_422(self, client, founder):
        r = client.post(
            f"{BASE_URL}/api/register-push",
            json={"user_id": founder["id"], "platform": "ios"},
        )
        assert r.status_code == 422

    def test_push_debug_authed(self, client, founder_token):
        r = client.get(
            f"{BASE_URL}/api/push/debug",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert r.status_code == 200
        assert "key_configured" in r.json()

    def test_push_debug_unauthed(self, client):
        r = client.get(f"{BASE_URL}/api/push/debug")
        assert r.status_code == 401


# ---- ObjectId leak check on the endpoints the UI hits ----
def _has_objectid(obj):
    if isinstance(obj, dict):
        if "_id" in obj:
            return True
        return any(_has_objectid(v) for v in obj.values())
    if isinstance(obj, list):
        return any(_has_objectid(v) for v in obj)
    return False


class TestNoObjectIdLeak:
    @pytest.mark.parametrize(
        "path",
        [
            "/api/feed",
            "/api/reels",
            "/api/stories",
            "/api/discover?filter=top",
            "/api/discover?filter=accounts",
            "/api/discover?filter=tags",
            "/api/discover?filter=live",
        ],
    )
    def test_no_objectid(self, client, path):
        r = client.get(f"{BASE_URL}{path}")
        assert r.status_code == 200
        assert not _has_objectid(r.json()), f"_id leaked in {path}"
