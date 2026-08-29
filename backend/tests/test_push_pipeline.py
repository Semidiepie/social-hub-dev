"""
Push notification pipeline tests (PostMePlex).

Covers:
  1. POST /api/register-push happy-path (dev short-circuit)
  2. POST /api/register-push validation errors
  3. GET  /api/push/debug (authed)
  4. GET  /api/push/debug (unauthed)
  5. DM send → send_push helper invoked → INFO log emitted
  6. Regression: /api/auth/login for semidiepie
  7. Regression: /api/feed, /api/reels, /api/stories

Runs against http://localhost:8001 (per review request). Assumes:
  - EMERGENT_PUSH_KEY=placeholder (dev/preview short-circuit path)
  - semidiepie founder account is seeded

Any secondary test user is registered on-the-fly (prefixed with TEST_).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = "http://localhost:8001"
BACKEND_LOG = "/var/log/supervisor/backend.err.log"  # loguru + fastapi write here
BACKEND_LOG_ALT = "/var/log/supervisor/backend.out.log"

SEMI_EMAIL = "semidiepie@gmail.com"
SEMI_PASSWORD = "Semi123!"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def semi_token(client):
    r = client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SEMI_EMAIL, "password": SEMI_PASSWORD},
    )
    assert r.status_code == 200, f"semidiepie login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def semi_user(client, semi_token):
    r = client.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {semi_token}"},
    )
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def second_user(client):
    """Register a fresh throw-away test user to talk to via DM."""
    suffix = uuid.uuid4().hex[:6]
    email = f"TEST_pb_{suffix}@example.com"
    username = f"tpb_{suffix}"  # <=20 chars
    payload = {
        "email": email,
        "password": "Test123!",
        "username": username,
        "display_name": "TEST Push Buddy",
    }
    r = client.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    me = client.get(
        f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}
    ).json()
    return {"token": tok, "user": me}


def _tail_backend_logs(bytes_to_read: int = 20_000) -> str:
    """Read tail of both backend log files and return combined contents."""
    out = ""
    for path in (BACKEND_LOG, BACKEND_LOG_ALT):
        if os.path.exists(path):
            try:
                size = os.path.getsize(path)
                with open(path, "rb") as f:
                    f.seek(max(0, size - bytes_to_read))
                    out += f.read().decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                pass
    return out


# ---------- 1 & 2: /api/register-push ----------

class TestRegisterPush:
    def test_register_push_dev_shortcircuit(self, client):
        """When EMERGENT_PUSH_KEY=placeholder, endpoint must 201 + skipped reason."""
        r = client.post(
            f"{BASE_URL}/api/register-push",
            json={"user_id": "abc", "platform": "ios", "device_token": "hex-token-abc"},
        )
        assert r.status_code == 201, f"expected 201, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("status") == "skipped", data
        assert "EMERGENT_PUSH_KEY not set" in data.get("reason", ""), data

    def test_register_push_missing_device_token(self, client):
        """Missing device_token must yield 422 (pydantic validation)."""
        r = client.post(
            f"{BASE_URL}/api/register-push",
            json={"user_id": "abc", "platform": "ios"},
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"
        # loose sanity check on error body
        body = r.json()
        assert "detail" in body


# ---------- 3 & 4: /api/push/debug ----------

class TestPushDebug:
    def test_push_debug_authed(self, client, semi_token, semi_user):
        r = client.get(
            f"{BASE_URL}/api/push/debug",
            headers={"Authorization": f"Bearer {semi_token}"},
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("key_configured") is False, data
        assert data.get("user_id") == semi_user["id"], data
        assert data.get("upstream_status") is None, data
        assert data.get("upstream_body") == "", data

    def test_push_debug_unauthed(self, client):
        r = client.get(f"{BASE_URL}/api/push/debug")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"


# ---------- 5: DM triggers send_push (log-based assertion) ----------

class TestDMPushTrigger:
    def test_dm_send_invokes_push_helper(self, client, semi_token, semi_user, second_user):
        # Create (or reuse) DM conversation between semidiepie and TEST_pushbuddy
        conv_resp = client.post(
            f"{BASE_URL}/api/conversations",
            json={"member_ids": [second_user["user"]["id"]]},
            headers={"Authorization": f"Bearer {semi_token}"},
        )
        assert conv_resp.status_code in (200, 201), f"conv create failed: {conv_resp.status_code} {conv_resp.text}"
        conv = conv_resp.json()
        conv_id = conv.get("id") or conv.get("conversation_id")
        assert conv_id, f"no conversation id in response: {conv}"

        marker = f"TEST_pushmarker_{uuid.uuid4().hex[:6]}"
        send_resp = client.post(
            f"{BASE_URL}/api/conversations/{conv_id}/messages",
            json={"text": marker},
            headers={"Authorization": f"Bearer {semi_token}"},
        )
        assert send_resp.status_code in (200, 201), f"send msg failed: {send_resp.status_code} {send_resp.text}"

        # Wait briefly for the async logger to flush
        time.sleep(1.5)

        logs = _tail_backend_logs()
        assert "[push] skipping trigger — EMERGENT_PUSH_KEY not set" in logs, (
            "Expected push short-circuit log line after DM send; not found in tail of backend logs. "
            "This means send_push was NOT invoked from send_message. Last 2KB of logs:\n"
            + logs[-2000:]
        )


# ---------- 6 & 7: regressions ----------

class TestRegressions:
    def test_semidiepie_login(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SEMI_EMAIL, "password": SEMI_PASSWORD},
        )
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
        j = r.json()
        assert j.get("access_token"), j
        assert isinstance(j["access_token"], str) and len(j["access_token"]) > 20

    def test_feed_returns_array(self, client, semi_token):
        r = client.get(
            f"{BASE_URL}/api/feed",
            headers={"Authorization": f"Bearer {semi_token}"},
        )
        assert r.status_code == 200, f"feed failed: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)

    def test_reels_returns_array(self, client, semi_token):
        r = client.get(
            f"{BASE_URL}/api/reels",
            headers={"Authorization": f"Bearer {semi_token}"},
        )
        assert r.status_code == 200, f"reels failed: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)

    def test_stories_returns_array(self, client, semi_token):
        r = client.get(
            f"{BASE_URL}/api/stories",
            headers={"Authorization": f"Bearer {semi_token}"},
        )
        assert r.status_code == 200, f"stories failed: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)
