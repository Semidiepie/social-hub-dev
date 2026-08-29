"""Iteration 10 verification tests.

Checks:
1. Only ONE user (`semidiepie`) — no `test_*`, `tec_*`, `tpb_*` residue.
2. `/api/reels` returns founder's reel with H.264 rewrite; HEAD → codecs=avc1.
3. Frontend web bundle serves 200.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"


@pytest.fixture(scope="module")
def founder_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        timeout=15,
    )
    assert resp.status_code == 200, f"login failed: {resp.status_code} {resp.text}"
    tok = resp.json().get("token") or resp.json().get("access_token")
    assert tok, f"no token in login response: {resp.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(founder_token):
    return {"Authorization": f"Bearer {founder_token}"}


# --- Bug 2 verification: purge ---
class TestPurgeState:
    def test_only_founder_exists(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users?q=", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        users = r.json()
        assert isinstance(users, list)
        usernames = [u.get("username", "") for u in users]
        assert len(users) == 1, f"Expected exactly 1 user, got {len(users)}: {usernames}"
        assert usernames[0] == "semidiepie", f"Expected 'semidiepie', got {usernames}"

    def test_no_test_prefixed_users(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users?q=", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        for u in r.json():
            uname = (u.get("username") or "").lower()
            email = (u.get("email") or "").lower()
            for bad in ("test_", "tec_", "tpb_"):
                assert not uname.startswith(bad), f"Residual user: {uname}"
                assert not email.startswith(bad), f"Residual email: {email}"


# --- Bug 1 verification: reels URL rewrite + codec ---
class TestReelsH264:
    def test_reels_endpoint_returns_founder_reel(self):
        r = requests.get(f"{BASE_URL}/api/reels", timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        reels = r.json()
        assert isinstance(reels, list) and len(reels) >= 1, f"No reels: {reels}"
        # Ensure founder-owned reel exists
        founder_reels = [x for x in reels if x.get("author", {}).get("username") == "semidiepie"]
        assert founder_reels, f"No founder reel: {[r.get('author') for r in reels]}"

    def test_reels_url_has_h264_rewrite(self):
        r = requests.get(f"{BASE_URL}/api/reels", timeout=15)
        assert r.status_code == 200
        reels = r.json()
        for reel in reels:
            url = reel.get("video_url") or ""
            if "res.cloudinary.com" in url and "/video/upload/" in url:
                assert "f_mp4,vc_h264" in url, f"Missing H.264 rewrite in {url}"

    def test_head_returns_avc1_codec(self):
        r = requests.get(f"{BASE_URL}/api/reels", timeout=15)
        reels = r.json()
        cloud_reels = [
            x for x in reels
            if "res.cloudinary.com" in (x.get("video_url") or "")
            and "/video/upload/" in (x.get("video_url") or "")
        ]
        if not cloud_reels:
            pytest.skip("No cloudinary reels to HEAD")
        url = cloud_reels[0]["video_url"]
        head = requests.head(url, allow_redirects=True, timeout=15)
        assert head.status_code == 200, f"HEAD {url} → {head.status_code}"
        ct = head.headers.get("content-type", "").lower()
        assert "video/mp4" in ct, f"Unexpected content-type: {ct}"
        # avc1 = H.264
        assert "avc1" in ct, f"Expected avc1 in content-type, got: {ct}"


# --- Frontend bundle sanity ---
class TestFrontendBundle:
    def test_frontend_serves_200(self):
        r = requests.get("http://localhost:3000/", timeout=30)
        assert r.status_code == 200
        assert "<!DOCTYPE html>" in r.text
        assert "PostMePlex" in r.text


# --- Static check: reels.tsx contract ---
REELS_PATH = "/app/frontend/app/(tabs)/reels.tsx"


class TestReelsStaticContract:
    def test_useevent_import_present(self):
        src = open(REELS_PATH).read()
        assert re.search(r'import\s*\{\s*useEvent\s*\}\s*from\s*["\']expo["\']', src), \
            "useEvent import missing"

    def test_no_play_in_initializer(self):
        src = open(REELS_PATH).read()
        # Extract the useVideoPlayer initializer body
        m = re.search(
            r"useVideoPlayer\([^,]+,\s*\(p\)\s*=>\s*\{([^}]*)\}",
            src,
            re.DOTALL,
        )
        assert m, "Could not locate useVideoPlayer initializer"
        body = m.group(1)
        # Strip comments to avoid the doc-comment mentioning .play()
        stripped = re.sub(r"//[^\n]*", "", body)
        assert ".play(" not in stripped, f"Found .play() in initializer:\n{stripped}"

    def test_status_gate_present(self):
        src = open(REELS_PATH).read()
        assert 'useEvent(player, "statusChange"' in src
        assert '"readyToPlay"' in src

    def test_three_overlay_states(self):
        src = open(REELS_PATH).read()
        assert "{paused &&" in src, "paused overlay missing"
        assert 'status === "loading"' in src, "loading overlay missing"
        assert 'status === "error"' in src, "error overlay missing"
