"""Iteration 23: Password-reset LINK flow (replacing the old 6-digit code + 4-digit PIN flow).

Covers:
- POST /api/auth/forgot-password: always 200, dev_link surfaced in sandbox, previous token invalidated
- POST /api/auth/reset-password: valid token -> access_token + user (auto sign-in), single-use, expiry
- Removed endpoints -> 404
- Regressions: /auth/login works with new password, /auth/change-password still works, /auth/me works,
  UserPublic no longer includes reset_pin_enabled
"""
import time
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


# ---------- helpers ----------
def _login(email, password):
    return requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})


def _forgot(email):
    return requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})


def _reset(token, new_password):
    return requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "new_password": new_password})


def _token_from_dev_link(link):
    # dev_link like https://.../reset-password?token=XYZ
    assert "token=" in link, f"no token in dev_link: {link}"
    return link.split("token=", 1)[1]


# ---------- forgot-password ----------
class TestForgotPassword:
    def test_forgot_returns_200_and_dev_link_for_existing_email(self):
        r = _forgot(FOUNDER_EMAIL)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"
        assert "email_status" in body
        # In sandbox mode, dev_link is surfaced. If email actually went through (Resend prod),
        # dev_link would be absent; but for preview env it must be present.
        assert body.get("dev_link"), f"expected dev_link in sandbox mode, body={body}"
        assert "/reset-password?token=" in body["dev_link"]

    def test_forgot_returns_200_for_unknown_email_no_enumeration(self):
        r = _forgot("nobody-xyz-test@example.com")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"
        # No dev_link for unknown email (no token was minted)
        assert "dev_link" not in body or body.get("dev_link") in (None, "")

    def test_forgot_invalidates_previous_unused_token(self):
        r1 = _forgot(FOUNDER_EMAIL)
        assert r1.status_code == 200
        t1 = _token_from_dev_link(r1.json()["dev_link"])
        r2 = _forgot(FOUNDER_EMAIL)
        assert r2.status_code == 200
        t2 = _token_from_dev_link(r2.json()["dev_link"])
        assert t1 != t2
        # Old token must now be invalid (marked used=True by invalidation)
        r_bad = _reset(t1, "SomeNewPass123!")
        assert r_bad.status_code == 400, f"expected 400 for invalidated token, got {r_bad.status_code} {r_bad.text}"


# ---------- reset-password ----------
class TestResetPassword:
    def test_valid_token_resets_password_and_signs_in(self):
        # Get a fresh token
        r = _forgot(FOUNDER_EMAIL)
        token = _token_from_dev_link(r.json()["dev_link"])
        # Reset to a temporary password
        temp_pw = "TempReset123!"
        r2 = _reset(token, temp_pw)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "access_token" in body and isinstance(body["access_token"], str) and len(body["access_token"]) > 10
        assert "user" in body
        u = body["user"]
        assert u["email"].lower() == FOUNDER_EMAIL.lower()
        # UserPublic should NOT include reset_pin_enabled
        assert "reset_pin_enabled" not in u

        # Login with the new password should now succeed
        r_login = _login(FOUNDER_EMAIL, temp_pw)
        assert r_login.status_code == 200, r_login.text

        # Reuse of the same token must fail (single-use)
        r_reuse = _reset(token, "AnotherPass123!")
        assert r_reuse.status_code == 400, f"expected 400 on reuse, got {r_reuse.status_code}"

        # -------- restore original password so test_credentials.md stays valid --------
        # Re-mint a token and reset back to FOUNDER_PASSWORD
        r3 = _forgot(FOUNDER_EMAIL)
        token2 = _token_from_dev_link(r3.json()["dev_link"])
        r4 = _reset(token2, FOUNDER_PASSWORD)
        assert r4.status_code == 200, r4.text
        # Verify original password works
        r_verify = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
        assert r_verify.status_code == 200, r_verify.text

    def test_invalid_token_returns_400(self):
        r = _reset("garbage-not-a-real-token-xxxxxxxxxx", "AnyPass123!")
        assert r.status_code == 400, r.text

    def test_short_password_returns_422(self):
        r = _forgot(FOUNDER_EMAIL)
        token = _token_from_dev_link(r.json()["dev_link"])
        r2 = _reset(token, "abc")  # < 6 chars
        assert r2.status_code == 422, r2.text
        # NB: this leaves an unused token; the next forgot-password call will invalidate it,
        # which is fine — we don't want to actually reset the password here.


# ---------- removed endpoints ----------
class TestRemovedEndpoints:
    """These endpoints were removed as part of iteration 23 refactor."""

    def test_verify_reset_code_removed(self):
        r = requests.post(f"{BASE_URL}/api/auth/verify-reset-code", json={"email": FOUNDER_EMAIL, "code": "123456"})
        assert r.status_code == 404, f"expected 404 (removed), got {r.status_code}"

    def test_forgot_password_pin_removed(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password-pin",
                          json={"email": FOUNDER_EMAIL, "pin": "1234", "new_password": "Whatever123!"})
        assert r.status_code == 404, f"expected 404 (removed), got {r.status_code}"

    def test_reset_pin_get_removed(self):
        # Would previously need auth, but 404 should short-circuit before auth
        r = requests.get(f"{BASE_URL}/api/auth/reset-pin")
        assert r.status_code == 404, f"expected 404 (removed), got {r.status_code}"

    def test_reset_pin_post_removed(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-pin", json={"pin": "1234"})
        assert r.status_code == 404, f"expected 404 (removed), got {r.status_code}"

    def test_has_pin_removed(self):
        r = requests.post(f"{BASE_URL}/api/auth/has-pin", json={"email": FOUNDER_EMAIL})
        assert r.status_code == 404, f"expected 404 (removed), got {r.status_code}"


# ---------- regression ----------
class TestRegression:
    def test_login_still_works(self):
        r = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body
        assert "user" in body
        assert "reset_pin_enabled" not in body["user"], "UserPublic should not include reset_pin_enabled"

    def test_auth_me_works_and_no_reset_pin_field(self):
        r = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
        assert r.status_code == 200
        token = r.json()["access_token"]
        r2 = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200, r2.text
        u = r2.json()
        assert "reset_pin_enabled" not in u
        assert u["email"].lower() == FOUNDER_EMAIL.lower()

    def test_change_password_still_works(self):
        # Login
        r = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
        assert r.status_code == 200
        token = r.json()["access_token"]
        # Change to temp
        temp_pw = "TempChg456!"
        r2 = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": FOUNDER_PASSWORD, "new_password": temp_pw},
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "access_token" in body
        # Verify new password works
        r3 = _login(FOUNDER_EMAIL, temp_pw)
        assert r3.status_code == 200
        # Restore original
        token2 = r3.json()["access_token"]
        r4 = requests.post(
            f"{BASE_URL}/api/auth/change-password",
            headers={"Authorization": f"Bearer {token2}"},
            json={"current_password": temp_pw, "new_password": FOUNDER_PASSWORD},
        )
        assert r4.status_code == 200, r4.text
        r5 = _login(FOUNDER_EMAIL, FOUNDER_PASSWORD)
        assert r5.status_code == 200
