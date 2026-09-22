"""Iteration 34 — Edit + Delete for posts, reels, videos (owner-only)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://social-hub-dev-4.preview.emergentagent.com",
).rstrip("/")

FOUNDER = {"email": "semidiepie@gmail.com", "password": "Semi123!"}


# ---------- helpers ----------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _register(prefix: str = "tec_"):
    u = f"{prefix}i34_{uuid.uuid4().hex[:8]}"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": f"{u}@example.com",
            "username": u,
            "password": "TestPass123!",
            "display_name": "Iter34 Bystander",
            "pin": "1234",
        },
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- session fixtures ----------
@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER["email"], FOUNDER["password"])


@pytest.fixture(scope="module")
def bystander_token():
    tok, _ = _register()
    return tok


# ---------- POST edit/delete ----------
class TestPostEdit:
    """PUT /api/posts/{id} owner-only edit"""

    def test_post_edit_by_owner_then_reload(self, founder_token):
        created = requests.post(
            f"{BASE_URL}/api/posts",
            headers=_auth(founder_token),
            json={"type": "post", "caption": "TEST_iter34 original", "game_tag": "Valorant"},
        )
        assert created.status_code in (200, 201), created.text
        pid = created.json()["id"]

        r = requests.put(
            f"{BASE_URL}/api/posts/{pid}",
            headers=_auth(founder_token),
            json={"caption": "TEST_iter34 edited", "game_tag": "Fortnite"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["caption"] == "TEST_iter34 edited"
        assert data["game_tag"] == "Fortnite"

        # reload via GET
        g = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))
        assert g.status_code == 200
        assert g.json()["caption"] == "TEST_iter34 edited"
        assert g.json()["game_tag"] == "Fortnite"

        # cleanup
        requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))

    def test_post_edit_non_owner_forbidden(self, founder_token, bystander_token):
        created = requests.post(
            f"{BASE_URL}/api/posts",
            headers=_auth(founder_token),
            json={"type": "post", "caption": "TEST_iter34 owner-only"},
        )
        pid = created.json()["id"]

        r = requests.put(
            f"{BASE_URL}/api/posts/{pid}",
            headers=_auth(bystander_token),
            json={"caption": "hax"},
        )
        assert r.status_code == 403, r.text

        # verify unchanged
        g = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))
        assert g.json()["caption"] == "TEST_iter34 owner-only"

        requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))

    def test_post_edit_unauth_401(self, founder_token):
        created = requests.post(
            f"{BASE_URL}/api/posts",
            headers=_auth(founder_token),
            json={"type": "post", "caption": "TEST_iter34 unauth"},
        )
        pid = created.json()["id"]

        r = requests.put(f"{BASE_URL}/api/posts/{pid}", json={"caption": "nope"})
        assert r.status_code in (401, 403), r.text

        requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))

    def test_post_edit_unknown_id_404(self, founder_token):
        r = requests.put(
            f"{BASE_URL}/api/posts/does-not-exist-{uuid.uuid4().hex}",
            headers=_auth(founder_token),
            json={"caption": "x"},
        )
        assert r.status_code == 404


# ---------- REEL edit (also PUT /api/posts/{id}) ----------
class TestReelEdit:
    def test_reel_edit_caption_and_game_tag(self, founder_token):
        created = requests.post(
            f"{BASE_URL}/api/reels",
            headers=_auth(founder_token),
            json={
                "caption": "TEST_iter34 reel orig",
                "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/sample.mp4",
                "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/sample.jpg",
                "game_tag": "Apex",
                "duration": 15,
            },
        )
        assert created.status_code in (200, 201), created.text
        rid = created.json()["id"]

        r = requests.put(
            f"{BASE_URL}/api/posts/{rid}",
            headers=_auth(founder_token),
            json={"caption": "TEST_iter34 reel edited", "game_tag": "Warzone"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["caption"] == "TEST_iter34 reel edited"
        assert r.json()["game_tag"] == "Warzone"

        requests.delete(f"{BASE_URL}/api/posts/{rid}", headers=_auth(founder_token))

    def test_reel_edit_non_owner_403(self, founder_token, bystander_token):
        created = requests.post(
            f"{BASE_URL}/api/reels",
            headers=_auth(founder_token),
            json={
                "caption": "TEST_iter34 reel own",
                "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/sample.mp4",
                "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/sample.jpg",
                "duration": 10,
            },
        )
        rid = created.json()["id"]

        r = requests.put(
            f"{BASE_URL}/api/posts/{rid}",
            headers=_auth(bystander_token),
            json={"caption": "hax"},
        )
        assert r.status_code == 403

        requests.delete(f"{BASE_URL}/api/posts/{rid}", headers=_auth(founder_token))


# ---------- VIDEO edit/delete regression ----------
class TestVideoEdit:
    def _create(self, tok):
        r = requests.post(
            f"{BASE_URL}/api/videos",
            headers=_auth(tok),
            json={
                "title": "TEST_iter34 video",
                "description": "orig desc",
                "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/sample.mp4",
                "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/sample.jpg",
                "duration": 30,
                "visibility": "public",
                "tags": ["orig"],
                "category": "Gaming",
            },
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_video_full_edit_by_owner(self, founder_token):
        vid = self._create(founder_token)
        r = requests.put(
            f"{BASE_URL}/api/videos/{vid}",
            headers=_auth(founder_token),
            json={
                "title": "TEST_iter34 edited title",
                "description": "edited desc",
                "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/thumb-new.jpg",
                "visibility": "unlisted",
                "category": "IRL",
                "tags": ["a", "b", "c"],
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == "TEST_iter34 edited title"
        assert data["description"] == "edited desc"
        assert data["thumbnail_url"] == "https://res.cloudinary.com/dpnrol54k/image/upload/thumb-new.jpg"
        assert data["visibility"] == "unlisted"
        assert data["category"] == "IRL"
        assert set(data["tags"]) == {"a", "b", "c"}

        # verify persistence
        g = requests.get(f"{BASE_URL}/api/videos/{vid}", headers=_auth(founder_token))
        assert g.status_code == 200
        assert g.json()["title"] == "TEST_iter34 edited title"
        assert g.json()["thumbnail_url"].endswith("thumb-new.jpg")

        requests.delete(f"{BASE_URL}/api/videos/{vid}", headers=_auth(founder_token))

    def test_video_edit_non_owner_403(self, founder_token, bystander_token):
        vid = self._create(founder_token)
        r = requests.put(
            f"{BASE_URL}/api/videos/{vid}",
            headers=_auth(bystander_token),
            json={"title": "hax"},
        )
        assert r.status_code == 403
        requests.delete(f"{BASE_URL}/api/videos/{vid}", headers=_auth(founder_token))


# ---------- DELETE parity ----------
class TestDeleteParity:
    def test_delete_post_owner_and_404_after(self, founder_token):
        created = requests.post(
            f"{BASE_URL}/api/posts",
            headers=_auth(founder_token),
            json={"type": "post", "caption": "TEST_iter34 delete-me"},
        )
        pid = created.json()["id"]
        r = requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_auth(founder_token))
        assert g.status_code == 404

    def test_delete_reel_non_owner_403(self, founder_token, bystander_token):
        created = requests.post(
            f"{BASE_URL}/api/reels",
            headers=_auth(founder_token),
            json={
                "caption": "TEST_iter34 reel no-delete",
                "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/sample.mp4",
                "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/sample.jpg",
                "duration": 8,
            },
        )
        rid = created.json()["id"]
        r = requests.delete(f"{BASE_URL}/api/posts/{rid}", headers=_auth(bystander_token))
        assert r.status_code == 403
        # cleanup
        requests.delete(f"{BASE_URL}/api/posts/{rid}", headers=_auth(founder_token))

    def test_delete_video_owner_and_re_404(self, founder_token):
        r = requests.post(
            f"{BASE_URL}/api/videos",
            headers=_auth(founder_token),
            json={
                "title": "TEST_iter34 video-delete",
                "description": "",
                "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/sample.mp4",
                "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/sample.jpg",
                "duration": 20,
                "visibility": "public",
                "tags": [],
            },
        )
        vid = r.json()["id"]
        d1 = requests.delete(f"{BASE_URL}/api/videos/{vid}", headers=_auth(founder_token))
        assert d1.status_code == 200
        d2 = requests.delete(f"{BASE_URL}/api/videos/{vid}", headers=_auth(founder_token))
        assert d2.status_code == 404
