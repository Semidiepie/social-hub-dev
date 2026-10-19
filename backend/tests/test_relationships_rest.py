"""REST-level verification of PostMePlex AI character relationships + explicit relay.

Covers:
  1. Create 2 characters (Hope, Juliette) with cross-linked `relationships` and
     verify they round-trip via GET /api/ai-characters AND the single-character
     object returned on PUT.
  2. Explicit relay: POST /api/ai-characters/{hopeId}/send with
     "tell your mom Juliette I passed my math test" schedules a background
     inter-character exchange — poll `ai_char_convos` for a few seconds and
     verify messages between the two character ids appear.
  3. Shared knowledge: Juliette has those messages in her context query (
     from_id or to_id == juliette_id).

Cleans up both characters, the convo, and messages afterwards.
"""
import os
import sys
import time
import uuid

import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

# Load backend env for direct DB access (cleanup + convo assertions).
load_dotenv("/app/backend/.env")

# BASE_URL
if "REACT_APP_BACKEND_URL" not in os.environ:
    with open("/app/frontend/.env") as _f:
        for _line in _f:
            if _line.startswith("REACT_APP_BACKEND_URL="):
                os.environ["REACT_APP_BACKEND_URL"] = _line.split("=", 1)[1].strip()
                break
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PIN_IDENTIFIER = "semidiepie"
PIN = "7455"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login-pin",
               json={"identifier": PIN_IDENTIFIER, "pin": PIN}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"PIN login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token")
    assert tok, f"no access_token: {r.text[:200]}"
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    yield db
    cli.close()


@pytest.fixture(scope="module")
def characters(api, mongo):
    """Create TEST_Hope and TEST_Juliette with mutual relationships, teardown after."""
    suf = uuid.uuid4().hex[:6]
    hope_payload = {
        "name": f"TEST_Hope_{suf}",
        "username": f"test_hope_{suf}",
        "persona": "A cheerful teenage girl who adores texting her mom.",
        "affection": "adores",
        "allow_calls": False,
        "allow_live": False,
        "schedule": [],
        "relationships": [],
    }
    jul_payload = {
        "name": f"TEST_Juliette_{suf}",
        "username": f"test_juliette_{suf}",
        "persona": "A warm caring mom in her 40s.",
        "affection": "adores",
        "allow_calls": False,
        "allow_live": False,
        "schedule": [],
        "relationships": [],
    }
    rh = api.post(f"{BASE_URL}/api/ai-characters", json=hope_payload, timeout=30)
    assert rh.status_code in (200, 201), f"create hope failed: {rh.status_code} {rh.text[:200]}"
    rj = api.post(f"{BASE_URL}/api/ai-characters", json=jul_payload, timeout=30)
    assert rj.status_code in (200, 201), f"create juliette failed: {rj.status_code} {rj.text[:200]}"
    hope_id = rh.json()["id"]
    jul_id = rj.json()["id"]

    # Cross-link via PUT.
    hope_payload["relationships"] = [{"character_id": jul_id, "relation": "mother"}]
    jul_payload["relationships"] = [{"character_id": hope_id, "relation": "daughter"}]
    uh = api.put(f"{BASE_URL}/api/ai-characters/{hope_id}", json=hope_payload, timeout=30)
    uj = api.put(f"{BASE_URL}/api/ai-characters/{jul_id}", json=jul_payload, timeout=30)
    assert uh.status_code == 200 and uj.status_code == 200, \
        f"PUT failed: hope={uh.status_code} jul={uj.status_code}"

    yield {"hope_id": hope_id, "jul_id": jul_id,
           "hope_name": hope_payload["name"], "jul_name": jul_payload["name"],
           "hope_body": uh.json(), "jul_body": uj.json()}

    # Teardown: delete characters + any convos/messages.
    api.delete(f"{BASE_URL}/api/ai-characters/{hope_id}", timeout=30)
    api.delete(f"{BASE_URL}/api/ai-characters/{jul_id}", timeout=30)
    mongo.ai_char_convos.delete_many({"$or": [{"from_id": hope_id}, {"to_id": hope_id},
                                              {"from_id": jul_id}, {"to_id": jul_id}]})
    mongo.ai_char_messages.delete_many({"char_id": {"$in": [hope_id, jul_id]}})


# ------------------- tests -------------------

def test_relationships_persist_on_put_and_list(api, characters):
    """PUT response contains relationships and GET /api/ai-characters returns them."""
    hope_body = characters["hope_body"]
    jul_body = characters["jul_body"]
    assert isinstance(hope_body.get("relationships"), list), f"hope: {hope_body}"
    assert hope_body["relationships"][0]["character_id"] == characters["jul_id"]
    assert hope_body["relationships"][0]["relation"] == "mother"
    assert jul_body["relationships"][0]["character_id"] == characters["hope_id"]
    assert jul_body["relationships"][0]["relation"] == "daughter"

    r = api.get(f"{BASE_URL}/api/ai-characters", timeout=30)
    assert r.status_code == 200
    rows = {c["id"]: c for c in r.json()}
    assert characters["hope_id"] in rows and characters["jul_id"] in rows
    hope = rows[characters["hope_id"]]
    jul = rows[characters["jul_id"]]
    assert hope["relationships"][0]["character_id"] == characters["jul_id"]
    assert hope["relationships"][0]["relation"] == "mother"
    assert jul["relationships"][0]["character_id"] == characters["hope_id"]
    assert jul["relationships"][0]["relation"] == "daughter"


def test_explicit_relay_creates_inter_character_convo(api, mongo, characters):
    """POST /send with 'tell your mom Juliette ...' triggers background relay;
    poll ai_char_convos for inter-character messages."""
    hope_id = characters["hope_id"]
    jul_id = characters["jul_id"]
    jul_name = characters["jul_name"].split("_")[1]  # "Juliette"

    # Match requires relative's first-name OR relation word; our test name has an
    # underscore so split() keeps "TEST_Juliette_xxx" as one token. Use the
    # recorded relation word ("mother") which _maybe_relay_to_relative matches.
    text = (f"Hey Hope, please tell your mother {jul_name} that I passed my "
            f"math test today!")
    rs = api.post(f"{BASE_URL}/api/ai-characters/{hope_id}/send",
                  json={"text": text}, timeout=30)
    assert rs.status_code == 200, f"/send failed: {rs.status_code} {rs.text[:200]}"
    body = rs.json()
    # /send is deferred — expect pending:true or at minimum a 200 ack.
    assert body.get("pending") in (True, None), f"unexpected /send body: {body}"

    # Poll ai_char_convos for messages involving both ids (relay runs via asyncio.create_task).
    deadline = time.time() + 90  # LLM-powered relay — generous poll
    convo = []
    while time.time() < deadline:
        convo = list(mongo.ai_char_convos.find(
            {"$or": [{"from_id": hope_id, "to_id": jul_id},
                     {"from_id": jul_id, "to_id": hope_id}]}
        ).sort("created_at", 1))
        if len(convo) >= 2 and \
                any(m["from_id"] == hope_id for m in convo):
            break
        time.sleep(3)

    assert len(convo) >= 2, (
        f"no/few inter-character messages after 90s: {len(convo)} msgs — "
        f"background relay task may not have run."
    )
    assert any(m["from_id"] == hope_id for m in convo), "Hope never relayed to Juliette"
    print(f"PASS inter-char messages: {len(convo)}")
    for m in convo:
        print(f"   {m.get('from_name')} -> {m.get('to_name')}: {m.get('text')!r}")


def test_shared_knowledge_juliette_context(mongo, characters):
    """Juliette's context query (from_id OR to_id == jul_id) must now surface
    the exchange so when the user later texts her, she already knows."""
    jul_id = characters["jul_id"]
    hope_id = characters["hope_id"]
    jul_knows = list(mongo.ai_char_convos.find(
        {"$or": [{"from_id": jul_id}, {"to_id": jul_id}]}
    ))
    assert jul_knows, "Juliette's shared-knowledge context is empty"
    assert any(m["from_id"] == hope_id for m in jul_knows), \
        "Juliette's context missing Hope's relayed message"
