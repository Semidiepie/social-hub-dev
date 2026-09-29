"""Iteration 38 — threaded comments (posts/videos/reels) + PostMePlex Market cosmetics.
Runs against the public preview backend using founder + scratch test_* accounts.
Scratch accounts auto-purge on backend restart per test_credentials.md.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FOUNDER_ID = "semidiepie"
FOUNDER_PIN = "7455"

# Shared state across ordered tests in a class
STATE: dict = {}


# ---------- helpers ----------

def _login_pin(identifier, pin):
    r = requests.post(f"{API}/auth/login-pin", json={"identifier": identifier, "pin": pin}, timeout=15)
    assert r.status_code == 200, f"login-pin failed: {r.status_code} {r.text}"
    return r.json()


def _register(username=None, pin="1234"):
    username = username or f"test_{uuid.uuid4().hex[:10]}"
    email = f"{username}@example.com"
    r = requests.post(
        f"{API}/auth/register",
        json={"username": username, "email": email, "password": "Passw0rd!", "display_name": username, "pin": pin},
        timeout=15,
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    return r.json()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def founder():
    return _login_pin(FOUNDER_ID, FOUNDER_PIN)


@pytest.fixture(scope="module")
def alice():
    return _register()


@pytest.fixture(scope="module")
def bob():
    return _register()


@pytest.fixture(scope="module")
def post_by_founder(founder):
    r = requests.post(
        f"{API}/posts",
        headers=_auth_headers(founder["access_token"]),
        json={"caption": "TEST_thread_post_" + uuid.uuid4().hex[:6], "media_urls": []},
        timeout=15,
    )
    assert r.status_code in (200, 201), f"create post failed: {r.status_code} {r.text}"
    p = r.json()
    yield p
    # cleanup best effort
    requests.delete(f"{API}/posts/{p['id']}", headers=_auth_headers(founder["access_token"]))


# ---------- Market / cosmetics tests ----------

class TestMarketCosmetics:
    def test_founder_public_has_cosmetic_fields(self, founder):
        u = founder["user"]
        # Contract: UserPublic exposes these keys (may be None/False).
        assert "equipped_frame" in u
        assert "active_theme" in u
        assert "frame_enabled" in u
        assert "theme_enabled" in u

    def test_equip_frame_and_apply_theme(self, founder):
        h = _auth_headers(founder["access_token"])
        r = requests.post(f"{API}/market/cosmetics", headers=h, json={
            "equipped_frame": "gold", "active_theme": "fall",
            "frame_enabled": True, "theme_enabled": True,
        }, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["equipped_frame"] == "gold"
        assert u["active_theme"] == "fall"
        assert u["frame_enabled"] is True
        assert u["theme_enabled"] is True
        # Persistence — GET /auth/me
        me = requests.get(f"{API}/auth/me", headers=h, timeout=15).json()
        assert me["equipped_frame"] == "gold"
        assert me["active_theme"] == "fall"

    def test_invalid_frame_400(self, founder):
        h = _auth_headers(founder["access_token"])
        r = requests.post(f"{API}/market/cosmetics", headers=h, json={"equipped_frame": "notaframe"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_invalid_theme_400(self, founder):
        h = _auth_headers(founder["access_token"])
        r = requests.post(f"{API}/market/cosmetics", headers=h, json={"active_theme": "bogus"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_empty_string_unequips(self, founder):
        h = _auth_headers(founder["access_token"])
        # equip
        requests.post(f"{API}/market/cosmetics", headers=h, json={"equipped_frame": "neon", "active_theme": "winter"}, timeout=15)
        # unequip
        r = requests.post(f"{API}/market/cosmetics", headers=h, json={"equipped_frame": "", "active_theme": ""}, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert not u.get("equipped_frame")
        assert not u.get("active_theme")

    def test_all_9_frames_and_9_themes_accepted(self, founder):
        h = _auth_headers(founder["access_token"])
        frames = ["gold", "hearts", "emerald", "violet", "neon", "rainbow", "fire", "frost", "ocean"]
        themes = ["fall", "winter", "halloween", "christmas", "valentine", "spring", "summer", "newyear", "stpatrick"]
        for f in frames:
            r = requests.post(f"{API}/market/cosmetics", headers=h, json={"equipped_frame": f}, timeout=15)
            assert r.status_code == 200, f"frame {f} rejected: {r.text}"
        for t in themes:
            r = requests.post(f"{API}/market/cosmetics", headers=h, json={"active_theme": t}, timeout=15)
            assert r.status_code == 200, f"theme {t} rejected: {r.text}"

    def test_toggle_flags_independently(self, founder):
        h = _auth_headers(founder["access_token"])
        r = requests.post(f"{API}/market/cosmetics", headers=h, json={"frame_enabled": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["frame_enabled"] is False
        r = requests.post(f"{API}/market/cosmetics", headers=h, json={"theme_enabled": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["theme_enabled"] is False


# ---------- Post comment threading ----------

class TestPostCommentThreads:
    def test_add_root_comment(self, alice, post_by_founder):
        h = _auth_headers(alice["access_token"])
        r = requests.post(f"{API}/posts/{post_by_founder['id']}/comments", headers=h, json={"text": "TEST_root_a"}, timeout=15)
        assert r.status_code in (200, 201), r.text
        c = r.json()
        assert c["parent_id"] is None
        STATE["root_id"] = c["id"]

    def test_reply_to_root_sets_parent(self, bob, post_by_founder):
        h = _auth_headers(bob["access_token"])
        r = requests.post(
            f"{API}/posts/{post_by_founder['id']}/comments",
            headers=h, json={"text": "TEST_reply_1", "parent_id": STATE["root_id"]},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        c = r.json()
        assert c["parent_id"] == STATE["root_id"]
        STATE["reply_id"] = c["id"]

    def test_reply_to_reply_flattens_to_root(self, alice, post_by_founder):
        # Replying to the reply must resolve up to the root (one-level threading).
        h = _auth_headers(alice["access_token"])
        r = requests.post(
            f"{API}/posts/{post_by_founder['id']}/comments",
            headers=h, json={"text": "TEST_reply_2 flatten", "parent_id": STATE["reply_id"]},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        c = r.json()
        assert c["parent_id"] == STATE["root_id"], f"expected flatten to root {STATE['root_id']}, got {c['parent_id']}"
        STATE["reply2_id"] = c["id"]

    def test_list_returns_all_with_parent_ids(self, post_by_founder):
        r = requests.get(f"{API}/posts/{post_by_founder['id']}/comments", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        by_id = {c["id"]: c for c in rows}
        assert STATE["root_id"] in by_id
        assert by_id[STATE["reply_id"]]["parent_id"] == STATE["root_id"]
        assert by_id[STATE["reply2_id"]]["parent_id"] == STATE["root_id"]

    def test_comments_count_reflects_all(self, post_by_founder, founder):
        r = requests.get(f"{API}/posts/{post_by_founder['id']}", timeout=15)
        assert r.status_code == 200
        # 3 comments were added (root + 2 replies).
        assert r.json().get("comments_count", 0) >= 3

    def test_delete_top_level_cascades_replies(self, alice, post_by_founder):
        # Alice created the root — delete it. Expect removed = 1 (root) + 1 (her own reply2). Bob's reply is NOT hers.
        # Actually cascade deletes ALL replies to root regardless of author (comments_count -= removed).
        h = _auth_headers(alice["access_token"])
        before = requests.get(f"{API}/posts/{post_by_founder['id']}", timeout=15).json().get("comments_count", 0)
        r = requests.delete(f"{API}/posts/{post_by_founder['id']}/comments/{STATE['root_id']}", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        removed = r.json().get("removed", 0)
        assert removed >= 3, f"cascade removed only {removed}, expected 3+"
        after = requests.get(f"{API}/posts/{post_by_founder['id']}", timeout=15).json().get("comments_count", 0)
        assert after == before - removed

    def test_delete_others_comment_403(self, alice, bob, post_by_founder):
        # Bob posts, alice tries to delete.
        h_b = _auth_headers(bob["access_token"])
        c = requests.post(f"{API}/posts/{post_by_founder['id']}/comments", headers=h_b, json={"text": "TEST_bob_only"}, timeout=15).json()
        h_a = _auth_headers(alice["access_token"])
        r = requests.delete(f"{API}/posts/{post_by_founder['id']}/comments/{c['id']}", headers=h_a, timeout=15)
        assert r.status_code == 403

    def test_reply_to_nonexistent_parent_404(self, alice, post_by_founder):
        h = _auth_headers(alice["access_token"])
        r = requests.post(f"{API}/posts/{post_by_founder['id']}/comments", headers=h,
                          json={"text": "x", "parent_id": "does-not-exist"}, timeout=15)
        assert r.status_code == 404

    def test_reply_notifies_parent_author(self, alice, bob, post_by_founder):
        # Alice comments, Bob replies -> alice gets a "comment" notification with type=comment.
        h_a = _auth_headers(alice["access_token"])
        h_b = _auth_headers(bob["access_token"])
        root = requests.post(f"{API}/posts/{post_by_founder['id']}/comments", headers=h_a,
                             json={"text": "TEST_notif_root"}, timeout=15).json()
        requests.post(f"{API}/posts/{post_by_founder['id']}/comments", headers=h_b,
                      json={"text": "TEST_notif_reply", "parent_id": root["id"]}, timeout=15)
        time.sleep(0.5)
        notifs = requests.get(f"{API}/notifications", headers=h_a, timeout=15).json()
        # Look for a "comment" notif whose text contains 'replied'.
        replied = [n for n in notifs if n.get("type") == "comment" and "replied" in (n.get("text") or "")]
        assert replied, f"alice did not get a reply notif. All: {[(n.get('type'), n.get('text')) for n in notifs[:6]]}"


# ---------- Video comment threading ----------

@pytest.fixture(scope="module")
def video_by_founder(founder):
    r = requests.post(
        f"{API}/videos",
        headers=_auth_headers(founder["access_token"]),
        json={"title": "TEST_video_thread", "video_url": "https://example.com/v.mp4",
              "thumbnail_url": "https://example.com/t.jpg", "duration_sec": 10, "description": "t"},
        timeout=15,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"video create not available: {r.status_code} {r.text}")
    v = r.json()
    yield v
    requests.delete(f"{API}/videos/{v['id']}", headers=_auth_headers(founder["access_token"]))


class TestVideoCommentThreads:
    def test_add_root_and_reply_flattens(self, video_by_founder, alice, bob):
        h_a = _auth_headers(alice["access_token"])
        h_b = _auth_headers(bob["access_token"])
        vid = video_by_founder["id"]
        root = requests.post(f"{API}/videos/{vid}/comments", headers=h_a, json={"text": "TEST_v_root"}, timeout=15)
        assert root.status_code in (200, 201), root.text
        root_id = root.json()["id"]
        assert root.json().get("parent_id") in (None, "")
        # reply
        rep = requests.post(f"{API}/videos/{vid}/comments", headers=h_b,
                             json={"text": "TEST_v_reply", "parent_id": root_id}, timeout=15)
        assert rep.status_code in (200, 201), rep.text
        assert rep.json()["parent_id"] == root_id
        # reply-to-reply flatten
        rep2 = requests.post(f"{API}/videos/{vid}/comments", headers=h_a,
                              json={"text": "TEST_v_reply2", "parent_id": rep.json()["id"]}, timeout=15)
        assert rep2.status_code in (200, 201)
        assert rep2.json()["parent_id"] == root_id
        STATE["v_root_id"] = root_id
        STATE["v_reply_id"] = rep.json()["id"]

    def test_list_includes_parent_ids(self, video_by_founder):
        r = requests.get(f"{API}/videos/{video_by_founder['id']}/comments", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(c.get("parent_id") == STATE["v_root_id"] for c in rows)

    def test_delete_owner_only(self, video_by_founder, alice, bob):
        h_b = _auth_headers(bob["access_token"])
        # Bob tries to delete alice's root => 403
        r = requests.delete(f"{API}/videos/{video_by_founder['id']}/comments/{STATE['v_root_id']}", headers=h_b, timeout=15)
        assert r.status_code == 403

    def test_delete_cascades(self, video_by_founder, alice):
        h_a = _auth_headers(alice["access_token"])
        r = requests.delete(f"{API}/videos/{video_by_founder['id']}/comments/{STATE['v_root_id']}", headers=h_a, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("removed", 0) >= 2  # root + at least 1 reply owned by alice? cascade deletes ALL replies


# ---------- Reel comment threading (uses same /posts endpoint? or separate) ----------

class TestReelCommentThreads:
    """Reels are stored as posts (type='reel'); comments use /api/posts/{id}/comments."""

    @pytest.fixture(scope="class")
    def reel_by_founder(self, founder):
        r = requests.post(
            f"{API}/reels",
            headers=_auth_headers(founder["access_token"]),
            json={"caption": "TEST_reel_thread", "video_url": "https://example.com/r.mp4",
                  "thumbnail_url": "https://example.com/rt.jpg"},
            timeout=15,
        )
        if r.status_code not in (200, 201):
            pytest.skip(f"reel create failed: {r.status_code} {r.text}")
        reel = r.json()
        yield reel
        requests.delete(f"{API}/posts/{reel['id']}", headers=_auth_headers(founder["access_token"]))

    def test_reel_thread_flatten(self, reel_by_founder, alice, bob):
        rid = reel_by_founder["id"]
        h_a = _auth_headers(alice["access_token"])
        h_b = _auth_headers(bob["access_token"])
        # Reels share the /posts/*/comments endpoint (type='reel' rows in posts).
        root = requests.post(f"{API}/posts/{rid}/comments", headers=h_a, json={"text": "TEST_r_root"}, timeout=15)
        assert root.status_code in (200, 201), root.text
        root_id = root.json()["id"]
        rep = requests.post(f"{API}/posts/{rid}/comments", headers=h_b, json={"text": "TEST_r_rep", "parent_id": root_id}, timeout=15)
        assert rep.status_code in (200, 201)
        assert rep.json()["parent_id"] == root_id
        rep2 = requests.post(f"{API}/posts/{rid}/comments", headers=h_a, json={"text": "TEST_r_rep2", "parent_id": rep.json()["id"]}, timeout=15)
        assert rep2.status_code in (200, 201)
        assert rep2.json()["parent_id"] == root_id
        # owner-only delete + cascade
        r = requests.delete(f"{API}/posts/{rid}/comments/{root_id}", headers=h_a, timeout=15)
        assert r.status_code == 200
        assert r.json().get("removed", 0) >= 2


# ---------- Cleanup fixture: reset founder cosmetics at end (as review_request asks) ----------

@pytest.fixture(scope="session", autouse=True)
def reset_founder_at_end():
    yield
    try:
        f = _login_pin(FOUNDER_ID, FOUNDER_PIN)
        requests.post(f"{API}/market/cosmetics", headers=_auth_headers(f["access_token"]),
                      json={"equipped_frame": "", "active_theme": "", "frame_enabled": False, "theme_enabled": False},
                      timeout=15)
    except Exception:
        pass
