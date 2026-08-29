"""Iteration 11 — Forgot-password sandbox fallback + reset-flow verification.

Bug: Resend API key is in TEST/SANDBOX mode; it returns HTTP 403 for any
recipient except the account owner's verified email. The fix surfaces a
`dev_code` fallback + `email_status` reason so the UI can guide the user.

This suite verifies:
  1. /api/auth/forgot-password for the founder → status=ok, email_status="sandbox_mode", dev_code present.
  2. /api/auth/forgot-password for a non-existent email → status=ok, email_status="not_attempted", no dev_code.
  3. End-to-end reset via dev_code → login with new password → reset back to Semi123!.
  4. Backend log contains the "[resend] SANDBOX MODE: cannot deliver to semidiepie@gmail.com — verify a domain" line.
"""
import os
import re
import subprocess
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PW = "Semi123!"
TEMP_PW = "TEST_Iter11_TempPw!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    return api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})


class TestForgotPasswordContract:
    """Contract of POST /api/auth/forgot-password."""

    def test_founder_returns_sandbox_mode_with_dev_code(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": FOUNDER_EMAIL})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("email_status") == "sandbox_mode", (
            f"expected email_status=sandbox_mode, got {body.get('email_status')}. "
            f"If Resend has been given a verified domain, this test now needs to expect 'ok' instead."
        )
        code = body.get("dev_code")
        assert isinstance(code, str) and re.fullmatch(r"\d{6}", code), (
            f"dev_code must be a 6-digit string, got {code!r}"
        )

    def test_unknown_email_returns_not_attempted_without_dev_code(self, api):
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "nobody@nowhere.example"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("email_status") == "not_attempted"
        assert "dev_code" not in body, f"leaked dev_code for unknown email: {body}"


class TestResetFlowRoundTrip:
    """Reset-password flow: dev_code → verify → reset → login with new pw → reset back."""

    def test_end_to_end_reset_then_restore(self, api):
        # 1. Request code
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": FOUNDER_EMAIL})
        assert r.status_code == 200, r.text
        body = r.json()
        code = body.get("dev_code")
        assert code, f"no dev_code in response: {body}"

        # 2. Verify code
        rv = api.post(
            f"{BASE_URL}/api/auth/verify-reset-code",
            json={"email": FOUNDER_EMAIL, "code": code},
        )
        assert rv.status_code == 200, rv.text
        assert rv.json().get("status") == "ok"

        # 3. Reset to temp password
        rr = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"email": FOUNDER_EMAIL, "code": code, "new_password": TEMP_PW},
        )
        assert rr.status_code == 200, rr.text
        token_body = rr.json()
        assert token_body.get("access_token"), f"no access_token: {token_body}"
        assert token_body.get("user", {}).get("email") == FOUNDER_EMAIL

        # 4. Old password must no longer work
        r_old = _login(api, FOUNDER_EMAIL, FOUNDER_PW)
        assert r_old.status_code in (400, 401, 403), (
            f"old password still worked after reset: {r_old.status_code} {r_old.text}"
        )

        # 5. New password works
        r_new = _login(api, FOUNDER_EMAIL, TEMP_PW)
        assert r_new.status_code == 200, r_new.text

        # 6. Restore: get fresh dev_code, verify, reset back to Semi123!
        r2 = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": FOUNDER_EMAIL})
        assert r2.status_code == 200, r2.text
        code2 = r2.json().get("dev_code")
        assert code2, f"no restore dev_code: {r2.json()}"

        rv2 = api.post(
            f"{BASE_URL}/api/auth/verify-reset-code",
            json={"email": FOUNDER_EMAIL, "code": code2},
        )
        assert rv2.status_code == 200, rv2.text

        rr2 = api.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"email": FOUNDER_EMAIL, "code": code2, "new_password": FOUNDER_PW},
        )
        assert rr2.status_code == 200, rr2.text

        # 7. Confirm Semi123! is back
        r_final = _login(api, FOUNDER_EMAIL, FOUNDER_PW)
        assert r_final.status_code == 200, (
            f"CRITICAL: founder password NOT restored to Semi123! — {r_final.status_code} {r_final.text}"
        )


class TestSandboxLogLine:
    """Backend supervisor log should contain the SANDBOX MODE warning after a forgot-password call to the founder."""

    def test_sandbox_log_line_present(self, api):
        # Trigger a fresh call so the log line is recent
        r = api.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": FOUNDER_EMAIL})
        assert r.status_code == 200
        # Give supervisor a moment to flush
        time.sleep(1.0)
        out = subprocess.run(
            ["bash", "-lc", "tail -n 400 /var/log/supervisor/backend.*.log 2>/dev/null || true"],
            capture_output=True, text=True, timeout=10,
        )
        blob = (out.stdout or "") + (out.stderr or "")
        needle = "[resend] SANDBOX MODE: cannot deliver to semidiepie@gmail.com"
        assert needle in blob, (
            f"expected log line containing {needle!r} in backend logs. "
            f"tail sample: ...{blob[-800:]}"
        )
        assert "verify a domain" in blob, "log line should mention 'verify a domain' guidance"


class TestRegressionAuth:
    """Regression: login still works with founder credentials at end of suite."""

    def test_founder_can_login(self, api):
        r = _login(api, FOUNDER_EMAIL, FOUNDER_PW)
        assert r.status_code == 200, r.text
        assert r.json().get("access_token")
