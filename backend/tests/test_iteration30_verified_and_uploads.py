"""Iteration 30: Verified badge API + composer video upload regression.

Focus:
- GET /api/users/{id} returns is_verified for founder (True) and a fresh test_ user (False).
- Composer video/image upload uses Cloudinary from the client — assert backend
  accepts posts with the returned secure_url (create_post video_url path).
- Regression: /videos endpoint still accepts a video created via the same helper.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


@pytest.fixture(scope="module")
def founder_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
    assert r.status_code == 200, f"founder login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def founder_user(founder_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {founder_token}"})
    assert r.status_code == 200
    u = r.json()
    return u


@pytest.fixture(scope="module")
def unverified_user():
    """Register a fresh test_ user (auto-purged on backend restart)."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_iter30_{suffix}@postmeplex.com",
        "username": f"test_iter30_{suffix}",
        "display_name": "Iter30 Tester",
        "password": "Test123!",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    return {"token": body["access_token"], "user": body["user"], "email": payload["email"]}


# --- is_verified on public user endpoint ---
class TestVerifiedBadgeAPI:
    def test_founder_is_verified_true(self, founder_user):
        r = requests.get(f"{BASE_URL}/api/users/{founder_user['id']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "is_verified" in body, "UserPublic must expose is_verified for the web BadgeCheck render"
        assert body["is_verified"] is True, f"founder must be verified, got: {body.get('is_verified')}"
        assert body["username"] == "semidiepie"

    def test_new_user_is_verified_false(self, unverified_user):
        r = requests.get(f"{BASE_URL}/api/users/{unverified_user['user']['id']}")
        assert r.status_code == 200
        body = r.json()
        assert "is_verified" in body
        assert body["is_verified"] is False, "fresh test user must not be verified"

    def test_auth_me_founder_verified(self, founder_token):
        # Confirm /auth/me (used by AuthContext to render self profile badge) is also verified
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {founder_token}"})
        assert r.status_code == 200
        assert r.json().get("is_verified") is True


# --- Composer video/image post creation (backend accepts payload) ---
CLOUDINARY_SAMPLE_VIDEO = "https://res.cloudinary.com/demo/video/upload/v1689940334/dog.mp4"
CLOUDINARY_SAMPLE_IMAGE = "https://res.cloudinary.com/demo/image/upload/sample.jpg"


class TestComposerBackendAccepts:
    def test_create_video_post(self, founder_token):
        r = requests.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={
                "caption": "TEST_iter30 composer video",
                "video_url": CLOUDINARY_SAMPLE_VIDEO,
                "thumbnail_url": CLOUDINARY_SAMPLE_VIDEO.replace(".mp4", ".jpg"),
                "duration": 12,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["video_url"].endswith("dog.mp4"), body["video_url"]
        assert body["caption"] == "TEST_iter30 composer video"
        assert body.get("author", {}).get("is_verified") is True

    def test_create_image_post(self, founder_token):
        r = requests.post(
            f"{BASE_URL}/api/posts",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"caption": "TEST_iter30 composer image", "image_url": CLOUDINARY_SAMPLE_IMAGE},
        )
        assert r.status_code == 200, r.text
        assert r.json()["image_url"] == CLOUDINARY_SAMPLE_IMAGE

    def test_create_video_regression(self, founder_token):
        # /videos endpoint (VideoUpload page) still works
        r = requests.post(
            f"{BASE_URL}/api/videos",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={
                "title": "TEST_iter30 regression",
                "description": "small video via VideoUpload",
                "video_url": CLOUDINARY_SAMPLE_VIDEO,
                "thumbnail_url": None,
                "visibility": "public",
                "tags": ["test"],
                "category": "Testing",
            },
        )
        assert r.status_code in (200, 201), r.text
        assert r.json()["title"] == "TEST_iter30 regression"


# --- Cloudinary unsigned preset sanity check (single-shot path used for small files) ---
class TestCloudinaryUnsignedPreset:
    def test_single_shot_image_works(self):
        """Directly exercise the same POST the frontend does for small files."""
        cloud = os.environ.get("REACT_APP_CLOUDINARY_CLOUD_NAME", "dpnrol54k")
        preset = os.environ.get("REACT_APP_CLOUDINARY_UPLOAD_PRESET", "ml_default")
        url = f"https://api.cloudinary.com/v1_1/{cloud}/image/upload"
        # 1x1 png bytes (transparent)
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
            b"\xc0\x00\x00\x00\x03\x00\x01)\xf9\x02H\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        r = requests.post(
            url,
            files={"file": ("t.png", png_bytes, "image/png")},
            data={"upload_preset": preset},
            timeout=30,
        )
        assert r.status_code == 200, f"cloudinary single-shot failed: {r.status_code} {r.text[:400]}"
        assert "secure_url" in r.json()
