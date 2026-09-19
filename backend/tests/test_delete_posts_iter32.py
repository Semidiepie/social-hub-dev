"""Iteration 32: DELETE own posts/videos + ownership guard tests."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASS = "Semi123!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER_EMAIL, FOUNDER_PASS)


@pytest.fixture(scope="module")
def test_user():
    """Register a fresh test_* user (auto-purged on backend restart)."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_del_{suffix}@example.com"
    username = f"test_del_{suffix}"
    payload = {
        "email": email,
        "password": "TestPass123!",
        "username": username,
        "display_name": "Test Del User",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    uid = r.json()["user"]["id"]
    return {"email": email, "password": "TestPass123!", "token": tok, "id": uid, "username": username}


# ---- DELETE own text post ----
def test_delete_own_text_post(founder_token):
    """Owner can DELETE their own post; feed no longer contains it."""
    caption = f"TEST_iter32 delete-me {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/posts", json={"caption": caption}, headers=_headers(founder_token), timeout=15)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    post_id = r.json()["id"]

    # GET should work
    g = requests.get(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)
    assert g.status_code == 200
    assert g.json()["caption"] == caption

    # DELETE
    d = requests.delete(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)
    assert d.status_code == 200, f"Delete failed: {d.status_code} {d.text}"
    assert d.json().get("status") == "deleted"

    # GET should 404
    g2 = requests.get(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)
    assert g2.status_code == 404


# ---- Ownership guard: non-owner cannot delete ----
def test_non_owner_cannot_delete_post(founder_token, test_user):
    """DELETE /api/posts/:id by non-owner returns 403."""
    caption = f"TEST_iter32 owner-guard {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/posts", json={"caption": caption}, headers=_headers(founder_token), timeout=15)
    assert r.status_code in (200, 201)
    post_id = r.json()["id"]

    # test user tries to delete
    d = requests.delete(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(test_user["token"]), timeout=15)
    assert d.status_code == 403, f"Expected 403, got {d.status_code} {d.text}"

    # Post still exists
    g = requests.get(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)
    assert g.status_code == 200

    # cleanup
    requests.delete(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)


# ---- DELETE own video (owner) ----
def test_delete_own_video(founder_token):
    """Owner can DELETE their own video via /api/videos/:id."""
    payload = {
        "title": f"TEST_iter32 video {uuid.uuid4().hex[:6]}",
        "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/v1/sample.mp4",
        "duration": 5,
    }
    r = requests.post(f"{BASE_URL}/api/videos", json=payload, headers=_headers(founder_token), timeout=15)
    assert r.status_code in (200, 201), f"Create video failed: {r.status_code} {r.text}"
    video_id = r.json()["id"]

    d = requests.delete(f"{BASE_URL}/api/videos/{video_id}", headers=_headers(founder_token), timeout=15)
    assert d.status_code == 200, f"Delete video failed: {d.status_code} {d.text}"

    # subsequent DELETE returns 404
    d2 = requests.delete(f"{BASE_URL}/api/videos/{video_id}", headers=_headers(founder_token), timeout=15)
    assert d2.status_code == 404


# ---- Ownership guard on video ----
def test_non_owner_cannot_delete_video(founder_token, test_user):
    payload = {
        "title": f"TEST_iter32 owner-guard vid {uuid.uuid4().hex[:6]}",
        "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/v1/sample.mp4",
        "duration": 5,
    }
    r = requests.post(f"{BASE_URL}/api/videos", json=payload, headers=_headers(founder_token), timeout=15)
    assert r.status_code in (200, 201)
    vid = r.json()["id"]

    d = requests.delete(f"{BASE_URL}/api/videos/{vid}", headers=_headers(test_user["token"]), timeout=15)
    assert d.status_code == 403, f"Expected 403, got {d.status_code} {d.text}"

    # cleanup
    requests.delete(f"{BASE_URL}/api/videos/{vid}", headers=_headers(founder_token), timeout=15)


# ---- DELETE non-existent post ----
def test_delete_missing_post_returns_404(founder_token):
    d = requests.delete(f"{BASE_URL}/api/posts/does-not-exist-xyz", headers=_headers(founder_token), timeout=15)
    assert d.status_code == 404


# ---- Auth required ----
def test_delete_post_without_auth(founder_token):
    caption = f"TEST_iter32 no-auth {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/posts", json={"caption": caption}, headers=_headers(founder_token), timeout=15)
    post_id = r.json()["id"]

    d = requests.delete(f"{BASE_URL}/api/posts/{post_id}", timeout=15)
    assert d.status_code in (401, 403), f"Expected 401/403 without auth, got {d.status_code}"

    # cleanup
    requests.delete(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)


# ---- REGRESSION: text/photo post + like/comment still work ----
def test_regression_create_text_post_like_comment(founder_token):
    caption = f"TEST_iter32 regression-text {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE_URL}/api/posts", json={"caption": caption}, headers=_headers(founder_token), timeout=15)
    assert r.status_code in (200, 201)
    post_id = r.json()["id"]

    # like
    lk = requests.post(f"{BASE_URL}/api/posts/{post_id}/like", headers=_headers(founder_token), timeout=15)
    assert lk.status_code == 200

    # comment
    cm = requests.post(f"{BASE_URL}/api/posts/{post_id}/comments", json={"text": "hi"}, headers=_headers(founder_token), timeout=15)
    assert cm.status_code in (200, 201)

    # cleanup
    requests.delete(f"{BASE_URL}/api/posts/{post_id}", headers=_headers(founder_token), timeout=15)
