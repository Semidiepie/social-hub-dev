"""PostMePlex object storage (Emergent-managed).

Replaces the previous third-party Cloudinary upload flow. All user media
(images, video, audio) is stored on PostMePlex's own storage bucket and served
back through the backend, so nothing depends on an external account that can be
disabled.
"""
from __future__ import annotations

import os

import httpx

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "postmeplex"

_storage_key: str | None = None
_client = httpx.AsyncClient(timeout=300.0)


async def init_storage(force: bool = False) -> str:
    """Mint (once) and cache a session-scoped storage key. force=True re-mints."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = await _client.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30.0)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = await init_storage()
    url = f"{STORAGE_URL}/objects/{path}"
    headers = {"X-Storage-Key": key, "Content-Type": content_type}
    resp = await _client.put(url, headers=headers, content=data)
    if resp.status_code == 404:
        # Cached key went inactive mid-session — re-mint once and retry.
        key = await init_storage(force=True)
        headers["X-Storage-Key"] = key
        resp = await _client.put(url, headers=headers, content=data)
    resp.raise_for_status()
    return resp.json()


async def get_object(path: str, range_header: str | None = None) -> httpx.Response:
    """Fetch an object, forwarding any Range header. Returns the raw response."""
    key = await init_storage()
    url = f"{STORAGE_URL}/objects/{path}"
    headers = {"X-Storage-Key": key}
    if range_header:
        headers["Range"] = range_header
    resp = await _client.get(url, headers=headers)
    if resp.status_code == 404:
        key = await init_storage(force=True)
        headers["X-Storage-Key"] = key
        resp = await _client.get(url, headers=headers)
    return resp
