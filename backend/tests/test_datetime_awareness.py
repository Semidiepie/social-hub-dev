"""
Backend tests for the PostMePlex AI-character date/time awareness fix.

The server now injects an authoritative `_now_context` (date, weekday, local time,
tomorrow, upcoming Sunday) from the user's IANA timezone into EVERY character reply.

We verify it end-to-end through the synchronous voice-turn endpoint, which runs
`_reply` immediately (unlike /send which is deferred/queued).

Covered:
  1. Authentication via PIN as founder (super admin)
  2. Ensure (or create) a test AI character
  3. voice-turn with tz=America/New_York -> reply contains correct weekday, month+day,
     approx. local time (AM/PM + hour), and the correct upcoming Sunday
  4. voice-turn with tz=Asia/Tokyo -> same, but using Tokyo local date (may differ)
  5. Reply never contains an obviously stale date ('October 11')
"""
import os
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests

# Load REACT_APP_BACKEND_URL from the frontend .env if not already in the shell env.
if "REACT_APP_BACKEND_URL" not in os.environ:
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    os.environ["REACT_APP_BACKEND_URL"] = _line.split("=", 1)[1].strip()
                    break

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

PIN_IDENTIFIER = "semidiepie"
PIN = "7455"

# The character persona is kept neutral — we're testing date/time injection, not persona.
TEST_CHAR_NAME = "TEST_DateBot"
TEST_CHAR_USERNAME = "test_datebot"


# --- helpers ---------------------------------------------------------------

def _strip_cues(text: str) -> str:
    """Remove bracketed voice cues like [laughs], [warmly] etc. before matching."""
    return re.sub(r"\[[^\]]*\]", " ", text or "")


def _expected_now_fields(tz_name: str):
    """Compute the server-authoritative values we expect in the reply, from the same
    clock the server reads."""
    now = datetime.now(ZoneInfo(tz_name))
    # month name variants and day both with and without leading zero
    month_name = now.strftime("%B")
    day = now.day
    weekday = now.strftime("%A")
    hour12 = int(now.strftime("%I"))
    ampm = now.strftime("%p")  # AM / PM
    # upcoming Sunday (never today — matches server logic)
    days_to_sun = ((6 - now.weekday()) % 7) or 7
    sunday = now + timedelta(days=days_to_sun)
    return {
        "weekday": weekday,
        "month_name": month_name,
        "day": day,
        "hour12": hour12,
        "ampm": ampm,
        "sunday_weekday": "Sunday",
        "sunday_month": sunday.strftime("%B"),
        "sunday_day": sunday.day,
        "year": now.year,
    }


def _assert_date_time_in_reply(reply: str, tz_name: str):
    """Loosely but concretely verify the reply mentions the real local date/time."""
    text = _strip_cues(reply)
    exp = _expected_now_fields(tz_name)

    # Weekday mentioned
    assert exp["weekday"] in text, (
        f"[{tz_name}] expected weekday '{exp['weekday']}' in reply, got: {reply!r}"
    )
    # Month name mentioned
    assert exp["month_name"] in text, (
        f"[{tz_name}] expected month '{exp['month_name']}' in reply, got: {reply!r}"
    )
    # Day number mentioned (allow ordinal suffix like 19th)
    day_pattern = rf"\b{exp['day']}(?:st|nd|rd|th)?\b"
    assert re.search(day_pattern, text), (
        f"[{tz_name}] expected day '{exp['day']}' in reply, got: {reply!r}"
    )
    # AM/PM equivalent present (allow written forms "in the morning/afternoon/evening/night",
    # "noon", "midnight" as well as "AM"/"PM").
    ampm_patterns = [
        r"\b(AM|PM|a\.?m\.?|p\.?m\.?)\b",
        r"in the (morning|afternoon|evening|night)",
        r"\b(noon|midnight)\b",
        r"\bo'?clock\b",
    ]
    assert any(re.search(p, text, re.IGNORECASE) for p in ampm_patterns), (
        f"[{tz_name}] expected AM/PM or spoken time-of-day in reply, got: {reply!r}"
    )
    # Approx hour: allow exp hour or exp hour ± 1 (latency tolerance).
    # Accept digit forms (2:54) OR spelled-out ("two", "two fifty-four").
    _nums = ["zero", "one", "two", "three", "four", "five", "six", "seven",
             "eight", "nine", "ten", "eleven", "twelve"]
    def _hour_variants(h):
        h = ((h - 1) % 12) + 1  # normalize 1..12
        return {rf"\b{h}:\d{{2}}\b", rf"\b{h}\b", rf"\b{_nums[h]}\b"}
    hour_candidates = {exp["hour12"],
                       ((exp["hour12"] - 1 + 1) % 12) + 1,  # +1
                       ((exp["hour12"] - 1 - 1) % 12) + 1}  # -1
    patterns = set()
    for h in hour_candidates:
        patterns |= _hour_variants(h)
    hour_found = any(re.search(p, text, re.IGNORECASE) for p in patterns)
    assert hour_found, (
        f"[{tz_name}] expected hour ~{exp['hour12']} in reply, got: {reply!r}"
    )
    # Upcoming Sunday date mentioned
    sun_day_pattern = rf"\b{exp['sunday_day']}(?:st|nd|rd|th)?\b"
    assert exp["sunday_month"] in text and re.search(sun_day_pattern, text), (
        f"[{tz_name}] expected upcoming Sunday '{exp['sunday_month']} {exp['sunday_day']}' "
        f"in reply, got: {reply!r}"
    )
    # Never state the user's complained stale date
    assert "October 11" not in text, (
        f"[{tz_name}] reply still mentions stale 'October 11': {reply!r}"
    )


# --- fixtures --------------------------------------------------------------

@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login-pin",
               json={"identifier": PIN_IDENTIFIER, "pin": PIN}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"PIN login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token")
    assert tok, f"no access_token in login response: {r.text[:200]}"
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def character_id(api):
    """Reuse an existing character or create a minimal TEST_DateBot. Tear it down
    only if WE created it."""
    r = api.get(f"{BASE_URL}/api/ai-characters", timeout=30)
    assert r.status_code == 200, f"list failed: {r.status_code} {r.text[:200]}"
    rows = r.json()
    created = False
    char_id = None
    if rows:
        char_id = rows[0]["id"]
    else:
        payload = {
            "name": TEST_CHAR_NAME,
            "username": TEST_CHAR_USERNAME,
            "persona": ("A friendly, concise assistant who always answers the user's "
                        "question directly and plainly."),
            "your_name": "Semi",
            "nickname": "Semi",
            "relationship": "trusted friend",
            "affection": "warm",
            "allow_calls": True,
            "allow_live": False,
            "schedule": [],
        }
        rc = api.post(f"{BASE_URL}/api/ai-characters", json=payload, timeout=30)
        assert rc.status_code in (200, 201), f"create failed: {rc.status_code} {rc.text[:200]}"
        char_id = rc.json()["id"]
        created = True

    yield char_id

    if created:
        api.delete(f"{BASE_URL}/api/ai-characters/{char_id}", timeout=30)


# --- tests -----------------------------------------------------------------

QUESTION = ("What is today's full date and day of the week, what time is it right "
            "now, and what is the date of the upcoming Sunday? Please answer concretely.")


def _voice_turn(api, char_id, tz):
    body = {"text": QUESTION, "tz": tz, "local_time": "", "lat": None, "lon": None}
    r = api.post(f"{BASE_URL}/api/ai-characters/{char_id}/voice-turn",
                 json=body, timeout=120)
    assert r.status_code == 200, f"voice-turn failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    # The sync endpoint returns {"reply": <text>, "audio_url": ...}
    reply = data.get("reply") or data.get("spoken") or ""
    assert reply.strip(), f"empty reply, body: {data}"
    return reply


def test_voice_turn_date_time_new_york(api, character_id):
    reply = _voice_turn(api, character_id, "America/New_York")
    print(f"\n[NY reply]: {reply}")
    _assert_date_time_in_reply(reply, "America/New_York")


def test_voice_turn_date_time_tokyo(api, character_id):
    reply = _voice_turn(api, character_id, "Asia/Tokyo")
    print(f"\n[Tokyo reply]: {reply}")
    _assert_date_time_in_reply(reply, "Asia/Tokyo")


def test_now_context_has_authoritative_marker():
    """Guard: ensure the server helper still produces the authoritative block
    so future refactors don't silently drop the fix."""
    import importlib, sys
    sys.path.insert(0, "/app/backend")
    mod = importlib.import_module("routes.ai_characters")
    ctx = mod._now_context("America/New_York")
    assert "Today's date is" in ctx
    assert "upcoming Sunday" in ctx
    assert "never state a different date" in ctx
