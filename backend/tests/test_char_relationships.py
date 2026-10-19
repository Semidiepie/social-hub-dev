"""Inter-character relationships: Hope <-> Juliette (mother/daughter) talk privately, and
the exchange becomes shared knowledge so the other already knows when the user texts her.
Run: python backend/tests/test_char_relationships.py  (from /app)
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server  # noqa: E402

db = server.db
router = server._ai_char_router


async def _run():
    admin_id = f"test-rel-owner-{uuid.uuid4()}"
    hope_id, jul_id = str(uuid.uuid4()), str(uuid.uuid4())
    await db.users.insert_one({"id": admin_id, "username": "relowner", "display_name": "Rel Owner",
                               "created_at": datetime.now(timezone.utc)})
    try:
        await db.ai_characters.insert_one({
            "id": hope_id, "name": "Hope", "username": "hopetest", "created_by": admin_id,
            "persona": "A cheerful teenage girl who loves texting her mom.", "affection": "adores",
            "relationships": [{"character_id": jul_id, "relation": "mother"}],
            "created_at": datetime.now(timezone.utc)})
        await db.ai_characters.insert_one({
            "id": jul_id, "name": "Juliette", "username": "jultest", "created_by": admin_id,
            "persona": "A warm, caring mom in her 40s.", "affection": "adores",
            "relationships": [{"character_id": hope_id, "relation": "daughter"}],
            "created_at": datetime.now(timezone.utc)})

        hope = await db.ai_characters.find_one({"id": hope_id})
        jul = await db.ai_characters.find_one({"id": jul_id})

        # 1. Hope relays a message from the user to her mom Juliette.
        n = await router.run_char_exchange(admin_id, hope, jul, seed="I passed my math test today!")
        assert n >= 2, f"exchange produced too few messages: {n}"
        convo = await db.ai_char_convos.find({"admin_id": admin_id}).sort("created_at", 1).to_list(50)
        assert convo, "no inter-character messages stored"
        assert {m["from_id"] for m in convo} <= {hope_id, jul_id}
        assert any(m["from_id"] == hope_id for m in convo), "Hope never spoke"
        print(f"PASS: Hope<->Juliette exchange stored ({len(convo)} msgs)")
        for m in convo:
            print(f"   {m['from_name']} -> {m['to_name']}: {m['text']}")

        # 2. "She already knows": Juliette's shared-knowledge context query surfaces the
        #    exchange (this is exactly what _convo_context injects into her replies).
        jul_knows = await db.ai_char_convos.find(
            {"admin_id": admin_id, "$or": [{"from_id": jul_id}, {"to_id": jul_id}]}
        ).to_list(50)
        assert jul_knows, "Juliette's context query found nothing"
        assert any(m["from_id"] == hope_id for m in jul_knows), "Juliette wouldn't see Hope's messages"
        print(f"PASS: Juliette already knows ({len(jul_knows)} shared msgs in her context)")
        print("\nALL RELATIONSHIP TESTS PASSED")
    finally:
        await db.users.delete_one({"id": admin_id})
        await db.ai_characters.delete_many({"id": {"$in": [hope_id, jul_id]}})
        await db.ai_char_convos.delete_many({"admin_id": admin_id})
        await db.ai_char_messages.delete_many({"admin_id": admin_id})
        await db.ai_char_state.delete_many({"admin_id": admin_id})


if __name__ == "__main__":
    asyncio.get_event_loop().run_until_complete(_run())
