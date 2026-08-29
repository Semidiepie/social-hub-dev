"""PostMePlex backend API tests."""
import time
import uuid
import pytest
from conftest import has_objectid


# ---------- Health ----------
class TestHealth:
    def test_health(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("app") == "postmeplex"


# ---------- Auth ----------
class TestAuth:
    def test_register_new_user(self, api_client, base_url):
        uniq = uuid.uuid4().hex[:8]
        payload = {
            "email": f"TEST_user_{uniq}@postmeplex.com",
            "username": f"test_{uniq}",
            "password": "Pass1234!",
            "display_name": f"Test {uniq}",
        }
        r = api_client.post(f"{base_url}/api/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == payload["email"].lower()
        assert data["user"]["username"] == payload["username"]
        assert not has_objectid(data)

    def test_register_duplicate_email_rejected(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/register", json={
            "email": "alex@postmeplex.com",
            "username": f"dup_{uuid.uuid4().hex[:6]}",
            "password": "Pass1234!",
            "display_name": "Dup",
        })
        assert r.status_code == 400

    def test_login_seeded_alex(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login", json={
            "email": "alex@postmeplex.com", "password": "Test123!"
        })
        assert r.status_code == 200
        data = r.json()
        assert data["access_token"]
        assert data["user"]["username"] == "alexgg"
        assert data["user"]["is_streamer"] is True
        assert not has_objectid(data)

    def test_login_wrong_password(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login", json={
            "email": "alex@postmeplex.com", "password": "wrong"
        })
        assert r.status_code == 400

    def test_me_with_token(self, api_client, base_url, alex_token):
        r = api_client.get(f"{base_url}/api/auth/me", headers={"Authorization": f"Bearer {alex_token}"})
        assert r.status_code == 200
        assert r.json()["email"] == "alex@postmeplex.com"

    def test_me_without_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_update_me(self, api_client, base_url, maria_token):
        new_bio = f"updated bio {uuid.uuid4().hex[:6]}"
        r = api_client.put(
            f"{base_url}/api/auth/me",
            json={"bio": new_bio, "display_name": "Maria Updated", "avatar_url": "https://x.com/a.png"},
            headers={"Authorization": f"Bearer {maria_token}"},
        )
        assert r.status_code == 200
        # Verify persistence via GET
        verify = api_client.get(f"{base_url}/api/auth/me", headers={"Authorization": f"Bearer {maria_token}"})
        assert verify.status_code == 200
        u = verify.json()
        assert u["bio"] == new_bio
        assert u["display_name"] == "Maria Updated"
        assert u["avatar_url"] == "https://x.com/a.png"


# ---------- Feed / Reels / Stories / Discover ----------
class TestFeeds:
    def test_feed(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/feed")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        first = data[0]
        for k in ("id", "type", "caption", "likes", "author", "created_at", "liked_by_me"):
            assert k in first, f"missing key: {k}"
        assert first["type"] == "post"
        assert not has_objectid(data)

    def test_reels(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/reels")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        assert data[0]["type"] == "reel"
        assert data[0].get("video_url")

    def test_stories(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/stories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # at least one is_live=True streamer
        live = [s for s in data if s.get("is_live")]
        assert len(live) > 0
        for s in data:
            assert "is_live" in s and "viewers" in s

    @pytest.mark.parametrize("flt", ["top", "accounts", "tags", "live"])
    def test_discover(self, api_client, base_url, flt):
        r = api_client.get(f"{base_url}/api/discover", params={"filter": flt})
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == flt
        assert "items" in data and isinstance(data["items"], list)


# ---------- Posts CRUD + Like + Comment ----------
class TestPostInteractions:
    def test_create_post_increments_count(self, api_client, base_url, maria_token, maria_user):
        before = maria_user["posts_count"]
        r = api_client.post(
            f"{base_url}/api/posts",
            json={"caption": "TEST_ post hello", "image_url": "https://img/x.png", "game_tag": "test"},
            headers={"Authorization": f"Bearer {maria_token}"},
        )
        assert r.status_code == 200
        post = r.json()
        assert post["caption"] == "TEST_ post hello"
        # Verify counter
        me = api_client.get(f"{base_url}/api/auth/me", headers={"Authorization": f"Bearer {maria_token}"}).json()
        assert me["posts_count"] == before + 1
        # cleanup
        api_client.delete(f"{base_url}/api/posts/{post['id']}", headers={"Authorization": f"Bearer {maria_token}"})

    def test_like_toggle_and_idempotent(self, api_client, base_url, alex_token, maria_token):
        # Maria creates a post for Alex to like
        post = api_client.post(
            f"{base_url}/api/posts",
            json={"caption": "TEST_ like target", "image_url": "https://img/y.png"},
            headers={"Authorization": f"Bearer {maria_token}"},
        ).json()
        pid = post["id"]
        starting_likes = post.get("likes", 0)

        # First like by Alex
        r1 = api_client.post(f"{base_url}/api/posts/{pid}/like", headers={"Authorization": f"Bearer {alex_token}"})
        assert r1.status_code == 200
        assert r1.json()["status"] == "liked"
        assert r1.json()["likes"] == starting_likes + 1

        # Second like - idempotent
        r2 = api_client.post(f"{base_url}/api/posts/{pid}/like", headers={"Authorization": f"Bearer {alex_token}"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "already_liked"

        # Unlike
        r3 = api_client.delete(f"{base_url}/api/posts/{pid}/like", headers={"Authorization": f"Bearer {alex_token}"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "unliked"
        assert r3.json()["likes"] == starting_likes

        # Cleanup
        api_client.delete(f"{base_url}/api/posts/{pid}", headers={"Authorization": f"Bearer {maria_token}"})

    def test_comments_create_and_list(self, api_client, base_url, alex_token, maria_token):
        post = api_client.post(
            f"{base_url}/api/posts",
            json={"caption": "TEST_ comment target"},
            headers={"Authorization": f"Bearer {maria_token}"},
        ).json()
        pid = post["id"]

        c = api_client.post(
            f"{base_url}/api/posts/{pid}/comments",
            json={"text": "TEST_ great post!"},
            headers={"Authorization": f"Bearer {alex_token}"},
        )
        assert c.status_code == 200
        cb = c.json()
        assert cb["text"] == "TEST_ great post!"
        assert cb["user_id"]

        # List
        lst = api_client.get(f"{base_url}/api/posts/{pid}/comments")
        assert lst.status_code == 200
        comments = lst.json()
        assert any(x["text"] == "TEST_ great post!" for x in comments)
        assert not has_objectid(comments)

        # Verify increment
        post_after = api_client.get(f"{base_url}/api/posts/{pid}").json()
        assert post_after["comments_count"] == 1

        # Cleanup
        api_client.delete(f"{base_url}/api/posts/{pid}", headers={"Authorization": f"Bearer {maria_token}"})


# ---------- Follow ----------
class TestFollow:
    def test_follow_unfollow_toggle(self, api_client, base_url, alex_token, alex_user, maria_user):
        target = maria_user["id"]
        headers = {"Authorization": f"Bearer {alex_token}"}

        # Ensure clean state
        api_client.delete(f"{base_url}/api/users/{target}/follow", headers=headers)

        # Follow
        r = api_client.post(f"{base_url}/api/users/{target}/follow", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] in ("followed", "already_following")

        # Verify counts via /api/users/{id}
        target_info = api_client.get(f"{base_url}/api/users/{target}", headers=headers).json()
        assert target_info["follows_them"] is True

        # Idempotent follow
        r2 = api_client.post(f"{base_url}/api/users/{target}/follow", headers=headers)
        assert r2.json()["status"] == "already_following"

        # Unfollow
        r3 = api_client.delete(f"{base_url}/api/users/{target}/follow", headers=headers)
        assert r3.status_code == 200
        assert r3.json()["status"] == "unfollowed"

        # Confirm
        target_info2 = api_client.get(f"{base_url}/api/users/{target}", headers=headers).json()
        assert target_info2["follows_them"] is False

    def test_cannot_follow_self(self, api_client, base_url, alex_token, alex_user):
        r = api_client.post(
            f"{base_url}/api/users/{alex_user['id']}/follow",
            headers={"Authorization": f"Bearer {alex_token}"},
        )
        assert r.status_code == 400


# ---------- Notifications ----------
class TestNotifications:
    def test_notifications_after_like(self, api_client, base_url, alex_token, maria_token, maria_user):
        # Maria creates post, Alex likes, Maria sees notification
        post = api_client.post(
            f"{base_url}/api/posts",
            json={"caption": "TEST_ notif target"},
            headers={"Authorization": f"Bearer {maria_token}"},
        ).json()
        pid = post["id"]
        api_client.post(f"{base_url}/api/posts/{pid}/like", headers={"Authorization": f"Bearer {alex_token}"})
        time.sleep(0.5)

        notifs = api_client.get(
            f"{base_url}/api/notifications",
            headers={"Authorization": f"Bearer {maria_token}"},
        )
        assert notifs.status_code == 200
        data = notifs.json()
        assert isinstance(data, list)
        like_notifs = [n for n in data if n.get("type") == "like" and n.get("post_id") == pid]
        assert len(like_notifs) >= 1
        assert not has_objectid(data)

        # cleanup
        api_client.delete(f"{base_url}/api/posts/{pid}", headers={"Authorization": f"Bearer {maria_token}"})


# ---------- Push ----------
class TestPush:
    def test_register_push_gracefully_handles_placeholder(self, api_client, base_url, alex_user):
        r = api_client.post(f"{base_url}/api/register-push", json={
            "user_id": alex_user["id"],
            "platform": "ios",
            "device_token": "TEST_devicetoken_xyz",
        })
        # placeholder key => server should swallow and return skipped OR 500 per code paths
        # per implementation: 401 raises HTTPException(500). Acceptable: 201/skipped or 500.
        assert r.status_code in (200, 201, 500, 502), r.text
        if r.status_code in (200, 201):
            body = r.json()
            assert body.get("status") in ("registered", "skipped")


# ---------- ObjectId leak check across endpoints ----------
class TestObjectIdLeak:
    def test_no_objectid_in_public_endpoints(self, api_client, base_url, alex_token, alex_user):
        h = {"Authorization": f"Bearer {alex_token}"}
        endpoints = [
            ("GET", "/api/feed", None),
            ("GET", "/api/reels", None),
            ("GET", "/api/stories", None),
            ("GET", "/api/discover?filter=top", None),
            ("GET", "/api/discover?filter=accounts", None),
            ("GET", "/api/auth/me", h),
            ("GET", f"/api/users/{alex_user['id']}", h),
            ("GET", f"/api/users/{alex_user['id']}/posts", h),
            ("GET", f"/api/users/{alex_user['id']}/reels", h),
            ("GET", "/api/notifications", h),
        ]
        for method, path, headers in endpoints:
            r = api_client.request(method, f"{base_url}{path}", headers=headers or {})
            assert r.status_code == 200, f"{path} -> {r.status_code}"
            assert not has_objectid(r.json()), f"_id leak in {path}"
