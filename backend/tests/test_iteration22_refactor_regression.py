"""Iteration 22 — Post-refactor backend regression.

Verifies that after extracting videos + messages out of server.py into
routes/videos.py and routes/messages.py, all endpoints still behave the
same, and that the removed live/rooms endpoints now return 404/405.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def founder_token():
    r = requests.post(f"{API}/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"founder login failed {r.status_code}: {r.text[:300]}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def founder(founder_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def second_user():
    """Create a throwaway user (test_ prefix so it auto-purges on next restart)."""
    stamp = int(time.time())
    username = f"test_r22_{stamp}"
    email = f"test_r22_{stamp}@example.com"
    body = {
        "email": email,
        "username": username,
        "password": "TestPass123!",
        "display_name": f"Test R22 {stamp}",
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code in (200, 201), f"register failed {r.status_code}: {r.text[:300]}"
    data = r.json()
    return {"token": data["access_token"], "user": data["user"], "email": email}


# ---------- Removed endpoints (must 404/405) ----------

class TestRemovedEndpoints:
    def test_live_list_removed(self):
        r = requests.get(f"{API}/live", timeout=10)
        assert r.status_code in (404, 405)

    def test_live_detail_removed(self):
        r = requests.get(f"{API}/live/{uuid.uuid4()}", timeout=10)
        assert r.status_code in (404, 405)

    def test_rooms_list_removed(self):
        r = requests.get(f"{API}/rooms", timeout=10)
        assert r.status_code in (404, 405)

    def test_rooms_detail_removed(self):
        r = requests.get(f"{API}/rooms/{uuid.uuid4()}", timeout=10)
        assert r.status_code in (404, 405)


# ---------- Auth still in server.py ----------

class TestAuth:
    def test_me(self, founder_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == FOUNDER_EMAIL
        assert d.get("is_super_admin") is True

    def test_login_bad(self):
        r = requests.post(f"{API}/auth/login", json={"email": FOUNDER_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401


# ---------- Videos domain (routes/videos.py) ----------

class TestVideos:
    created_id = None

    def test_list_videos_public(self):
        r = requests.get(f"{API}/videos", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_video(self, founder_token):
        body = {
            "title": "test_ r22 video",
            "description": "iteration22 regression",
            "video_url": "https://res.cloudinary.com/demo/video/upload/dog.mp4",
            "thumbnail_url": "https://res.cloudinary.com/demo/image/upload/dog.jpg",
            "duration": 12.4,
            "visibility": "public",
            "tags": ["test", "r22"],
            "category": "Test",
        }
        r = requests.post(f"{API}/videos", json=body, headers={"Authorization": f"Bearer {founder_token}"}, timeout=15)
        assert r.status_code == 201, r.text[:300]
        data = r.json()
        assert data["title"] == "test_ r22 video"
        assert data["visibility"] == "public"
        assert data["author"]["username"] == "semidiepie"
        TestVideos.created_id = data["id"]

    def test_get_video(self, founder_token):
        vid = TestVideos.created_id
        assert vid, "prior test failed"
        r = requests.get(f"{API}/videos/{vid}", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == vid

    def test_related(self, founder_token):
        vid = TestVideos.created_id
        r = requests.get(f"{API}/videos/{vid}/related", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_video(self, founder_token):
        vid = TestVideos.created_id
        r = requests.put(
            f"{API}/videos/{vid}",
            json={"title": "test_ r22 video EDITED", "visibility": "unlisted"},
            headers={"Authorization": f"Bearer {founder_token}"}, timeout=10,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "test_ r22 video EDITED"
        assert d["visibility"] == "unlisted"

    def test_like_and_unlike(self, founder_token):
        vid = TestVideos.created_id
        h = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/videos/{vid}/like", headers=h, timeout=10)
        assert r.status_code == 200
        assert r.json()["liked_by_me"] is True
        r = requests.delete(f"{API}/videos/{vid}/like", headers=h, timeout=10)
        assert r.status_code == 200
        assert r.json()["liked_by_me"] is False

    def test_view_increments(self, founder_token):
        vid = TestVideos.created_id
        r = requests.post(f"{API}/videos/{vid}/view", timeout=10)  # anonymous view (dedupe key = auth)
        assert r.status_code == 200
        assert "views" in r.json()

    def test_add_and_list_comments(self, founder_token):
        vid = TestVideos.created_id
        h = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/videos/{vid}/comments", json={"text": "test_ comment r22"}, headers=h, timeout=10)
        assert r.status_code == 201
        r = requests.get(f"{API}/videos/{vid}/comments", timeout=10)
        assert r.status_code == 200
        assert any(c.get("text") == "test_ comment r22" for c in r.json())

    def test_user_videos_endpoint(self, founder_token, founder):
        r = requests.get(f"{API}/users/{founder['id']}/videos", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        assert any(v["id"] == TestVideos.created_id for v in r.json())

    def test_delete_video(self, founder_token):
        vid = TestVideos.created_id
        r = requests.delete(f"{API}/videos/{vid}", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        # Verify gone
        r = requests.get(f"{API}/videos/{vid}", timeout=10)
        assert r.status_code == 404


# ---------- Messages domain (routes/messages.py) ----------

class TestMessages:
    conv_id = None
    msg_id = None

    def test_list_conversations(self, founder_token):
        r = requests.get(f"{API}/conversations", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_conversation_needs_two(self, founder_token):
        # No members → should 400
        r = requests.post(f"{API}/conversations", json={"member_ids": []}, headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 400

    def test_create_conversation(self, founder_token, second_user):
        body = {"member_ids": [second_user["user"]["id"]]}
        r = requests.post(f"{API}/conversations", json=body, headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["is_group"] is False
        assert len(data["member_ids"]) == 2
        TestMessages.conv_id = data["id"]

    def test_send_message(self, founder_token):
        cid = TestMessages.conv_id
        assert cid
        r = requests.post(
            f"{API}/conversations/{cid}/messages",
            json={"text": "test_ r22 hello"},
            headers={"Authorization": f"Bearer {founder_token}"}, timeout=10,
        )
        assert r.status_code == 200, r.text[:300]
        m = r.json()
        assert m["text"] == "test_ r22 hello"
        TestMessages.msg_id = m["id"]

    def test_list_messages(self, founder_token):
        cid = TestMessages.conv_id
        r = requests.get(f"{API}/conversations/{cid}/messages", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert any(m["id"] == TestMessages.msg_id for m in rows)

    def test_typing_post_and_get(self, founder_token, second_user):
        cid = TestMessages.conv_id
        # founder posts typing
        r = requests.post(f"{API}/conversations/{cid}/typing", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        # 2nd user reads typing — should see founder in typing list
        r = requests.get(f"{API}/conversations/{cid}/typing", headers={"Authorization": f"Bearer {second_user['token']}"}, timeout=10)
        assert r.status_code == 200
        users = r.json().get("users", [])
        assert isinstance(users, list)

    def test_react_and_unreact(self, founder_token):
        mid = TestMessages.msg_id
        h = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{API}/messages/{mid}/reactions", json={"emoji": "❤️"}, headers=h, timeout=10)
        assert r.status_code == 200
        assert any(rx.get("emoji") == "❤️" for rx in r.json().get("reactions", []))
        r = requests.delete(f"{API}/messages/{mid}/reactions", headers=h, timeout=10)
        assert r.status_code == 200
        assert not any(rx.get("user_id") for rx in r.json().get("reactions", []) if rx.get("emoji") == "❤️" and rx.get("user_id"))


# ---------- Domains still in server.py: posts/reels/feed/discover/blogs ----------

class TestServerDomains:
    reel_id = None

    def test_feed(self, founder_token):
        r = requests.get(f"{API}/feed", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_reels_list(self):
        r = requests.get(f"{API}/reels", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_reel(self, founder_token):
        body = {
            "video_url": "https://res.cloudinary.com/demo/video/upload/dog.mp4",
            "thumbnail_url": "https://res.cloudinary.com/demo/image/upload/dog.jpg",
            "caption": "test_ r22 reel",
        }
        r = requests.post(f"{API}/reels", json=body, headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code in (200, 201), r.text[:300]
        data = r.json()
        assert data.get("id")
        TestServerDomains.reel_id = data["id"]

    def test_get_reel_via_posts(self, founder_token):
        rid = TestServerDomains.reel_id
        r = requests.get(f"{API}/posts/{rid}", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == rid

    def test_user_reels(self, founder_token, founder):
        r = requests.get(f"{API}/users/{founder['id']}/reels", timeout=10)
        assert r.status_code == 200
        assert any(x["id"] == TestServerDomains.reel_id for x in r.json())

    def test_discover_top(self):
        r = requests.get(f"{API}/discover?tab=top", timeout=10)
        assert r.status_code == 200

    def test_discover_accounts(self):
        r = requests.get(f"{API}/discover?tab=accounts", timeout=10)
        assert r.status_code == 200

    def test_discover_tags(self):
        r = requests.get(f"{API}/discover?tab=tags", timeout=10)
        assert r.status_code == 200

    def test_discover_live_removed(self):
        # If 'live' filter is truly removed it should either 400 or just return
        # a non-live payload; must NOT include a 'sessions' list.
        r = requests.get(f"{API}/discover?tab=live", timeout=10)
        # Accept 400/404 or 200 without live sessions
        assert r.status_code in (200, 400, 404, 422)
        if r.status_code == 200:
            body = r.json()
            # No 'sessions' key (that was the live payload) — heuristic
            assert not (isinstance(body, dict) and "sessions" in body)

    def test_search(self):
        r = requests.get(f"{API}/search?q=test", timeout=10)
        assert r.status_code == 200

    def test_notifications(self, founder_token):
        r = requests.get(f"{API}/notifications", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code == 200

    def test_blogs_list(self):
        r = requests.get(f"{API}/blogs", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_delete_created_reel(self, founder_token):
        rid = TestServerDomains.reel_id
        r = requests.delete(f"{API}/posts/{rid}", headers={"Authorization": f"Bearer {founder_token}"}, timeout=10)
        assert r.status_code in (200, 204)
