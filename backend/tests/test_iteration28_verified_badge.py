"""
Iteration 28 — Verified-badge in comments (reel + video)
Backend contract checks:
  - Founder POST /api/auth/login returns access_token + is_verified=true
  - GET /api/posts/{id}/comments returns FLAT is_verified per row (and backfills)
  - POST /api/posts/{id}/comments returns a full flat comment incl. is_verified
  - Non-verified (fresh test_* user) rows carry is_verified=false
  - GET /api/videos/{id}/comments returns nested author.is_verified
"""
import os
import uuid
import time
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
FOUNDER = {"email": "semidiepie@gmail.com", "password": "Semi123!"}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_founder_login_is_verified():
    data = _login(**FOUNDER)
    assert data["user"]["is_verified"] is True
    assert data.get("access_token")


def test_get_reel_comments_have_flat_is_verified():
    """The founder has at least one reel with comments; each comment row must have flat is_verified."""
    tok = _login(**FOUNDER)["access_token"]
    reels = requests.get(f"{BASE_URL}/api/reels", headers=_hdr(tok), timeout=15).json()
    assert isinstance(reels, list) and len(reels) > 0, "expected at least one reel"
    # pick the first reel that already has comments
    target = None
    for r in reels[:20]:
        c = requests.get(f"{BASE_URL}/api/posts/{r['id']}/comments", timeout=15).json()
        if isinstance(c, list) and len(c) > 0:
            target = (r, c)
            break
    assert target is not None, "no reel with pre-existing comments found"
    reel, comments = target
    for row in comments:
        assert "is_verified" in row, f"comment {row.get('id')} missing flat is_verified"
        assert isinstance(row["is_verified"], bool)
        # flat rows also expose these
        for k in ("username", "display_name", "avatar_url", "text", "created_at", "id"):
            assert k in row, f"missing {k} in flat comment"
    # at least one row (from the verified founder) should be True
    assert any(c["is_verified"] for c in comments), "expected at least one verified comment on founder reel"


def test_post_reel_comment_founder_returns_verified_true():
    tok = _login(**FOUNDER)["access_token"]
    reels = requests.get(f"{BASE_URL}/api/reels", headers=_hdr(tok), timeout=15).json()
    reel = reels[0]
    body = {"text": f"TEST_iter28 verified badge check {uuid.uuid4().hex[:6]}"}
    r = requests.post(f"{BASE_URL}/api/posts/{reel['id']}/comments", headers=_hdr(tok), json=body, timeout=15)
    assert r.status_code in (200, 201), r.text
    c = r.json()
    assert c["is_verified"] is True, f"founder comment should be verified: {c}"
    assert c["text"] == body["text"]
    assert c["username"] == "semidiepie"
    # persistence — GET should also carry is_verified=true for this new row
    listing = requests.get(f"{BASE_URL}/api/posts/{reel['id']}/comments", timeout=15).json()
    found = [x for x in listing if x["id"] == c["id"]]
    assert found and found[0]["is_verified"] is True


def test_post_reel_comment_fresh_user_returns_verified_false():
    # register a throwaway user (auto-purged via test_* prefix)
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"test_iter28_{suffix}@example.com",
        "username": f"test_iter28_{suffix}",
        "display_name": "Iter28 Non-verified",
        "password": "TestPass123!",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    reg = r.json()
    tok = reg["access_token"]
    assert reg["user"]["is_verified"] is False
    # get a reel to comment on
    reels = requests.get(f"{BASE_URL}/api/reels", headers=_hdr(tok), timeout=15).json()
    reel = reels[0]
    body = {"text": f"TEST_iter28 non-verified {suffix}"}
    r = requests.post(f"{BASE_URL}/api/posts/{reel['id']}/comments", headers=_hdr(tok), json=body, timeout=15)
    assert r.status_code in (200, 201), r.text
    c = r.json()
    assert c["is_verified"] is False, f"fresh test user must be non-verified: {c}"
    # confirm GET agrees
    listing = requests.get(f"{BASE_URL}/api/posts/{reel['id']}/comments", timeout=15).json()
    found = [x for x in listing if x["id"] == c["id"]]
    assert found and found[0]["is_verified"] is False


def test_get_video_comments_have_nested_author_is_verified():
    tok = _login(**FOUNDER)["access_token"]
    videos = requests.get(f"{BASE_URL}/api/videos", headers=_hdr(tok), timeout=15).json()
    if not isinstance(videos, list) or not videos:
        # nothing to test if there are no videos; not fatal
        import pytest
        pytest.skip("no videos in the system to test")
    # find one video with comments (creating if needed)
    target = None
    for v in videos[:10]:
        cs = requests.get(f"{BASE_URL}/api/videos/{v['id']}/comments", timeout=15).json()
        if cs:
            target = (v, cs)
            break
    if target is None:
        # post one to make the test meaningful
        v = videos[0]
        r = requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/comments",
            headers=_hdr(tok),
            json={"text": f"TEST_iter28 video verified {uuid.uuid4().hex[:6]}"},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        cs = requests.get(f"{BASE_URL}/api/videos/{v['id']}/comments", timeout=15).json()
        target = (v, cs)
    _, comments = target
    assert comments, "video should have at least one comment now"
    for row in comments:
        assert "author" in row and isinstance(row["author"], dict), f"video comment missing nested author: {row}"
        assert "is_verified" in row["author"]
        assert isinstance(row["author"]["is_verified"], bool)
    # founder's comment (if present) should be verified
    founder_rows = [c for c in comments if c["author"] and c["author"]["username"] == "semidiepie"]
    if founder_rows:
        assert founder_rows[0]["author"]["is_verified"] is True
