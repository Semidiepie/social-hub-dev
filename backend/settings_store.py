"""Runtime-editable third-party API keys.

Effective value resolution: DB override (`db.api_keys`) → environment variable
→ default. Overrides are cached in-memory and refreshed the moment an admin
edits a key, so new keys take effect WITHOUT a restart or redeploy. Each
environment (preview / production) keeps its own overrides in its own DB.
"""
import os
from datetime import datetime, timezone

# Keys the admin panel can edit. `secret=True` → value is masked, never
# returned in full to the browser.
MANAGED_KEYS = [
    {"name": "CLOUDFLARE_ACCOUNT_ID", "label": "Cloudflare Account ID", "service": "cloudflare", "secret": False},
    {"name": "CLOUDFLARE_API_TOKEN", "label": "Cloudflare API Token", "service": "cloudflare", "secret": True},
    {"name": "AGORA_APP_ID", "label": "Agora App ID", "service": "agora", "secret": False},
    {"name": "AGORA_APP_CERTIFICATE", "label": "Agora App Certificate", "service": "agora", "secret": True},
    {"name": "ELEVENLABS_API_KEY", "label": "ElevenLabs API Key (Sage voice)", "service": "elevenlabs", "secret": True},
    {"name": "CLOUDINARY_CLOUD_NAME", "label": "Cloudinary Cloud Name", "service": "cloudinary", "secret": False},
    {"name": "CLOUDINARY_UPLOAD_PRESET", "label": "Cloudinary Upload Preset", "service": "cloudinary", "secret": False},
    {"name": "PIXABAY_API_KEY", "label": "Pixabay API Key", "service": "pixabay", "secret": True},
    {"name": "VAPID_PUBLIC_KEY", "label": "Web Push VAPID Public Key", "service": "vapid", "secret": False},
    {"name": "VAPID_PRIVATE_KEY_B64", "label": "Web Push VAPID Private Key (base64)", "service": "vapid", "secret": True},
    {"name": "VAPID_SUBJECT", "label": "Web Push Contact (mailto:)", "service": "vapid", "secret": False},
    {"name": "EMERGENT_LLM_KEY", "label": "Emergent LLM Key (Sage, AI pets)", "service": "emergent_llm", "secret": True},
]
_MANAGED_NAMES = {k["name"] for k in MANAGED_KEYS}

_cache: dict[str, str] = {}
_db = None


def init(db):
    global _db
    _db = db


async def load():
    """Populate the in-memory override cache from the DB."""
    if _db is None:
        return
    _cache.clear()
    async for r in _db.api_keys.find({}, {"_id": 0}):
        v = (r.get("value") or "").strip()
        if v:
            _cache[r["name"]] = v


def get(name: str, default: str = "") -> str:
    """Effective value: DB override if present, else env, else default."""
    v = _cache.get(name)
    if v:
        return v
    return os.environ.get(name, default)


def source(name: str) -> str:
    if _cache.get(name):
        return "custom"
    if os.environ.get(name):
        return "env"
    return "unset"


async def set_key(name: str, value: str):
    if name not in _MANAGED_NAMES:
        raise KeyError(name)
    value = (value or "").strip()
    await _db.api_keys.update_one(
        {"name": name},
        {"$set": {"name": name, "value": value, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    if value:
        _cache[name] = value
    else:
        _cache.pop(name, None)


def mask(name: str, secret: bool) -> str:
    """A safe-to-display representation of the current effective value."""
    val = get(name)
    if not val:
        return ""
    if not secret:
        return val
    tail = val[-4:] if len(val) >= 4 else val
    return "••••" + tail
