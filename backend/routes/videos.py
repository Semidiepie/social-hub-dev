"""Videos router (YouTube-style long-form). Extracted from server.py.

Videos live in a dedicated `videos` collection so they can grow independently
of the short-form `posts.type=reel` records. Schema:
  { id, author_id, title, description, video_url, thumbnail_url, duration,
    size_bytes, visibility: public|unlisted|private, tags[], category,
    views, likes, comments_count, created_at, updated_at }
"""
import uuid
from datetime import datetime, timedelta
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

VIDEO_VISIBILITIES = ("public", "unlisted", "private")


class CreateVideoBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=5000)
    video_url: str = Field(min_length=1)
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    size_bytes: Optional[int] = None
    visibility: Literal["public", "unlisted", "private"] = "public"
    tags: list[str] = Field(default_factory=list)
    category: Optional[str] = None


class UpdateVideoBody(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=140)
    description: Optional[str] = Field(default=None, max_length=5000)
    thumbnail_url: Optional[str] = None
    visibility: Optional[Literal["public", "unlisted", "private"]] = None
    tags: Optional[list[str]] = None
    category: Optional[str] = None


class VideoCommentBody(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    get_current_user = ctx.get_current_user
    get_optional_user = ctx.get_optional_user
    blocked_ids_for = ctx.blocked_ids_for
    cloudinary_compat_url = ctx.cloudinary_compat_url
    avatar_or_default = ctx.avatar_or_default

    router = APIRouter(tags=["videos"])

    async def serialize_video(v: dict, viewer_id: Optional[str] = None) -> dict:
        author = await db.users.find_one({"id": v["author_id"]}, {"_id": 0})
        liked_by_me = False
        if viewer_id:
            liked_by_me = await db.video_likes.find_one({"video_id": v["id"], "user_id": viewer_id}) is not None
        return {
            "id": v["id"],
            "title": v.get("title", ""),
            "description": v.get("description", ""),
            "video_url": cloudinary_compat_url(v.get("video_url")),
            "thumbnail_url": v.get("thumbnail_url"),
            "duration": v.get("duration"),
            "size_bytes": v.get("size_bytes"),
            "visibility": v.get("visibility", "public"),
            "tags": v.get("tags", []),
            "category": v.get("category"),
            "views": v.get("views", 0),
            "likes": v.get("likes", 0),
            "comments_count": v.get("comments_count", 0),
            "created_at": v["created_at"].isoformat() if isinstance(v["created_at"], datetime) else v["created_at"],
            "liked_by_me": liked_by_me,
            "author": {
                "id": author["id"],
                "username": author["username"],
                "display_name": author["display_name"],
                "avatar_url": avatar_or_default(author.get("avatar_url")),
                "is_verified": author.get("is_verified", False),
                "remembering": author.get("remembering", False),
                "is_streamer": author.get("is_streamer", False),
            } if author else None,
        }

    # Expose for other modules/server that may need it.
    ctx.serialize_video = serialize_video

    @router.get("/api/videos")
    async def list_videos(
        viewer: Annotated[Optional[dict], Depends(get_optional_user)],
        q: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 30,
    ):
        """Home feed of public videos. Supports search (title/description/tags) and
        category filter. Blocked authors filtered."""
        viewer_id = viewer["id"] if viewer else None
        blocked = await blocked_ids_for(viewer_id)
        query: dict = {"visibility": "public"}
        if blocked:
            query["author_id"] = {"$nin": list(blocked)}
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
                {"tags": {"$in": [q.lower()]}},
            ]
        if category:
            query["category"] = category
        rows = await db.videos.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 100)).to_list(limit)
        return [await serialize_video(v, viewer_id) for v in rows]

    @router.get("/api/videos/{video_id}")
    async def get_video(
        video_id: str,
        viewer: Annotated[Optional[dict], Depends(get_optional_user)],
    ):
        v = await db.videos.find_one({"id": video_id}, {"_id": 0})
        if not v:
            raise HTTPException(404, "Video not found")
        if v.get("visibility") == "private":
            if not viewer or viewer["id"] != v["author_id"]:
                raise HTTPException(404, "Video not found")
        return await serialize_video(v, viewer["id"] if viewer else None)

    @router.get("/api/videos/{video_id}/related")
    async def related_videos(
        video_id: str,
        viewer: Annotated[Optional[dict], Depends(get_optional_user)],
    ):
        """Simple up-next: same category first, then latest publics. Excludes the
        current video and blocked authors."""
        v = await db.videos.find_one({"id": video_id}, {"_id": 0})
        if not v:
            raise HTTPException(404, "Video not found")
        viewer_id = viewer["id"] if viewer else None
        blocked = await blocked_ids_for(viewer_id)
        base_query: dict = {"id": {"$ne": video_id}, "visibility": "public"}
        if blocked:
            base_query["author_id"] = {"$nin": list(blocked)}
        same_cat: list[dict] = []
        if v.get("category"):
            same_cat = await db.videos.find(
                {**base_query, "category": v["category"]}, {"_id": 0}
            ).sort("created_at", -1).limit(10).to_list(10)
        seen_ids = {row["id"] for row in same_cat}
        extra_query = {**base_query, "id": {"$nin": [video_id, *seen_ids]}}
        extras = await db.videos.find(extra_query, {"_id": 0}).sort("created_at", -1).limit(15).to_list(15)
        rows = [*same_cat, *extras][:15]
        return [await serialize_video(row, viewer_id) for row in rows]

    @router.post("/api/videos", status_code=201)
    async def create_video(body: CreateVideoBody, current: Annotated[dict, Depends(get_current_user)]):
        video_id = str(uuid.uuid4())
        doc = {
            "id": video_id,
            "author_id": current["id"],
            "title": body.title.strip(),
            "description": body.description.strip(),
            "video_url": body.video_url,
            "thumbnail_url": body.thumbnail_url,
            "duration": body.duration,
            "size_bytes": body.size_bytes,
            "visibility": body.visibility,
            "tags": [t.strip().lower() for t in body.tags if t.strip()][:20],
            "category": (body.category or "").strip() or None,
            "views": 0,
            "likes": 0,
            "comments_count": 0,
            "created_at": now(),
            "updated_at": now(),
        }
        await db.videos.insert_one(doc)
        return await serialize_video(doc, current["id"])

    @router.put("/api/videos/{video_id}")
    async def update_video(
        video_id: str,
        body: UpdateVideoBody,
        current: Annotated[dict, Depends(get_current_user)],
    ):
        v = await db.videos.find_one({"id": video_id})
        if not v:
            raise HTTPException(404, "Video not found")
        if v["author_id"] != current["id"]:
            raise HTTPException(403, "Not the video owner")
        updates: dict = {"updated_at": now()}
        for k in ("title", "description", "thumbnail_url", "visibility", "category"):
            val = getattr(body, k)
            if val is not None:
                updates[k] = val.strip() if isinstance(val, str) else val
        if body.tags is not None:
            updates["tags"] = [t.strip().lower() for t in body.tags if t.strip()][:20]
        await db.videos.update_one({"id": video_id}, {"$set": updates})
        fresh = await db.videos.find_one({"id": video_id}, {"_id": 0})
        return await serialize_video(fresh, current["id"])

    @router.delete("/api/videos/{video_id}")
    async def delete_video(video_id: str, current: Annotated[dict, Depends(get_current_user)]):
        v = await db.videos.find_one({"id": video_id})
        if not v:
            raise HTTPException(404, "Video not found")
        if v["author_id"] != current["id"] and not current.get("is_super_admin"):
            raise HTTPException(403, "Not the video owner")
        await db.videos.delete_one({"id": video_id})
        await db.video_likes.delete_many({"video_id": video_id})
        await db.video_comments.delete_many({"video_id": video_id})
        return {"status": "deleted"}

    @router.post("/api/videos/{video_id}/like")
    async def like_video(video_id: str, current: Annotated[dict, Depends(get_current_user)]):
        v = await db.videos.find_one({"id": video_id})
        if not v:
            raise HTTPException(404, "Video not found")
        existing = await db.video_likes.find_one({"video_id": video_id, "user_id": current["id"]})
        if existing:
            return {"likes": v.get("likes", 0), "liked_by_me": True}
        await db.video_likes.insert_one(
            {"id": str(uuid.uuid4()), "video_id": video_id, "user_id": current["id"], "created_at": now()}
        )
        result = await db.videos.find_one_and_update(
            {"id": video_id}, {"$inc": {"likes": 1}}, return_document=True
        )
        return {"likes": result.get("likes", 0), "liked_by_me": True}

    @router.delete("/api/videos/{video_id}/like")
    async def unlike_video(video_id: str, current: Annotated[dict, Depends(get_current_user)]):
        v = await db.videos.find_one({"id": video_id})
        if not v:
            raise HTTPException(404, "Video not found")
        deleted = await db.video_likes.delete_one({"video_id": video_id, "user_id": current["id"]})
        if deleted.deleted_count == 0:
            return {"likes": v.get("likes", 0), "liked_by_me": False}
        result = await db.videos.find_one_and_update(
            {"id": video_id}, {"$inc": {"likes": -1}}, return_document=True
        )
        likes = max(0, result.get("likes", 0))
        if result.get("likes", 0) < 0:
            await db.videos.update_one({"id": video_id}, {"$set": {"likes": 0}})
        return {"likes": likes, "liked_by_me": False}

    @router.post("/api/videos/{video_id}/view")
    async def register_view(video_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        v = await db.videos.find_one({"id": video_id})
        if not v:
            raise HTTPException(404, "Video not found")
        if viewer:
            recent = await db.video_views.find_one({
                "video_id": video_id,
                "viewer_id": viewer["id"],
                "created_at": {"$gt": now() - timedelta(minutes=30)},
            })
            if recent:
                return {"views": v.get("views", 0)}
        await db.video_views.insert_one({
            "id": str(uuid.uuid4()),
            "video_id": video_id,
            "viewer_id": viewer["id"] if viewer else None,
            "created_at": now(),
        })
        result = await db.videos.find_one_and_update(
            {"id": video_id}, {"$inc": {"views": 1}}, return_document=True
        )
        return {"views": result.get("views", 0)}

    @router.get("/api/videos/{video_id}/comments")
    async def list_video_comments(video_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
        rows = await db.video_comments.find({"video_id": video_id}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
        out = []
        for c in rows:
            author = await db.users.find_one({"id": c["user_id"]}, {"_id": 0})
            out.append({
                "id": c["id"],
                "text": c["text"],
                "created_at": c["created_at"].isoformat() if isinstance(c["created_at"], datetime) else c["created_at"],
                "author": {
                    "id": author["id"],
                    "username": author["username"],
                    "display_name": author["display_name"],
                    "avatar_url": avatar_or_default(author.get("avatar_url")),
                    "is_verified": author.get("is_verified", False),
                    "remembering": author.get("remembering", False),
                } if author else None,
            })
        return out

    @router.post("/api/videos/{video_id}/comments", status_code=201)
    async def add_video_comment(
        video_id: str,
        body: VideoCommentBody,
        current: Annotated[dict, Depends(get_current_user)],
    ):
        v = await db.videos.find_one({"id": video_id})
        if not v:
            raise HTTPException(404, "Video not found")
        comment_id = str(uuid.uuid4())
        await db.video_comments.insert_one({
            "id": comment_id,
            "video_id": video_id,
            "user_id": current["id"],
            "text": body.text.strip(),
            "created_at": now(),
        })
        await db.videos.update_one({"id": video_id}, {"$inc": {"comments_count": 1}})
        author = await db.users.find_one({"id": current["id"]}, {"_id": 0})
        return {
            "id": comment_id,
            "text": body.text.strip(),
            "created_at": now().isoformat(),
            "author": {
                "id": author["id"],
                "username": author["username"],
                "display_name": author["display_name"],
                "avatar_url": avatar_or_default(author.get("avatar_url")),
                "is_verified": author.get("is_verified", False),
                "remembering": author.get("remembering", False),
            } if author else None,
        }

    @router.get("/api/users/{user_id}/videos")
    async def channel_videos(
        user_id: str,
        viewer: Annotated[Optional[dict], Depends(get_optional_user)],
    ):
        """A user's channel — all their public + (own only) private videos."""
        is_owner = bool(viewer and viewer["id"] == user_id)
        query: dict = {"author_id": user_id}
        if not is_owner:
            query["visibility"] = {"$in": ["public", "unlisted"]}
        rows = await db.videos.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        viewer_id = viewer["id"] if viewer else None
        return [await serialize_video(v, viewer_id) for v in rows]

    return router
