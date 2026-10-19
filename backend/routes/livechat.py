"""Community Live Chat — a single public board where everyone can talk in real time.
Messages carry the sender's colored verified badge + profile-picture frame."""
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class LiveChatBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    get_current_user = ctx.get_current_user
    get_optional_user = ctx.get_optional_user
    avatar_or_default = ctx.avatar_or_default

    router = APIRouter(tags=["livechat"])

    def _frame_of(u: dict):
        if not u.get("frame_enabled", True):
            return None
        ef = u.get("equipped_frame")
        return u.get("custom_frame") if ef == "custom" else ef

    def _out(m: dict) -> dict:
        created = m.get("created_at")
        return {
            "id": m.get("id"),
            "user_id": m.get("user_id"),
            "username": m.get("username"),
            "display_name": m.get("display_name"),
            "avatar_url": m.get("avatar_url"),
            "is_verified": bool(m.get("is_verified", False)),
            "verified_color": m.get("verified_color"),
            "remembering": bool(m.get("remembering", False)),
            "frame": m.get("frame"),
            "text": m.get("text"),
            "created_at": created.isoformat() if isinstance(created, datetime) else created,
        }

    @router.get("/api/livechat")
    async def list_livechat(after: str = "", current=Depends(get_optional_user)):
        if after:
            try:
                dt = datetime.fromisoformat(after)
            except ValueError:
                dt = None
            if dt is not None:
                rows = await db.community_chat.find(
                    {"created_at": {"$gt": dt}}, {"_id": 0}).sort("created_at", 1).to_list(200)
                return [_out(m) for m in rows]
        rows = await db.community_chat.find({}, {"_id": 0}).sort("created_at", -1).to_list(80)
        rows.reverse()
        return [_out(m) for m in rows]

    @router.post("/api/livechat")
    async def post_livechat(body: LiveChatBody, current: Annotated[dict, Depends(get_current_user)]):
        text = body.text.strip()
        if not text:
            raise HTTPException(400, "Message is empty")
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": current["id"],
            "username": current["username"],
            "display_name": current.get("display_name", current["username"]),
            "avatar_url": avatar_or_default(current.get("avatar_url")),
            "is_verified": bool(current.get("is_verified", False)),
            "verified_color": current.get("verified_color"),
            "remembering": bool(current.get("remembering", False)),
            "frame": _frame_of(current),
            "text": text,
            "created_at": now(),
        }
        await db.community_chat.insert_one(doc)
        doc.pop("_id", None)
        return _out(doc)

    @router.delete("/api/livechat/{message_id}")
    async def delete_livechat(message_id: str, current: Annotated[dict, Depends(get_current_user)]):
        m = await db.community_chat.find_one({"id": message_id}, {"_id": 0, "user_id": 1})
        if not m:
            raise HTTPException(404, "Message not found")
        is_mod = current.get("is_admin") or current.get("is_super_admin")
        if m["user_id"] != current["id"] and not is_mod:
            raise HTTPException(403, "You can only delete your own messages")
        await db.community_chat.delete_one({"id": message_id})
        return {"status": "deleted"}

    return router
