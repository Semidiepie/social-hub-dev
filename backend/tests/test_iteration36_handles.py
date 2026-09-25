"""
Iteration 36 — Custom channel handle URLs (WEB).

Tests:
- GET /api/users/@{username} and /api/users/{username} resolve the same user
- GET /api/users/{user_id} still works (legacy)
- Unknown handle => 404
- PUT /api/auth/me {username} accepts a valid new handle, lowercases it,
  rejects duplicates with 400 'already taken', and old handle 404s afterwards.
- Founder (semidiepie) MUST NOT be modified — we only mutate a fresh test_ account.
"""
import os
import time
import random
import string
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"
FOUNDER_USERNAME = "semidiepie"


def _rand(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def fresh_user(s):
    """Register a fresh test_ account (auto-purged on backend restart)."""
    uname = f"test_h36_{_rand()}"
    email = f"{uname}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "username": uname,
        "display_name": "Handle Tester", "pin": "1234",
    })
    assert r.status_code == 200, r.text
    d = r.json()
    return {
        "token": d["access_token"],
        "user": d["user"],
        "email": email,
        "password": "Passw0rd!",
        "original_username": uname,
    }


class TestHandleResolution:
    def test_get_by_at_handle(self, s):
        r = s.get(f"{API}/users/@{FOUNDER_USERNAME}")
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["username"] == FOUNDER_USERNAME
        assert "id" in u

    def test_get_by_bare_username(self, s):
        r = s.get(f"{API}/users/{FOUNDER_USERNAME}")
        assert r.status_code == 200, r.text
        assert r.json()["username"] == FOUNDER_USERNAME

    def test_get_by_user_id_still_works(self, s):
        founder = s.get(f"{API}/users/@{FOUNDER_USERNAME}").json()
        r = s.get(f"{API}/users/{founder['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == founder["id"]

    def test_unknown_handle_returns_404(self, s):
        r = s.get(f"{API}/users/@definitely_not_a_real_user_xyz_{_rand()}")
        assert r.status_code == 404

    def test_case_insensitive_handle(self, s):
        r = s.get(f"{API}/users/@{FOUNDER_USERNAME.upper()}")
        assert r.status_code == 200
        assert r.json()["username"] == FOUNDER_USERNAME


class TestUsernameChangeFlow:
    def test_valid_username_change(self, s, fresh_user):
        old = fresh_user["original_username"]
        new = f"test_h36n_{_rand()}"
        r = s.put(
            f"{API}/auth/me",
            json={"username": new},
            headers={"Authorization": f"Bearer {fresh_user['token']}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["username"] == new
        # new handle resolves
        r2 = s.get(f"{API}/users/@{new}")
        assert r2.status_code == 200
        assert r2.json()["username"] == new
        # old handle 404s
        r3 = s.get(f"{API}/users/@{old}")
        assert r3.status_code == 404, f"old handle should 404 but got {r3.status_code}"
        fresh_user["original_username"] = new  # keep state for next tests

    def test_lowercases_username(self, s, fresh_user):
        new_upper = f"TEST_H36U_{_rand().upper()}"
        r = s.put(
            f"{API}/auth/me",
            json={"username": new_upper},
            headers={"Authorization": f"Bearer {fresh_user['token']}"},
        )
        assert r.status_code == 200, r.text
        got = r.json()["username"]
        assert got == new_upper.lower(), f"expected lowercased, got {got}"
        fresh_user["original_username"] = got

    def test_duplicate_username_rejected(self, s, fresh_user):
        r = s.put(
            f"{API}/auth/me",
            json={"username": FOUNDER_USERNAME},
            headers={"Authorization": f"Bearer {fresh_user['token']}"},
        )
        assert r.status_code == 400, r.text
        body = r.json()
        detail = str(body.get("detail", "")).lower()
        assert "taken" in detail or "already" in detail

    def test_invalid_short_username_rejected(self, s, fresh_user):
        r = s.put(
            f"{API}/auth/me",
            json={"username": "ab"},
            headers={"Authorization": f"Bearer {fresh_user['token']}"},
        )
        # min_length=3 → pydantic 422 OR server 400
        assert r.status_code in (400, 422), r.text

    def test_invalid_chars_rejected(self, s, fresh_user):
        r = s.put(
            f"{API}/auth/me",
            json={"username": "bad handle!"},
            headers={"Authorization": f"Bearer {fresh_user['token']}"},
        )
        assert r.status_code in (400, 422), r.text

    def test_founder_username_unchanged(self, s):
        """Sanity: after all this, founder still resolves."""
        r = s.get(f"{API}/users/@{FOUNDER_USERNAME}")
        assert r.status_code == 200
        assert r.json()["username"] == FOUNDER_USERNAME
