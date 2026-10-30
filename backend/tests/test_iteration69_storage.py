"""Iteration 69 — PostMePlex object storage migration (from Cloudinary).

Covers:
- POST /api/upload (authenticated, multipart) returns {url, secure_url, path, bytes, content_type}
  and the url is of form {BACKEND}/api/files/postmeplex/uploads/<user>/<hex>.<ext>
- GET /api/files/{path} serves the file:
    * 200 with correct content-type
    * 206 with Content-Range for HTTP Range requests
    * 404 for missing files
- GET of DEFAULT_AVATAR_URL path (postmeplex/branding/default_avatar.png) returns 200
- Posting a text+image uses the new /api/files URL
"""
import io
import os
import struct
import uuid
import zlib

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")


# ------- helpers -------
def _png_bytes(w: int = 8, h: int = 8) -> bytes:
    """Build a tiny valid PNG without Pillow."""
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = b""
    for _ in range(h):
        raw += b"\x00" + (b"\xff\x00\x80") * w  # filter byte + pixels
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def _register_user():
    """Register a fresh test_* user (auto-purged on backend restart)."""
    tag = uuid.uuid4().hex[:8]
    body = {
        "email": f"test_stor_{tag}@example.com",
        "username": f"test_stor_{tag}",
        "password": "Test123!Storage",
        "pin": "4321",
        "display_name": f"Test Storage {tag}",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no access_token in register response: {data}"
    return token, data.get("user") or {}


# ------- fixtures -------
import pytest  # noqa: E402


@pytest.fixture(scope="module")
def user_token():
    token, _ = _register_user()
    return token


@pytest.fixture(scope="module")
def auth_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="module")
def uploaded_png(auth_headers):
    """Upload once; reuse across tests."""
    png = _png_bytes()
    files = {"file": ("probe.png", png, "image/png")}
    r = requests.post(f"{BASE_URL}/api/upload", headers=auth_headers, files=files, timeout=60)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    data = r.json()
    return png, data


# ========= Upload endpoint =========
class TestUpload:
    def test_upload_requires_auth(self):
        png = _png_bytes()
        files = {"file": ("probe.png", png, "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload", files=files, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_upload_png_returns_expected_shape(self, uploaded_png):
        png, data = uploaded_png
        for key in ("url", "secure_url", "path", "bytes", "content_type"):
            assert key in data, f"missing key {key} in response: {data}"
        assert data["bytes"] == len(png)
        assert data["content_type"] == "image/png"
        assert data["url"] == data["secure_url"]
        # Path lives under postmeplex/uploads/<user_id>/
        assert data["path"].startswith("postmeplex/uploads/"), f"unexpected path: {data['path']}"
        # URL points to our backend /api/files, NOT cloudinary
        assert "/api/files/postmeplex/uploads/" in data["url"], f"url not routed via /api/files: {data['url']}"
        assert "res.cloudinary.com" not in data["url"]

    def test_upload_empty_file_rejected(self, auth_headers):
        files = {"file": ("empty.png", b"", "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload", headers=auth_headers, files=files, timeout=30)
        assert r.status_code == 400, f"expected 400 for empty file, got {r.status_code}: {r.text}"


# ========= File serving =========
class TestFileServe:
    def test_fetch_full_file_200(self, uploaded_png):
        png, data = uploaded_png
        r = requests.get(data["url"], timeout=30)
        assert r.status_code == 200, f"GET file failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("image/png"), r.headers.get("content-type")
        # Content should match (full-fetch)
        assert r.content == png or r.content.startswith(png[:16]), "returned bytes differ from uploaded"
        assert r.headers.get("accept-ranges", "").lower() == "bytes"

    def test_fetch_range_206(self, uploaded_png):
        _, data = uploaded_png
        total = data["bytes"]
        end = min(total - 1, 7)
        r = requests.get(data["url"], headers={"Range": f"bytes=0-{end}"}, timeout=30)
        assert r.status_code == 206, f"expected 206, got {r.status_code}: {r.headers}"
        cr = r.headers.get("content-range") or r.headers.get("Content-Range")
        assert cr, f"missing Content-Range header: {dict(r.headers)}"
        assert cr.startswith("bytes 0-"), cr
        assert len(r.content) == end + 1, f"range length mismatch: {len(r.content)} vs {end+1}"

    def test_missing_file_404(self):
        missing = f"{BASE_URL}/api/files/postmeplex/uploads/does-not-exist/{uuid.uuid4().hex}.png"
        r = requests.get(missing, timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"


# ========= Default avatar (branding) =========
class TestDefaultAvatar:
    def test_default_avatar_served(self):
        url = f"{BASE_URL}/api/files/postmeplex/branding/default_avatar.png"
        r = requests.get(url, timeout=30)
        assert r.status_code == 200, f"default avatar not reachable: {r.status_code} {r.text[:200]}"
        ct = r.headers.get("content-type", "")
        assert "image" in ct, f"content-type not image/*: {ct}"
        assert len(r.content) > 100, "default avatar body too small"


# ========= Create post with new storage URL =========
class TestPostWithUploadedImage:
    def test_create_post_with_uploaded_image(self, auth_headers, uploaded_png):
        _, up = uploaded_png
        payload = {
            "caption": "test_ storage migration smoke",
            "image_url": up["secure_url"],
            "image_urls": [up["secure_url"]],
        }
        r = requests.post(
            f"{BASE_URL}/api/posts",
            json=payload,
            headers={**auth_headers, "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code in (200, 201), f"create post failed: {r.status_code} {r.text}"
        created = r.json()
        img = created.get("image_url") or (created.get("image_urls") or [None])[0]
        assert img, f"created post has no image_url: {created}"
        assert "/api/files/postmeplex/uploads/" in img, f"post image_url not from new storage: {img}"
        assert "res.cloudinary.com" not in img
        # GET the file again to double-check end-to-end
        rr = requests.get(img, timeout=30)
        assert rr.status_code == 200, f"re-fetch failed: {rr.status_code}"
