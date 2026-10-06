"""Wallet & Store router — the PostMePlex token economy's user-facing API.

GET  /api/wallet         balance + recent ledger + daily-claim status
POST /api/wallet/daily   claim the once-per-day token reward
GET  /api/store/items    premium cosmetics for sale (with owned flags)
POST /api/store/buy      purchase a premium cosmetic with tokens

NOTE: intentionally NO `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import wallet_core


class BuyBody(BaseModel):
    item_id: str


class TransferBody(BaseModel):
    username: str
    amount: int
    note: str = ""


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    get_current_user = ctx.get_current_user
    user_to_public = ctx.user_to_public
    router = APIRouter(tags=["wallet"])

    def _daily_status(last):
        if not isinstance(last, datetime):
            return True, None
        if last.tzinfo is None:
            from datetime import timezone as _tz
            last = last.replace(tzinfo=_tz.utc)
        elapsed = (now() - last).total_seconds()
        if elapsed >= wallet_core.DAILY_COOLDOWN_SECONDS:
            return True, None
        next_at = (last + timedelta(seconds=wallet_core.DAILY_COOLDOWN_SECONDS)).isoformat()
        return False, next_at

    @router.get("/api/wallet")
    async def get_wallet(current: Annotated[dict, Depends(get_current_user)]):
        bal = await wallet_core.get_balance(db, current["id"])
        txs = await db.token_tx.find({"user_id": current["id"]}, {"_id": 0}) \
            .sort("created_at", -1).to_list(30)
        for t in txs:
            if isinstance(t.get("created_at"), datetime):
                t["created_at"] = t["created_at"].isoformat()
        u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "last_daily_claim": 1})
        can_claim, next_at = _daily_status((u or {}).get("last_daily_claim"))
        return {
            "balance": bal,
            "transactions": txs,
            "daily_reward": wallet_core.DAILY_REWARD,
            "can_claim_daily": can_claim,
            "next_claim_at": next_at,
        }

    @router.post("/api/wallet/daily")
    async def claim_daily(current: Annotated[dict, Depends(get_current_user)]):
        u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "last_daily_claim": 1})
        can_claim, next_at = _daily_status((u or {}).get("last_daily_claim"))
        if not can_claim:
            raise HTTPException(429, "Daily reward already claimed — come back later.")
        await db.users.update_one({"id": current["id"]}, {"$set": {"last_daily_claim": now()}})
        bal = await wallet_core.grant(db, now, current["id"], wallet_core.DAILY_REWARD,
                                      "daily", "Daily login reward")
        _, next_at = _daily_status(now())
        return {"balance": bal, "claimed": wallet_core.DAILY_REWARD, "next_claim_at": next_at}

    @router.get("/api/store/items")
    async def store_items(current: Annotated[dict, Depends(get_current_user)]):
        bal = await wallet_core.get_balance(db, current["id"])
        u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "owned_frames": 1})
        owned = set((u or {}).get("owned_frames") or [])
        items = [{**f, "kind": "frame", "owned": f["id"] in owned} for f in wallet_core.STORE_FRAMES]
        return {"balance": bal, "items": items}

    @router.post("/api/store/buy")
    async def store_buy(body: BuyBody, current: Annotated[dict, Depends(get_current_user)]):
        item = wallet_core.STORE_FRAME_BY_ID.get(body.item_id)
        if not item:
            raise HTTPException(404, "Item not found")
        u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "owned_frames": 1})
        owned = set((u or {}).get("owned_frames") or [])
        if item["id"] in owned:
            raise HTTPException(400, "You already own this")
        bal = await wallet_core.spend(db, now, current["id"], item["price"], "purchase",
                                      f"Bought {item['name']} frame")
        if bal is None:
            raise HTTPException(402, "Not enough tokens")
        await db.users.update_one({"id": current["id"]}, {"$addToSet": {"owned_frames": item["id"]}})
        fresh = await db.users.find_one({"id": current["id"]})
        return user_to_public(fresh)

    @router.post("/api/wallet/transfer")
    async def transfer(body: TransferBody, current: Annotated[dict, Depends(get_current_user)]):
        amount = int(body.amount)
        if amount <= 0:
            raise HTTPException(400, "Amount must be at least 1 token")
        if amount > 1000000:
            raise HTTPException(400, "Amount too large")
        uname = body.username.strip().lstrip("@").lower()
        if not uname:
            raise HTTPException(400, "Enter a username")
        target = await db.users.find_one({"username": uname})
        if not target:
            raise HTTPException(404, "No account with that username")
        if target["id"] == current["id"]:
            raise HTTPException(400, "You can't transfer tokens to yourself")
        note = (body.note or "").strip()[:120]
        new_bal = await wallet_core.spend(
            db, now, current["id"], amount, "transfer_sent",
            f"Sent to @{uname}" + (f" — {note}" if note else ""))
        if new_bal is None:
            raise HTTPException(402, "Not enough tokens for this transfer")
        await wallet_core.grant(
            db, now, target["id"], amount, "transfer_received",
            f"From @{current['username']}" + (f" — {note}" if note else ""))
        # Notify the recipient.
        try:
            from uuid import uuid4
            await db.notifications.insert_one({
                "id": str(uuid4()),
                "user_id": target["id"],
                "type": "tokens",
                "actor_id": current["id"],
                "actor_name": current.get("display_name", current["username"]),
                "actor_avatar": ctx.avatar_or_default(current.get("avatar_url")),
                "text": f"sent you {amount} tokens" + (f": {note}" if note else ""),
                "link": "/wallet",
                "read": False,
                "created_at": now(),
            })
        except Exception:
            pass
        return {"balance": new_bal, "sent": amount, "to": uname}

    return router
