"""Iteration 46 — Sage Cosmetic Studio + follower post notifications.

Covers:
  * POST /api/market/cosmetic-studio/chat   (ask / ready modes, frame + theme)
  * POST /api/market/cosmetic-studio/create (charges 50 tokens, auto-equips)
  * POST /api/posts triggers 'post' notification for each follower (GET /api/notifications)
"""

import os
import time
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

HEADERS_JSON = {"Content-Type": "application/json"}


def _register(prefix: str) -> dict:
    """Register a TEST_-prefixed account; returns {token, user}."""
    tag = f"{prefix}_{uuid.uuid4().hex[:8]}"
    body = {
        "email": f"{tag}@test.com",
        "username": tag[:20],
        "password": "Test123!",
        "display_name": tag,
        "pin": "1234",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body, timeout=20)
    assert r.status_code == 200, f"register {tag} -> {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["access_token"], "user": data["user"], "headers": {"Authorization": f"Bearer {data['access_token']}", **HEADERS_JSON}}


def _get_me(hdr):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=hdr, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------- Studio chat
class TestCosmeticStudioChat:
    """Studio should return mode='ask' at least once, then 'ready' with normalized spec."""

    def _run_until_ready(self, hdr, kind: str, max_turns: int = 4):
        """Drive the conversation to a 'ready' spec in as few turns as possible.

        Keeps LLM calls low per the review note (user has limited Sage credits).
        """
        session_id = None
        last = None
        openers = {
            "frame": "Make me a glossy frame with orange, red and pink colors, name 'Sunset', medium speed, with glow. Finalise now.",
            "theme": "Theme name 'Lavender Rain', primary purple (265 85% 60%), falling emoji 💜, calm vibe. Finalise now.",
        }
        follow_ups = ["Use whatever defaults you suggested. Finalise now.",
                      "Yes to all defaults, mark it ready.",
                      "Finalise with those defaults, output the ready spec now."]
        turn_payloads = [openers[kind], *follow_ups]
        for i, msg in enumerate(turn_payloads[:max_turns]):
            payload = {"kind": kind, "message": msg}
            if session_id:
                payload["session_id"] = session_id
            r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/chat", json=payload, headers=hdr, timeout=90)
            assert r.status_code == 200, f"chat turn {i} -> {r.status_code} {r.text}"
            last = r.json()
            session_id = last["session_id"]
            assert last["kind"] == kind
            assert last["cost"] == 50
            assert last["mode"] in ("ask", "ready")
            if last.get("spec_ready"):
                return session_id, last
            time.sleep(0.5)
        return session_id, last

    def test_frame_chat_reaches_ready(self):
        acc = _register("test_frame")
        session_id, last = self._run_until_ready(acc["headers"], "frame", max_turns=4)
        assert last is not None
        assert last["spec_ready"] is True, f"never reached ready: {last}"
        spec = last["spec"]
        assert spec["type"] == "frame"
        assert isinstance(spec["name"], str) and len(spec["name"]) <= 24
        for key in ("c1", "c2", "c3"):
            assert spec[key].startswith("#") and len(spec[key]) == 7
        assert 1.5 <= float(spec["speed"]) <= 6.0
        assert isinstance(spec["glow"], bool)

    def test_theme_chat_reaches_ready(self):
        acc = _register("test_theme")
        session_id, last = self._run_until_ready(acc["headers"], "theme", max_turns=4)
        assert last is not None
        assert last["spec_ready"] is True, f"never reached ready: {last}"
        spec = last["spec"]
        assert spec["type"] == "theme"
        assert isinstance(spec["name"], str) and 1 <= len(spec["name"]) <= 24
        # HSL triplet format
        import re
        assert re.match(r"^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$", spec["primary"]), spec["primary"]
        assert isinstance(spec["emoji"], str) and len(spec["emoji"]) > 0

    def test_chat_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/chat", json={"kind": "frame", "message": "hi"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_chat_unknown_session_404(self):
        acc = _register("test_sess")
        r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/chat",
                          json={"session_id": "nonexistent-xyz", "kind": "frame", "message": "hi"},
                          headers=acc["headers"], timeout=15)
        assert r.status_code == 404


# ---------------------------------------------------------------- Studio create
class TestCosmeticStudioCreate:
    """Create charges exactly 50 tokens, auto-equips, and deletes session."""

    def _reach_ready_frame(self, hdr):
        session_id = None
        for msg in ["Give me a bright orange/pink/yellow glossy frame named 'Sunset', medium speed with glow. Finalise now.",
                    "All good — finalise now.",
                    "Finalise with those defaults, output ready spec now."]:
            payload = {"kind": "frame", "message": msg}
            if session_id:
                payload["session_id"] = session_id
            r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/chat", json=payload, headers=hdr, timeout=90)
            assert r.status_code == 200, r.text
            d = r.json()
            session_id = d["session_id"]
            if d.get("spec_ready"):
                return session_id
            time.sleep(0.5)
        raise AssertionError("could not drive studio to ready")

    def test_create_charges_50_and_autoequips(self):
        acc = _register("test_create")
        me_before = _get_me(acc["headers"])
        bal_before = int(me_before["tokens"])
        assert bal_before >= 50, f"fresh accounts must start with >=50 tokens, got {bal_before}"
        session_id = self._reach_ready_frame(acc["headers"])
        r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/create",
                          json={"session_id": session_id}, headers=acc["headers"], timeout=30)
        assert r.status_code == 200, f"create -> {r.status_code} {r.text}"
        updated = r.json()
        # Wallet charged exactly 50
        assert int(updated["tokens"]) == bal_before - 50, (updated["tokens"], bal_before)
        # Auto-equipped
        assert updated.get("equipped_frame") == "custom"
        assert updated.get("custom_frame") is not None
        assert updated["custom_frame"]["type"] == "frame"
        # Session cleared
        r2 = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/chat",
                           json={"session_id": session_id, "kind": "frame", "message": "ping"},
                           headers=acc["headers"], timeout=15)
        assert r2.status_code == 404, f"session should be cleared, got {r2.status_code}"

    def test_create_insufficient_tokens_402(self):
        acc = _register("test_poor")
        # Deliberately drain wallet to <50. Easiest: perform one successful create first (costs 50 of 100),
        # then try a second — second should 402.
        session_id = self._reach_ready_frame(acc["headers"])
        r1 = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/create",
                           json={"session_id": session_id}, headers=acc["headers"], timeout=30)
        assert r1.status_code == 200, r1.text
        # Try second create — new session, same account should now have ~50 tokens left.
        # Spend them first via another create to drive balance below 50.
        session_id2 = self._reach_ready_frame(acc["headers"])
        r2 = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/create",
                           json={"session_id": session_id2}, headers=acc["headers"], timeout=30)
        # If starting bal was exactly 100: r2 should succeed (bal 50 -> 0). Then r3 should 402.
        # If starting bal was already lower we may 402 earlier — either outcome proves charging works.
        assert r2.status_code in (200, 402)
        if r2.status_code == 200:
            session_id3 = self._reach_ready_frame(acc["headers"])
            r3 = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/create",
                               json={"session_id": session_id3}, headers=acc["headers"], timeout=30)
            assert r3.status_code == 402, f"expected 402 on empty wallet, got {r3.status_code} {r3.text}"

    def test_create_without_ready_spec_400(self):
        acc = _register("test_nospec")
        # Only one 'ask' turn — spec shouldn't be ready
        r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/chat",
                          json={"kind": "frame", "message": "hey"},
                          headers=acc["headers"], timeout=90)
        assert r.status_code == 200
        d = r.json()
        if d.get("spec_ready"):
            # If LLM instantly readied up, skip gracefully
            import pytest
            pytest.skip("studio became ready in one turn; cannot test 400 path")
        r2 = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/create",
                           json={"session_id": d["session_id"]},
                           headers=acc["headers"], timeout=15)
        assert r2.status_code == 400

    def test_create_unknown_session_404(self):
        acc = _register("test_badid")
        r = requests.post(f"{BASE_URL}/api/market/cosmetic-studio/create",
                          json={"session_id": "does-not-exist"},
                          headers=acc["headers"], timeout=15)
        assert r.status_code == 404


# ---------------------------------------------------------------- Follower-post notifications
class TestFollowerPostNotifications:
    """When user A (followed by user B) posts, B should receive a type='post' notification."""

    def test_follower_gets_post_notification(self):
        author = _register("test_author")
        follower = _register("test_follower")

        # Follower follows the author
        r = requests.post(f"{BASE_URL}/api/users/{author['user']['id']}/follow",
                          headers=follower["headers"], timeout=15)
        assert r.status_code == 200, f"follow -> {r.status_code} {r.text}"

        # Snapshot follower's notifications before (filter author post-type later)
        r0 = requests.get(f"{BASE_URL}/api/notifications", headers=follower["headers"], timeout=15)
        assert r0.status_code == 200
        before_ids = {n["id"] for n in r0.json()}

        # Author creates a post
        caption = f"hello world {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"caption": caption, "image_url": "https://picsum.photos/400"},
                          headers=author["headers"], timeout=15)
        assert r.status_code == 200, r.text
        post_id = r.json()["id"]

        # Follower should now have a new 'post' notification referencing the author
        got = None
        for _ in range(5):
            time.sleep(0.6)
            rn = requests.get(f"{BASE_URL}/api/notifications", headers=follower["headers"], timeout=15)
            assert rn.status_code == 200
            new = [n for n in rn.json() if n["id"] not in before_ids]
            match = [n for n in new if n.get("type") == "post" and n.get("post_id") == post_id]
            if match:
                got = match[0]
                break
        assert got is not None, "no 'post' notification was delivered to the follower"
        assert got.get("actor_id") == author["user"]["id"]
        assert got.get("link") == f"/posts/{post_id}"
        assert got.get("read") is False
        # No ObjectId leakage
        assert "_id" not in got

    def test_non_follower_does_not_get_notification(self):
        author = _register("test_author2")
        stranger = _register("test_stranger")

        before = requests.get(f"{BASE_URL}/api/notifications", headers=stranger["headers"], timeout=15).json()
        before_ids = {n["id"] for n in before}

        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"caption": "nobody follows me", "image_url": "https://picsum.photos/300"},
                          headers=author["headers"], timeout=15)
        assert r.status_code == 200
        post_id = r.json()["id"]

        time.sleep(1.0)
        after = requests.get(f"{BASE_URL}/api/notifications", headers=stranger["headers"], timeout=15).json()
        new = [n for n in after if n["id"] not in before_ids and n.get("post_id") == post_id]
        assert new == [], f"stranger must not get a post notification: {new}"
