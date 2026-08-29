"""Backend verification tests for the startup purge (iteration 7).

Confirms:
1. /api/admin/users returns only the founder.
2. /api/feed, /api/reels, /api/stories contain no orphan content from purged users.
3. Founder login still works.
4. Newly registered scratch users matching purge regex are auto-purged on restart.
"""
import os
import subprocess
import time

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback: read the frontend .env like the app does
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


@pytest.fixture(scope="module")
def founder_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Founder login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture
def auth_headers(founder_token):
    return {"Authorization": f"Bearer {founder_token}"}


# --- 1. Founder login returns a token --------------------------------------
def test_founder_login_returns_jwt():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token and isinstance(token, str) and len(token) > 20
    user = body.get("user") or {}
    assert user.get("email", "").lower() == FOUNDER_EMAIL


# --- 2. Admin users returns exactly the founder ----------------------------
def test_admin_users_only_founder(auth_headers):
    r = requests.get(f"{BASE_URL}/api/admin/users?q=", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    users = r.json()
    assert isinstance(users, list), f"Expected list, got {type(users)}"
    # Must contain founder
    emails = [u.get("email", "").lower() for u in users]
    assert FOUNDER_EMAIL in emails, f"Founder missing! Got: {emails}"
    # No test_/tec_/tpb_/TEST_ prefixed emails or usernames
    bad = []
    for u in users:
        email = (u.get("email") or "").lower()
        uname = (u.get("username") or "").lower()
        for prefix in ("test_", "tec_", "tpb_"):
            if email.startswith(prefix) or uname.startswith(prefix):
                bad.append({"email": email, "username": uname})
                break
    assert not bad, f"Found leftover purge-prefixed accounts: {bad}"
    # And ideally exactly 1
    assert len(users) == 1, f"Expected exactly 1 user (founder); got {len(users)}: {emails}"


# --- 3. Feed has no posts from purged authors ------------------------------
def test_feed_no_orphan_posts(auth_headers):
    r = requests.get(f"{BASE_URL}/api/feed", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    posts = body if isinstance(body, list) else body.get("posts") or body.get("items") or []
    # Fetch surviving user ids
    ru = requests.get(f"{BASE_URL}/api/admin/users?q=", headers=auth_headers, timeout=20)
    surviving_ids = {u.get("id") for u in ru.json()}
    orphan = [p for p in posts if p.get("author_id") not in surviving_ids]
    assert not orphan, f"Found {len(orphan)} orphan feed posts"


# --- 4. Reels has no orphan reels ------------------------------------------
def test_reels_no_orphans(auth_headers):
    r = requests.get(f"{BASE_URL}/api/reels", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    reels = body if isinstance(body, list) else body.get("reels") or body.get("items") or []
    ru = requests.get(f"{BASE_URL}/api/admin/users?q=", headers=auth_headers, timeout=20)
    surviving_ids = {u.get("id") for u in ru.json()}
    def _author_id(p):
        return p.get("author_id") or (p.get("author") or {}).get("id")
    orphan = [p for p in reels if _author_id(p) not in surviving_ids]
    assert not orphan, f"Found {len(orphan)} orphan reels"


# --- 5. Stories has no orphan stories --------------------------------------
def test_stories_no_orphans(auth_headers):
    r = requests.get(f"{BASE_URL}/api/stories", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    # /api/stories usually returns grouped-by-user; flatten
    ru = requests.get(f"{BASE_URL}/api/admin/users?q=", headers=auth_headers, timeout=20)
    surviving_ids = {u.get("id") for u in ru.json()}
    orphan = []
    if isinstance(body, list):
        for entry in body:
            uid = entry.get("user_id") or entry.get("id") or (entry.get("user") or {}).get("id")
            if uid and uid not in surviving_ids:
                orphan.append(entry)
    assert not orphan, f"Found orphan stories: {orphan}"


# --- 6. Scratch registration + restart-driven auto purge -------------------
def _restart_backend():
    subprocess.run(
        ["sudo", "supervisorctl", "restart", "backend"],
        check=True, capture_output=True, text=True,
    )
    # Wait for the API to come back up
    deadline = time.time() + 45
    while time.time() < deadline:
        try:
            r = requests.get(f"{BASE_URL}/api/", timeout=5)
            if r.status_code < 500:
                # Also make sure login works (i.e. seed done)
                lr = requests.post(
                    f"{BASE_URL}/api/auth/login",
                    json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
                    timeout=10,
                )
                if lr.status_code == 200:
                    return
        except requests.RequestException:
            pass
        time.sleep(1)
    raise RuntimeError("Backend did not come back after restart")


def test_scratch_user_purged_on_restart():
    email = "test_purge_check@example.com"
    username = "test_purge_check"
    password = "PurgeMe1!"

    # Register a scratch user
    reg = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "username": username, "display_name": "Purge Check"},
        timeout=20,
    )
    assert reg.status_code in (200, 201), f"Register failed: {reg.status_code} {reg.text}"
    reg_body = reg.json()
    token = reg_body.get("token") or reg_body.get("access_token")
    assert token, f"Registration returned no token: {reg_body}"

    # Sanity: founder can see the scratch user in admin listing right now
    login = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        timeout=20,
    )
    assert login.status_code == 200
    ftoken = login.json().get("token") or login.json().get("access_token")
    r = requests.get(
        f"{BASE_URL}/api/admin/users?q=",
        headers={"Authorization": f"Bearer {ftoken}"},
        timeout=20,
    )
    assert r.status_code == 200
    emails_pre = [u.get("email", "").lower() for u in r.json()]
    assert email in emails_pre, f"Scratch account not visible pre-restart: {emails_pre}"

    # Restart backend => startup purge should remove test_* account
    _restart_backend()
    time.sleep(3)

    # Re-login as founder and re-list
    login2 = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        timeout=20,
    )
    assert login2.status_code == 200, login2.text
    ftoken2 = login2.json().get("token") or login2.json().get("access_token")
    r2 = requests.get(
        f"{BASE_URL}/api/admin/users?q=",
        headers={"Authorization": f"Bearer {ftoken2}"},
        timeout=20,
    )
    assert r2.status_code == 200
    emails_post = [u.get("email", "").lower() for u in r2.json()]
    assert email not in emails_post, f"Scratch account survived restart! Users: {emails_post}"
    # And still exactly founder
    assert emails_post == [FOUNDER_EMAIL], f"Expected only founder, got {emails_post}"

    # The scratch user's token should no longer authenticate them
    me = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert me.status_code in (401, 403, 404), f"Purged user token still works: {me.status_code} {me.text}"
