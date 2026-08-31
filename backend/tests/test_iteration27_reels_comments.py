"""
Iteration 27: reel comment posting + Discover 'Top' feed contains reels
Focus: /api/posts/{id}/comments (POST/GET), /api/posts/{id} single, /api/discover?filter=top
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "access_token" in d
    return d["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def reel_id(auth_headers):
    # Grab the first reel from /api/reels (founder has several)
    r = requests.get(f"{API}/reels", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    reels = r.json()
    assert isinstance(reels, list) and len(reels) > 0, "no reels seeded — founder has none"
    return reels[0]["id"]


# GET single reel returns type=reel with video_url + comments_count
def test_get_single_reel_shape(auth_headers, reel_id):
    r = requests.get(f"{API}/posts/{reel_id}", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"] == reel_id
    assert data.get("type") == "reel"
    assert "video_url" in data and data["video_url"], "reel must have video_url"
    assert "comments_count" in data and isinstance(data["comments_count"], int)
    assert "likes" in data


# POST comment on reel — persists and appears in GET, count increments on the post row
def test_post_and_get_comment_on_reel(auth_headers, reel_id):
    # baseline count
    before = requests.get(f"{API}/posts/{reel_id}", headers=auth_headers, timeout=15).json()
    base_count = before["comments_count"]

    body = {"text": "TEST_iter27 reel comment"}
    r = requests.post(f"{API}/posts/{reel_id}/comments", headers=auth_headers, json=body, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created.get("text") == body["text"]
    assert "id" in created

    # comment appears in list
    rows = requests.get(f"{API}/posts/{reel_id}/comments", headers=auth_headers, timeout=15).json()
    assert any(c["id"] == created["id"] and c["text"] == body["text"] for c in rows)

    # count incremented on post
    after = requests.get(f"{API}/posts/{reel_id}", headers=auth_headers, timeout=15).json()
    assert after["comments_count"] == base_count + 1


# Like / unlike on reel still works (regression)
def test_like_unlike_reel(auth_headers, reel_id):
    # normalize: unlike first if already liked
    cur = requests.get(f"{API}/posts/{reel_id}", headers=auth_headers, timeout=15).json()
    if cur.get("liked_by_me"):
        requests.delete(f"{API}/posts/{reel_id}/like", headers=auth_headers, timeout=15)

    base = requests.get(f"{API}/posts/{reel_id}", headers=auth_headers, timeout=15).json()["likes"]

    r = requests.post(f"{API}/posts/{reel_id}/like", headers=auth_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    assert r.json().get("likes") == base + 1

    r2 = requests.delete(f"{API}/posts/{reel_id}/like", headers=auth_headers, timeout=15)
    assert r2.status_code in (200, 204), r2.text
    if r2.status_code == 200:
        assert r2.json().get("likes") == base


# /api/discover?filter=top returns items with type field so FE can route reels to /reels/:id
def test_discover_top_contains_reel_with_type(auth_headers):
    r = requests.get(f"{API}/discover?filter=top", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("type") == "top"
    items = d.get("items", [])
    assert isinstance(items, list) and len(items) > 0
    # every top item must expose a discriminator so FE can route
    for it in items:
        assert "type" in it, f"item missing type field: {it}"
        assert "id" in it
    types = {it["type"] for it in items}
    # founder has reels — at least one must be reel type
    assert "reel" in types, f"expected at least one reel in Top; saw types={types}"
