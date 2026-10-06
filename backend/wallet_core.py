"""Shared token-economy helpers (balance, grant, spend, ledger).

Tokens are PostMePlex's in-app currency. Users collect them (welcome bonus,
daily reward, winning game levels, admin grants) and spend them (donating/
gifting on live streams, buying premium cosmetics in the Store). All mutations
go through grant()/spend() so every change is written to an auditable ledger
(`token_tx`). spend() is an atomic conditional debit — it can never overdraw.
"""
import uuid
from datetime import timedelta

WELCOME_TOKENS = 100
DAILY_REWARD = 25
# 20h (not a strict 24h) so a daily-habit user is never blocked by clock drift.
DAILY_COOLDOWN_SECONDS = 20 * 60 * 60

# Games are a METERED token faucet: a user can earn at most this many tokens
# from gameplay (level clears + slots) per rolling 20h window, so tokens stay
# scarce enough to hold cash-out value.
GAME_DAILY_CAP = 50
GAME_EARN_KINDS = ("game", "slots")

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


async def game_earned_recently(db, now_dt, user_id: str, window_s: int = DAILY_COOLDOWN_SECONDS) -> int:
    """Total tokens a user has earned from games in the last `window_s` seconds."""
    cutoff = now_dt - timedelta(seconds=window_s)
    total = 0
    cur = db.token_tx.find(
        {"user_id": user_id, "kind": {"$in": list(GAME_EARN_KINDS)},
         "amount": {"$gt": 0}, "created_at": {"$gte": cutoff}},
        {"_id": 0, "amount": 1},
    )
    async for tx in cur:
        total += int(tx.get("amount", 0))
    return total


async def grant_capped(db, now, user_id: str, amount: int, kind: str, note: str = "",
                       daily_cap: int = GAME_DAILY_CAP) -> dict:
    """Grant game tokens but never let a user exceed `daily_cap` earned per 20h.
    Returns {granted, balance, capped, remaining}."""
    amount = int(amount)
    if amount <= 0:
        return {"granted": 0, "balance": await get_balance(db, user_id), "capped": False, "remaining": daily_cap}
    earned = await game_earned_recently(db, now(), user_id)
    remaining = max(0, daily_cap - earned)
    give = min(amount, remaining)
    if give > 0:
        await db.users.update_one({"id": user_id}, {"$inc": {"tokens": give}})
        await _log(db, now, user_id, give, kind, note)
    bal = await get_balance(db, user_id)
    return {"granted": give, "balance": bal, "capped": give < amount, "remaining": max(0, remaining - give)}


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


async def adjust(db, now, user_id: str, delta: int, kind: str, note: str = "") -> int:
    """Admin delta that may be negative, clamped so balance never goes below 0.
    Logs the ACTUAL change applied. Returns new balance."""
    delta = int(delta)
    cur = await get_balance(db, user_id)
    if delta < 0:
        delta = max(delta, -cur)  # never overdraw
    if delta == 0:
        return cur
    await db.users.update_one({"id": user_id}, {"$inc": {"tokens": delta}})
    await _log(db, now, user_id, delta, kind, note)
    return await get_balance(db, user_id)


async def set_balance(db, now, user_id: str, target: int, kind: str, note: str = "") -> int:
    """Admin sets an exact balance. Logs the signed difference. Returns new balance."""
    target = max(0, int(target))
    cur = await get_balance(db, user_id)
    diff = target - cur
    await db.users.update_one({"id": user_id}, {"$set": {"tokens": target}})
    if diff != 0:
        await _log(db, now, user_id, diff, kind, note)
    return target
