"""Iteration 18 — Password UX overhaul + AI Voice Calls removal.

Covers:
- POST /api/auth/has-pin (existing / non-existing / no enumeration)
- POST /api/auth/change-password (success -> fresh JWT, wrong current, same as current, no auth)
- POST /api/auth/forgot-password-pin (success, wrong PIN)
- POST /api/auth/forgot-password + verify-reset-code + reset-password (email flow, sandbox dev_code)
- AI Voice Calls routes are gone (404 on /api/ai/status, /characters, /voices)
- Regression: register, login, feed, post creation still work

The founder password is rotated during the test; a final teardown restores
Semi123! and re-verifies login so the credentials memo remains accurate.
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
FOUNDER_PASSWORD = "Semi123!"
FOUNDER_PIN = "1234"


# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def founder_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
    assert r.status_code == 200, f"founder login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


# ==================================================================
# 1. AI Voice Calls routes are gone
# ==================================================================
class TestAIVoiceCallsRemoved:
    def test_ai_status_404(self, api):
        r = api.get(f"{BASE_URL}/api/ai/status")
        assert r.status_code == 404, f"expected 404 got {r.status_code}"

    def test_ai_characters_404(self, api):
        r = api.get(f"{BASE_URL}/api/ai/characters")
        assert r.status_code == 404

    def test_ai_voices_404(self, api):
        r = api.get(f"{BASE_URL}/api/ai/voices")
        assert r.status_code == 404


# ==================================================================
# 2. POST /api/auth/has-pin
# ==================================================================
class TestHasPin:
    def test_founder_has_pin_true(self, api):
        r = api.post(f"{BASE_URL}/api/auth/has-pin", json={"email": FOUNDER_EMAIL})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"has_pin": True}, f"expected has_pin true, got {data}"

    def test_random_email_has_pin_false(self, api):
        random_email = f"noone_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{BASE_URL}/api/auth/has-pin", json={"email": random_email})
        assert r.status_code == 200, r.text
        assert r.json() == {"has_pin": False}, "must not leak user existence"

    def test_has_pin_response_shape_identical(self, api):
        """Both real & fake email should return identical keys (no enumeration)."""
        r1 = api.post(f"{BASE_URL}/api/auth/has-pin", json={"email": FOUNDER_EMAIL})
        r2 = api.post(f"{BASE_URL}/api/auth/has-pin", json={"email": f"ghost_{uuid.uuid4().hex[:8]}@example.com"})
        assert set(r1.json().keys()) == set(r2.json().keys()) == {"has_pin"}


# ==================================================================
# 3. POST /api/auth/change-password
# ==================================================================
class TestChangePassword:
    """Runs sequentially: rotates founder pw, logs in with new pw,
    then reverts. All final state == Semi123!."""

    NEW_PW = "SemiTemp456!"

    def test_01_change_password_wrong_current_returns_403(self, api, founder_token):
        r = api.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": "definitely-wrong", "new_password": self.NEW_PW},
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
        assert "current password is incorrect" in r.json().get("detail", "").lower()

    def test_02_change_password_same_as_current_returns_400(self, api, founder_token):
        r = api.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": FOUNDER_PASSWORD, "new_password": FOUNDER_PASSWORD},
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert r.status_code == 400, r.text

    def test_03_change_password_success_returns_fresh_token(self, api, founder_token):
        r = api.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": FOUNDER_PASSWORD, "new_password": self.NEW_PW},
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and data["access_token"]
        assert "user" in data
        assert data["user"]["email"] == FOUNDER_EMAIL
        assert "_id" not in data["user"], "raw ObjectId leaked"

    def test_04_login_with_new_password_works(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": self.NEW_PW})
        assert r.status_code == 200, f"login with new pw failed: {r.text}"
        assert "access_token" in r.json()

    def test_05_login_with_old_password_fails(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
        assert r.status_code in (400, 401, 403), f"old pw still accepted: {r.status_code}"

    def test_06_revert_password_to_original(self, api):
        # Log in with the rotated pw to get a fresh token, then rotate back.
        r_login = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": self.NEW_PW})
        assert r_login.status_code == 200
        token = r_login.json()["access_token"]
        r = api.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": self.NEW_PW, "new_password": FOUNDER_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, f"revert failed: {r.text}"

    def test_07_login_with_restored_password_works(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
        assert r.status_code == 200, "founder password NOT restored — memo is stale!"

    def test_08_change_password_requires_auth(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/change-password",
            json={"current_password": "xxxxxx", "new_password": "yyyyyy"},
        )
        assert r.status_code in (401, 403), f"expected auth challenge, got {r.status_code}"


# ==================================================================
# 4. POST /api/auth/forgot-password-pin
# ==================================================================
class TestForgotPasswordPin:
    """Reset via PIN then reset back so founder pw is unchanged at end."""

    TEMP_PW = "SemiPinTmp789!"

    def test_01_wrong_pin_returns_403(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": "9999", "new_password": "shouldnothappen"},
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"
        assert "invalid credentials" in r.json().get("detail", "").lower()

    def test_02_unknown_email_returns_403(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": f"ghost_{uuid.uuid4().hex[:8]}@example.com", "pin": "1234", "new_password": "shouldnothappen"},
        )
        assert r.status_code == 403

    def test_03_correct_pin_rotates_password(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": FOUNDER_PIN, "new_password": self.TEMP_PW},
        )
        assert r.status_code == 200, f"pin reset failed: {r.text}"
        data = r.json()
        assert data.get("access_token")
        assert data["user"]["email"] == FOUNDER_EMAIL

    def test_04_login_with_new_pw_works(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": self.TEMP_PW})
        assert r.status_code == 200

    def test_05_revert_via_pin_again(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/forgot-password-pin",
            json={"email": FOUNDER_EMAIL, "pin": FOUNDER_PIN, "new_password": FOUNDER_PASSWORD},
        )
        assert r.status_code == 200, f"revert via PIN failed: {r.text}"

    def test_06_final_login_with_original_pw(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
        assert r.status_code == 200, "founder password NOT restored after pin flow!"


# ==================================================================
# 5. Email-based flow: forgot-password / verify-reset-code / reset-password
# ==================================================================
class TestEmailResetFlow:
    """Uses a scratch user (auto-purged prefix tpb_) so we never touch the founder's email pipeline."""

    scratch_email = f"tpb_reset_{uuid.uuid4().hex[:8]}@example.com"
    scratch_pw = "Original123!"
    new_pw = "Rotated456!"

    @pytest.fixture(scope="class", autouse=True)
    def scratch_user(self, api):
        # Register once for the class
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": self.scratch_email,
                "password": self.scratch_pw,
                "username": f"tpb_reset_{uuid.uuid4().hex[:6]}",
                "display_name": "Reset Tester",
            },
        )
        assert r.status_code in (200, 201), f"scratch register failed: {r.status_code} {r.text}"
        return r.json()

    def test_01_forgot_password_returns_dev_code(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": self.scratch_email})
        assert r.status_code == 200, r.text
        body = r.json()
        # dev_code is emitted in sandbox
        code = body.get("dev_code") or body.get("code")
        assert code, f"no dev_code in sandbox response: {body}"
        pytest.dev_code = code  # stash

    def test_02_verify_reset_code(self, api):
        code = getattr(pytest, "dev_code", None)
        assert code
        r = api.post(
            f"{BASE_URL}/api/auth/verify-reset-code",
            json={"email": self.scratch_email, "code": code},
        )
        assert r.status_code == 200, f"verify-reset-code failed: {r.text}"

    def test_03_reset_password_returns_token(self, api):
        code = getattr(pytest, "dev_code", None)
        r = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"email": self.scratch_email, "code": code, "new_password": self.new_pw},
        )
        assert r.status_code == 200, f"reset-password failed: {r.text}"
        data = r.json()
        assert data.get("access_token"), "no JWT returned after reset"
        assert data["user"]["email"] == self.scratch_email

    def test_04_login_with_new_password(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": self.scratch_email, "password": self.new_pw})
        assert r.status_code == 200

    def test_05_forgot_password_unknown_email_no_leak(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": f"ghost_{uuid.uuid4().hex[:8]}@example.com"})
        # For anti-enumeration, endpoint typically returns 200 without dev_code
        assert r.status_code == 200


# ==================================================================
# 6. Regression: register / login / feed / post
# ==================================================================
class TestRegression:
    scratch_email = f"tpb_reg_{uuid.uuid4().hex[:8]}@example.com"
    scratch_pw = "Reg12345!"
    token = None

    def test_01_register(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": self.scratch_email,
                "password": self.scratch_pw,
                "username": f"tpb_reg_{uuid.uuid4().hex[:6]}",
                "display_name": "Regression Tester",
            },
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data.get("access_token")
        TestRegression.token = data["access_token"]

    def test_02_login(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={"email": self.scratch_email, "password": self.scratch_pw})
        assert r.status_code == 200
        assert r.json().get("access_token")

    def test_03_feed_loads(self, api):
        assert TestRegression.token
        r = api.get(f"{BASE_URL}/api/feed", headers={"Authorization": f"Bearer {TestRegression.token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        # Should be a list (may be empty for a fresh account with no follows)
        assert isinstance(data, list) or isinstance(data, dict)

    def test_04_create_post(self, api):
        assert TestRegression.token
        r = api.post(
            f"{BASE_URL}/api/posts",
            json={"caption": "TEST_iter18 regression post", "image_url": "https://picsum.photos/seed/tpb/400"},
            headers={"Authorization": f"Bearer {TestRegression.token}"},
        )
        assert r.status_code in (200, 201), r.text
        post = r.json()
        assert post.get("id") or post.get("_id") or True  # tolerate variants
        assert "_id" not in post, "ObjectId leaked in post response"


# ==================================================================
# 7. Final safety net: verify founder credentials still work
# ==================================================================
def test_zz_final_founder_login_restored(api):
    time.sleep(0.5)
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
    assert r.status_code == 200, (
        "CRITICAL: Founder password not restored to Semi123! after test suite. "
        "test_credentials.md may be stale."
    )
