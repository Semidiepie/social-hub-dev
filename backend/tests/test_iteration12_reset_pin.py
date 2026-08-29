"""Iteration 12 — 4-digit password-reset PIN + reels contract regression.

Feature 1: /api/auth/reset-pin (POST/GET) + /api/auth/forgot-password-pin
Feature 2: /api/reels still returns H.264-forced Cloudinary URL for founder.

IMPORTANT: This suite RESTORES founder password to Semi123! and CLEARS the
founder PIN at teardown so downstream iterations start clean.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://social-hub-dev-4.preview.emergentagent.com",
).rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PW = "Semi123!"
NEW_PW = "TestPin1!"
PIN = "1234"


def _login(pw: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": pw},
        timeout=15,
    )
    assert r.status_code == 200, f"login({pw}) failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============================================================
# Feature 1 — reset PIN
# ============================================================
@pytest.fixture(scope="module")
def founder_token():
    return _login(FOUNDER_PW)


@pytest.fixture(scope="module", autouse=True)
def cleanup_after_all(request):
    """Guarantee: after this module, founder pw = Semi123! and PIN cleared."""
    yield
    # 1. Try current known password states in order.
    tok = None
    for pw in (NEW_PW, FOUNDER_PW):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": FOUNDER_EMAIL, "password": pw},
            timeout=15,
        )
        if r.status_code == 200:
            tok = r.json()["access_token"]
            current_pw = pw
            break
    assert tok, "Could not log in as founder during teardown"

    # 2. Restore password to Semi123! if needed.
    if current_pw != FOUNDER_PW:
        # There is no direct password-change endpoint that uses a JWT alone.
        # Fastest reliable path: use the PIN flow to rotate back (a valid PIN
        # was left set at the time of the pw change).  If no PIN, use the
        # email reset code flow — but we always leave a PIN available in the
        # failing case.  In the happy path we already restored earlier so
        # current_pw == FOUNDER_PW.
        r = requests.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": PIN, "new_password": FOUNDER_PW},
            timeout=15,
        )
        assert r.status_code == 200, f"teardown pw restore failed: {r.status_code} {r.text}"
        tok = r.json()["access_token"]

    # 3. Clear PIN (best effort — may already be cleared).
    r = requests.post(
        f"{BASE_URL}/api/auth/reset-pin",
        json={"current_password": FOUNDER_PW, "pin": None},
        headers=_headers(tok),
        timeout=15,
    )
    assert r.status_code == 200, f"teardown pin clear failed: {r.status_code} {r.text}"

    # 4. Final sanity: login with Semi123! + PIN cleared.
    tok2 = _login(FOUNDER_PW)
    st = requests.get(
        f"{BASE_URL}/api/auth/reset-pin", headers=_headers(tok2), timeout=15
    ).json()
    assert st == {"enabled": False, "set_at": None}, f"teardown final state: {st}"


class TestResetPinLifecycle:
    def test_01_initial_status_disabled(self, founder_token):
        r = requests.get(
            f"{BASE_URL}/api/auth/reset-pin",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body == {"enabled": False, "set_at": None}

    def test_02_wrong_current_password_403(self, founder_token):
        r = requests.post(
            f"{BASE_URL}/api/auth/reset-pin",
            json={"current_password": "wrong-pass", "pin": PIN},
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 403, r.text
        assert r.json().get("detail") == "Invalid credentials"

    def test_03_set_pin_ok(self, founder_token):
        r = requests.post(
            f"{BASE_URL}/api/auth/reset-pin",
            json={"current_password": FOUNDER_PW, "pin": PIN},
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok", "enabled": True}

        # GET now reports enabled + set_at datetime
        r2 = requests.get(
            f"{BASE_URL}/api/auth/reset-pin",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert r2.status_code == 200
        b = r2.json()
        assert b["enabled"] is True
        assert isinstance(b["set_at"], str) and len(b["set_at"]) > 10

        # /api/auth/me includes reset_pin_enabled=True
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=_headers(founder_token),
            timeout=15,
        )
        assert me.status_code == 200
        assert me.json().get("reset_pin_enabled") is True
        assert "reset_pin_hash" not in me.json()

    def test_04_forgot_password_pin_success(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": PIN, "new_password": NEW_PW},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body and body["access_token"]
        assert body["user"]["email"] == FOUNDER_EMAIL
        assert body["user"].get("reset_pin_enabled") is True  # PIN still set

        # Old pw fails
        r_old = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PW},
            timeout=15,
        )
        assert r_old.status_code in (400, 401, 403), r_old.text

        # New pw works
        r_new = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": FOUNDER_EMAIL, "password": NEW_PW},
            timeout=15,
        )
        assert r_new.status_code == 200, r_new.text

    def test_05_wrong_pin_5x_then_lockout(self):
        # 5 wrong pin attempts → each 403, 5th sets lockout.
        for i in range(5):
            r = requests.post(
                f"{BASE_URL}/api/auth/forgot-password-pin",
                json={"email": FOUNDER_EMAIL, "pin": "9999", "new_password": "IrrelevantX1!"},
                timeout=15,
            )
            assert r.status_code == 403, f"attempt {i+1}: {r.status_code} {r.text}"

        # 6th attempt (or any subsequent) → 429 with Retry-After
        r6 = requests.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": "9999", "new_password": "IrrelevantX1!"},
            timeout=15,
        )
        assert r6.status_code == 429, f"expected lockout: {r6.status_code} {r6.text}"
        assert "Retry-After" in r6.headers, f"missing Retry-After: {dict(r6.headers)}"
        assert int(r6.headers["Retry-After"]) > 0

    def test_06_enumeration_ghost_email_generic_403(self):
        # Non-existent email must NOT reveal existence — same 403 shape.
        t0 = time.perf_counter()
        r = requests.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": "ghost@nowhere.example", "pin": "1234", "new_password": "IrrelevantX1!"},
            timeout=15,
        )
        elapsed = time.perf_counter() - t0
        assert r.status_code == 403, r.text
        assert r.json().get("detail") == "Invalid credentials"
        # Sanity: not a suspicious sub-10ms short-circuit response.
        assert elapsed > 0.02, f"suspiciously fast ghost response: {elapsed}"

    def test_07_restore_password_via_pin_flow(self):
        """We locked the founder in test_05.  Reset the counter by DB update?
        No — we bypass the lock by first waiting isn't feasible.  Instead, use
        the admin/superadmin login path is not available.  The lock is on the
        forgot-password-pin flow — normal login still works with NEW_PW.

        So: log in with NEW_PW, restore pw to FOUNDER_PW via reset-pin =
        wait, reset-pin sets the PIN, it doesn't change the password.

        Actual plan: There's no JWT-only change-password endpoint (only via
        email reset flow or PIN flow).  Since PIN flow is locked, we must
        wait for the lockout OR clear it via DB.  Neither is available in
        pure API surface.  Instead, we do the password rotation using the
        SAME forgot-password-pin call — but we need the lock cleared first.

        The lock clears itself after 15 minutes.  We can't test-wait.  So
        we do the rotation-back at THIS test point BEFORE test_05 runs.

        Workaround: this test runs teardown restore below by directly
        clearing the lock via a fresh PIN set (which also resets the
        failed-attempts counter to 0 and locked_until to None per the
        server code path).
        """
        # Log in with new password (login is not lockout-gated).
        tok = _login(NEW_PW)

        # Setting a PIN clears reset_pin_failed_attempts + locked_until.
        r = requests.post(
            f"{BASE_URL}/api/auth/reset-pin",
            json={"current_password": NEW_PW, "pin": PIN},
            headers=_headers(tok),
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # Now the forgot-password-pin flow works again — use it to rotate
        # password back to FOUNDER_PW.
        r2 = requests.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": PIN, "new_password": FOUNDER_PW},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text

        # Confirm login with FOUNDER_PW.
        _login(FOUNDER_PW)

    def test_08_clear_pin(self):
        tok = _login(FOUNDER_PW)
        r = requests.post(
            f"{BASE_URL}/api/auth/reset-pin",
            json={"current_password": FOUNDER_PW, "pin": None},
            headers=_headers(tok),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "cleared", "enabled": False}

        st = requests.get(
            f"{BASE_URL}/api/auth/reset-pin",
            headers=_headers(tok),
            timeout=15,
        ).json()
        assert st == {"enabled": False, "set_at": None}

        # forgot-password-pin now fails with 403 (no PIN set).
        r2 = requests.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": PIN, "new_password": "AnotherX1!"},
            timeout=15,
        )
        assert r2.status_code == 403, r2.text

        # Confirm pw still Semi123!
        _login(FOUNDER_PW)


# ============================================================
# Feature 2 — reels API still returns H.264-forced URL
# ============================================================
class TestReelsRegression:
    def test_10_reels_h264_forced(self):
        r = requests.get(f"{BASE_URL}/api/reels", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        founder = [x for x in items if x.get("user", {}).get("email") == FOUNDER_EMAIL] or items
        first = founder[0]
        url = first.get("video_url") or ""
        assert "f_mp4" in url and "vc_h264" in url and "q_auto" in url, url
