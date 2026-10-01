"""
Iteration 43 — Admin curated-account MANAGE endpoints.

Covers:
  * GET  /api/admin/curated-accounts
  * PATCH /api/admin/curated-accounts/{user_id}
  * POST /api/admin/accounts/{user_id}/sage-reels
  * PATCH /api/admin/reels/{post_id}
  * DELETE /api/admin/reels/{post_id}
Each with super-admin gating + 404 for missing resources.
"""
import os
import secrets
import time

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://social-hub-dev-4.preview.emergentagent.com").rstrip("/")

FOUNDER_EMAIL = "semidiepie@gmail.com"
FOUNDER_PW = "Semi123!"


# -------------- Auth helpers --------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": FOUNDER_EMAIL, "password": FOUNDER_PW}, timeout=30)
    assert r.status_code == 200, f"founder login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def normal_token():
    tag = secrets.token_hex(3)
    body = {
        "email": f"test_{tag}@mail.com",
        "password": "Passw0rd!",
        "username": f"test_{tag}",
        "display_name": f"Test {tag}",
        "pin": "1234",
    }
    r = requests.post(f"{BASE}/api/auth/register", json=body, timeout=30)
    assert r.status_code in (200, 201), f"register failed {r.status_code} {r.text}"
    return r.json()["access_token"]


# -------------- Shared curated-account fixture --------------
@pytest.fixture(scope="module")
def curated_account(admin_headers):
    """Create a curated account with 2 initial reels for tests."""
    body = {
        "display_name": f"TEST_Mgr_{secrets.token_hex(2)}",
        "category": "nature",
        "populate_count": 2,
    }
    r = requests.post(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, json=body, timeout=60)
    assert r.status_code == 200, f"create curated {r.status_code} {r.text}"
    j = r.json()
    uid = j["user"]["id"]
    yield j["user"]
    # cleanup: delete reels then account by using direct admin reel delete
    # (profile remains in DB; purge is agent's cleanup step)
    reels = requests.get(f"{BASE}/api/users/{uid}/reels", timeout=30).json()
    for p in reels or []:
        requests.delete(f"{BASE}/api/admin/reels/{p['id']}", headers=admin_headers, timeout=30)


# =========================================================
# 1) GET /api/admin/curated-accounts
# =========================================================
class TestListCurated:
    def test_list_requires_super_admin(self, normal_token):
        r = requests.get(f"{BASE}/api/admin/curated-accounts", headers={"Authorization": f"Bearer {normal_token}"}, timeout=30)
        assert r.status_code == 403

    def test_list_unauthorized(self):
        r = requests.get(f"{BASE}/api/admin/curated-accounts", timeout=30)
        assert r.status_code in (401, 403)

    def test_list_includes_fixture_account(self, admin_headers, curated_account):
        r = requests.get(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        hit = next((a for a in rows if a["id"] == curated_account["id"]), None)
        assert hit is not None, "fixture account missing in list"
        for k in ("id", "username", "display_name", "avatar_url", "category", "posts_count"):
            assert k in hit, f"missing field {k}"


# =========================================================
# 2) PATCH /api/admin/curated-accounts/{user_id}
# =========================================================
class TestEditCurated:
    def test_edit_requires_super_admin(self, normal_token, curated_account):
        r = requests.patch(
            f"{BASE}/api/admin/curated-accounts/{curated_account['id']}",
            headers={"Authorization": f"Bearer {normal_token}", "Content-Type": "application/json"},
            json={"display_name": "x"}, timeout=30,
        )
        assert r.status_code == 403

    def test_edit_404_missing(self, admin_headers):
        r = requests.patch(f"{BASE}/api/admin/curated-accounts/does-not-exist", headers=admin_headers, json={"display_name": "x"}, timeout=30)
        assert r.status_code == 404

    def test_edit_updates_fields_and_persists(self, admin_headers, curated_account):
        new_name = f"TEST_Edited_{secrets.token_hex(2)}"
        new_cat = "wildlife"
        r = requests.patch(
            f"{BASE}/api/admin/curated-accounts/{curated_account['id']}",
            headers=admin_headers,
            json={"display_name": new_name, "category": new_cat},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["display_name"] == new_name
        assert body["category"] == new_cat
        # verify persistence via list
        rows = requests.get(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, timeout=30).json()
        hit = next((a for a in rows if a["id"] == curated_account["id"]), None)
        assert hit and hit["display_name"] == new_name and hit["category"] == new_cat


# =========================================================
# 3) POST /api/admin/accounts/{user_id}/sage-reels
# =========================================================
class TestSageReels:
    def test_sage_requires_super_admin(self, normal_token, curated_account):
        r = requests.post(
            f"{BASE}/api/admin/accounts/{curated_account['id']}/sage-reels",
            headers={"Authorization": f"Bearer {normal_token}", "Content-Type": "application/json"},
            json={"count": 1}, timeout=30,
        )
        assert r.status_code == 403

    def test_sage_404_missing(self, admin_headers):
        r = requests.post(f"{BASE}/api/admin/accounts/missing-id/sage-reels", headers=admin_headers, json={"count": 1}, timeout=30)
        assert r.status_code == 404

    def test_sage_adds_reels_and_increments_posts_count(self, admin_headers, curated_account):
        before_rows = requests.get(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, timeout=30).json()
        before = next((a for a in before_rows if a["id"] == curated_account["id"]), {}).get("posts_count", 0)

        r = requests.post(
            f"{BASE}/api/admin/accounts/{curated_account['id']}/sage-reels",
            headers=admin_headers, json={"count": 3, "query": "forest"}, timeout=60,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["created"] >= 1
        assert j["source"] in ("pixabay", "library")

        after_rows = requests.get(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, timeout=30).json()
        after = next((a for a in after_rows if a["id"] == curated_account["id"]), {}).get("posts_count", 0)
        assert after >= before + j["created"], f"posts_count did not increase: {before} -> {after}"


# =========================================================
# 4) PATCH /api/admin/reels/{post_id}
# =========================================================
class TestAdminEditReel:
    def test_edit_reel_requires_super_admin(self, normal_token, admin_headers, curated_account):
        reels = requests.get(f"{BASE}/api/users/{curated_account['id']}/reels", timeout=30).json()
        assert reels, "fixture account should have reels"
        pid = reels[0]["id"]
        r = requests.patch(
            f"{BASE}/api/admin/reels/{pid}",
            headers={"Authorization": f"Bearer {normal_token}", "Content-Type": "application/json"},
            json={"caption": "nope"}, timeout=30,
        )
        assert r.status_code == 403

    def test_edit_reel_404(self, admin_headers):
        r = requests.patch(f"{BASE}/api/admin/reels/missing-post", headers=admin_headers, json={"caption": "x"}, timeout=30)
        assert r.status_code == 404

    def test_edit_reel_updates_caption(self, admin_headers, curated_account):
        reels = requests.get(f"{BASE}/api/users/{curated_account['id']}/reels", timeout=30).json()
        assert reels
        pid = reels[0]["id"]
        new_caption = f"TEST_cap_{secrets.token_hex(2)}"
        r = requests.patch(f"{BASE}/api/admin/reels/{pid}", headers=admin_headers, json={"caption": new_caption}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("caption") == new_caption
        # verify persistence via author reels endpoint
        reels2 = requests.get(f"{BASE}/api/users/{curated_account['id']}/reels", timeout=30).json()
        hit = next((p for p in reels2 if p["id"] == pid), None)
        assert hit and hit["caption"] == new_caption


# =========================================================
# 5) DELETE /api/admin/reels/{post_id}
# =========================================================
class TestAdminDeleteReel:
    def test_delete_reel_requires_super_admin(self, normal_token, admin_headers, curated_account):
        reels = requests.get(f"{BASE}/api/users/{curated_account['id']}/reels", timeout=30).json()
        assert reels
        pid = reels[0]["id"]
        r = requests.delete(
            f"{BASE}/api/admin/reels/{pid}",
            headers={"Authorization": f"Bearer {normal_token}"}, timeout=30,
        )
        assert r.status_code == 403

    def test_delete_reel_404(self, admin_headers):
        r = requests.delete(f"{BASE}/api/admin/reels/missing-post", headers=admin_headers, timeout=30)
        assert r.status_code == 404

    def test_delete_reel_decrements_posts_count(self, admin_headers, curated_account):
        reels = requests.get(f"{BASE}/api/users/{curated_account['id']}/reels", timeout=30).json()
        assert reels
        pid = reels[0]["id"]

        before_rows = requests.get(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, timeout=30).json()
        before = next((a for a in before_rows if a["id"] == curated_account["id"]), {}).get("posts_count", 0)

        r = requests.delete(f"{BASE}/api/admin/reels/{pid}", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "deleted"

        reels2 = requests.get(f"{BASE}/api/users/{curated_account['id']}/reels", timeout=30).json()
        assert all(p["id"] != pid for p in reels2), "reel still present after delete"

        after_rows = requests.get(f"{BASE}/api/admin/curated-accounts", headers=admin_headers, timeout=30).json()
        after = next((a for a in after_rows if a["id"] == curated_account["id"]), {}).get("posts_count", 0)
        assert after == before - 1, f"posts_count not decremented: {before} -> {after}"
