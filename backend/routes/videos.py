"""Videos router (YouTube-style long-form). Extracted from server.py.

Videos live in a dedicated `videos` collection so they can grow independently
of the short-form `posts.type=reel` records. Schema:
  { id, author_id, title, description, video_url, thumbnail_url, duration,
    size_bytes, visibility: public|unlisted|private, tags[], category,
    views, likes, comments_count, created_at, updated_at }
"""
import base64
import re
import uuid
from datetime import datetime, timedelta
from typing import Annotated, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

import settings_store

VIDEO_VISIBILITIES = ("public", "unlisted", "private")

# Cloudflare Stream limits (application policy).
STREAM_MAX_BYTES_FILE = 1 * 1024 ** 3     # 1GB — "Upload file" tab
STREAM_MAX_BYTES_URL = 30 * 1024 ** 3     # 30GB — "Import from link" tab
STREAM_MAX_SECONDS = 2 * 60 * 60          # 2h default max duration


def _stream_cfg():
    return settings_store.get("CLOUDFLARE_ACCOUNT_ID"), settings_store.get("CLOUDFLARE_API_TOKEN")


def _stream_base(account_id: str) -> str:
    return f"https://api.cloudflare.com/client/v4/accounts/{account_id}/stream"


def _resolve_drive_url(url: str) -> str:
    """Turn a Google Drive share link into a direct download URL. Other URLs pass
    through unchanged. Large Drive files behind the virus-scan interstitial may
    still fail — Cloudflare surfaces that as an error."""
    if "drive.google.com" not in url:
        return url
    m = re.search(r"/file/d/([^/]+)", url) or re.search(r"[?&]id=([^&]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    return url


def _is_public_http_url(url: str) -> bool:
    if not re.match(r"^https?://", url, re.I):
        return False
    host = re.sub(r"^https?://", "", url, flags=re.I).split("/")[0].split(":")[0].lower()
    blocked = ("localhost", "127.", "10.", "192.168.", "169.254.", "0.0.0.0", "::1")
    return not (host in ("localhost",) or any(host.startswith(b) for b in blocked))


class CreateVideoBody(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=5000)
    video_url: Optional[str] = None
    stream_uid: Optional[str] = None
    hls_url: Optional[str] = None
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
    parent_id: Optional[str] = None


class StreamUrlBody(BaseModel):
    url: str = Field(min_length=4)


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
            "stream_uid": v.get("stream_uid"),
            "hls_url": v.get("hls_url"),
            "provider": v.get("provider", "cloudinary"),
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
                "verified_color": author.get("verified_color"),
                "is_live": author.get("is_live", False),
                "remembering": author.get("remembering", False),
                "is_streamer": author.get("is_streamer", False),
                "equipped_frame": author.get("equipped_frame"), "custom_frame": author.get("custom_frame"),
                "frame_enabled": author.get("frame_enabled", True),
            } if author else None,
        }

    # Expose for other modules/server that may need it.
    ctx.serialize_video = serialize_video

    # ---- Cloudflare Stream: fast resumable upload + link import + status ----
    @router.post("/api/videos/stream/tus-upload")
    async def stream_tus_upload(request: Request, current: Annotated[dict, Depends(get_current_user)]):
        """Mint a one-time TUS direct-creator-upload URL. The browser then PATCHes
        chunks straight to Cloudflare (fast + resumable). Capped at 1GB here."""
        account_id, token = _stream_cfg()
        if not (account_id and token):
            raise HTTPException(503, "Video uploads aren't configured yet (Cloudflare Stream).")
        length = request.headers.get("Upload-Length")
        if not length or not length.isdigit():
            raise HTTPException(400, "Upload-Length is required")
        size = int(length)
        if size <= 0 or size > STREAM_MAX_BYTES_FILE:
            raise HTTPException(413, "File is over 1GB — use the Import from link tab for larger videos.")
        metadata = request.headers.get("Upload-Metadata", "")
        items = [x for x in metadata.split(",") if x and not x.strip().startswith("maxDurationSeconds")]
        items.append("maxDurationSeconds " + base64.b64encode(str(STREAM_MAX_SECONDS).encode()).decode())
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(
                    f"{_stream_base(account_id)}?direct_user=true",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Tus-Resumable": "1.0.0",
                        "Upload-Length": str(size),
                        "Upload-Metadata": ",".join(items),
                        "Upload-Creator": current["id"],
                    },
                )
        except Exception as e:
            raise HTTPException(502, f"Couldn't reach the video engine: {e}")
        if r.status_code >= 400:
            raise HTTPException(502, f"Stream upload init failed: {r.text[:300]}")
        resp = Response(status_code=201)
        resp.headers["Location"] = r.headers.get("Location", "")
        resp.headers["stream-media-id"] = r.headers.get("stream-media-id", "")
        resp.headers["Access-Control-Expose-Headers"] = "Location, stream-media-id, Upload-Offset, Tus-Resumable"
        return resp

    @router.post("/api/videos/stream/from-url")
    async def stream_from_url(body: StreamUrlBody, current: Annotated[dict, Depends(get_current_user)]):
        """Hand a public Google Drive or direct video URL to Cloudflare, which
        downloads + re-hosts it. Up to 30GB."""
        account_id, token = _stream_cfg()
        if not (account_id and token):
            raise HTTPException(503, "Link import isn't configured yet (Cloudflare Stream).")
        src = _resolve_drive_url(body.url.strip())
        if not _is_public_http_url(src):
            raise HTTPException(400, "Enter a public http(s) link — a Google Drive 'Anyone with the link' URL or a direct video file URL.")
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(
                    f"{_stream_base(account_id)}/copy",
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    json={"url": src, "maxDurationSeconds": STREAM_MAX_SECONDS},
                )
        except Exception as e:
            raise HTTPException(502, f"Couldn't reach the video engine: {e}")
        if r.status_code >= 400:
            raise HTTPException(400, "Couldn't fetch that link. Make sure it's public ('Anyone with the link') or a direct video file URL that isn't login-protected or expired.")
        result = r.json().get("result", {})
        return {
            "uid": result.get("uid"),
            "state": (result.get("status") or {}).get("state", "downloading"),
            "ready": result.get("readyToStream", False),
        }

    @router.get("/api/videos/stream/{uid}/status")
    async def stream_status(uid: str, current: Annotated[dict, Depends(get_current_user)]):
        account_id, token = _stream_cfg()
        if not (account_id and token):
            raise HTTPException(503, "Cloudflare Stream isn't configured.")
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(f"{_stream_base(account_id)}/{uid}", headers={"Authorization": f"Bearer {token}"})
        except Exception as e:
            raise HTTPException(502, f"Couldn't reach the video engine: {e}")
        if r.status_code >= 400:
            raise HTTPException(404, "Video not found on the engine")
        v = r.json().get("result", {})
        st = v.get("status") or {}
        return {
            "uid": uid,
            "ready": v.get("readyToStream", False),
            "state": st.get("state"),
            "pct": st.get("pctComplete"),
            "duration": v.get("duration"),
            "thumbnail": v.get("thumbnail"),
            "hls": (v.get("playback") or {}).get("hls"),
            "error": st.get("errReasonText"),
        }

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
        if not body.stream_uid and not (body.video_url and body.video_url.strip()):
            raise HTTPException(400, "A video upload or link is required")
        provider = "stream" if body.stream_uid else "cloudinary"
        video_id = str(uuid.uuid4())
        doc = {
            "id": video_id,
            "author_id": current["id"],
            "title": body.title.strip(),
            "description": body.description.strip(),
            "video_url": (body.video_url or "").strip() or None,
            "stream_uid": body.stream_uid,
            "hls_url": body.hls_url,
            "provider": provider,
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
                "parent_id": c.get("parent_id"),
                "created_at": c["created_at"].isoformat() if isinstance(c["created_at"], datetime) else c["created_at"],
                "author": {
                    "id": author["id"],
                    "username": author["username"],
                    "display_name": author["display_name"],
                    "avatar_url": avatar_or_default(author.get("avatar_url")),
                    "is_verified": author.get("is_verified", False),
                    "remembering": author.get("remembering", False),
                    "equipped_frame": author.get("equipped_frame"), "custom_frame": author.get("custom_frame"),
                    "frame_enabled": author.get("frame_enabled", True),
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
        # One-level threading: replies attach to the top-level comment.
        parent_id = None
        parent_author_id = None
        if body.parent_id:
            parent = await db.video_comments.find_one({"id": body.parent_id, "video_id": video_id})
            if not parent:
                raise HTTPException(404, "Parent comment not found")
            parent_id = parent.get("parent_id") or parent["id"]
            parent_author_id = parent.get("user_id")
        comment_id = str(uuid.uuid4())
        await db.video_comments.insert_one({
            "id": comment_id,
            "video_id": video_id,
            "parent_id": parent_id,
            "user_id": current["id"],
            "text": body.text.strip(),
            "created_at": now(),
        })
        await db.videos.update_one({"id": video_id}, {"$inc": {"comments_count": 1}})
        # Notify the person replied to + the video owner (dedup, skip self).
        notified = set()
        for target, label in [(parent_author_id, "replied"), (v.get("author_id"), "commented on your video")]:
            if not target or target == current["id"] or target in notified:
                continue
            notified.add(target)
            try:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": target,
                    "type": "comment",
                    "actor_id": current["id"],
                    "actor_name": current["display_name"],
                    "actor_avatar": avatar_or_default(current.get("avatar_url")),
                    "text": f"{label}: {body.text.strip()[:60]}",
                    "video_id": video_id,
                    "read": False,
                    "created_at": now(),
                })
                await ctx.send_web_push(target, "New comment", f"{current['display_name']}: {body.text.strip()[:80]}", f"/videos/{video_id}")
            except Exception as e:
                ctx.logger.warning(f"video comment notify failed: {e}")
        author = await db.users.find_one({"id": current["id"]}, {"_id": 0})
        return {
            "id": comment_id,
            "text": body.text.strip(),
            "parent_id": parent_id,
            "created_at": now().isoformat(),
            "author": {
                "id": author["id"],
                "username": author["username"],
                "display_name": author["display_name"],
                "avatar_url": avatar_or_default(author.get("avatar_url")),
                "is_verified": author.get("is_verified", False),
                "verified_color": author.get("verified_color"),
                "is_live": author.get("is_live", False),
                "remembering": author.get("remembering", False),
                "equipped_frame": author.get("equipped_frame"), "custom_frame": author.get("custom_frame"),
                "frame_enabled": author.get("frame_enabled", True),
            } if author else None,
        }

    @router.delete("/api/videos/{video_id}/comments/{comment_id}")
    async def delete_video_comment(
        video_id: str,
        comment_id: str,
        current: Annotated[dict, Depends(get_current_user)],
    ):
        c = await db.video_comments.find_one({"id": comment_id, "video_id": video_id})
        if not c:
            raise HTTPException(404, "Comment not found")
        if c.get("user_id") != current["id"]:
            raise HTTPException(403, "You can only delete your own comments")
        reply_count = await db.video_comments.count_documents({"video_id": video_id, "parent_id": comment_id})
        await db.video_comments.delete_many({"video_id": video_id, "$or": [{"id": comment_id}, {"parent_id": comment_id}]})
        removed = 1 + reply_count
        await db.videos.update_one({"id": video_id, "comments_count": {"$gte": removed}}, {"$inc": {"comments_count": -removed}})
        return {"status": "deleted", "removed": removed}

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
