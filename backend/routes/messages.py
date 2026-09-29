"""Conversations / Messages router. Extracted from server.py.

Covers 1:1 DMs and group "squad" chats: conversation list/create, message
list/send, typing indicators and per-message reactions.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

# Set from server's DEFAULT_AVATAR_URL when the router is built. Any account
# without a custom avatar falls back to this (the PostMePlex logo).
_DEFAULT_AVATAR = ""


def _av(url: Optional[str]) -> str:
    return url or _DEFAULT_AVATAR


class CreateConversationBody(BaseModel):
    member_ids: list[str]
    name: Optional[str] = None  # group name; if None → 1:1
    avatar_url: Optional[str] = None  # group photo (groups only)


class SendMessageBody(BaseModel):
    text: str = Field(default="", max_length=2000)
    image_url: Optional[str] = None


class ReactionBody(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)


class UpdateConversationBody(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class AddMembersBody(BaseModel):
    member_ids: list[str]


def _member_public(m: dict) -> dict:
    return {
        "id": m["id"],
        "username": m["username"],
        "display_name": m["display_name"],
        "avatar_url": _av(m.get("avatar_url")),
        "is_verified": bool(m.get("is_verified", False)),
        "verified_color": m.get("verified_color"),
        "is_live": bool(m.get("is_live", False)),
        "remembering": bool(m.get("remembering", False)),
        "equipped_frame": m.get("equipped_frame"),
        "frame_enabled": m.get("frame_enabled", True),
    }


def conv_preview(c: dict, my_id: str, members_by_id: dict) -> dict:
    other_ids = [m for m in c["member_ids"] if m != my_id]
    is_group = len(c["member_ids"]) > 2 or bool(c.get("name"))
    members = [_member_public(members_by_id[i]) for i in c["member_ids"] if i in members_by_id]
    peer = None
    if is_group:
        title = c.get("name") or "Squad chat"
        avatar = c.get("avatar_url") or next((members_by_id[i].get("avatar_url") for i in other_ids if i in members_by_id and members_by_id[i].get("avatar_url")), "")
    else:
        other = members_by_id.get(other_ids[0]) if other_ids else None
        peer = _member_public(other) if other else None
        title = other["display_name"] if other else "Unknown"
        avatar = other.get("avatar_url", "") if other else ""
    last = c.get("last_message") or {}
    unread = c.get("unread", {}).get(my_id, 0) if isinstance(c.get("unread"), dict) else 0
    return {
        "id": c["id"],
        "is_group": is_group,
        "title": title,
        "avatar_url": _av(avatar),
        "admin_id": c.get("created_by"),
        "member_ids": c["member_ids"],
        "members": members,
        "peer": peer,
        "last_message": last,
        "unread": unread,
        "updated_at": c["updated_at"].isoformat() if isinstance(c.get("updated_at"), datetime) else c.get("updated_at"),
    }


def build_router(ctx) -> APIRouter:
    global _DEFAULT_AVATAR
    _DEFAULT_AVATAR = getattr(ctx, "default_avatar_url", "") or ""
    db = ctx.db
    now = ctx.now
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    send_push = ctx.send_push
    send_web_push = getattr(ctx, "send_web_push", None)

    router = APIRouter(tags=["messages"])

    @router.get("/api/conversations")
    async def list_conversations(current: Annotated[dict, Depends(get_current_user)]):
        rows = await db.conversations.find(
            {"member_ids": current["id"], "hidden_for": {"$ne": current["id"]}}, {"_id": 0}
        ).sort("updated_at", -1).to_list(100)
        member_ids = {m for c in rows for m in c["member_ids"]}
        members_raw = await db.users.find(
            {"id": {"$in": list(member_ids)}}, {"_id": 0, "password_hash": 0}
        ).to_list(500)
        members_by_id = {m["id"]: m for m in members_raw}
        return [conv_preview(c, current["id"], members_by_id) for c in rows]

    @router.post("/api/conversations")
    async def create_conversation(body: CreateConversationBody, current: Annotated[dict, Depends(get_current_user)]):
        members = sorted(set([current["id"], *body.member_ids]))
        if len(members) < 2:
            raise HTTPException(400, "Need at least 2 members")
        valid = await db.users.count_documents({"id": {"$in": members}})
        if valid != len(members):
            raise HTTPException(400, "Invalid member ids")
        is_group = len(members) > 2 or bool(body.name)
        if not is_group:
            existing = await db.conversations.find_one(
                {"member_ids": members, "name": None}, {"_id": 0}
            )
            if existing:
                members_raw = await db.users.find(
                    {"id": {"$in": members}}, {"_id": 0, "password_hash": 0}
                ).to_list(10)
                return conv_preview(existing, current["id"], {m["id"]: m for m in members_raw})
            # Mutual-follow gate: you can only START a new 1:1 chat with someone
            # who follows you back (both directions). Existing chats + groups exempt.
            other_id = next(m for m in members if m != current["id"])
            i_follow = await db.follows.find_one({"follower_id": current["id"], "followee_id": other_id})
            they_follow = await db.follows.find_one({"follower_id": other_id, "followee_id": current["id"]})
            if not (i_follow and they_follow):
                raise HTTPException(403, "You can only message people who follow you back.")
        doc = {
            "id": str(uuid.uuid4()),
            "member_ids": members,
            "name": body.name,
            "avatar_url": body.avatar_url if is_group else None,
            "created_by": current["id"],
            "created_at": now(),
            "updated_at": now(),
            "last_message": None,
            "unread": {m: 0 for m in members},
        }
        await db.conversations.insert_one(doc)
        members_raw = await db.users.find(
            {"id": {"$in": members}}, {"_id": 0, "password_hash": 0}
        ).to_list(50)
        return conv_preview(doc, current["id"], {m["id"]: m for m in members_raw})

    @router.get("/api/conversations/{conv_id}/messages")
    async def list_messages(conv_id: str, current: Annotated[dict, Depends(get_current_user)]):
        c = await db.conversations.find_one({"id": conv_id})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        rows = await db.messages.find(
            {"conversation_id": conv_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(500)
        sender_ids = list({m.get("sender_id") for m in rows if m.get("sender_id")})
        senders: dict = {}
        if sender_ids:
            async for u in db.users.find(
                {"id": {"$in": sender_ids}},
                {"_id": 0, "id": 1, "display_name": 1, "is_verified": 1, "remembering": 1, "equipped_frame": 1, "frame_enabled": 1, "avatar_url": 1, "verified_color": 1, "is_live": 1},
            ):
                senders[u["id"]] = u
        for m in rows:
            if isinstance(m.get("created_at"), datetime):
                m["created_at"] = m["created_at"].isoformat()
            m.setdefault("image_url", None)
            m.setdefault("reactions", [])
            m.setdefault("read_by", [])
            u = senders.get(m.get("sender_id"), {})
            m["sender_display_name"] = m.get("sender_display_name") or u.get("display_name") or m.get("sender_username")
            m["sender_verified"] = bool(u.get("is_verified", m.get("sender_verified", False)))
            m["sender_verified_color"] = u.get("verified_color", m.get("sender_verified_color"))
            m["sender_remembering"] = bool(u.get("remembering", m.get("sender_remembering", False)))
            m["sender_frame"] = u.get("equipped_frame") if u.get("frame_enabled", True) else None
            m["sender_is_live"] = bool(u.get("is_live", False))
            m["sender_avatar"] = _av(m.get("sender_avatar") or u.get("avatar_url"))
        last_id = rows[-1]["id"] if rows else None
        set_doc: dict = {f"unread.{current['id']}": 0}
        if last_id:
            set_doc[f"read_by.{current['id']}"] = {"message_id": last_id, "at": now().isoformat()}
        await db.conversations.update_one({"id": conv_id}, {"$set": set_doc})
        if rows and last_id:
            msg_ids_to_mark = [m["id"] for m in rows if m["sender_id"] != current["id"]]
            if msg_ids_to_mark:
                await db.messages.update_many(
                    {"id": {"$in": msg_ids_to_mark}},
                    {"$addToSet": {"read_by": current["id"]}},
                )
        return rows

    @router.post("/api/conversations/{conv_id}/messages")
    async def send_message(conv_id: str, body: SendMessageBody, current: Annotated[dict, Depends(get_current_user)]):
        c = await db.conversations.find_one({"id": conv_id})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        if not body.text.strip() and not body.image_url:
            raise HTTPException(400, "Message must have text or image")
        msg = {
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "sender_id": current["id"],
            "sender_username": current["username"],
            "sender_display_name": current.get("display_name", current["username"]),
            "sender_avatar": _av(current.get("avatar_url")),
            "sender_verified": bool(current.get("is_verified", False)),
            "sender_verified_color": current.get("verified_color"),
            "sender_remembering": bool(current.get("remembering", False)),
            "sender_frame": current.get("equipped_frame") if current.get("frame_enabled", True) else None,
            "text": body.text,
            "image_url": body.image_url,
            "reactions": [],
            "read_by": [current["id"]],
            "created_at": now(),
        }
        await db.messages.insert_one(msg)
        msg.pop("_id", None)
        incs = {f"unread.{m}": 1 for m in c["member_ids"] if m != current["id"]}
        preview = body.text[:200] if body.text.strip() else "📷 Photo"
        update_doc: dict = {
            "$set": {
                "updated_at": now(),
                "hidden_for": [],
                "last_message": {
                    "text": preview,
                    "sender_id": current["id"],
                    "sender_username": current["username"],
                    "created_at": now().isoformat(),
                },
                f"typing.{current['id']}": None,
            },
        }
        if incs:
            update_doc["$inc"] = incs
        await db.conversations.update_one({"id": conv_id}, update_doc)
        try:
            recipients = [m for m in c["member_ids"] if m != current["id"]]
            await send_push(
                recipients=recipients,
                data={
                    "title": f"New message from {current['display_name']}",
                    "message": preview[:140],
                    "action_url": f"/messages/{conv_id}",
                },
            )
            # Also fire a browser (web app) push for each recipient.
            if send_web_push:
                for r in recipients:
                    await send_web_push(
                        r,
                        f"New message from {current['display_name']}",
                        preview[:140],
                        f"/messages/{conv_id}",
                    )
        except Exception as e:
            logger.warning(f"DM push failed: {e}")
        return {**msg, "created_at": msg["created_at"].isoformat()}

    @router.post("/api/conversations/{conv_id}/typing")
    async def set_typing(conv_id: str, current: Annotated[dict, Depends(get_current_user)]):
        """Heartbeat: client posts every ~3s while user is typing. We just store
        a timestamp; the GET endpoint considers anyone typed-within-5s as 'typing'."""
        c = await db.conversations.find_one({"id": conv_id}, {"_id": 0, "member_ids": 1})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        await db.conversations.update_one(
            {"id": conv_id},
            {"$set": {f"typing.{current['id']}": now()}},
        )
        return {"status": "ok"}

    @router.get("/api/conversations/{conv_id}/typing")
    async def get_typing(conv_id: str, current: Annotated[dict, Depends(get_current_user)]):
        """Returns the list of users currently typing (excluding the caller)."""
        c = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        cutoff = now() - timedelta(seconds=5)
        typing_map = c.get("typing") or {}

        def _aware(t: datetime) -> datetime:
            # Mongo returns naive UTC datetimes; make them tz-aware to compare.
            return t if t.tzinfo is not None else t.replace(tzinfo=timezone.utc)

        typing_ids = [
            uid for uid, t in typing_map.items()
            if uid != current["id"] and isinstance(t, datetime) and _aware(t) > cutoff
        ]
        if not typing_ids:
            return {"users": []}
        users = await db.users.find(
            {"id": {"$in": typing_ids}}, {"_id": 0, "id": 1, "username": 1, "display_name": 1}
        ).to_list(20)
        return {"users": users}

    @router.post("/api/messages/{message_id}/reactions")
    async def react_to_message(message_id: str, body: ReactionBody, current: Annotated[dict, Depends(get_current_user)]):
        msg = await db.messages.find_one({"id": message_id})
        if not msg:
            raise HTTPException(404, "Message not found")
        c = await db.conversations.find_one({"id": msg["conversation_id"]}, {"_id": 0, "member_ids": 1})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        await db.messages.update_one(
            {"id": message_id},
            {"$pull": {"reactions": {"user_id": current["id"]}}},
        )
        await db.messages.update_one(
            {"id": message_id},
            {"$push": {"reactions": {"user_id": current["id"], "username": current["username"], "emoji": body.emoji, "at": now().isoformat()}}},
        )
        updated = await db.messages.find_one({"id": message_id}, {"_id": 0, "reactions": 1})
        return {"reactions": (updated or {}).get("reactions", [])}

    @router.delete("/api/messages/{message_id}/reactions")
    async def unreact_message(message_id: str, current: Annotated[dict, Depends(get_current_user)]):
        msg = await db.messages.find_one({"id": message_id})
        if not msg:
            raise HTTPException(404, "Message not found")
        await db.messages.update_one(
            {"id": message_id},
            {"$pull": {"reactions": {"user_id": current["id"]}}},
        )
        updated = await db.messages.find_one({"id": message_id}, {"_id": 0, "reactions": 1})
        return {"reactions": (updated or {}).get("reactions", [])}

    @router.delete("/api/messages/{message_id}")
    async def delete_message(message_id: str, current: Annotated[dict, Depends(get_current_user)]):
        """Delete one of your own messages."""
        msg = await db.messages.find_one({"id": message_id})
        if not msg:
            raise HTTPException(404, "Message not found")
        if msg["sender_id"] != current["id"]:
            raise HTTPException(403, "You can only delete your own messages")
        await db.messages.delete_one({"id": message_id})
        return {"status": "deleted"}

    @router.delete("/api/conversations/{conv_id}")
    async def delete_conversation(conv_id: str, current: Annotated[dict, Depends(get_current_user)]):
        """Remove a conversation from YOUR message list (hidden per-user). A new
        incoming message unhides it. If everyone has hidden it, purge it fully."""
        c = await db.conversations.find_one({"id": conv_id})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        hidden = set(c.get("hidden_for") or [])
        hidden.add(current["id"])
        if hidden.issuperset(set(c["member_ids"])):
            await db.conversations.delete_one({"id": conv_id})
            await db.messages.delete_many({"conversation_id": conv_id})
        else:
            await db.conversations.update_one(
                {"id": conv_id}, {"$addToSet": {"hidden_for": current["id"]}}
            )
        return {"status": "deleted"}

    @router.patch("/api/conversations/{conv_id}")
    async def update_conversation(conv_id: str, body: UpdateConversationBody, current: Annotated[dict, Depends(get_current_user)]):
        """Rename a group or change its photo. Admin (creator) only, groups only."""
        c = await db.conversations.find_one({"id": conv_id})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        is_group = len(c["member_ids"]) > 2 or bool(c.get("name"))
        if not is_group:
            raise HTTPException(400, "Only group chats can be edited")
        if c.get("created_by") != current["id"]:
            raise HTTPException(403, "Only the group admin can edit this group")
        patch: dict = {}
        if body.name is not None:
            name = body.name.strip()[:60]
            if not name:
                raise HTTPException(400, "Group name cannot be empty")
            patch["name"] = name
        if body.avatar_url is not None:
            patch["avatar_url"] = body.avatar_url or None
        if patch:
            await db.conversations.update_one({"id": conv_id}, {"$set": patch})
        c = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
        members_raw = await db.users.find({"id": {"$in": c["member_ids"]}}, {"_id": 0, "password_hash": 0}).to_list(50)
        return conv_preview(c, current["id"], {m["id"]: m for m in members_raw})

    @router.post("/api/conversations/{conv_id}/members")
    async def add_members(conv_id: str, body: AddMembersBody, current: Annotated[dict, Depends(get_current_user)]):
        """Add members to a group. Admin (creator) only."""
        c = await db.conversations.find_one({"id": conv_id})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        is_group = len(c["member_ids"]) > 2 or bool(c.get("name"))
        if not is_group:
            raise HTTPException(400, "Only group chats can have members added")
        if c.get("created_by") != current["id"]:
            raise HTTPException(403, "Only the group admin can add members")
        to_add = [m for m in set(body.member_ids) if m not in c["member_ids"]]
        if to_add:
            valid = await db.users.count_documents({"id": {"$in": to_add}})
            if valid != len(to_add):
                raise HTTPException(400, "Invalid member ids")
            await db.conversations.update_one(
                {"id": conv_id},
                {"$addToSet": {"member_ids": {"$each": to_add}}, "$set": {"updated_at": now()}},
            )
            for m in to_add:
                await db.conversations.update_one({"id": conv_id}, {"$set": {f"unread.{m}": 0}})
        c = await db.conversations.find_one({"id": conv_id}, {"_id": 0})
        members_raw = await db.users.find({"id": {"$in": c["member_ids"]}}, {"_id": 0, "password_hash": 0}).to_list(50)
        return conv_preview(c, current["id"], {m["id"]: m for m in members_raw})

    @router.delete("/api/conversations/{conv_id}/members/{user_id}")
    async def remove_member(conv_id: str, user_id: str, current: Annotated[dict, Depends(get_current_user)]):
        """Remove a member (admin only) or leave the group yourself."""
        c = await db.conversations.find_one({"id": conv_id})
        if not c or current["id"] not in c["member_ids"]:
            raise HTTPException(404, "Conversation not found")
        is_group = len(c["member_ids"]) > 2 or bool(c.get("name"))
        if not is_group:
            raise HTTPException(400, "Not a group chat")
        is_self = user_id == current["id"]
        if not is_self and c.get("created_by") != current["id"]:
            raise HTTPException(403, "Only the group admin can remove members")
        if user_id not in c["member_ids"]:
            raise HTTPException(404, "Member not in group")
        await db.conversations.update_one(
            {"id": conv_id},
            {"$pull": {"member_ids": user_id}, "$unset": {f"unread.{user_id}": ""}, "$set": {"updated_at": now()}},
        )
        remaining = [m for m in c["member_ids"] if m != user_id]
        if len(remaining) < 2:
            await db.conversations.delete_one({"id": conv_id})
            await db.messages.delete_many({"conversation_id": conv_id})
            return {"status": "removed", "deleted": True}
        # If the admin left, hand admin to the next remaining member.
        if user_id == c.get("created_by"):
            await db.conversations.update_one({"id": conv_id}, {"$set": {"created_by": remaining[0]}})
        return {"status": "removed", "deleted": False}

    return router
