"""PostMePlex API — JWT auth, social posts, reels, push notifications."""

from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal, Optional

import bcrypt
import httpx
import jwt
import secrets
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

import wallet_core

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# --- Config ---
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "postmeplex-dev-secret-change-in-prod")
JWT_ALG = "HS256"
JWT_TTL_MIN = 60 * 24 * 30  # 30 days

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Web Push (browser) — self-hosted VAPID. Independent of the Expo mobile push above.
import base64 as _base64  # noqa: E402
import json as _json  # noqa: E402
import asyncio as _asyncio  # noqa: E402

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY_B64 = os.environ.get("VAPID_PRIVATE_KEY_B64", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:support@postmeplex.com")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "PostMePlex <onboarding@resend.dev>")

RESET_LINK_TTL_MIN = 60
# Public origin of the WEB app, used to build password-reset links in emails.
# Preview: the preview URL. Production: set APP_PUBLIC_URL=https://postmeplex.com
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")

# Default profile picture (PostMePlex lightning logo) shown for any account
# without a custom avatar. Applied on READ so all existing + new users — and
# anyone who clears their avatar — automatically get it everywhere.
DEFAULT_AVATAR_URL = os.environ.get(
    "DEFAULT_AVATAR_URL",
    "https://res.cloudinary.com/dpnrol54k/image/upload/v1790110483/postmeplex_default_avatar.png",
)


def avatar_or_default(url: Optional[str]) -> str:
    return url or DEFAULT_AVATAR_URL

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

import settings_store  # noqa: E402
settings_store.init(db)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("postmeplex")

push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

resend_client = httpx.AsyncClient(
    base_url="https://api.resend.com",
    headers={
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    },
    timeout=15.0,
)

app = FastAPI(title="PostMePlex API")
api = app  # alias

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ============================================================
# Models
# ============================================================
class UserPublic(BaseModel):
    id: str
    username: str
    display_name: str
    email: EmailStr
    bio: str = ""
    avatar_url: str = ""
    is_verified: bool = False
    verified_color: Optional[str] = None
    is_live: bool = False
    live_stream_id: Optional[str] = None
    is_streamer: bool = False
    is_super_admin: bool = False
    is_official: bool = False
    remembering: bool = False
    remembering_status: Optional[str] = None
    followers: int = 0
    following: int = 0
    posts_count: int = 0
    invites_count: int = 0
    equipped_frame: Optional[str] = None
    active_theme: Optional[str] = None
    frame_enabled: bool = True
    theme_enabled: bool = True
    tokens: int = 0
    owned_frames: list[str] = Field(default_factory=list)
    custom_frame: Optional[dict] = None
    custom_theme: Optional[dict] = None


class RegisterBody(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=6)
    display_name: str = Field(min_length=1, max_length=40)
    pin: str = Field(pattern=r"^\d{4}$")
    ref: Optional[str] = None  # username of the inviter (referral link)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class LoginPinBody(BaseModel):
    identifier: str  # email or username
    pin: str = Field(pattern=r"^\d{4}$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class UpdateProfileBody(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    username: Optional[str] = Field(default=None, min_length=3, max_length=20)


class CreatePostBody(BaseModel):
    caption: str = ""
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    game_tag: Optional[str] = None


class CreateReelBody(BaseModel):
    caption: str = ""
    video_url: str
    thumbnail_url: Optional[str] = None
    game_tag: Optional[str] = None
    duration: Optional[float] = None  # seconds


class UpdatePostBody(BaseModel):
    caption: Optional[str] = None
    game_tag: Optional[str] = None


class CreateStoryBody(BaseModel):
    media_url: str
    media_type: Literal["image", "video"] = "image"
    caption: Optional[str] = None
    duration: Optional[float] = None  # seconds for videos


class CommentBody(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    parent_id: Optional[str] = None


class PushRegisterBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


class WebPushSubscribeBody(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2048)
    expirationTime: Optional[float] = None
    keys: dict


class WebPushUnsubscribeBody(BaseModel):
    endpoint: str = Field(min_length=20, max_length=2048)


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=6)


class AdminSetPinBody(BaseModel):
    """Admin sets/updates/clears a user's 4-digit reset PIN. pin=null clears it."""
    pin: Optional[str] = Field(default=None, pattern=r"^\d{4}$")


class ResetWithPinBody(BaseModel):
    """Reset a forgotten password using email + an admin-assigned 4-digit PIN."""
    email: EmailStr
    pin: str = Field(pattern=r"^\d{4}$")
    new_password: str = Field(min_length=6)


class ChangePasswordBody(BaseModel):
    """Change password while logged in. Requires the current password."""
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


class ReportBody(BaseModel):
    target_type: Literal["user", "post", "reel", "comment", "message"]
    target_id: str
    reason: str = Field(min_length=1, max_length=400)


# ============================================================
# Helpers
# ============================================================
def now() -> datetime:
    return datetime.now(timezone.utc)


def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pw(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def hash_reset_token(raw: str) -> str:
    """SHA-256 of a reset token — we store only the hash, never the raw token."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def resolve_app_base_url(request: Request) -> str:
    """Where the web app lives, used to build password-reset links.
    Prefer APP_PUBLIC_URL (set this in production for mobile-originated resets);
    otherwise fall back to the Origin/Referer of the calling web app so the
    link works automatically on both preview and production without config."""
    if APP_PUBLIC_URL:
        return APP_PUBLIC_URL
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    referer = request.headers.get("referer")
    if referer:
        # Strip path — keep scheme://host[:port]
        from urllib.parse import urlparse
        p = urlparse(referer)
        if p.scheme and p.netloc:
            return f"{p.scheme}://{p.netloc}"
    # Last resort: the request's own base (backend == web origin in this app).
    return str(request.base_url).rstrip("/")


# ---- Admin-assigned reset PIN helpers -------------------------------------
# 4-digit PINs are low entropy (10k combos), so we bcrypt-hash them with a
# server-side pepper (never stored in Mongo) and rate-limit verification.
PIN_PEPPER = os.environ.get("PIN_PEPPER", "postmeplex-pin-pepper-v1")
MAX_PIN_ATTEMPTS = 5
PIN_LOCKOUT_MINUTES = 15
ADMIN_DEFAULT_PIN = "7455"


def _norm_pin(pin: str) -> str:
    return (pin or "").strip().zfill(4)


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw((_norm_pin(pin) + PIN_PEPPER).encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pin_hash(pin: str, hashed_pin: str) -> bool:
    try:
        return bcrypt.checkpw((_norm_pin(pin) + PIN_PEPPER).encode("utf-8"), hashed_pin.encode("utf-8"))
    except Exception:
        return False


# Constant dummy hash — verified when the account/PIN doesn't exist so timing
# stays similar whether or not the target is valid.
_DUMMY_PIN_HASH = hash_pin("0000")


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now() + timedelta(minutes=JWT_TTL_MIN),
        "iat": now(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def user_to_public(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        username=u["username"],
        display_name=u["display_name"],
        email=u["email"],
        bio=u.get("bio", ""),
        avatar_url=avatar_or_default(u.get("avatar_url")),
        is_verified=u.get("is_verified", False),
        verified_color=u.get("verified_color"),
        is_live=u.get("is_live", False),
        live_stream_id=u.get("live_stream_id"),
        is_streamer=u.get("is_streamer", False),
        is_super_admin=u.get("is_super_admin", False),
        is_official=u.get("is_official", False),
        remembering=u.get("remembering", False),
        remembering_status=u.get("remembering_status"),
        followers=u.get("followers", 0),
        following=u.get("following", 0),
        posts_count=u.get("posts_count", 0),
        invites_count=u.get("invites_count", 0),
        equipped_frame=u.get("equipped_frame"),
        active_theme=u.get("active_theme"),
        frame_enabled=u.get("frame_enabled", True),
        theme_enabled=u.get("theme_enabled", True),
        tokens=int(u.get("tokens", 0) or 0),
        owned_frames=u.get("owned_frames") or [],
        custom_frame=u.get("custom_frame"),
        custom_theme=u.get("custom_theme"),
    )


async def get_current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("banned"):
        raise HTTPException(status_code=403, detail="Your account has been banned from PostMePlex.")
    return user


async def get_optional_user(token: Annotated[Optional[str], Depends(oauth2_scheme)]) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        return None
    return await db.users.find_one({"id": user_id}, {"_id": 0})


async def user_from_token(token: Optional[str]) -> Optional[dict]:
    """Resolve a user from a raw JWT string (used by WebSocket auth where the
    token arrives as a query param, not an Authorization header)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        return None
    return await db.users.find_one({"id": user_id}, {"_id": 0})


async def send_push(recipients: list[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    # Short-circuit when no real key is configured (dev/preview) to avoid noisy 401s.
    if not PUSH_KEY or PUSH_KEY == "placeholder":
        logger.info(f"[push] skipping trigger — EMERGENT_PUSH_KEY not set (recipients={len(recipients)})")
        return
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    try:
        resp = await push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code >= 400:
            logger.warning(
                f"[push] trigger FAILED status={resp.status_code} "
                f"recipients={recipients} title={data.get('title')!r} body={resp.text[:300]}"
            )
        else:
            logger.info(
                f"[push] trigger OK status={resp.status_code} recipients={len(recipients)} "
                f"title={data.get('title')!r}"
            )
    except Exception as e:
        logger.warning(f"[push] trigger exception (non-blocking): {e}")


def _vapid_pem_path() -> str:
    """Write the current VAPID private key (from settings) to a PEM file keyed
    by its content hash, and return the path. Picks up live key updates."""
    b64 = settings_store.get("VAPID_PRIVATE_KEY_B64", "")
    if not b64:
        return ""
    try:
        pem = _base64.b64decode(b64).decode()
    except Exception:
        return ""
    path = f"/tmp/pmp_vapid_{hashlib.md5(b64.encode()).hexdigest()[:10]}.pem"
    if not os.path.exists(path):
        try:
            with open(path, "w") as _f:
                _f.write(pem)
        except Exception:
            return ""
    return path


def _web_push_send_sync(sub: dict, payload: str) -> Optional[int]:
    """Blocking pywebpush call. Returns an HTTP status code on WebPushException, else None."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=payload,
            vapid_private_key=_vapid_pem_path(),
            vapid_claims={"sub": settings_store.get("VAPID_SUBJECT", "mailto:support@postmeplex.com")},
            ttl=60 * 60,
            timeout=10,
        )
        return None
    except WebPushException as exc:
        return getattr(getattr(exc, "response", None), "status_code", None) or 0


async def send_web_push(user_id: str, title: str, body: str, url: str = "/notifications") -> None:
    """Send a browser Web Push to every subscription the user registered. No-op when
    VAPID isn't configured. Prunes dead subscriptions (404/410). Never raises."""
    if not (_vapid_pem_path() and settings_store.get("VAPID_PUBLIC_KEY")):
        return
    try:
        subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    except Exception as e:
        logger.warning(f"[webpush] subscription lookup failed: {e}")
        return
    if not subs:
        return
    payload = _json.dumps({"title": title, "body": body, "url": url})
    for sub in subs:
        try:
            status_code = await _asyncio.to_thread(_web_push_send_sync, sub, payload)
            if status_code in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
        except Exception as e:
            logger.warning(f"[webpush] send failed (non-blocking): {e}")


async def send_reset_email(email: str, display_name: str, link: str) -> tuple[bool, Optional[str]]:
    """Send a password-reset LINK email via Resend.
    Returns (sent, reason). `sent=True` means the email was accepted for delivery.
    When `sent=False`, `reason` is a short human-readable string so the caller
    can decide whether to surface the dev link as a fallback.
    """
    if not RESEND_API_KEY or RESEND_API_KEY.startswith("placeholder"):
        logger.warning(f"[reset] RESEND_API_KEY not set — dev link for {email}: {link}")
        return False, "no_key"
    html = f"""\
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#12141c;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#12141c;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#1A1D27;border:1px solid #2A2D3A;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 16px 32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#FF6B3D;width:40px;height:40px;border-radius:10px;text-align:center;vertical-align:middle;font-size:20px;color:#12141c;font-weight:900;">🎮</td>
            <td style="padding-left:12px;font-size:20px;font-weight:900;color:#FFFFFF;letter-spacing:-0.5px;">PostMePlex</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 32px;">
          <h1 style="margin:0;font-size:28px;font-weight:900;letter-spacing:-0.5px;color:#FFFFFF;">Reset your password</h1>
          <p style="margin:16px 0 0;color:#A0A5B5;font-size:15px;line-height:22px;">
            Hey {display_name or 'there'} 👋 — tap the button below to set a new PostMePlex password. This link expires in {RESET_LINK_TTL_MIN} minutes and can only be used once.
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px;" align="center">
          <a href="{link}" style="display:inline-block;background:#FF6B3D;color:#12141c;font-weight:900;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:12px;">Reset my password</a>
        </td></tr>
        <tr><td style="padding:0 32px 8px;color:#6B7080;font-size:12px;line-height:18px;">
          Or paste this link into your browser:<br>
          <a href="{link}" style="color:#FF6B3D;word-break:break-all;">{link}</a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;color:#6B7080;font-size:12px;line-height:18px;">
          Didn't request this? You can safely ignore this email — your password stays the same.
        </td></tr>
      </table>
      <div style="color:#6B7080;font-size:11px;margin-top:16px;">© PostMePlex · The home for gamers, streamers & every clutch moment.</div>
    </td></tr>
  </table>
</body></html>"""
    try:
        resp = await resend_client.post(
            "/emails",
            json={
                "from": RESEND_FROM,
                "to": [email],
                "subject": "Reset your PostMePlex password",
                "html": html,
            },
        )
        if resp.status_code >= 400:
            body = resp.text[:500]
            if resp.status_code == 403 and "verify a domain" in body:
                logger.warning(
                    "[resend] SANDBOX MODE: cannot deliver to %s — verify a domain in the "
                    "Resend dashboard to enable production email delivery. Falling back to "
                    "in-app link.", email,
                )
                return False, "sandbox_mode"
            if resp.status_code == 403:
                logger.warning(f"[resend] 403 forbidden: {body[:300]}")
                return False, "forbidden"
            logger.warning(f"[resend] send failed {resp.status_code}: {body[:300]}")
            return False, f"http_{resp.status_code}"
        return True, None
    except Exception as e:
        logger.warning(f"[resend] exception: {e}")
        return False, "exception"


def _cloudinary_compat_url(url: Optional[str]) -> Optional[str]:
    """Rewrite Cloudinary video URLs to force H.264/mp4 output so ALL iOS &
    Android devices (including older ones and Expo Go) can decode them.
    Some clips were uploaded in HEVC (`codecs=hvc1`) which certain devices —
    notably the iOS simulator and older iPhones — refuse to play, resulting
    in a blank/frozen reel. This transformation is a no-op on non-Cloudinary
    URLs and idempotent on URLs that already contain the transformation."""
    if not url or "res.cloudinary.com" not in url or "/video/upload/" not in url:
        return url
    if "f_mp4" in url or "vc_h264" in url:
        return url
    # Insert the transformation segment right after `/video/upload/`.
    return url.replace("/video/upload/", "/video/upload/f_mp4,vc_h264,q_auto/", 1)


async def serialize_post(post: dict, viewer_id: Optional[str] = None) -> dict:
    author = await db.users.find_one({"id": post["author_id"]}, {"_id": 0})
    liked_by_me = False
    if viewer_id:
        liked_by_me = await db.likes.find_one({"post_id": post["id"], "user_id": viewer_id}) is not None
    return {
        "id": post["id"],
        "type": post.get("type", "post"),
        "caption": post.get("caption", ""),
        "image_url": post.get("image_url"),
        "video_url": _cloudinary_compat_url(post.get("video_url")),
        "thumbnail_url": post.get("thumbnail_url"),
        "game_tag": post.get("game_tag"),
        "duration": post.get("duration"),
        "likes": post.get("likes", 0),
        "comments_count": post.get("comments_count", 0),
        "views": post.get("views", 0),
        "featured": bool(post.get("featured", False)),
        "created_at": post["created_at"].isoformat() if isinstance(post["created_at"], datetime) else post["created_at"],
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
            "equipped_frame": author.get("equipped_frame"),
            "frame_enabled": author.get("frame_enabled", True),
        } if author else None,
    }


# ============================================================
# Routes — Auth
# ============================================================
@app.post("/api/auth/register", response_model=TokenResponse)
async def register(body: RegisterBody):
    body.username = body.username.lower().strip()
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email already registered")
    if await db.users.find_one({"username": body.username}):
        raise HTTPException(400, "Username already taken")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": body.email.lower(),
        "username": body.username,
        "display_name": body.display_name,
        "password_hash": hash_pw(body.password),
        "reset_pin_hash": hash_pin(body.pin),
        "reset_pin_set_at": now(),
        "reset_pin_failed_attempts": 0,
        "reset_pin_locked_until": None,
        "bio": "",
        "avatar_url": "",
        "is_verified": False,
        "is_streamer": False,
        "is_admin": False,
        "followers": 0,
        "following": 0,
        "posts_count": 0,
        "tokens": wallet_core.WELCOME_TOKENS,
        "owned_frames": [],
        "created_at": now(),
    }
    await db.users.insert_one(doc)
    await _follow_official(user_id)
    # Referral growth loop: if they joined via someone's invite link, the new
    # member follows the inviter so sharing directly grows real followers.
    if body.ref:
        inviter = await db.users.find_one({"username": body.ref.lower().strip()})
        if inviter and inviter["id"] != user_id:
            await db.follows.insert_one({
                "id": str(uuid.uuid4()),
                "follower_id": user_id,
                "followee_id": inviter["id"],
                "created_at": now(),
            })
            await db.users.update_one({"id": inviter["id"]}, {"$inc": {"followers": 1}})
            await db.users.update_one({"id": user_id}, {"$inc": {"following": 1}})
            await db.users.update_one({"id": inviter["id"]}, {"$inc": {"invites_count": 1}})
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": inviter["id"],
                "type": "follow",
                "actor_id": user_id,
                "actor_name": body.display_name,
                "actor_avatar": avatar_or_default(doc.get("avatar_url")),
                "text": "joined from your invite and followed you",
                "read": False,
                "created_at": now(),
            })
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    try:
        await send_push(
            recipients=[user_id],
            data={
                "title": f"Welcome to PostMePlex, {body.display_name}!",
                "message": "Tap to discover gamers, streamers & epic clips.",
                "action_url": "/(tabs)/home",
            },
        )
    except Exception as e:
        logger.warning(f"Welcome push failed (non-blocking): {e}")
    return TokenResponse(access_token=make_token(user_id), user=user_to_public(doc))


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(400, "Incorrect email or password")
    if user.get("banned"):
        raise HTTPException(403, "This account has been banned from PostMePlex.")
    return TokenResponse(access_token=make_token(user["id"]), user=user_to_public(user))


@app.post("/api/auth/login-pin", response_model=TokenResponse)
async def login_pin(body: LoginPinBody):
    """Sign in with a 4-digit PIN (chosen at signup, or reassigned by an admin).
    `identifier` is the account email or username the client remembers locally.
    Rate-limited: 5 wrong PINs → 15-min lockout. Generic errors avoid enumeration."""
    ident = body.identifier.lower().strip()
    user = await db.users.find_one({"$or": [{"email": ident}, {"username": ident}]})
    if not user:
        verify_pin_hash(body.pin, _DUMMY_PIN_HASH)
        raise HTTPException(status_code=403, detail="Invalid account or PIN.")

    locked_until = user.get("reset_pin_locked_until")
    if locked_until and locked_until.replace(tzinfo=timezone.utc) > now():
        retry = int((locked_until.replace(tzinfo=timezone.utc) - now()).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {retry // 60 + 1} min.",
            headers={"Retry-After": str(retry)},
        )

    stored = user.get("reset_pin_hash")
    if not stored:
        verify_pin_hash(body.pin, _DUMMY_PIN_HASH)
        raise HTTPException(status_code=403, detail="No PIN is set for this account. Ask an admin to set one.")

    if not verify_pin_hash(body.pin, stored):
        attempts = int(user.get("reset_pin_failed_attempts") or 0) + 1
        upd: dict = {"reset_pin_failed_attempts": attempts}
        if attempts >= MAX_PIN_ATTEMPTS:
            upd["reset_pin_locked_until"] = now() + timedelta(minutes=PIN_LOCKOUT_MINUTES)
            upd["reset_pin_failed_attempts"] = 0
            logger.warning(f"[login-pin] LOCKED user={user['id']} after {MAX_PIN_ATTEMPTS} failed attempts")
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        raise HTTPException(status_code=403, detail="Invalid account or PIN.")

    if user.get("reset_pin_failed_attempts") or user.get("reset_pin_locked_until"):
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"reset_pin_failed_attempts": 0, "reset_pin_locked_until": None}},
        )
    if user.get("banned"):
        raise HTTPException(403, "This account has been banned from PostMePlex.")
    return TokenResponse(access_token=make_token(user["id"]), user=user_to_public(user))


@app.get("/api/auth/me", response_model=UserPublic)
async def me(current: Annotated[dict, Depends(get_current_user)]):
    return user_to_public(current)


_FRAME_IDS = {"gold", "neon", "fire", "frost", "hearts", "emerald", "violet", "ocean", "rainbow", "aurora", "sunset", "molten", "galaxy"}
_THEME_IDS = {"fall", "winter", "halloween", "christmas", "valentine", "spring", "summer", "newyear", "stpatrick"}


class CosmeticsBody(BaseModel):
    equipped_frame: Optional[str] = None  # "" to unequip, None = no change
    active_theme: Optional[str] = None    # "" to clear, None = no change
    frame_enabled: Optional[bool] = None
    theme_enabled: Optional[bool] = None


@app.post("/api/market/cosmetics", response_model=UserPublic)
async def update_cosmetics(body: CosmeticsBody, current: Annotated[dict, Depends(get_current_user)]):
    updates: dict = {}
    if body.equipped_frame is not None:
        val = body.equipped_frame or None
        if val and val != "custom" and val not in _FRAME_IDS:
            raise HTTPException(400, "Unknown frame")
        if val == "custom" and not current.get("custom_frame"):
            raise HTTPException(400, "Design a custom frame in the Sage studio first")
        if val and val != "custom" and val in wallet_core.PREMIUM_FRAME_IDS:
            owned = (await db.users.find_one({"id": current["id"]}, {"_id": 0, "owned_frames": 1}) or {}).get("owned_frames") or []
            if val not in owned:
                raise HTTPException(403, "Buy this frame in the Store first")
        updates["equipped_frame"] = val
    if body.active_theme is not None:
        val = body.active_theme or None
        if val and val != "custom" and val not in _THEME_IDS:
            raise HTTPException(400, "Unknown theme")
        if val == "custom" and not current.get("custom_theme"):
            raise HTTPException(400, "Design a custom theme in the Sage studio first")
        updates["active_theme"] = val
    if body.frame_enabled is not None:
        updates["frame_enabled"] = body.frame_enabled
    if body.theme_enabled is not None:
        updates["theme_enabled"] = body.theme_enabled
    if updates:
        await db.users.update_one({"id": current["id"]}, {"$set": updates})
    u = await db.users.find_one({"id": current["id"]})
    return user_to_public(u)


COSMETIC_COST = 50
_COSMETIC_SYSTEM = (
    "You are Sage, a friendly cosmetic designer for the PostMePlex social app. You help a user design a custom "
    "profile {KIND} by chatting. Respond with ONLY one compact JSON object each turn — no prose, no markdown.\n"
    "Ask ONE short question at a time (colors, vibe, mood), proposing a smart default. Ask AT MOST 3 questions, "
    "then switch to ready. If the user attached a reference image, draw the palette/mood from it.\n"
    "While gathering info: {\"mode\":\"ask\",\"message\":\"<one question with a suggested default>\",\"summary\":\"<short running summary>\"}\n"
    "When ready: {\"mode\":\"ready\",\"summary\":\"<friendly recap>\",\"spec\":{...}}\n"
    "For a FRAME the spec is: {\"type\":\"frame\",\"name\":string(<=24),\"c1\":\"#RRGGBB\",\"c2\":\"#RRGGBB\",\"c3\":\"#RRGGBB\","
    "\"speed\":number 1.5-6 (seconds per full spin, lower=faster),\"glow\":boolean}. Pick 3 harmonious colors for a glossy animated ring.\n"
    "For a THEME the spec is: {\"type\":\"theme\",\"name\":string(<=24),\"primary\":\"H S% L%\" (a CSS HSL triplet e.g. \\\"265 85% 60%\\\"),"
    "\"emoji\":\"<ONE emoji that gently falls across the screen>\",\"blurb\":string(<=60)}. The emoji is the falling animation."
)


async def _cosmetic_turn(kind: str, transcript: list, image_b64: Optional[str]) -> dict:
    key = settings_store.get("EMERGENT_LLM_KEY")
    if not key:
        raise HTTPException(503, "Sage AI isn't configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    system = _COSMETIC_SYSTEM.replace("{KIND}", kind)
    convo = "\n".join(f"{'USER' if m['role'] == 'user' else 'SAGE'}: {m['content']}" for m in transcript)
    prompt = ("Conversation so far:\n" + convo +
              "\n\nRespond now with the next JSON object (mode 'ask' or 'ready'). Output ONLY JSON.")
    for _ in range(2):
        try:
            chat = LlmChat(api_key=key, session_id=f"sage-cosmetic-{uuid.uuid4()}", system_message=system).with_model("openai", "gpt-4.1-mini")
            if image_b64:
                msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=image_b64)])
            else:
                msg = UserMessage(text=prompt)
            resp = await chat.send_message(msg)
            data = _parse_cosmetic_json(resp)
            if isinstance(data, dict) and data.get("mode") in ("ask", "ready"):
                return data
        except Exception as e:
            logger.warning(f"[cosmetic] turn failed: {e}")
    return {"mode": "ask", "message": "Hmm, I lost my thread for a moment — tell me a bit more about the colors or vibe you want?", "summary": ""}


def _parse_cosmetic_json(text: str) -> dict:
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
    s, e = t.find("{"), t.rfind("}")
    if s == -1 or e == -1:
        raise ValueError("no json")
    return _json.loads(t[s:e + 1])


def _normalize_cosmetic(kind: str, raw: dict) -> dict:
    import re as _re
    hexre = _re.compile(r"^#[0-9a-fA-F]{6}$")
    if kind == "frame":
        def col(v, d):
            v = str(v or "").strip()
            return v if hexre.match(v) else d
        return {
            "type": "frame",
            "name": (str(raw.get("name") or "My Frame").strip()[:24]) or "My Frame",
            "c1": col(raw.get("c1"), "#FF6B3D"),
            "c2": col(raw.get("c2"), "#FFD166"),
            "c3": col(raw.get("c3"), "#FF006E"),
            "speed": max(1.5, min(6.0, float(raw.get("speed") or 3.0))),
            "glow": bool(raw.get("glow", True)),
        }
    primary = str(raw.get("primary") or "265 85% 60%").strip()
    if not _re.match(r"^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$", primary):
        primary = "265 85% 60%"
    emoji = str(raw.get("emoji") or "✨").strip()[:4] or "✨"
    return {
        "type": "theme",
        "name": (str(raw.get("name") or "My Theme").strip()[:24]) or "My Theme",
        "primary": primary,
        "emoji": emoji,
        "blurb": str(raw.get("blurb") or "").strip()[:60],
    }


class CosmeticStudioChatBody(BaseModel):
    session_id: Optional[str] = None
    kind: str = "frame"  # "frame" | "theme"
    message: str = Field(min_length=1, max_length=800)
    image_b64: Optional[str] = None


class CosmeticStudioCreateBody(BaseModel):
    session_id: str


@app.post("/api/market/cosmetic-studio/chat")
async def cosmetic_studio_chat(body: CosmeticStudioChatBody, current: Annotated[dict, Depends(get_current_user)]):
    """Conversational Sage studio where a user designs a custom frame or theme (optionally from a reference image)."""
    kind = body.kind if body.kind in ("frame", "theme") else "frame"
    if body.session_id:
        sess = await db.cosmetic_studio_sessions.find_one({"id": body.session_id, "user_id": current["id"]})
        if not sess:
            raise HTTPException(404, "Studio session not found")
        kind = sess.get("kind", kind)
    else:
        sess = {"id": str(uuid.uuid4()), "user_id": current["id"], "kind": kind, "transcript": [], "spec": None, "created_at": now()}
        await db.cosmetic_studio_sessions.insert_one({**sess})
    transcript = list(sess.get("transcript") or [])
    transcript.append({"role": "user", "content": body.message.strip()[:800]})
    data = await _cosmetic_turn(kind, transcript, body.image_b64)
    spec = None
    if data.get("mode") == "ready":
        spec = _normalize_cosmetic(kind, data.get("spec") or {})
    transcript.append({"role": "assistant", "content": (data.get("message") or data.get("summary") or "")[:800]})
    final_spec = spec if spec is not None else sess.get("spec")
    await db.cosmetic_studio_sessions.update_one(
        {"id": sess["id"]},
        {"$set": {"transcript": transcript, "spec": final_spec, "kind": kind, "updated_at": now()}},
    )
    return {
        "session_id": sess["id"],
        "kind": kind,
        "mode": data.get("mode"),
        "message": data.get("message") or "",
        "summary": data.get("summary") or "",
        "spec_ready": final_spec is not None,
        "spec": final_spec,
        "cost": COSMETIC_COST,
    }


@app.post("/api/market/cosmetic-studio/create", response_model=UserPublic)
async def cosmetic_studio_create(body: CosmeticStudioCreateBody, current: Annotated[dict, Depends(get_current_user)]):
    """Charge 50 tokens, save the Sage-designed cosmetic to the user and auto-equip it."""
    sess = await db.cosmetic_studio_sessions.find_one({"id": body.session_id, "user_id": current["id"]})
    if not sess:
        raise HTTPException(404, "Studio session not found")
    spec = sess.get("spec")
    if not spec:
        raise HTTPException(400, "Keep chatting with Sage until the design is ready.")
    bal = await wallet_core.spend(db, now, current["id"], COSMETIC_COST, "purchase",
                                  f"Sage {spec['type']}: {spec.get('name', '')}")
    if bal is None:
        raise HTTPException(402, f"You need {COSMETIC_COST} tokens to create this")
    if spec["type"] == "frame":
        await db.users.update_one({"id": current["id"]}, {"$set": {"custom_frame": spec, "equipped_frame": "custom", "frame_enabled": True}})
    else:
        await db.users.update_one({"id": current["id"]}, {"$set": {"custom_theme": spec, "active_theme": "custom", "theme_enabled": True}})
    await db.cosmetic_studio_sessions.delete_one({"id": sess["id"]})
    u = await db.users.find_one({"id": current["id"]})
    return user_to_public(u)



@app.put("/api/auth/me", response_model=UserPublic)
async def update_me(body: UpdateProfileBody, current: Annotated[dict, Depends(get_current_user)]):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Username doubles as the public channel @handle — validate + enforce uniqueness.
    new_username = updates.pop("username", None)
    if new_username is not None:
        uname = new_username.lower().strip()
        if not (3 <= len(uname) <= 20) or not all(c.isalnum() or c == "_" for c in uname):
            raise HTTPException(400, "Handle must be 3–20 characters: letters, numbers or underscores.")
        if uname != current["username"]:
            clash = await db.users.find_one({"username": uname, "id": {"$ne": current["id"]}})
            if clash:
                raise HTTPException(400, "That handle is already taken.")
            updates["username"] = uname
    if updates:
        await db.users.update_one({"id": current["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    return user_to_public(fresh)


@app.delete("/api/auth/me")
async def delete_account(current: Annotated[dict, Depends(get_current_user)]):
    """Permanently delete the current user and all of their content.
    Required by Apple App Store guideline 5.1.1(v) and Google Play Data Safety."""
    uid = current["id"]
    # End any live session they own
    await db.live_sessions.update_many({"host_id": uid, "ended_at": None}, {"$set": {"ended_at": now()}})
    # Remove user's content + reactions
    await db.posts.delete_many({"author_id": uid})
    await db.comments.delete_many({"user_id": uid})
    await db.likes.delete_many({"user_id": uid})
    await db.follows.delete_many({"$or": [{"follower_id": uid}, {"followee_id": uid}]})
    await db.notifications.delete_many({"$or": [{"user_id": uid}, {"actor_id": uid}]})
    await db.messages.delete_many({"sender_id": uid})
    await db.conversations.update_many({"member_ids": uid}, {"$pull": {"member_ids": uid}})
    await db.password_reset_tokens.delete_many({"user_id": uid})
    await db.blocks.delete_many({"$or": [{"blocker_id": uid}, {"blocked_id": uid}]})
    await db.reports.delete_many({"reporter_id": uid})
    await db.users.delete_one({"id": uid})
    return {"status": "deleted"}


@app.post("/api/users/{user_id}/block")
async def block_user(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    if user_id == current["id"]:
        raise HTTPException(400, "Cannot block yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    existing = await db.blocks.find_one({"blocker_id": current["id"], "blocked_id": user_id})
    if not existing:
        await db.blocks.insert_one({
            "id": str(uuid.uuid4()),
            "blocker_id": current["id"],
            "blocked_id": user_id,
            "created_at": now(),
        })
        # Apple Guideline 1.2: notify the developer when a user blocks someone.
        # We do that by logging it and also creating a moderation_events row that
        # the founder/admin can review (and an internal email if Resend is set).
        await db.moderation_events.insert_one({
            "id": str(uuid.uuid4()),
            "type": "user_blocked",
            "blocker_id": current["id"],
            "blocker_username": current.get("username"),
            "blocked_id": user_id,
            "blocked_username": target.get("username"),
            "reviewed": False,
            "created_at": now(),
        })
        logger.info(
            f"[MOD] block: @{current.get('username')} → @{target.get('username')} "
            f"(blocker_id={current['id']} blocked_id={user_id})"
        )
        # Best-effort: notify the founder by email if Resend is configured.
        try:
            await _notify_dev_block(current, target)
        except Exception:
            pass
    # Side-effect: drop mutual follows
    await db.follows.delete_many({
        "$or": [
            {"follower_id": current["id"], "followee_id": user_id},
            {"follower_id": user_id, "followee_id": current["id"]},
        ]
    })
    return {"status": "blocked"}


async def _notify_dev_block(blocker: dict, blocked: dict) -> None:
    """Email the founder when a user is blocked. No-op if Resend isn't set."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key or api_key.startswith("placeholder"):
        return
    payload = {
        "from": os.environ.get("RESEND_FROM", "onboarding@resend.dev"),
        "to": ["postmeplex@post.com"],
        "subject": f"[PostMePlex] @{blocker.get('username')} blocked @{blocked.get('username')}",
        "text": (
            f"Block event\n\n"
            f"Blocker: @{blocker.get('username')} ({blocker.get('id')})\n"
            f"Blocked: @{blocked.get('username')} ({blocked.get('id')})\n"
            f"Time: {now().isoformat()}\n\n"
            f"Their content has been instantly removed from the blocker's feed, "
            f"reels, discover, and search. Review in the admin moderation queue."
        ),
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        await resend_client.post("https://api.resend.com/emails", headers=headers, json=payload)
    except Exception:
        # Swallow — Apple just needs us to attempt notification.
        pass


@app.delete("/api/users/{user_id}/block")
async def unblock_user(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    await db.blocks.delete_one({"blocker_id": current["id"], "blocked_id": user_id})
    return {"status": "unblocked"}


@app.get("/api/blocks")
async def list_blocks(current: Annotated[dict, Depends(get_current_user)]):
    rows = await db.blocks.find({"blocker_id": current["id"]}, {"_id": 0}).to_list(200)
    ids = [r["blocked_id"] for r in rows]
    users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(200)
    return [user_to_public(u).model_dump() for u in users]


@app.post("/api/report")
async def report_content(body: ReportBody, current: Annotated[dict, Depends(get_current_user)]):
    await db.reports.insert_one({
        "id": str(uuid.uuid4()),
        "reporter_id": current["id"],
        "target_type": body.target_type,
        "target_id": body.target_id,
        "reason": body.reason,
        "status": "open",
        "created_at": now(),
    })
    return {"status": "received"}


@app.post("/api/auth/forgot-password")
async def forgot_password(body: ForgotPasswordBody, request: Request):
    """Email a one-time password-reset LINK. Always returns 200 to avoid leaking
    whether an email exists in our DB. The link points to the web app's
    /reset-password page and carries a single-use, time-limited token.

    Base URL resolution (so no env config is required in production):
      1. APP_PUBLIC_URL env var, if set (most reliable, esp. for mobile).
      2. The Origin/Referer of the calling web app (works automatically on
         both preview and production for web-initiated resets).
    """
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    debug_link: Optional[str] = None
    email_status: str = "not_attempted"  # ok | sandbox_mode | no_key | forbidden | http_XXX | exception | not_attempted
    if user:
        # Invalidate previous unused tokens for this user.
        await db.password_reset_tokens.update_many(
            {"user_id": user["id"], "used": False},
            {"$set": {"used": True, "invalidated_at": now()}},
        )
        raw_token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "email": email,
            "token_hash": hash_reset_token(raw_token),
            "expires_at": now() + timedelta(minutes=RESET_LINK_TTL_MIN),
            "used": False,
            "created_at": now(),
        })
        base = resolve_app_base_url(request)
        link = f"{base}/reset-password?token={raw_token}"
        sent, reason = await send_reset_email(email, user.get("display_name", ""), link)
        email_status = "ok" if sent else (reason or "unknown")
        # Dev / sandbox fallback: surface the link when Resend isn't configured
        # OR is in sandbox mode so the flow stays testable before domain verify.
        if not sent:
            debug_link = link
    resp: dict = {"status": "ok", "email_status": email_status}
    if debug_link:
        resp["dev_link"] = debug_link
    return resp


@app.post("/api/auth/reset-password", response_model=TokenResponse)
async def reset_password(body: ResetPasswordBody):
    """Consume a reset-link token: validate (hash match + not used + not expired),
    set the new password, mark the token used, and return a fresh JWT so the
    user is signed in immediately."""
    rec = await db.password_reset_tokens.find_one({
        "token_hash": hash_reset_token(body.token),
        "used": False,
    })
    if not rec or rec["expires_at"].replace(tzinfo=timezone.utc) < now():
        raise HTTPException(400, "This reset link is invalid or has expired. Please request a new one.")
    user = await db.users.find_one({"id": rec["user_id"]})
    if not user:
        raise HTTPException(400, "Account not found")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await db.password_reset_tokens.update_one({"id": rec["id"]}, {"$set": {"used": True, "used_at": now()}})
    logger.info(f"[pw] password reset via link for user={user['id']}")
    return TokenResponse(access_token=make_token(user["id"]), user=user_to_public(user))


@app.post("/api/auth/reset-with-pin", response_model=TokenResponse)
async def reset_with_pin(body: ResetWithPinBody):
    """Reset a forgotten password using email + an admin-assigned 4-digit PIN.
    Offline (no email needed). Rate-limited: 5 wrong PINs → 15-min lockout.
    Uses generic errors + dummy verifies to avoid user enumeration/timing leaks."""
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        verify_pin_hash(body.pin, _DUMMY_PIN_HASH)  # constant-time-ish
        raise HTTPException(status_code=403, detail="Invalid email or PIN.")

    locked_until = user.get("reset_pin_locked_until")
    if locked_until and locked_until.replace(tzinfo=timezone.utc) > now():
        retry = int((locked_until.replace(tzinfo=timezone.utc) - now()).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {retry // 60 + 1} min.",
            headers={"Retry-After": str(retry)},
        )

    stored = user.get("reset_pin_hash")
    if not stored:
        verify_pin_hash(body.pin, _DUMMY_PIN_HASH)
        raise HTTPException(status_code=403, detail="No reset PIN is set for this account. Ask an admin to set one.")

    if not verify_pin_hash(body.pin, stored):
        attempts = int(user.get("reset_pin_failed_attempts") or 0) + 1
        upd: dict = {"reset_pin_failed_attempts": attempts}
        if attempts >= MAX_PIN_ATTEMPTS:
            upd["reset_pin_locked_until"] = now() + timedelta(minutes=PIN_LOCKOUT_MINUTES)
            upd["reset_pin_failed_attempts"] = 0
            logger.warning(f"[pin] LOCKED user={user['id']} after {MAX_PIN_ATTEMPTS} failed attempts")
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        raise HTTPException(status_code=403, detail="Invalid email or PIN.")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_pw(body.new_password),
            "reset_pin_failed_attempts": 0,
            "reset_pin_locked_until": None,
        }},
    )
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    logger.info(f"[pin] password reset via admin PIN for user={user['id']}")
    return TokenResponse(access_token=make_token(user["id"]), user=user_to_public(fresh))


@app.post("/api/auth/change-password", response_model=TokenResponse)
async def change_password(
    body: ChangePasswordBody,
    current: Annotated[dict, Depends(get_current_user)],
):
    """Change the account password while logged in. Requires the current
    password. Returns a fresh JWT so the user stays logged in."""
    if not verify_pw(body.current_password, current["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect.")
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=400, detail="New password must be different from current password."
        )
    await db.users.update_one(
        {"id": current["id"]},
        {"$set": {"password_hash": hash_pw(body.new_password)}},
    )
    fresh = await db.users.find_one({"id": current["id"]}, {"_id": 0})
    logger.info(f"[pw] password changed for user={current['id']}")
    return TokenResponse(access_token=make_token(current["id"]), user=user_to_public(fresh))


# ============================================================
# Routes — Users / Follow
# ============================================================
@app.get("/api/users/{user_id}")
async def get_user(user_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    # Accept either a raw user id or an @handle / username.
    key = user_id.lstrip("@").strip()
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        u = await db.users.find_one({"username": key.lower()}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    follows_them = False
    followed_by = False
    if viewer and viewer["id"] != u["id"]:
        follows_them = await db.follows.find_one({"follower_id": viewer["id"], "followee_id": u["id"]}) is not None
        followed_by = await db.follows.find_one({"follower_id": u["id"], "followee_id": viewer["id"]}) is not None
    return {**user_to_public(u).model_dump(), "follows_them": follows_them, "followed_by": followed_by}


@app.post("/api/users/{user_id}/follow")
async def follow_user(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    if user_id == current["id"]:
        raise HTTPException(400, "Cannot follow yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    existing = await db.follows.find_one({"follower_id": current["id"], "followee_id": user_id})
    if existing:
        return {"status": "already_following"}
    await db.follows.insert_one({
        "id": str(uuid.uuid4()),
        "follower_id": current["id"],
        "followee_id": user_id,
        "created_at": now(),
    })
    await db.users.update_one({"id": user_id}, {"$inc": {"followers": 1}})
    await db.users.update_one({"id": current["id"]}, {"$inc": {"following": 1}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "follow",
        "actor_id": current["id"],
        "actor_name": current["display_name"],
        "actor_avatar": avatar_or_default(current.get("avatar_url")),
        "text": "started following you",
        "read": False,
        "created_at": now(),
    })
    try:
        await send_push(
            recipients=[user_id],
            data={
                "title": "New follower!",
                "message": f"{current['display_name']} started following you.",
                "action_url": f"/profile/{current['id']}",
            },
        )
    except Exception as e:
        logger.warning(f"Follow push failed: {e}")
    await send_web_push(user_id, "New follower!", f"{current['display_name']} started following you.", f"/user/{current['id']}")
    return {"status": "followed"}


@app.delete("/api/users/{user_id}/follow")
async def unfollow_user(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    result = await db.follows.delete_one({"follower_id": current["id"], "followee_id": user_id})
    if result.deleted_count:
        await db.users.update_one({"id": user_id}, {"$inc": {"followers": -1}})
        await db.users.update_one({"id": current["id"]}, {"$inc": {"following": -1}})
    return {"status": "unfollowed"}


@app.get("/api/users/{user_id}/posts")
async def user_posts(user_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    rows = await db.posts.find({"author_id": user_id, "type": "post"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    viewer_id = viewer["id"] if viewer else None
    return [await serialize_post(p, viewer_id) for p in rows]


@app.get("/api/users/{user_id}/reels")
async def user_reels(user_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    rows = await db.posts.find({"author_id": user_id, "type": "reel"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    viewer_id = viewer["id"] if viewer else None
    return [await serialize_post(p, viewer_id) for p in rows]


async def _list_relationship(
    user_id: str,
    kind: Literal["followers", "following"],
    viewer: Optional[dict],
) -> dict:
    """Shared loader for followers/following lists. Honors per-user privacy.
    Returns `{ "private": true }` if hidden, or `{ "users": [...] }` otherwise."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    viewer_id = viewer["id"] if viewer else None
    is_owner = viewer_id == user_id
    privacy_field = "followers_private" if kind == "followers" else "following_private"
    if target.get(privacy_field) and not is_owner:
        return {"private": True, "users": []}

    if kind == "followers":
        rows = await db.follows.find({"followee_id": user_id}, {"_id": 0, "follower_id": 1}).to_list(length=10000)
        ids = [r["follower_id"] for r in rows]
    else:
        rows = await db.follows.find({"follower_id": user_id}, {"_id": 0, "followee_id": 1}).to_list(length=10000)
        ids = [r["followee_id"] for r in rows]

    # Exclude users blocked-by/blocking the viewer.
    blocked = await blocked_ids_for(viewer_id)
    if blocked:
        ids = [uid for uid in ids if uid not in blocked]
    if not ids:
        return {"private": False, "users": []}

    users = await db.users.find(
        {"id": {"$in": ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(length=10000)

    # Annotate each row with `follows_them` so the UI can show Follow/Following
    # next to each entry.
    viewer_follows: set[str] = set()
    viewer_followers: set[str] = set()
    if viewer_id:
        f_rows = await db.follows.find(
            {"follower_id": viewer_id, "followee_id": {"$in": ids}},
            {"_id": 0, "followee_id": 1},
        ).to_list(length=10000)
        viewer_follows = {r["followee_id"] for r in f_rows}
        r_rows = await db.follows.find(
            {"followee_id": viewer_id, "follower_id": {"$in": ids}},
            {"_id": 0, "follower_id": 1},
        ).to_list(length=10000)
        viewer_followers = {r["follower_id"] for r in r_rows}

    return {
        "private": False,
        "users": [
            {
                **user_to_public(u).model_dump(),
                "follows_them": u["id"] in viewer_follows,
                "followed_by": u["id"] in viewer_followers,
                "is_me": u["id"] == viewer_id,
            }
            for u in users
        ],
    }


@app.get("/api/users/{user_id}/followers")
async def list_followers(user_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    return await _list_relationship(user_id, "followers", viewer)


@app.get("/api/users/{user_id}/following")
async def list_following(user_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    return await _list_relationship(user_id, "following", viewer)


class PrivacyBody(BaseModel):
    followers_private: Optional[bool] = None
    following_private: Optional[bool] = None


@app.get("/api/users/me/privacy")
async def get_my_privacy(current: Annotated[dict, Depends(get_current_user)]):
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "followers_private": 1, "following_private": 1})
    return {
        "followers_private": bool((u or {}).get("followers_private", False)),
        "following_private": bool((u or {}).get("following_private", False)),
    }


@app.put("/api/users/me/privacy")
async def update_my_privacy(body: PrivacyBody, current: Annotated[dict, Depends(get_current_user)]):
    patch: dict = {}
    if body.followers_private is not None:
        patch["followers_private"] = bool(body.followers_private)
    if body.following_private is not None:
        patch["following_private"] = bool(body.following_private)
    if patch:
        await db.users.update_one({"id": current["id"]}, {"$set": patch})
    u = await db.users.find_one({"id": current["id"]}, {"_id": 0, "followers_private": 1, "following_private": 1})
    return {
        "followers_private": bool((u or {}).get("followers_private", False)),
        "following_private": bool((u or {}).get("following_private", False)),
    }


# ============================================================
# Routes — Feed / Discover
# ============================================================
async def serialize_video_for_feed(v: dict, viewer_id: Optional[str] = None) -> dict:
    """Shape a long-form video as a feed card (type='video'). Clients open the
    fullscreen watch page on tap instead of using the inline post like/comment."""
    author = await db.users.find_one({"id": v["author_id"]}, {"_id": 0})
    liked_by_me = False
    if viewer_id:
        liked_by_me = await db.video_likes.find_one({"video_id": v["id"], "user_id": viewer_id}) is not None
    tags = v.get("tags") or []
    return {
        "id": v["id"],
        "type": "video",
        "title": v.get("title", ""),
        "caption": v.get("title", ""),
        "description": v.get("description", ""),
        "image_url": None,
        "video_url": _cloudinary_compat_url(v.get("video_url")),
        "thumbnail_url": v.get("thumbnail_url"),
        "game_tag": v.get("category") or (tags[0] if tags else None),
        "duration": v.get("duration"),
        "likes": v.get("likes", 0),
        "comments_count": v.get("comments_count", 0),
        "views": v.get("views", 0),
        "featured": bool(v.get("featured", False)),
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
            "equipped_frame": author.get("equipped_frame"),
            "frame_enabled": author.get("frame_enabled", True),
        } if author else None,
    }


@app.get("/api/feed")
async def feed(viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    viewer_id = viewer["id"] if viewer else None
    blocked = await blocked_ids_for(viewer_id)

    post_query: dict = {"type": "post"}
    reel_query: dict = {"type": "reel"}
    video_query: dict = {"visibility": "public"}
    if blocked:
        post_query["author_id"] = {"$nin": list(blocked)}
        reel_query["author_id"] = {"$nin": list(blocked)}
        video_query["author_id"] = {"$nin": list(blocked)}

    post_rows = await db.posts.find(post_query, {"_id": 0}).sort("created_at", -1).to_list(50)
    reel_rows = await db.posts.find(reel_query, {"_id": 0}).sort("created_at", -1).to_list(50)
    video_rows = await db.videos.find(video_query, {"_id": 0}).sort("created_at", -1).to_list(50)

    items = [await serialize_post(p, viewer_id) for p in post_rows]
    items += [await serialize_post(r, viewer_id) for r in reel_rows]
    items += [await serialize_video_for_feed(v, viewer_id) for v in video_rows]
    # Interleave all streams chronologically (newest first), then float featured to the top.
    items.sort(key=lambda x: x["created_at"], reverse=True)
    items.sort(key=lambda x: not x.get("featured", False))
    return items[:80]


async def blocked_ids_for(user_id: Optional[str]) -> set[str]:
    """Set of user_ids the viewer has blocked OR who have blocked the viewer.
    Used to filter feed/reels/discover/comments so abusive accounts disappear
    instantly per Apple Guideline 1.2."""
    if not user_id:
        return set()
    blocked: set[str] = set()
    async for b in db.blocks.find(
        {"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]},
        {"_id": 0, "blocker_id": 1, "blocked_id": 1},
    ):
        if b["blocker_id"] == user_id:
            blocked.add(b["blocked_id"])
        else:
            blocked.add(b["blocker_id"])
    return blocked


@app.get("/api/stories")
async def list_stories(viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    """Return active (last 24h) stories grouped by user. Each entry is one
    user with their latest active story for the ring/preview, plus a count.
    The current viewer is always first if they have any active story."""
    cutoff = now() - timedelta(hours=24)
    pipeline = [
        {"$match": {"expires_at": {"$gt": now()}}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$user_id",
            "latest_id": {"$first": "$id"},
            "latest_media": {"$first": "$media_url"},
            "latest_thumb": {"$first": "$thumbnail_url"},
            "latest_type": {"$first": "$media_type"},
            "latest_at": {"$first": "$created_at"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"latest_at": -1}},
        {"$limit": 50},
    ]
    rows = await db.stories.aggregate(pipeline).to_list(50)
    user_ids = [r["_id"] for r in rows]
    if not user_ids:
        return []
    users = await db.users.find(
        {"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1, "display_name": 1, "avatar_url": 1, "is_verified": 1}
    ).to_list(length=100)
    by_id = {u["id"]: u for u in users}

    viewer_id = viewer["id"] if viewer else None
    viewed_set: set[str] = set()
    if viewer_id:
        seen_rows = await db.story_views.find(
            {"viewer_id": viewer_id}, {"_id": 0, "story_id": 1}
        ).to_list(length=10000)
        viewed_set = {r["story_id"] for r in seen_rows}

    out: list[dict] = []
    for r in rows:
        u = by_id.get(r["_id"])
        if not u:
            continue
        # Compute if viewer has seen ALL of this user's active stories.
        # Cheaper version: just check the latest one.
        is_seen = r["latest_id"] in viewed_set
        out.append({
            "user_id": u["id"],
            "username": u["username"],
            "display_name": u["display_name"],
            "avatar_url": avatar_or_default(u.get("avatar_url")),
            "is_verified": bool(u.get("is_verified", False)),
            "preview_url": r.get("latest_thumb") or r.get("latest_media") or "",
            "count": r["count"],
            "seen": is_seen,
            "is_me": viewer_id == u["id"],
        })
    # Sort: self first, then unseen, then seen.
    out.sort(key=lambda x: (not x["is_me"], x["seen"]))
    _ = cutoff  # for readability
    return out


@app.get("/api/stories/user/{user_id}")
async def user_stories(user_id: str, viewer: Annotated[dict, Depends(get_current_user)]):
    """Active stories for a single user, oldest first (story viewer order)."""
    rows = await db.stories.find(
        {"user_id": user_id, "expires_at": {"$gt": now()}}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    if not rows:
        return {"user": None, "stories": []}
    user = await db.users.find_one(
        {"id": user_id}, {"_id": 0, "id": 1, "username": 1, "display_name": 1, "avatar_url": 1, "is_verified": 1}
    )
    if user:
        user["avatar_url"] = avatar_or_default(user.get("avatar_url"))
    for s in rows:
        s["created_at"] = s["created_at"].isoformat() if isinstance(s.get("created_at"), datetime) else s.get("created_at")
        s["expires_at"] = s["expires_at"].isoformat() if isinstance(s.get("expires_at"), datetime) else s.get("expires_at")
    return {"user": user, "stories": rows}


@app.post("/api/stories")
async def create_story(body: CreateStoryBody, current: Annotated[dict, Depends(get_current_user)]):
    sid = str(uuid.uuid4())
    created = now()
    expires = created + timedelta(hours=24)
    # For video stories, derive a thumbnail from the Cloudinary video URL on the fly.
    thumb = None
    if body.media_type == "video":
        m = body.media_url
        # https://res.cloudinary.com/<cloud>/video/upload/<rest>.<ext>
        try:
            if "/video/upload/" in m:
                base, rest = m.split("/video/upload/", 1)
                rest_no_ext = rest.rsplit(".", 1)[0]
                thumb = f"{base}/video/upload/so_0/{rest_no_ext}.jpg"
        except Exception:
            thumb = None
    doc = {
        "id": sid,
        "user_id": current["id"],
        "media_url": body.media_url,
        "media_type": body.media_type,
        "thumbnail_url": thumb,
        "caption": body.caption or "",
        "duration": body.duration,
        "created_at": created,
        "expires_at": expires,
    }
    await db.stories.insert_one(doc)
    # Return a fresh dict — `insert_one` mutates `doc` with an _id field.
    return {
        "id": sid,
        "user_id": current["id"],
        "media_url": body.media_url,
        "media_type": body.media_type,
        "thumbnail_url": thumb,
        "caption": body.caption or "",
        "duration": body.duration,
        "created_at": created.isoformat(),
        "expires_at": expires.isoformat(),
    }


@app.post("/api/stories/{story_id}/view")
async def mark_story_viewed(story_id: str, current: Annotated[dict, Depends(get_current_user)]):
    story = await db.stories.find_one({"id": story_id})
    if not story:
        raise HTTPException(404, "Story not found")
    await db.story_views.update_one(
        {"story_id": story_id, "viewer_id": current["id"]},
        {"$set": {"story_id": story_id, "viewer_id": current["id"], "viewed_at": now()}},
        upsert=True,
    )
    return {"status": "ok"}


@app.delete("/api/stories/{story_id}")
async def delete_story(story_id: str, current: Annotated[dict, Depends(get_current_user)]):
    story = await db.stories.find_one({"id": story_id})
    if not story:
        raise HTTPException(404, "Story not found")
    if story["user_id"] != current["id"]:
        raise HTTPException(403, "Not your story")
    await db.stories.delete_one({"id": story_id})
    await db.story_views.delete_many({"story_id": story_id})
    return {"status": "deleted"}


async def annotate_follows(items: list[dict], viewer_id: Optional[str]) -> list[dict]:
    """Attach `follows_them` + `is_me` to a list of serialized users so the UI
    can render Follow vs Following correctly in lists (discover, search)."""
    followed: set[str] = set()
    followers_of_me: set[str] = set()
    if viewer_id and items:
        ids = [it["id"] for it in items]
        frows = await db.follows.find(
            {"follower_id": viewer_id, "followee_id": {"$in": ids}},
            {"_id": 0, "followee_id": 1},
        ).to_list(length=10000)
        followed = {r["followee_id"] for r in frows}
        rrows = await db.follows.find(
            {"followee_id": viewer_id, "follower_id": {"$in": ids}},
            {"_id": 0, "follower_id": 1},
        ).to_list(length=10000)
        followers_of_me = {r["follower_id"] for r in rrows}
    for it in items:
        it["follows_them"] = it["id"] in followed
        it["followed_by"] = it["id"] in followers_of_me
        it["is_me"] = it["id"] == viewer_id
    return items


@app.get("/api/discover")
async def discover(filter: Literal["top", "accounts", "tags"] = "top",
                   viewer: Annotated[Optional[dict], Depends(get_optional_user)] = None):
    viewer_id = viewer["id"] if viewer else None
    blocked = await blocked_ids_for(viewer_id)
    blocked_list = list(blocked)
    if filter == "accounts":
        user_q: dict = {"id": {"$nin": blocked_list}} if blocked_list else {}
        users = await db.users.find(user_q, {"_id": 0, "password_hash": 0}).sort(
            [("is_official", -1), ("followers", -1)]
        ).limit(30).to_list(30)
        items = await annotate_follows([user_to_public(u).model_dump() for u in users], viewer_id)
        return {"type": "accounts", "items": items}
    if filter == "tags":
        match: dict = {"game_tag": {"$ne": None}}
        if blocked_list:
            match["author_id"] = {"$nin": blocked_list}
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$game_tag", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
        tags = await db.posts.aggregate(pipeline).to_list(20)
        return {"type": "tags", "items": [{"tag": t["_id"], "count": t["count"]} for t in tags if t["_id"]]}
    # top: trending posts and reels by likes
    post_q: dict = {}
    if blocked_list:
        post_q["author_id"] = {"$nin": blocked_list}
    rows = await db.posts.find(post_q, {"_id": 0}).sort("likes", -1).limit(60).to_list(60)
    items = [await serialize_post(p, viewer_id) for p in rows]
    items.sort(key=lambda x: not x.get("featured", False))
    return {"type": "top", "items": items}


@app.get("/api/reels")
async def reels(viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    viewer_id = viewer["id"] if viewer else None
    blocked = await blocked_ids_for(viewer_id)
    query: dict = {"type": "reel"}
    if blocked:
        query["author_id"] = {"$nin": list(blocked)}
    rows = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [await serialize_post(p, viewer_id) for p in rows]



# ============================================================
# Routes — Posts / Reels CRUD
# ============================================================
async def _notify_followers_new_post(author: dict, post: dict) -> None:
    """Fan out an in-app + push notification to everyone who follows the author."""
    try:
        follows = await db.follows.find({"followee_id": author["id"]}, {"_id": 0, "follower_id": 1}).to_list(5000)
        follower_ids = [f["follower_id"] for f in follows]
        if not follower_ids:
            return
        kind = post.get("type", "post")
        link = f"/reels/{post['id']}" if kind == "reel" else f"/posts/{post['id']}"
        preview = (post.get("caption") or "").strip()
        preview = (preview[:60] + "…") if len(preview) > 60 else preview
        verb = "shared a new reel" if kind == "reel" else "shared a new post"
        text = f"{verb}" + (f": {preview}" if preview else "")
        docs = [{
            "id": str(uuid.uuid4()),
            "user_id": fid,
            "type": "post",
            "actor_id": author["id"],
            "actor_name": author["display_name"],
            "actor_avatar": avatar_or_default(author.get("avatar_url")),
            "text": text,
            "link": link,
            "post_id": post["id"],
            "read": False,
            "created_at": now(),
        } for fid in follower_ids]
        if docs:
            await db.notifications.insert_many(docs)
        title = f"{author['display_name']} posted"
        body_msg = preview or f"{author['display_name']} {verb}."
        try:
            await send_push(recipients=follower_ids, data={"title": title, "message": body_msg, "action_url": link})
        except Exception as e:
            logger.warning(f"post push failed: {e}")
        for fid in follower_ids:
            try:
                await send_web_push(fid, title, body_msg, link)
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"notify followers failed: {e}")


@app.post("/api/posts")
async def create_post(body: CreatePostBody, current: Annotated[dict, Depends(get_current_user)]):
    post_id = str(uuid.uuid4())
    doc = {
        "id": post_id,
        "type": "post",
        "author_id": current["id"],
        "caption": body.caption,
        "image_url": body.image_url,
        "video_url": body.video_url,
        "thumbnail_url": body.thumbnail_url,
        "duration": body.duration,
        "game_tag": body.game_tag,
        "likes": 0,
        "comments_count": 0,
        "views": 0,
        "created_at": now(),
    }
    await db.posts.insert_one(doc)
    await db.users.update_one({"id": current["id"]}, {"$inc": {"posts_count": 1}})
    await _notify_followers_new_post(current, doc)
    return await serialize_post(doc, current["id"])


@app.post("/api/reels")
async def create_reel(body: CreateReelBody, current: Annotated[dict, Depends(get_current_user)]):
    post_id = str(uuid.uuid4())
    doc = {
        "id": post_id,
        "type": "reel",
        "author_id": current["id"],
        "caption": body.caption,
        "video_url": body.video_url,
        "thumbnail_url": body.thumbnail_url,
        "game_tag": body.game_tag,
        "duration": body.duration,
        "likes": 0,
        "comments_count": 0,
        "views": 0,
        "created_at": now(),
    }
    await db.posts.insert_one(doc)
    return await serialize_post(doc, current["id"])


@app.get("/api/posts/{post_id}")
async def get_post(post_id: str, viewer: Annotated[Optional[dict], Depends(get_optional_user)]):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    viewer_id = viewer["id"] if viewer else None
    return await serialize_post(post, viewer_id)


@app.put("/api/posts/{post_id}")
async def update_post(post_id: str, body: UpdatePostBody, current: Annotated[dict, Depends(get_current_user)]):
    """Edit the caption / game tag of your own post or reel. Media stays the same."""
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    if post["author_id"] != current["id"]:
        raise HTTPException(403, "Not your post")
    updates: dict = {}
    if body.caption is not None:
        updates["caption"] = body.caption.strip()
    if body.game_tag is not None:
        tag = body.game_tag.strip()
        updates["game_tag"] = tag or None
    if updates:
        updates["updated_at"] = now()
        await db.posts.update_one({"id": post_id}, {"$set": updates})
    fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return await serialize_post(fresh, current["id"])


@app.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, current: Annotated[dict, Depends(get_current_user)]):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    if post["author_id"] != current["id"]:
        raise HTTPException(403, "Not your post")
    await db.posts.delete_one({"id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    await db.likes.delete_many({"post_id": post_id})
    if post.get("type") == "post":
        await db.users.update_one({"id": current["id"]}, {"$inc": {"posts_count": -1}})
    return {"status": "deleted"}


@app.post("/api/posts/{post_id}/like")
async def like_post(post_id: str, current: Annotated[dict, Depends(get_current_user)]):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    existing = await db.likes.find_one({"post_id": post_id, "user_id": current["id"]})
    if existing:
        return {"status": "already_liked", "likes": post.get("likes", 0)}
    await db.likes.insert_one({
        "id": str(uuid.uuid4()),
        "post_id": post_id,
        "user_id": current["id"],
        "created_at": now(),
    })
    updated = await db.posts.find_one_and_update(
        {"id": post_id}, {"$inc": {"likes": 1}}, return_document=True
    )
    if post["author_id"] != current["id"]:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": post["author_id"],
            "type": "like",
            "actor_id": current["id"],
            "actor_name": current["display_name"],
            "actor_avatar": avatar_or_default(current.get("avatar_url")),
            "text": "liked your post",
            "post_id": post_id,
            "read": False,
            "created_at": now(),
        })
        try:
            await send_push(
                recipients=[post["author_id"]],
                data={
                    "title": "New like",
                    "message": f"{current['display_name']} liked your post.",
                    "action_url": f"/post/{post_id}",
                },
            )
        except Exception as e:
            logger.warning(f"Like push failed: {e}")
        await send_web_push(post["author_id"], "New like", f"{current['display_name']} liked your post.", f"/posts/{post_id}")
    return {"status": "liked", "likes": updated.get("likes", 0)}


@app.delete("/api/posts/{post_id}/like")
async def unlike_post(post_id: str, current: Annotated[dict, Depends(get_current_user)]):
    result = await db.likes.delete_one({"post_id": post_id, "user_id": current["id"]})
    if result.deleted_count:
        updated = await db.posts.find_one_and_update(
            {"id": post_id}, {"$inc": {"likes": -1}}, return_document=True
        )
        return {"status": "unliked", "likes": updated.get("likes", 0)}
    return {"status": "not_liked"}


@app.get("/api/posts/{post_id}/comments")
async def list_comments(post_id: str):
    rows = await db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Backfill is_verified from users collection (older rows may not have it persisted)
    user_ids = list({c.get("user_id") for c in rows if c.get("user_id")})
    verified: dict[str, bool] = {}
    avatars: dict[str, str] = {}
    remembering: dict[str, bool] = {}
    frames: dict[str, dict] = {}
    colors: dict[str, Optional[str]] = {}
    lives: dict[str, bool] = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "is_verified": 1, "avatar_url": 1, "remembering": 1, "equipped_frame": 1, "frame_enabled": 1, "verified_color": 1, "is_live": 1}):
            verified[u["id"]] = bool(u.get("is_verified", False))
            avatars[u["id"]] = u.get("avatar_url") or ""
            remembering[u["id"]] = bool(u.get("remembering", False))
            frames[u["id"]] = {"equipped_frame": u.get("equipped_frame"), "frame_enabled": u.get("frame_enabled", True)}
            colors[u["id"]] = u.get("verified_color")
            lives[u["id"]] = bool(u.get("is_live", False))
    for c in rows:
        if isinstance(c.get("created_at"), datetime):
            c["created_at"] = c["created_at"].isoformat()
        c["is_verified"] = c.get("is_verified", verified.get(c.get("user_id"), False))
        c["remembering"] = remembering.get(c.get("user_id"), c.get("remembering", False))
        c["verified_color"] = colors.get(c.get("user_id"), c.get("verified_color"))
        c["is_live"] = lives.get(c.get("user_id"), False)
        c["avatar_url"] = avatar_or_default(c.get("avatar_url") or avatars.get(c.get("user_id")))
        fr = frames.get(c.get("user_id"), {})
        c["equipped_frame"] = fr.get("equipped_frame")
        c["frame_enabled"] = fr.get("frame_enabled", True)
    return rows


@app.post("/api/posts/{post_id}/comments")
async def create_comment(post_id: str, body: CommentBody, current: Annotated[dict, Depends(get_current_user)]):
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Post not found")
    # One-level threading: replies attach to the TOP-LEVEL comment. If replying to
    # a reply, resolve up to its parent so we never nest deeper than one level.
    parent_id = None
    parent_author_id = None
    if body.parent_id:
        parent = await db.comments.find_one({"id": body.parent_id, "post_id": post_id})
        if not parent:
            raise HTTPException(404, "Parent comment not found")
        parent_id = parent.get("parent_id") or parent["id"]
        parent_author_id = parent.get("user_id")
    comment = {
        "id": str(uuid.uuid4()),
        "post_id": post_id,
        "parent_id": parent_id,
        "user_id": current["id"],
        "username": current["username"],
        "display_name": current["display_name"],
        "avatar_url": avatar_or_default(current.get("avatar_url")),
        "is_verified": bool(current.get("is_verified", False)),
        "verified_color": current.get("verified_color"),
        "remembering": bool(current.get("remembering", False)),
        "equipped_frame": current.get("equipped_frame"),
        "frame_enabled": current.get("frame_enabled", True),
        "text": body.text,
        "created_at": now(),
    }
    await db.comments.insert_one(comment)
    await db.posts.update_one({"id": post_id}, {"$inc": {"comments_count": 1}})
    # Notify the person being replied to (if it's someone else).
    if parent_author_id and parent_author_id != current["id"]:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": parent_author_id,
            "type": "comment",
            "actor_id": current["id"],
            "actor_name": current["display_name"],
            "actor_avatar": avatar_or_default(current.get("avatar_url")),
            "text": f"replied: {body.text[:60]}",
            "post_id": post_id,
            "read": False,
            "created_at": now(),
        })
        try:
            await send_web_push(parent_author_id, "New reply", f"{current['display_name']}: {body.text[:80]}", f"/posts/{post_id}")
        except Exception as e:
            logger.warning(f"Reply push failed: {e}")
    if post["author_id"] != current["id"] and post["author_id"] != parent_author_id:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": post["author_id"],
            "type": "comment",
            "actor_id": current["id"],
            "actor_name": current["display_name"],
            "actor_avatar": avatar_or_default(current.get("avatar_url")),
            "text": f"commented: {body.text[:60]}",
            "post_id": post_id,
            "read": False,
            "created_at": now(),
        })
        try:
            await send_push(
                recipients=[post["author_id"]],
                data={
                    "title": "New comment",
                    "message": f"{current['display_name']}: {body.text[:80]}",
                    "action_url": f"/post/{post_id}",
                },
            )
        except Exception as e:
            logger.warning(f"Comment push failed: {e}")
        await send_web_push(post["author_id"], "New comment", f"{current['display_name']}: {body.text[:80]}", f"/posts/{post_id}")
    comment_out = {k: v for k, v in comment.items() if k != "_id"}
    comment_out["created_at"] = comment["created_at"].isoformat()
    return comment_out


@app.delete("/api/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    current: Annotated[dict, Depends(get_current_user)],
):
    """Delete one of your own comments. Deleting a top-level comment removes its replies too."""
    comment = await db.comments.find_one({"id": comment_id, "post_id": post_id})
    if not comment:
        raise HTTPException(404, "Comment not found")
    if comment.get("user_id") != current["id"]:
        raise HTTPException(403, "You can only delete your own comments")
    # Remove the comment + any replies to it.
    reply_count = await db.comments.count_documents({"post_id": post_id, "parent_id": comment_id})
    await db.comments.delete_many({"post_id": post_id, "$or": [{"id": comment_id}, {"parent_id": comment_id}]})
    removed = 1 + reply_count
    await db.posts.update_one(
        {"id": post_id, "comments_count": {"$gte": removed}}, {"$inc": {"comments_count": -removed}}
    )
    return {"status": "deleted", "removed": removed}


# ============================================================
# Routes — Notifications
# ============================================================
@app.get("/api/notifications")
async def list_notifications(current: Annotated[dict, Depends(get_current_user)]):
    rows = await db.notifications.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    for n in rows:
        if isinstance(n.get("created_at"), datetime):
            n["created_at"] = n["created_at"].isoformat()
    return rows


@app.post("/api/notifications/read-all")
async def mark_all_read(current: Annotated[dict, Depends(get_current_user)]):
    await db.notifications.update_many({"user_id": current["id"]}, {"$set": {"read": True}})
    return {"status": "ok"}


@app.get("/api/notifications/unread-count")
async def unread_notifications_count(current: Annotated[dict, Depends(get_current_user)]):
    count = await db.notifications.count_documents({"user_id": current["id"], "read": {"$ne": True}})
    return {"count": count}


# ---- Web Push (browser) — self-hosted VAPID ----
@app.get("/api/push/vapid-public-key")
async def vapid_public_key():
    return {"publicKey": settings_store.get("VAPID_PUBLIC_KEY", "")}


@app.post("/api/push/web-subscribe", status_code=201)
async def web_push_subscribe(body: WebPushSubscribeBody, current: Annotated[dict, Depends(get_current_user)]):
    await db.push_subscriptions.update_one(
        {"endpoint": body.endpoint},
        {
            "$set": {
                "endpoint": body.endpoint,
                "keys": body.keys,
                "user_id": current["id"],
                "updated_at": now(),
            },
            "$setOnInsert": {"created_at": now()},
        },
        upsert=True,
    )
    return {"status": "subscribed"}


@app.post("/api/push/web-unsubscribe")
async def web_push_unsubscribe(body: WebPushUnsubscribeBody, current: Annotated[dict, Depends(get_current_user)]):
    await db.push_subscriptions.delete_one({"endpoint": body.endpoint, "user_id": current["id"]})
    return {"status": "unsubscribed"}


# ============================================================
# Routes — Push
# ============================================================
@app.post("/api/register-push", status_code=201)
async def register_push(body: PushRegisterBody):
    """Relay to Emergent push registration. Gracefully skips when the key is a placeholder
    (e.g. preview/dev) so the frontend can still call this safely."""
    token_preview = (body.device_token[:12] + "…") if body.device_token else "<empty>"
    logger.info(
        f"[push] register request user={body.user_id} platform={body.platform} token={token_preview}"
    )
    if not PUSH_KEY or PUSH_KEY == "placeholder":
        logger.info("[push] register skipped — EMERGENT_PUSH_KEY not set (dev/preview)")
        return {"status": "skipped", "reason": "EMERGENT_PUSH_KEY not set (dev/preview)"}
    try:
        resp = await push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            logger.warning("[push] register 401 — EMERGENT_PUSH_KEY invalid")
            return {"status": "skipped", "reason": "invalid key"}
        if resp.status_code >= 500:
            logger.warning(f"[push] register 5xx: {resp.status_code} {resp.text[:200]}")
            return {"status": "skipped", "reason": "provider unavailable"}
        if resp.status_code >= 400:
            logger.warning(f"[push] register FAILED {resp.status_code}: {resp.text[:300]}")
            return {"status": "skipped", "reason": f"status {resp.status_code}"}
        logger.info(
            f"[push] register OK status={resp.status_code} user={body.user_id} platform={body.platform}"
        )
    except Exception as e:
        logger.warning(f"[push] register exception (non-blocking): {e}")
        return {"status": "skipped", "reason": "network error"}
    return {"status": "registered"}


@app.get("/api/push/debug")
async def push_debug(current: Annotated[dict, Depends(get_current_user)]):
    """Diagnostic endpoint the app can hit to verify push wiring in production.
    Returns whether EMERGENT_PUSH_KEY is set, and fires a self-test push to the caller.
    """
    key_set = bool(PUSH_KEY and PUSH_KEY != "placeholder")
    upstream_status: Optional[int] = None
    upstream_body: str = ""
    if key_set:
        try:
            resp = await push_client.post(
                "/api/v1/push/trigger",
                json={
                    "recipients": [current["id"]],
                    "data": {
                        "title": "PostMePlex diagnostic",
                        "message": "If you see this, push delivery is working.",
                        "action_url": "/(tabs)/home",
                    },
                    "$idempotency_key": f"debug-{int(now().timestamp())}",
                },
            )
            upstream_status = resp.status_code
            upstream_body = resp.text[:300]
            logger.info(
                f"[push] DEBUG self-test user={current['id']} status={upstream_status} body={upstream_body!r}"
            )
        except Exception as e:
            upstream_body = f"exception: {e}"
    return {
        "key_configured": key_set,
        "user_id": current["id"],
        "upstream_status": upstream_status,
        "upstream_body": upstream_body,
    }


# ============================================================
# Routes — Health / Seed
# ============================================================
@app.get("/api/")
async def health():
    return {"status": "ok", "app": "postmeplex"}


# ============================================================
# Routes — Search / Admin / DMs
# ============================================================
@app.get("/api/search")
async def search(q: str = "", viewer: Annotated[Optional[dict], Depends(get_optional_user)] = None):
    q = (q or "").strip()
    if not q:
        return {"users": [], "tags": [], "posts": []}
    rx = {"$regex": q, "$options": "i"}
    users_raw = await db.users.find(
        {"$or": [{"username": rx}, {"display_name": rx}]},
        {"_id": 0, "password_hash": 0},
    ).limit(15).to_list(15)
    tag_q = q.lstrip("#")
    tags_raw = await db.posts.aggregate([
        {"$match": {"game_tag": {"$regex": tag_q, "$options": "i"}}},
        {"$group": {"_id": "$game_tag", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]).to_list(10)
    posts_raw = await db.posts.find(
        {"caption": rx}, {"_id": 0}
    ).sort("created_at", -1).limit(15).to_list(15)
    viewer_id = viewer["id"] if viewer else None
    return {
        "users": await annotate_follows([user_to_public(u).model_dump() for u in users_raw], viewer_id),
        "tags": [{"tag": t["_id"], "count": t["count"]} for t in tags_raw if t["_id"]],
        "posts": [await serialize_post(p, viewer_id) for p in posts_raw],
    }


@app.post("/api/admin/users/{user_id}/verify")
async def admin_toggle_verify(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_admin") and not current.get("is_super_admin"):
        raise HTTPException(403, "Admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    new_val = not target.get("is_verified", False)
    await db.users.update_one({"id": user_id}, {"$set": {"is_verified": new_val}})
    return {"id": user_id, "is_verified": new_val}


async def _color_from_description(desc: str) -> str:
    """Use the Emergent LLM to turn a natural-language color (e.g. "royal gold")
    into a single valid CSS hex code. Returns an uppercase #RRGGBB string."""
    import re
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    if not settings_store.get("EMERGENT_LLM_KEY"):
        raise HTTPException(503, "Color naming isn't configured")
    chat = LlmChat(
        api_key=settings_store.get("EMERGENT_LLM_KEY"),
        session_id=f"badge-color-{uuid.uuid4()}",
        system_message=(
            "You convert a short color description into a single valid CSS hex color. "
            "Reply with ONLY the hex code like #1DA1F2 — no words, no punctuation, no explanation."
        ),
    ).with_model("openai", "gpt-4o-mini")
    try:
        resp = await chat.send_message(UserMessage(text=f'Color description: "{desc}". Respond with only the hex code.'))
    except Exception as e:
        logger.warning(f"[verify-color] LLM error: {e}")
        raise HTTPException(502, "Couldn't interpret that color right now — try again.")
    m = re.search(r"#[0-9a-fA-F]{6}", resp or "")
    if m:
        return m.group(0).upper()
    m3 = re.search(r"#([0-9a-fA-F]{3})\b", resp or "")
    if m3:
        return "#" + "".join(ch * 2 for ch in m3.group(1)).upper()
    raise HTTPException(422, "Couldn't interpret that color — try describing it differently.")


class VerifyColorBody(BaseModel):
    """Admin sets a user's verified-badge color from a text description.
    Empty description clears the custom color (back to default brand color)."""
    description: str = Field(default="", max_length=100)


@app.post("/api/admin/users/{user_id}/verify-color")
async def admin_set_verify_color(user_id: str, body: VerifyColorBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_admin") and not current.get("is_super_admin"):
        raise HTTPException(403, "Admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    desc = (body.description or "").strip()
    if not desc:
        await db.users.update_one({"id": user_id}, {"$set": {"verified_color": None}})
        return {"id": user_id, "verified_color": None, "is_verified": bool(target.get("is_verified", False))}
    color = await _color_from_description(desc)
    # Setting a custom badge color auto-verifies the account.
    await db.users.update_one({"id": user_id}, {"$set": {"verified_color": color, "is_verified": True}})
    return {"id": user_id, "verified_color": color, "is_verified": True}


class FeatureBody(BaseModel):
    """Admin boosts a piece of content. `type` picks the collection; `featured`
    toggles the boost + "Featured" label and floats it to the top."""
    type: Literal["post", "reel", "video", "live"]
    id: str
    featured: bool = True


@app.post("/api/admin/feature")
async def admin_feature_content(body: FeatureBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_admin") and not current.get("is_super_admin"):
        raise HTTPException(403, "Admin only")
    coll = db.videos if body.type == "video" else (db.live_streams if body.type == "live" else db.posts)
    doc = await coll.find_one({"id": body.id})
    if not doc:
        raise HTTPException(404, "Content not found")
    patch = {"featured": bool(body.featured), "featured_at": now() if body.featured else None}
    await coll.update_one({"id": body.id}, {"$set": patch})
    return {"id": body.id, "type": body.type, "featured": bool(body.featured)}


@app.post("/api/remembering/apply")
async def apply_remembering(current: Annotated[dict, Depends(get_current_user)]):
    """User requests their account become a 'Remembering' (memorial) account.
    Sets status to pending for super-admin review. Idempotent."""
    if current.get("remembering"):
        return {"remembering": True, "remembering_status": "approved"}
    if (current.get("remembering_status") or "none") != "pending":
        await db.users.update_one(
            {"id": current["id"]},
            {"$set": {"remembering_status": "pending", "remembering_requested_at": now()}},
        )
    return {"remembering": False, "remembering_status": "pending"}


@app.get("/api/admin/remembering/requests")
async def list_remembering_requests(current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_admin") and not current.get("is_super_admin"):
        raise HTTPException(403, "Admin only")
    rows = await db.users.find(
        {"remembering_status": "pending"}, {"_id": 0, "password_hash": 0}
    ).sort("remembering_requested_at", 1).to_list(200)
    return [user_to_public(u).model_dump() for u in rows]


class RememberingActionBody(BaseModel):
    action: Literal["approve", "revoke"]


@app.post("/api/admin/users/{user_id}/remembering")
async def admin_set_remembering(
    user_id: str,
    body: RememberingActionBody,
    current: Annotated[dict, Depends(get_current_user)],
):
    """Super-admin/admin approves or revokes a 'Remembering' account."""
    if not current.get("is_admin") and not current.get("is_super_admin"):
        raise HTTPException(403, "Admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if body.action == "approve":
        patch = {"remembering": True, "remembering_status": "approved"}
    else:
        patch = {"remembering": False, "remembering_status": "none"}
    await db.users.update_one({"id": user_id}, {"$set": patch})
    logger.info(f"[remembering] {body.action} user={user_id} by admin={current['id']}")
    return {"id": user_id, **patch}


@app.get("/api/admin/users")
async def admin_search_users(q: str = "", current: Annotated[dict, Depends(get_current_user)] = None):
    if not current or (not current.get("is_admin") and not current.get("is_super_admin")):
        raise HTTPException(403, "Admin only")
    rx = {"$regex": q or "", "$options": "i"}
    filt = {} if not q else {"$or": [{"username": rx}, {"display_name": rx}, {"email": rx}]}
    rows = await db.users.find(filt, {"_id": 0, "password_hash": 0}).limit(40).to_list(40)
    return [
        {**user_to_public(u).model_dump(), "email": u.get("email"), "has_reset_pin": bool(u.get("reset_pin_hash")), "banned": bool(u.get("banned"))}
        for u in rows
    ]


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    """Super-admin: permanently delete a user (e.g. leftover test accounts) and
    their posts, follows and stories. Founder/official/self are protected."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("is_official") or target.get("is_super_admin") or user_id == current["id"]:
        raise HTTPException(400, "This account is protected and cannot be deleted")
    await db.posts.delete_many({"author_id": user_id})
    await db.follows.delete_many({"$or": [{"follower_id": user_id}, {"followee_id": user_id}]})
    await db.stories.delete_many({"user_id": user_id})
    await db.users.delete_one({"id": user_id})
    logger.info("[admin] deleted user %s (@%s)", user_id, target.get("username"))
    return {"status": "deleted", "id": user_id}


class AdminTokensBody(BaseModel):
    amount: int = Field(ge=0, le=100000000)
    op: str = "add"  # "add" | "remove" | "set"
    note: str = ""


@app.post("/api/admin/users/{user_id}/tokens", response_model=UserPublic)
async def admin_grant_tokens(
    user_id: str,
    body: AdminTokensBody,
    current: Annotated[dict, Depends(get_current_user)],
):
    """Super-admin: full control over a user's token balance — add, remove or set an exact amount."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    by = body.note or f"by @{current['username']}"
    op = body.op if body.op in ("add", "remove", "set") else "add"
    if op == "add":
        await wallet_core.grant(db, now, user_id, body.amount, "admin_grant", f"Admin added {by}")
    elif op == "remove":
        await wallet_core.adjust(db, now, user_id, -body.amount, "admin_remove", f"Admin removed {by}")
    else:
        await wallet_core.set_balance(db, now, user_id, body.amount, "admin_set", f"Admin set balance {by}")
    fresh = await db.users.find_one({"id": user_id})
    return user_to_public(fresh)


@app.post("/api/admin/users/{user_id}/reset-spins")
async def admin_reset_spins(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    """Super-admin: refill a user's slot spins (energy) to full on every slot game they play."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    epoch = int(now().timestamp())
    states = await db.slots_state.find({"user_id": user_id}).to_list(200)
    reset_count = 0
    for st in states:
        g = await db.games.find_one({"id": st["game_id"]}, {"_id": 0, "config": 1})
        cap = int(((g or {}).get("config") or {}).get("energy_cap", 50))
        await db.slots_state.update_one(
            {"id": st["id"]},
            {"$set": {"energy": cap, "last_energy_at": epoch, "updated_at": now()}},
        )
        reset_count += 1
    logger.info("[admin] reset spins for user %s (@%s) across %d game(s)", user_id, target.get("username"), reset_count)
    return {"status": "reset", "games": reset_count}


class AdminBanBody(BaseModel):
    reason: str = ""


def _ban_protected(target: dict, current: dict) -> None:
    if target.get("is_official") or target.get("is_super_admin") or target.get("is_admin") or target["id"] == current["id"]:
        raise HTTPException(400, "This account is protected and cannot be banned")


@app.post("/api/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, body: AdminBanBody, current: Annotated[dict, Depends(get_current_user)]):
    """Super-admin: ban a user — blocks login and invalidates their active session."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    _ban_protected(target, current)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"banned": True, "ban_reason": (body.reason or "").strip()[:200], "banned_at": now()}},
    )
    logger.info("[admin] banned user %s (@%s)", user_id, target.get("username"))
    return {"status": "banned", "id": user_id}


@app.post("/api/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: str, current: Annotated[dict, Depends(get_current_user)]):
    """Super-admin: lift a ban and restore access."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"banned": False}, "$unset": {"ban_reason": "", "banned_at": ""}},
    )
    logger.info("[admin] unbanned user %s (@%s)", user_id, target.get("username"))
    return {"status": "unbanned", "id": user_id}


@app.post("/api/admin/users/{user_id}/reset-pin")
async def admin_set_reset_pin(
    user_id: str,
    body: AdminSetPinBody,
    current: Annotated[dict, Depends(get_current_user)],
):
    """Super-admin sets / updates / clears a user's 4-digit password-reset PIN.
    Pass pin=null to remove it."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if body.pin is None:
        await db.users.update_one(
            {"id": user_id},
            {"$unset": {"reset_pin_hash": "", "reset_pin_failed_attempts": "", "reset_pin_locked_until": ""}},
        )
        logger.info(f"[pin] admin cleared PIN for user={user_id}")
        return {"id": user_id, "has_reset_pin": False}
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "reset_pin_hash": hash_pin(body.pin),
            "reset_pin_set_at": now(),
            "reset_pin_failed_attempts": 0,
            "reset_pin_locked_until": None,
        }},
    )
    logger.info(f"[pin] admin set PIN for user={user_id}")
    return {"id": user_id, "has_reset_pin": True}


class BroadcastBody(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=200)
    url: str = "/"


@app.post("/api/admin/broadcast")
async def admin_broadcast(body: BroadcastBody, current: Annotated[dict, Depends(get_current_user)]):
    """Super-admin: announce a new live update to everyone — an in-app notification
    for ALL users + a browser Web Push to every push-subscribed user."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Super admin only")

    # 1) In-app notification for every user (so non-push users see it next visit).
    user_ids = await db.users.distinct("id")
    if user_ids:
        docs = [{
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "type": "update",
            "actor_id": current["id"],
            "actor_name": "PostMePlex",
            "actor_avatar": DEFAULT_AVATAR_URL,
            "text": body.body,
            "read": False,
            "created_at": now(),
        } for uid in user_ids]
        await db.notifications.insert_many(docs)

    # 2) Web Push to every push-subscribed user (deduped).
    sub_user_ids = await db.push_subscriptions.distinct("user_id")
    pushed = 0
    for uid in sub_user_ids:
        try:
            await send_web_push(uid, body.title, body.body, body.url)
            pushed += 1
        except Exception as e:
            logger.warning(f"[broadcast] push failed for {uid}: {e}")

    logger.info(f"[broadcast] '{body.title}' → {len(user_ids)} in-app, {pushed} push-subscribed users")
    return {"notified_users": len(user_ids), "pushed_users": pushed}




# ============================================================
# Routes — Music (Semidiepie songs)
# ============================================================
class CreateSongBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    audio_url: str = Field(min_length=5)
    cover_url: Optional[str] = None
    duration: Optional[float] = None
    artist: Optional[str] = None


def _song_out(s: dict) -> dict:
    return {
        "id": s["id"],
        "title": s.get("title", ""),
        "artist": s.get("artist") or "semidiepie",
        "audio_url": s.get("audio_url"),
        "cover_url": s.get("cover_url"),
        "duration": s.get("duration"),
        "created_at": s["created_at"].isoformat() if isinstance(s.get("created_at"), datetime) else s.get("created_at"),
    }


@app.get("/api/songs")
async def list_songs():
    """Public: everyone can browse/stream the music library (newest first)."""
    rows = await db.songs.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_song_out(s) for s in rows]


@app.post("/api/songs", status_code=201)
async def create_song(body: CreateSongBody, current: Annotated[dict, Depends(get_current_user)]):
    """Only the super-admin (semidiepie) can upload songs."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Only the admin can upload songs")
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "artist": (body.artist or "semidiepie").strip(),
        "audio_url": body.audio_url,
        "cover_url": body.cover_url,
        "duration": body.duration,
        "uploader_id": current["id"],
        "created_at": now(),
    }
    await db.songs.insert_one(doc)
    return _song_out(doc)


@app.delete("/api/songs/{song_id}")
async def delete_song(song_id: str, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Only the admin can delete songs")
    res = await db.songs.delete_one({"id": song_id})
    if not res.deleted_count:
        raise HTTPException(404, "Song not found")
    return {"status": "deleted"}


# ============================================================
# Seed Demo Data
# ============================================================
SEED_USERS = [
    {
        "email": "semidiepie@gmail.com",
        "username": "semidiepie",
        "display_name": "semidiepie",
        "password": "Semi123!",
        "bio": "Founder of PostMePlex 👑",
        "avatar_url": "",
        "is_verified": True,
        "is_admin": True,
        "is_super_admin": True,
        "is_official": True,
    },
    {
        "email": "postmeplex@post.com",
        "username": "postmeplex",
        "display_name": "PostMePlex",
        "password": "PostMePlex#2026",
        "pin": "1000",
        "bio": "The official PostMePlex account ⚡ Home of creators, reels & live.",
        "avatar_url": "https://res.cloudinary.com/dpnrol54k/image/upload/v1790317297/postmeplex_icon_v2.png",
        "is_verified": True,
        "is_admin": False,
        "is_super_admin": False,
        "is_official": True,
    },
]

# Legacy seed emails that must be purged from any pre-existing DB so the app
# launches with a clean slate (only the founder remains).
LEGACY_SEED_EMAILS: list[str] = [
    "admin@postmeplex.com",
    "alex@postmeplex.com",
    "jordan@postmeplex.com",
    "maria@postmeplex.com",
    "kai@postmeplex.com",
    "sam@postmeplex.com",
    "luna@postmeplex.com",
]


async def purge_legacy_seed_data() -> None:
    """Delete every trace of the old fake demo accounts: their users, posts,
    reels, comments, conversations, messages and notifications. Also clears
    stale stock avatars on surviving users so a new upload becomes canonical.
    Idempotent."""
    # Explicit legacy demo emails + test-agent scratch accounts (their emails
    # follow a stable convention like test_user_<uuid>@postmeplex.com or
    # test_ec_*, test_pb_*, tpb_*, tec_*, TEST_iter*_@example.com). We match
    # by email regex so any future test run gets auto-cleaned on next boot.
    legacy_by_email = await db.users.find(
        {
            "$or": [
                {"email": {"$in": LEGACY_SEED_EMAILS}},
                {"email": {"$regex": r"^test_", "$options": "i"}},
                {"email": {"$regex": r"^TEST_", "$options": "i"}},
                {"email": {"$regex": r"^tec_", "$options": "i"}},
                {"email": {"$regex": r"^tpb_", "$options": "i"}},
                {"username": {"$regex": r"^test_", "$options": "i"}},
                {"username": {"$regex": r"^tec_", "$options": "i"}},
                {"username": {"$regex": r"^tpb_", "$options": "i"}},
            ]
        },
        {"_id": 0, "id": 1},
    ).to_list(length=1000)
    legacy_ids = [u["id"] for u in legacy_by_email]

    if legacy_ids:
        logger.info(f"Seed cleanup: purging {len(legacy_ids)} legacy demo account(s) + their content")
        await db.posts.delete_many({"author_id": {"$in": legacy_ids}})
        await db.comments.delete_many({"user_id": {"$in": legacy_ids}})
        await db.likes.delete_many({"user_id": {"$in": legacy_ids}})
        await db.notifications.delete_many(
            {"$or": [{"user_id": {"$in": legacy_ids}}, {"actor_id": {"$in": legacy_ids}}]}
        )
        # Any conversation that involves a legacy user goes away with its messages.
        legacy_convs = await db.conversations.find(
            {"member_ids": {"$in": legacy_ids}}, {"_id": 0, "id": 1}
        ).to_list(length=10000)
        legacy_conv_ids = [c["id"] for c in legacy_convs]
        if legacy_conv_ids:
            await db.conversations.delete_many({"id": {"$in": legacy_conv_ids}})
            await db.messages.delete_many({"conversation_id": {"$in": legacy_conv_ids}})
        await db.follows.delete_many(
            {"$or": [
                {"follower_id": {"$in": legacy_ids}},
                {"followee_id": {"$in": legacy_ids}},
                {"target_id": {"$in": legacy_ids}},
            ]}
        )
        await db.blocks.delete_many(
            {"$or": [{"blocker_id": {"$in": legacy_ids}}, {"blocked_id": {"$in": legacy_ids}}]}
        )
        await db.reports.delete_many({"reporter_id": {"$in": legacy_ids}})
        await db.stories.delete_many({"user_id": {"$in": legacy_ids}})
        await db.story_views.delete_many({"viewer_id": {"$in": legacy_ids}})
        await db.password_reset_tokens.delete_many({"user_id": {"$in": legacy_ids}})
        await db.push_tokens.delete_many({"user_id": {"$in": legacy_ids}})
        await db.moderation_events.delete_many(
            {"$or": [{"blocker_id": {"$in": legacy_ids}}, {"blocked_id": {"$in": legacy_ids}}]}
        )
        await db.live_sessions.delete_many({"host_id": {"$in": legacy_ids}})
        # Videos (YouTube-style) + their side-tables
        await db.videos.delete_many({"author_id": {"$in": legacy_ids}})
        await db.video_likes.delete_many({"user_id": {"$in": legacy_ids}})
        await db.video_comments.delete_many({"user_id": {"$in": legacy_ids}})
        await db.video_views.delete_many({"viewer_id": {"$in": legacy_ids}})
        await db.users.delete_many({"id": {"$in": legacy_ids}})

    # Clean up any orphan posts/comments referencing deleted authors.
    surviving_ids = await db.users.distinct("id")
    if surviving_ids:
        await db.posts.delete_many({"author_id": {"$nin": surviving_ids}})
        await db.comments.delete_many({"user_id": {"$nin": surviving_ids}})

    # If any user still has an old seeded stock avatar, clear it so their next
    # Edit profile upload becomes the real avatar.
    STALE_AVATARS = [
        "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop",
    ]
    await db.users.update_many(
        {"avatar_url": {"$in": STALE_AVATARS}},
        {"$set": {"avatar_url": ""}},
    )

    # Purge broken / unplayable reels (local file:// uris, blob:, http: insecure,
    # demo bucket URLs from the old seed, or rows missing video_url entirely).
    broken_reel_query: dict = {
        "type": "reel",
        "$or": [
            {"video_url": None},
            {"video_url": ""},
            {"video_url": {"$regex": "^file://"}},
            {"video_url": {"$regex": "^blob:"}},
            {"video_url": {"$regex": "^data:"}},
            {"video_url": {"$regex": "^http://"}},
            {"video_url": {"$regex": "commondatastorage\\.googleapis\\.com"}},
        ],
    }
    removed = await db.posts.delete_many(broken_reel_query)
    if removed.deleted_count:
        logger.info(f"Seed cleanup: purged {removed.deleted_count} broken/legacy reel(s).")

    # Also nuke any reel whose thumbnail still points at the legacy seed
    # Unsplash stock photos (so the founder's profile doesn't show some
    # stranger's face from an old failed upload).
    legacy_thumb_query: dict = {
        "type": "reel",
        "thumbnail_url": {
            "$in": [
                "https://images.unsplash.com/photo-1759701547121-d5e4188e3d3b?crop=entropy&cs=srgb&fm=jpg&w=400&q=80",
                "https://images.unsplash.com/photo-1759701547089-12599225b4c4?crop=entropy&cs=srgb&fm=jpg&w=400&q=80",
                "https://images.unsplash.com/photo-1759701546655-d90ec831aa52?crop=entropy&cs=srgb&fm=jpg&w=400&q=80",
                "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop",
                "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop",
                "https://images.unsplash.com/photo-1614680376573-df3480f0c6ff?w=400&h=400&fit=crop",
                "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
            ]
        },
    }
    removed2 = await db.posts.delete_many(legacy_thumb_query)
    if removed2.deleted_count:
        logger.info(f"Seed cleanup: purged {removed2.deleted_count} reel(s) with stale stock thumbnails.")


async def _follow_official(new_user_id: str) -> None:
    """Every new (real) member follows the official accounts by default — the
    standard 'official/system account' onboarding pattern. Real follows, not bots."""
    officials = await db.users.find({"is_official": True}, {"_id": 0, "id": 1}).to_list(50)
    for o in officials:
        oid = o["id"]
        if oid == new_user_id:
            continue
        exists = await db.follows.find_one({"follower_id": new_user_id, "followee_id": oid})
        if exists:
            continue
        await db.follows.insert_one({
            "id": str(uuid.uuid4()),
            "follower_id": new_user_id,
            "followee_id": oid,
            "created_at": now(),
        })
        await db.users.update_one({"id": oid}, {"$inc": {"followers": 1}})
        await db.users.update_one({"id": new_user_id}, {"$inc": {"following": 1}})


async def ensure_official_follows() -> None:
    """Idempotent backfill: existing members follow the official accounts by
    default, and official follower counts are recomputed from the follows graph
    to stay consistent."""
    officials = await db.users.find({"is_official": True}, {"_id": 0, "id": 1}).to_list(50)
    official_ids = [o["id"] for o in officials]
    if not official_ids:
        return
    members = await db.users.find({"id": {"$nin": official_ids}}, {"_id": 0, "id": 1}).to_list(100000)
    for m in members:
        await _follow_official(m["id"])
    # Reconcile official follower counters with the true follows count.
    for oid in official_ids:
        real = await db.follows.count_documents({"followee_id": oid})
        await db.users.update_one({"id": oid}, {"$set": {"followers": real}})


# ============================================================
# Admin: curated account provisioning + royalty-free feed population
# ============================================================
CURATED_SEED_CLIPS = [
    {
        "video_url": "https://res.cloudinary.com/demo/video/upload/dog.mp4",
        "thumbnail_url": "https://res.cloudinary.com/demo/video/upload/so_1/dog.jpg",
        "caption": "Good boy showing off 🐶 #pets",
    },
    {
        "video_url": "https://res.cloudinary.com/demo/video/upload/sea_turtle.mp4",
        "thumbnail_url": "https://res.cloudinary.com/demo/video/upload/so_1/sea_turtle.jpg",
        "caption": "Ocean vibes 🌊🐢 #nature",
    },
    {
        "video_url": "https://res.cloudinary.com/demo/video/upload/elephants.mp4",
        "thumbnail_url": "https://res.cloudinary.com/demo/video/upload/so_1/elephants.jpg",
        "caption": "Gentle giants on the move 🐘 #wildlife",
    },
]


class CuratedAccountBody(BaseModel):
    display_name: str
    username: Optional[str] = None
    avatar_url: Optional[str] = ""
    category: Optional[str] = ""
    populate_count: int = 8


class CuratedClipBody(BaseModel):
    video_url: str
    thumbnail_url: Optional[str] = None
    caption: Optional[str] = None


class BulkReelsBody(BaseModel):
    clips: list[CuratedClipBody]


def _slugify_username(base: str) -> str:
    s = "".join(ch for ch in base.lower() if ch.isalnum() or ch == "_")
    return s[:20] or "creator"


async def _unique_username(base: str) -> str:
    slug = _slugify_username(base)
    candidate = slug
    i = 1
    while await db.users.find_one({"username": candidate}):
        i += 1
        candidate = f"{slug}{i}"[:24]
    return candidate


async def _reels_from_clips(user_id: str, clips: list[dict]) -> int:
    docs = []
    for c in clips:
        if not c.get("video_url"):
            continue
        docs.append({
            "id": str(uuid.uuid4()),
            "type": "reel",
            "author_id": user_id,
            "caption": c.get("caption") or "",
            "video_url": c["video_url"],
            "thumbnail_url": c.get("thumbnail_url"),
            "likes": 0,
            "comments_count": 0,
            "views": 0,
            "created_at": now(),
        })
    if docs:
        await db.posts.insert_many(docs)
        await db.users.update_one({"id": user_id}, {"$inc": {"posts_count": len(docs)}})
    return len(docs)


async def _populate_from_library(user_id: str, count: int) -> int:
    count = max(0, min(count, 50))
    if count == 0:
        return 0
    clips = await db.curated_clips.aggregate([{"$sample": {"size": count}}]).to_list(length=count)
    return await _reels_from_clips(user_id, clips)


@app.post("/api/admin/curated-accounts")
async def create_curated_account(body: CuratedAccountBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    display = (body.display_name or "").strip()
    if not display:
        raise HTTPException(400, "Display name is required")
    username = await _unique_username(body.username or display)
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": f"{username}@curated.postmeplex.com",
        "username": username,
        "display_name": display,
        "password_hash": hash_pw(secrets.token_urlsafe(24)),
        "reset_pin_hash": hash_pin(f"{secrets.randbelow(10000):04d}"),
        "reset_pin_set_at": now(),
        "bio": (f"{body.category} • Curated on PostMePlex" if body.category else ""),
        "avatar_url": body.avatar_url or os.environ.get("DEFAULT_AVATAR_URL", ""),
        "category": body.category or "",
        "is_verified": True,
        "is_streamer": False,
        "is_admin": False,
        "is_curated": True,
        "is_live": False,
        "followers": 0,
        "following": 0,
        "posts_count": 0,
        "created_at": now(),
    }
    await db.users.insert_one(doc)
    await _follow_official(uid)
    created = await _populate_from_library(uid, body.populate_count)
    return {
        "user": {
            "id": uid,
            "username": username,
            "display_name": display,
            "avatar_url": doc["avatar_url"],
            "category": doc["category"],            "is_verified": True,
        },
        "reels_created": created,
    }


@app.get("/api/admin/curated-clips")
async def list_curated_clips(current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    return await db.curated_clips.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)


@app.post("/api/admin/curated-clips")
async def add_curated_clip(body: CuratedClipBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    doc = {
        "id": str(uuid.uuid4()),
        "video_url": body.video_url,
        "thumbnail_url": body.thumbnail_url,
        "caption": body.caption or "",
        "created_at": now(),
    }
    await db.curated_clips.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


class SageClipBody(BaseModel):
    query: Optional[str] = None
    add_to_library: bool = True


class CuratedAccountEditBody(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    category: Optional[str] = None


class SagePopulateBody(BaseModel):
    count: int = 5
    query: Optional[str] = None


class ReelEditBody(BaseModel):
    caption: Optional[str] = None


async def _pixabay_videos(query: str, count: int = 1) -> list[dict]:
    key = settings_store.get("PIXABAY_API_KEY", "")
    if not key:
        return []
    import random
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            resp = await c.get(
                "https://pixabay.com/api/videos/",
                params={"key": key, "q": query, "per_page": 50, "safesearch": "true"},
            )
            resp.raise_for_status()
            hits = resp.json().get("hits") or []
    except Exception as e:  # network / quota / bad key → fall back to library
        logger.warning("Pixabay fetch failed: %s", e)
        return []
    random.shuffle(hits)
    out: list[dict] = []
    for h in hits:
        vids = h.get("videos", {})
        v = vids.get("medium") or vids.get("small") or vids.get("large") or vids.get("tiny")
        if not v or not v.get("url"):
            continue
        tags = (h.get("tags") or "").split(",")
        cap = tags[0].strip().title() if tags and tags[0].strip() else query.title()
        out.append({"video_url": v["url"], "thumbnail_url": v.get("thumbnail"), "caption": f"{cap} · royalty-free"})
        if len(out) >= count:
            break
    return out


async def _pixabay_video(query: str) -> Optional[dict]:
    vids = await _pixabay_videos(query, 1)
    return vids[0] if vids else None


@app.post("/api/admin/sage-clip")
async def sage_pull_clip(body: SageClipBody, current: Annotated[dict, Depends(get_current_user)]):
    """Sage AI: pull a royalty-free video clip (Pixabay by keyword), falling back
    to the existing curated library. Optionally adds it to the library."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    query = (body.query or "").strip() or "trending"
    clip = await _pixabay_video(query)
    source = "pixabay"
    if not clip:
        sample = await db.curated_clips.aggregate([{"$sample": {"size": 1}}]).to_list(length=1)
        if sample:
            s = sample[0]
            clip = {"video_url": s["video_url"], "thumbnail_url": s.get("thumbnail_url"), "caption": s.get("caption", "")}
            source = "library"
    if not clip:
        raise HTTPException(502, "No royalty-free clip available")
    if body.add_to_library and source == "pixabay":
        doc = {"id": str(uuid.uuid4()), "created_at": now(), **clip}
        await db.curated_clips.insert_one(doc)
        clip = {k: v for k, v in doc.items() if k != "_id"}
    return {**clip, "source": source}


@app.post("/api/admin/accounts/{user_id}/reels")
async def bulk_add_reels(user_id: str, body: BulkReelsBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Account not found")
    created = await _reels_from_clips(user_id, [c.model_dump() for c in body.clips])
    return {"created": created}


@app.get("/api/admin/curated-accounts")
async def list_curated_accounts(current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    rows = await db.users.find(
        {"is_curated": True},
        {"_id": 0, "id": 1, "username": 1, "display_name": 1, "avatar_url": 1, "category": 1, "posts_count": 1, "is_verified": 1},
    ).sort("created_at", -1).to_list(length=500)
    return rows


@app.patch("/api/admin/curated-accounts/{user_id}")
async def edit_curated_account(user_id: str, body: CuratedAccountEditBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Account not found")
    updates: dict = {}
    if body.display_name is not None and body.display_name.strip():
        updates["display_name"] = body.display_name.strip()
    if body.avatar_url is not None:
        updates["avatar_url"] = body.avatar_url
    if body.category is not None:
        updates["category"] = body.category.strip()
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "username": 1, "display_name": 1, "avatar_url": 1, "category": 1, "posts_count": 1, "is_verified": 1})
    return fresh


@app.post("/api/admin/accounts/{user_id}/sage-reels")
async def sage_populate_account(user_id: str, body: SagePopulateBody, current: Annotated[dict, Depends(get_current_user)]):
    """Sage AI: fetch `count` royalty-free clips for the account's category and
    attach them as reels; also adds them to the shared library."""
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    u = await db.users.find_one({"id": user_id})
    if not u:
        raise HTTPException(404, "Account not found")
    count = max(1, min(body.count, 20))
    query = (body.query or u.get("category") or "trending").strip() or "trending"
    clips = await _pixabay_videos(query, count)
    source = "pixabay"
    if not clips:
        clips = await db.curated_clips.aggregate([{"$sample": {"size": count}}]).to_list(length=count)
        source = "library"
    if not clips:
        raise HTTPException(502, "No royalty-free clips available")
    if source == "pixabay":
        await db.curated_clips.insert_many([{"id": str(uuid.uuid4()), "created_at": now(), **c} for c in clips])
    created = await _reels_from_clips(user_id, clips)
    return {"created": created, "source": source}


@app.patch("/api/admin/reels/{post_id}")
async def admin_edit_reel(post_id: str, body: ReelEditBody, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Reel not found")
    if body.caption is not None:
        await db.posts.update_one({"id": post_id}, {"$set": {"caption": body.caption.strip(), "updated_at": now()}})
    fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return await serialize_post(fresh, current["id"])


@app.delete("/api/admin/reels/{post_id}")
async def admin_delete_reel(post_id: str, current: Annotated[dict, Depends(get_current_user)]):
    if not current.get("is_super_admin"):
        raise HTTPException(403, "Admins only")
    post = await db.posts.find_one({"id": post_id})
    if not post:
        raise HTTPException(404, "Reel not found")
    await db.posts.delete_one({"id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    await db.likes.delete_many({"post_id": post_id})
    await db.users.update_one({"id": post["author_id"]}, {"$inc": {"posts_count": -1}})
    return {"status": "deleted"}


@app.on_event("startup")
async def seed():
    """Idempotent founder-only seed. ONLY ensures semidiepie exists as the
    founder/super-admin. No destructive deletions run on startup (legacy demo
    cleanup already applied; if ever needed again it must be a manual admin op)."""
    logger.info("Seed: ensuring founder account (semidiepie)…")
    for u in SEED_USERS:
        email = u["email"].lower()
        existing = await db.users.find_one({"email": email})
        if existing:
            uid = existing["id"]
            # Always overwrite canonical credential + admin fields so they
            # cannot drift. Avatar/bio are left alone so the user's edits stick.
            set_fields = {
                "username": u["username"],
                "display_name": u["display_name"],
                "password_hash": hash_pw(u["password"]),
                "is_verified": u.get("is_verified", False),
                "is_admin": u.get("is_admin", False),
                "is_super_admin": u.get("is_super_admin", False),
                "is_official": u.get("is_official", False),
            }
            # Super-admin's own reset PIN is always 7455 (fixed recovery code).
            if u.get("is_super_admin"):
                set_fields["reset_pin_hash"] = hash_pin(ADMIN_DEFAULT_PIN)
                set_fields["reset_pin_set_at"] = now()
                set_fields["reset_pin_failed_attempts"] = 0
                set_fields["reset_pin_locked_until"] = None
            # Non-admin official accounts get a fixed login PIN so the founder can sign in.
            elif u.get("pin"):
                set_fields["reset_pin_hash"] = hash_pin(u["pin"])
            await db.users.update_one({"id": uid}, {"$set": set_fields})
        else:
            new_doc = {
                "id": str(uuid.uuid4()),
                "email": email,
                "username": u["username"],
                "display_name": u["display_name"],
                "password_hash": hash_pw(u["password"]),
                "bio": u.get("bio", ""),
                "avatar_url": u.get("avatar_url", ""),
                "is_verified": u.get("is_verified", False),
                "is_streamer": False,
                "is_admin": u.get("is_admin", False),
                "is_super_admin": u.get("is_super_admin", False),
                "is_official": u.get("is_official", False),
                "is_live": False,
                "viewers": 0,
                "stream_title": "",
                "followers": 0,
                "following": 0,
                "posts_count": 0,
                "created_at": now(),
            }
            if u.get("is_super_admin"):
                new_doc["reset_pin_hash"] = hash_pin(ADMIN_DEFAULT_PIN)
                new_doc["reset_pin_set_at"] = now()
            elif u.get("pin"):
                new_doc["reset_pin_hash"] = hash_pin(u["pin"])
                new_doc["reset_pin_set_at"] = now()
            await db.users.insert_one(new_doc)
    await ensure_official_follows()
    # Backfill the token wallet for any pre-economy accounts.
    await db.users.update_many(
        {"tokens": {"$exists": False}},
        {"$set": {"tokens": wallet_core.WELCOME_TOKENS, "owned_frames": []}},
    )
    if await db.curated_clips.count_documents({}) == 0:
        await db.curated_clips.insert_many([
            {"id": str(uuid.uuid4()), "created_at": now(), **c} for c in CURATED_SEED_CLIPS
        ])
        logger.info("Seed: curated clip library seeded.")
    logger.info("Seed: founder + official account ensured.")


@app.on_event("shutdown")
async def shutdown():
    client.close()
    await push_client.aclose()
    await resend_client.aclose()


# ============================================================
# Modular routers
# ============================================================
# Shared context passed to extracted route modules so they can reuse the same
# db handle, auth deps and serialization helpers defined above.
from types import SimpleNamespace  # noqa: E402

route_ctx = SimpleNamespace(
    db=db,
    now=now,
    logger=logger,
    get_current_user=get_current_user,
    get_optional_user=get_optional_user,
    user_from_token=user_from_token,
    blocked_ids_for=blocked_ids_for,
    cloudinary_compat_url=_cloudinary_compat_url,
    user_to_public=user_to_public,
    avatar_or_default=avatar_or_default,
    default_avatar_url=DEFAULT_AVATAR_URL,
    send_push=send_push,
    send_web_push=send_web_push,
)

from routes.rooms_blogs import build_router as _build_rooms_blogs  # noqa: E402
app.include_router(_build_rooms_blogs(db, get_current_user, get_optional_user))

from routes.videos import build_router as _build_videos  # noqa: E402
app.include_router(_build_videos(route_ctx))

from routes.messages import build_router as _build_messages  # noqa: E402
app.include_router(_build_messages(route_ctx))

from routes.live import build_router as _build_live  # noqa: E402
app.include_router(_build_live(route_ctx))

from routes.pets import build_router as _build_pets  # noqa: E402
_pets_router = _build_pets(route_ctx)
app.include_router(_pets_router)

from routes.share import build_router as _build_share  # noqa: E402
app.include_router(_build_share(route_ctx))

from routes.calls import build_router as _build_calls  # noqa: E402
app.include_router(_build_calls(route_ctx))

from routes.sage import build_router as _build_sage  # noqa: E402
app.include_router(_build_sage(route_ctx))

from routes.keyhealth import build_router as _build_keyhealth, check_and_alert as _keyhealth_check  # noqa: E402
app.include_router(_build_keyhealth(route_ctx))

from routes.games import build_router as _build_games, seed_default_game as _seed_games  # noqa: E402
app.include_router(_build_games(route_ctx))

from routes.wallet import build_router as _build_wallet  # noqa: E402
app.include_router(_build_wallet(route_ctx))

from routes.ai_characters import build_router as _build_ai_characters  # noqa: E402
app.include_router(_build_ai_characters(route_ctx))


@app.on_event("startup")
async def _seed_games_startup():
    try:
        await _seed_games(db, now)
        logger.info("Seed: default game ensured.")
    except Exception as e:
        logger.warning(f"[games] seed failed: {e}")


@app.on_event("startup")
async def _load_api_key_overrides():
    await settings_store.load()


@app.on_event("startup")
async def _start_pet_reminders():
    import asyncio
    asyncio.create_task(_pets_router.pet_reminder_loop())


@app.on_event("startup")
async def _start_key_health_monitor():
    import asyncio

    async def _loop():
        # Small delay so the app finishes booting before the first probe.
        await asyncio.sleep(30)
        while True:
            try:
                await _keyhealth_check(db, send_web_push, DEFAULT_AVATAR_URL)
            except Exception as e:
                logger.warning(f"[keyhealth] periodic check failed: {e}")
            await asyncio.sleep(6 * 3600)  # every 6 hours

    asyncio.create_task(_loop())
