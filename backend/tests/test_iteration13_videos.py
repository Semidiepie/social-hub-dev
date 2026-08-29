"""
Iteration 13 — YouTube-style "Watch" tab / Video endpoints.

Tests 12 new video endpoints + Cloudinary H.264 compat + blocked-author
filtering + reels backward compat.

Cleanup contract:
- Every test video is deleted via DELETE /api/videos/{id}.
- The auxiliary user is created with tpb_ prefix so backend auto-purge nukes
  it on next restart anyway.
- Founder password is restored to Semi123! if changed (it isn't in this suite,
  but included defensively).
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com"
).rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PW = "Semi123!"

SAMPLE_VIDEO_URL = (
    "https://res.cloudinary.com/demo/video/upload/v1/samples/sea-turtle.mp4"
)


# --- helpers ---
def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _login(email, pw):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": pw},
        timeout=30,
    )
    assert r.status_code == 200, f"login({email}) failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# --- session fixtures ---
@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER_EMAIL, FOUNDER_PW)


@pytest.fixture(scope="module")
def founder_id(founder_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(founder_token))
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def secondary_user():
    """A tpb_ prefixed disposable user for owner-mismatch + block tests."""
    suffix = uuid.uuid4().hex[:8]
    email = f"tpb_video_{suffix}@example.com"
    username = f"tpb_video_{suffix}"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "TestPw123!",
            "display_name": "TPB Video User",
        },
        timeout=30,
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or _login(email, "TestPw123!")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok)).json()
    return {"token": tok, "id": me["id"], "email": email, "username": username}


# Container for created video IDs so we can clean up in one place.
_created_videos: list[tuple[str, str]] = []  # (id, owner_token)


@pytest.fixture(scope="module", autouse=True)
def _cleanup_videos(founder_token):
    yield
    # Attempt delete with each owner token first, then founder as super admin.
    for vid, tok in _created_videos:
        for candidate in (tok, founder_token):
            try:
                r = requests.delete(
                    f"{BASE_URL}/api/videos/{vid}", headers=_headers(candidate), timeout=15
                )
                if r.status_code in (200, 404):
                    break
            except Exception:
                pass


def _create_video(tok, **overrides):
    payload = {
        "title": overrides.get("title", f"TEST_video_{uuid.uuid4().hex[:6]}"),
        "description": overrides.get("description", "TEST description"),
        "video_url": overrides.get("video_url", SAMPLE_VIDEO_URL),
        "duration": overrides.get("duration", 12.5),
        "category": overrides.get("category", "Gaming"),
        "tags": overrides.get("tags", ["test", "gaming"]),
        "visibility": overrides.get("visibility", "public"),
    }
    if "thumbnail_url" in overrides:
        payload["thumbnail_url"] = overrides["thumbnail_url"]
    r = requests.post(f"{BASE_URL}/api/videos", json=payload, headers=_headers(tok), timeout=30)
    assert r.status_code == 201, f"create failed: {r.status_code} {r.text}"
    v = r.json()
    _created_videos.append((v["id"], tok))
    return v


# ============================================================
# Feature 1: list & create
# ============================================================
class TestListAndCreate:
    def test_01_list_unauth(self):
        # Snapshot: whatever exists before we start. Endpoint must return 200 array.
        r = requests.get(f"{BASE_URL}/api/videos", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_02_create_video_shape(self, founder_token):
        v = _create_video(
            founder_token,
            title="TEST_shape_check",
            description="verifying schema",
            category="Gaming",
            tags=["test", "gaming"],
        )
        assert "id" in v
        assert v["views"] == 0
        assert v["likes"] == 0
        assert v["comments_count"] == 0
        assert v["visibility"] == "public"
        assert v["category"] == "Gaming"
        assert "test" in v["tags"] and "gaming" in v["tags"]
        # Cloudinary compat: video_url must include f_mp4,vc_h264 when it's a
        # cloudinary url with an /upload/ segment.
        assert "f_mp4" in v["video_url"] and "vc_h264" in v["video_url"], v["video_url"]
        # Author block present
        assert v["author"] and v["author"]["username"] == "semidiepie"

    def test_03_get_video_public(self, founder_token):
        v = _create_video(founder_token, title="TEST_get_public")
        r = requests.get(f"{BASE_URL}/api/videos/{v['id']}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == v["id"]
        assert "f_mp4" in data["video_url"] and "vc_h264" in data["video_url"]
        assert data["author"] is not None

    def test_04_related(self, founder_token):
        v = _create_video(founder_token, title="TEST_related_seed")
        r = requests.get(f"{BASE_URL}/api/videos/{v['id']}/related", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============================================================
# Feature 2: views (dedupe)
# ============================================================
class TestViews:
    def test_05_view_dedupe(self, founder_token):
        v = _create_video(founder_token, title="TEST_view_dedupe")
        r1 = requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/view",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r1.status_code == 200
        assert r1.json()["views"] == 1
        r2 = requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/view",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["views"] == 1, "dedupe within 30 min should NOT increment"


# ============================================================
# Feature 3: likes (idempotent + unlike)
# ============================================================
class TestLikes:
    def test_06_like_idempotent(self, founder_token):
        v = _create_video(founder_token, title="TEST_like")
        r1 = requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/like",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r1.status_code == 200
        assert r1.json() == {"likes": 1, "liked_by_me": True}
        r2 = requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/like",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json() == {"likes": 1, "liked_by_me": True}, "double like must not increment"

    def test_07_unlike(self, founder_token):
        v = _create_video(founder_token, title="TEST_unlike")
        requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/like",
            headers=_headers(founder_token),
            timeout=15,
        )
        r = requests.delete(
            f"{BASE_URL}/api/videos/{v['id']}/like",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"likes": 0, "liked_by_me": False}


# ============================================================
# Feature 4: comments
# ============================================================
class TestComments:
    def test_08_add_and_list_comments(self, founder_token):
        v = _create_video(founder_token, title="TEST_comments")
        r = requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/comments",
            json={"text": "nice video"},
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 201
        cid = r.json()["id"]
        r2 = requests.get(f"{BASE_URL}/api/videos/{v['id']}/comments", timeout=15)
        assert r2.status_code == 200
        rows = r2.json()
        assert any(c["id"] == cid and c["text"] == "nice video" for c in rows)
        target = next(c for c in rows if c["id"] == cid)
        assert target["author"] and target["author"]["username"] == "semidiepie"


# ============================================================
# Feature 5: update & ownership
# ============================================================
class TestUpdatePerms:
    def test_09_owner_update(self, founder_token):
        v = _create_video(founder_token, title="TEST_orig")
        r = requests.put(
            f"{BASE_URL}/api/videos/{v['id']}",
            json={"title": "TEST_updated"},
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_updated"

    def test_10_other_user_update_403(self, founder_token, secondary_user):
        v = _create_video(founder_token, title="TEST_owner_only")
        r = requests.put(
            f"{BASE_URL}/api/videos/{v['id']}",
            json={"title": "attack"},
            headers=_headers(secondary_user["token"]),
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"


# ============================================================
# Feature 6: visibility & search & category
# ============================================================
class TestVisibilityAndFilters:
    def test_11_private_hidden_from_unauth(self, founder_token):
        v = _create_video(founder_token, title="TEST_private", visibility="private")
        r_unauth = requests.get(f"{BASE_URL}/api/videos/{v['id']}", timeout=15)
        assert r_unauth.status_code == 404
        r_owner = requests.get(
            f"{BASE_URL}/api/videos/{v['id']}",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r_owner.status_code == 200

    def test_12_search_finds_public(self, founder_token):
        unique = f"searchable_{uuid.uuid4().hex[:6]}"
        v = _create_video(founder_token, title=f"TEST_{unique}", visibility="public")
        r = requests.get(f"{BASE_URL}/api/videos?q={unique}", timeout=15)
        assert r.status_code == 200
        ids = [row["id"] for row in r.json()]
        assert v["id"] in ids

    def test_13_category_filter(self, founder_token):
        # Create one Gaming + one Music, then verify filter isolates.
        g = _create_video(founder_token, title="TEST_cat_game", category="Gaming")
        m = _create_video(founder_token, title="TEST_cat_music", category="Music")
        r = requests.get(f"{BASE_URL}/api/videos?category=Gaming", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        ids = {row["id"] for row in rows}
        assert g["id"] in ids
        assert m["id"] not in ids
        assert all(row["category"] == "Gaming" for row in rows)


# ============================================================
# Feature 7: channel endpoint
# ============================================================
class TestChannel:
    def test_14_channel_lists_public(self, founder_token, founder_id):
        v = _create_video(founder_token, title="TEST_channel_public", visibility="public")
        r = requests.get(f"{BASE_URL}/api/users/{founder_id}/videos", timeout=15)
        assert r.status_code == 200
        ids = [row["id"] for row in r.json()]
        assert v["id"] in ids


# ============================================================
# Feature 8: delete + cascade
# ============================================================
class TestDeleteCascade:
    def test_15_delete_cleans_children(self, founder_token):
        v = _create_video(founder_token, title="TEST_delete_target")
        # Add a like + comment first.
        requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/like",
            headers=_headers(founder_token),
            timeout=15,
        )
        requests.post(
            f"{BASE_URL}/api/videos/{v['id']}/comments",
            json={"text": "test cmt"},
            headers=_headers(founder_token),
            timeout=15,
        )
        # Delete
        r = requests.delete(
            f"{BASE_URL}/api/videos/{v['id']}",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"status": "deleted"}
        # Removed from tracking so cleanup doesn't retry
        _created_videos[:] = [(vid, tok) for (vid, tok) in _created_videos if vid != v["id"]]
        # Verify 404 after
        r2 = requests.get(f"{BASE_URL}/api/videos/{v['id']}", timeout=15)
        assert r2.status_code == 404
        # Verify comments endpoint returns empty (deleted cascaded)
        r3 = requests.get(f"{BASE_URL}/api/videos/{v['id']}/comments", timeout=15)
        # comments list doesn't 404 (it filters by video_id), but should be []
        assert r3.status_code == 200
        assert r3.json() == []


# ============================================================
# Feature 9: blocked-author filtering
# ============================================================
class TestBlockedFiltering:
    def test_16_blocked_author_excluded_from_feed(self, founder_token, secondary_user):
        # Secondary uploads a video
        payload = {
            "title": f"TEST_blocked_{uuid.uuid4().hex[:6]}",
            "description": "should be filtered when blocked",
            "video_url": SAMPLE_VIDEO_URL,
            "duration": 5.0,
            "category": "Vlogs",
            "visibility": "public",
            "tags": ["test"],
        }
        r = requests.post(
            f"{BASE_URL}/api/videos",
            json=payload,
            headers=_headers(secondary_user["token"]),
            timeout=30,
        )
        assert r.status_code == 201
        vid = r.json()["id"]
        _created_videos.append((vid, secondary_user["token"]))

        # Founder blocks secondary user
        rb = requests.post(
            f"{BASE_URL}/api/users/{secondary_user['id']}/block",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert rb.status_code in (200, 201), f"block failed: {rb.status_code} {rb.text}"

        # Founder's feed should NOT include that video
        try:
            r_feed = requests.get(
                f"{BASE_URL}/api/videos",
                headers=_headers(founder_token),
                timeout=15,
            )
            assert r_feed.status_code == 200
            ids = [row["id"] for row in r_feed.json()]
            assert vid not in ids, "blocked user's video should be filtered out"
        finally:
            # Unblock so DB stays clean
            requests.delete(
                f"{BASE_URL}/api/users/{secondary_user['id']}/block",
                headers=_headers(founder_token),
                timeout=15,
            )


# ============================================================
# Regression: reels endpoint still alive
# ============================================================
class TestReelsBackCompat:
    def test_17_reels_endpoint_still_200(self):
        r = requests.get(f"{BASE_URL}/api/reels", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
