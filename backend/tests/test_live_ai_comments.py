"""End-to-end-ish test for AI characters commenting on a user's live.

Drives the REAL live-comment loop (_ai_char_router.live_comments_once) against the
live DB + hub, forcing the human-lag timer to the past so we don't wait 60s.
Run: python -m pytest backend/tests/test_live_ai_comments.py -s   (from /app)
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import server  # noqa: E402

db = server.db
router = server._ai_char_router


async def _run():
    admin_id = f"test-live-owner-{uuid.uuid4()}"
    await db.users.insert_one({
        "id": admin_id, "username": "testliveowner", "display_name": "Test Live Owner",
        "created_at": datetime.now(timezone.utc),
    })
    admin = {"id": admin_id, "username": "testliveowner", "display_name": "Test Live Owner"}

    char_id = str(uuid.uuid4())
    stream_id = str(uuid.uuid4())
    try:
        # 1. A warm/adoring character with allow_live on.
        await db.ai_characters.insert_one({
            "id": char_id, "name": "Nova Test", "username": "novatest",
            "avatar_url": "", "persona": "A loving daughter who adores her parent.",
            "affection": "adores", "allow_live": True, "schedule": [],
            "created_at": datetime.now(timezone.utc),
        })
        # 2. A relationship (message thread) with the founder.
        await db.ai_char_messages.insert_one({
            "id": str(uuid.uuid4()), "character_id": char_id, "admin_id": admin_id,
            "role": "user", "text": "hi sweetie", "created_at": datetime.now(timezone.utc),
        })
        # 3. The founder goes live.
        await db.live_streams.insert_one({
            "id": stream_id, "owner_id": admin_id, "owner_username": admin["username"],
            "title": "Testing my new setup!", "status": "live", "chat_enabled": True,
            "hearts": 0, "created_at": datetime.now(timezone.utc),
        })

        # Tick 1 — character "joins", schedules first comment in the future.
        await router.live_comments_once()
        key = (stream_id, char_id)
        assert key in router.live_state, "character did not join the live"
        print("PASS: character joined ->", router.live_state[key])

        # No comment yet (human lag not elapsed).
        c = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert c == 0, "commented too early"

        # Force the lag timer to the past and tick again -> should comment.
        router.live_state[key]["next_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        await router.live_comments_once()
        msg = await db.live_chat.find_one({"stream_id": stream_id, "is_ai": True})
        assert msg, "no AI comment was posted"
        assert msg.get("clickable") is False, "AI comment must be non-clickable"
        assert msg.get("user_id") == f"ai_{char_id}"
        assert msg.get("display_name") == "Nova Test"
        print("PASS: AI live comment ->", repr(msg["text"]))

        # Direct address: the broadcaster speaks to the character by name in chat ->
        # the character replies directly, bypassing the ambient pace/cap.
        await db.live_chat.insert_one({
            "id": str(uuid.uuid4()), "stream_id": stream_id, "kind": "chat",
            "user_id": admin_id, "username": admin["username"],
            "display_name": admin.get("display_name", admin["username"]),
            "text": "hey Nova are you watching this?? what do you think",
            "created_at": datetime.now(timezone.utc),
        })
        before_direct = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        await router.live_comments_once()
        after_direct = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after_direct == before_direct + 1, "character didn't reply when spoken to directly"
        assert router.live_state[key].get("answered_mid"), "answered_mid not recorded"
        latest = await db.live_chat.find({"stream_id": stream_id, "is_ai": True}).sort("created_at", -1).limit(1).to_list(1)
        print("PASS: direct reply when addressed ->", repr(latest[0]["text"]))
        # Ticking again must NOT re-answer the same mention.
        await router.live_comments_once()
        after_dupe = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after_dupe == after_direct, "re-answered the same mention"
        print("PASS: no duplicate reply to the same mention")

        # SPEECH: the broadcaster SAYS her name out loud (transcribed into live_speech) ->
        # she reacts just like a typed mention.
        await db.live_speech.insert_one({
            "id": str(uuid.uuid4()), "stream_id": stream_id, "owner_id": admin_id,
            "text": "so anyway Nova what do you think about all this",
            "created_at": datetime.now(timezone.utc)})
        before_sp = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        await router.live_comments_once()
        after_sp = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after_sp == before_sp + 1, "character didn't react to her spoken name"
        print("PASS: reacts to broadcaster's spoken name (live_speech)")

        # Eligibility: a distant character -> no ambient comment even with timer in the past.
        await db.ai_characters.update_one({"id": char_id}, {"$set": {"affection": "distant"}})
        before = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        router.live_state[key]["next_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        await router.live_comments_once()
        after = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after == before, "distant character should not post ambient comments"
        print("PASS: distant character stayed quiet (ambient)")

        # allow_live off also gates it.
        await db.ai_characters.update_one({"id": char_id}, {"$set": {"affection": "adores", "allow_live": False}})
        router.live_state[key]["next_at"] = datetime.now(timezone.utc) - timedelta(seconds=1)
        await router.live_comments_once()
        after2 = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after2 == before, "allow_live=off should gate commenting"
        print("PASS: allow_live=off stayed quiet")

        # REGRESSION (the reported bug): a character whose affection/allow_live were never
        # set (null) must STILL join and reply when spoken to directly.
        await db.ai_characters.update_one(
            {"id": char_id}, {"$unset": {"affection": "", "allow_live": ""}})
        new_mid = str(uuid.uuid4())
        await db.live_chat.insert_one({
            "id": new_mid, "stream_id": stream_id, "kind": "chat",
            "user_id": admin_id, "username": admin["username"], "display_name": admin["display_name"],
            "text": "Nova sweetie are you here?", "created_at": datetime.now(timezone.utc),
        })
        before_reg = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        await router.live_comments_once()
        after_reg = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after_reg == before_reg + 1, "null-affection/allow_live character failed to reply when addressed"
        print("PASS: null-affection character still replies when addressed (bug fixed)")

        # BUSY: her schedule says she's busy right now -> she is absent and must NOT reply,
        # even when addressed (accurate schedule behavior the user asked for).
        await db.ai_characters.update_one({"id": char_id}, {"$set": {
            "affection": "adores", "allow_live": True,
            "schedule": [{"start": "00:00", "end": "23:59", "activity": "school",
                          "busy": True, "weekdays_only": False}]}})
        await db.ai_char_state.update_one(
            {"character_id": char_id, "admin_id": admin_id},
            {"$set": {"tz": "UTC"}}, upsert=True)
        await db.live_chat.insert_one({
            "id": str(uuid.uuid4()), "stream_id": stream_id, "kind": "chat",
            "user_id": admin_id, "username": admin["username"], "display_name": admin["display_name"],
            "text": "Nova are you around??", "created_at": datetime.now(timezone.utc)})
        before_busy = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        await router.live_comments_once()
        after_busy = await db.live_chat.count_documents({"stream_id": stream_id, "is_ai": True})
        assert after_busy == before_busy, "busy character must stay absent (schedule not respected)"
        print("PASS: busy character stays absent (schedule respected)")

        # Ending the stream prunes the in-memory join state.
        await db.live_streams.update_one({"id": stream_id}, {"$set": {"status": "ended"}})
        await router.live_comments_once()
        assert key not in router.live_state, "ended stream state not pruned"
        print("PASS: ended-stream state pruned")
        print("\nALL LIVE-AI-COMMENT TESTS PASSED")
    finally:
        await db.users.delete_one({"id": admin_id})
        await db.ai_characters.delete_one({"id": char_id})
        await db.live_speech.delete_many({"stream_id": stream_id})
        await db.ai_char_messages.delete_many({"character_id": char_id})
        await db.ai_char_state.delete_many({"character_id": char_id})
        await db.live_streams.delete_one({"id": stream_id})
        await db.live_chat.delete_many({"stream_id": stream_id})


def test_live_ai_comments():
    asyncio.get_event_loop().run_until_complete(_run())


if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(_run())
