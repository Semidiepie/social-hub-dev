"""
Iteration 9 tests — verify:
  Bug 1: Cloudinary video URLs are rewritten to force H.264/mp4 (avc1),
         not HEVC (hvc1), via _cloudinary_compat_url in serialize_post.
  Bug 2: Text-only posts (no image_url, no thumbnail_url) round-trip
         correctly through /api/posts and /api/users/{id}/posts so the
         ProfileView JSX text-tile branch has valid data to render.

Also runs a small regression check that the transform is:
  - applied on /api/reels (unauth), /api/feed (auth), /api/users/{id}/posts (auth/unauth)
  - idempotent (no double-injection)
  - a no-op on non-Cloudinary URLs
"""
import os
import re
import requests
import pytest

def _resolve_base_url() -> str:
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip()
    if not url:
        # Fall back to frontend/.env — pytest doesn't auto-load it.
        try:
            with open("/app/frontend/.env", "r") as f:
                for line in f:
                    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        except FileNotFoundError:
            pass
    return url.rstrip("/")


BASE_URL = _resolve_base_url()
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set (env or frontend/.env)"

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PASSWORD = "Semi123!"

CLOUDINARY_MARKER = "res.cloudinary.com"
TRANSFORM_MARKER = "f_mp4,vc_h264"


# ============================================================
# Fixtures
# ============================================================
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def founder_token(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD})
    assert r.status_code == 200, f"founder login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def founder_id(s, founder_token):
    r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {founder_token}"})
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def auth_headers(founder_token):
    return {"Authorization": f"Bearer {founder_token}"}


# ============================================================
# Bug 1 — Cloudinary H.264 rewrite
# ============================================================
class TestCloudinaryH264Transform:
    def test_reels_endpoint_returns_transformed_cloudinary_urls(self, s):
        r = s.get(f"{BASE_URL}/api/reels")
        assert r.status_code == 200, r.text
        reels = r.json()
        assert isinstance(reels, list) and len(reels) >= 1, "expected >=1 seeded reel"

        cloudinary_reels = [reel for reel in reels if reel.get("video_url") and CLOUDINARY_MARKER in reel["video_url"]]
        assert cloudinary_reels, "no Cloudinary reels found to verify"

        for reel in cloudinary_reels:
            url = reel["video_url"]
            assert TRANSFORM_MARKER in url, f"reel {reel['id']} video_url missing H.264 transform: {url}"
            # transform must appear right after /video/upload/
            assert re.search(r"/video/upload/[^/]*f_mp4,vc_h264", url), \
                f"reel {reel['id']} transform not in correct slot: {url}"

    def test_transformed_url_serves_avc1_not_hvc1(self, s):
        r = s.get(f"{BASE_URL}/api/reels")
        assert r.status_code == 200
        cloudinary_reels = [reel for reel in r.json() if reel.get("video_url") and CLOUDINARY_MARKER in reel["video_url"]]
        assert cloudinary_reels, "need at least one Cloudinary reel"

        for reel in cloudinary_reels:
            url = reel["video_url"]
            head = requests.head(url, allow_redirects=True, timeout=15)
            assert head.status_code == 200, f"HEAD {url} → {head.status_code}"
            ctype = head.headers.get("content-type", "").lower()
            assert "video/mp4" in ctype, f"unexpected content-type: {ctype}"
            assert "avc1" in ctype, f"expected avc1 codec, got: {ctype} for {url}"
            assert "hvc1" not in ctype, f"HEVC still leaking through: {ctype} for {url}"

    def test_feed_applies_transform_to_cloudinary_videos(self, s, auth_headers):
        r = s.get(f"{BASE_URL}/api/feed", headers=auth_headers)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)

        for item in items:
            vu = item.get("video_url")
            if vu and CLOUDINARY_MARKER in vu:
                assert TRANSFORM_MARKER in vu, f"/api/feed leaked untransformed URL: {vu}"

    def test_user_posts_endpoint_applies_transform(self, s, auth_headers, founder_id):
        r = s.get(f"{BASE_URL}/api/users/{founder_id}/posts", headers=auth_headers)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        for item in items:
            vu = item.get("video_url")
            if vu and CLOUDINARY_MARKER in vu:
                assert TRANSFORM_MARKER in vu, f"/api/users/{{id}}/posts leaked untransformed URL: {vu}"

    def test_transform_is_idempotent_on_repeated_requests(self, s):
        """Calling /api/reels twice must yield identical (already-transformed) URLs — no double injection."""
        r1 = s.get(f"{BASE_URL}/api/reels").json()
        r2 = s.get(f"{BASE_URL}/api/reels").json()
        urls1 = sorted(reel.get("video_url") or "" for reel in r1)
        urls2 = sorted(reel.get("video_url") or "" for reel in r2)
        assert urls1 == urls2, "reel URLs are unstable across requests"
        for u in urls1:
            if u and CLOUDINARY_MARKER in u:
                # count occurrences of the marker — must be exactly one
                assert u.count("f_mp4") == 1, f"double-injection of f_mp4: {u}"
                assert u.count("vc_h264") == 1, f"double-injection of vc_h264: {u}"


# ============================================================
# Bug 1 (unit-ish) — non-Cloudinary URL is left untouched
# via the API surface: create a reel with an external URL and read it back.
# ============================================================
class TestNonCloudinaryUrlUntouched:
    """Server-only helper is not directly exposed; import it in-process.

    We import from /app/backend/server.py directly since tests run on the
    same host filesystem. This gives us pure-function coverage without
    needing to POST a fake external video URL (which the schema may reject).
    """
    def test_helper_leaves_non_cloudinary_url_untouched(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _cloudinary_compat_url  # type: ignore

        assert _cloudinary_compat_url(None) is None
        assert _cloudinary_compat_url("") == ""
        assert _cloudinary_compat_url("https://example.com/video.mp4") == "https://example.com/video.mp4"
        assert _cloudinary_compat_url("https://cdn.other.com/video/upload/x.mp4") == "https://cdn.other.com/video/upload/x.mp4"

    def test_helper_is_idempotent(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _cloudinary_compat_url  # type: ignore

        original = "https://res.cloudinary.com/demo/video/upload/v123/sample.mp4"
        once = _cloudinary_compat_url(original)
        twice = _cloudinary_compat_url(once)
        assert once == twice, "helper is not idempotent"
        assert once.count("f_mp4") == 1
        assert once.count("vc_h264") == 1
        assert "f_mp4,vc_h264,q_auto" in once

    def test_helper_transforms_expected_slot(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _cloudinary_compat_url  # type: ignore

        out = _cloudinary_compat_url("https://res.cloudinary.com/demo/video/upload/v1/x.mp4")
        assert out == "https://res.cloudinary.com/demo/video/upload/f_mp4,vc_h264,q_auto/v1/x.mp4"


# ============================================================
# Bug 2 — text-only post round-trip
# ============================================================
class TestTextOnlyPostContract:
    """ProfileView renders a text tile iff item.image_url and
    item.thumbnail_url are both falsy. Verify a caption-only post
    persists that shape all the way through /api/users/{id}/posts."""

    def test_create_text_only_post_returns_null_image_url(self, s, auth_headers):
        payload = {"caption": "TEST_ text-only post iteration9", "image_url": None}
        r = s.post(f"{BASE_URL}/api/posts", json=payload, headers=auth_headers)
        assert r.status_code == 200, f"POST /api/posts → {r.status_code} {r.text}"
        body = r.json()
        assert body.get("type") == "post"
        assert body.get("caption") == payload["caption"]
        assert body.get("image_url") in (None, ""), f"expected null image_url, got {body.get('image_url')!r}"
        assert body.get("thumbnail_url") in (None, ""), f"expected null thumbnail_url, got {body.get('thumbnail_url')!r}"
        assert body.get("video_url") in (None, ""), f"expected null video_url, got {body.get('video_url')!r}"
        # stash for the next test
        TestTextOnlyPostContract._post_id = body["id"]

    def test_text_only_post_appears_in_profile_posts(self, s, auth_headers, founder_id):
        post_id = getattr(TestTextOnlyPostContract, "_post_id", None)
        if not post_id:
            pytest.skip("prior create step did not persist post id")

        r = s.get(f"{BASE_URL}/api/users/{founder_id}/posts", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        match = next((p for p in items if p["id"] == post_id), None)
        assert match is not None, "created text-only post not present in profile feed"
        # ProfileView branching contract
        assert not match.get("image_url"), f"image_url must be falsy for text-tile branch: {match.get('image_url')!r}"
        assert not match.get("thumbnail_url"), f"thumbnail_url must be falsy for text-tile branch: {match.get('thumbnail_url')!r}"
        assert match.get("caption"), "caption must be present so the text tile has something to render"

    def test_cleanup_text_only_post(self, s, auth_headers):
        post_id = getattr(TestTextOnlyPostContract, "_post_id", None)
        if not post_id:
            pytest.skip("no post to clean up")
        r = s.delete(f"{BASE_URL}/api/posts/{post_id}", headers=auth_headers)
        # 200 or 204 acceptable; also tolerate 404 in case a prior run cleaned up
        assert r.status_code in (200, 204, 404), f"cleanup failed: {r.status_code} {r.text}"
