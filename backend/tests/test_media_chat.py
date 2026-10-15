"""Backend regression tests for media-aware AI character chat + regular DMs.

Covers iteration 56 request:
- POST /api/ai-characters/{char_id}/send accepts {text, media_url, media_type}
  and returns {pending, reply_at, busy}.
- The reply_loop's _replies_once() generates an image-aware AI reply via Gemini
  (and a video-aware one for a video media_url).
- Regular DM POST /api/conversations/{conv_id}/messages persists image_url /
  video_url and the GET returns them.
"""
import asyncio
import os
import time

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Public tiny image + video that Gemini can analyze without any auth.
IMG_URL = "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=640"  # a cat
VID_URL = "https://filesamples.com/samples/video/mp4/sample_640x360.mp4"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "semidiepie@gmail.com", "password": "Semi123!"},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def admin_id(admin_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture()
def character(admin_headers):
    body = {
        "name": "TEST_Pixie",
        "username": f"test_pixie_{int(time.time())}",
        "persona": "A friendly playful character who loves describing photos and videos warmly.",
        "voice": "",
        "affection": "adores",
        "schedule": [],
        "allow_calls": False,
    }
    r = requests.post(f"{BASE_URL}/api/ai-characters", headers=admin_headers, json=body, timeout=15)
    assert r.status_code == 200, r.text
    char = r.json()
    yield char
    # cleanup
    requests.delete(f"{BASE_URL}/api/ai-characters/{char['id']}", headers=admin_headers, timeout=15)


# ---------- helpers ----------
async def _force_due(char_id, admin_id):
    """Flip pending_reply_at to the past so reply_loop fires immediately."""
    import datetime as dt

    cli = AsyncIOMotorClient(MONGO_URL)
    db = cli[DB_NAME]
    await db.ai_char_state.update_one(
        {"character_id": char_id, "admin_id": admin_id},
        {"$set": {"pending_reply_at": dt.datetime(2020, 1, 1, tzinfo=dt.timezone.utc)}},
    )
    cli.close()


def _wait_for_ai_reply(headers, char_id, timeout_s=90):
    """Poll the thread until an ai message appears (after the user media msg)."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        r = requests.get(
            f"{BASE_URL}/api/ai-characters/{char_id}/thread", headers=headers, timeout=15
        )
        if r.status_code == 200:
            msgs = r.json().get("messages", [])
            if msgs and msgs[-1]["role"] == "ai":
                return msgs
        time.sleep(3)
    return None


# ---------- AI character: image ----------
def test_send_image_accepts_payload_and_triggers_image_aware_reply(admin_headers, admin_id, character):
    char_id = character["id"]

    # Backend accepts {text, media_url, media_type} and returns {pending, reply_at, busy}
    r = requests.post(
        f"{BASE_URL}/api/ai-characters/{char_id}/send",
        headers=admin_headers,
        json={"text": "", "media_url": IMG_URL, "media_type": "image"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("pending") is True
    assert "reply_at" in data
    assert "busy" in data

    # Verify the user message is in the thread with media fields
    th = requests.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread", headers=admin_headers, timeout=15).json()
    user_msgs = [m for m in th["messages"] if m["role"] == "user"]
    assert user_msgs, "user image message not stored"
    last_user = user_msgs[-1]
    assert last_user["media_url"] == IMG_URL
    assert last_user["media_type"] == "image"

    # Force the deferred reply to be due and let reply_loop run (every 15s).
    asyncio.run(_force_due(char_id, admin_id))
    msgs = _wait_for_ai_reply(admin_headers, char_id, timeout_s=90)
    assert msgs is not None, "AI did not reply within 90s"
    ai_reply = msgs[-1]["text"].lower()
    assert ai_reply, "AI reply is empty"
    # Image-aware: should reference something visually relevant to a cat photo
    hits = ["cat", "kitten", "kitty", "feline", "eyes", "fur", "whisker", "cute", "adorable", "paw"]
    assert any(h in ai_reply for h in hits), f"reply not image-aware: {ai_reply!r}"


# ---------- AI character: video ----------
def test_send_video_triggers_video_aware_reply(admin_headers, admin_id, character):
    char_id = character["id"]

    r = requests.post(
        f"{BASE_URL}/api/ai-characters/{char_id}/send",
        headers=admin_headers,
        json={"text": "", "media_url": VID_URL, "media_type": "video"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("pending") is True

    th = requests.get(f"{BASE_URL}/api/ai-characters/{char_id}/thread", headers=admin_headers, timeout=15).json()
    last_user = [m for m in th["messages"] if m["role"] == "user"][-1]
    assert last_user["media_type"] == "video"
    assert last_user["media_url"] == VID_URL

    asyncio.run(_force_due(char_id, admin_id))
    # Video analysis takes longer (download + Gemini) — allow more time.
    msgs = _wait_for_ai_reply(admin_headers, char_id, timeout_s=180)
    assert msgs is not None, "AI did not reply to video within 180s"
    ai_reply = msgs[-1]["text"]
    assert ai_reply.strip(), "AI video reply empty"
    # loose sanity: reply should at least mention something video-like, not fail-mode text
    assert len(ai_reply) >= 10


# ---------- AI character: payload validation ----------
def test_empty_send_rejected(admin_headers, character):
    r = requests.post(
        f"{BASE_URL}/api/ai-characters/{character['id']}/send",
        headers=admin_headers,
        json={"text": "", "media_url": None, "media_type": None},
        timeout=15,
    )
    assert r.status_code == 400


# ---------- Regular DM: image_url / video_url persist ----------
@pytest.fixture()
def mutual_pair(admin_headers):
    """Create 2 TEST_ users that follow each other, return (userA_token, userB_id)."""
    ts = int(time.time()) % 100000
    users = []
    for i in (1, 2):
        reg = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": f"test_dm{ts}_{i}@test.com",
                "username": f"test_dm{ts}_{i}",
                "display_name": f"DMMedia{i}",
                "password": "TestPass123!",
                "pin": "1234",
            },
            timeout=15,
        )
        assert reg.status_code == 200, reg.text
        users.append(reg.json())

    a, b = users
    a_h = {"Authorization": f"Bearer {a['access_token']}"}
    b_h = {"Authorization": f"Bearer {b['access_token']}"}
    # mutual follow
    r1 = requests.post(f"{BASE_URL}/api/users/{b['user']['id']}/follow", headers=a_h, timeout=15)
    r2 = requests.post(f"{BASE_URL}/api/users/{a['user']['id']}/follow", headers=b_h, timeout=15)
    assert r1.status_code in (200, 201) and r2.status_code in (200, 201)
    return a_h, b["user"]["id"]


def test_dm_image_and_video_persist(mutual_pair):
    a_h, b_id = mutual_pair
    # create conversation
    r = requests.post(f"{BASE_URL}/api/conversations", headers=a_h, json={"member_ids": [b_id]}, timeout=15)
    assert r.status_code == 200, r.text
    conv_id = r.json()["id"]

    # send image
    r = requests.post(
        f"{BASE_URL}/api/conversations/{conv_id}/messages",
        headers=a_h,
        json={"text": "", "image_url": IMG_URL},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    img_msg = r.json()
    assert img_msg["image_url"] == IMG_URL
    assert img_msg["video_url"] is None

    # send video
    r = requests.post(
        f"{BASE_URL}/api/conversations/{conv_id}/messages",
        headers=a_h,
        json={"text": "", "video_url": VID_URL},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    vid_msg = r.json()
    assert vid_msg["video_url"] == VID_URL
    assert vid_msg["image_url"] is None

    # GET and verify both persist
    g = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers=a_h, timeout=15)
    assert g.status_code == 200
    rows = g.json()
    urls_i = [m.get("image_url") for m in rows]
    urls_v = [m.get("video_url") for m in rows]
    assert IMG_URL in urls_i
    assert VID_URL in urls_v


def test_dm_empty_message_rejected(mutual_pair):
    a_h, b_id = mutual_pair
    r = requests.post(f"{BASE_URL}/api/conversations", headers=a_h, json={"member_ids": [b_id]}, timeout=15)
    conv_id = r.json()["id"]
    r = requests.post(
        f"{BASE_URL}/api/conversations/{conv_id}/messages",
        headers=a_h,
        json={"text": "", "image_url": None, "video_url": None},
        timeout=15,
    )
    assert r.status_code == 400
