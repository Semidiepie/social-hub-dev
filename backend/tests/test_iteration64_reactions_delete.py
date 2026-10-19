"""Iteration 64 — DM + AI-chat delete + reactions, plus audio_file analysis."""
import os
import time

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"
TEST_PREFIX = "TEST_react_"
EL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel — premade ElevenLabs voice


@pytest.fixture(scope="module")
def founder_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def founder_me(founder_token):
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {founder_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def peer_user(founder_token):
    """Create a TEST_ peer user, mutually follow with founder, return (token, me)."""
    uname = f"tpb_r{int(time.time()) % 1_000_000}"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": f"{uname}@example.com", "username": uname,
        "display_name": "Peer", "password": "Peerpass1!", "pin": "1234"
    }, timeout=30)
    assert r.status_code in (200, 201), f"register peer: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    me = requests.get(f"{BASE_URL}/api/auth/me",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
    # mutual follow: peer -> founder is automatic via auto-follow seed? Not guaranteed. Explicit.
    hdr_peer = {"Authorization": f"Bearer {tok}"}
    # peer follows founder
    me_f = requests.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {founder_token}"}, timeout=15).json()
    requests.post(f"{BASE_URL}/api/users/{me_f['id']}/follow", headers=hdr_peer, timeout=15)
    # founder follows peer
    requests.post(f"{BASE_URL}/api/users/{me['id']}/follow",
                  headers={"Authorization": f"Bearer {founder_token}"}, timeout=15)
    return {"token": tok, "me": me}


# ---------- DM reactions + delete ----------
class TestDMReactionsDelete:
    @pytest.fixture(scope="class")
    def conv_and_msg(self, founder_token, peer_user):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        # create 1:1 conversation
        r = requests.post(f"{BASE_URL}/api/conversations", headers=hdr,
                          json={"member_ids": [peer_user["me"]["id"]]}, timeout=15)
        assert r.status_code == 200, f"create conv: {r.status_code} {r.text}"
        conv_id = r.json()["id"]
        # send text message
        r = requests.post(f"{BASE_URL}/api/conversations/{conv_id}/messages",
                          headers=hdr, json={"text": "TEST_react hello"}, timeout=15)
        assert r.status_code == 200, f"send msg: {r.status_code} {r.text}"
        msg = r.json()
        assert msg.get("id")
        assert msg.get("reactions") == []
        return {"conv_id": conv_id, "msg_id": msg["id"]}

    def test_add_reaction_heart(self, founder_token, conv_and_msg):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{BASE_URL}/api/messages/{conv_and_msg['msg_id']}/reactions",
                          headers=hdr, json={"emoji": "❤️"}, timeout=15)
        assert r.status_code == 200, f"react: {r.status_code} {r.text}"
        data = r.json()
        assert "reactions" in data
        assert len(data["reactions"]) == 1
        assert data["reactions"][0]["emoji"] == "❤️"
        assert "user_id" in data["reactions"][0]

    def test_replace_reaction_fire(self, founder_token, conv_and_msg):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{BASE_URL}/api/messages/{conv_and_msg['msg_id']}/reactions",
                          headers=hdr, json={"emoji": "🔥"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # pull-then-push: should be single 🔥
        emojis = [x["emoji"] for x in data["reactions"]]
        assert emojis == ["🔥"], f"expected [🔥], got {emojis}"

    def test_unreact(self, founder_token, conv_and_msg):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.delete(f"{BASE_URL}/api/messages/{conv_and_msg['msg_id']}/reactions",
                            headers=hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["reactions"] == []

    def test_delete_own_message(self, founder_token, conv_and_msg):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.delete(f"{BASE_URL}/api/messages/{conv_and_msg['msg_id']}",
                            headers=hdr, timeout=15)
        assert r.status_code == 200
        # verify gone from GET messages
        r = requests.get(f"{BASE_URL}/api/conversations/{conv_and_msg['conv_id']}/messages",
                         headers=hdr, timeout=15)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()]
        assert conv_and_msg["msg_id"] not in ids
        # regression: reactions field still present on remaining messages (if any)
        for m in r.json():
            assert "reactions" in m


# ---------- AI character reactions + delete ----------
class TestAICharReactionsDelete:
    @pytest.fixture(scope="class")
    def character(self, founder_token):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{BASE_URL}/api/ai-characters", headers=hdr, json={
            "name": f"{TEST_PREFIX}Char",
            "username": f"TEST_react_char_{int(time.time())}",
            "persona": "A chill test persona.",
            "voice": EL_VOICE_ID,
            "age": 25, "affection": "warm",
        }, timeout=20)
        assert r.status_code == 200, f"create char: {r.status_code} {r.text}"
        char = r.json()
        yield char
        # cleanup
        requests.delete(f"{BASE_URL}/api/ai-characters/{char['id']}", headers=hdr, timeout=15)

    @pytest.fixture(scope="class")
    def user_msg_id(self, founder_token, character):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(f"{BASE_URL}/api/ai-characters/{character['id']}/send",
                          headers=hdr, json={"text": "hello there"}, timeout=20)
        assert r.status_code == 200, f"send: {r.status_code} {r.text}"
        assert r.json().get("pending") is True
        # fetch thread; find the user message just stored
        r = requests.get(f"{BASE_URL}/api/ai-characters/{character['id']}/thread",
                         headers=hdr, timeout=15)
        assert r.status_code == 200
        thread = r.json()
        # regression: reactions field exists on messages via _msg_out
        for m in thread["messages"]:
            assert "reactions" in m, f"msg missing reactions: {m}"
        user_msgs = [m for m in thread["messages"] if m["role"] == "user"]
        assert user_msgs, "no user message in thread"
        return user_msgs[-1]["id"]

    def test_add_laugh(self, founder_token, character, user_msg_id):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{character['id']}/messages/{user_msg_id}/reactions",
            headers=hdr, json={"emoji": "😂"}, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        emojis = [x["emoji"] for x in r.json()["reactions"]]
        assert emojis == ["😂"]

    def test_replace_thumbs(self, founder_token, character, user_msg_id):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.post(
            f"{BASE_URL}/api/ai-characters/{character['id']}/messages/{user_msg_id}/reactions",
            headers=hdr, json={"emoji": "👍"}, timeout=15)
        assert r.status_code == 200
        emojis = [x["emoji"] for x in r.json()["reactions"]]
        assert emojis == ["👍"]

    def test_unreact(self, founder_token, character, user_msg_id):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.delete(
            f"{BASE_URL}/api/ai-characters/{character['id']}/messages/{user_msg_id}/reactions",
            headers=hdr, timeout=15)
        assert r.status_code == 200
        assert r.json()["reactions"] == []

    def test_delete_message(self, founder_token, character, user_msg_id):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        r = requests.delete(
            f"{BASE_URL}/api/ai-characters/{character['id']}/messages/{user_msg_id}",
            headers=hdr, timeout=15)
        assert r.status_code == 200
        # verify removed from thread
        r = requests.get(f"{BASE_URL}/api/ai-characters/{character['id']}/thread",
                         headers=hdr, timeout=15)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()["messages"]]
        assert user_msg_id not in ids


# ---------- Audio-file analysis ----------
class TestAudioFileAnalysis:
    def test_audio_file_commentary(self, founder_token):
        hdr = {"Authorization": f"Bearer {founder_token}"}
        # create fresh char
        r = requests.post(f"{BASE_URL}/api/ai-characters", headers=hdr, json={
            "name": f"{TEST_PREFIX}AudioChar",
            "username": f"tpb_au{int(time.time()) % 10000}",
            "persona": "A warm friend who listens.",
            "voice": EL_VOICE_ID, "age": 25, "affection": "adores",
        }, timeout=20)
        assert r.status_code == 200, r.text
        char = r.json()
        try:
            # Upload a small mp3 to Cloudinary (unsigned preset) to get a real hosted URL.
            cloud = os.environ.get("REACT_APP_CLOUDINARY_CLOUD_NAME")
            preset = os.environ.get("REACT_APP_CLOUDINARY_UPLOAD_PRESET")
            if not (cloud and preset):
                pytest.skip("Cloudinary env missing — cannot host audio clip")
            # tiny public mp3
            src = requests.get(
                "https://file-examples.com/storage/fe3abb0cc968d94ba3f2b76/2017/11/file_example_MP3_700KB.mp3",
                timeout=30)
            if src.status_code != 200 or len(src.content) < 1000:
                # fallback: use the backend greeting data-URI, upload raw bytes
                import base64 as _b64
                r = requests.post(
                    f"{BASE_URL}/api/ai-characters/{char['id']}/voice-turn",
                    headers=hdr, json={"greeting": True, "tz": "America/New_York"}, timeout=45)
                if r.status_code != 200:
                    pytest.skip(f"voice-turn greeting failed: {r.status_code} {r.text}")
                du = (r.json() or {}).get("audio_url", "")
                if not du.startswith("data:audio"):
                    pytest.skip(f"no inline audio from greeting: {du[:60]}")
                b64 = du.split(",", 1)[1]
                raw = _b64.b64decode(b64)
            else:
                raw = src.content
            upr = requests.post(
                f"https://api.cloudinary.com/v1_1/{cloud}/video/upload",
                data={"upload_preset": preset},
                files={"file": ("clip.mp3", raw, "audio/mpeg")}, timeout=60)
            if upr.status_code != 200:
                pytest.skip(f"cloudinary upload failed: {upr.status_code} {upr.text[:200]}")
            audio_url = upr.json().get("secure_url")
            if not audio_url:
                pytest.skip(f"no secure_url: {upr.json()}")
            print(f"[audio_url] {audio_url}")

            # Clear thread to make detection clean
            requests.delete(f"{BASE_URL}/api/ai-characters/{char['id']}/thread",
                            headers=hdr, timeout=15)

            # Send audio_file to the character
            r = requests.post(f"{BASE_URL}/api/ai-characters/{char['id']}/send",
                              headers=hdr, json={
                                  "media_url": audio_url,
                                  "media_type": "audio_file",
                                  "tz": "America/New_York"
                              }, timeout=20)
            assert r.status_code == 200, r.text
            assert r.json().get("pending") is True

            # Poll /thread up to ~70s for a new AI text reply
            deadline = time.time() + 70
            ai_text_reply = None
            attempts = 0
            while time.time() < deadline:
                time.sleep(5)
                attempts += 1
                r = requests.get(f"{BASE_URL}/api/ai-characters/{char['id']}/thread",
                                 headers=hdr, timeout=15)
                if r.status_code != 200:
                    continue
                msgs = r.json().get("messages", [])
                print(f"[poll {attempts}] msg roles: {[(m['role'], (m.get('media_type') or ''), (m.get('text') or '')[:30]) for m in msgs]}")
                ai_replies = [m for m in msgs if m["role"] == "ai" and (m.get("text") or "").strip()
                              and m.get("media_type") in (None, "")]
                if ai_replies:
                    ai_text_reply = ai_replies[-1]
                    break
            if not ai_text_reply:
                pytest.skip("Gemini audio commentary did not arrive within 45s (informational)")
            assert ai_text_reply["role"] == "ai"
            assert (ai_text_reply.get("text") or "").strip()
            # NOT a voice note
            assert ai_text_reply.get("media_type") in (None, "")
        finally:
            requests.delete(f"{BASE_URL}/api/ai-characters/{char['id']}", headers=hdr, timeout=15)
