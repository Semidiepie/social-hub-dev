"""Iteration 29: WEB Home composer + PostDetail backend coverage.

Covers:
  - POST /api/posts accepts caption-only, image_url-only and video_url payloads
  - Serialized post exposes video_url / thumbnail_url / duration
  - GET /api/posts/{id} returns the same shape (post detail page uses this)
  - Like toggle and comments endpoints (used by PostDetail) round-trip
  - Founder is marked is_verified on the comment payload (badge)
"""
import os
import time
import uuid
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_founder_login_and_me_verified():
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    me = requests.get(f"{API}/auth/me", headers=_auth(token), timeout=10)
    assert me.status_code == 200
    data = me.json()
    assert data["email"] == FOUNDER_EMAIL
    assert data.get("is_verified") is True


def test_create_text_only_post_then_get():
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    caption = f"TEST_iter29 text-only {uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/posts", headers=_auth(token), json={"caption": caption}, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["caption"] == caption
    assert p["image_url"] is None
    assert p["video_url"] is None
    assert p["likes"] == 0
    assert p["comments_count"] == 0
    assert "id" in p

    got = requests.get(f"{API}/posts/{p['id']}", headers=_auth(token), timeout=10)
    assert got.status_code == 200
    g = got.json()
    assert g["id"] == p["id"]
    assert g["caption"] == caption


def test_create_image_only_post_regression():
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    img = "https://res.cloudinary.com/demo/image/upload/sample.jpg"
    r = requests.post(
        f"{API}/posts",
        headers=_auth(token),
        json={"caption": "TEST_iter29 image only", "image_url": img},
        timeout=15,
    )
    assert r.status_code == 200
    p = r.json()
    assert p["image_url"] == img
    assert p["video_url"] is None


def test_create_video_post_and_detail_shape():
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    body = {
        "caption": f"TEST_iter29 video {uuid.uuid4().hex[:8]}",
        "video_url": "https://res.cloudinary.com/demo/video/upload/dog.mp4",
        "thumbnail_url": "https://res.cloudinary.com/demo/video/upload/dog.jpg",
        "duration": 12.5,
        "game_tag": "iter29",
    }
    r = requests.post(f"{API}/posts", headers=_auth(token), json=body, timeout=15)
    assert r.status_code == 200, r.text
    p = r.json()
    # Backend rewrites cloudinary video URLs to inject H.264 transforms, so
    # match the tail (public_id) rather than the raw URL.
    assert p["video_url"] and p["video_url"].endswith("/dog.mp4")
    assert p["thumbnail_url"] == body["thumbnail_url"]
    assert p["duration"] == body["duration"]
    assert p["image_url"] is None
    assert p["game_tag"] == "iter29"

    # Post detail endpoint (used by /posts/:id page)
    got = requests.get(f"{API}/posts/{p['id']}", timeout=10)
    assert got.status_code == 200
    g = got.json()
    assert g["video_url"] == p["video_url"]
    assert g["thumbnail_url"] == body["thumbnail_url"]
    # author info
    assert g["author"]["username"] == "semidiepie"


def test_post_appears_in_feed_top():
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    caption = f"TEST_iter29 feed-top {uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/posts", headers=_auth(token), json={"caption": caption}, timeout=15)
    assert r.status_code == 200
    new_id = r.json()["id"]

    time.sleep(0.5)
    feed = requests.get(f"{API}/feed", headers=_auth(token), timeout=15)
    assert feed.status_code == 200
    rows = feed.json()
    ids = [row["id"] for row in rows if row.get("type") == "post"]
    assert new_id in ids, f"newly created post not in feed; first 5 post ids: {ids[:5]}"


def test_post_detail_like_and_comment_flow():
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    # create a fresh post to run like/comment against
    r = requests.post(
        f"{API}/posts",
        headers=_auth(token),
        json={"caption": f"TEST_iter29 detail-flow {uuid.uuid4().hex[:8]}"},
        timeout=15,
    )
    assert r.status_code == 200
    post_id = r.json()["id"]

    # like
    like = requests.post(f"{API}/posts/{post_id}/like", headers=_auth(token), timeout=10)
    assert like.status_code == 200
    assert like.json().get("likes", 0) >= 1

    got = requests.get(f"{API}/posts/{post_id}", headers=_auth(token), timeout=10)
    assert got.json()["liked_by_me"] is True

    # unlike
    unlike = requests.delete(f"{API}/posts/{post_id}/like", headers=_auth(token), timeout=10)
    assert unlike.status_code == 200

    # comment
    text = f"TEST_iter29 hello {uuid.uuid4().hex[:6]}"
    c = requests.post(
        f"{API}/posts/{post_id}/comments",
        headers=_auth(token),
        json={"text": text},
        timeout=10,
    )
    assert c.status_code == 200, c.text
    # list comments and verify verified badge shape for founder
    lst = requests.get(f"{API}/posts/{post_id}/comments", timeout=10)
    assert lst.status_code == 200
    rows = lst.json()
    assert len(rows) >= 1
    mine = [row for row in rows if row.get("text") == text]
    assert mine, "just-posted comment not returned"
    row = mine[0]
    # backend may expose flat or nested is_verified — accept either
    is_verified = row.get("is_verified") or (row.get("author") or {}).get("is_verified")
    assert is_verified is True, f"founder comment should be verified, got row: {row}"


def test_founder_password_unchanged_at_end():
    # Sanity: make sure we didn't mutate the password during this run
    token = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
    assert isinstance(token, str) and len(token) > 20
