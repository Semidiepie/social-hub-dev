"""Cover-image regression tests for /api/games and /api/admin/games/{id}.
Keep LLM-free: do NOT call /admin/games/studio/* or /admin/games/ai-*.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")
FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PIN = "7455"
MATCH_SLUG = "postmeplex-match"
MATCH_ID = "968a8612-dbd5-4e82-8cdf-fded74744f58"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login-pin", json={"identifier": FOUNDER_EMAIL, "pin": FOUNDER_PIN}, timeout=20)
    assert r.status_code == 200, f"PIN login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, "No access_token in PIN login response"
    return tok


@pytest.fixture(scope="module")
def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Public /api/games surface ----
class TestPublicGamesListIncludesCover:
    def test_games_list_returns_cover_image_field(self):
        r = requests.get(f"{BASE_URL}/api/games", timeout=20)
        assert r.status_code == 200, r.text
        games = r.json()
        assert isinstance(games, list) and len(games) > 0
        # Every game dict must expose cover_image key (may be None)
        for g in games:
            assert "cover_image" in g, f"cover_image missing on game {g.get('slug')}"
        match = next((g for g in games if g.get("slug") == MATCH_SLUG), None)
        assert match is not None, "postmeplex-match game not found in /api/games"
        assert isinstance(match.get("cover_image"), str) and match["cover_image"].startswith("https://"), \
            f"postmeplex-match cover_image should already be an https URL, got: {match.get('cover_image')!r}"

    def test_single_game_by_slug_has_cover(self):
        r = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g.get("slug") == MATCH_SLUG
        assert isinstance(g.get("cover_image"), str) and g["cover_image"].startswith("https://")


# ---- Admin cover_image PUT contract ----
class TestAdminCoverImageUpdate:
    def test_put_cover_image_requires_auth(self):
        r = requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": "https://example.com/x.png"}, timeout=20)
        assert r.status_code in (401, 403)

    def test_put_https_cover_persists(self, auth_h):
        # Fetch current cover to restore after
        pre = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20).json()
        original = pre.get("cover_image")

        new_url = "https://res.cloudinary.com/dpnrol54k/image/upload/v1790317297/postmeplex_icon_v2.png"
        try:
            r = requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": new_url}, headers=auth_h, timeout=20)
            assert r.status_code == 200, r.text
            got = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20).json()
            assert got.get("cover_image") == new_url
        finally:
            # restore
            if original:
                requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": original}, headers=auth_h, timeout=20)

    def test_put_empty_string_clears_cover(self, auth_h):
        pre = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20).json()
        original = pre.get("cover_image")
        try:
            r = requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": ""}, headers=auth_h, timeout=20)
            assert r.status_code == 200, r.text
            got = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20).json()
            assert got.get("cover_image") in (None, ""), f"Expected None after clear, got {got.get('cover_image')!r}"
        finally:
            if original:
                requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": original}, headers=auth_h, timeout=20)

    def test_put_non_https_is_rejected_or_cleared(self, auth_h):
        pre = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20).json()
        original = pre.get("cover_image")
        try:
            r = requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": "http://insecure.example.com/x.png"}, headers=auth_h, timeout=20)
            # Either 2xx with cleared cover (clean function returned None) or validation error
            if r.status_code == 200:
                got = requests.get(f"{BASE_URL}/api/games/{MATCH_SLUG}", timeout=20).json()
                assert got.get("cover_image") in (None, ""), f"Non-https should clear cover, got {got.get('cover_image')!r}"
            else:
                assert r.status_code in (400, 422), r.text
        finally:
            if original:
                requests.put(f"{BASE_URL}/api/admin/games/{MATCH_ID}", json={"cover_image": original}, headers=auth_h, timeout=20)
