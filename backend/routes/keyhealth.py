"""API key health monitor — alerts the super admin (Semidiepie) the moment a
third-party API key looks broken/expired/missing, so it can be updated fast.

- Actively validates the keys that actually expire (ElevenLabs, Cloudflare).
- Presence-checks the rest (missing key -> alert).
- Alerts go ONLY to super-admin users, as a Web Push + an in-app notification.
- Deduplicated with a cooldown so the admin isn't spammed.
- Runs on a periodic background task, on-demand via an admin endpoint, and can
  be called reactively (`report_issue`) when a live request fails on auth.

NOTE: intentionally NO `from __future__ import annotations`.
"""
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException

load_dotenv()

ALERT_COOLDOWN_HOURS = 12


def _now():
    return datetime.now(timezone.utc)


async def report_issue(db, send_web_push, default_avatar, service, label, detail,
                       cooldown_hours=ALERT_COOLDOWN_HOURS, force=False):
    """Notify every super-admin that `service` needs attention. Deduped per
    service within the cooldown window. Never raises."""
    try:
        rec = await db.key_alerts.find_one({"service": service})
        if not force and rec and isinstance(rec.get("last_alert_at"), datetime):
            if _now() - rec["last_alert_at"] < timedelta(hours=cooldown_hours):
                return False
        admins = await db.users.find({"is_super_admin": True}, {"_id": 0, "id": 1}).to_list(20)
        title = "⚠️ API key needs updating"
        text = f"{label} needs attention: {detail}"
        for a in admins:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": a["id"],
                "type": "key_alert",
                "actor_name": "PostMePlex",
                "actor_avatar": default_avatar,
                "text": text,
                "read": False,
                "created_at": _now(),
                "url": "/admin/keys",
            })
            try:
                await send_web_push(a["id"], title, f"{label}: {detail}", "/admin/keys")
            except Exception:
                pass
        await db.key_alerts.update_one(
            {"service": service},
            {"$set": {"service": service, "label": label, "last_alert_at": _now(), "detail": detail}},
            upsert=True,
        )
        return True
    except Exception:
        return False


async def clear_issue(db, service):
    """Reset the cooldown once a key is healthy again, so the next failure alerts immediately."""
    try:
        await db.key_alerts.delete_one({"service": service})
    except Exception:
        pass


async def _check_elevenlabs():
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        return {"status": "missing", "detail": "No ElevenLabs key set — Sage voice is off."}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get("https://api.elevenlabs.io/v1/user/subscription", headers={"xi-api-key": key})
        if r.status_code == 401:
            return {"status": "invalid", "detail": "ElevenLabs key rejected (401) — replace it."}
        if r.status_code >= 400:
            return {"status": "error", "detail": f"ElevenLabs returned {r.status_code}."}
        data = r.json()
        used = data.get("character_count", 0)
        limit = data.get("character_limit", 0)
        if limit and used >= limit:
            return {"status": "invalid", "detail": "ElevenLabs character quota exhausted — upgrade/renew."}
        return {"status": "ok", "detail": f"OK ({used}/{limit} chars used)."}
    except Exception as e:
        return {"status": "error", "detail": f"ElevenLabs check failed: {e}"}


async def _check_cloudflare():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        return {"status": "missing", "detail": "No Cloudflare API token — livestreaming is off."}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get("https://api.cloudflare.com/client/v4/user/tokens/verify",
                            headers={"Authorization": f"Bearer {token}"})
        j = r.json()
        if r.status_code == 200 and j.get("success"):
            status = (j.get("result") or {}).get("status")
            if status and status != "active":
                return {"status": "invalid", "detail": f"Cloudflare token status is '{status}'."}
            return {"status": "ok", "detail": "Cloudflare token active."}
        return {"status": "invalid", "detail": "Cloudflare token invalid/expired — replace it."}
    except Exception as e:
        return {"status": "error", "detail": f"Cloudflare check failed: {e}"}


def _check_presence(env_name, label_missing):
    val = os.environ.get(env_name, "")
    if not val or val.startswith("placeholder"):
        return {"status": "missing", "detail": label_missing}
    return {"status": "ok", "detail": "Configured."}


async def run_checks():
    """Returns a list of {service, label, status, detail}."""
    el = await _check_elevenlabs()
    cf = await _check_cloudflare()
    return [
        {"service": "elevenlabs", "label": "ElevenLabs (Sage voice)", **el},
        {"service": "cloudflare", "label": "Cloudflare Stream (Live)", **cf},
        {"service": "agora", "label": "Agora (audio/video calls)",
         **_check_presence("AGORA_APP_ID", "No Agora App ID — calls are off.")},
        {"service": "agora_cert", "label": "Agora App Certificate",
         **_check_presence("AGORA_APP_CERTIFICATE", "No Agora certificate — call tokens can't be minted.")},
        {"service": "emergent_llm", "label": "Emergent LLM key (Sage brain, AI pets)",
         **_check_presence("EMERGENT_LLM_KEY", "No Emergent LLM key — AI features are off.")},
        {"service": "cloudinary", "label": "Cloudinary (media uploads)",
         **_check_presence("CLOUDINARY_CLOUD_NAME", "No Cloudinary config — uploads are off.")},
        {"service": "vapid", "label": "Web Push (VAPID)",
         **_check_presence("VAPID_PRIVATE_KEY_B64", "No VAPID key — web push is off.")},
    ]


async def check_and_alert(db, send_web_push, default_avatar, force=False):
    report = await run_checks()
    for item in report:
        if item["status"] in ("invalid", "missing", "error"):
            await report_issue(db, send_web_push, default_avatar, item["service"], item["label"], item["detail"], force=force)
        else:
            await clear_issue(db, item["service"])
    return report


def build_router(ctx) -> APIRouter:
    db = ctx.db
    get_current_user = ctx.get_current_user
    send_web_push = ctx.send_web_push
    default_avatar = ctx.default_avatar_url
    router = APIRouter(tags=["admin-keys"])

    def _require_admin(current):
        if not current.get("is_super_admin"):
            raise HTTPException(403, "Admins only")

    @router.get("/api/admin/keys/status")
    async def keys_status(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        return {"services": await run_checks(), "checked_at": _now().isoformat()}

    @router.post("/api/admin/keys/check")
    async def keys_check(current: Annotated[dict, Depends(get_current_user)]):
        _require_admin(current)
        report = await check_and_alert(db, send_web_push, default_avatar, force=True)
        broken = [r for r in report if r["status"] != "ok"]
        return {"services": report, "alerted": [r["service"] for r in broken], "checked_at": _now().isoformat()}

    return router
