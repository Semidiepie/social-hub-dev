"""Iteration 8 backend verification for the Reels page bug fix.

Per review request:
- GET /api/reels returns the seeded reel (semidiepie) with valid metadata.
- Video URL is reachable (HEAD 200).
- Founder login → like / unlike / comment / list-comments on that reel work.
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
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def reel(client):
    r = client.get(f"{BASE_URL}/api/reels")
    assert r.status_code == 200, f"reels list failed: {r.status_code} {r.text}"
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1, "expected at least the 1 seeded reel"
    return body[0]


# ---------- 1. GET /api/reels returns the seeded reel with valid metadata ----------

class TestReelsList:
    def test_reel_shape(self, reel):
        for key in ("id", "type", "video_url", "author", "likes", "comments_count"):
            assert key in reel, f"missing '{key}' in reel: {reel}"
        assert reel["type"] == "reel"
        assert reel["video_url"], "video_url must be non-empty"
        assert reel["video_url"].startswith("https://"), reel["video_url"]

    def test_reel_author_is_founder(self, reel):
        author = reel.get("author") or {}
        assert author.get("id"), "author.id must be non-null"
        assert author.get("username") == "semidiepie"

    def test_video_url_reachable(self, reel):
        head = requests.head(reel["video_url"], allow_redirects=True, timeout=15)
        assert head.status_code == 200, f"video HEAD {head.status_code}"
        ctype = head.headers.get("content-type", "")
        assert "video" in ctype, f"unexpected content-type: {ctype}"


# ---------- 2. Like / unlike / comment on the reel ----------

class TestReelInteractions:
    def test_like_flow(self, client, founder_token, reel):
        rid = reel["id"]
        headers = {"Authorization": f"Bearer {founder_token}"}

        # Read current likes with AUTH so we know founder's real liked_by_me state
        before = client.get(f"{BASE_URL}/api/reels", headers=headers).json()
        target = next(r for r in before if r["id"] == rid)
        base_likes = target["likes"]
        was_liked = target.get("liked_by_me", False)

        # Normalise: ensure founder starts in the UNLIKED state
        if was_liked:
            client.delete(f"{BASE_URL}/api/posts/{rid}/like", headers=headers)
            base_likes -= 1

        # POST like → 200
        r_like = client.post(f"{BASE_URL}/api/posts/{rid}/like", headers=headers)
        assert r_like.status_code in (200, 201), f"like failed: {r_like.status_code} {r_like.text}"

        after_like = next(
            r for r in client.get(f"{BASE_URL}/api/reels", headers=headers).json() if r["id"] == rid
        )
        assert after_like["likes"] == base_likes + 1, (
            f"likes did not increment: {base_likes} -> {after_like['likes']}"
        )
        assert after_like["liked_by_me"] is True

        # DELETE like → 200
        r_unlike = client.delete(f"{BASE_URL}/api/posts/{rid}/like", headers=headers)
        assert r_unlike.status_code in (200, 204), (
            f"unlike failed: {r_unlike.status_code} {r_unlike.text}"
        )

        after_unlike = next(
            r for r in client.get(f"{BASE_URL}/api/reels", headers=headers).json() if r["id"] == rid
        )
        assert after_unlike["likes"] == base_likes, (
            f"likes did not decrement: {base_likes+1} -> {after_unlike['likes']}"
        )
        assert after_unlike["liked_by_me"] is False

    def test_comment_create_and_list(self, client, founder_token, reel):
        rid = reel["id"]
        headers = {"Authorization": f"Bearer {founder_token}"}

        # POST comment → 200 or 201
        r_c = client.post(
            f"{BASE_URL}/api/posts/{rid}/comments",
            headers=headers,
            json={"text": "TEST_iter8 reels bugfix verification"},
        )
        assert r_c.status_code in (200, 201), (
            f"comment create failed: {r_c.status_code} {r_c.text}"
        )
        created = r_c.json()
        assert isinstance(created, dict)
        assert created.get("text") == "TEST_iter8 reels bugfix verification" or "id" in created

        # GET comments → 200 and array containing our new comment
        r_list = client.get(f"{BASE_URL}/api/posts/{rid}/comments", headers=headers)
        assert r_list.status_code == 200, f"comments list failed: {r_list.status_code} {r_list.text}"
        arr = r_list.json()
        assert isinstance(arr, list), f"expected array, got: {type(arr)}"
        assert any(
            c.get("text") == "TEST_iter8 reels bugfix verification" for c in arr
        ), f"our comment not found in list: {arr}"


# ---------- 3. Static bundler check ----------

class TestExpoBundler:
    def test_expo_root_serves_html(self):
        r = requests.get("http://localhost:3000", timeout=15)
        assert r.status_code == 200
        assert "PostMePlex" in r.text or "<html" in r.text.lower()
