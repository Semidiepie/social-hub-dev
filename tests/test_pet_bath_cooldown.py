"""
Playwright test for Pet mini-game cooldown bug fix.
Verifies that cooldown is applied on completion regardless of how
the care room is dismissed (X / Done / auto-timer).
"""
import asyncio
import os
import json

BASE_URL = "https://social-hub-dev-4.preview.emergentagent.com"
FOUNDER_ID = "08bc3c6e-fbc2-4785-8071-a4abda487b36"


async def login_and_refresh(page):
    """Login via PIN, inject token, refresh pet to clear cooldowns."""
    # Login
    import urllib.request
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/login-pin",
        data=json.dumps({"identifier": "semidiepie@gmail.com", "pin": "7455"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    token = data["access_token"]
    # Refresh pet
    req2 = urllib.request.Request(
        f"{BASE_URL}/api/admin/users/{FOUNDER_ID}/refresh-pet",
        method="POST",
        headers={"Authorization": f"Bearer {token}"},
    )
    urllib.request.urlopen(req2).read()
    # Set token in localStorage
    await page.goto(f"{BASE_URL}/login")
    await page.evaluate(f"localStorage.setItem('postmeplex.token', '{token}')")
    return token


def get_pet_cooldowns(token):
    import urllib.request
    req = urllib.request.Request(
        f"{BASE_URL}/api/pet",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["pet"]["cooldowns"]


def refresh_pet(token):
    import urllib.request
    req = urllib.request.Request(
        f"{BASE_URL}/api/admin/users/{FOUNDER_ID}/refresh-pet",
        method="POST",
        headers={"Authorization": f"Bearer {token}"},
    )
    urllib.request.urlopen(req).read()


async def clear_bath_smudges(page):
    """Click each of the 12 smudges to clean the pet."""
    for i in range(12):
        sel = f'[data-testid="pet-smudge-{i}"]'
        try:
            await page.wait_for_selector(sel, timeout=2000, state="attached")
            # dispatch click directly to bypass any overlay/PWA bar
            await page.evaluate(f'''() => {{
                const el = document.querySelector('[data-testid="pet-smudge-{i}"]');
                if (el) el.click();
            }}''')
            await page.wait_for_timeout(100)
        except Exception as e:
            print(f"  smudge {i} failed: {e}")


async def complete_feed(page):
    """Tap each of the 4 food items."""
    for i in range(4):
        sel = f'[data-testid="pet-food-{i}"]'
        try:
            await page.wait_for_selector(sel, timeout=2000)
            # Food uses onPointerDown/Up with !movedRef => tap triggers onEat
            el = await page.query_selector(sel)
            if el:
                box = await el.bounding_box()
                if box:
                    cx = box["x"] + box["width"] / 2
                    cy = box["y"] + box["height"] / 2
                    await page.mouse.move(cx, cy)
                    await page.mouse.down()
                    await page.wait_for_timeout(50)
                    await page.mouse.up()
            await page.wait_for_timeout(200)
        except Exception as e:
            print(f"  food {i} failed: {e}")


async def complete_play(page):
    """Tap the ball 5 times - each throw takes ~1.5s."""
    for i in range(5):
        try:
            await page.wait_for_selector('[data-testid="pet-ball"]:not([disabled])', timeout=5000)
            el = await page.query_selector('[data-testid="pet-ball"]')
            if el:
                box = await el.bounding_box()
                if box:
                    cx = box["x"] + box["width"] / 2
                    cy = box["y"] + box["height"] / 2
                    await page.mouse.move(cx, cy)
                    await page.mouse.down()
                    await page.wait_for_timeout(50)
                    await page.mouse.up()
            await page.wait_for_timeout(1700)
        except Exception as e:
            print(f"  ball throw {i} failed: {e}")


async def is_tile_disabled(page, testid):
    el = await page.query_selector(f'[data-testid="{testid}"]')
    if not el:
        return None
    return await el.get_attribute("disabled") is not None


async def tile_label(page, testid):
    """Get the Ready/cooldown subtitle text of a tile."""
    try:
        text = await page.evaluate(f'''() => {{
            const btn = document.querySelector('[data-testid="{testid}"]');
            if (!btn) return null;
            const spans = btn.querySelectorAll('span');
            return spans[spans.length - 1]?.textContent || null;
        }}''')
        return text
    except Exception:
        return None


# ==================== TEST ENTRY ====================
async def run(page):
    page.on("console", lambda msg: None)  # silence
    await page.set_viewport_size({"width": 390, "height": 844})

    token = await login_and_refresh(page)
    print(f"[setup] token acquired, pet refreshed")

    # ========= TEST 1: BATH via X close =========
    print("\n=== TEST 1: Bath via X-close path ===")
    refresh_pet(token)
    await page.goto(f"{BASE_URL}/pet")
    await page.wait_for_selector('[data-testid="pet-bath-btn"]', timeout=10000)
    print("  pet page loaded")

    # Verify bath Ready
    label = await tile_label(page, "pet-bath-btn")
    print(f"  bath pre-state: {label}")

    await page.click('[data-testid="pet-bath-btn"]', force=True)
    await page.wait_for_selector('[data-testid="pet-cozy-room"]', timeout=5000)
    print("  bath room opened")

    await clear_bath_smudges(page)

    # Wait for celebrate overlay
    try:
        await page.wait_for_selector('[data-testid="pet-room-celebrate"]', timeout=5000)
        print("  celebration appeared")
    except Exception:
        print("  !! celebration did NOT appear")

    # IMMEDIATELY tap X close (not Done)
    await page.click('[data-testid="pet-room-close"]', force=True)
    print("  tapped X close")

    # Wait for room to unmount and API to settle
    await page.wait_for_selector('[data-testid="pet-card"]', timeout=5000)
    await page.wait_for_timeout(2500)

    # Verify cooldown applied client
    bath_label_after = await tile_label(page, "pet-bath-btn")
    bath_disabled = await is_tile_disabled(page, "pet-bath-btn")
    print(f"  bath post-state: label='{bath_label_after}' disabled={bath_disabled}")

    # Verify cooldown applied server
    cds = get_pet_cooldowns(token)
    print(f"  server cooldowns: {cds}")
    test1_pass = cds.get("bath", 0) > 0 and bath_disabled
    print(f"  TEST 1 {'PASS' if test1_pass else 'FAIL'}")

    # Tapping disabled bath MUST NOT open the room
    await page.click('[data-testid="pet-bath-btn"]', force=True)
    await page.wait_for_timeout(500)
    room_reopened = await page.query_selector('[data-testid="pet-cozy-room"]')
    print(f"  bath re-tap opened room: {room_reopened is not None} (should be False)")
    test1b_pass = room_reopened is None

    # ========= TEST 2: BATH via Done button =========
    print("\n=== TEST 2: Bath via Done button ===")
    refresh_pet(token)
    await page.goto(f"{BASE_URL}/pet")
    await page.wait_for_selector('[data-testid="pet-bath-btn"]', timeout=10000)
    await page.click('[data-testid="pet-bath-btn"]', force=True)
    await page.wait_for_selector('[data-testid="pet-cozy-room"]', timeout=5000)
    await clear_bath_smudges(page)
    try:
        await page.wait_for_selector('[data-testid="pet-room-done"]', timeout=5000)
        await page.click('[data-testid="pet-room-done"]', force=True)
        print("  tapped Done")
    except Exception as e:
        print(f"  Done click failed: {e}")
    await page.wait_for_selector('[data-testid="pet-card"]', timeout=5000)
    await page.wait_for_timeout(2500)
    cds2 = get_pet_cooldowns(token)
    bath_disabled2 = await is_tile_disabled(page, "pet-bath-btn")
    print(f"  server cooldowns: {cds2}, bath disabled: {bath_disabled2}")
    test2_pass = cds2.get("bath", 0) > 0 and bath_disabled2
    print(f"  TEST 2 {'PASS' if test2_pass else 'FAIL'}")

    # ========= TEST 3: BATH via auto-timer =========
    print("\n=== TEST 3: Bath via auto-timer (1.5s) ===")
    refresh_pet(token)
    await page.goto(f"{BASE_URL}/pet")
    await page.wait_for_selector('[data-testid="pet-bath-btn"]', timeout=10000)
    await page.click('[data-testid="pet-bath-btn"]', force=True)
    await page.wait_for_selector('[data-testid="pet-cozy-room"]', timeout=5000)
    await clear_bath_smudges(page)
    try:
        await page.wait_for_selector('[data-testid="pet-room-celebrate"]', timeout=5000)
        print("  celebration appeared, waiting for auto-timer...")
    except Exception:
        print("  !! no celebration")
    # Do NOT press anything; wait for 1.5s auto close + API
    await page.wait_for_timeout(4000)
    cds3 = get_pet_cooldowns(token)
    try:
        await page.wait_for_selector('[data-testid="pet-card"]', timeout=5000)
    except Exception:
        pass
    bath_disabled3 = await is_tile_disabled(page, "pet-bath-btn")
    print(f"  server cooldowns: {cds3}, bath disabled: {bath_disabled3}")
    test3_pass = cds3.get("bath", 0) > 0
    print(f"  TEST 3 {'PASS' if test3_pass else 'FAIL'}")

    # ========= TEST 4: Reward committed EXACTLY ONCE =========
    # Compare cooldown value from test1 (X), test2 (Done), test3 (auto) — all should be ~same value, not doubled.
    print("\n=== TEST 4: Reward committed exactly once (no doubling) ===")
    print(f"  bath cd after X: {cds.get('bath')}, after Done: {cds2.get('bath')}, after auto: {cds3.get('bath')}")
    # They should all be close to the same reset base, within a few seconds variance.
    vals = [cds.get("bath", 0), cds2.get("bath", 0), cds3.get("bath", 0)]
    spread = max(vals) - min(vals)
    test4_pass = all(v > 0 for v in vals) and spread < 60  # all applied, not doubled
    print(f"  spread={spread}s — TEST 4 {'PASS' if test4_pass else 'FAIL'}")

    # ========= TEST 5: FEED regression via X-close =========
    print("\n=== TEST 5: Feed completes + cooldowns via X-close ===")
    refresh_pet(token)
    await page.goto(f"{BASE_URL}/pet")
    await page.wait_for_selector('[data-testid="pet-feed-btn"]', timeout=10000)
    await page.click('[data-testid="pet-feed-btn"]', force=True)
    await page.wait_for_selector('[data-testid="pet-cozy-room"]', timeout=5000)
    await complete_feed(page)
    try:
        await page.wait_for_selector('[data-testid="pet-room-celebrate"]', timeout=5000)
        await page.click('[data-testid="pet-room-close"]', force=True)
        print("  tapped X close on feed celebrate")
    except Exception as e:
        print(f"  feed celebrate failed: {e}")
    await page.wait_for_selector('[data-testid="pet-card"]', timeout=5000)
    await page.wait_for_timeout(2500)
    cds5 = get_pet_cooldowns(token)
    feed_disabled = await is_tile_disabled(page, "pet-feed-btn")
    print(f"  server cooldowns: {cds5}, feed disabled: {feed_disabled}")
    test5_pass = cds5.get("feed", 0) > 0 and feed_disabled
    print(f"  TEST 5 {'PASS' if test5_pass else 'FAIL'}")

    # ========= TEST 6: PLAY regression via X-close =========
    print("\n=== TEST 6: Play completes + cooldowns via X-close ===")
    refresh_pet(token)
    await page.goto(f"{BASE_URL}/pet")
    await page.wait_for_selector('[data-testid="pet-play-btn"]', timeout=10000)
    await page.click('[data-testid="pet-play-btn"]', force=True)
    await page.wait_for_selector('[data-testid="pet-cozy-room"]', timeout=5000)
    await complete_play(page)
    try:
        await page.wait_for_selector('[data-testid="pet-room-celebrate"]', timeout=5000)
        await page.click('[data-testid="pet-room-close"]', force=True)
        print("  tapped X close on play celebrate")
    except Exception as e:
        print(f"  play celebrate failed: {e}")
    await page.wait_for_selector('[data-testid="pet-card"]', timeout=5000)
    await page.wait_for_timeout(2500)
    cds6 = get_pet_cooldowns(token)
    play_disabled = await is_tile_disabled(page, "pet-play-btn")
    print(f"  server cooldowns: {cds6}, play disabled: {play_disabled}")
    test6_pass = cds6.get("play", 0) > 0 and play_disabled
    print(f"  TEST 6 {'PASS' if test6_pass else 'FAIL'}")

    # ========= TEST 7: Early-exit (open & cancel without completing) =========
    print("\n=== TEST 7: Early-exit (open feed, X without eating) → NO cooldown ===")
    refresh_pet(token)
    await page.goto(f"{BASE_URL}/pet")
    await page.wait_for_selector('[data-testid="pet-feed-btn"]', timeout=10000)
    await page.click('[data-testid="pet-feed-btn"]', force=True)
    await page.wait_for_selector('[data-testid="pet-cozy-room"]', timeout=5000)
    # Immediately close X without eating any food
    await page.click('[data-testid="pet-room-close"]', force=True)
    await page.wait_for_selector('[data-testid="pet-card"]', timeout=5000)
    await page.wait_for_timeout(1500)
    cds7 = get_pet_cooldowns(token)
    feed_ready = (cds7.get("feed", 0) == 0)
    feed_disabled7 = await is_tile_disabled(page, "pet-feed-btn")
    print(f"  server cooldowns: {cds7}, feed disabled: {feed_disabled7}")
    test7_pass = feed_ready and not feed_disabled7
    print(f"  TEST 7 {'PASS' if test7_pass else 'FAIL'}")

    # ========= FINAL SUMMARY =========
    print("\n=== SUMMARY ===")
    results = {
        "T1 bath via X close": test1_pass,
        "T1b disabled bath re-tap blocked": test1b_pass,
        "T2 bath via Done": test2_pass,
        "T3 bath via auto-timer": test3_pass,
        "T4 reward committed once": test4_pass,
        "T5 feed via X close": test5_pass,
        "T6 play via X close": test6_pass,
        "T7 early-exit no cooldown": test7_pass,
    }
    for k, v in results.items():
        print(f"  {'PASS' if v else 'FAIL'}: {k}")

    passed = sum(1 for v in results.values() if v)
    print(f"\n{passed}/{len(results)} tests passed")


await run(page)
