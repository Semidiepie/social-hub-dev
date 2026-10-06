"""Social account connections — import a user's OWN content via official APIs.

Phase 1: TikTok Login Kit (OAuth v2) + Display API. We NEVER download or re-host
media — only metadata (caption, cover image, official embed_link, create_time) is
stored, and the content plays through TikTok's official embed player.

Keys live in the settings store (per environment): TIKTOK_CLIENT_KEY,
TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI. When they're absent the connect flow
returns a friendly "not configured yet" message so nothing breaks in preview.

NOTE: intentionally avoids `from __future__ import annotations` (postponed
annotations break closure-local `Depends` in these routers).
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

import settings_store

TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_API = "https://open.tiktokapis.com"
TIKTOK_SCOPES = "user.info.basic,video.list"
VIDEO_FIELDS = "id,create_time,title,video_description,cover_image_url,embed_link,duration"


def _tiktok_configured() -> bool:
    return bool(settings_store.get("TIKTOK_CLIENT_KEY") and settings_store.get("TIKTOK_CLIENT_SECRET")
                and settings_store.get("TIKTOK_REDIRECT_URI"))


def _msg_page(title: str, body: str, redirect: Optional[str] = None) -> HTMLResponse:
    meta = f'<meta http-equiv="refresh" content="2;url={redirect}">' if redirect else ""
    return HTMLResponse(
        f"""<!doctype html><html><head><meta charset="utf-8">{meta}
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{{font-family:system-ui;background:#0b0b0f;color:#fff;display:flex;
        min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center}}
        .c{{max-width:420px;padding:24px}}a{{color:#ff5a3d}}</style></head>
        <body><div class="c"><h2>{title}</h2><p style="opacity:.8">{body}</p>
        {('<p><a href="'+redirect+'">Continue</a></p>') if redirect else ''}</div></body></html>""")


def build_router(ctx) -> APIRouter:
    db = ctx.db
    now = ctx.now
    logger = ctx.logger
    get_current_user = ctx.get_current_user
    get_optional_user = ctx.get_optional_user
    user_from_token = ctx.user_from_token

    router = APIRouter(tags=["social"])

    def pub_video(v: dict) -> dict:
        return {
            "id": v.get("video_id"),
            "platform": v.get("platform", "tiktok"),
            "caption": v.get("caption") or "",
            "cover_image_url": v.get("cover_image_url"),
            "embed_link": v.get("embed_link"),
            "create_time": v.get("create_time"),
            "duration": v.get("duration"),
        }

    async def tiktok_token_request(data: dict) -> dict:
        data = {**data, "client_key": settings_store.get("TIKTOK_CLIENT_KEY"),
                "client_secret": settings_store.get("TIKTOK_CLIENT_SECRET")}
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(TIKTOK_TOKEN_URL, data=data,
                             headers={"Content-Type": "application/x-www-form-urlencoded"})
        if r.status_code >= 400:
            logger.warning(f"tiktok token error {r.status_code}: {r.text[:200]}")
            raise HTTPException(502, "TikTok token exchange failed")
        return r.json()

    async def valid_access_token(user_id: str) -> str:
        conn = await db.social_connections.find_one({"user_id": user_id, "platform": "tiktok"})
        if not conn:
            raise HTTPException(404, "TikTok is not connected")
        if conn.get("access_expires_at") and conn["access_expires_at"] > now() + timedelta(minutes=15):
            return conn["access_token"]
        tok = await tiktok_token_request({"grant_type": "refresh_token", "refresh_token": conn["refresh_token"]})
        if not tok.get("access_token"):
            await db.social_connections.update_one({"_id": conn["_id"]}, {"$set": {"needs_reconnect": True}})
            raise HTTPException(401, "TikTok authorization expired; reconnect TikTok")
        upd = {
            "access_token": tok["access_token"],
            "access_expires_at": now() + timedelta(seconds=tok.get("expires_in", 86400)),
            "updated_at": now(), "needs_reconnect": False,
        }
        if tok.get("refresh_token"):
            upd["refresh_token"] = tok["refresh_token"]
            upd["refresh_expires_at"] = now() + timedelta(seconds=tok.get("refresh_expires_in", 31536000))
        await db.social_connections.update_one({"_id": conn["_id"]}, {"$set": upd})
        return tok["access_token"]

    async def import_tiktok_videos(user_id: str) -> int:
        token = await valid_access_token(user_id)
        imported = 0
        cursor = None
        for _ in range(10):  # up to ~200 videos per import run
            payload = {"max_count": 20}
            if cursor is not None:
                payload["cursor"] = cursor
            async with httpx.AsyncClient(timeout=25) as c:
                r = await c.post(f"{TIKTOK_API}/v2/video/list/", params={"fields": VIDEO_FIELDS},
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                                 json=payload)
            if r.status_code >= 400:
                logger.warning(f"tiktok video list error {r.status_code}: {r.text[:200]}")
                raise HTTPException(502, "Couldn't fetch your TikTok videos")
            data = r.json().get("data", {})
            for v in data.get("videos", []):
                doc = {
                    "user_id": user_id, "platform": "tiktok", "video_id": v.get("id"),
                    "caption": v.get("title") or v.get("video_description") or "",
                    "cover_image_url": v.get("cover_image_url"),
                    "embed_link": v.get("embed_link"),
                    "create_time": v.get("create_time"),
                    "duration": v.get("duration"),
                    "refreshed_at": now(),
                }
                await db.social_videos.update_one(
                    {"user_id": user_id, "platform": "tiktok", "video_id": doc["video_id"]},
                    {"$set": doc}, upsert=True)
                imported += 1
            cursor = data.get("cursor")
            if not data.get("has_more"):
                break
        return imported

    # ---------- status / listing ----------

    @router.get("/api/social/connections")
    async def my_connections(current: Annotated[dict, Depends(get_current_user)]):
        rows = await db.social_connections.find({"user_id": current["id"]}, {"_id": 0}).to_list(20)
        out = []
        for c in rows:
            cnt = await db.social_videos.count_documents({"user_id": current["id"], "platform": c["platform"]})
            out.append({"platform": c["platform"], "username": c.get("tiktok_username"),
                        "needs_reconnect": bool(c.get("needs_reconnect")), "video_count": cnt,
                        "connected_at": c["created_at"].isoformat() if isinstance(c.get("created_at"), datetime) else c.get("created_at")})
        return {"connections": out, "tiktok_configured": _tiktok_configured()}

    @router.get("/api/social/videos/{user_id}")
    async def user_social_videos(user_id: str, _: Annotated[Optional[dict], Depends(get_optional_user)],
                                 platform: str = "tiktok"):
        rows = await db.social_videos.find(
            {"user_id": user_id, "platform": platform}, {"_id": 0}).sort("create_time", -1).to_list(500)
        return [pub_video(v) for v in rows]

    # ---------- TikTok OAuth ----------

    @router.get("/api/social/tiktok/login")
    async def tiktok_login(token: str):
        # Top-level browser redirect can't send an auth header, so the web client
        # passes the JWT as a query param (same pattern as the live WebSocket).
        user = await user_from_token(token)
        if not user:
            return _msg_page("Please sign in", "Your session expired. Sign in and try connecting again.")
        if not _tiktok_configured():
            return _msg_page("TikTok isn't set up yet",
                             "TikTok import is turned on once the TikTok developer app is approved and its keys are added in Admin → Keys.",
                             redirect="/settings")
        state = secrets.token_urlsafe(24)
        await db.oauth_states.insert_one({"state": state, "user_id": user["id"], "platform": "tiktok",
                                          "expires_at": now() + timedelta(minutes=10)})
        params = {"client_key": settings_store.get("TIKTOK_CLIENT_KEY"), "scope": TIKTOK_SCOPES,
                  "response_type": "code", "redirect_uri": settings_store.get("TIKTOK_REDIRECT_URI"),
                  "state": state}
        return RedirectResponse(TIKTOK_AUTH_URL + "?" + urlencode(params))

    @router.get("/api/social/tiktok/callback")
    async def tiktok_callback(code: Optional[str] = None, state: Optional[str] = None,
                              error: Optional[str] = None, error_description: Optional[str] = None):
        if error:
            return _msg_page("TikTok connection cancelled", error_description or error, redirect="/settings")
        if not code or not state:
            return _msg_page("Something went wrong", "Missing authorization response from TikTok.", redirect="/settings")
        s = await db.oauth_states.find_one_and_delete({"state": state, "platform": "tiktok",
                                                       "expires_at": {"$gt": now()}})
        if not s:
            return _msg_page("Link expired", "That connection link expired. Please try connecting again.", redirect="/settings")
        try:
            tok = await tiktok_token_request({
                "code": code, "grant_type": "authorization_code",
                "redirect_uri": settings_store.get("TIKTOK_REDIRECT_URI")})
        except HTTPException:
            return _msg_page("TikTok connection failed", "Couldn't complete the TikTok sign-in. Please try again.", redirect="/settings")
        if not tok.get("access_token") or not tok.get("refresh_token"):
            return _msg_page("TikTok connection failed", "TikTok didn't return a usable token.", redirect="/settings")
        conn = {
            "id": str(uuid.uuid4()), "user_id": s["user_id"], "platform": "tiktok",
            "open_id": tok.get("open_id"), "access_token": tok["access_token"],
            "refresh_token": tok["refresh_token"],
            "access_expires_at": now() + timedelta(seconds=tok.get("expires_in", 86400)),
            "refresh_expires_at": now() + timedelta(seconds=tok.get("refresh_expires_in", 31536000)),
            "scope": tok.get("scope", ""), "needs_reconnect": False,
            "created_at": now(), "updated_at": now(),
        }
        await db.social_connections.update_one(
            {"user_id": s["user_id"], "platform": "tiktok"}, {"$set": conn}, upsert=True)
        try:
            await import_tiktok_videos(s["user_id"])
        except Exception as e:
            logger.warning(f"initial tiktok import failed (non-blocking): {e}")
        return _msg_page("TikTok connected 🎉", "Your TikTok videos are being imported to your profile.",
                         redirect="/settings?tiktok=connected")

    @router.post("/api/social/tiktok/import")
    async def tiktok_import(current: Annotated[dict, Depends(get_current_user)]):
        count = await import_tiktok_videos(current["id"])
        return {"imported": count}

    @router.delete("/api/social/tiktok")
    async def tiktok_disconnect(current: Annotated[dict, Depends(get_current_user)]):
        await db.social_connections.delete_many({"user_id": current["id"], "platform": "tiktok"})
        await db.social_videos.delete_many({"user_id": current["id"], "platform": "tiktok"})
        return {"disconnected": True}

    return router
