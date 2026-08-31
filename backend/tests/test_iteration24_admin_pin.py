"""Iteration 24 — Admin-managed 4-digit password-reset PIN feature.

Covers:
  * POST /api/auth/reset-with-pin (public)  — success, invalid, lockout, no-pin
  * POST /api/admin/users/{user_id}/reset-pin (super admin) — set / change / clear
  * GET  /api/admin/users — returns has_reset_pin flag; non-admin blocked
  * Founder fixed PIN 7455 works
  * Light regression on email-LINK reset (iteration 23)
  * Restore founder password to Semi123! at end of run
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")  # same shared backend
API = f"{BASE_URL}/api"

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PW = "Semi123!"
FOUNDER_PIN = "7455"


# ----------------------- helpers -----------------------

def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body and "user" in body
    return body


def _register(email: str, username: str, password: str, display_name: str = "T") -> dict:
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "username": username, "password": password, "display_name": display_name},
        timeout=15,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ----------------------- fixtures -----------------------

@pytest.fixture(scope="module")
def founder_token() -> str:
    return _login(FOUNDER_EMAIL, FOUNDER_PW)["access_token"]


@pytest.fixture(scope="module")
def scratch_user() -> dict:
    """Fresh test_* user (auto-purged on backend restart)."""
    uniq = uuid.uuid4().hex[:8]
    email = f"test_pin_{uniq}@example.com"
    username = f"test_pin_{uniq}"
    password = "InitialPw!1"
    reg = _register(email, username, password)
    return {
        "id": reg["user"]["id"],
        "email": email,
        "username": username,
        "password": password,
        "token": reg["access_token"],
    }


# ============================================================
# 1. Founder fixed reset PIN 7455 (force-seeded on startup)
# ============================================================

def test_founder_has_reset_pin_flag(founder_token: str):
    r = requests.get(f"{API}/admin/users", params={"q": FOUNDER_EMAIL}, headers=_hdr(founder_token), timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    founder_row = next((u for u in rows if u.get("email") == FOUNDER_EMAIL), None)
    assert founder_row is not None, f"founder not found in admin list: {rows}"
    assert founder_row["has_reset_pin"] is True


def test_founder_reset_with_fixed_pin_and_restore():
    """Reset founder pw via PIN 7455, sign-in returned, then restore via change-password."""
    tmp_pw = "TmpFounder!42"
    r = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": FOUNDER_EMAIL, "pin": FOUNDER_PIN, "new_password": tmp_pw},
        timeout=15,
    )
    assert r.status_code == 200, f"founder PIN reset failed: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body and body["user"]["email"] == FOUNDER_EMAIL

    # login with new password must work
    new_token = _login(FOUNDER_EMAIL, tmp_pw)["access_token"]

    # RESTORE founder password immediately using logged-in change-password
    restore = requests.post(
        f"{API}/auth/change-password",
        json={"current_password": tmp_pw, "new_password": FOUNDER_PW},
        headers=_hdr(new_token),
        timeout=15,
    )
    assert restore.status_code == 200, f"failed to restore founder pw: {restore.status_code} {restore.text}"

    # sanity: login with Semi123! again
    _login(FOUNDER_EMAIL, FOUNDER_PW)


# ============================================================
# 2. Admin set / change / clear PIN for another user
# ============================================================

def test_admin_set_change_clear_pin(founder_token: str, scratch_user: dict):
    uid = scratch_user["id"]

    # 2a. SET
    r = requests.post(
        f"{API}/admin/users/{uid}/reset-pin",
        json={"pin": "1234"},
        headers=_hdr(founder_token),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"id": uid, "has_reset_pin": True}

    # Verify PIN works
    reset = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": scratch_user["email"], "pin": "1234", "new_password": "AfterSet!1"},
        timeout=15,
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["user"]["id"] == uid

    # 2b. CHANGE PIN
    r = requests.post(
        f"{API}/admin/users/{uid}/reset-pin",
        json={"pin": "5678"},
        headers=_hdr(founder_token),
        timeout=15,
    )
    assert r.status_code == 200 and r.json()["has_reset_pin"] is True

    # Old PIN 1234 must now fail
    bad = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": scratch_user["email"], "pin": "1234", "new_password": "ShouldFail!1"},
        timeout=15,
    )
    assert bad.status_code == 403, bad.text

    # New PIN 5678 works
    ok = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": scratch_user["email"], "pin": "5678", "new_password": "AfterChange!1"},
        timeout=15,
    )
    assert ok.status_code == 200, ok.text

    # 2c. CLEAR PIN (send pin=null)
    r = requests.post(
        f"{API}/admin/users/{uid}/reset-pin",
        json={"pin": None},
        headers=_hdr(founder_token),
        timeout=15,
    )
    assert r.status_code == 200 and r.json() == {"id": uid, "has_reset_pin": False}

    # has_reset_pin flag reflects cleared state in admin list
    r = requests.get(
        f"{API}/admin/users",
        params={"q": scratch_user["username"]},
        headers=_hdr(founder_token),
        timeout=15,
    )
    row = next((u for u in r.json() if u["id"] == uid), None)
    assert row is not None
    assert row["has_reset_pin"] is False

    # reset-with-pin now yields 403 "No reset PIN is set"
    none = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": scratch_user["email"], "pin": "5678", "new_password": "Nope!12"},
        timeout=15,
    )
    assert none.status_code == 403


# ============================================================
# 3. Wrong PIN → after MAX_PIN_ATTEMPTS (5) lockout for 15 min
# ============================================================

def test_wrong_pin_lockout(founder_token: str):
    # Fresh user so counter starts at 0
    uniq = uuid.uuid4().hex[:8]
    email = f"test_lock_{uniq}@example.com"
    username = f"test_lock_{uniq}"
    _register(email, username, "Init!123")

    # look up id via admin list
    r = requests.get(f"{API}/admin/users", params={"q": username}, headers=_hdr(founder_token), timeout=15)
    uid = next(u["id"] for u in r.json() if u["username"] == username)

    # set a real PIN so we can trip the wrong-pin branch
    r = requests.post(
        f"{API}/admin/users/{uid}/reset-pin",
        json={"pin": "9999"},
        headers=_hdr(founder_token),
        timeout=15,
    )
    assert r.status_code == 200

    # 5 wrong attempts → 5th attempt should still return 403; the 6th should be 429 (locked)
    for i in range(5):
        bad = requests.post(
            f"{API}/auth/reset-with-pin",
            json={"email": email, "pin": "0000", "new_password": "SomeNew!12"},
            timeout=15,
        )
        assert bad.status_code == 403, f"attempt {i+1}: {bad.status_code} {bad.text}"

    # Now user is locked. Even the CORRECT pin should be blocked with 429.
    locked = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": email, "pin": "9999", "new_password": "PostLock!12"},
        timeout=15,
    )
    assert locked.status_code == 429, f"expected 429 lockout, got {locked.status_code} {locked.text}"
    # Retry-After header should be present and ~15min-ish
    ra = locked.headers.get("Retry-After")
    assert ra is not None and int(ra) > 0


# ============================================================
# 4. Authorization guards
# ============================================================

def test_non_admin_cannot_hit_admin_endpoints(scratch_user: dict, founder_token: str):
    # need founder token to look up any user_id
    r = requests.get(f"{API}/admin/users", params={"q": ""}, headers=_hdr(founder_token), timeout=15)
    assert r.status_code == 200
    some_uid = r.json()[0]["id"]

    # As non-admin: POST reset-pin → 403
    r = requests.post(
        f"{API}/admin/users/{some_uid}/reset-pin",
        json={"pin": "1234"},
        headers=_hdr(scratch_user["token"]),
        timeout=15,
    )
    assert r.status_code == 403, r.text

    # As non-admin: GET /admin/users → 403
    r = requests.get(f"{API}/admin/users", headers=_hdr(scratch_user["token"]), timeout=15)
    assert r.status_code == 403, r.text

    # As anonymous: expect 401 or 403
    r = requests.get(f"{API}/admin/users", timeout=15)
    assert r.status_code in (401, 403)
    r = requests.post(f"{API}/admin/users/{some_uid}/reset-pin", json={"pin": "1234"}, timeout=15)
    assert r.status_code in (401, 403)


# ============================================================
# 5. Reset-with-pin validation edge cases
# ============================================================

def test_reset_with_pin_validation():
    # Bad PIN format → 422
    r = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": "someone@example.com", "pin": "12", "new_password": "abcdef"},
        timeout=15,
    )
    assert r.status_code == 422

    # Password < 6 → 422
    r = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": "someone@example.com", "pin": "1234", "new_password": "abc"},
        timeout=15,
    )
    assert r.status_code == 422

    # Nonexistent email → 403 (no enumeration)
    r = requests.post(
        f"{API}/auth/reset-with-pin",
        json={"email": f"test_nobody_{uuid.uuid4().hex[:6]}@x.com", "pin": "1234", "new_password": "abcdef"},
        timeout=15,
    )
    assert r.status_code == 403


# ============================================================
# 6. Regression — email-LINK reset still works (light)
# ============================================================

def test_email_link_reset_regression():
    # register a fresh user
    uniq = uuid.uuid4().hex[:8]
    email = f"test_link_{uniq}@example.com"
    username = f"test_link_{uniq}"
    _register(email, username, "InitPw!123")

    # forgot-password (sandbox returns dev_link)
    r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    dev_link = body.get("dev_link")
    assert dev_link, f"expected dev_link in sandbox response, got: {body}"
    # extract token
    assert "token=" in dev_link
    token = dev_link.split("token=")[-1]

    # reset-password with token → auto sign-in
    r = requests.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": "NewLinkPw!7"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    b = r.json()
    assert "access_token" in b and b["user"]["email"] == email

    # single-use: reusing token → 400
    r2 = requests.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": "AnotherPw!7"},
        timeout=15,
    )
    assert r2.status_code == 400

    # new password can login
    _login(email, "NewLinkPw!7")
