"""Iteration 26 — Home feed now merges public videos with posts.

Verifies:
  * GET /api/feed returns items with type in {"post","video"}
  * items sorted by created_at DESC
  * public videos are present; private/unlisted are NOT
  * video items carry the extra fields the UI needs (thumbnail_url, title, views)
  * blocked authors are excluded
"""
from __future__ import annotations

import os
import time
import uuid
import requests
import pytest
from pathlib import Path

def _load_env(path: str):
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

FOUNDER = {"email": "semidiepie@gmail.com", "password": "Semi123!"}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register(username_prefix: str = "tf26"):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": email,
        "password": "TestPass123!",
        "username": f"{username_prefix}{uuid.uuid4().hex[:6]}",
        "display_name": "Feed26 Tester",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"], r.json()["user"], payload


def _create_video(token: str, title: str, visibility: str = "public") -> dict:
    body = {
        "title": title,
        "description": "iter26 auto",
        "video_url": "https://res.cloudinary.com/dpnrol54k/video/upload/v1/sample.mp4",
        "thumbnail_url": "https://res.cloudinary.com/dpnrol54k/image/upload/v1/sample.jpg",
        "duration": 42,
        "visibility": visibility,
        "category": "gaming",
        "tags": ["iter26"],
    }
    r = requests.post(
        f"{API}/videos",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def founder_token():
    return _login(**FOUNDER)


def test_feed_returns_mixed_types_sorted(founder_token):
    r = requests.get(f"{API}/feed", headers={"Authorization": f"Bearer {founder_token}"}, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    assert len(items) > 0, "expected at least one item for founder"

    types = {i.get("type") for i in items}
    assert "video" in types, f"expected at least one video in feed, got types={types}"

    # sort order: strictly non-increasing on created_at
    ts = [i["created_at"] for i in items]
    assert ts == sorted(ts, reverse=True), "feed must be newest-first"

    # video items must expose watch-card fields
    for v in items:
        if v.get("type") == "video":
            assert "id" in v and v["id"]
            assert "thumbnail_url" in v
            assert "views" in v
            assert "likes" in v
            assert "comments_count" in v
            assert "author" in v and v["author"]
            # no image_url for a video card
            assert v.get("image_url") in (None, "")


def test_private_and_unlisted_videos_excluded(founder_token):
    """Create a fresh test_* user with a private + unlisted + public video and confirm
    only the public one appears in the anon feed."""
    token, user, _ = _register()
    public = _create_video(token, "test_ iter26 public", visibility="public")
    private = _create_video(token, "test_ iter26 private", visibility="private")
    unlisted = _create_video(token, "test_ iter26 unlisted", visibility="unlisted")

    time.sleep(0.5)
    r = requests.get(f"{API}/feed", timeout=30)  # anon
    assert r.status_code == 200
    items = r.json()
    ids = {i["id"] for i in items}
    assert public["id"] in ids, "public video should be in feed"
    assert private["id"] not in ids, "private video must NOT be in feed"
    assert unlisted["id"] not in ids, "unlisted video must NOT be in feed"


def test_blocked_author_videos_excluded():
    """Viewer blocks author -> author's public video disappears from the viewer's feed."""
    author_tok, author_user, _ = _register("tf26a")
    viewer_tok, viewer_user, _ = _register("tf26v")

    vid = _create_video(author_tok, "test_ iter26 block-hidden", visibility="public")
    time.sleep(0.3)

    # baseline: viewer sees it
    r = requests.get(f"{API}/feed", headers={"Authorization": f"Bearer {viewer_tok}"}, timeout=30)
    assert r.status_code == 200
    assert vid["id"] in {i["id"] for i in r.json()}

    # block author
    rb = requests.post(
        f"{API}/users/{author_user['id']}/block",
        headers={"Authorization": f"Bearer {viewer_tok}"},
        timeout=30,
    )
    assert rb.status_code in (200, 201, 204), rb.text

    r2 = requests.get(f"{API}/feed", headers={"Authorization": f"Bearer {viewer_tok}"}, timeout=30)
    assert r2.status_code == 200
    assert vid["id"] not in {i["id"] for i in r2.json()}, "blocked author's video must be filtered"


def test_founder_password_preserved():
    """Sanity: ensure earlier tests did not change founder credentials."""
    tok = _login(**FOUNDER)
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == FOUNDER["email"]
