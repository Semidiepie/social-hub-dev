"""Iteration 42: Admin curated account provisioning + royalty-free clip library.

Covers:
- POST /api/admin/curated-accounts (super-admin only, 400 on blank, verified user + reels)
- GET  /api/admin/curated-clips    (super-admin only, >=3 seeded)
- POST /api/admin/curated-clips    (super-admin only, add clip)
- POST /api/admin/accounts/{uid}/reels (super-admin only, 404 missing user, bulk)
- GET  /api/users/{id}/reels appears + is_verified true
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

FOUNDER = {"email": "semidiepie@gmail.com", "password": "Semi123!"}

# ----------------- fixtures -----------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def founder_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json=FOUNDER)
    assert r.status_code == 200, f"Founder login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def founder_headers(founder_token):
    return {"Authorization": f"Bearer {founder_token}"}


@pytest.fixture(scope="module")
def non_admin_token(api):
    """Create a scratch test_ user (auto-purged on restart)."""
    uniq = uuid.uuid4().hex[:6]
    body = {
        "email": f"test_curate_{uniq}@example.com",
        "username": f"test_cu_{uniq}",
        "password": "Test123!",
        "display_name": "Test Curate",
        "pin": "1234",
    }
    r = api.post(f"{BASE_URL}/api/auth/register", json=body)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def non_admin_headers(non_admin_token):
    return {"Authorization": f"Bearer {non_admin_token}"}


# Track created curated accounts for cleanup
CREATED_UIDS: list[str] = []


# ----------------- tests -----------------

# --- GET /api/admin/curated-clips: auth + seeded library ---
class TestCuratedClipsList:
    def test_requires_super_admin(self, api, non_admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/curated-clips", headers=non_admin_headers)
        assert r.status_code == 403

    def test_requires_auth(self, api):
        r = api.get(f"{BASE_URL}/api/admin/curated-clips")
        assert r.status_code in (401, 403)

    def test_returns_seeded_clips(self, api, founder_headers):
        r = api.get(f"{BASE_URL}/api/admin/curated-clips", headers=founder_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 3, f"expected seed library of >=3, got {len(data)}"
        # No _id leak
        for c in data:
            assert "_id" not in c
            assert "video_url" in c
            assert "id" in c


# --- POST /api/admin/curated-clips: add clip ---
class TestAddCuratedClip:
    def test_non_admin_forbidden(self, api, non_admin_headers):
        r = api.post(f"{BASE_URL}/api/admin/curated-clips", json={
            "video_url": "https://example.com/x.mp4"
        }, headers=non_admin_headers)
        assert r.status_code == 403

    def test_add_clip_persists(self, api, founder_headers):
        payload = {
            "video_url": f"https://res.cloudinary.com/demo/video/upload/test_{uuid.uuid4().hex[:6]}.mp4",
            "thumbnail_url": "https://res.cloudinary.com/demo/video/upload/so_1/dog.jpg",
            "caption": "TEST curated clip",
        }
        pre = api.get(f"{BASE_URL}/api/admin/curated-clips", headers=founder_headers).json()
        pre_count = len(pre)

        r = api.post(f"{BASE_URL}/api/admin/curated-clips", json=payload, headers=founder_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["video_url"] == payload["video_url"]
        assert body["caption"] == payload["caption"]
        assert "id" in body and "_id" not in body

        # GET to confirm persistence
        after = api.get(f"{BASE_URL}/api/admin/curated-clips", headers=founder_headers).json()
        assert len(after) == pre_count + 1
        assert any(c["id"] == body["id"] for c in after)


# --- POST /api/admin/curated-accounts: create curated verified account ---
class TestCreateCuratedAccount:
    def test_non_admin_forbidden(self, api, non_admin_headers):
        r = api.post(f"{BASE_URL}/api/admin/curated-accounts", json={
            "display_name": "Test",
            "populate_count": 1,
        }, headers=non_admin_headers)
        assert r.status_code == 403

    def test_blank_display_name_400(self, api, founder_headers):
        r = api.post(f"{BASE_URL}/api/admin/curated-accounts", json={
            "display_name": "   ",
            "populate_count": 1,
        }, headers=founder_headers)
        assert r.status_code == 400

    def test_create_verified_with_auto_username_and_reels(self, api, founder_headers):
        uniq = uuid.uuid4().hex[:4]
        payload = {
            "display_name": f"TEST Nature {uniq}",
            # username intentionally blank -> auto-generate
            "avatar_url": "",
            "category": "Nature",
            "populate_count": 3,
        }
        r = api.post(f"{BASE_URL}/api/admin/curated-accounts", json=payload, headers=founder_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data and "reels_created" in data
        u = data["user"]
        assert u["display_name"] == payload["display_name"]
        assert u["is_verified"] is True
        assert u["username"]  # auto-generated
        assert isinstance(data["reels_created"], int)
        assert 0 < data["reels_created"] <= 3
        CREATED_UIDS.append(u["id"])

        # Verify the created account shows up in /api/users/{id}/reels and is verified
        reels = api.get(f"{BASE_URL}/api/users/{u['id']}/reels").json()
        assert isinstance(reels, list)
        assert len(reels) == data["reels_created"]
        for p in reels:
            # Endpoint returns enriched author object; verify ownership either way.
            author_id = p.get("author_id") or (p.get("author") or {}).get("id")
            assert author_id == u["id"]
            assert p.get("video_url")
            assert "_id" not in p

    def test_cap_populate_count_by_library(self, api, founder_headers):
        """populate_count greater than library doesn't blow up; returns up to library size."""
        uniq = uuid.uuid4().hex[:4]
        r = api.post(f"{BASE_URL}/api/admin/curated-accounts", json={
            "display_name": f"TEST Cap {uniq}",
            "populate_count": 500,  # internal cap 50; library may be smaller
        }, headers=founder_headers)
        assert r.status_code == 200
        data = r.json()
        CREATED_UIDS.append(data["user"]["id"])
        lib = api.get(f"{BASE_URL}/api/admin/curated-clips", headers=founder_headers).json()
        assert data["reels_created"] <= min(50, len(lib))

    def test_unique_username_when_provided_and_taken(self, api, founder_headers):
        """Providing same username slug twice should auto-dedupe."""
        base = f"testcuru{uuid.uuid4().hex[:4]}"
        r1 = api.post(f"{BASE_URL}/api/admin/curated-accounts", json={
            "display_name": "A", "username": base, "populate_count": 0,
        }, headers=founder_headers)
        assert r1.status_code == 200
        u1 = r1.json()["user"]
        CREATED_UIDS.append(u1["id"])

        r2 = api.post(f"{BASE_URL}/api/admin/curated-accounts", json={
            "display_name": "B", "username": base, "populate_count": 0,
        }, headers=founder_headers)
        assert r2.status_code == 200
        u2 = r2.json()["user"]
        CREATED_UIDS.append(u2["id"])
        assert u1["username"] != u2["username"], "username should be deduped"


# --- POST /api/admin/accounts/{id}/reels: bulk add reels ---
class TestBulkAddReels:
    def test_404_on_missing_user(self, api, founder_headers):
        r = api.post(
            f"{BASE_URL}/api/admin/accounts/nonexistent-user-id/reels",
            json={"clips": [{"video_url": "https://x.test/x.mp4"}]},
            headers=founder_headers,
        )
        assert r.status_code == 404

    def test_non_admin_forbidden(self, api, non_admin_headers):
        r = api.post(
            f"{BASE_URL}/api/admin/accounts/anything/reels",
            json={"clips": []},
            headers=non_admin_headers,
        )
        assert r.status_code == 403

    def test_bulk_add_increments_posts_count(self, api, founder_headers):
        # Create a fresh curated account with 0 reels
        uniq = uuid.uuid4().hex[:4]
        cr = api.post(f"{BASE_URL}/api/admin/curated-accounts", json={
            "display_name": f"TEST Bulk {uniq}", "populate_count": 0,
        }, headers=founder_headers)
        assert cr.status_code == 200
        uid = cr.json()["user"]["id"]
        CREATED_UIDS.append(uid)

        before = api.get(f"{BASE_URL}/api/users/{uid}/reels").json()
        assert before == []

        payload = {"clips": [
            {"video_url": "https://res.cloudinary.com/demo/video/upload/dog.mp4", "caption": "TEST a"},
            {"video_url": "https://res.cloudinary.com/demo/video/upload/elephants.mp4", "caption": "TEST b"},
        ]}
        r = api.post(f"{BASE_URL}/api/admin/accounts/{uid}/reels", json=payload, headers=founder_headers)
        assert r.status_code == 200
        assert r.json()["created"] == 2

        after = api.get(f"{BASE_URL}/api/users/{uid}/reels").json()
        assert len(after) == 2

        # Check posts_count increment via public profile endpoint if available
        prof = api.get(f"{BASE_URL}/api/users/{uid}")
        if prof.status_code == 200:
            assert prof.json().get("posts_count", 0) >= 2


# --- cleanup ---
def test_zz_cleanup_curated(api, founder_headers):
    """Delete curated accounts + their reels we created."""
    # Try admin delete endpoint, fallback to direct user deletion if present
    for uid in CREATED_UIDS:
        # Delete reels first (if admin delete exists)
        reels = api.get(f"{BASE_URL}/api/users/{uid}/reels")
        if reels.status_code == 200:
            for p in reels.json():
                api.delete(f"{BASE_URL}/api/posts/{p['id']}", headers=founder_headers)
        # Delete the user
        api.delete(f"{BASE_URL}/api/admin/users/{uid}", headers=founder_headers)
    # best-effort; don't assert here
    assert True
