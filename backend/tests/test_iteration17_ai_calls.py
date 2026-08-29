"""Iteration 17 — AI Voice Calling feature tests.

Covers:
  - /api/ai/status public endpoint
  - Auth requirements on /api/ai/characters
  - Input validation (missing name/persona/sample -> 400)
  - Empty list for fresh user
  - Character creation with real ElevenLabs (accepts 201 OR 502)
  - If created: get detail, history, chat-text (Claude Sonnet 4.5 + TTS),
    reset, and delete flows.
"""
from __future__ import annotations

import io
import os
import time
import uuid
from typing import Optional

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
    "https://social-hub-dev-4.preview.emergentagent.com"


def _login_or_register(session: requests.Session) -> str:
    """Create a fresh scratch user (auto-purged on backend restart, prefix tec_)."""
    email = f"tec_{uuid.uuid4().hex[:10]}@example.com"
    username = f"tec_{uuid.uuid4().hex[:8]}"
    payload = {
        "email": email,
        "username": username,
        "password": "Test123!",
        "display_name": "AI Tester",
    }
    r = session.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client() -> requests.Session:
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def token(client) -> str:
    return _login_or_register(client)


@pytest.fixture(scope="module")
def auth_headers(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
class TestAIStatus:
    def test_status_public(self, client):
        r = client.get(f"{BASE_URL}/api/ai/status", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("elevenlabs_configured") is True, body
        assert body.get("llm_configured") is True, body


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAIAuth:
    def test_list_requires_auth(self, client):
        r = client.get(f"{BASE_URL}/api/ai/characters", timeout=15)
        assert r.status_code == 401, r.text

    def test_list_empty_for_fresh_user(self, client, auth_headers):
        r = client.get(f"{BASE_URL}/api/ai/characters", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
        assert r.json() == []


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
class TestAICreateValidation:
    def _post(self, client, auth_headers, files=None, data=None):
        return client.post(
            f"{BASE_URL}/api/ai/characters",
            headers=auth_headers,
            files=files or {},
            data=data or {},
            timeout=30,
        )

    def test_missing_name_returns_400_or_422(self, client, auth_headers):
        # Missing name field entirely (Form required) -> FastAPI returns 422
        files = {"sample": ("s.mp3", io.BytesIO(b"\x00" * 100), "audio/mpeg")}
        r = self._post(client, auth_headers, files=files, data={"persona": "hi"})
        assert r.status_code in (400, 422), r.text

    def test_missing_persona(self, client, auth_headers):
        files = {"sample": ("s.mp3", io.BytesIO(b"\x00" * 100), "audio/mpeg")}
        r = self._post(client, auth_headers, files=files, data={"name": "Nana"})
        assert r.status_code in (400, 422), r.text

    def test_missing_sample(self, client, auth_headers):
        r = self._post(
            client,
            auth_headers,
            data={"name": "Nana", "persona": "friendly"},
        )
        assert r.status_code in (400, 422), r.text

    def test_empty_name_returns_400(self, client, auth_headers):
        files = {"sample": ("s.mp3", io.BytesIO(b"\x00" * 100), "audio/mpeg")}
        r = self._post(
            client,
            auth_headers,
            files=files,
            data={"name": "   ", "persona": "cool"},
        )
        assert r.status_code == 400, r.text
        assert "Name" in (r.json().get("detail") or "")

    def test_empty_persona_returns_400(self, client, auth_headers):
        files = {"sample": ("s.mp3", io.BytesIO(b"\x00" * 100), "audio/mpeg")}
        r = self._post(
            client,
            auth_headers,
            files=files,
            data={"name": "Nana", "persona": "  "},
        )
        assert r.status_code == 400, r.text
        assert "Persona" in (r.json().get("detail") or "")

    def test_empty_sample_returns_400(self, client, auth_headers):
        files = {"sample": ("s.mp3", io.BytesIO(b""), "audio/mpeg")}
        r = self._post(
            client,
            auth_headers,
            files=files,
            data={"name": "Nana", "persona": "cool"},
        )
        # Backend explicitly returns 400 for empty file.
        assert r.status_code == 400, r.text


# ---------------------------------------------------------------------------
# Real ElevenLabs clone flow (best-effort). ElevenLabs may reject a
# synthetic silent sample and return 4xx -> our backend surfaces 502.
# Both 201 (success) and 502 (upstream reject) are acceptable evidence
# the endpoint reached ElevenLabs.
# ---------------------------------------------------------------------------

# A small valid-ish MP3 header + silence (frames of MPEG-1 Layer III silence).
# Not a real voice, so ElevenLabs will most likely reject it — that's OK.
_SILENT_MP3 = (
    b"\xff\xfb\x90\x44" + b"\x00" * (16 * 1024)
)


class TestAICreateReal:
    character_id: Optional[str] = None

    def test_create_character(self, client, auth_headers):
        files = {"sample": ("silence.mp3", io.BytesIO(_SILENT_MP3), "audio/mpeg")}
        r = client.post(
            f"{BASE_URL}/api/ai/characters",
            headers=auth_headers,
            files=files,
            data={
                "name": "TEST_AICharacter",
                "persona": "Friendly QA bot. Respond in one short sentence.",
            },
            timeout=90,
        )
        # ElevenLabs may reject synthetic silence -> backend returns 502.
        assert r.status_code in (201, 502), r.text
        if r.status_code == 201:
            body = r.json()
            assert body["name"] == "TEST_AICharacter"
            assert body["voice_id"]
            assert body["id"]
            TestAICreateReal.character_id = body["id"]
        else:
            pytest.skip(
                f"ElevenLabs rejected synthetic sample (expected). detail={r.text[:200]}"
            )

    def test_list_shows_created(self, client, auth_headers):
        if not TestAICreateReal.character_id:
            pytest.skip("no character created")
        r = client.get(f"{BASE_URL}/api/ai/characters", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestAICreateReal.character_id in ids

    def test_get_detail(self, client, auth_headers):
        if not TestAICreateReal.character_id:
            pytest.skip("no character created")
        cid = TestAICreateReal.character_id
        r = client.get(f"{BASE_URL}/api/ai/characters/{cid}", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == cid

    def test_history_empty(self, client, auth_headers):
        if not TestAICreateReal.character_id:
            pytest.skip("no character created")
        cid = TestAICreateReal.character_id
        r = client.get(
            f"{BASE_URL}/api/ai/characters/{cid}/history",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"history": []}

    def test_chat_text(self, client, auth_headers):
        if not TestAICreateReal.character_id:
            pytest.skip("no character created")
        cid = TestAICreateReal.character_id
        r = client.post(
            f"{BASE_URL}/api/ai/characters/{cid}/chat-text",
            headers={**auth_headers, "Content-Type": "application/json"},
            json={"text": "hello"},
            timeout=120,
        )
        # LLM + TTS chain; 502 acceptable if TTS fails but LLM should be fine.
        assert r.status_code in (200, 502), r.text
        if r.status_code == 200:
            body = r.json()
            assert body["user_text"] == "hello"
            assert body["assistant_text"]
            assert body["audio"].startswith("data:audio/mpeg;base64,")

    def test_reset_clears_history(self, client, auth_headers):
        if not TestAICreateReal.character_id:
            pytest.skip("no character created")
        cid = TestAICreateReal.character_id
        r = client.post(
            f"{BASE_URL}/api/ai/characters/{cid}/reset",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        h = client.get(
            f"{BASE_URL}/api/ai/characters/{cid}/history",
            headers=auth_headers,
            timeout=15,
        )
        assert h.status_code == 200
        assert h.json() == {"history": []}

    def test_delete_character(self, client, auth_headers):
        if not TestAICreateReal.character_id:
            pytest.skip("no character created")
        cid = TestAICreateReal.character_id
        r = client.delete(
            f"{BASE_URL}/api/ai/characters/{cid}", headers=auth_headers, timeout=30
        )
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        # Verify gone
        g = client.get(
            f"{BASE_URL}/api/ai/characters/{cid}", headers=auth_headers, timeout=15
        )
        assert g.status_code == 404


# ---------------------------------------------------------------------------
# 404 flows for random ids
# ---------------------------------------------------------------------------
class TestAI404s:
    def test_get_missing(self, client, auth_headers):
        r = client.get(
            f"{BASE_URL}/api/ai/characters/does-not-exist",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_history_missing(self, client, auth_headers):
        r = client.get(
            f"{BASE_URL}/api/ai/characters/does-not-exist/history",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 404

    def test_chat_text_missing(self, client, auth_headers):
        r = client.post(
            f"{BASE_URL}/api/ai/characters/does-not-exist/chat-text",
            headers={**auth_headers, "Content-Type": "application/json"},
            json={"text": "hi"},
            timeout=15,
        )
        assert r.status_code == 404

    def test_delete_missing(self, client, auth_headers):
        r = client.delete(
            f"{BASE_URL}/api/ai/characters/does-not-exist",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 404
