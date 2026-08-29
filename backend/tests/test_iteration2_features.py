"""Iteration 2 tests: super-admin, /api/search, conversations/messages."""
import uuid
import pytest
from conftest import has_objectid

SEMI_EMAIL = "semidiepie@gmail.com"
SEMI_PW = "Semi123!"


# ---------- Auth: super-admin ----------
class TestSuperAdminLogin:
    def test_semidiepie_login_returns_is_super_admin_true(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"email": SEMI_EMAIL, "password": SEMI_PW})
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert user["username"] == "semidiepie"
        # CRITICAL: frontend gates the "Verify accounts" menu on this flag
        assert user.get("is_super_admin") is True, (
            f"is_super_admin missing/false in login payload: {user}"
        )
        assert not has_objectid(r.json())

    def test_alex_is_not_super_admin(self, api_client, base_url, alex_user):
        # is_super_admin must default to False for normal users
        assert alex_user.get("is_super_admin", False) is False


@pytest.fixture(scope="session")
def semi_token(api_client, base_url):
    r = api_client.post(f"{base_url}/api/auth/login",
                        json={"email": SEMI_EMAIL, "password": SEMI_PW})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------- /api/search ----------
class TestSearch:
    def test_search_empty_returns_empty_buckets(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/search", params={"q": ""})
        assert r.status_code == 200
        body = r.json()
        assert body == {"users": [], "tags": [], "posts": []}

    def test_search_users_by_username(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/search", params={"q": "alex"})
        assert r.status_code == 200
        body = r.json()
        assert any(u["username"] == "alexgg" for u in body["users"])
        assert not has_objectid(body)

    def test_search_tag_substring(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/search", params={"q": "valor"})
        assert r.status_code == 200
        body = r.json()
        # at least one tag matching 'valor*' (e.g. 'valorant')
        assert any("valor" in (t["tag"] or "").lower() for t in body["tags"]), body["tags"]

    def test_search_posts_caption_substring(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/search", params={"q": "ranked"})
        assert r.status_code == 200
        posts = r.json()["posts"]
        assert len(posts) >= 1
        assert any("ranked" in (p.get("caption") or "").lower() for p in posts)


# ---------- /api/admin/users & verify ----------
class TestAdminVerify:
    def test_admin_users_as_super_admin(self, api_client, base_url, semi_token):
        r = api_client.get(f"{base_url}/api/admin/users", params={"q": "maria"},
                           headers={"Authorization": f"Bearer {semi_token}"})
        assert r.status_code == 200, r.text
        users = r.json()
        assert any(u["username"] == "mariaplays" for u in users)
        assert not has_objectid(users)

    def test_admin_users_forbidden_for_non_admin(self, api_client, base_url, alex_token):
        r = api_client.get(f"{base_url}/api/admin/users", params={"q": "maria"},
                           headers={"Authorization": f"Bearer {alex_token}"})
        assert r.status_code == 403

    def test_toggle_verify_as_super_admin(self, api_client, base_url, semi_token, maria_user):
        uid = maria_user["id"]
        # capture initial state
        before = api_client.get(f"{base_url}/api/users/{uid}").json()["is_verified"]
        r1 = api_client.post(f"{base_url}/api/admin/users/{uid}/verify",
                             headers={"Authorization": f"Bearer {semi_token}"})
        assert r1.status_code == 200
        assert r1.json()["is_verified"] is (not before)
        # verify persisted
        after = api_client.get(f"{base_url}/api/users/{uid}").json()["is_verified"]
        assert after is (not before)
        # toggle back to restore state
        r2 = api_client.post(f"{base_url}/api/admin/users/{uid}/verify",
                             headers={"Authorization": f"Bearer {semi_token}"})
        assert r2.status_code == 200
        assert r2.json()["is_verified"] is before

    def test_verify_forbidden_for_non_admin(self, api_client, base_url, alex_token, maria_user):
        r = api_client.post(f"{base_url}/api/admin/users/{maria_user['id']}/verify",
                            headers={"Authorization": f"Bearer {alex_token}"})
        assert r.status_code == 403


# ---------- Conversations / Messages ----------
class TestConversations:
    def test_list_conversations(self, api_client, base_url, alex_token):
        r = api_client.get(f"{base_url}/api/conversations",
                           headers={"Authorization": f"Bearer {alex_token}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert not has_objectid(r.json())

    def test_create_1to1_is_deduplicated(self, api_client, base_url, alex_token, maria_user):
        h = {"Authorization": f"Bearer {alex_token}"}
        r1 = api_client.post(f"{base_url}/api/conversations",
                             json={"member_ids": [maria_user["id"]]}, headers=h)
        assert r1.status_code == 200, r1.text
        c1 = r1.json()
        assert c1["is_group"] is False
        # second call should return SAME id
        r2 = api_client.post(f"{base_url}/api/conversations",
                             json={"member_ids": [maria_user["id"]]}, headers=h)
        assert r2.status_code == 200
        assert r2.json()["id"] == c1["id"], "1:1 conversation was not deduplicated"
        assert not has_objectid(c1)

    def test_create_group_with_name(self, api_client, base_url, alex_token, maria_user):
        # find a third user (kai)
        login_kai = api_client.post(f"{base_url}/api/auth/login",
                                    json={"email": "kai@postmeplex.com", "password": "Test123!"})
        kai_token = login_kai.json()["access_token"]
        kai = api_client.get(f"{base_url}/api/auth/me",
                             headers={"Authorization": f"Bearer {kai_token}"}).json()
        h = {"Authorization": f"Bearer {alex_token}"}
        name = f"TEST_Squad_{uuid.uuid4().hex[:6]}"
        r = api_client.post(f"{base_url}/api/conversations",
                            json={"member_ids": [maria_user["id"], kai["id"]],
                                  "name": name}, headers=h)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["is_group"] is True
        assert c["title"] == name

    def test_messages_membership_required(self, api_client, base_url, alex_token, maria_user, semi_token):
        # alex creates 1:1 with maria
        h = {"Authorization": f"Bearer {alex_token}"}
        c = api_client.post(f"{base_url}/api/conversations",
                            json={"member_ids": [maria_user["id"]]}, headers=h).json()
        # semi (not a member) should get 404
        r = api_client.get(f"{base_url}/api/conversations/{c['id']}/messages",
                           headers={"Authorization": f"Bearer {semi_token}"})
        assert r.status_code == 404

    def test_send_and_list_messages_clears_unread(self, api_client, base_url,
                                                   alex_token, maria_token, maria_user):
        h_alex = {"Authorization": f"Bearer {alex_token}"}
        h_maria = {"Authorization": f"Bearer {maria_token}"}
        c = api_client.post(f"{base_url}/api/conversations",
                            json={"member_ids": [maria_user["id"]]}, headers=h_alex).json()
        cid = c["id"]
        text = f"TEST_hello_{uuid.uuid4().hex[:6]}"
        send = api_client.post(f"{base_url}/api/conversations/{cid}/messages",
                               json={"text": text}, headers=h_alex)
        assert send.status_code == 200, send.text
        msg = send.json()
        assert msg["text"] == text
        assert msg["sender_id"]
        assert not has_objectid(msg)
        # maria sees unread > 0 BEFORE fetching messages
        convs = api_client.get(f"{base_url}/api/conversations", headers=h_maria).json()
        target = next((x for x in convs if x["id"] == cid), None)
        assert target is not None
        assert target["unread"] >= 1, f"unread not incremented for maria: {target}"
        # maria fetches messages -> unread clears
        msgs = api_client.get(f"{base_url}/api/conversations/{cid}/messages",
                              headers=h_maria)
        assert msgs.status_code == 200
        assert any(m["text"] == text for m in msgs.json())
        assert not has_objectid(msgs.json())
        convs2 = api_client.get(f"{base_url}/api/conversations", headers=h_maria).json()
        target2 = next((x for x in convs2 if x["id"] == cid), None)
        assert target2["unread"] == 0
        # last_message reflects what we sent
        assert target2["last_message"]["text"] == text
