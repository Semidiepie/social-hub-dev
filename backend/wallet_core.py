"""Shared token-economy helpers (balance, grant, spend, ledger).

Tokens are PostMePlex's in-app currency. Users collect them (welcome bonus,
daily reward, winning game levels, admin grants) and spend them (donating/
gifting on live streams, buying premium cosmetics in the Store). All mutations
go through grant()/spend() so every change is written to an auditable ledger
(`token_tx`). spend() is an atomic conditional debit — it can never overdraw.
"""
import uuid

WELCOME_TOKENS = 100
DAILY_REWARD = 25
# 20h (not a strict 24h) so a daily-habit user is never blocked by clock drift.
DAILY_COOLDOWN_SECONDS = 20 * 60 * 60

# Premium profile frames sold for tokens (reuse the existing frame visuals).
STORE_FRAMES = [
    {"id": "violet", "name": "Violet Pulse", "blurb": "Mystic purple aura", "price": 120},
    {"id": "ocean", "name": "Deep Ocean", "blurb": "Aqua swirl", "price": 160},
    {"id": "frost", "name": "Frostbite", "blurb": "Icy shimmer", "price": 180},
    {"id": "neon", "name": "Neon Cycle", "blurb": "Spinning neon ring", "price": 220},
    {"id": "fire", "name": "Blaze", "blurb": "Spinning flames", "price": 240},
    {"id": "aurora", "name": "Aurora", "blurb": "Northern-lights glow", "price": 280},
    {"id": "sunset", "name": "Sunset Fade", "blurb": "Warm dusk gradient", "price": 300},
    {"id": "rainbow", "name": "Rainbow Spin", "blurb": "Full-spectrum spin", "price": 350},
    {"id": "molten", "name": "Molten Core", "blurb": "Lava-hot ring", "price": 420},
    {"id": "galaxy", "name": "Galaxy", "blurb": "Cosmic nebula spin", "price": 500},
]
STORE_FRAME_BY_ID = {f["id"]: f for f in STORE_FRAMES}
PREMIUM_FRAME_IDS = set(STORE_FRAME_BY_ID.keys())


async def get_balance(db, user_id: str) -> int:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "tokens": 1})
    return int((u or {}).get("tokens", 0) or 0)


async def _log(db, now, user_id, amount, kind, note):
    await db.token_tx.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": int(amount),
        "kind": kind,
        "note": note or "",
        "balance_after": await get_balance(db, user_id),
        "created_at": now(),
    })


async def grant(db, now, user_id: str, amount: int, kind: str, note: str = "") -> int:
    """Credit tokens to a user and record the transaction. Returns new balance."""
    amount = int(amount)
    if amount <= 0:
        return await get_balance(db, user_id)
    await db.users.update_one({"id": user_id}, {"$inc": {"tokens": amount}})
    await _log(db, now, user_id, amount, kind, note)
    return await get_balance(db, user_id)


async def spend(db, now, user_id: str, amount: int, kind: str, note: str = ""):
    """Atomic conditional debit. Returns the new balance, or None if the user
    doesn't have enough tokens (balance is left untouched in that case)."""
    amount = int(amount)
    if amount <= 0:
        return await get_balance(db, user_id)
    res = await db.users.update_one(
        {"id": user_id, "tokens": {"$gte": amount}},
        {"$inc": {"tokens": -amount}},
    )
    if res.modified_count == 0:
        return None
    await _log(db, now, user_id, -amount, kind, note)
    return await get_balance(db, user_id)
