"""Audio live rooms + Blogs routes.

Mounted from server.py via build_router(db, get_current_user).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Callable, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("postmeplex.rooms_blogs")

def _now() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# Models
# ============================================================
class BlogUpsertBody(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    subtitle: Optional[str] = Field(default=None, max_length=240)
    cover_url: Optional[str] = None
    body_md: str = Field(min_length=1, max_length=60_000)
    status: Literal["draft", "published"] = "draft"
    tags: list[str] = Field(default_factory=list, max_length=10)


class BlogPermissionRequestBody(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


def _author_view(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user.get("display_name") or user["username"],
        "avatar_url": user.get("avatar_url", ""),
        "is_verified": bool(user.get("is_verified")),
        "remembering": bool(user.get("remembering")),
    }


def _serialize_blog(doc: dict, author: Optional[dict], liked_by_me: bool = False) -> dict:
    return {
        "id": doc["id"],
        "title": doc.get("title", ""),
        "subtitle": doc.get("subtitle") or "",
        "cover_url": doc.get("cover_url") or "",
        "body_md": doc.get("body_md", ""),
        "status": doc.get("status", "draft"),
        "tags": doc.get("tags", []),
        "views": doc.get("views", 0),
        "likes": int(doc.get("likes") or 0),
        "liked_by_me": bool(liked_by_me),
        "reading_time": doc.get("reading_time", 0),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
        "updated_at": doc["updated_at"].isoformat() if isinstance(doc.get("updated_at"), datetime) else doc.get("updated_at"),
        "published_at": doc["published_at"].isoformat() if isinstance(doc.get("published_at"), datetime) else doc.get("published_at"),
        "author": _author_view(author) if author else None,
    }


def _reading_time(text: str) -> int:
    words = len((text or "").split())
    return max(1, round(words / 220))


# ============================================================
# Router
# ============================================================
def build_router(db, get_current_user: Callable, get_optional_user: Callable) -> APIRouter:
    router = APIRouter(tags=["rooms-blogs"])

    # ---------- Blogs ----------
    async def _ensure_blog_perm(user: dict) -> None:
        if user.get("is_super_admin") or user.get("is_admin"):
            return
        if user.get("blog_permission") != "granted":
            raise HTTPException(
                status_code=403,
                detail="You need blog publishing permission. Ask an admin to grant it.",
            )

    @router.get("/api/blogs/me/permission")
    async def blog_perm_status(current: dict = Depends(get_current_user)) -> dict:
        # Admins & super admins always have permission
        granted = bool(
            current.get("is_super_admin")
            or current.get("is_admin")
            or current.get("blog_permission") == "granted"
        )
        pending = current.get("blog_permission") == "pending"
        return {
            "granted": granted,
            "pending": pending,
            "requested_reason": current.get("blog_permission_reason") or "",
        }

    @router.post("/api/blogs/request-permission")
    async def blog_request_permission(
        body: BlogPermissionRequestBody, current: dict = Depends(get_current_user)
    ) -> dict:
        if current.get("blog_permission") == "granted":
            return {"status": "already_granted"}
        await db.users.update_one(
            {"id": current["id"]},
            {"$set": {
                "blog_permission": "pending",
                "blog_permission_reason": body.reason.strip(),
                "blog_permission_requested_at": _now(),
            }},
        )
        logger.info(f"[blog] permission requested by {current['id']}")
        return {"status": "pending"}

    @router.get("/api/admin/blog-requests")
    async def admin_blog_requests(current: dict = Depends(get_current_user)) -> list[dict]:
        if not (current.get("is_super_admin") or current.get("is_admin")):
            raise HTTPException(403, "Admin only")
        out = []
        async for u in db.users.find(
            {"blog_permission": "pending"}, {"_id": 0, "password_hash": 0}
        ).sort("blog_permission_requested_at", 1):
            out.append({
                "user_id": u["id"],
                "username": u["username"],
                "display_name": u.get("display_name") or u["username"],
                "avatar_url": u.get("avatar_url", ""),
                "is_verified": bool(u.get("is_verified")),
                "reason": u.get("blog_permission_reason", ""),
                "requested_at": u.get("blog_permission_requested_at").isoformat()
                    if isinstance(u.get("blog_permission_requested_at"), datetime) else None,
            })
        return out

    @router.post("/api/admin/blogs/grant/{user_id}")
    async def admin_grant_blog(user_id: str, current: dict = Depends(get_current_user)) -> dict:
        if not (current.get("is_super_admin") or current.get("is_admin")):
            raise HTTPException(403, "Admin only")
        res = await db.users.update_one(
            {"id": user_id},
            {"$set": {"blog_permission": "granted", "blog_permission_granted_at": _now()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "User not found")
        return {"ok": True}

    @router.post("/api/admin/blogs/revoke/{user_id}")
    async def admin_revoke_blog(user_id: str, current: dict = Depends(get_current_user)) -> dict:
        if not (current.get("is_super_admin") or current.get("is_admin")):
            raise HTTPException(403, "Admin only")
        res = await db.users.update_one(
            {"id": user_id},
            {"$unset": {
                "blog_permission": "",
                "blog_permission_reason": "",
                "blog_permission_requested_at": "",
                "blog_permission_granted_at": "",
            }},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "User not found")
        return {"ok": True}

    @router.post("/api/blogs", status_code=201)
    async def create_blog(body: BlogUpsertBody, current: dict = Depends(get_current_user)) -> dict:
        await _ensure_blog_perm(current)
        now = _now()
        doc = {
            "id": str(uuid.uuid4()),
            "author_id": current["id"],
            "title": body.title.strip(),
            "subtitle": (body.subtitle or "").strip(),
            "cover_url": (body.cover_url or "").strip(),
            "body_md": body.body_md,
            "status": body.status,
            "tags": [t.strip().lower() for t in (body.tags or []) if t.strip()][:10],
            "views": 0,
            "reading_time": _reading_time(body.body_md),
            "created_at": now,
            "updated_at": now,
            "published_at": now if body.status == "published" else None,
        }
        await db.blogs.insert_one(doc)
        return _serialize_blog(doc, current)

    @router.put("/api/blogs/{blog_id}")
    async def update_blog(
        blog_id: str, body: BlogUpsertBody, current: dict = Depends(get_current_user)
    ) -> dict:
        blog = await db.blogs.find_one({"id": blog_id})
        if not blog:
            raise HTTPException(404, "Not found")
        if blog["author_id"] != current["id"] and not (
            current.get("is_super_admin") or current.get("is_admin")
        ):
            raise HTTPException(403, "Not your blog")
        await _ensure_blog_perm(current)
        upd = {
            "title": body.title.strip(),
            "subtitle": (body.subtitle or "").strip(),
            "cover_url": (body.cover_url or "").strip(),
            "body_md": body.body_md,
            "status": body.status,
            "tags": [t.strip().lower() for t in (body.tags or []) if t.strip()][:10],
            "reading_time": _reading_time(body.body_md),
            "updated_at": _now(),
        }
        if body.status == "published" and not blog.get("published_at"):
            upd["published_at"] = _now()
        await db.blogs.update_one({"id": blog_id}, {"$set": upd})
        fresh = await db.blogs.find_one({"id": blog_id}, {"_id": 0})
        author = await db.users.find_one({"id": fresh["author_id"]}, {"_id": 0})
        return _serialize_blog(fresh, author)

    @router.delete("/api/blogs/{blog_id}")
    async def delete_blog(blog_id: str, current: dict = Depends(get_current_user)) -> dict:
        blog = await db.blogs.find_one({"id": blog_id})
        if not blog:
            raise HTTPException(404, "Not found")
        if blog["author_id"] != current["id"] and not (
            current.get("is_super_admin") or current.get("is_admin")
        ):
            raise HTTPException(403, "Not your blog")
        await db.blogs.delete_one({"id": blog_id})
        return {"ok": True}

    async def _liked_ids(user_id: Optional[str], blog_ids: list[str]) -> set[str]:
        if not user_id or not blog_ids:
            return set()
        cursor = db.blog_likes.find(
            {"user_id": user_id, "blog_id": {"$in": blog_ids}},
            {"_id": 0, "blog_id": 1},
        )
        return {row["blog_id"] async for row in cursor}

    @router.get("/api/blogs")
    async def list_blogs(
        limit: int = 30,
        viewer: Optional[dict] = Depends(get_optional_user),
    ) -> list[dict]:
        limit = max(1, min(60, limit))
        raw = []
        async for b in db.blogs.find({"status": "published"}, {"_id": 0}).sort(
            "published_at", -1
        ).limit(limit):
            raw.append(b)
        liked = await _liked_ids(viewer["id"] if viewer else None, [b["id"] for b in raw])
        rows = []
        for b in raw:
            author = await db.users.find_one({"id": b["author_id"]}, {"_id": 0})
            rows.append(_serialize_blog(b, author, b["id"] in liked))
        return rows

    @router.get("/api/blogs/mine")
    async def my_blogs(current: dict = Depends(get_current_user)) -> list[dict]:
        raw = []
        async for b in db.blogs.find({"author_id": current["id"]}, {"_id": 0}).sort(
            "updated_at", -1
        ).limit(100):
            raw.append(b)
        liked = await _liked_ids(current["id"], [b["id"] for b in raw])
        return [_serialize_blog(b, current, b["id"] in liked) for b in raw]

    @router.get("/api/blogs/user/{user_id}")
    async def blogs_by_user(
        user_id: str, viewer: Optional[dict] = Depends(get_optional_user)
    ) -> list[dict]:
        rows = []
        author = await db.users.find_one({"id": user_id}, {"_id": 0})
        raw = []
        async for b in db.blogs.find(
            {"author_id": user_id, "status": "published"}, {"_id": 0}
        ).sort("published_at", -1).limit(100):
            raw.append(b)
        liked = await _liked_ids(viewer["id"] if viewer else None, [b["id"] for b in raw])
        for b in raw:
            rows.append(_serialize_blog(b, author, b["id"] in liked))
        return rows

    @router.get("/api/blogs/{blog_id}")
    async def get_blog(
        blog_id: str, viewer: Optional[dict] = Depends(get_optional_user)
    ) -> dict:
        blog = await db.blogs.find_one({"id": blog_id}, {"_id": 0})
        if not blog:
            raise HTTPException(404, "Not found")
        if blog.get("status") != "published":
            raise HTTPException(404, "Not found")
        try:
            await db.blogs.update_one({"id": blog_id}, {"$inc": {"views": 1}})
        except Exception:  # noqa: BLE001
            pass
        author = await db.users.find_one({"id": blog["author_id"]}, {"_id": 0})
        liked_by_me = False
        if viewer:
            liked_by_me = bool(
                await db.blog_likes.find_one(
                    {"blog_id": blog_id, "user_id": viewer["id"]}, {"_id": 1}
                )
            )
        return _serialize_blog(blog, author, liked_by_me)

    @router.post("/api/blogs/{blog_id}/like")
    async def toggle_like(blog_id: str, current: dict = Depends(get_current_user)) -> dict:
        blog = await db.blogs.find_one({"id": blog_id}, {"_id": 0, "status": 1, "likes": 1})
        if not blog or blog.get("status") != "published":
            raise HTTPException(404, "Not found")
        existing = await db.blog_likes.find_one(
            {"blog_id": blog_id, "user_id": current["id"]}, {"_id": 1}
        )
        if existing:
            await db.blog_likes.delete_one(
                {"blog_id": blog_id, "user_id": current["id"]}
            )
            await db.blogs.update_one({"id": blog_id}, {"$inc": {"likes": -1}})
            new_count = max(0, int(blog.get("likes") or 0) - 1)
            return {"liked": False, "likes": new_count}
        await db.blog_likes.insert_one(
            {
                "blog_id": blog_id,
                "user_id": current["id"],
                "created_at": _now(),
            }
        )
        await db.blogs.update_one({"id": blog_id}, {"$inc": {"likes": 1}})
        new_count = int(blog.get("likes") or 0) + 1
        return {"liked": True, "likes": new_count}

    return router
