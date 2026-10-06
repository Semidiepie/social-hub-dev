"""Iteration 44 — Tokens economy e2e tests (wallet, store, transfer, game rewards,
admin grant, cosmetics ownership gate, live gift WS). Public endpoints only."""
import asyncio
import json
import os
import random
import string
import time

import pytest
import requests
import websockets

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


def _rand(n=6):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def _register(prefix="tec_"):
    uname = f"{prefix}{_rand(8)}"
    pin = "".join(random.choices(string.digits, k=4))
    body = {
        "username": uname,
        "display_name": uname,
        "email": f"{uname}@example.com",
        "password": "Testpass1!",
        "pin": pin,
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=body, timeout=20)
    assert r.status_code == 200, f"register failed {r.status_code}: {r.text}"
    data = r.json()
    tok = data["access_token"]
    user = data["user"]
    return tok, user, body


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Wallet basics ----------
class TestWalletBasics:
    def test_welcome_balance_is_100(self):
        tok, _, _ = _register()
        r = requests.get(f"{BASE_URL}/api/wallet", headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["balance"] == 100
        assert w["daily_reward"] == 25
        assert w["can_claim_daily"] is True
        assert isinstance(w["transactions"], list)

    def test_daily_claim_grants_25_then_blocks(self):
        tok, _, _ = _register()
        r1 = requests.post(f"{BASE_URL}/api/wallet/daily", headers=_h(tok), timeout=15)
        assert r1.status_code == 200, r1.text
        d = r1.json()
        assert d["claimed"] == 25
        assert d["balance"] == 125
        # Second immediate claim should 429
        r2 = requests.post(f"{BASE_URL}/api/wallet/daily", headers=_h(tok), timeout=15)
        assert r2.status_code == 429, r2.text


# ---------- Store ----------
class TestStore:
    def test_store_lists_10_frames(self):
        tok, _, _ = _register()
        r = requests.get(f"{BASE_URL}/api/store/items", headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()
        assert len(s["items"]) == 10
        ids = {it["id"] for it in s["items"]}
        assert "violet" in ids
        for it in s["items"]:
            assert "price" in it
            assert "owned" in it
            assert it["owned"] is False
        assert s["balance"] == 100

    def test_buy_violet_deducts_and_marks_owned(self):
        tok, _, _ = _register()
        # Grant daily to afford violet (100 + 25 = 125 >= 120)
        requests.post(f"{BASE_URL}/api/wallet/daily", headers=_h(tok), timeout=15)
        r = requests.post(f"{BASE_URL}/api/store/buy", headers=_h(tok),
                          json={"item_id": "violet"}, timeout=15)
        assert r.status_code == 200, r.text
        pub = r.json()
        assert pub["tokens"] == 5  # 125 - 120
        assert "violet" in pub.get("owned_frames", [])
        # Buying again -> 400
        r2 = requests.post(f"{BASE_URL}/api/store/buy", headers=_h(tok),
                           json={"item_id": "violet"}, timeout=15)
        assert r2.status_code == 400

    def test_buy_insufficient_returns_402(self):
        tok, _, _ = _register()
        # Try to buy galaxy (500) with only 100 tokens
        r = requests.post(f"{BASE_URL}/api/store/buy", headers=_h(tok),
                          json={"item_id": "galaxy"}, timeout=15)
        assert r.status_code == 402, r.text

    def test_buy_unknown_item_404(self):
        tok, _, _ = _register()
        r = requests.post(f"{BASE_URL}/api/store/buy", headers=_h(tok),
                          json={"item_id": "nonexistent"}, timeout=15)
        assert r.status_code == 404


# ---------- Transfer ----------
class TestTransfer:
    def test_transfer_debits_sender_credits_recipient(self):
        tok_a, user_a, _ = _register()
        tok_b, user_b, body_b = _register()
        r = requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(tok_a),
                          json={"username": user_b["username"], "amount": 30, "note": "hey"},
                          timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["balance"] == 70
        assert d["sent"] == 30
        # Verify recipient balance
        rb = requests.get(f"{BASE_URL}/api/wallet", headers=_h(tok_b), timeout=15).json()
        assert rb["balance"] == 130
        # Check for notification
        notifs = requests.get(f"{BASE_URL}/api/notifications", headers=_h(tok_b), timeout=15)
        if notifs.status_code == 200:
            lst = notifs.json()
            if isinstance(lst, dict):
                lst = lst.get("items") or lst.get("notifications") or []
            found = any(n.get("type") == "tokens" for n in lst)
            assert found, "Recipient should have a 'tokens' notification"

    def test_self_transfer_rejected(self):
        tok, user, _ = _register()
        r = requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(tok),
                          json={"username": user["username"], "amount": 10, "note": ""},
                          timeout=15)
        assert r.status_code == 400

    def test_unknown_user_404(self):
        tok, _, _ = _register()
        r = requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(tok),
                          json={"username": "no_such_user_" + _rand(6), "amount": 10},
                          timeout=15)
        assert r.status_code == 404

    def test_overdraw_402(self):
        tok_a, _, _ = _register()
        tok_b, user_b, _ = _register()
        r = requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(tok_a),
                          json={"username": user_b["username"], "amount": 500},
                          timeout=15)
        assert r.status_code == 402


# ---------- Game rewards ----------
class TestGameRewards:
    def test_level_1_first_win_grants_tokens(self):
        tok, _, _ = _register()
        # Try the default seeded game slug first
        slug = "postmeplex-match"
        # fetch level 1 params for target
        lvl = requests.get(f"{BASE_URL}/api/games/{slug}/levels/1", headers=_h(tok), timeout=15)
        if lvl.status_code != 200:
            pytest.skip(f"game {slug} not available in this env")
        params = lvl.json()
        score = int(params["star3"]) + 10  # ensure 3 stars
        r = requests.post(f"{BASE_URL}/api/games/{slug}/levels/1/complete",
                          headers=_h(tok), json={"score": score}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tokens_earned"] > 0, f"expected reward, got {d}"
        assert d["stars"] >= 1
        # Wallet should reflect tokens_earned increase
        w = requests.get(f"{BASE_URL}/api/wallet", headers=_h(tok), timeout=15).json()
        assert w["balance"] == 100 + d["tokens_earned"]
        # Replay — zero reward
        r2 = requests.post(f"{BASE_URL}/api/games/{slug}/levels/1/complete",
                           headers=_h(tok), json={"score": score}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["tokens_earned"] == 0


# ---------- Admin grant ----------
class TestAdminGrant:
    def _login_founder(self):
        r = requests.post(f"{BASE_URL}/api/auth/login-pin",
                          json={"identifier": "semidiepie", "pin": "7455"}, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    def test_super_admin_can_grant(self):
        tok_a = self._login_founder()
        tok_u, user_u, _ = _register()
        r = requests.post(f"{BASE_URL}/api/admin/users/{user_u['id']}/tokens",
                          headers=_h(tok_a), json={"amount": 500, "note": "test grant"},
                          timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["tokens"] == 600  # 100 + 500

    def test_non_admin_forbidden(self):
        tok_a, _, _ = _register()
        tok_b, user_b, _ = _register()
        r = requests.post(f"{BASE_URL}/api/admin/users/{user_b['id']}/tokens",
                          headers=_h(tok_a), json={"amount": 50}, timeout=15)
        assert r.status_code == 403


# ---------- Cosmetics ownership gate ----------
class TestCosmeticsGate:
    def test_cannot_equip_unowned_premium(self):
        tok, _, _ = _register()
        r = requests.post(f"{BASE_URL}/api/market/cosmetics", headers=_h(tok),
                          json={"equipped_frame": "violet"}, timeout=15)
        assert r.status_code == 403, r.text

    def test_can_equip_free_frame(self):
        tok, _, _ = _register()
        for free_id in ("gold", "hearts", "emerald"):
            r = requests.post(f"{BASE_URL}/api/market/cosmetics", headers=_h(tok),
                              json={"equipped_frame": free_id}, timeout=15)
            # Note: 400 if the free frame id doesn't exist in this env; 200 is pass
            assert r.status_code in (200, 400), f"{free_id}: {r.status_code} {r.text}"
            if r.status_code == 200:
                return
        pytest.skip("no free frame ids matched this env")

    def test_can_equip_owned_premium_after_buy(self):
        tok, _, _ = _register()
        # founder grants us enough tokens via admin
        tok_a = _login_founder()
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=15).json()
        requests.post(f"{BASE_URL}/api/admin/users/{me['id']}/tokens",
                      headers=_h(tok_a), json={"amount": 500}, timeout=15)
        buy = requests.post(f"{BASE_URL}/api/store/buy", headers=_h(tok),
                            json={"item_id": "violet"}, timeout=15)
        assert buy.status_code == 200, buy.text
        eq = requests.post(f"{BASE_URL}/api/market/cosmetics", headers=_h(tok),
                           json={"equipped_frame": "violet"}, timeout=15)
        assert eq.status_code == 200, eq.text
        assert eq.json().get("equipped_frame") == "violet"


def _login_founder():
    r = requests.post(f"{BASE_URL}/api/auth/login-pin",
                      json={"identifier": "semidiepie", "pin": "7455"}, timeout=15)
    assert r.status_code == 200
    return r.json()["access_token"]


# ---------- Live gift WebSocket ----------
class TestLiveGiftWS:
    def test_gift_deducts_sender_and_echoes_wallet(self):
        async def _run():
            # Broadcaster
            tok_b, user_b, _ = _register()
            # Create a live stream
            r = requests.post(f"{BASE_URL}/api/live", headers=_h(tok_b),
                              json={"title": "test", "mode": "webrtc"}, timeout=15)
            assert r.status_code == 200, r.text
            stream_id = r.json()["id"]
            try:
                # Sender
                tok_s, user_s, _ = _register()
                url_s = f"{WS_BASE}/api/live/{stream_id}/ws?token={tok_s}"
                async with websockets.connect(url_s) as ws:
                    # consume init / viewers / system frames
                    for _ in range(5):
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                        if msg.get("type") == "init":
                            break
                    # Send a 'rose' (1 coin)
                    await ws.send(json.dumps({"type": "gift", "gift_id": "rose"}))
                    wallet_msg = None
                    for _ in range(10):
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                        if msg.get("type") == "wallet":
                            wallet_msg = msg
                            break
                    assert wallet_msg is not None, "No wallet frame received"
                    assert wallet_msg["balance"] == 99  # 100 - 1
                # Broadcaster credited
                wb = requests.get(f"{BASE_URL}/api/wallet", headers=_h(tok_b), timeout=15).json()
                assert wb["balance"] == 101  # 100 + 1
            finally:
                requests.post(f"{BASE_URL}/api/live/{stream_id}/stop",
                              headers=_h(tok_b), timeout=15)

        asyncio.run(_run())

    def test_insufficient_tokens_error(self):
        async def _run():
            tok_b, _, _ = _register()
            r = requests.post(f"{BASE_URL}/api/live", headers=_h(tok_b),
                              json={"title": "test", "mode": "webrtc"}, timeout=15)
            stream_id = r.json()["id"]
            try:
                tok_s, _, _ = _register()
                # drain sender's tokens by transfer to the broadcaster
                me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok_s), timeout=15).json()
                requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(tok_s),
                              json={"username": me["username"], "amount": 100},
                              timeout=15)  # self-transfer fails; try different approach
                # Use founder to zero out? Simpler: buy nothing, spend via transfer to broadcaster
                # transfer 99 tokens so only 1 remains then send a 5-coin gift (star)
                tok_x, user_x, _ = _register()
                requests.post(f"{BASE_URL}/api/wallet/transfer", headers=_h(tok_s),
                              json={"username": user_x["username"], "amount": 99},
                              timeout=15)
                # Now sender has 1 token, send a 5-coin star
                url_s = f"{WS_BASE}/api/live/{stream_id}/ws?token={tok_s}"
                async with websockets.connect(url_s) as ws:
                    for _ in range(5):
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                        if msg.get("type") == "init":
                            break
                    await ws.send(json.dumps({"type": "gift", "gift_id": "star"}))
                    err_msg = None
                    for _ in range(10):
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                        if msg.get("type") == "error" and msg.get("detail") == "insufficient_tokens":
                            err_msg = msg
                            break
                        if msg.get("type") == "wallet":
                            break
                    assert err_msg is not None, "Expected insufficient_tokens error"
            finally:
                requests.post(f"{BASE_URL}/api/live/{stream_id}/stop",
                              headers=_h(tok_b), timeout=15)

        asyncio.run(_run())
