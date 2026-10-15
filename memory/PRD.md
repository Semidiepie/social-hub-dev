## Fix — AI proactive cadence is now personality-paced + strip roleplay actions from text (2026-06, web, admin-only)
- **Problem:** uniform cadence throttled a loving "daughter" character the same as a cold one → she went silent for over a day (unrealistic).
- **Fix:** each character now sets its OWN next check-in. `_proactive_decide` returns `next_hours` and the scheduler schedules the next evaluation from it (clamped 1–120h, ±15% jitter). Prompt guides: deeply attached ~2–8h (even multiple times/day), friendly ~12–24h, distant ~24–72h, cold/upset ~72–120h. Removed the fixed 8–72h window + blanket 45% mood-skip. Min idle lowered 180→60 min. Kept one-per-admin-per-pass + shuffle (no simultaneous) and stop-after-3-ignored.
- **Asterisk actions:** new `_strip_actions()` removes `*laughs softly*` / `**grins**` roleplay from TEXT messages (send + proactive) and the push body; CALLS (`/voice-turn`) keep them. Proactive push now also uses `suppressIfFocused`.
- AGENT-TESTED: attached character scheduled next check-in ~2.8h (vs days before), 3-tuple decision/schedule wrote with no error; asterisk strip verified on samples. NOT user-confirmed. Preview only — Publish/Redeploy for production.
- **PENDING (awaiting user decision):** calendar-awareness feature — characters texting near calendar events that relate to them. Asked user: in-app calendar vs Google Calendar, name-match vs explicit tag, timing. Not yet built.


## Enhancement — AI character reply push ("notified even if you close the app") (2026-06, web, admin-only)
- **Reply completes server-side regardless of the client:** the reply is generated + stored inside `/api/ai-characters/{id}/send` before it returns (the typing delay is purely client-side), so closing the app never loses the reply — it's there on next open.
- **Push on reply:** `/send` now fires a Web Push (`asyncio.create_task(send_web_push(..., extra={"suppressIfFocused": True}))`) so the admin is notified the character messaged even with the app closed. No-op if push isn't enabled.
- **No spam while chatting:** extended `send_web_push` with an optional `extra` payload; `push-sw.js` now checks focused windows and SKIPS the banner when the admin is already focused on that exact chat (`/messages/ai_{id}`). Shows it otherwise (app closed/backgrounded/other page).
- AGENT-TESTED: `/send` → 200, silent (audio_url null), reply generated, push task fired with no backend error. Push DELIVERY + SW focus-suppression not auto-verifiable (needs a real subscribed browser + focus states). The `push-sw.js` update reaches users on next load; production needs redeploy. NOT user-confirmed.
- Note: a stale `TypeError: can't subtract offset-naive...` in logs is from the older games `/earn` path (pre-existing, earn verified working earlier this session) — unrelated to this change.


## Enhancement + fix — AI character typing delay + silent-text reliability (2026-06, web, admin-only)
- **Human typing delay:** `AiCharacterChat.send()` now adds a variable, believable delay before the reply shows — a short "noticing" pause (0.3–1.8s, ~15% chance of a longer AFK pause +2–6s) run in parallel with the LLM call, then a length-proportional typing delay (≤~5s). The typing bubble is now animated dots.
- **"Error + message deletes" on texting:** root cause was the OLD `/send` generating ElevenLabs voice for text replies (fixed earlier in #3 — text now never calls TTS, so a voice hiccup can't fail the text send). Frontend `send()` hardened: the user's message always stays on error + clearer toast. This fix is in preview; production needs a redeploy.
- **Unread badge suppressed for the open thread:** `Messages.jsx` hides the AI unread badge when `convId === ai_{id}` so the thread you're reading doesn't show a count.
- AGENT-TESTED: typing dots appear then reply arrives after delay with no error (screenshot); unread/mark-read verified earlier. Cleaned up test messages. Preview only — Publish/Redeploy for production.


## Fix — AI proactive texting cadence + Messages unread badge (2026-06, web, admin-only)
- **No more simultaneous texts:** `_proactive_once` now flattens all (character, admin) threads, shuffles them, and sends AT MOST ONE proactive text per admin per 15-min pass → a user never gets several characters at once.
- **Sparse, irregular, believable cadence:** min idle raised to 3h; after each check a thread's `next_eval_at` is set a random 8–72h out (some characters stay silent for days); a 45% "not in the mood" mood-skip (no LLM call); stop after 2 ignored check-ins until the user replies; the LLM still decides per-personality whether to text at all. Controlled by `PROACTIVE_MIN_IDLE_MIN / NEXT_MIN_H / NEXT_MAX_H / MOOD_SKIP / MAX_UNANSWERED`.
- **Unread badge on Messages list:** `/api/ai-characters` now returns per-thread `unread` (count of AI messages since `last_read_at`) + `last_message` {role,text,created_at}, sorted by recent activity. Opening the thread (`GET /thread`) sets `last_read_at` → clears the badge. `Messages.jsx` AI rows show bold name + count badge + "last message" preview + time; list refetches on thread switch and polls every 10s.
- AGENT-TESTED: list returns unread=6 + preview, badge renders ("6"), opening thread clears to 0 (curl + screenshot). Cleaned up test-induced proactive messages. NOT user-confirmed. Preview only — Publish/Redeploy for production.


## Feature — AI characters: push-to-talk calls, silent texting, no-accent voice, proactive human-like texting (2026-06, web, admin-only)
- **#1 Push-to-talk calls (like Sage):** rewrote `AiCharacterChat.jsx` `CharacterCall` from hands-free VAD auto-listen to Sage-style tap-mic-to-talk / tap-to-send (status: connecting→idle→recording→thinking→speaking). Kept the Web-Audio volume slider + speaker toggle. Admin still fully customizes the character. AGENT-TESTED (screenshot: call screen renders, greeting voice plays, "Tap the mic to talk, tap again to send").
- **#3 Silent texting:** `/api/ai-characters/{id}/send` no longer runs TTS — returns `audio_url: null`; the UI no longer auto-plays. Voice ONLY during a call (`/voice-turn`). Also cuts ElevenLabs cost. AGENT-TESTED (curl: audio_url null, reply returned).
- **#2 No accent / no drift:** `_tts` VoiceSettings → `stability=0.5, similarity_boost=1.0, style=0.0` so eleven_v3 stays faithful to the pasted voice with no theatrical accent drift. NOTE: base accent is still whatever ElevenLabs voice is pasted in admin — pick a neutral voice for a neutral sound. Code change; not audibly verifiable in automation.
- **#4 Proactive human-like texting:** new background scheduler in `ai_characters.py` (`proactive_loop`, started in server.py startup) runs every 15 min. For each character↔admin thread idle >90 min, an in-character LLM call decides (believably, from personality + conversation + how they feel about the user) whether to text and what to say; stores it as an AI message + fires web push (`/messages/ai_{id}`). Guards: re-evaluate ≤ once/3h per thread (caps LLM cost + spam), stop after 3 unanswered check-ins until the user replies (reset on reply). New collection `ai_char_state` tracks `last_proactive_at`/`last_checked_at`/`unanswered`. AGENT-TESTED e2e: aged a thread → scheduler generated a believable warm in-character check-in, stored it, wrote state; push send path identical to the proven VAPID system (delivery itself needs a subscribed browser, not auto-verifiable).
- Admin-only (AI characters are admin-only). NOT user-confirmed. NOT run through the automated testing agent (user budget-conscious). Preview only — Publish/Redeploy for www.postmeplex.com.


## Feature — Real-time web push on game token earn (2026-06, web)
- **What:** Every time a user earns tokens from a game (the `/api/games/{id}/earn` heartbeat grants +5), the backend now fires a browser Web Push: title "+5 tokens earned! 🎮", body "You earned N tokens playing {game}. Balance: X", click → `/wallet`.
- **How:** Reuses the existing self-hosted VAPID web-push stack (`send_web_push` in server.py, `push-sw.js`, `webpush.js`, `/api/push/*`). `games.py` grabs `send_web_push` from `route_ctx` and fires it via `asyncio.create_task(...)` (non-blocking, never delays/breaks the earn response). No-op for users who haven't enabled/subscribed to push, so it's self-gating on permission.
- **Cadence / anti-spam:** fires once per active play-minute (per +5 grant). The service worker's shared `tag` ("postmeplex-activity") coalesces consecutive notifications (updates rather than stacking 60 banners).
- **Delivery requirements:** user must grant browser push permission + subscribe (Settings) and VAPID must be configured (it is — public key served in preview).
- **Verification:** AGENT-TESTED — earn endpoint returns `earned +5` / 200 with the push code path active (register→play→earn, no error). Push *delivery* NOT e2e-verified (needs a real subscribed browser + granted permission, not reproducible headless). NOT user-confirmed. Preview only — requires Publish/Redeploy for www.postmeplex.com.


## Feature — Games earn tokens (play-through-PostMePlex) + compact token display (2026-06, web)
- **What:** Users now earn tokens by playing games through the PostMePlex game player. Backend `POST /api/games/{id}/earn` heartbeat grants `GAME_PLAY_EARN_PER_MIN = 5` tokens per active play-minute, capped at `GAME_PLAY_DAILY_CAP = 1000` per rolling ~20h window, on its own ledger kind `game_play` (separate from the level-clear faucet). Server validates timing: first tick `started` (0), ~60s later `earned` (+5), too-soon `throttled`, long gap `resumed`.
- **Earning scope (per explicit user decision):** NOT restricted to successfully-embedded iframes. The in-player heartbeat (`GamePlayer.jsx`) fires for ANY game opened in our player — embedded OR the new-tab/fallback launcher — because it's "played through PostMePlex". Only visiting the game's own external site (outside our player) earns nothing, since it never calls `/earn`. The embed/visibility gate the agent initially proposed was explicitly declined by the user.
- **Labels:** player earn card + Game Profile label updated to "You earn tokens only by playing through PostMePlex … playing on the game's own site won't earn tokens."
- **Compact token display** (`frontend/src/lib/format.js` `formatTokens`): 1300→1.3K, 134600→134.6K, 1,200,000→1.2M, 2.5B. Wired into Wallet, AppShell sidebar, HamburgerMenu, Market, GameProfile.
- **Verification:** AGENT-TESTED. Backend earn flow verified end-to-end against the live preview API (register user → play → earn ticks: started/earned+5/throttled/resumed, balance 100→105, one `game_play` ledger entry, cap tracking correct). Frontend player renders the earn card (+5/min) with the new label for a fallback game (screenshot). Compact formatting agent-verified in prior session (1.2M). NOT user-confirmed; NOT run through the automated testing agent (user is credit-budget-sensitive and declined). Preview only — requires Publish/Redeploy to reach www.postmeplex.com.


## Fix + Feature — Games: embed black-screen fix + verified Game Profile (2026-06, web)
- **Black-screen fix (`GamePlayer.jsx`):** embeds that a site blocks (X-Frame-Options / CSP `frame-ancestors`) no longer leave a permanent black box. Reliable fallback overlay ("This game can't be embedded here" + **Open in new tab**) now shows on insecure `http://` URLs, on load failure, and after a 5s no-load timeout; a persistent "New tab" chip sits over the embed as a guaranteed escape (covers sites that fire a fake `onLoad` while staying blank). Fallback is ALWAYS the instruction — never a game swap.
- **Graceful fullscreen:** when `document.fullscreenEnabled` is false (e.g. inside the Emergent preview iframe) the Fullscreen button opens the game in a new tab (with toast) instead of silently failing. True fullscreen works in production.
- **Demo game:** restored to "Candy Crushables" (candycrushable.com) per user — that site forbids embedding, so it intentionally shows the Open-in-new-tab instruction. (A generated candy icon was set since the original icon URL was lost in an earlier swap; admin can re-edit in Admin → Games.)
- **New Game Profile page (`pages/GameProfile.jsx`, route `/games/:id`):** clicking a game now opens a verified profile (cover banner, icon, name + **blue verified ✓** when `is_verified`, developer, category, description), with **Play** → `/games/:id/play` (the embedded player), Save, Follow, More menu, Game updates, and per-game "show my activity" privacy toggle. Three tabs: **Comments** (full threaded comments via shared `CommentThread type="game"` — post/reply/delete-own/admin-delete), **Playing** (users with activity visible, newest first, respects privacy), **Followers** (clickable → user profiles).
- **Routing change:** `/games/:id` = Profile, `/games/:id/play` = Player (was `/games/:id`). Player Close → back to profile.
- **Backend (`routes/games.py`):** `GameBody.is_verified` (default true) wired through create/update/serialize; `GET /api/games/{id}/followers`, `GET /api/games/{id}/players` (respects `game_plays.visible`), game comments `GET`/`POST`/`DELETE /api/games/{id}/comments` (threaded one level, cascade delete, author enrichment mirroring posts). `game_comments` added to delete-game cleanup. Admin → Games form gets a "Verified game ✓" toggle.
- **Verified (agent-tested only, NOT testing-agent/user confirmed):** backend curl covered detail/is_verified, follow, followers, players (after play), comment post+reply (parent set)+list+cascade-delete. Web DOM + clean screenshot confirmed profile header/verified badge/Play/tabs/comment composer/players+followers lists render. NOTE: inline game embedding couldn't be visually confirmed in the automation browser (it blocks external game assets); real inline-play verification is on the user in the live preview. Web-only; mobile Games still deferred (Phase 3). Preview-only — redeploy for production.


## Update — ElevenLabs key + new Sage voice (2026-06)
- Configured a new ElevenLabs API key in the settings store (`ELEVENLABS_API_KEY`, source=custom) — the account now contains both the Sage voice and the AI-character voices.
- **Sage voice changed** to `hpp4J3VqNfWAUOO0d1Us` ("Bella") via `SAGE_VOICE_ID` default in `routes/sage.py`.
- Verified: both voices resolve in the account; the character voice `X8ye6rf6ZloQ3SE3PQNM` ("Young Kid") now returns `voice_valid:true` and a voice-turn produced real audio (~63KB mp3). NOTE: preview and production settings stores are SEPARATE — the same ElevenLabs key must be set again in production via Admin → Keys after deploy.

# PostMePlex — Product Requirements

## Fix — Pet activity reward/cooldown now commits on completion (2026-06, web)
- **Bug:** "bath says completed but I can still do bath again right away." The reward/cooldown was only sent when the player pressed **Done** (or let the 1.5s auto-timer fire). Tapping the **X** after the celebration ran the cancel path, which unmounted the room and cleared the auto-timer before the `POST /api/pet/{action}` call — so no cooldown applied and the activity could be redone immediately.
- **Fix (`pages/pet/PetPlay.jsx` + `pages/Pet.jsx`):** the reward now commits the **instant the activity completes** (at the celebration) via a new `onComplete` callback (`useComplete(onComplete, onClose)` fires `onComplete` once, guarded by `firedRef`). `CareRoom` now takes `onComplete` (commit reward, keep room open) + `onClose` (close only); `Pet.jsx` passes `onComplete={() => doCare(interaction)}` and `onClose={() => setInteraction(null)}`. Done button, X, and auto-timer all just close. Removed the old `finishCare`. Early-exit (closing before completing) still applies no reward.
- **Verified (testing agent iteration_50 — 8/8 PASS):** Bath cooldown applies via X / Done / auto-timer (≈21,597s), reward committed exactly once (no doubling), Feed (~4h) & Play (~2h) regressions pass, early-exit applies none, on-cooldown tile won't reopen. Credit-safe (no Sage/LLM calls). Lint clean. Preview-only — redeploy for production. Web-only.

## Note — YouTube link-sync feature: dropped (2026-06)
- User requested importing YouTube channel metadata + auto-downloading/re-hosting the video files into native storage. Flagged the hard blocker: YouTube's official API never exposes the video file, and scraping/downloading to re-host violates YouTube ToS + copyright (same wall as the earlier TikTok repost request). Offered the compliant alternative (metadata auto-fetch + owner uploads the file → native Cloudinary hosting + native HTML5 player, which already exists via `routes/videos.py` / `VideoUpload.jsx` / `ReelUpload.jsx`). **User chose to drop the feature.** No YouTube code was written.


## Feature — Pet care mini-games made genuinely fun (Phase 1) (2026-06, web)
- Polish pass on the existing Feed/Bath/Play cozy rooms (`pages/pet/PetPlay.jsx`); **rewards/XP/cooldowns unchanged** (still call the same care endpoints), only the experience is richer. No AI/image credits used.
- **Feed:** removed the white ring/slab behind each food (food now sits cleanly with a soft drop-shadow); foods are **species-appropriate, inferred for FREE** from the pet's `description` via keyword rules + a friendly default (`inferFoods()`), e.g. snake → 🥚🐁🍖🐸, bunny → 🥕🥬🫐🍓, cat → 🐟🥛🍗, dog → 🦴🍖🥩. `pet.description` now passed from `Pet.jsx` → `CareRoom` → `FeedRoom`. Kept drag/tap, chomp, "yum" reaction, portion counter.
- **Bath:** more dirt (12 smudges) for a longer scrub; dragging the sponge spawns a **lively trail of drifting, popping bubbles everywhere** (2–3 per move, capped ~48, `animate-bath-bubble`); a **foam layer builds up** with progress; reaching 100% triggers a **rinse-and-sparkle** finish (pet shakes off + ✨ `animate-pet-sparkle`). Tap-a-smudge fallback kept.
- **Play:** real **aim-and-throw fetch** — the release drag vector sets direction + strength; the toy **arcs with a peak** (`animate-toy-throw`, `--tx/--ty/--apex`) to a computed landing; the **pet runs to the toy and trots back**; a **happiness meter** (5 fetches), a **catch-streak** flourish ("combo xN! 🔥"), an excited celebration, and **multiple toys** (🎾/🥏/🧸 cycle). Tap-to-throw fallback kept. Toy sits at 74% (raised so overlays don't cover it).
- New CSS in `index.css`: `bath-bubble`, `pet-sparkle`, `toy-throw` keyframes.
- **Verified (self-test, screenshots @430×920):** Feed shows snake foods + no white ring; Bath = 12 smudges, 26 live bubbles mid-scrub, foam building at 42%; Play = throws 1→5 register, combo x3 flourish, celebration, 2nd toy cycles in. Lint clean. Preview-only — redeploy for production. Web-only (native mobile = Phase 3).


## Removal — Games feature fully removed (2026-06, web) per user request
- User asked to completely remove the games/arcade feature. Removed:
  - **Nav/entry points:** sidebar + bottom nav (`AppShell.jsx`), hamburger shortcut (`HamburgerMenu.jsx`), admin tab (`AdminTabs.jsx`), and the "Games — Win levels" earn promo in `Wallet.jsx` (earn grid now 2-col; the historical `game` transaction label is kept so old wallet entries still render).
  - **Routes:** `/games`, `/games/:slug`, `/admin/games` deleted from `App.js` (unknown paths already redirect to `/` via the existing `path="*"` catch-all).
  - **Admin tooling:** games-only "reset-spins" button (`AdminAccounts.jsx`) + `POST /api/admin/users/{id}/reset-spins` (`server.py`).
  - **Backend:** games router mount + default-game seed startup removed (`server.py`); `routes/games.py` deleted. Backend healthy; `GET /api/games` → 404.
  - **Deleted files:** `pages/Games.jsx`, `pages/GameMap.jsx`, `pages/AdminGames.jsx`, `components/Match3Board.jsx`, `components/games/*` (Farm/Slots/Memory/Quiz/Tapper), `games/match3.js`, `games/sfx.js`, `routes/games.py`, and the stale `tests/test_games_cover.py`.
- **Kept (harmless):** unused game CSS classes in `index.css` (inert, never referenced) and orphaned Mongo collections (`games`, `game_states`, `slots_state`, `game_studio_sessions`) + historical `game` wallet txns — no code reads/writes them now.
- **Verified:** lint clean (6 files + server.py); web app loads with user; no `nav-games`; `/games` redirects to `/`; backend startup clean, no leftover symbol refs; mobile had no games code. Preview-only — redeploy for production.


## Fix — Match-3 candies redesigned to real Candy-Crush pieces (2026-06, web)
- **Why:** user reported the match-3 still looked bad — pieces were flat colored rounded-squares with app ICONS (hearts/cameras) inside, nothing like Candy Crush.
- **Fix:** each piece now renders as a distinct glossy 3D **SVG candy shape** keyed by colour index (`Match3Board.jsx`: `CandyShape` + shared `CandyDefs` gradients): 0 blue sphere, 1 yellow teardrop, 2 green jelly-square, 3 orange lozenge (with seam), 4 red jelly-bean, 5 purple cluster — each with a top-light→base→dark vertical gradient, a specular gloss highlight, and a drop-shadow. Admin-uploaded custom tile IMAGES still render (respected). Board tray lightened to CC-style grey rounded cells over the immersive backdrop; selection = scale + glow (shape-agnostic); wrap special = pulsing glow; bomb = rainbow sphere. Removed the old icon-tile rendering + unused lucide imports.
- **Engine unchanged:** match3.js logic, scoring, specials (4→line, 5→bomb, L/T→wrap), levels, stars, rewards all untouched — purely visual. No AI/image credits used.
- **Verified (screenshot, 430×920):** 64 candy SVGs render as glossy candy shapes on level 1 (blue/yellow/green/orange — more colours unlock on later levels); board + HUD + boosters intact; lint clean. Self-tested only (visual change) — did NOT run the testing agent, to conserve the user's credits. Preview-only — redeploy for production. Web-only.


## Feature — Games overhaul Phase 1: full-screen play + custom cover art (2026-06, web)
- **Full-screen immersive play:** the level-based games (match3/memory/quiz/tapper) now render the level **map, intro, board and result** inside a full-screen `GameScreen` shell (`GameMap.jsx`) over the game's **backdrop** (its custom cover image if set, else a themed gradient + dark overlay), each with a persistent **exit X** (`game-exit`) — map→/games, play/intro/result→map. Board is centered/large on desktop, full-width on mobile (no horizontal overflow). Win result shows confetti + stars + token reward line.
- **Rich Games list** (`Games.jsx`): each card is a full-bleed **cover image** with the title overlaid (`.pmp-gamecard`), emoji+gradient fallback when no image; kept progress/Play + private badge.
- **Custom cover image upload** (`AdminGames.jsx`): per-game uploader in each GameRow (`cover-upload-<slug>` / `cover-clear-<slug>`) and in the Sage studio **ready** panel (`studio-cover-upload`, passed to build). Image fully covers the card AND becomes the in-play backdrop. Cloudinary upload; no AI/image credits.
- **Backend (`routes/games.py`):** `cover_image` on `CreateGameBody`/`UpdateGameBody`/`StudioBuildBody`, in `_public_game`, `admin_create`, `_create_from_spec(spec, cover_image)`, `admin_studio_build`, and `admin_update` — `_clean_cover_image()` accepts **https only** (≤1000 chars); empty/invalid clears it to null (emoji/gradient fallback).
- **Unchanged:** match-3 engine/visuals/sfx were already Candy-Crush-grade (iteration 45: glossy candies, pop/burst, cascade, combos, 4-match line / 5-match bomb specials, win/lose sfx); gameplay balance (scoring, levels, stars, token rewards, caps) untouched. Farm/slots full-screen framing deferred to Phase 2.
- **Verified (testing agent iteration_48 — PASS):** backend 6/6 pytest (cover_image expose/set/clear/auth); web e2e of list cover card + immersive map/intro/play/result + persistent exit + admin cover UI; mobile 390×844 no overflow. Credit guardrail honored (no Sage/LLM calls). Preview-only — redeploy for production. Web-only. NOTE: a candy demo cover was set on the public `postmeplex-match` game — change/remove it in Admin → Games.


## Fix — Messages screen sideways-overflow on phones (2026-06, web)
- **Bug:** on phones (browser + PWA, same web code) the Messages screen rendered wider than the screen — left edge cut off, top controls (New / admin add-person, and an open chat's back/call/video/settings) only reachable by scrolling sideways.
- **Root cause:** the page wrapper used `grid` with only an `md:` column template, so on mobile it fell to a single implicit `auto` track; grid items default to `min-width:auto` (min-content), so wide content pushed the track past the phone width → horizontal overflow.
- **Fix (`Messages.jsx`):** wrapper → `grid-cols-1 md:grid-cols-[320px_1fr] min-w-0`; added `min-w-0` to the `<aside>` and the `ChatPane` `<section>` grid items (+ `overflow-hidden`, and `shrink-0` on the ChatPane header icon buttons). Also added `min-w-0` to the `SageChat`/`AiCharacterChat` root `<section>` (same grid items). Desktop two-pane layout untouched.
- **Verified (testing agent, iteration_47):** phone 390×844 → `scrollWidth == innerWidth == 390` (no sideways scroll) in both the conversation list and an open regular chat, all controls visible; desktop 1280×800 two-pane layout unchanged (`gridTemplateColumns 320px 652px`, no overflow). Layout-only; no backend/behavior change. Lint clean (pre-existing SageChat unescaped-entity warnings left untouched, out of scope). Preview-only — redeploy for production. Web-only.


## Feature — Pet care mini-games: cozy room redesign (2026-06, web)
- **What:** replaced the flat dark care pop-ups (Feed/Bath/Play) with bright, full-screen **cozy room** scenes + hands-on drag mini-games, starring the player's own Sage pet. Pure frontend/CSS — **no AI image cost** (room art is CSS, not generated).
  - **Feed — "Bon appétit!"**: dining nook; drag (or tap) food pieces to the pet's mouth; the pet chomps; portion counter ("N left").
  - **Bath — "Scrub-a-dub!"**: tub; pet starts grubby with dirt smudges; drag the sponge across to scrub them off (tap a smudge = fallback); bubbles rise; "% clean" meter.
  - **Play — "Fetch!"**: sunny garden (sun/plants); fling or tap the ball; pet chases/bounces; "N/4 fetches" meter.
  - Shared: friendly header banner + hint, progress meter, close/cancel, mute toggle, and a confetti + happy-chime **celebration** on completion (auto-finish after 1.5s or tap **Done**). Light Web-Audio SFX (nom/splash/pop/chime) respecting a persisted mute (`pet.sfx.muted`). Tap fallback everywhere so no one gets stuck on odd touch devices.
- **Themes:** 4 pastel room themes (Cozy Cream default / Peach / Mint / Lavender), picked from a swatch row on the pet screen and **saved to the pet** via `POST /api/pet/room-theme` (allowlisted → 400 on unknown; free, no AI). `room_theme` added to the pet doc + `_public`. Orange kept as a small accent.
- **Balance unchanged:** completion still calls the existing `/api/pet/{feed|bath|play}` so stat gains, XP and cooldowns are identical to before (verified: feed → hunger 100, +15 XP, ~4h cooldown).
- **Files:** `routes/pets.py` (room_theme field + endpoint), `frontend/src/pages/pet/PetPlay.jsx` (rewritten: `CareRoom` + FeedRoom/BathRoom/PlayRoom + `ROOM_THEMES`), `Pet.jsx` (theme picker + CareRoom wiring), `lib/sound.js` (pet SFX + mute), `index.css` (cozy keyframes).
- **Verified (curl + UI screenshots):** all 3 rooms render on-brand; Feed tap-to-eat → celebration → care applied → back to pet card; theme set/persist + bad-theme 400. Lint clean (py+js). Preview-only — redeploy for production. Web-only (Phase 3 = bring to native mobile).


## Feature — Admin "Refresh pet" (revive any user's pet) (2026-06, web)
- **What:** super-admins can revive & refresh ANY user's pet from **Admin → Accounts**. A dead pet comes back **alive at the same level** (XP/name/image/background all preserved), all stats are restored to 100, and the feed/bath/play **cooldowns are cleared** so the owner can instantly interact again.
- **Backend:** `POST /api/admin/users/{user_id}/refresh-pet` (super-admin only → 403; 404 if the user has no pet) in `routes/pets.py` — sets `is_dead=False`, `died_at=None`, hunger/happiness/cleanliness/health=100, `last_play/feed/bath/reminded_at=None`, `updated_at=now()`; returns the public pet.
- **Web:** pink **"♥ Pet"** button on each `AccountRow` in `AdminAccounts.jsx` (`account-refresh-pet-{id}`) — toast confirms level + readiness.
- **Verified (curl + UI):** killed founder pet (is_dead, health 0) → refresh returned alive/health 100/all stats 100/level preserved/cooldowns all 0; no-pet user → 404; non-admin → 403; button renders on every account row. Lint clean (py+js). Preview-only — redeploy for production. Web-only.


## Feature — Pet screen redesign + Sage custom AI backgrounds (2026-06, web)
- **Cleaner look (ref-inspired, original):** rebuilt the Pet card into one clean, light panel — nature scene behind the pet, Lv/XP pills, AI-Styled badge, big pet with idle/bounce animations, name + mood + animated heart + "tap to pet" hint, XP bar, and redesigned stat rows (circular colored icon badges + rounded progress). Activities (Feed/Bath/Play) are now big playful colored tiles (amber/violet/green) with hover lift + cooldown labels; keep existing interactive mini-games (FeedToss/BubbleBath/CatchGame).
- **Sage custom background (NEW):** `POST /api/pet/background` generates a full scene via Sage's advanced Gemini image model (`gemini-3.1-flash-image-preview` "Nano Banana"), uploads to Cloudinary, stores `pet.background_url` (added to `_public`); the card uses `background_url || grass fallback`. UI: "Custom background" block in Sage Studio with preset chips + free-text prompt. Validates no-pet/dead state.
- **Verified:** background endpoint generated a real Cloudinary scene end-to-end; dead-pet guard returns 410; `pet-card` renders; lint clean (py+js). Preview-only — redeploy for production.
- Note: references the user shared were a third-party app; design is original using the user's own pet. Mobile has no pet screen (web-only).

## Fix — AI call volume now controllable on iOS (Web Audio gain) (2026-06, web)
- **Insight:** iOS Safari **ignores `<audio>.volume`** (so her voice always played at full hardware/call volume, feeling "like a call"), and releasing the mic to escape that caused per-turn permission prompts.
- **Fix:** play her voice through the **Web Audio API** (`AudioContext` → `BufferSource` → **GainNode** → destination) instead of an `<audio>` element. iOS respects Web Audio gain, so the in-call **volume slider now actually lowers her volume** on every device. Mic stays open (track muted during playback) → **no re-prompt**. `changeVolume`/`toggleSpeaker` drive `gainRef.gain`; `srcNodeRef` stopped on hangup/unmount. Removed the unused `<audio>` element + `audioRef`.
- Lint clean, frontend only (hot-reloads). Preview-only — redeploy for production.
- ⚠️ Needs real-device verification (iPhone). This makes loudness fully controllable in-app; true earpiece routing still requires the native app.

## Fix — AI voice call: stop re-asking mic permission every turn (2026-06, web)
- **Cause:** the previous "quiet audio" fix fully released the mic each turn, so iOS re-prompted for mic permission every turn.
- **Fix:** acquire the mic **once** per call and reuse it — during playback the mic **track is muted** (`track.enabled=false`) instead of released, then re-enabled for the next listen. No re-release → no re-prompt.
- Lint clean, frontend only (hot-reloads). Preview-only — redeploy for production.
- ⚠️ **Web ceiling reached (irreconcilable tradeoff):** keeping the mic open avoids the re-prompt BUT puts the phone back in "communication" mode, so her voice again plays loud through the loudspeaker and the hardware volume behaves like call volume. On mobile WEB you cannot have BOTH "no re-prompt" AND "quiet/private media audio" — holding the mic = loud; releasing = re-prompt. The ONLY way to get a true private phone-call feel (earpiece, call-like, single permission) is the **native mobile app** (AI-character call is web-only today; would need to be built on Expo). Strongly recommended as the real solution.

## Fix — AI voice call: play as media (phone-volume controlled), not speakerphone (2026-06, web)
- **Root cause of "too loud / everyone hears her / volume keys don't work":** the call kept the mic open the entire time, which forces mobile OSes into *communication* audio mode (loud speakerphone, hardware volume keys don't control it like media).
- **Fix:** `playAudio` now fully releases the mic (`cleanupMic()` — stops tracks + closes AudioContext) before her audio plays, so her voice plays as **normal media** controlled by the phone's volume like music; the mic is re-acquired fresh for the next listen turn (fresh stream + context each turn, which also avoids the old closed-context reuse bug). In-call volume slider retained.
- Lint clean. Frontend-only (hot-reloads). Preview-only — redeploy for production.
- ⚠️ Can only be verified on a real phone (needs mic + hardware volume). TRUE private earpiece ("hold to ear") routing is NOT possible on web at all — that requires the native mobile app. This fix makes it behave like music (quiet when you lower the phone), not earpiece-private.

## Fix — AI voice call: volume control + reduced latency (2026-06, web)
- **Volume:** added an in-call **volume slider** (0–100%, default 70%, persisted in `localStorage` as `aichar.volume`) next to the existing speaker on/off toggle. `playAudio` now applies `audio.volume`; 0 = muted. Fixes "can't turn it down / too loud through speakers." (Web can't route to the earpiece — only media volume is controllable.)
- **Latency ("takes too long to think"):**
  - Live weather is now **cached 15 min** per rounded lat/lon (`_WEATHER_CACHE`) instead of an HTTP call every turn; timeout cut 6s→4s.
  - Voice replies constrained to **1-3 short sentences** → much faster eleven_v3 synthesis (verified: audio ~441KB→~245KB).
- **Verified (curl):** turn returns short reply + audio; weather cached on 2nd turn. Lint clean. Preview-only — redeploy for production.
- ⚠️ eleven_v3 (the emotional model) is inherently slower than fast models; the above reduces latency but a true "instant" feel would require a faster, less-expressive model (tradeoff offered to user).

## Feature — AI character voice: realistic emotion (eleven_v3 + audio tags) (2026-06, web)
- Switched character TTS from `eleven_multilingual_v2` → **`eleven_v3`** (ElevenLabs' most expressive model) with a safe **fallback** to `eleven_multilingual_v2` if v3 is unavailable for the account/voice (audio never fully breaks).
- The character may now embed inline **audio tags** (`[laughs]`, `[giggles]`, `[sighs]`, `[whispers]`, `[excited]`, `[sad]`, `[crying]`, `[nervously]`, `[gasps]`…) + ellipses for breathing/pauses — the voice **performs** them. Tags are injected via the voice-call system prompt and **stripped** (`_strip_tags` / `AUDIO_TAG_RE`) from the caption shown on screen and the stored message, so users never see the tag text. Greeting gets a subtle `[warmly]`.
- Voice settings tuned for emotion: stability 0.4, similarity_boost 0.8, style 0.5, speaker boost on.
- **Verified (curl):** voice-turn returns a clean caption (no visible tags) + ~441KB of v3 audio. Lint clean. Preview-only — redeploy for production.
- ⚠️ Caveats: v3 has higher latency than multilingual_v2 (call replies may feel slightly slower), and v3 can alter how a cloned voice sounds; true realism must be judged by listening. If a voice lacks emotional range, a tag may occasionally be read aloud (rare).

## Feature — AI characters: real-world awareness + new call greeting (2026-06, web)
- **Real-world context:** the web client now sends the device's current time (+ timezone) with every character message/voice-turn, and (if the user allows location on a call) their lat/lon. The backend injects "REAL-WORLD CONTEXT (true right now)" into the character's system prompt — exact local time + **live weather** via the free, keyless **Open-Meteo** API (WMO code → plain words like "raining"). So replies are time/weather-accurate. No API key needed.
  - Backend: `SendBody`/`VoiceTurnBody` gained `local_time`, `tz`, `lat`, `lon`; new `_realworld_context()` + `WEATHER_CODES`; `_system()`/`_reply()` take a `context` block.
  - Frontend (`AiCharacterChat.jsx`): `gatherContext()` (time+tz, cached geo) sent on typing-send and voice-turns; `primeGeo()` requests location once when a call starts (best-effort — weather only if granted).
- **New call greeting:** when the character "answers the phone" it's now a quick **1-word greeting + the nickname** the user set (e.g., "Hey, superstar!"), instead of the old "Hey! It's {name}. Great to finally talk…". Falls back to the real name, then just the word, if no nickname.
- **Verified (curl):** greeting returns "Hey, superstar!"; a voice-turn with time+coords made the character say the correct local time; Open-Meteo reachable. Lint clean. Preview-only — redeploy for production.

## Feature — Connect social accounts: TikTok import (Phase A, embed-only) (2026-06, web)
- **Scope decision:** re-uploading/re-hosting TikTok videos is NOT possible (API gives no downloadable file, TikTok Dev Terms forbid re-hosting, licensed music = copyright). Built the **compliant embed approach**: import each video's metadata (caption, cover, official `embed_link`, create_time) and play via TikTok's official embed. No media is ever downloaded/stored.
- **Backend (`routes/social.py`, new):** TikTok Login Kit OAuth v2 + Display API.
  - `GET /api/social/connections` (status + `tiktok_configured`), `GET /api/social/tiktok/login?token=` (JWT via query like live WS → redirect to TikTok), `GET /api/social/tiktok/callback` (token exchange → store connection → auto-import → redirect `/settings?tiktok=connected`), `POST /api/social/tiktok/import`, `DELETE /api/social/tiktok`, `GET /api/social/videos/{user_id}`.
  - Tokens stored in `social_connections`, video metadata in `social_videos`; refresh-token handling with rotation; scopes `user.info.basic,video.list`.
  - **Gated:** when keys absent, connect shows a friendly "not set up yet" page — nothing breaks (same pattern as Cloudflare demo mode).
  - Keys added to settings store (admin-editable, per-env): `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` (= `{backend}/api/social/tiktok/callback`).
- **Frontend:** Settings → "Connected accounts" card (Connect/Re-import/Disconnect TikTok; shows "Coming soon" until configured). Profile → new **TikTok tab** (shown only if imported videos exist) rendering official embed tiles (cover → tap → TikTok iframe player).
- **Verified (curl + UI):** gated endpoints return correct state; Settings TikTok row renders; lint clean (py + js). Preview-only — redeploy for production.
- **BLOCKED on user:** needs a TikTok developer app + approval (days–2 weeks) + keys entered in Admin → Keys before OAuth/import can run. OAuth round-trip is UNTESTED (no keys yet).
- **Future:** YouTube → Videos tab, Facebook Page → posts (same embed model). Phase B = optional copyright/music fingerprint gate on uploads (needs a service like ACRCloud + keys/cost). Phase C = finish live audio / co-host.

## Feature — Co-host "join on stage" + live audio fix + join/share messages (2026-06, web)
- **Co-host / join on stage (NEW):** built on the existing Cloudflare WHIP/WHEP infra (no new paid service). Viewers tap the ✋ button to request the stage; the host sees a request panel and Adds/Denies. On approval the backend provisions a per-co-host Cloudflare live input and sends the WHIP publish URL **only** to that co-host (never broadcast); everyone else gets the co-host's WHEP play URL via a `stage_update` and renders a co-host tile strip. Co-hosts can Leave; the host can Remove; dropping the socket frees the slot and disables the CF input. Works for video and audio-only.
  - WS protocol (new): `stage_request`, `stage_approve`, `stage_deny`, `stage_leave`, `stage_remove`; server→client `stage_request`, `stage_grant`, `stage_update`, `stage_deny`. Hub now routes to a specific user (`send_to_user`).
  - New files/edits: `components/LiveStage.jsx` (tile strip, WHEP players, local tile), `LiveOverlay.jsx` (✋ request / host approve panel / leave), `useLiveSocket.js` (stage state + senders), `LiveWatch.jsx` (publish-on-grant via `whipPublish`), `GoLive.jsx` (owner stage strip + approvals), `routes/live.py`.
  - **Verified (3-client WS test):** request→approve→grant(only viewer)→stage_update(all)→leave→slot freed; provisioned REAL Cloudflare URLs (CF is configured in preview too).
- **Live audio fix:** browsers block autoplay-with-sound → viewer media starts **muted** with a "Tap for sound" button that unmutes+plays (video & audio-only).
- **Join/share messages:** owner's own "joined" is suppressed (viewers' joins show); new `share` WS event posts "X shared the live" when anyone taps Share.
- Lint clean (py + js). Preview-only — redeploy for production.
- ⚠️ Co-host media (actual multi-cam/mic publish) can only be validated on real devices (2+), not headlessly. Signaling + CF provisioning are verified. **Mobile live has no co-host (web-only).**

## Fix/feature — live audio playback + join & share messages (2026-06, web)
- **Audio didn't work (video & audio-only):** root cause was browser autoplay policy — the viewer's media element played with sound before any user gesture, so the browser blocked it (silence). Fix: `LiveWatch` now starts the stream **muted** (so it reliably plays) and shows a **"Tap for sound"** button that unmutes + plays on tap. Works for both video and audio-only streams.
- **"X joined" messages:** the backend already broadcast them; now it suppresses the **owner's own** join so only real viewer joins show in chat.
- **"X shared the live":** new WS `share` event — broadcast when anyone taps Share (viewer or broadcaster). Verified over a WS client ("semidiepie shared the live"). Added `sendShare` to `useLiveSocket`; wired in `LiveWatch` + `GoLive`.
- Lint clean (py + js). Preview-only — redeploy for production.
- **Co-host / "join on stage" is NOT yet built** — it requires a real-time multi-publisher SFU (Cloudflare Realtime/Calls or Agora/LiveKit) and multi-device testing that can't be validated in preview. Deferred pending an integration decision.

## Fix — live gift tray showed "0 tokens" despite a funded wallet (2026-06, web)
- **Root cause:** `LiveWatch` fed the gift tray `live.balance ?? user?.tokens ?? 0`, but the live WS never sent a balance on connect, so it fell back to the **stale client `user.tokens`** (not refreshed after an admin top-up) → tray showed 0 and disabled every gift button, even with 100K in the wallet (which the Wallet page reads fresh from the DB).
- **Fix:** the live WS now sends the authoritative DB balance in its `init` payload (`wallet_core.get_balance`), and `useLiveSocket` seeds `balance` from it. The tray now always shows the real balance.
- **Verified (ws client):** founder set to 100000 → WS `init` returned `balance:100000`. Lint clean. Preview-only — redeploy for production.

## Fix — custom Market frame: profile avatar + homepage ring overlap (2026-06, web)
- **Profile wasn't showing the custom frame:** `Profile.jsx` still used the old `frame={equipped_frame}` string (="custom", no spec). Now uses `frameOf(target)` so the custom spec object resolves.
- **Homepage orange ring blocked the frame:** feed avatars pass `ring` (Tailwind orange ring at z-10) AND a frame — the ring covered the cosmetic frame. `Avatar` now suppresses the plain orange `ring` whenever a cosmetic `frame` is shown (frame takes precedence). Live red ring still shows.
- **Verified (screenshot):** founder custom gradient frame renders on Home feed cards + composer + sidebar AND the Profile header, no orange ring covering it. Lint clean. Preview-only — redeploy for production.

## Fix — custom Market frame now renders everywhere (2026-06, web)
- **Root cause:** the Sage-designed `custom_frame` spec was only returned by the profile/`UserPublic` endpoint, so every other author serializer (feed/posts/reels, comments + the batch comment query, videos, messages peer/member, calls) sent `equipped_frame:"custom"` with NO spec → `frameOf()` returned `"custom"` and `Avatar` couldn't draw it anywhere but your own profile.
- **Fix:** added `custom_frame` alongside `equipped_frame` in all those serializers (`server.py` post/comment author + batch comment query, `routes/videos.py` x3, `routes/messages.py` `_member_public`, `routes/calls.py`). Frontend: `frameOf(u)` now returns the `custom_frame` spec object when `equipped_frame==="custom"`; `Avatar` accepts a preset-id string OR a spec object (back-compat with `frame="custom"`+`frameStyle` on Profile/AppShell/Market kept).
- **Verified (curl):** founder equipped a custom frame → feed author AND comment author both return the full `custom_frame` spec. Lint clean (py + js). Preview-only — redeploy for production.

## Update — Audio live + advanced Go Live options; AI characters look like real accounts; voice-call fixes (2026-06, web)
- **Session close-out (2026-06):** cleaned 3 unused `eslint-disable` directives in `AiCharacterChat.jsx` → file lints clean. Per user request (low credits), did NOT run the testing agent on the combined changes. All items below are **agent-tested in preview during prior sessions** (not re-tested this session); the AI-character microphone/VAD fix remains **NOT confirmed by real browser/device mic testing** — treat as unverified until the user validates on preview with a real mic.
- **AI characters de-"AI"-ified:** removed "AI Characters" section label, Sparkles badges and "· AI character" subtitle in Messages + chat header — they now read as normal accounts (avatar, name, persona snippet, subtle + add / edit-on-hover).
- **Voice call "can't hear me" fix (`AiCharacterChat.jsx`):** AudioContext now `resume()`d (it was starting suspended so VAD never saw audio), VAD calibrates ambient noise for ~10 frames then uses an adaptive threshold, silence window 1.0s, max turn 15s, and the mic circle is now a **tap-to-send** fallback. Mic-blocked error tells the user to open the preview in its own tab.
- **Audio live + advanced Go Live options** (`routes/live.py`, `GoLive.jsx`, `LiveWatch.jsx`, `LiveOverlay.jsx`):
  - `CreateLiveBody`/stream doc gained `audio_only`, `visibility` (public|followers), `chat_enabled`, `gifts_enabled`; surfaced in `public_stream` (`has_video=false` when audio_only). Audio rooms force webrtc ingest; broadcaster publishes audio-only getUserMedia; viewers/broadcaster see a **pulsing avatar** stage (hidden `<video>` still plays the sound).
  - Enforcement: followers-only blocks non-followers on `GET /api/live/{id}` (403); WS drops chat when `chat_enabled=false` and rejects gifts when `gifts_enabled=false`; `LiveOverlay` hides the chat input/gift button accordingly.
  - GoLive setup screen: Video/Audio toggle + Public/Followers + chat/gifts switches.
  - Co-host intentionally NOT built (deferred).
- **Verified (agent, curl + screenshot):** audio+followers+gifts-off stream created with correct flags & has_video false; followers-only returns 403 for a true non-follower, 200 for owner/follower; public video still works; GoLive options UI renders. Preview-only; web-only.


## Fix — more realistic AI voice (2026-06)
- Root cause: TTS used `eleven_turbo_v2_5` (low-latency, less natural). Switched both AI characters (`routes/ai_characters.py` TTS_MODEL) and Sage (`routes/sage.py` SAGE_TTS_MODEL) to **`eleven_multilingual_v2`** (lifelike, matches the ElevenLabs website) + `VoiceSettings(stability=0.45, similarity_boost=0.85, style=0.15, use_speaker_boost=True)`.
- Verified: voice-turn returns valid mp3 and payload ~3x larger (richer audio). Slight latency increase vs turbo is the tradeoff for realism. Preview-only until redeploy.


## Update — AI character memory + relationship profile (2026-06, web)
- Extended `ai_characters`: `your_name`, `nickname` (what the character calls the admin), `relationship` (how they know each other), and `memories` (trainable fact list `{id,text,created_at}`).
- Endpoints: `POST /api/ai-characters/{id}/memory`, `DELETE .../memory/{mem_id}` (admin-only). Create/PUT persist the new relationship fields.
- `_system()` injects name/nickname/relationship + all memories ("treat as fact, never ask again, never say you can't remember"); conversation history window raised 20→40. Full per-character+admin thread already persisted, so it remembers the conversation.
- UI: `CharacterFormDialog` adds Your name / What they call you / How they know you + a Memory/Training manager (edit mode). `AiCharacterChat` header gains a 🧠 Teach button to add a memory mid-chat.
- **Verified (agent, curl + screenshot):** created Maya (your_name Alex, nickname "sunshine", relationship), trained 2 memories (dog Max, marathon) → reply used "sunshine" + recalled Max + marathon unprompted, and persisted the dog across a follow-up turn. Edit form renders all fields + memory manager; character shows 🔊 voice (new key validated `X8ye6rf6ZloQ3SE3PQNM`). Preview-only; web-only.


## Update — Admin custom AI characters in Messages + admin reset-spins (2026-06, web)
- **Admin "Reset Spins":** `POST /api/admin/users/{id}/reset-spins` refills a user's slot `energy` to each game's `energy_cap` across all their `slots_state`. Button added to Admin → Accounts (per-user "Spins"). Verified 0→50.
- **Admin-only custom AI characters** (`backend/routes/ai_characters.py`, new router): admins create voice AI characters that live in Messages. Fields: display name, @username, avatar (Cloudinary), personality/persona, ElevenLabs voice. Endpoints (all super-admin gated): POST/GET/PUT/DELETE `/api/ai-characters`, `GET/DELETE .../{id}/thread`, `POST .../{id}/send` (LLM reply via Emergent key Claude-sonnet-4-6, in-character + ElevenLabs TTS audio), `POST .../{id}/voice-turn` (greeting/spoken reply + audio), `POST /api/ai-characters/stt` (ElevenLabs STT). Reuses the proven Sage voice stack but **per-character** — Sage's own voice (`SAGE_VOICE_ID`) is untouched.
  - **Per-character voice, realtime-editable:** each character stores its own `voice_id`; `parse_voice_id()` accepts a raw ElevenLabs Voice ID OR a voice URL (extracts `voiceId`). PUT updates the voice live (next TTS uses it). Admins can create unlimited characters.
  - **Live voice validation:** on create/update, `_voice_exists()` checks the voice against the configured ElevenLabs account → `voice_valid`. UI warns ("not in your account") so the admin knows before relying on it.
  - **Hands-free voice chat (`AiCharacterChat.jsx`):** type OR tap the phone → VAD (WebAudio RMS + silence ~1.1s) auto-detects when the admin stops talking, transcribes (STT), the character auto-replies in text AND speaks (TTS), then auto-listens again — a smooth real conversation loop. Admin-only section + form added to `Messages.jsx`.
- **Verified (agent, curl + screenshot):** create stores voice_id, link-parse extracts id, LLM reply in-character, PUT changes voice live, non-admin GET→403, Sage voice unchanged. **TTS pipeline proven end-to-end with a premade voice (returned 66KB mp3)**; the user's pasted ID `X8ye6rf6ZloQ3SE3PQNM` returns `voice_valid:false` / `voice_not_found` — it must be ADDED to the ElevenLabs account to speak. UI form + admin section render correctly. Preview-only; NOT user-confirmed; web-only.

## PENDING / QUEUED
- **Advanced Go Live** (audio-only pulsing-avatar live, stream options, co-host) — scoped, awaiting the user's answers; NOT started.


## Update — Slots re-brand + metered token faucet + admin tile image upload (2026-06, web)
- **PostMePlex-themed default slot:** `DEFAULT_SYMBOLS`/`DEFAULT_BUILDINGS` rebranded to PostMePlex (orange #FF6B3D accent; 💬 coins, 🔥 jackpot, 🪙 token, 🛡️ shield, ⚡ attack, 🚀 raid; Feed Tower/Live Studio/Creator HQ/Token Vault). Seeded a public **"PostMePlex Spin"** (`postmeplex-spin`) game in `seed_default_game`. Sage studio now defaults slots to the PostMePlex brand unless the admin asks otherwise.
- **Real spin mechanic (web):** `SlotsGame.jsx` reels now roll continuously and **stop one-by-one left→right** (~650/520/560ms) with a blur-while-rolling effect and per-reel settle, instead of a single snap.
- **Metered real-token faucet (cash-out ready):** games now pay REAL PMP wallet tokens, hard-capped at **50 tokens / rolling 20h per user** across ALL games. New `wallet_core.grant_capped()` + `game_earned_recently()` (ledger-summed, kinds `game`+`slots`), `GAME_DAILY_CAP=50`. Slots: the 🪙 `token` symbol replaces the old energy symbol — 3-of-a-kind = +value real tokens (value clamped 1-10, default 2), 2-of-a-kind = +1; everything else stays in-game coins. `complete_level` level rewards now also route through `grant_capped` (share the same cap). Slots UI shows 🪙 earned-today/cap; spin/state responses include `tokens_earned`, `token_capped`, `token_earned_today`, `token_cap`.
- **Admin custom tile images (match3):** `_coerce_tiles` accepts an optional per-tile `image` (https URL ≤500 chars); `admin_create`/`admin_update` coerce+validate tiles. `AdminGames.jsx` GameRow adds a per-tile uploader (Cloudinary unsigned → `secure_url`) with Change/Remove; `Match3Board.jsx` renders `tile.image` (object-cover) instead of the lucide icon when present.
- **Verified (agent, curl + module + screenshot):** seeded PostMePlex Spin renders on-brand; 150 spins earned 9 real tokens (wallet 100→109), `token_earned_today` tracks; `grant_capped(100)` clamped to 41 at the 50 cap then 0 after — cap enforced. Tile PUT: https image stored, http rejected, removal works. UI screenshot confirms orange slot machine, reel settle, rewards legend, My Village, Daily Wheel, and the admin tile-image editor. Did NOT run the formal testing agent (conserving Sage/LLM credits). NOT user-confirmed; preview-only — redeploy for production. Web-only (mobile unchanged).


## Feature — Slots / Spin & Raid engine (Coin Master-style) for the AI Game Studio (2026-06, web)
- **Why:** admin asked Sage for "a game like Coin Master" but got a non-slots game. Root cause: the AI Game Studio is NOT an arbitrary code generator — it only builds tuned instances of fixed, rendered engines (previously match3/memory/quiz/tapper/farm), and no slot-machine engine existed, so Sage force-mapped the request. Fix = add a real **`slots`** engine.
- **Backend (`routes/games.py`):** added `"slots"` to `KINDS`; `_validate_config` slots branch (6 symbol roles coin/jackpot/energy/shield/attack/raid with themeable emoji+label+value; 4-6 themed buildings; spin_cost/start_coins/energy_cap/accent). Added slots to `GEN_SYSTEM` + `STUDIO_SYSTEM` so Sage maps "coin master/slots/spin & raid" → `slots` and themes it per chat. Non-level (like farm): `slots_state` collection + endpoints `GET /api/games/{slug}/slots`, `POST .../spin` (uses 1 energy else spin_cost coins; weighted 3-reel; 3-of-a-kind = coin/jackpot/energy/shield reward or attack-steal/raid-dig; pair-of-coin = ¼ payout; energy regen +1/5min), `POST .../build` (upgrade village building, cost scales w/ level & trophies; all Lv5 → +1 trophy + 5k bonus + reset), `POST .../wheel` (daily, 20h cooldown). `_create_from_spec` sets level_count=1 for slots; `admin_delete` cleans `slots_state`. **Self-contained economy** — in-game coins/spins only; mints NO real PostMePlex tokens.
- **Web:** `components/games/SlotsGame.jsx` (stats bar, animated 3-reel slot machine w/ spin, attack/raid/jackpot flash overlay, My Village upgrade modal, Daily Wheel, Slot Rewards legend). `GameMap.jsx` renders it directly for `kind==="slots"` (like farm). `Games.jsx` list shows "Spin & Raid" badge.
- **Verified (agent, curl+screenshot):** seeded a public "Cat Master" slots game → initial state (5000 coins/50 energy), 5 spins (energy decrement, 3-fish energy reward, coin-pair bonus), build (−1000 coins, Lv1), unknown building 400, daily wheel (+5000) then 400 cooldown. Sage `ai-create` for "a game like Coin Master called Cat Master" now returns **kind=slots** fully themed (cat symbols, cat village, pink accent). Web UI screenshot confirms Lucky Slots reels, stats, My Village modal, Daily Wheel + legend render + spin works. NOT user-confirmed; NOT on production (needs redeploy). Web-only (mobile game studio unchanged).


## Overview
**PostMePlex** is a creator-first social platform combining Facebook (text/photo posts), Instagram (3-column profile grid + Stories), TikTok (vertical reels), and long-form Blogs + Videos. Deep dark `#12141c` palette with vivid orange `#FF6B3D` accents — energetic, streamer-coded, never AI-slop. Ships on **iOS + Android (Expo)** and **Desktop / Web (React)**, all against the same FastAPI + MongoDB backend.

## Feature — Sage Cosmetic Studio + follower post notifications (2026-06, web)
- **Sage Cosmetic Studio** (Market): conversational studio where any user designs a custom **frame** (animated gradient ring: 3 colors + spin speed + glow) or **theme** (accent HSL + falling-emoji animation). Optional **reference image upload** feeds Sage's vision (emergentintegrations `ImageContent`, gpt-4.1-mini). **Costs 50 tokens per creation** (charged on build via `wallet_core.spend`; 402 if short). Endpoints `POST /api/market/cosmetic-studio/chat` & `/create`; sessions in `cosmetic_studio_sessions`; resilient turn handler degrades gracefully. Saved as `custom_frame`/`custom_theme` on the user (added to `UserPublic`), auto-equipped. `update_cosmetics` accepts `equipped_frame="custom"` / `active_theme="custom"`. Web rendering: `Avatar` gained a `frameStyle` prop (inline conic-gradient); `ThemeLayer` applies `custom_theme`; Market has the studio card + re-equip tiles for created frame/theme.
- **Follower post notifications**: `create_post` now fans out to all the author's followers (`_notify_followers_new_post`) — in-app notification (type `post`, link `/reels/{id}` for reels else `/posts/{id}` on web, `post_id` for mobile routing) + native push + web push, mirroring the live-notify pattern.
- **Regression fixed:** the match-3 burst particles reused `.pmp-particle`, clobbering ThemeLayer's falling-emoji animation — renamed to `.pmp-burst`.
- **Verified (testing agent iteration_46 — PASS):** backend 10/10 pytest (studio chat frame+theme reach ready with normalized spec; create charges exactly 50 (100→50), saves+auto-equips custom_frame/theme, clears session, 402/400/404 guards; follower gets type `post` notif w/ `/posts/{id}` link, non-followers don't). Web e2e PASS — Market studio renders (`cosmetic-studio`, frame/theme toggle, image upload, live Sage chat), Create deducts 50, custom frame equips + renders on avatar. Reel-link fix applied (reels now link to `/reels/{id}`). NOT user-confirmed on production (needs redeploy). Mobile cosmetic studio NOT added (web only).

## Feature — Admin AI Studio (conversational) + token control + bans (2026-06, web admin)
- **Conversational AI Game Studio** (`AdminGames.jsx` + `games.py` `/api/admin/games/studio/chat` & `/studio/build`): Sage chats back-and-forth, asking one clarifying question at a time (theme/difficulty/levels/mechanics), then proposes a full build spec; admin hits "Build & save (private)". Transcript stored in `game_studio_sessions` (stateless-safe replay); uses Emergent LLM (`openai gpt-4.1-mini` via emergentintegrations). **Honest scope:** builds within the 5 rendered engines (match3/memory/quiz/tapper/farm), tuned via conversation — not arbitrary new engines. Replaced the old one-shot generator.
- **Full admin token control** (`AdminAccounts.jsx` + `POST /api/admin/users/{id}/tokens` with `op: add|remove|set`): super-admin can add, remove (clamped ≥0) or set an exact balance; logged to the wallet ledger. `wallet_core.adjust()` / `set_balance()` added.
- **Ban system**: `POST /api/admin/users/{id}/ban|unban`. Banned users blocked at `login`, `login-pin`, and inside `get_current_user` (403, invalidates active sessions). Founder/official/admin/self protected. Admin → Accounts shows banned badge + Ban/Unban toggle.
- **Verified:** curl — token add/remove/set (600/400/42), ban→/auth/me & login-pin both 403, unban→200, founder-ban→400 protected; studio chat turn1(ask)→turn2(ready quiz spec)→build(private)→delete all pass. UI — both admin pages render (40 rows with token controls + ban, founder protected); live studio conversation confirmed (Sage asked a follow-up question in-UI). NOT user-confirmed; NOT on production (needs redeploy).

## Feature — PostMePlex Match: high-fidelity Candy Crush revamp (2026-06, web) — iteration 45
- **Scope:** upgraded the existing web match-3 "PostMePlex Match" board + saga map to a Candy-Crush-grade experience (web only; kept token rewards + progress). Engine `games/match3.js` gained a **wrapped** special (L/T matches → 3×3 blast) alongside existing striped (row/col) + color bomb, plus `resolveClears()` for the Smash booster.
- **Board (`Match3Board.jsx` rewrite):** absolutely-positioned glossy candies (CSS radial-gloss + PostMePlex icons), transform-based smooth falls, drop-in / pop / particle-burst animations, combo score popups, pink Candy-Crush HUD (moves box + star progress bar), and a **booster bar** — Shuffle (×3), Smash/Hammer (×3), +5 Moves (×2). Asset-free **sound** via Web Audio (`games/sfx.js`): pops rise in pitch with combos, swap/invalid/special/win/lose chimes, mute toggle.
- **Saga map (`GameMap.jsx` + CSS):** scenic candy-gradient path with glossy level nodes (locked/open-gold-glow/done-pink), zig-zag layout + connector dots.
- **Verified:** testing agent iteration_45 — valid swap scores + decrements moves; invalid swap shakes & no-ops; all 3 boosters work; cascades/auto-reshuffle; finish→`/complete`→+25 tokens→next level unlocks (confirmed L2 clear → 3/… unlocked, persisted). One CRITICAL bug found & FIXED: `sfx.setMuted` was a standalone export not an object method (crashed on mute tap) → added `setMuted` to the `sfx` object. Board + saga visually confirmed (64 candies, boosters, glossy nodes). NOT user-confirmed; NOT on production (needs redeploy).

## Feature — Tokens economy + hamburger menu (2026-06, web + mobile) — iteration 44
- **Tokens core (`backend/wallet_core.py`):** every account has a `tokens` wallet (welcome 100, backfilled for existing users). `grant()`/`spend()` are the only mutators — `spend()` is an atomic conditional debit (never overdraws); every change is logged to `token_tx` ledger.
- **Earn:** daily reward +25 (once per ~20h), winning a game level the first time (`10 + stars*5`, hooked into `games.py` complete_level → returns `tokens_earned`), admin grant (`POST /api/admin/users/{id}/tokens`, super-admin).
- **Spend:** premium frames in the Market Store (`POST /api/store/buy`), live gifts (live WS gift now debits sender + credits broadcaster, emits `{type:'wallet',balance}` / `{type:'error',detail:'insufficient_tokens'}`), and **e-transfer** to any username (`POST /api/wallet/transfer` — self/unknown/overdraw guarded; notifies recipient).
- **Wallet API (`backend/routes/wallet.py`):** `GET /api/wallet` (balance+ledger+daily status), `POST /api/wallet/daily`, `GET /api/store/items`, `POST /api/store/buy`, `POST /api/wallet/transfer`.
- **Store = 10 premium frames** (violet 120 … galaxy 500) reusing frame CSS; 4 new frames added (aurora/sunset/molten/galaxy). Premium frames require purchase before equip (equip gated 403 in `/api/market/cosmetics`); gold/hearts/emerald stay free.
- **Web:** FB-style **hamburger menu** (`HamburgerMenu.jsx`, replaces the mobile top-bar avatar dropdown) with profile card, wallet balance + claim-daily, shortcuts & links; new **/wallet** page (`Wallet.jsx`: balance, daily, e-transfer, history); **Market** rewritten with Store/free/themes + balance pill; live gift tray shows balance + disables unaffordable gifts. Desktop sidebar got a Wallet nav + balance line.
- **Mobile:** **HamburgerDrawer** (left Modal from home header menu button) with balance + claim + shortcuts; new **/wallet** screen (balance, daily, e-transfer, Store with frame-ring previews, history); live gift tray shows balance + affordability. `AuthContext` gained `patchUser`; `client.ts` gained `tokens/owned_frames` + wallet types.
- **Verified:** testing agent iteration_44 — backend 18/18 pytest PASS (wallet/daily/store/transfer/game-reward/admin-grant/equip-gating/live-WS-gift). Web e2e PASS (hamburger opens w/ balance, /wallet + transfer, /market store). Mobile authed screens NOT reachable via Expo **web** preview due to a PRE-EXISTING CORS limitation (`allow_origins=['*']`+`allow_credentials=True`); mobile code/testIDs present and correct — validates on native/Expo Go (not subject to browser CORS). NOT user-confirmed on production (needs redeploy).

## Previous investigation — "completing a game doesn't unlock next level" (2026-06, web)
- **Preview verified WORKING (agent-tested):** backend `POST /api/games/{slug}/levels/{n}/complete` logic is correct — `stars_for()` returns ≥1 when `score >= target`, so `won=true` → `unlocked = max(unlocked, n+1)` persisted to `game_progress`. Re-verified via fresh API account (level 1 complete, score 2000 → won/1 star/unlocked:2) and a browser map test (level 2 goes from disabled → `pmp-level-open`).
- **No code change needed** — current preview code unlocks correctly. Root cause is almost certainly that **production runs an older deployment** predating the game-completion/finish-button fixes (commits 7e9199f → 6ae663d).
- **User action required:** redeploy latest preview code to production and retest the exact flow (reach target → press Finish). If it STILL fails in a FRESH production build, capture the `/complete` response + game progress for further debugging.


## Feature — Admin account cleanup tool (delete test/junk users) (2026-06, web) — iteration 44
- **Why:** user saw leftover test accounts (e.g. @liveprobe_9b3b, @realprod_aae92 "Prod Test", "Chg Test", "Qwerty" — default lightning avatar, empty feeds) following the founder on PRODUCTION. These are automated-test scratch accounts whose handles are NOT `test_`-prefixed, so startup cleanup never removes them. Preview and production use SEPARATE databases (preview had `test_*` accounts; production has different junk) — so these must be deleted on the live site by an admin.
- **Backend:** `DELETE /api/admin/users/{user_id}` (super-admin only; 403 non-admin; 400 if target is official/super_admin/self → protected; cascades delete of the user's posts, follows both directions, and stories). Reuses existing `GET /api/admin/users?q=` search.
- **Web:** new **Admin → Accounts** tab (`/admin/accounts`, `pages/AdminAccounts.jsx`): debounced search over all users; each row shows avatar/name/@handle/posts; trash button deletes (with confirm); founder + official accounts show "protected" with delete disabled.
- **Verified (curl):** delete self→400, delete junk→200 then profile 404, non-admin→403, UI renders with protected rows disabled. Also manually purged 13 leftover `test_*`/"Test" accounts from the PREVIEW db (36 real seed users remain).
- **User action required:** redeploy so the Accounts tab reaches production, then Admin → Accounts → search "test"/"probe"/"qwerty" etc. and delete the junk accounts (they live only in the production DB, which the agent can't access).


## Feature — Manage curated accounts (edit account, edit/delete reels, Sage add clips) (2026-06, web) — iteration 43
- Extends `/admin/curate` with a **"Manage curated accounts"** section (`components/CuratedAccountManager.jsx`): lists all `is_curated` accounts; clicking opens an edit dialog to change display name / avatar / category, edit each reel's caption (blur-save) and delete reels, and a **Sage AI** button to add N more royalty-free clips for the account's category.
- Backend (all super-admin, 403 otherwise): `GET /api/admin/curated-accounts`, `PATCH /api/admin/curated-accounts/{id}`, `POST /api/admin/accounts/{id}/sage-reels {count,query?}` (Pixabay by category via new `_pixabay_videos(query,count)` helper, library fallback, adds to library), `PATCH /api/admin/reels/{id}` + `DELETE /api/admin/reels/{id}` (admin override — not ownership-bound).
- **Verified:** testing agent iteration_43 — backend 15/15 pytest + full web UI flow (open dialog, edit+persist, Sage add 2 Pixabay reels, caption blur-save, reel delete) all pass. Added `DialogDescription` for a11y. DB cleaned, library restored to 3 seed clips. Web-only.


## Feature — Admin curated-account provisioning + Sage AI clip finder (2026-06, web) — iteration 42
- **Compliance note:** user's original ask was TikTok scraping + impersonation + fake verification → DECLINED (ToS/copyright/impersonation). Built the compliant version below (admin-provided + royalty-free content only).
- **Admin panel** (`/admin/curate`, super-admin only, new "Curated accounts" tab in AdminTabs): form = avatar upload + profile name + optional handle + category + reel count → **"Sync & Create Account"** creates a VERIFIED account (`is_verified=true`, unique auto-handle, default avatar via `DEFAULT_AVATAR_URL`) and auto-populates its feed with N reels from the curated library.
- **Royalty-free clip library:** Mongo `curated_clips`, idempotently seeded (3 Cloudinary demo CC0 clips) in `seed()`. `GET/POST /api/admin/curated-clips`. Bulk MP4 uploader in the panel pushes Cloudinary uploads into the library. New accounts `$sample` from it.
- **Sage AI clip finder:** `POST /api/admin/sage-clip {query}` → fetches a fresh royalty-free video from **Pixabay** (`PIXABAY_API_KEY` in backend/.env; keyed off the category; uses NO Sage/LLM credits — it's a keyword video search), adds it to the library, falls back to a random library clip if Pixabay fails. Web "✨ Sage AI" button in the create panel pulls a clip, previews the thumbnail, and bumps the library count.
- **Endpoints (all super-admin, 403 otherwise):** `POST /api/admin/curated-accounts`, `GET/POST /api/admin/curated-clips`, `POST /api/admin/sage-clip`, `POST /api/admin/accounts/{user_id}/reels` (bulk assign; 404 if missing).
- **Critical bug fixed (test iteration 42):** curated emails used reserved `.local` TLD → Pydantic `EmailStr` rejected it → 500 on viewing a curated profile. Changed to `@curated.postmeplex.com` (verified 200).
- **Verified:** testing agent iteration_42 backend 14/14 pytest + web UI (create flow, redirect for non-admins, clip library) all pass; main agent additionally curl+UI-verified the Sage AI Pixabay pull (toast + preview + library increment) and the email-bug fix. Web-only; test data cleaned, library reset to 3 seed clips.


## Web→mobile parity ports + mobile push diagnosis (2026-06)
- **Ported recent web features to mobile:**
  - **Follow back:** `ProfileView.tsx` now reads `followed_by` and shows "Follow back" (target follows you, you don't follow them) → else "Following"/"Follow". Backend already returns `followed_by` on `/users/{id}`.
  - **Admin feature/boost toggle:** `PostCard.tsx` shows a star toggle for `user.is_super_admin` that calls `POST /admin/feature {type: post.type, id, featured}` (matches web FeatureToggle); `featured` label now driven by local state. Added `featured?: boolean` to `FeedItem` (client.ts).
  - **Support number:** `settings.tsx` new "Support" section → "Call support · Sage AI" row dials `tel:+18005076788` via `Linking.openURL`.
  - (Stories already native on mobile; splash/visual-parity/iOS-safe-area were web-only and don't apply to native.)
- **Mobile push notifications — diagnosis (integration_expert verified):** Backend relay (`/register-push`→`/api/v1/push/users/register`, `send_push`→`/api/v1/push/trigger` with `X-Push-Key`), token via `getDevicePushTokenAsync`, tap handlers (`addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync`), module-scope `setNotificationHandler`/`setNotificationChannelAsync`, `Linking.openSettings` nudge, and the `expo-notifications` plugin are ALL present and correct per the verified Emergent push playbook. **Root cause of past mobile-push failure: Android FCM not configured — no `google-services.json` and no `android.googleServicesFile` in `app.json`.** This is why only web (VAPID) push worked.
  - **BLOCKED on user:** must provide Firebase `google-services.json` for Android package `app.emergent.vibesstream169e45e05`. Once provided → save to `mobile/google-services.json` + add `expo.android.googleServicesFile: "./google-services.json"`. Did NOT add the config reference yet (a missing file would break the Android build).
  - Push only works on a native build (Publish→Deploy→Generate build), not Expo Go / web preview; build UI additionally prompts for a Google service account JSON (Android) + APNs `.p8` (iOS).
- **Verified:** mobile lint clean (pre-existing ProfileView warnings only); mobile restarted + Expo preview healthy. Backend `followed_by` and `/admin/feature` already curl-verified in iteration 40/41. Mobile authenticated e2e blocked on Expo-web-preview CORS limitation (works on native).


## Feature — Web Stories + post sound + "Follow back" (2026-06, web only) — iteration 41
- **Facebook-style Stories on web:** new `components/StoryBar.jsx` on Home ("Your story" + create, plus rings for people you follow; orange ring = unseen, self-first), `components/StoryComposer.jsx` (photo/video upload via Cloudinary + optional caption → `POST /api/stories`, 24h expiry), and `components/StoryViewer.jsx` (full-screen, auto-advancing progress bars, tap left/right + keyboard nav, mark-seen via `POST /api/stories/{id}/view`, delete-own). Reuses existing story backend endpoints (no backend change for stories).
- **Post sound:** `lib/sound.js` `playPostChime()` — a bright two-note Web Audio chime played on a successful **post** (PostComposer) and **story** share. Best-effort (never blocks; respects muted browser). NOT headless-testable.
- **"Follow back" label:** backend adds `followed_by` (target follows the viewer) to `GET /api/users/{id}`, `annotate_follows` (discover/search), and `_list_relationship` (followers/following lists). Frontend shows **"Follow back"** when `!follows_them && followed_by` on Profile (`profile-follow-btn`), Discover (`user-follow-<id>`), and FollowListDialog (`follow-row-btn-<id>`); else "Following"/"Follow".
- **Verified:** testing agent iteration_41 — backend 5/5 pytest (stories CRUD + view + owner-only delete; `followed_by`/`follows_them` two-account matrix; discover accounts) + web UI (story bar/composer/viewer nav, Follow-back on Profile & Discover). Fixed the one bug it found: `_list_relationship` omitted `followed_by` (followers modal) — patched + re-verified via curl ('Follow back'). Web-only; mobile already has stories. Scratch test_* users/stories/follows purged.


## Web → Mobile visual parity (phased) — Phase 1: shell + Home feed (2026-06, web only)
- **Goal (user):** make the WEB app's GUI/look feel exactly like the mobile app, done in phases, while keeping ALL current web features.
- **Phase 1 (done):** Reusable mobile-parity CSS kit added to `index.css` (`.pmp-iconbtn`, `.pmp-chip`/`.pmp-chip-active`, `.pmp-iconchip`, `.pmp-streamer`, `.pmp-kind`, `.pmp-statchip`, `.pmp-cap`/`.pmp-cap-bar`). Restyled:
  - **AppShell mobile top bar:** brand mark + "PostMePlex" + orange-dash "THE HOME FOR CREATORS" tagline, rounded-square header icon buttons (blogs/notifications/messages) + avatar account menu.
  - **AppShell mobile bottom nav:** floating pill (Home / Discover / gradient "+" FAB / Reels / Profile); the FAB opens a Create dropdown (reel/video/blog/live). Active tab = orange-tinted rounded square. Old flat bottom bar + `BOTTOM_NAV` removed.
  - **Home PostCard:** orange-ring avatar, STREAMER pill, Featured label/toggle preserved, media in a rounded inset with floating like/comment stat chips, pill-shaped action chips (♥/💬 with counts) + share + bookmark, caption moved below actions with a left orange accent bar. Live ring, frames, edit/delete, inline comments all preserved.
- **Remaining phases (backlog):** apply the same kit to ReelCard/VideoCard on Home, then Discover, Profile, Videos, Live, Reels, Blogs, Messages, Market, Pet, Settings, auth pages.
- **Verified:** web lint clean; mobile-web screenshots confirm header, cards, and bottom nav match the mobile reference. Web-only change (mobile app already has this look).


## Feature — Live-everywhere + Admin content boosting + sidebar fix (2026-06, web + mobile) — iteration 40
- **Live everywhere:** going live (`POST /api/live`) sets `users.is_live=true` + `live_stream_id`; `POST /api/live/{id}/stop` resets them. `is_live` added to author/peer serializers (feed, comments, discover, messages peer + `sender_is_live`). Web `Avatar` gained a `live` prop → red ring + "LIVE" pill (`data-testid avatar-live` / `avatar-live-pill`), wired on Home, CommentThread, Discover, Messages (conv list + chat header + message sender). Profile shows a red LIVE banner ("<NAME> IS LIVE NOW — WATCH", `profile-live-banner`) linking to the user's stream. Mobile: ProfileView LIVE banner, PostCard live pill, live-list Featured label.
- **Follower live notifications:** on go-live, inserts a `type:"live"` in-app notification (`link=/live/{id}`) for every follower + fires Emergent push + web push (non-blocking).
- **Admin content boosting:** `POST /api/admin/feature {type∈post|reel|video|live, id, featured}` (super/admin only → 403; 404 if missing) sets `featured`+`featured_at`. Featured-first sort applied on `/api/feed`, `/api/discover`, and `/api/live`. Web `FeaturedControls.jsx`: admin-only `FeatureToggle` (`feature-toggle-<id>`) + `FeaturedBadge` ("Featured" label, `featured-label`) on Home post/reel/video cards + LiveFeed; hidden for non-admins.
- **Web sidebar fix:** `AppShell.jsx` — nav list is `flex-1 min-h-0 overflow-y-auto`; the bottom user card (profile/logout/settings/admin) is a pinned `border-t` footer, so logout/settings stay reachable on short desktop viewports (verified at 1280x600).
- **Favicon/OG:** `frontend/public/index.html` markup refreshed using existing PostMePlex logo assets (Google search icon refresh depends on redeploy + Google re-crawl).
- **Verified:** testing agent iteration_40 — backend 10/10 pytest (feature gating/404/toggle for post/reel/live, featured-first on feed/discover/live, is_live set+reset, follower notifications, is_live in serializers) + web UI all green (admin toggles flip, non-admin sees none, sidebar pinned at 1280x600, profile LIVE banner + avatar ring/pill, 15 avatar-live on Home). Mobile source testIDs correctly wired but Expo-web-preview e2e blocked by the known Cloudflare Origin-rewrite CORS limitation (works on native builds). Founder is_live reset + scratch data purged after tests.


## Feature — Admin custom verified-badge color via Sage AI (2026-06, web + mobile)
- **What:** Super-admins pick an account on **Admin → Verify accounts** (web, `/admin/verify`), type a color description (e.g. "royal gold", "ocean teal"); Sage AI (Emergent LLM, gpt-4o-mini) converts it to a hex and the account's verified badge renders in that color — same badge shape as everyone's, just recolored (like Sage's green badge). Setting a color **auto-verifies** the account; clearing (empty description) resets to the default brand color.
- **Backend:** `POST /api/admin/users/{id}/verify-color {description}` (admin-gated) → `_color_from_description()` LLM helper → stores `users.verified_color` (nullable hex) + `is_verified=True`. New `UserPublic.verified_color` field; `verified_color` added to every author/member/sender/owner serializer (posts, reels, feed, videos + video comments, comments, messages, live streams + live chat, calls, discover, followers/following, stories path, rooms_blogs, admin users list). Reused existing emergentintegrations LLM (no new integration).
- **Web:** `lib/format.js` `badgeStyle(entity)` returns `{ fill }` inline style (overrides the tailwind fill class; tick color kept). Wired into every `<BadgeCheck>` site (Avatar/UsernameLine, Home, Profile, Discover, PostDetail via UsernameLine, CommentThread, Blogs, BlogRead, Videos, VideoWatch, ReelWatch, ReelsFeed, FollowListDialog, CallContext, LiveFeed, LiveOverlay, Messages). AdminVerify.jsx got the color control (input + "Set with Sage" + swatch + clear).
- **Mobile:** every `Ionicons checkmark-circle` verified-badge site now uses `entity?.verified_color || colors.primary` (PostCard, ReelFeedCard, VideoFeedCard, CommentSheet, ProfileView, LiveOverlay, discover, reels, watch, video/[id], blogs/[id], blogs/index, story, followers, blocked, admin/blogs, admin/verify, messages/new, settings). Admin control stays web-only.
- **Also (same change):** the verified badge now shows beside the streamer's name in the **live watch header** (`LiveOverlay.jsx` top bar) — previously the live host name had no badge.
- **Verified:** backend e2e via curl ("royal gold"→#D1A16E, "ocean teal"→#007C7A, auto-verify, clear, 401 unauth); web admin control + public profile badge render gold via screenshot; all backend/web/mobile lint clean. Mobile rendering wired + linted (not live-screenshotted). Founder reset to no custom color after tests.


## Recent Fix — Sage voice-call "Connecting…" hang (2026-06, web)
- **Symptom:** Tapping Sage's voice call left the screen stuck on "Connecting…" with the mic disabled (reported on preview/web).
- **Root cause:** `SageChat.jsx` `SageCall` greeting `useEffect` — React StrictMode double-mounts in dev/preview; the first cleanup set `endedRef.current = true` and the second mount never reset it, so the greeting handler hit `if (endedRef.current) return` and never advanced. Backend `/api/sage/voice-turn` was returning 200 the whole time (not a backend/audio issue).
- **Fix:** reset `endedRef.current = false` at the top of the greeting effect on every (re)mount; also hardened `playAudio` with an 8s watchdog so an iOS Safari data-URL stall can't hang the UI.
- **Verified in preview:** Connecting… → Sage is speaking… (greeting audio plays) → "Tap the mic and talk" (mic enabled). Push-to-talk interaction intact. Web-only change.


## Tech Stack
- **Mobile:** Expo SDK 54 + Expo Router (file-based), React Native 0.81, expo-video, expo-image-picker, expo-notifications, react-native-reanimated, react-native-agora 1.15+ (audio livestream).
- **Web (NEW iteration 20, June 2026):** React 19 + CRA (react-scripts 5) + Craco, React Router 7, Tailwind + Shadcn UI, sonner toasts, react-markdown for blog reader.
- **Backend:** FastAPI + Motor (async MongoDB), JWT auth with bcrypt, httpx for Emergent Push relay, Agora App-ID-only mode for audio rooms, Resend for email.
- **Storage:** MongoDB collections — `users`, `posts` (mixed type=post|reel), `videos`, `blogs`, `blog_likes`, `stories`, `story_views`, `live_sessions`, `room_presence`, `conversations`, `messages`, `notifications`, `follows`, `likes`, `comments`, `blocks`, `reports`, `reset_codes`.

## Implemented Features
### Auth (mobile + web)
- JWT email/password register, login, /me, profile update, delete account.
- Password recovery: 6-digit email code (Resend) **or** 4-digit reset PIN (offline).
- Web token stored in `localStorage`; mobile uses SecureStore on native / localStorage on web preview.

### Home Feed / Posts / Reels (mobile + web)
- Text+image posts with optimistic like, comment threads, game-tag chips, streamer + verified badges.
- Vertical TikTok-style reels (mobile only).

### Blogs (mobile + web)
- Publisher permission model: admin grants/revokes; users request via `/blogs/request-permission`.
- Markdown editor + preview, cover upload, tags (≤10), draft/publish status, reading-time auto-calc.
- Like counter, view counter (auto-increment on read).

### Videos (mobile + web)
- YouTube-style long-form uploads (Cloudinary chunked, up to 5GB).
- Visibility: public / unlisted / private (owner-only).
- Watch page: player, like, comments, related videos, view fires on play.
- Auto H.264/mp4 URL transform for older iOS decoders.

### Discover / Search (mobile + web)
- Tabs: Top, Accounts, Tags, Live.
- Global `/api/search` for users, tags, and posts.

### Direct Messages (mobile + web)
- 1:1 + Squad (group) chats, reactions, typing indicators (mobile).
- Web polls messages every 4s while a conversation is open.

### Notifications (mobile + web)
- Like / comment / follow feed, mark-all-read.
- Push notifications via Emergent relay (mobile only, real device build required).

### Audio Livestreams (mobile broadcast; web browse only)
- Backend Agora App-ID-only rooms (`/api/rooms/*`).
- Mobile: full Agora RTC engine — host/guest broadcaster, listener as audience, host auto-unmute, guest invite/step-down. **Iteration 19 (June 2026): fixed critical bug where audio was never streamed — the room UI never wired to Agora. Now initializes engine, joins channel, mutes/unmutes correctly.**
- Web (v1.2): list rooms, host can create a room; broadcasting/listening audio deferred to v2.

### Live Video Streaming — TikTok-style (mobile + web) — NEW iteration 37, June 2026
- **Interactive real-time layer (fully functional, no provider needed):** our own FastAPI WebSocket (`/api/live/{id}/ws?token=JWT`) + MongoDB. Live chat, floating heart animations, virtual gifts (7 free animated gifts), and a live viewer counter that increments/decrements as clients join/leave. Verified: backend 6/6 pytest (`test_iteration37_live.py`) + web e2e.
- **Video pipeline (Cloudflare Stream Live control plane):** `routes/live.py` creates/stops live inputs; broadcaster gets a WHIP publish URL (owner-only, never persisted/leaked), viewers get a WHEP (sub-second) or HLS playback URL. Gated by env `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`. **Currently EMPTY → "demo mode":** streams create + interactive layer is fully live, but no actual video (a "Waiting for video…" placeholder shows). Add keys to activate real video.
- **Web:** `/live` feed (browse active), `/live/new` (Go Live — browser WHIP publish via getUserMedia), `/live/:id` (watch — WHEP/HLS playback + overlay). Sidebar + bottom-nav "Live" entry.
- **Mobile (Expo):** `app/live/index.tsx` (feed), `app/live/new.tsx` (Go Live — expo-camera preview + permission flow), `app/live/[id].tsx` (watch — expo-video HLS + overlay). Home-header "Live" button. Real camera broadcast (WHIP) requires `react-native-whip-whep` in a native/published build — NOT Expo Go/web preview. Mobile UI verified; full mobile-preview e2e blocked by the known Expo-web-preview CORS limitation (works on native builds).
- Collections: `live_streams`, `live_chat`. `LiveHub` is in-memory (single-worker; Redis pub/sub needed to scale to multiple workers).
- **Cost note:** video delivery is billed by the provider per viewer-minute (e.g. Cloudflare Stream Live ~$1/1000 delivered min). Thousands of concurrent viewers = thousands of $/mo — inherent to live video, paid directly to the provider.
- Live now ACTIVE (not demo): Cloudflare Stream enabled + valid token in `backend/.env`; graceful demo fallback retained if the provider call ever fails.

### Virtual Pet — "Sage AI" (web, v1) — NEW iteration 38, June 2026
- Tamagotchi-style pet. Care/leveling/stats are all free (backend); the ONLY paid action is Sage AI image generation.
- **Sage AI = Gemini "Nano Banana"** (`gemini-3.1-flash-image-preview`) via `EMERGENT_LLM_KEY`. Generates the pet image ONLY on **create** (free-text "dream pet" description) and on **restyle** (image-edit using current pet as reference for consistency). Result is uploaded to Cloudinary (unsigned preset) and cached — never regenerated on other actions. Keeps cost to ~cents per pet.
- `routes/pets.py`: `GET/POST/PATCH/DELETE /api/pet`, `POST /api/pet/{feed|play|bath}`, `POST /api/pet/style`. One pet per user. Stats (hunger/happiness/cleanliness/health) decay over time (computed on read from `updated_at`, not persisted on GET). Care actions refill a stat, grant XP (play 20 / feed 15 / bath 10), enforce cooldowns (play 2h / feed 4h / bath 6h → 429), and level up (100 XP/level, cap Lv 10). Mood + stage (Baby/Teen/Adult) derived.
- Web: `/app/frontend/src/pages/Pet.jsx` at `/pet` (green Sage-AI theme matching the reference). Create form, pet card (Lv/XP/AI-styled badge/mood/level bar), 4 stat bars, Care Zone (Play/Feed/Bath w/ live cooldown timers), Play Game button, rename, restyle, release. Nav: sidebar "Pet" + mobile top-bar dropdown "My Pet".
- **Verified-only:** `POST /api/pet` returns 403 for non-verified users; web shows a "Verified members only" gate (`pet-verified-gate`).
- **Transparent background:** Sage AI is prompted to paint the pet on a flat magenta (#FF00FF) background, then the backend chroma-keys it out (Pillow+numpy) to a real transparent PNG before uploading to Cloudinary (alpha preserved). Free, no paid bg-removal add-on.
- Verified: backend all endpoints via curl (incl cooldown 429, XP, rename, restyle-with-reference, delete, transparency alpha check, verified gate) + web e2e via screenshots (create→transparent display, play→XP, rename, stats). NOT run through the testing agent (to avoid repeated paid AI generations).
- Mobile parity NOT built yet (web-only v1 per user).

### Official Account Boost (legitimate) — iteration 39, June 2026
- User asked for AI bots + fake follower/viewer inflation + pirated internet livestreams presented as real. DECLINED the deceptive/infringing parts (deceives real users; copyright/piracy). Built the honest equivalent instead.
- `is_official` flag on `UserPublic`/serializer. Seeded the **official PostMePlex account** (`postmeplex@post.com` / user `postmeplex`, verified + official) and flagged `semidiepie` official.
- Discover accounts now sort `is_official` first, then followers — official accounts always top.
- Every new signup auto-follows the official accounts (`_follow_official`, standard official/system-account onboarding — real follows). Idempotent backfill `ensure_official_follows()` on startup makes existing members follow them and reconciles counts.
- Web: "OFFICIAL" badge on Profile header + Discover account rows. Verified end-to-end (official profile shows badge + real follower count; auto-follow 5→6 on new signup).

### Invite / Share system + referral growth loop — iteration 40, June 2026
- `lib/share.js` (web): `shareUrl()` (native share sheet + clipboard fallback), `captureRef()`/`getRef()`/`clearRef()` persist an inbound `?ref=` across navigation.
- Profile: own profile has an **Invite** button (copies `origin/?ref=<username>`); other profiles have a **Share** button (`origin/@username`).
- Referral loop: `RegisterBody.ref` (inviter username). On signup the new member auto-follows the inviter + gets a "joined from your invite and followed you" notification, so sharing directly grows real followers. Verified: semidiepie 5→7 across invited signups.
- App.js captures `?ref=` on load; AuthContext.register sends it and clears it after.

### PostMePlex Market — animated profile frames + seasonal/holiday themes (web) — iteration 49, June 2026
- New **/market** page (free cosmetics). **9 animated profile frames** (Golden Glow, Sweetheart, Emerald, Violet, Neon Cycle, Rainbow Spin, Blaze, Frostbite, Deep Ocean) — CSS-animated rings (glow-pulse + conic spin) rendered around the avatar. **9 seasonal/holiday themes** (Fall 🍂, Winter ❄️, Halloween 🦇, Christmas 🎄, Valentine 💖, Spring 🌸, Summer ☀️, New Year 🎉, St. Patrick 🍀) — each recolors the app accent (`--primary/--accent/--ring`) + a full-screen falling-particle animation.
- Backend: cosmetic fields on user + `UserPublic` (`equipped_frame`, `active_theme`, `frame_enabled`, `theme_enabled`); `POST /api/market/cosmetics` (allowlist-validated, `""` = unequip). Verified: equip persists, invalid id → 400.
- Frontend: `lib/cosmetics.js` catalog, `Avatar` gains a `frame` prop (frame shown on the shell top-bar/sidebar avatar + Profile header via `frame_enabled`/`equipped_frame`), `components/ThemeLayer.jsx` (mounted globally, applies theme vars + particles, respects `theme_enabled`), `pages/Market.jsx`, CSS keyframes in `index.css`. **Settings** → new Cosmetics card with on/off toggles for frame + theme. Nav: **Market** added to sidebar + mobile top-bar menu; route `/market` (protected).
- Manual theme selection (no auto-by-date), all free. Verified via screenshot (frames render, Neon equipped state, Fall leaves falling, sidebar avatar framed). Founder demo cosmetics reset to none. Web-only (mobile later). **Update (iteration 50): animated frames now render on EVERY author avatar** — feed post/reel/video cards, PostDetail, ReelWatch, ReelsFeed, VideoWatch, and all comment/reply rows (posts + videos) + the comment composer. Backend author serializers (`serialize_post`, `serialize_video_for_feed`, video `serialize_video`, post `list_comments`/`create_comment`, video comment list/create) now include `equipped_frame` + `frame_enabled`; frontend `frameOf(u)` helper in `lib/format.js` gates rendering. Verified via API (feed authors carry frame keys) + lint.

### Sage voice call — reverted to push-to-talk (web) — iteration 56, June 2026
- Per user request, reverted the Sage voice call from auto-talk (VAD) back to the **original push-to-talk**: tap the mic to talk, tap again (Square) to send → STT → Sage reply + voice. Removed the AnalyserNode/VAD loop and shared AudioContext.
- **Kept the fixes:** iOS audio unlock (`unlockSageAudio` on the start-call tap + reused `window.__sageAudioEl` for reliable playback), Speaker on/off toggle, `100dvh` fullscreen call screen, and the Messages/chat layout fix (input pinned, list scrolls). Green filled Sage badge retained.

### Sage voice call v2 — auto-talk (VAD), speaker mode, fullscreen (web) — iteration 54–55, June 2026
- **iteration 55 fixes:** (1) Message input was pushed off-screen by the earlier fullscreen height — fixed with responsive `h-[calc(100dvh-140px)] md:h-[calc(100dvh-112px)]` on the Messages grid + `min-h-0`/scroll on chat sections & lists (input now pinned + visible, list scrolls). Applied to ChatPane + SageChat. (2) iOS/Safari audio: added `unlockSageAudio()` fired inside the call-start tap (resumes a shared `AudioContext` + primes a reused `Audio` element) so playback isn't silently blocked AND the VAD analyser gets real data (was reading zeros on a suspended context → "Sage not answering"). `playAudio` reuses the unlocked element; the shared AC is suspended (not closed) on teardown. (3) Sage badge → filled green (`fill-green-500 text-background`) to match other verified badges.
- **Known web limitation:** a true earpiece / "not-on-speaker" audio route is NOT possible in a mobile web browser — audio always goes to the main speaker; earpiece routing is only achievable in the native published app. Speaker default stays ON (audible); the Speaker toggle mutes/unmutes on web.
- **Auto-talk replaces push-to-talk:** `SageCall` (components/SageChat.jsx) uses Web Audio `AnalyserNode` voice-activity detection — auto-starts capturing when you speak and auto-sends after ~1.1s silence; Sage replies on its own (continuous back-and-forth). VAD pauses while Sage speaks (no self-hearing) and resumes after playback. Mic uses echoCancellation + noiseSuppression.
- **Speaker + mic controls:** Sage's voice auto-plays through the speaker on connect; added a **Speaker** toggle (Volume2/VolumeX) and a **Mic mute** toggle, plus live status (Listening / speaking / thinking).
- **Fullscreen:** Sage call + Agora incoming/active call screens now use `height:100dvh` at `z-[120]` (iOS-safe); Messages page container uses `height: calc(100dvh - 88px)` so the chat fills the screen.
- STT still ElevenLabs `scribe_v1`; MediaRecorder mime auto-picked (webm/mp4/ogg). NOTE: live VAD needs a real mic + speech — not headless-testable; module compiles + loads verified.

### Admin API-key health alerts — web push for Semidiepie only (web) — iteration 53, June 2026
- New `routes/keyhealth.py` monitors every third-party key and alerts **only super-admin users** (Semidiepie) via **Web Push + in-app notification** (`type:"key_alert"`, links to `/admin/keys`) the moment a key breaks/expires/goes missing. Deduped per service with a 12h cooldown; cooldown auto-clears when a key is healthy again so the next failure alerts immediately.
- **Active validation:** ElevenLabs (`/v1/user/subscription` — 401/quota), Cloudflare (`/user/tokens/verify` — status). **Presence checks:** Agora id + certificate, Emergent LLM, Cloudinary, VAPID.
- **Triggers:** periodic background task every 6h (`_start_key_health_monitor` in server.py), on-demand `POST /api/admin/keys/check` (force), and **reactive** — a live ElevenLabs TTS/STT auth/quota failure in `routes/sage.py` fires an alert right away (`report_issue`).
- **Admin UI:** `pages/AdminKeys.jsx` at `/admin/keys` (new "API keys" tab in AdminTabs) — live status list, "Re-check now", and an "Enable browser alerts" prompt (reuses `lib/webpush.js`). Super-admin gated.
- Endpoints: `GET /api/admin/keys/status` (no alert), `POST /api/admin/keys/check` (alerts). Verified: all keys healthy in preview; alert path unit-tested (fires web push + notification to semidiepie only, dedupes on repeat); admin page renders.


- **Sage AI** is pinned at the TOP of the Messages list with a **green** verified badge (`conv-sage`, route `/messages/sage`). Text chat powered by the Emergent LLM key (Claude Sonnet `claude-sonnet-4-6`) via emergentintegrations; history persisted per-user in `db.sage_messages`. Empathetic-listener persona with built-in safety: NOT a therapist, surfaces 988 + local emergency services on distress/self-harm; a disclaimer banner is always shown and a red crisis banner appears when crisis keywords are detected.
- **Distress detection:** keyword scan on each message → `offer_call` flag → UI shows a "Talk to Sage" call offer card. Crisis keywords → `crisis` flag → resources banner.
- **Two-way voice call (ElevenLabs):** `routes/sage.py` — `POST /api/sage/voice-turn` (Sage reply text + ElevenLabs TTS mp3 as base64 data URL, voice "Sarah" `EXAVITQu4vr4xnSDxMaL`, model `eleven_turbo_v2_5`), `POST /api/sage/stt` (ElevenLabs `scribe_v1` speech-to-text — cross-browser incl. iOS Safari, avoids the flaky Web Speech API). Frontend `components/SageChat.jsx` `SageCall` overlay: push-to-talk (MediaRecorder) → STT → Sage reply → plays natural voice; Sage greets on connect. Requires **`ELEVENLABS_API_KEY`** in `backend/.env` — until set, `/api/sage/profile` returns `voice_enabled:false` and the call button is hidden (text still works).
- **Env:** `ELEVENLABS_API_KEY` (set), optional `SAGE_VOICE_ID` / `SAGE_TTS_MODEL`. `EMERGENT_LLM_KEY` already present.
- Also added **Messages** to the top-bar dropdown menu (`topbar-menu-messages`) for easier mobile-web access.
- Verified: text chat + distress detection (curl + UI screenshot), and the full VOICE pipeline — `voice_enabled:true`, ElevenLabs TTS greeting (~118KB mp3) + STT round-trip transcribed accurately, call button visible. Real in-browser call (mic push-to-talk) still needs a manual user test.


- **Mutual-follow gate:** starting a NEW 1:1 chat requires both users to follow each other (`POST /api/conversations` → 403 "You can only message people who follow you back." otherwise). Existing 1:1s and ALL group chats are exempt.
- **Audio + video calls (Agora media + our signaling):** new `routes/calls.py` personal signaling socket `/api/rtc/ws?token=JWT` (RtcHub) handles incoming-call invites + ring/accept/decline/presence, bound to the conversation's members (guessed call_ids can't join). The actual audio/video MEDIA is carried by **Agora** (`agora-rtc-sdk-ng` 4.x on web) — reliable SFU, no TURN needed. `POST /api/rtc/agora-token` mints a short-lived (1h) RTC token from `AGORA_APP_ID` + `AGORA_APP_CERTIFICATE` (env); the Agora UID is derived deterministically from the user id (never client-supplied). Channel name = call_id. Web `context/CallContext.jsx` (global in `App.js`) manages the signaling socket + the Agora client (join channel, publish mic/camera, subscribe to remote users) and renders the incoming-ring screen + outgoing/active call overlay (remote tiles, local PiP, mute/cam/hangup). Call buttons in the chat header (`call-audio-btn`/`call-video-btn`). NOTE: real audio/video MEDIA needs two real browsers w/ mic+camera — can't be validated headlessly. Backend token endpoint verified (returns valid `006…` token for the configured App ID).
- **Group chats — full functions:** create with name + members (`New` → Group tab), `PATCH /api/conversations/{id}` rename + group photo (Cloudinary, admin only), `POST /api/conversations/{id}/members` add (admin), `DELETE /api/conversations/{id}/members/{uid}` remove (admin) or self-leave, admin handoff when the creator leaves, auto-delete when <2 remain. Web group-settings dialog (`group-settings-btn`).
- **Verified badge everywhere in messages:** conversation list, chat header (1:1 peer), and group message sender names all render the badge. `conv_preview` now exposes `is_group`/`admin_id`/`members[]` (with is_verified/remembering/equipped_frame/frame_enabled)/`peer`; messages carry `sender_verified`/`sender_remembering`/`sender_frame`/`sender_display_name` (backfilled on list for old rows).
- **Profile frames in messages + confirmed public:** `GET /api/users/{id}` already returns `equipped_frame`+`frame_enabled` publicly (renders on the profile header for any viewer); frames now also render on messages avatars (conv rows, group senders, call UI). If not visible on production, redeploy to pick up the latest code.
- Verified: testing agent iteration_39 — backend 16/16 pytest + web UI (gate toast, DM/group create, group rename/add/remove/leave, verified badges, call overlay + signaling handshake) all green. Web-only per user.


- **One-level (YouTube/IG-style) replies on all comment surfaces.** Backend: `parent_id` added to `CommentBody` (posts/reels) and `VideoCommentBody` (videos). Replying to a reply auto-resolves to the top-level comment (never nests >1 level). Reply notifies the parent-comment author + web push; post/video owner also notified. Deleting a top-level comment cascades-deletes its replies and adjusts `comments_count`. New `DELETE /api/videos/{id}/comments/{cid}` (owner-only). `list_video_comments` now returns `parent_id`.
- Frontend: new shared `components/CommentThread.jsx` (composer + top-level list + collapsible replies + inline reply box with @mention prefill + owner delete). Integrated into **PostDetail**, **ReelWatch** (drawer), **ReelsFeed** (modal), and **VideoWatch**, replacing each page's bespoke comment code (dead code removed). `Notifications.jsx` routes `video_id` notifications to `/videos/:id`.
- Verified via API (reply parent_id set; reply-to-reply flattens to one level; cascade delete removed 3) + screenshot (PostDetail thread with reply + "Hide replies" toggle + verified badges).

### "Install app" (Add to Home Screen) helper for mobile web + PWA manifest — iteration 47, June 2026
- Added a real **PWA manifest** (`public/manifest.json`: name, standalone, theme #12141c, 192/512 icons) + linked it in `index.html` with apple-mobile-web-app metas — so "Add to Home Screen" installs a proper full-screen app.
- New `components/InstallAppPrompt.jsx` (mounted globally in `App.js`): on **mobile web only** (hidden when already installed/standalone, or dismissed) shows a floating **"Get the app"** pill. Opening it shows an "Install PostMePlex" bottom-sheet with **iPhone (Safari)** and **Android (Chrome)** tabbed step-by-step instructions. If the browser fires `beforeinstallprompt` (Android/Chrome), a native **Install app** button appears and triggers the real install. Dismiss persists via localStorage.
- Also added an **"Install app"** entry to the mobile top-bar menu (`topbar-menu-install`) that dispatches an `open-install-guide` event → always-available entry point.
- Web-only; verified via mobile-viewport screenshot (pill + guide modal render). NOTE: this installs the PWA (no App Store), separate from the native iOS/Android builds via Emergent Publish.

### YouTube-style Videos hub (web) — iteration 46, June 2026
- New `/videos` page (`pages/Videos.jsx`) — a dedicated YouTube-style long-form video hub in the PostMePlex theme (orange/dark). Header (title + search + Upload), horizontal **category chips** derived from real video categories, a **Featured hero** card (newest public video, play overlay, duration), and a responsive card grid (1/2/3 cols). Each card: 16:9 thumbnail + duration badge, channel avatar, title (2 lines), channel name + **verified badge** (`badgeCls` → red for remembering), `views · timeAgo`. Loading skeletons + empty state. Owner watch/upload flows already existed (`VideoWatch`, `VideoUpload`, `GET /api/videos`).
- **No backend change** — consumes the existing `GET /api/videos?q=&category=&limit=` (serialize_video already returns author.is_verified/remembering, views, duration, category). Client-side search + category filtering over one fetch.
- Nav: added **Videos** to the sidebar `NAV` (after Home) and to the **mobile bottom bar** (`["/", "/videos", "/live", "/reels", "/discover"]`); Blogs moved into the mobile top-bar dropdown (`topbar-menu-blogs`) so it stays reachable. `App.js` route `/videos` (public, before `/videos/:id`).
- Verified via screenshot: hub renders with Featured + 6 cards, verified checkmark on channel, category chips (All/Testing/Vlogs from live data), Videos nav active. Web-only (mobile app has no video hub yet).

### Admin "Announce update" broadcast (web push to all) — iteration 45, June 2026
- Super-admin-triggered broadcast so the founder can notify everyone right after a Publish/deploy. `POST /api/admin/broadcast {title, body, url}` (super-admin only → 403 otherwise): inserts a `type:"update"` in-app notification for **all users** (so non-push users see it next visit) + fires a browser **Web Push** to **every push-subscribed user** (`send_web_push`). Returns `{notified_users, pushed_users}`.
- Web: new `/admin/announce` page (`AdminAnnounce.jsx`, super-admin-guarded) with title/message fields, a live preview, and a "Send to all users" button (prefilled "PostMePlex just got an update! ⚡"). Added an "Announce update" tab to `AdminTabs`. `Notifications.jsx` renders `type:"update"` with a Megaphone icon and routes to `/`.
- Chosen approach = manual admin button (not auto-on-deploy) to avoid spamming users on ordinary backend/preview restarts. Verified: broadcast 200 (12 in-app), non-admin 403, notification appears with correct type; test announcements cleaned up. Web push only reaches users who enabled browser notifications (browser requirement).

### Growth pack: shareable link previews (branded OG cards) + SEO landing pages + invite counter — iteration 44, June 2026
- **Backend `routes/share.py`** serves public, crawler-friendly landing pages with Open Graph + Twitter Card meta for **reels / profiles / pets**, so shared links show a rich preview on IG/TikTok/X/WhatsApp/iMessage and are Google-indexable. Humans are JS-redirected into the app carrying the sharer's `?ref=` (feeds the referral loop).
  - Endpoints: `GET /api/share/{reel/{id}|u/{handle}|pet/{handle}}` (HTML) + `.../card.png` (image).
  - **Auto-generated branded OG card** (1200×630, Pillow, no AI, free): dark #12141c + orange accent, PostMePlex lightning logo + wordmark, kind pill, title, subtitle, stats row, CTA. Reel card = thumbnail; **profile card = user's avatar**; pet card = pet image. Served on-the-fly with `Cache-Control`.
- **Web share buttons** now point at the rich-preview URLs: reels feed `share`, Profile Invite + Share, and a new **Pet share button** (`pet-share-btn`).
- **Invite counter (Phase 2):** `invites_count` added to `UserPublic` + incremented on each referred signup (`?ref=`). Profile shows an **"Invited N" stat** (`profile-invited-stat`) and a **Connector tier badge** (`profile-connector-badge`): 🌱 Inviter (1+), 🔗 Connector (5+), 🔗 Super Connector (10+) — honest social proof from real signups.
- Verified: profile/reel/pet cards render (screenshots), OG/Twitter meta present, invite counter 0→1 on referred signup (founder counter reset to 0 after test). Web-only + universal share links; no mobile change needed.

### Reels tab full-screen (web) — iteration 43, June 2026
- **`/reels` is now a full-screen immersive TikTok-style feed** (added to `isFullscreenRoute` in `App.js`, so it renders edge-to-edge outside the app shell). `ReelsFeed.jsx`: video changed from `object-contain` (letterboxed) to `object-cover` (fills), container `fixed inset-0` with a centered `max-w-[500px]` portrait column (fills the whole screen on mobile web). Top overlay bar = back-to-home + "For You" + create(+); right action rail = like / comment / share / mute; bottom = author + caption over a gradient. New `reels-feed-share-*` (copies reel link / native share) and `reels-close` testIDs.
- Live (`/live/:id` watch, `/live/new` broadcast) were already full-screen routes with `object-cover` — no change needed; they already match the requested immersive layout. Verified reels full-screen via mobile-viewport screenshot.

### Pet: 3D Pixar look + interactive care/mini-games + death & reminders — iteration 42, June 2026
- **3D Pixar style:** `_style_block()` in `routes/pets.py` now prompts Sage AI (Nano Banana) for a glossy 3D Pixar/DreamWorks animated-movie render (subsurface scattering, big glossy eyes, chunky rounded forms, cinematic lighting) on BOTH create + restyle. Existing pets keep their image until restyled/re-adopted (1 credit); prompt change itself is free.
- **Bigger + animated pet (web `Pet.jsx`):** pet image enlarged to h-72/80, gentle idle "breathing" float (`animate-pet-idle`), tap-to-pet → floating hearts + wobble (`pet-heart-pop`/`pet-bounce` keyframes in `index.css`), reaction bounce on every care action.
- **Interactive care + mini-game (all FREE, `pages/pet/PetPlay.jsx`):** Feed = tap 3 foods to toss them (`FeedToss`); Bath = pop all 8 bubbles to scrub clean (`BubbleBath`); Play = 15-sec "Treat-Catch" tap mini-game (`CatchGame`). Each interaction runs in an `InteractionModal`, then calls the existing `/api/pet/{feed|play|bath}` (cooldowns/XP unchanged) — no extra backend/AI cost.
- **Death from neglect:** when computed health hits 0, the pet is marked `is_dead` (persisted on `GET /api/pet` and by the reminder scan). Dead pets can't be cared/restyled (410); web shows a grayscale memorial card (`pet-dead-card`) with "Release & adopt a new pet".
- **Web care reminders:** backend `pet_reminder_loop` (started via `@app.on_event("startup")`) scans every 30 min; when a pet is hungry/dirty/sad/low-health it creates a `type:"pet"` in-app notification + fires a browser Web Push (`/pet`), throttled to once/8h per pet; also sends a death notification. Web `Pet.jsx` shows an "Enable pet reminders" banner (`enableBrowserPush`); `Notifications.jsx` routes `type:"pet"` rows to `/pet` (PawPrint icon).
- Verified: backend healthy + reminder loop starts clean; founder's neglected pet correctly flips to `is_dead`; death memorial UI confirmed via screenshot. Interactive alive-UI + Pixar image are code/lint-verified; a live visual demo needs adopting a fresh pet (1 credit) — not run automatically to preserve credits.

### Sage AI Studio (live restyle chat) + mobile message deletion — iteration 41, June 2026
- **Sage AI Studio (web pet):** replaced the single-input pet restyle with a chat-style "Sage AI Studio" panel in `frontend/src/pages/Pet.jsx`. A conversation thread (Sage greeting → your instruction → result image), 6 family-friendly one-tap restyle chips (e.g. "glossy 3D animated-movie character", "make it bigger, rounder and chunkier", "cinematic movie lighting", "sparkly magical glow", "claymation", "watercolor storybook" — descriptive, no named studios/brands), and a free-text input. **Cost-safe:** the paid `POST /api/pet/style` fires ONLY when the user taps send / a chip — never on typing. Reuses the current pet image as the style reference (backend unchanged). Verified: UI renders + welcome/chips display via screenshot (no generation triggered).
- **Mobile message deletion (parity with web):** `mobile/app/messages/[id].tsx` — long-press your own message → "Delete message" in the action modal → `DELETE /api/messages/{id}` (`testID=msg-delete`, optimistic remove + restore on failure). `mobile/app/messages/index.tsx` — long-press a conversation → confirm sheet → `DELETE /api/conversations/{id}` (`testID=conv-remove-confirm`, hides per-user). Both endpoints already existed (ownership-enforced); verified e2e via curl (delete msg 200, delete conv 200, conv removed from list).
- **PIN-only login (confirmed already shipped):** login is PIN-first on both web (`/login`) and mobile (`(auth)/login.tsx`) via `POST /api/auth/login-pin {identifier, pin}`; signup requires a 4-digit PIN; no self-service reset (admin-only). Founder sign-in PIN = `7455`. See test_credentials.md.

### Message web push — iteration 40, June 2026
- New DMs now also fire a browser Web Push (`send_web_push`) to each recipient, matching follow/like/comment coverage (previously DMs only sent mobile Expo push). `send_web_push` exposed via route_ctx to `routes/messages.py`. All interactive notification types (follow, like, comment, message) now push to both mobile + web. Verified DM send path runs the web-push call without error (actual delivery requires the recipient to have granted browser notifications + VAPID configured, which it is).

### Stories (mobile-only in v1 web)
- 24-hour ephemeral image/video stories with view tracking.

### Settings / Privacy / Moderation (mobile + web)
- Change password, 4-digit PIN toggle, profile edit, delete account.
- Block/unblock users, report content, followers/following privacy toggles.

### Admin (mobile only for now)
- Verified badge toggle, blog-permission approval queue.

## Endpoints (FastAPI, all under `/api`)
Full surface documented in `/app/backend/server.py` and `/app/backend/routes/rooms_blogs.py`. Highlights:

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | JWT auth |
| POST | `/auth/change-password`, `/auth/reset-pin`, `/auth/forgot-password{,-pin}` | Password mgmt |
| GET/POST/PUT/DELETE | `/videos*` | Long-form videos CRUD + like/comment/view |
| GET/POST/PUT/DELETE | `/blogs*` | Blogs CRUD + like + admin approval |
| GET/POST | `/rooms*` | Audio live rooms + heartbeat + invite/step-down |
| GET | `/feed`, `/reels`, `/stories`, `/discover`, `/search` | Discovery surfaces |
| GET/POST | `/conversations*`, `/messages*` | DMs |
| GET | `/notifications`, POST `/notifications/read-all` | Activity |

## Code Architecture
```
/app
├── backend/                     FastAPI + Mongo
│   ├── server.py                (~2500 lines — REFACTOR into /routes/* pending)
│   ├── routes/rooms_blogs.py    Audio rooms + blogs (already extracted)
│   └── tests/                   pytest regression packs
├── mobile/                      Expo React Native app
│   ├── app/                     expo-router file-based routes
│   ├── src/                     hooks, context, api client, agora loader, components
│   └── certs/                   APNs .p8 (gitignored)
└── frontend/                    React web app (NEW iteration 20)
    └── src/
        ├── App.js               Router + AuthProvider + Toaster
        ├── context/AuthContext.jsx
        ├── components/          AppShell, AuthLayout, Avatar, ProtectedRoute, ui/*
        ├── lib/                 api.js, cloudinary.js, format.js, utils.js
        └── pages/               Login, Register, ForgotPassword, Home, Blogs*, Videos*,
                                 Discover, Messages, Notifications, Profile, Settings, Live
```

## Changelog
### 2026-06 — Removed Live feature; videos via Profile/Discover only
- **Live feature removed** on both web and mobile (per user request):
  - Web: deleted `pages/Live.jsx`, `pages/LiveRoom.jsx`, `lib/agoraRoom.js`; removed `/live`+`/live/:id` routes and the Live nav item; removed Discover "Live" tab.
  - Mobile: deleted `app/(tabs)/live.tsx`, `app/live/[id].tsx`, `src/lib/agora.ts`, `src/lib/agora.web.ts`; removed the Live tab (`(tabs)/_layout.tsx`), the DesktopSidebar Live item, and the Settings "Live rooms" row.
  - Backend `/rooms` endpoints (in `routes/rooms_blogs.py`) left intact but now unused by any UI — candidate for server-side removal before launch.
- **Videos accessible only via Profile + Discover:** removed the dedicated Videos browse feed/tab from web nav (deleted `pages/Videos.jsx`, removed `/videos` list route). Long-form videos still viewable at `/videos/:id`.
- **Upload → Profile:** web `VideoUpload` and mobile `video/upload.tsx` now redirect to the uploader's Profile after publishing (visibility chooser kept, defaults Public).
- **Fullscreen watch + Back:** web `/videos/:id` renders fullscreen outside the app shell with a Back control (`navigate(-1)`); mobile watch already fullscreen with back.
- Verified via testing agent (iteration_21): 18/18 checks passed on web + mobile.

## Changelog
### 2026-06 (part 2) — Reels showcase on web, backend cleanup + modular refactor
- **Web Profile "Reels" tab** added (`pages/Profile.jsx`) listing a user's reels (`GET /api/users/{id}/reels`); tiles open a new **fullscreen web reel viewer** at `/reels/:id` (`pages/ReelWatch.jsx`, rendered outside the app shell) with Back (returns to previous page), like and mute controls. Reels are `posts` with `type=reel`, fetched via `GET /api/posts/{id}`.
- **P2 — removed live backend:** deleted the `/api/rooms/*` endpoints from `routes/rooms_blogs.py` (Blogs kept) and the legacy `/api/live/*` endpoints + `is_live` discover filter from `server.py`. `AGORA_APP_ID` config removed. `/api/live` and `/api/rooms` now 404.
- **Legal/marketing cleanup:** removed all Live/streaming mentions from `mobile/app/legal/terms.tsx` (dropped §6, renumbered), `mobile/app/legal/privacy.tsx` (incl. Agora vendor line), the notification primer, and web `AuthLayout`.
- **P1 — server.py refactor:** extracted the Videos and Messages route groups into `routes/videos.py` and `routes/messages.py` using a shared-context `build_router(ctx)` pattern (ctx carries db, deps, helpers). `server.py`: 2488 → 1825 lines. NOTE: these modules must NOT use `from __future__ import annotations` (their route fns are nested in build_router and rely on closure-local dep names inside `Annotated[...]`).
- **Bug fix (HIGH):** `GET /api/conversations/{id}/typing` 500 (naive vs tz-aware datetime compare) fixed in `routes/messages.py` by normalizing stored timestamps to UTC-aware.
- Verified: testing agent iteration_22 (34/36; the 2 flags were the typing 500 — now fixed & re-verified via curl — and a pre-existing login 400-vs-401 minor). Web reels tab/viewer + refactor regression: 100%.

## Backend refactor — remaining passes (P1 follow-up)
Still inside `server.py` (candidates for future extraction into `/routes/`): auth, users/social (follow/block/report/privacy), stories, posts/reels/comments/feed, discover/search, notifications/push, admin.

## Changelog
### 2026-06 (part 3) — Password reset via emailed LINK (replaces code + PIN)
- **Forgot-password is now link-based only.** `POST /api/auth/forgot-password` generates a single-use, 60-min, SHA-256-hashed token, stores it in `password_reset_tokens`, and emails a link `{APP_PUBLIC_URL}/reset-password?token=...` via Resend (always 200, no enumeration; re-requesting invalidates the prior token).
- `POST /api/auth/reset-password {token,new_password}` validates (hash + unused + unexpired), updates the bcrypt hash, marks the token used, and **returns a JWT + user (auto sign-in)**.
- **Removed** the 6-digit email code flow and the 4-digit offline PIN entirely: endpoints `verify-reset-code`, `forgot-password-pin`, `reset-pin` (GET+POST), `has-pin`; PIN helpers/models; `UserPublic.reset_pin_enabled`. `reset_codes` collection → `password_reset_tokens`.
- **Web:** `/forgot-password` is now email-only ("check your inbox"); new `/reset-password` page sets the password, auto-signs-in (AuthContext `setSession`), and redirects to the home feed. Removed the PIN card from Settings. Both render fullscreen outside the app shell.
- **Mobile:** `/forgot-password` is email-only; deleted the pin/verify/reset screens + `account/reset-pin`; added a deep-link route `app/reset-complete.tsx` (`postmeplex://reset-complete?token=...`) that stores the session and lands on Home. The web reset page redirects mobile browsers to that scheme for auto-sign-in.
- **Config:** added backend `APP_PUBLIC_URL` (preview = preview URL). ⚠️ PRODUCTION: set `APP_PUBLIC_URL=https://postmeplex.com` in the production backend env or reset links will be broken.
- ⚠️ **Resend is in SANDBOX mode** — real reset emails only deliver to the Resend account owner until a domain is verified in the Resend dashboard. Until then the API returns a `dev_link` fallback.
- ⚠️ Mobile deep-link auto-sign-in only works on a real published build (not Expo Go / preview).
- Verified: testing agent iteration_23 = 14/14 backend + all web UI checks pass. Also fixed the iteration-22 typing 500 (naive-vs-aware datetime) in `routes/messages.py` (verified 200).

## Changelog
### 2026-06 (part 4) — Admin-managed 4-digit password-reset PIN (2nd reset method)
- **New reset method alongside the email link.** `POST /api/auth/reset-with-pin {email, pin, new_password}` verifies the user's assigned 4-digit PIN, updates the bcrypt hash, and **returns access_token + user (auto sign-in)**. Unknown email → 403 (no enumeration).
- **Founder/super-admin has a FIXED reset PIN `7455`** — force-seeded on every backend startup (`ADMIN_DEFAULT_PIN`, applied even if a stale hash existed).
- **Admin PIN management:** `POST /api/admin/users/{user_id}/reset-pin` (super-admin only) sets/changes a custom 4-digit PIN, or clears it when pin is empty/absent (`$unset`). `GET /api/admin/users` now returns `has_reset_pin` per user. Both admin endpoints reject non-admins (403) and anonymous (401/403).
- **Lockout:** 5 wrong PIN attempts → 15-minute lockout (`PIN_LOCKOUT_MINUTES=15`), returns 429 with `Retry-After` (even a correct PIN is blocked while locked).
- **Web:** new `/reset-pin` page (`pages/ResetWithPin.jsx`, route in `App.js`) — email + PIN + new password, auto-sign-in + redirect to `/`. `/forgot-password` links to it.
- **Admin PIN console now on BOTH surfaces:** web `/admin/reset-pins` (`pages/AdminResetPins.jsx`, super-admin-guarded) mirrors the mobile screen — search users, set/change/clear PIN via dialog, `has_reset_pin` badges. Entry points: super-admin-only sidebar "Reset PINs" link + Settings → Admin card.
- **Mobile:** `app/forgot-password/pin.tsx` (user PIN reset), `app/admin/reset-pins.tsx` (founder: search users + set/change/clear PIN), link added from `app/forgot-password/index.tsx`, admin entry added to `app/settings.tsx`.
- **Reset-link origin auto-derived from request** so production web reset emails no longer require setting `APP_PUBLIC_URL`.
- Verified: testing agent iteration_24 — 7/7 backend + all web + all mobile flows GREEN. Founder password restored to `Semi123!` after run.
- ⚠️ PENDING USER PROD VALIDATION: (a) real Resend email delivery (still SANDBOX — only founder email until a domain is verified); (b) mobile deep-link auto-sign-in (needs a published native build). Redeploy preview → production to apply.

## Changelog
### 2026-06 (part 5) — All admin tools on WEB (parity with mobile)
- Web now has the full admin console (previously mobile-only except Reset PINs), super-admin-gated (non-admins redirect to `/`):
  - `/admin/verify` (`pages/AdminVerify.jsx`) — verified-badge toggle via `POST /api/admin/users/{id}/verify`, searchable user list.
  - `/admin/blogs` (`pages/AdminBlogs.jsx`) — blog-publisher approval queue: `GET /api/admin/blog-requests`, grant/revoke via `/api/admin/blogs/{grant|revoke}/{user_id}`.
  - `/admin/reset-pins` (`pages/AdminResetPins.jsx`) — 4-digit reset-PIN management (from part 4).
- Shared tab nav `components/AdminTabs.jsx` switches between the three. Entry points: super-admin-only **Admin** sidebar link (→ `/admin/verify`) + a **Settings → Admin** card with all three links.
- No backend changes — reuses existing endpoints. Verified: testing agent iteration_25 (web, all green — gating, tabs, toggle/grant/deny/set-PIN flows).

## Changelog
### 2026-06 (part 6) — Long-form videos in the Home feed (web + mobile)
- `GET /api/feed` now merges **public** long-form videos with posts, interleaved newest-first (60-item cap), video items tagged `type: "video"` via `serialize_video_for_feed`. Private/unlisted videos excluded; block filter applies to both streams.
- **Web** (`pages/Home.jsx`): new `VideoCard` variant — "Video" pill, title, thumbnail + play overlay, read-only view/like/comment stats; tapping opens `/videos/:id` (fullscreen watch). Posts render unchanged.
- **Mobile** (`src/components/VideoFeedCard.tsx`, branched in `app/(tabs)/home.tsx`): matching video card, tapping opens `/video/:id`. `FeedItem` type extended with `"video"` + optional `title`/`description`.
- Video cards are read-only in the feed (no inline post-like); interactions happen on the watch page — avoids the /posts-vs-/videos like endpoint mismatch.
- Verified: testing agent iteration_26 — backend 4/4 (merge, sort, visibility, block) + web + mobile card rendering & watch navigation, parity confirmed, zero stray /posts like calls.

## Notes
### 2026-06 (part 7) — Reel bug fixes: comments + open-fullscreen (web + mobile)
- **Web `ReelWatch` (/reels/:id):** the comment button was a static, non-clickable display. Now it opens a working comments drawer (list + post via `/api/posts/{id}/comments`); count increments; close works.
- **Web `Discover` Top grid:** reel tiles were linking to the author profile (`/user/:id`). Now reels → `/reels/:id`, long videos → `/videos/:id`, plain posts → profile (no post-detail page on web). Added a "Reel" badge on reel tiles.
- **Mobile `Discover` Top grid + search results:** reel tiles opened the broken `/post/:id` card (no video). Now reels open the fullscreen reel viewer `/(tabs)/reels?startId=<id>` (which already has a working CommentSheet).
- Reels are `posts` with `type=reel`; comments/likes use `/api/posts/{id}/comments` and `/api/posts/{id}/like` (backend already correct).
- Verified: testing agent iteration_27 — backend 4/4 + web & mobile reel comment + open-fullscreen + Discover nav, all pass. Founder password preserved.

### 2026-06 (part 8) — Verified badge in reel/video comments
- **Bug:** the blue verified badge wasn't showing beside verified users' names in reel comments. Backend returns comments with a FLAT `is_verified` field; the web `ReelWatch` comment drawer rendered no badge at all (mobile `CommentSheet` already did).
- **Fix:** web `ReelWatch` + `VideoWatch` comment rows now render `BadgeCheck` when `is_verified` (or `author.is_verified`) is true. Also fixed `POST /api/videos/{id}/comments` to return the full serialized comment (author + is_verified + created_at) so a freshly-posted video comment shows the badge without reload (previously returned only `{id,text}`).
- Verified: testing agent iteration_28 — backend 5/5 + web reel/video + mobile reel badges, non-verified users show no badge.

### 2026-09 (part 9) — Post from the website + clickable profile posts (web)
- **Web Home composer** (`components/PostComposer.jsx`): create a post with a caption and an optional **photo OR video** (Cloudinary upload) + optional game tag; posts via `POST /api/posts` and prepends to the feed. Feed already renders inline image/video.
- **Backend:** `CreatePostBody` + `create_post` extended with optional `video_url`, `thumbnail_url`, `duration` (photo posts already used `image_url`).
- **Clickable profile posts:** web Profile `PostsGrid` tiles now link to a new **post detail page** `/posts/:id` (`pages/PostDetail.jsx`, rendered inside the shell) with media, caption, like, and comments (list + add, verified badge). Video posts show a play badge on the tile.
- Verified: testing agent iteration_29 — backend 7/7 + web composer/feed/post-detail/like/comment flows all pass.

### 2026-09 (part 10) — Fix: large video upload from web + verified badge on profile
- **Web video upload "Upload Network Fail":** the Cloudinary helper (`lib/cloudinary.js`) did a single POST which fails for large videos (>~100MB single-shot unsigned limit). Now **chunks files > 90MB** via `Content-Range` + `X-Unique-Upload-Id` (validated against the unsigned preset); small files keep the single-shot path. Used by both the Home composer and `/videos/new`.
- **Verified badge on profile:** confirmed the web Profile header renders `BadgeCheck` for verified users (backend `/api/users/{id}` returns `is_verified`); not reproducible in preview → the production report is a stale build (needs redeploy).
- Verified: testing agent iteration_30 — backend 7/7 + composer video/photo upload + verified badge on own/other/non-verified profiles all pass.

### 2026-09 (part 11) — Large uploads (up to 1GB) readiness
- Web + mobile already chunk large videos (Cloudinary chunked upload, Content-Range/X-Unique-Upload-Id). Added a **1GB client guard + upload progress** to the web Home composer, and a 1GB guard to `/videos/new`.
- **IMPORTANT (account, not code):** Cloudinary per-file limits — Video: Free 100MB / Plus 2GB / Advanced 4GB; Image: Free 10MB / Plus 20MB / Advanced 40MB. **1GB videos require upgrading the Cloudinary plan to Plus or higher.** 1GB photos are NOT supported by Cloudinary's image pipeline on any plan (max 40MB). The app code is ready; the real cap is the plan.
- Not E2E-tested (no 1GB test file; current plan caps at 100MB). Chunked protocol previously validated via curl.

### 2026-09 (part 12) — Auto-compress videos to fit the upload cap (web)
- New `frontend/src/lib/videoCompress.js`: re-encodes a video in-browser (`<video>` → `canvas.captureStream()` → `MediaRecorder`) at a **bitrate derived from duration** (`targetBytes/duration`, downscaled to 720p) so output lands under `TARGET_MAX_BYTES` (95MB) **regardless of input size**. Falls back to the original on encoder error / 0-byte / no size gain.
- Wired into the Home composer (`PostComposer.jsx`) and `/videos/new` (`VideoUpload.jsx`): videos >95MB auto-compress (phase "Compressing %") before upload; sub-threshold videos upload unchanged. This lets large videos upload successfully even on the Cloudinary Free plan (100MB cap) without a plan upgrade.
- Caveat: MediaRecorder re-encodes in REAL TIME (a 10-min clip ≈ 10 min) and outputs WebM/MP4 — the only fully client-side option. Verified in-browser that captureStream+MediaRecorder works; testing agent iteration_31 confirmed 0 JS errors and no regression to normal uploads. The >95MB path can't be E2E-tested headlessly.

### 2026-09 (part 13) — Fix iOS upload permission error + delete own posts (web)
- **iOS Safari "not allowed by the user agent" error:** the web compressor called `canvas.captureStream()`/`MediaRecorder`, which throw `NotAllowedError` on iOS Safari and surfaced as a toast that broke uploads. Fix: `canCompressVideo()` now actively probes the APIs (returns false on iOS → skips compression) and `compressVideoToTarget()` wraps everything in try/catch to **fall back to uploading the original file** on any error. The permission error can no longer appear.
- **Delete own posts on web (was missing entirely):** added an owner-only Trash button to feed `PostCard` (`post-delete-<id>`), feed `VideoCard` (`feed-video-delete-<id>`), and `PostDetail` (`post-detail-delete`) → `DELETE /api/posts/:id` (or `/api/videos/:id` for videos). Only shows for the current user's own content; backend enforces 403 for non-owners.
- Verified: testing agent iteration_32 — backend 7/7 (delete + ownership 403 + regression) + frontend 5/5 (feed/detail delete, ownership guard, upload regression). iOS permission error not reproducible in headless Chromium; fix validated by code + no permission toast on normal uploads.

### 2026-06 — Farm simulator engine (Hay Day-style) added as a 5th game kind (web)
- Root cause of "asked for farm, got match-3": no simulator engine existed, so the AI fell back to match-3. Added `kind: "farm"` — a real-time farming/economy SIM (plant → grow on timers → harvest → sell → earn coins/XP → level up → buy plots). GEN_SYSTEM now routes "simulator/tycoon/farm/idle/economy" requests to `farm`.
- Backend: `farm` config `{crops:[{id,name,emoji,seed_cost,grow_seconds,sell_price,xp}], start_coins, start_plots}` (AI-generated, validated/clamped). New persistent `farm_state` collection + endpoints: `GET /farm`, `POST /farm/plant|harvest|sell|buy-plot`. Growth uses server epoch `ready_at`; `now` returned so the client countdown aligns. Level = 1 + xp//100. Plots cap 16, plot cost = 50×count. farm games are not level-based (`level_count=1`); `farm_state` cleared on game delete.
- Frontend: `components/games/FarmGame.jsx` — coins/level/XP HUD, plot grid (empty→seed picker, growing→live countdown, ready→harvest glow), Sell shop (inventory→coins), buy-plot. `GameMap` renders FarmGame directly for `kind==="farm"` (skips the level map); hub shows a "Farm sim" tag.
- Verified e2e: AI built "Sunny Farmstead" (6 themed crops, 200 coins, 6 plots). plant (coins −seed), harvest-too-early → 400, waited out timer → harvest (+XP, +inventory), sell (coins +sell_price, inventory cleared), buy-plot refused when unaffordable. UI renders + seed picker works. Self-tested (not the testing agent). Demo left private.

### 2026-06 — AI Game Studio: multi-genre AI game generation (web)
- Games are no longer match-3 only. Added 3 new playable engines + kept match-3 = **4 kinds**: `match3`, `memory` (card-pair flip), `quiz` (trivia MCQ), `tapper` (tap-reflex). Backend `games.py` now stores `kind` + a kind-specific `config` (match-3 keeps top-level fields for the manual editor); `level_params` branches per kind returning content + target/star thresholds; `complete_level`/stars are uniform.
- **AI generation (any kind):** `POST /api/admin/games/ai-create` (model `openai/gpt-4.1-mini`) reads a free-text description + optional `kind`/`difficulty` hints, CHOOSES the best engine, and generates full themed content — real trivia Q&A, themed emoji card sets, tapper emoji/bg, or match-3 tiles. Saved **private**. `_validate_config` clamps/validates each kind (quiz needs ≥3 valid questions etc.). `ai-edit` works per kind (match-3 → settings patch; others → full config rewrite).
- **Frontend:** new engines `components/games/MemoryGame.jsx`, `QuizGame.jsx`, `TapperGame.jsx`; `GameMap` renders the right engine by `kind` with kind-aware intro/stats. `AdminGames` "Create a game" box upgraded to an **AI Game Studio** form (description textarea + Game-type select incl. Auto + Difficulty). Admin game rows show a kind badge; manual numeric fields only shown for match-3.
- **Verified e2e:** AI created a geography quiz (15 real Qs), a farm-animal memory game, and a mole tapper. Quiz played start→finish: 5/5, 3★, score saved, Level 2 unlocked. Memory (12 cards/6 pairs) + Tapper render correctly. Fixed a transient "couldn't load" toast on private games (gated load on auth readiness). 3 demo games left private for review. Self-tested (not the testing agent).

### 2026-06 — Games: Sage AI create/edit + slide controls + level-save bugfix (web)
- **BUGFIX (levels didn't save / no "next level"):** a match-3 level only ended when ALL moves ran out, and reaching the target with moves left did nothing — so players never "completed" a level and nothing persisted. Added a **"Target reached — Finish level"** button (appears once score ≥ target) that completes the level immediately → saves stars/best, unlocks the next level, and shows the Next-level button. Verified e2e: 3★, score 3660, progress `{unlocked:2, L1 completed}`.
- **Slide controls:** `Match3Board` now supports `control: "tap" | "slide"`. Slide mode uses pointer/touch swipe-to-swap (`touchAction:none`); tap mode keeps tap-select-swap. Backend `control` field added to the game model, `_public_game`, `GET /levels/{n}`, create/update.
- **Sage AI edit (full):** `POST /api/admin/games/{id}/ai-edit` — admin types an instruction and Sage rewrites any tunable setting (title, description, emoji, level_count, moves, target, difficulty, control tap↔slide, tile theme/colors). Applies live, so changes hit public players too. e.g. "make the physics slide not tap" → `control:slide`; "make it harder" → fewer moves + higher target.
- **Sage AI create (private→public):** `POST /api/admin/games/ai-create` designs a themed match-3 from a description, saved **private**; admin previews then flips **public** via a visibility toggle. `GET /api/games` hides private games from non-admins. Admin UI: "Create with Sage AI" box + per-game "Ask Sage to edit" box + Private/Public toggle + "Private" tag on the hub.
- Model used: `openai/gpt-4.1-mini` (fast/cheap) via emergentintegrations, key from `settings_store`. All self-tested via curl + browser (not the testing agent).
- **Still match-3 only (honest scope):** "slide" is a different physics within match-3. Truly different GENRES (memory, trivia, runner, etc.) need new engines — a backlog item to add as selectable AI game kinds.


### 2026-06 — Games section + "PostMePlex Match" match-3 (web) [Phase 1]
- **New backend `routes/games.py`**: pluggable games hub. Collections `games` + `game_progress`. Endpoints: `GET /api/games`, `GET /api/games/{slug}`, `GET /api/games/{slug}/levels/{n}` (deterministic per-level target/moves/colors), `POST /api/games/{slug}/levels/{n}/complete` (server computes stars, keeps best, unlocks next, clamps score), and admin CRUD `GET/POST/PUT/DELETE /api/admin/games`. Seeds a default game "PostMePlex Match" (30 levels, PostMePlex-themed tiles) idempotently at startup.
- **Match-3 engine** `frontend/src/games/match3.js` (pure logic): board gen w/o initial matches, match detection, gravity+refill, cascading chains, dead-board reshuffle, and specials — **striped** (row/col line-clear from a 4-match) and **color bomb** (from a 5-match, clears all of a color). `Match3Board.jsx` renders the 8×8 board with HUD (moves, score, target progress), tap-to-swap, animated cascades.
- **Pages**: `Games.jsx` (hub with progress/stars), `GameMap.jsx` (saga-style zig-zag level map with locked/open/completed nodes + 1–3 stars, level intro → play → result with Replay/Next), `AdminGames.jsx` (create + edit title/emoji/levels/moves/target/difficulty/active + delete). Added `/games`, `/games/:slug`, `/admin/games` routes, a **Games** sidebar nav item, and an **Admin → Games** tab.
- Verified: backend complete-logic via curl (stars=2 @2400, best kept, unlock advances, score clamp on huge values); browser e2e — hub + map render, a real tile swap produced a match (score 0→480, moves 28→27), admin manager renders/edits. Self-tested (not the testing agent).
- **Backlog (Phase 2+):** AI-assisted game/theme generation (deferred, user has limited LLM credits), wrapped (3×3) specials + special combos, obstacles/blockers, mobile port.


### 2026-06 — Editable API Keys admin panel (web) — update keys live, no redeploy
- **New `backend/settings_store.py`**: central resolver for all third-party keys — DB override (`db.api_keys`) → env → default, cached in memory and refreshed instantly on edit, so new keys take effect at runtime with NO restart/redeploy. Each environment (preview/prod) keeps its own overrides in its own DB.
- Refactored every key consumer to read dynamically via `settings_store.get(...)`: Cloudflare (`live.py`), Agora (`calls.py`), ElevenLabs + Emergent LLM (`sage.py`), Cloudinary + Emergent LLM (`pets.py`), VAPID web-push + Pixabay + badge-color LLM (`server.py`), and all health checks (`keyhealth.py`). VAPID PEM is now derived per current key (`_vapid_pem_path`).
- **Admin endpoints** (super-admin only, in `keyhealth.py`): `GET /api/admin/keys/values` (masked values + source), `PUT /api/admin/keys/{name}` (save/clear override), `POST /api/admin/keys/{name}/test` (live validation). Managed keys: Cloudflare (acct+token), Agora (id+cert), ElevenLabs, Cloudinary (name+preset), Pixabay, VAPID (public/private/subject), Emergent LLM.
- **Web UI**: `ApiKeyEditor.jsx` added to Admin → API keys — per-key masked value, source pill (Custom/Default/Not set), password input, Save, live Test (✅/❌), and Reset-to-default.
- Verified via API: saving a fake Pixabay key → Test returns `invalid` (proves override is live); clearing → back to `env` → Test `ok`; non-admin → 403. Web editor screenshot confirmed. Masked secrets never leave the backend.


### 2026-06 — Go-live follower alerts: notification page routing (web + mobile)
- Backend `POST /api/live` already fanned out to all followers via (1) in-app `notifications` doc (type `live`), (2) native `send_push`, and (3) browser `send_web_push`. Added `live_stream_id` to the live notification doc for clean client routing.
- Web `Notifications.jsx`: added a `Radio` icon for `live` and routed `live` notifications (and any notif with a `link`) to `/live/:id` (previously fell through to the actor's profile).
- Mobile `app/notifications.tsx`: `Notification` type extended (`live`/`pet`/`update` + `link`/`live_stream_id`); red `radio` icon for live; tapping a live notification pushes to `/live/:id`.
- Verified end-to-end on preview: creator go-live produced a follower `live` notification with correct `link` + `live_stream_id`. Real web-push / native-push delivery still requires a subscribed browser / native build (unverified in preview).


### 2026-06 (part 14) — Inline commenting on homepage posts (web)
- Homepage feed `PostCard` comment button was previously a static, non-functional count. Now it toggles an inline comment section (`post-comment-toggle-<id>` → `post-comments-<id>`) that fetches `GET /api/posts/:id/comments`, shows an input (`post-comment-input-<id>`) + submit (`post-comment-submit-<id>`), and posts via `POST /api/posts/:id/comments`. Comments render author name + verified badge; live count updates on the card. Non-signed-in users see a disabled "Sign in to comment" input.
- Reuses existing backend comment endpoints (no backend change). Self-verified via preview: comment posted, count updated to 1, verified badge shown.

### 2026-06 (part 15) — Reels in the Home feed (web + mobile)
- `GET /api/feed` now also merges **reels** (`db.posts` docs with `type:"reel"`) alongside posts + long-form videos, interleaved newest-first (cap raised 60→80). `serialize_post` already emits `type:"reel"`; block-filter applies to all three streams.
- **Web** (`pages/Home.jsx`): new `ReelCard` (`feed-reel-<id>`) — "Reel" badge, portrait 9/16 thumbnail (`feed-reel-thumb-<id>`) with play overlay, read-only view/like/comment stats; tapping opens fullscreen `/reels/:id`. Owner delete via `feed-reel-delete-<id>` (`DELETE /api/posts/:id`).
- **Mobile** (`src/components/ReelFeedCard.tsx`, branched in `app/(tabs)/home.tsx`): matching card with "REEL" pill + portrait thumb (`feed-reel-thumb-<id>`); tapping opens the fullscreen reels player via `/(tabs)/reels?startId=<id>`.
- Verified: testing agent iteration_33 — backend 5/5 (feed includes reels, fields, sort/cap 80, block filter, anon) + web (3 reel cards, nav to /reels/:id, post/video regression) + mobile (reel cards, nav to reels player, regression), parity confirmed.
- Minor parity gap (non-blocking): mobile reel/video feed cards have no owner-delete affordance (matches existing mobile video card behavior); web has it. Could add later.

### 2026-06 (part 19) — Video watch page restyled to match the site (web)
- `/videos/:id` (`VideoWatch.jsx`) previously rendered fullscreen edge-to-edge on `bg-black` with no sidebar. Now it renders **inside the AppShell** (sidebar + top/bottom nav + `bg-background`) like every other page. Changed `App.js` `isFullscreenRoute` regex to fullscreen **reels only** (`/^\/reels\/(?!new$)[^/]+$/`); `/videos/:id` is no longer fullscreen.
- Player is now in a contained rounded-2xl bordered card (`max-h-[72vh]`, black letterbox inside the card only); back button restyled to a themed outline pill; details/comments/up-next reuse the site's card theme. No behavior/endpoint changes (like/edit/delete/comment unchanged from iteration_34).
- Self-verified via screenshot: sidebar present, themed background, player in card — matches the rest of the site.

### 2026-06 (part 18) — Web activity alerts: tab badge + browser Web Push
- **Goal:** users see missed activity even when not looking at the app — in the browser tab, and via system notifications when the site is closed.
- **Backend** (`server.py`): new `GET /api/notifications/unread-count`; self-hosted **Web Push** via VAPID/pywebpush — `GET /api/push/vapid-public-key`, `POST /api/push/web-subscribe` (upsert by endpoint, stored in `push_subscriptions`), `POST /api/push/web-unsubscribe`. `send_web_push(user_id,title,body,url)` helper runs pywebpush in a thread, prunes dead subs on 404/410, never raises; hooked into the follow / like / comment notification sites alongside the existing Expo `send_push`. VAPID keys in `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_B64`, `VAPID_SUBJECT`); private PEM written to `/tmp/postmeplex_vapid_private.pem` for pywebpush. Added `pywebpush`/`py-vapid` to requirements.
- **Web** (`/app/frontend`): `public/push-sw.js` service worker (registered in `index.js`) shows/opens notifications; `src/lib/webpush.js` enable/disable/subscribe helpers; `src/hooks/useNotificationBadge.js` polls unread count every 30s → sets tab title `(N) PostMePlex`, draws a red favicon dot, and fires a foreground browser notification when count rises while the tab is hidden (mounted in `App.js` `Shell`). Settings has a "Browser notifications" enable/disable toggle (`settings-toggle-push`); silent re-subscribe on load only if permission already granted.
- **All ways to alert users (summary):** (1) tab title count + favicon dot [done], (2) foreground browser notification when tab hidden [done], (3) Web Push when site closed [done — desktop + Android Chrome; iOS Safari needs Add-to-Home-Screen PWA], (4) Expo mobile push [already integrated], (5) email via Resend [NOT built — deferred].
- Verified: unread-count returns correct values; tab title shows "(2) PostMePlex" in a real browser; web-subscribe stores; VAPID key loads (no deserialize error); notification-triggering actions stay 200 with push non-blocking. NOTE: true closed-tab push **delivery** to a real browser/device is NOT verifiable in this env — verify on a real HTTPS browser after deploy. Production needs the same `VAPID_*` env vars present.

### 2026-06 (part 17) — Default profile picture (PostMePlex logo)
- Uploaded the PostMePlex lightning logo to Cloudinary as a permanent default avatar: `https://res.cloudinary.com/dpnrol54k/image/upload/v1790110483/postmeplex_default_avatar.png` (overridable via `DEFAULT_AVATAR_URL` env).
- **Backend** (`server.py`, `routes/videos.py`, `routes/messages.py`): added `avatar_or_default(url)` and coalesce **on read** at every avatar-serving site — `user_to_public`, `serialize_post`/`serialize_video_for_feed` authors, video authors, stories, comments (list + create), notification actor avatars, and DM/conversation participant + sender avatars. Applied on read so ALL existing users, new signups, and anyone who clears their avatar automatically show the logo; a custom uploaded avatar always takes precedence. No migration/writes changed.
- **Clients:** web `AVATAR_FALLBACK` (`lib/format.js`) and the 4 mobile `FALLBACK_AVATAR` constants (PostCard/ReelFeedCard/VideoFeedCard/StoryBar) now point to the same logo for null-author edge cases.
- Self-verified: new account `/register` → `/auth/me` and `/feed` author both return the logo URL; web feed renders it; founder's custom avatar preserved.

### 2026-06 (part 16) — Edit + Delete for posts, reels & videos (web + mobile)
- **Backend:** new `PUT /api/posts/{id}` (owner-only) edits caption + game_tag for posts AND reels. Existing `PUT /api/videos/{id}` covers full video edit (title, description, category, tags, visibility, thumbnail_url). Delete endpoints already owner-only.
- **Edit scope (agreed):** posts/reels = caption + game tag (media unchanged); videos = title/description/category/tags + REPLACE THUMBNAIL (video file unchanged).
- **Web:** reusable `components/EditContentModal.jsx` (post/reel vs video forms; video form uploads a new thumbnail to Cloudinary). Owner Edit(✏️)+Delete(🗑) wired on Home `PostCard`/`ReelCard`/`VideoCard`, `PostDetail`, `ReelWatch`, `VideoWatch`. Also added a **custom thumbnail picker to the web VideoUpload page** (`video-thumb-upload-btn`) — previously web upload had no way to set a thumbnail (mobile upload already did).
- **Mobile:** reusable `components/EditContentSheet.tsx` + `components/OwnerContentMenu.tsx` (three-dots → Edit/Delete). Wired on `PostCard` menu, `ReelFeedCard`, `VideoFeedCard`, the reels player `(tabs)/reels.tsx` action rail, and `video/[id]` watch (Edit + existing Delete). Mobile video upload already had a thumbnail picker.
- Delete parity now complete on both surfaces for all three content types; non-owners see no controls and backend enforces 403.
- Verified: testing agent iteration_34 — backend 11/11, web 100%, mobile 100%, ownership gating confirmed. Non-blocking follow-ups: super-admin edit-bypass asymmetry, EditContentModal a11y description + cancel-state reset, web thumbnail size/MIME guard.

## Notes
- All MongoDB documents use UUID `id`; `_id` stripped from every response.
- Datetimes stored as UTC `datetime`, serialized as ISO 8601.
- Cloudinary unsigned preset `ml_default` on cloud `dpnrol54k` — shared by mobile + web via env vars.
- Push notifications require a native build; Expo Go / web preview cannot validate them.
- Agora audio only functionally works on real device builds (not Expo Go / web preview). NOTE: Live feature was removed (2026-06); Agora is no longer used.
- Resend still in sandbox — only delivers to the founder's verified email. Forgot-password endpoint surfaces `dev_code` in the response for other accounts so the UI can autofill.

## Roadmap
### Verification pending by user
- Iteration 19 livestream Agora fix — verify by running a real dev/prod build (Publish) and testing audio between two devices.
- Iteration 20 web app — try each surface at the web preview URL (login: `semidiepie@gmail.com` / `Semi123!`).

### Upcoming / Backlog
- **P1:** Refactor `server.py` (>2500 lines) into `/routes/auth.py`, `/routes/videos.py`, `/routes/posts.py`, etc.
- **P2:** Remove now-unused backend `/rooms` (live) endpoints from `routes/rooms_blogs.py`.
- **P2:** Admin console on web (verified badges, blog approvals) — currently mobile-only.
- **P2:** Notification-settings screen (toggle DM / follow / comment push categories).
- **P2:** Batched / muted-chat push (skip push when user is actively reading the chat).
- **P3:** Web story creation (currently mobile-only).


## 2026-06 — Emergent-managed Push Notifications (mobile)
- Verified against integration_expert playbook (SuprSend relay via `EMERGENT_PUSH_KEY`).
- Backend: `send_push()` → `/api/v1/push/trigger`; `POST /api/register-push` → `/api/v1/push/users/register`; both short-circuit gracefully on placeholder key in preview. Fired on new message, follow, like, comment, and welcome.
- Mobile: module-scope `setNotificationHandler` + Android `default` channel; warm + cold-start tap handlers routing `action_url`/`deeplink`; `getDevicePushTokenAsync` registration on login + foreground; `NotificationPermissionPrimer` (first-launch prime + weekly "Open Settings" nudge via `Linking.openSettings` for blocked users).
- app.json: `expo-notifications` plugin present.
- PENDING (user action): Android `google-services.json` not yet provided → `android.googleServicesFile` intentionally NOT wired (would break build with missing file). Real delivery requires Publish → Deploy → Generate build (uploads Google service account JSON + APNs `.p8`); cannot be tested on Expo Go / web preview.



## 2026-06 — Custom channel handle URLs (web) [iteration 36 ✅]
- Handle = the user's existing **username** (no new field). Profile at `/@username`, video at `/@username/{videoId}`. Web only (per user).
- Backend: `GET /api/users/{key}` resolves a raw id OR `@handle`/username (strips leading `@`). `PUT /api/auth/me` now accepts `username` — validates 3–20 chars `[a-z0-9_]`, lowercases, enforces uniqueness (400 "already taken"). `UpdateProfileBody.username` added.
- Web: added routes `/:handle` (Profile) + `/:handle/:videoId` (VideoWatch) declared last so static routes win. `lib/format.js` exposes `userPath(u)` and `videoPath(v)`; all author/video links across Home, Discover, ReelsFeed, ReelWatch, VideoWatch, PostDetail, BlogRead use them. Legacy `/user/:id` and `/videos/:id` still work and canonical-redirect (replace) to the `@handle` form. Settings has a handle editor (`data-testid=settings-username`).
- Verified: backend 11/11 pytest + full web UI regression (iteration_36.json). Founder handle left unchanged during tests.
- Minor UX backlog: unknown `/@handle` currently toasts "User not found" and redirects to `/discover` — could show a dedicated 404 state instead.



## 2026-06 — Clickable followers/following counters (web)
- Profile Followers/Following counts are now clickable → open `FollowListDialog` (`/app/frontend/src/components/FollowListDialog.jsx`) listing the accounts, each linking to `/@handle`, with a Follow/Following toggle for logged-in non-self viewers.
- Uses existing backend `GET /api/users/{id}/followers` and `/following` (returns `{private, users:[{...public, follows_them, is_me}]}`, honors privacy + blocks). No backend change.
- Stat component in `Profile.jsx` extended with optional `onClick` (renders as button). testIDs: `profile-followers-stat`, `profile-following-stat`, `follow-list-{kind}`, `follow-row-{id}`, `follow-row-btn-{id}`.
- Self-tested: endpoints via curl (created a real follow → list populated), UI screenshot (modal opens, shows follower, links to profile). NOT run through testing agent; the in-modal follow/unfollow button (logged-in only) reuses the same proven `/follow` endpoints but was not UI-clicked while authenticated.
- Known pre-existing data drift (unrelated): denormalized `following` counter can differ from the follows collection (e.g. semidiepie shows 1 but has 0 follow records); the list reflects actual records.



## 2026-06 — Post reels on web
- Mobile already supported reels (Create tab). Added the missing WEB flow.
- New page `/app/frontend/src/pages/ReelUpload.jsx` at route `/reels/new` (ProtectedRoute): vertical video upload with auto-compression (reuses `videoCompress` + `uploadToCloudinary`), caption, single game tag → `POST /api/reels {caption, video_url, thumbnail_url, game_tag, duration}` → redirects to `/reels`.
- Entry points: sidebar "Post a reel" (`data-testid=sidebar-post-reel`) in AppShell; "Create reel" button on the Reels feed header (`data-testid=reels-create-btn`, logged-in only).
- Route ordering: `/reels/new` declared before `/reels/:id`; the fullscreen regex in App.js already excludes `new`, so the page renders inside AppShell.
- Verified: `POST /api/reels` via curl (creates `type: reel`), and UI screenshot (both entry points + `/reels/new` form render, publish disabled until a video is chosen). NOT run through testing agent; in-browser file-upload→Cloudinary→publish reuses the same proven path as the post/video uploaders but was not exercised end-to-end with a real file.



## 2026-06 — Delete own comments (web)
- Backend: `DELETE /api/posts/{post_id}/comments/{comment_id}` — auth required; author-only (403 for non-author, 401 anon, 404 missing); decrements `comments_count` (floored at 0).
- Web: trash button on each comment the current user owns (appears on hover) across all four surfaces that use `/posts/{id}/comments`: Home inline `PostComments`, `PostDetail`, `ReelWatch`, and `ReelsFeed` `CommentsModal`. Optimistic removal + count update with rollback on error. testIDs: `post-comment-delete-{id}`, `post-detail-comment-delete-{id}`, `reel-comment-delete-{id}`, `reels-comment-delete-{id}`.
- Verified: curl (403/401/200/404 + count 1→0) and a Home UI screenshot (delete button renders for owned comment). NOT run through testing agent (self-tested).
- Scope note: covers POST + REEL comments (shared endpoint). VIDEO comments use a separate `/api/videos/{id}/comments` collection and were NOT included — can extend on request. Web only; mobile comment UIs unchanged.


## 2026-06 — Clickable notifications
- Web `/notifications` rows now clickable: follow → `/user/{actor_id}` (redirects to `/@handle`); like/comment → `/posts/{post_id}`. Marks that row read locally on click. (`Notifications.jsx`)
- Mobile `app/notifications.tsx` already routed to `/post/{id}` or `/profile/{id}` — unchanged.
- Verified: web screenshot — clicking a follow notif routed to the actor profile. Backend unchanged.

## Queued (requested, not yet built)
- Remembering account: users apply in Settings → super-admin (semidiepie) approves → "Remembering" label; verified users get a RED badge. (web+mobile)
- Music page (Spotify-style, semidiepie-only songs): browse+play for all; upload/delete admin-only from web+mobile; Cloudinary audio.

## 2026-06 — "Remembering account" (web + mobile)
- Users apply in Settings → super-admin (semidiepie) approves → account gets a red "REMEMBERING" label; verified users' badge turns RED.
- Backend: UserPublic + author serializers now carry `remembering`/`remembering_status`. Endpoints: `POST /api/remembering/apply` (pending), `GET /api/admin/remembering/requests` (admin), `POST /api/admin/users/{id}/remembering` {action: approve|revoke} (admin). Verified via curl (apply→pending→approve→verify→get; non-admin 403).
- Web: `badgeCls(entity)` helper (red when remembering) applied to ALL verified badges (Profile, Home, PostDetail, Reels, ReelWatch, VideoWatch, Blogs, BlogRead, Discover, FollowList, UsernameLine). Profile shows REMEMBERING pill. Settings apply card. New AdminRemembering page + tab + route. Verified via screenshot (red badge + pill).
- Mobile: ProfileView red badge + REMEMBERING pill; Settings apply row; admin/remembering.tsx approval screen + link; `remembering` added to UserPublic type. Lint clean + Metro bundles OK; NOT visually confirmed in preview (auth-gate spinner on deep-linked profile). Mobile red badge NOT yet applied to feed/comment badges (only profile) — follow-up.

## 2026-06 — Music page (Semidiepie-only songs) + background playback
- Backend: db.songs. `GET /api/songs` (public), `POST /api/songs` + `DELETE /api/songs/{id}` (super-admin only, 403 otherwise). Verified via curl (admin upload, list, non-admin 403). Audio hosted on Cloudinary (resource_type video).
- Web: global `PlayerContext` (single persistent <audio> above the router → keeps playing across route changes / backgrounded tab / screen off) + Media Session API (lock-screen controls). Persistent `PlayerBar` (play/pause/seek/next/prev). `/music` page (list + play, admin upload modal audio+cover, admin delete). Sidebar "Music" nav. Verified via screenshot (song plays, player bar shows).
- Mobile: expo-audio `MusicPlayerProvider` (setAudioModeAsync shouldPlayInBackground) + global MiniPlayer, `app/music.tsx` (list + play + admin upload via expo-document-picker/expo-image-picker + delete), Settings "Music" link. app.json: iOS UIBackgroundModes:[audio], Android FOREGROUND_SERVICE(+_MEDIA_PLAYBACK). Installed expo-audio@1.1.1, expo-document-picker@14.
- LIMITS: (web) audio cannot continue after the browser TAB is fully closed — browser limitation; background tab + screen-off works. (mobile) true background/locked-screen audio only works in a NATIVE BUILD, not Expo Go/web preview. Mobile screen renders but /songs fetch is blocked by Expo web-preview CORS (works on device) — NOT visually confirmed with data in preview.

## 2026-06 — Deployment hardening (health check)
- Removed destructive startup behavior: `seed()` no longer calls `purge_legacy_seed_data()` on boot (it now only ensures the founder account). The old purge is dead code, never invoked — deployment agent confirms `destructive_db_startup_confirmed: false`.
- All app-level deployment checks PASS: compilation, env-only URLs (backend MONGO_URL/DB_NAME, web REACT_APP_BACKEND_URL, mobile EXPO_PUBLIC_BACKEND_URL), CORS, Mongo-only, no hardcoded secrets, expo env configured.
- KNOWN FALSE POSITIVE (do NOT fix): deployment agent flags [program:mobile] on port 3001 wanting [program:expo] --port 3000. This is the platform-managed mono-image supervisord.conf — web=3000, Expo preview=3001 by design; changing it collides with web. Protected infra; production pipeline maps ports separately.

## 2026-06 — Messaging Presence & AI Voice (Phase 1, web + mobile)
- Backend: new `routes/presence.py` — `POST /api/presence/ping` (heartbeat, sets user.last_active_at) and `GET /api/presence/active` (mutual-follow friends active within 15min; each has `online` bool for <2min; reciprocal `appear_offline` hides both directions; excludes blocked). `appear_offline` added to `GET/PUT /api/users/me/privacy` (server.py). Router registered after social. Verified via curl + testing agent (14/14 pytest, iteration_51).
- Web (`/app/frontend`): presence heartbeat every 45s in AuthContext (visibility-aware). Messages page shows "Active now" row (mutual friends, green dot for online, "Xm" for recent; tap opens/creates 1:1 DM) + green presence dot on conversation list avatars. Settings has "Appear offline" toggle (reciprocal, persists via /users/me/privacy). ChatPane now has human-DM typing: heartbeat on input + "typing…" bubble + header subtitle. Sage AI text chat already text-only (no audio) with "Sage is typing…" bubble — confirmed (zero audio playback on text send); voice only via phone-call button.
- Mobile (`/app/mobile`): presence heartbeat every 45s + on foreground in AuthContext. Messages list "Active now" horizontal row (ListHeaderComponent) + green online dot on conversation rows; tap friend opens DM. account/privacy.tsx has "Appear offline" toggle. DM typing indicator already existed (unchanged, verified). NOTE: Sage AI chat is WEB-ONLY — mobile has no Sage screen, so the AI-voice item does not apply there.
- Active status default = ON; users opt out. "Recently active" windows: online<120s, recent<15min.
- Phase 2 (later, not built): presence on profile pages + chat header; presence/typing for group chats. Phase 3 (later): delivered/seen read receipts with privacy toggle.

## 2026-06 — Restyled in-app toast popups (web only)
- Global sonner Toaster (mounted in App.js) restyled on-brand: deep-dark card (#171921), 14px rounded corners, soft elevation, 4px vivid accent bar on the left (orange #FF6B3D default/info, green #34C759 success, red #FF3B30 error, amber warning), bold white title + muted secondary (#A0A5B5), per-type lucide status icon (CheckCircle2/XCircle/Info/AlertTriangle/Loader2) with a springy pop-in. Kept top-right position + default auto-dismiss + sonner's native slide/fade motion. No message wording or behavior changes — restyle only, applies everywhere since all toasts share the one Toaster.
- Implementation: App.js `<Toaster icons={...} toastOptions={{ classNames: { toast:'pmp-toast', title:'pmp-toast-title', description:'pmp-toast-desc', icon:'pmp-toast-icon' } }}>` + CSS block in index.css targeting `[data-sonner-toast].pmp-toast` and `[data-type="..."]::before` accent bars.
- Verified via computed styles (radius 14px, green accent for success, icon present) + screenshots (Welcome back! success toast). Mobile out of scope (deferred); Phase 2 = action buttons / title+description; Phase 3 = brand mark/avatar + matching mobile toast.

## 2026-06 — Comment replies & delete on mobile (parity with web)
- Mobile only (web CommentThread already had this, untouched). Backend unchanged — posts (`server.py` /posts/{id}/comments) and videos (`routes/videos.py` /videos/{id}/comments) already supported `parent_id` one-level replies + own-only delete (removes replies, adjusts count). Verified via curl (reply→parent_id=top, delete top→removed=2).
- `mobile/src/components/CommentSheet.tsx` (posts + reels) rewritten: single-level threads (@mention prefill), inline reply composer with Cancel, "View N replies" expand/collapse, Delete-own with a confirm card, live count via new `onCountChange(delta)` prop. Callers updated: home.tsx, post/[id].tsx, reels.tsx.
- `mobile/app/video/[id].tsx` comment section got the same: reply/@mention, view/hide toggle, delete-own via confirm Modal, `{n} Comments` count updates.
- Types: added `parent_id` to `VideoComment` and `Comment` (+`verified_color?` to Comment) in client.ts.
- Delete shows ONLY on your own comments; others get Reply only. Verified: testing agent iteration_52, 7/7 scenarios PASS (two users, posts + video).
- Phase 2 (deferred): post-owner + admin comment moderation. Phase 3 (deferred): edit comment, reply notifications/threading refinements.

## 2026-06 — "X"-style web redesign (Phase 1, foundation-first; web only)
- Budget-conscious foundation pass: restyled the SHARED layer so the look cascades app-wide. No feature/route/behavior changes; 100% parity verified.
- Theme system: Dark (default) + new Light theme via CSS token blocks in index.css (`:root/.dark` dark, `html.light` light). Orange #FF6B3D remains the single accent in both. No-flash init script in public/index.html; `src/lib/theme.js` persists choice in localStorage `pmp-theme`; `ThemeToggle` component (rail + mobile top bar).
- AppShell rewritten: slim left ICON RAIL (w-76) that hover/focus-within expands (w-256) to reveal labels — all existing destinations preserved, orange Post/Create dropdown, account + theme toggle + settings/admin pinned at bottom. Right sidebar (`RightSidebar.jsx`: Search→/discover?q=, Trending via /discover?filter=tags, Who-to-follow via /discover?filter=accounts) shown on browse pages (/, /discover, /notifications, /profile, /user/*, /posts/*) at xl width. Mobile keeps top bar + bottom nav (+ theme toggle).
- Home feed: sticky For you / Following tab bar (both load /feed — no new backend), inline composer, divider-separated timeline (cards → dividers).
- Discover reads ?q= so the sidebar search works.
- Verified: testing agent iteration_53, web frontend, 64/66 (2 expected-by-design), no regressions across all 14 destinations, theme persists, core post/like/comment/delete intact, responsive OK. Applied 3 nits: fixed button-in-link nesting in RightSidebar, split theme-toggle testids (theme-toggle rail / theme-toggle-mobile), added focus-within a11y to rail.
- Deferred (Phase 2/3): per-page fine-polish on Market/Wallet/Pet/Music/Admin internals, hover cards, skeletons everywhere, "Lights out" black variant, command palette, user accent colors + density. Landing/auth inherit tokens (not individually re-art-directed yet).

### 2026-06 — Redesign follow-up fixes
- Following tab was inert: added `?following=1` to GET /api/feed (filters posts/reels/videos to accounts the viewer follows; returns [] if not following anyone). Home now refetches on tab switch (For you → /feed, Following → /feed?following=1). Verified: fetch 200 + correct empty state.
- Collapsed left rail showed a squished/peeking profile avatar: wrapped account Avatar in shrink-0 and switched the name block + logout button from width-reveal to `hidden group-hover:flex/block` so they take no space when collapsed. Verified at rail width 76 — clean avatar.

### 2026-06 — Fix: can't reply to comments from the web feed
- Root cause: Home.jsx used a local `PostComments` renderer (top-level add + delete only, NO reply/threading). The full `CommentThread` (reply/@mention/view-replies/delete) was only wired on PostDetail/ReelWatch/VideoWatch/ReelsFeed.
- Fix: replaced the feed's inline `PostComments` with the shared `CommentThread` (type="post", id=post.id, onCountChange delta). Removed the dead local component. Now reply works in the feed on web (desktop + mobile browser). Verified: Reply + Delete actions show, inline reply composer prefills "@username". Code fix in PREVIEW — needs redeploy for production.

### 2026-06 — X-style rollout (web), social surfaces
- Profile: full X-style — cover banner (branded gradient placeholder, no upload this pass) + overlapping round avatar (ring) + name/@handle/badges/bio + inline X counts (N Posts/Followers/Following) + pill Follow/Edit/Message/Share actions. Existing tabs kept (Posts/Reels/Videos/[TikTok]/Blogs) so nothing is dropped; grids retained for media. Verified dark + light via screenshots. All testIds preserved.
- Post detail: boxed card → divider timeline (border-b, rounded media), comment thread (CommentThread) unchanged.
- Notifications: boxed cards → clean divider list with orange left-accent + dot on unread. testIds preserved; added notifications-list testid.
- Theme toggle confirmed: html gains/loses `light`, persists across navigation; both themes legible.
- Scope note (budget-constrained): utility pages (Settings/Wallet/Market/Pet/Music/Blogs/Admin/Messages/Discover) already inherit the monochrome+orange tokens and were verified in both themes in iteration_53; deeper per-page divider/pill refinement for those is DEFERRED to a follow-up. Profile tabs remain existing content tabs (not literal Posts/Replies/Media/Likes) to avoid dropping Reels/Videos/Blogs and inventing backend for replies/likes.

### 2026-06 — Fix: profile avatar hidden behind cover banner
- Cover banner (position:relative, positioned) painted above the static content below it, clipping the overlapping part of the avatar. Fix: added `relative z-10` to the avatar wrapper in Profile.jsx so it renders on top of the banner. Verified by testing agent iteration_54 (hit-test + dark/light screenshots), no regressions.

### 2026-06 — Cover/header photo + profile Posts timeline
- Cover photo: added `cover_url` to UserPublic + user_to_public + UpdateProfileBody (PUT /auth/me persists; GET /users/{id} & /auth/me return it). Web Settings → Profile card has a Header photo uploader (Cloudinary, same pipeline as avatar) with preview + Add/Change + Remove; Profile banner renders cover_url as background-size:cover filling the box, avatar stays on top (relative z-10). Verified: testing agent iteration_55 (both themes, round-trip, remove).
- Profile Posts tab: converted from square grid to the X-style, fully-functional divider timeline. Extracted Home's post card into shared `components/FeedPostCard.jsx` (used by Home feed AND Profile Posts) — like/comment(CommentThread)/share/edit/delete all work; Profile wires togglePostLike/deletePost/onPostUpdated on its posts state (same /posts/{id}/like + serialize_post data as feed). Removed Home's duplicate local PostCard and Profile's PostsGrid. Self-verified (like 0→1 active, comments open, Home feed intact). Reels/Videos/Blogs tabs keep grids.

### 2026-06 — Multi-image posts + X-style utility page headers (web)
- Multi-image posts (shared backend, platform-agnostic): CreatePostBody now accepts `image_urls: List[str]` (plus legacy `image_url`). create_post stores `image_urls` (and `image_url` = first for backward compat). serialize_post returns `image_urls` (falls back to `[image_url]` for old single-image posts). Verified via curl round-trip: create with 3 URLs → image_urls preserved on create + GET; image_url = first image.
- Web composer (PostComposer.jsx): Photo button now multi-select (up to 4 images), shows count "(n/4)", grid preview with per-image remove; video stays single and is mutually exclusive with images. Submits image_urls array.
- New shared `components/PostMediaGallery.jsx`: single image renders flush; 2–4 images render as an X-style snap-scroll carousel with prev/next arrows, "i/n" counter and dots. Used by FeedPostCard (Home + Profile Posts) and PostDetail.
- Mobile note: mobile client still reads `image_url` (first image) — it shows the first photo, not the carousel. Adding the mobile multi-image gallery is DEFERRED (web-only this pass).
- New shared `components/PageHeader.jsx` (orange icon chip + bold title + subtitle + hairline divider). Applied to Wallet, Market, Settings, Notifications for a consistent X-style header. Messages already matches the X aesthetic (two-pane card list + Active Now), left as-is.
- Verified: lint clean (JS + py); all 4 pages render page-header, Home composer renders. SELF-TESTED only — NOT testing-agent verified. In PREVIEW — needs redeploy for production.

### 2026-06 — Reels views, verified-badge color everywhere, X-style splash (web)
- Reels showed 0 views on profile because reels had NO view tracking at all (videos did, reels didn't). Added `POST /api/reels/{id}/view` (mirrors videos: dedup per viewer within 30 min via new `reel_views` collection, $inc posts.views). Wired web clients to fire it: ReelsFeed autoplay (once per reel via viewedRef when ≥60% visible) + ReelWatch on load. Verified: view→1, same viewer no double-count, anon→2, profile grid reflects it. (Backfill: existing reels start at 0 and accrue from now on.)
- Custom verified-badge color: AUDITED all BadgeCheck usages. In preview the custom color (user.verified_color) already renders correctly in feed/profile/discover/search/comments/messages/presence/live/followers/videos/blogs (all go through UsernameLine or badgeStyle; confirmed computed fill = custom hex vs default orange for others). The only two spots hardcoding orange were ADMIN pages — fixed AdminAccounts.jsx + AdminBlogs.jsx to use fill + inline `verified_color`. NOTE: if the user sees orange on www.postmeplex.com it's the OLD production build — needs redeploy.
- Splash screen redesigned (SplashScreen.jsx + index.css): X-style — full orange brand gradient background with the black lightning bolt (SVG, matches the PMP icon). Bolt pops in (scale .45→1.1→1, ease-out), holds ~1.1s, then zoom-through reveal (scale→14 + fade) exposing the app. Replaces the old dark logo+wordmark splash. Verified visually in preview. SELF-TESTED only.

### 2026-06 — Fix "two splash screens" (PWA launch splash)
- Root cause: installed PWA (standalone) shows an OS launch splash from manifest.json BEFORE the React splash. It was dark (#12141c) + icon, so users saw a dark splash then the new orange animated one.
- Fix: manifest.json background_color #12141c → #F26A3C (brand orange matching the new splash gradient). theme_color left dark (status bar). Now the OS splash blends into the animated orange-bolt splash as one intro.
- CAVEAT: installed PWAs cache the manifest — must reinstall (or OS refreshes manifest) to see it; only applies to production after redeploy.

### 2026-06 — New favicon, rich share cards (with content photo), bookmarks
- ICON: regenerated all website icon files (logo.png, logo-512.png, favicon.png, apple-touch-icon.png, favicon.ico) from /app/scripts/gen_icon.py — brand-orange rounded square + black lightning bolt (matches splash). index.html og:image uses logo-512.png so it updates too. CAVEATS: (1) Google's search-result favicon is heavily cached and refreshes on Google's own schedule (days–weeks) after redeploy; can't be forced. (2) The "App Store" icon (gaming controller) in Google's Apps panel comes from the last PUBLISHED mobile build, not the website — only changes when a new iOS/Android build is published with the new icon. Mobile app icon assets were NOT changed this pass.
- SHARE: routes/share.py — added _render_photo_card (1200x630, content image cover-cropped + bottom scrim + kind pill + title + PostMePlex/@handle). Added /api/share/post, /api/share/blog, /api/share/video (card.png + landing w/ OG+Twitter meta) and updated reel card to photo-forward (falls back to branded card when no image). Wired Share buttons: FeedPostCard (post/reel), BlogRead, VideoWatch; ReelsFeed/Profile/Pet already used /api/share. Verified: card.png renders the real photo; landing has og:image. LIMITATION: rich previews work when sharing via the app's Share button (produces /api/share/* links). Pasting the raw SPA URL (/posts/:id) into FB still shows the generic preview — SPA can't serve per-route OG to crawlers without SSR.
- BOOKMARKS: the post Save button was dead. Backend: db.bookmarks collection; POST /api/bookmarks/toggle, GET /api/me/bookmarks; serialize_post now returns saved_by_me. Frontend: FeedPostCard Save button toggles + fills orange when saved; Profile has a self-only "Saved" tab listing saved posts. Verified end-to-end (toggle→saved_by_me propagates→saved list→untoggle) + UI.

### 2026-06 — Phase 1: Cloudflare Stream video uploads + adaptive playback (web)
- Engine: Cloudflare Stream (billed on the app owner's Cloudflare account). Uses existing CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (via settings_store, same as Live). Confirmed enabled & token authorized in preview (tus mint 201, copy ok, status→ready verified).
- Backend (routes/videos.py): added POST /api/videos/stream/tus-upload (mints one-time resumable direct-creator-upload URL, 1GB cap, maxDurationSeconds=2h), POST /api/videos/stream/from-url (Cloudflare copy; resolves Google Drive share links to direct-download; SSRF guard; 30GB), GET /api/videos/stream/{uid}/status (readyToStream/pct/hls/thumbnail/duration/error). CreateVideoBody now accepts stream_uid+hls_url (video_url optional); video doc stores provider ('stream'|'cloudinary'), stream_uid, hls_url. serialize_video returns provider/stream_uid/hls_url. Existing Cloudinary videos untouched.
- Frontend VideoUpload.jsx: rewritten with two tabs — "Upload file" (tus-js-client resumable upload ≤1GB, live progress) and "Import from link" (Google Drive / direct URL ≤30GB). Shared Processing→Ready status card; publish disabled until ready. Fixed the old 5GB/1GB label mismatch (now accurate per tab). KEY FIX: tus uses onBeforeRequest to send the JWT ONLY to our backend creation call, never to Cloudflare (a custom header on the cross-origin PATCH/HEAD caused a failing CORS preflight).
- Frontend VideoWatch.jsx: adaptive HLS playback via hls.js (native HLS on Safari) for provider==stream; MP4 for legacy; "Still processing" state if a stream video has no hls yet.
- Verified: backend endpoints via curl; FULL browser resumable upload → Ready via UI screenshot; publish+serialize; existing Cloudinary video still plays. All test Stream assets deleted after testing (account back to 0 — no lingering billing). SELF-TESTED, not testing-agent verified.
- Deps added (frontend): tus-js-client, hls.js.
- Phase 2/3 deferred: YouTube links w/ ownership attestation, custom frame thumbnail picker, captions/trim, enforced private/unlisted secured playback, per-video analytics, background re-host queue.

### 2026-06 — Fix: Google Drive import of large files
- Bug: importing a Drive link for a large file (e.g. 808MB .mov) failed with "Couldn't process this video" — Cloudflare's /copy rejected the uc?export=download URL because Google serves an HTML "virus scan" interstitial for files >~100MB instead of the bytes.
- Fix: _resolve_drive_url now returns https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t, which serves the raw file bytes (verified: 200 application/octet-stream, content-length 808MB) and bypasses the interstitial. Verified end-to-end: Cloudflare now accepts the exact user link and moves to state=downloading (was 400 before). Test asset deleted after.
- Residual limits: Google enforces per-file daily download quotas; a heavily-downloaded public file can be temporarily blocked by Google and would surface as an import error.

### 2026-06 — Phase 1: Games hub (admin-curated embedded games, web only)
- Backend routes/games.py (registered in server.py). Collections: games, game_updates, game_follows, game_saves, game_plays (holds last_played_at + per-game privacy 'visible'), game_update_seen.
  - Member: GET /api/games/count, /api/games, /api/games/recent, /api/games/{id}, /api/games/{id}/related (same category→newest fallback), /api/games/{id}/updates; POST /api/games/{id}/{save|follow|play|privacy}, /api/games/{id}/updates/seen. serialize_game returns per-viewer saved/following/followers/last_played/activity_visible/unseen_updates.
  - Admin (is_admin||is_super_admin): GET/POST/PATCH/DELETE /api/admin/games (+cascade delete of all related docs), POST/DELETE /api/admin/games/{id}/updates.
- Frontend (web): AdminGames.jsx (admin tab 'Games' in AdminTabs — add/edit-every-field/delete via dialog + manage updates dialog; icon=circle required, banner optional, name/URL required, dev/category/desc). GamesHub.jsx (/games — Continue playing/Following/Saved/All sections, circular-icon cards). GamePlayer.jsx (/games/:id — slim top bar with close+fullscreen; left iframe embed with loading + 6s 'can't embed → Open in new tab' fallback; right panel: Currently playing, Save, Follow+count, Game updates w/ unseen 'new' badge, privacy Switch, More menu [Open in new tab/Copy link/admin Edit-in-admin+Delete], Recently played, Related games).
  - Single auto-appearing 'Games' side-menu entry (AppShell desktop rail + HamburgerMenu) shown only to logged-in users when /api/games/count>0; placed after Pet.
  - App.js routes: /games, /games/:id, /admin/games (all ProtectedRoute).
- Verified: all backend endpoints via curl (count 0→1, create, save/follow/play/privacy, update post, flags incl unseen_updates=1, recent); UI via screenshot (nav-games appears, hub cards, player right-panel all present, embed loads). SELF-TESTED, not testing-agent verified.
- A demo game "2048" (play2048.co) + one sample update were left in the preview DB so the hub is populated; admin can delete it from Admin → Games.
- Assumptions honored: iframe embed w/ Open-in-new-tab fallback for X-Frame-Options sites; privacy = activity visibility only; web only (mobile Games deferred to Phase 3).
- Phase 2/3 deferred: search/browse/featured, ratings/reviews, friends-who-play, update notifications+badges, play-time tracking; leaderboards, per-game analytics, collections, mobile, dev self-serve.

### 2026-10 — AI characters: premature notification fix + rich settings (age/affection/sleep-aware cadence)
- Fix (preview): AI text reply web-push was fired server-side the instant the reply was stored in /send, so the banner popped BEFORE the client's "thinking + typing" animation finished. Removed the push from /send; the web client now shows a notification itself (via SW registration.showNotification) only AFTER the reply renders AND only if document.hidden. Proactive unprompted texts still push normally. Files: backend/routes/ai_characters.py, frontend/src/components/AiCharacterChat.jsx (notifyReplyReady helper).
- Feature (preview): richer character settings + multi-factor realism.
  - New fields on CreateCharacterBody + stored/returned: age (1-120), affection (adores|warm|neutral|distant|dislikes), sleep_start/sleep_end (0-23 hour overrides; blank = age-appropriate default via _age_sleep_default). Form UI added in Messages.jsx CharacterFormDialog (data-testid aichar-age, aichar-affection, aichar-sleep-start, aichar-sleep-end).
  - _system prompt now injects age ("talk/think/react like someone that age, incl. bedtime") and affection (AFFECTION_LEVELS descriptions) so replies are age- & warmth-appropriate.
  - Proactive scheduler now timezone + sleep aware: user's IANA tz captured on /send & /voice-turn into ai_char_state.tz; _proactive_once computes the user's local time (zoneinfo), and if the character is within their sleep window (_is_asleep, wraps midnight) it does NOT text and reschedules next_eval to just after their wake hour (_next_local_hour_utc) — so a 9yo never texts at 3am and instead says goodnight before bed. When awake, the decision prompt receives local time + bedtime so it weighs personality + affection + age + time-of-day + conversation together.
- Verified (self/agent-tested, NOT testing-agent, NOT user-confirmed): create/update persist+return new fields via curl; _age_sleep_default/_is_asleep/_sleep_window logic unit-checked; form fields render (Playwright confirmed age/affection/sleep inputs visible). Lint clean (py+js).
- Still needs USER/production confirmation: (1) redeploy required to reach postmeplex.com; (2) real cadence feel over time; (3) real web-push receipt when tab hidden; (4) a character's goodnight/good-morning timing matching their age.

### 2026-10 — AI characters: honor promised times + daily-routine texting (preview)
- Problem: a "daughter" character said she'd text at 8:30am leaving for school and never did; also never texted at lunch/recess. The proactive scheduler only knew "hours from now" — no concept of a promised clock time or school-day routine beats.
- Promise capture (free, no LLM): new _parse_next_contact() scans the character's OWN outgoing text (both /send replies and proactive messages) for a future-contact cue and computes the next local datetime: explicit clock times ("8:30 am", "at 3pm"), and named moments — recess→10:15, lunch→12:15, after school/get home→15:15, leaving/before school→7:30, tonight→19:00, good morning→wake+15m, goodnight/before bed→bedtime-30m, bare "tomorrow"→next morning. Stored as ai_char_state.promised_at + next_eval_at (if sooner). _capture_promise() helper wired into /send and proactive send.
- Honoring promises: _proactive_once now reads promised_at; when now>=promised_at it is "promise_due" and BYPASSES the idle-min, next_eval pacing, and unanswered gates (still respects the sleep window), forces a send, injects a "keep your word" instruction into the decision prompt, and clears promised_at after.
- Daily routine liveliness: _routine_anchors(age<=17 & affection in adores/warm) = [wake, 7:30 leave, 10:15 recess, 12:15 lunch, 15:15 after-school, 17:30 evening, bedtime-30 goodnight]. _schedule now snaps a school-age attached kid's next_eval to the next anchor when it's sooner than the hour-based cadence, so she naturally checks in around real daily beats. Adults/distant characters keep plain hour-based cadence (no cost increase for them).
- Verified: _parse_next_contact unit-tested on the exact "8:30am", lunch, recess, after-school, tonight, tomorrow, good-morning cases (all correct); anchors + _next_anchor_utc correct; lint clean; backend healthy (ai-characters 200). NOT run through testing agent; real end-to-end cadence needs elapsed time in production. Cost-aware: promise parsing is pure regex; anchor eval reuses the single existing per-pass LLM decision.
- Needs USER/production confirmation after Publish/Redeploy: she now texts at the promised 8:30 and shows up at lunch/recess for an attached school-age kid.

### 2026-10 — AI characters: make routine beats RELIABLE (preview) + root-cause of "no lunch text"
- Root cause of user's "daughter never texted at lunch" on production: (1) first routine version only controlled WHEN she re-evaluated — the LLM could still return text=false at the anchor; (2) character needs age<=17 AND affection in (adores/warm) set, else no anchors; (3) tz only learned once the user chats a thread; (4) production didn't have the strengthening below.
- Strengthening: added `anchor_due` — when the user's local time is within ~45min of one of her routine beats (recess/lunch/after-school/goodnight) AND she hasn't messaged in >=PROACTIVE_MIN_IDLE_MIN (60m cooldown prevents re-firing the same window across 15-min passes), the scheduler bypasses the next_eval pacing gate, injects a "this is your daily moment, send a short warm text now" instruction, and FORCES should=True so the generated message is actually sent. Same force path as promises.
- Added router.proactive_once hook (safe test entrypoint).
- VERIFIED END-TO-END (1 real LLM call, data restored): at 12:23pm America/New_York with age=9, affection=adores, tz set, idle 3h → Nova sent "Dad it's lunchtime and I can't stop thinking about that joke…" and the web push fired; next_eval snapped to the evening anchor. 
- ACTION FOR USER: redeploy production again to ship this strengthening. Note: if the user is actively chatting with her near a beat (idle<60m) she won't ALSO proactively ping — by design (she only initiates when you haven't been talking).

### 2026-10 — AI characters: full daily SCHEDULE + AI-decided timing + opt-in CALLS (preview)
Backend (routes/ai_characters.py):
- New per-character fields: schedule (list of {start "HH:MM", end, activity, busy, weekdays_only}) + allow_calls (bool). Stored/returned in _char_public, create, update. New ScheduleBlock model.
- Schedule helpers (pure, unit-tested): _hhmm, _todays_blocks (drops weekdays_only on Sat/Sun), _busy_now (free blocks override busy ones; returns next-free hour), _free_anchors (reach-out moments = free-block starts + busy-block ends), _schedule_lines (static timetable for _system), _schedule_now_ctx ("right now you are busy with/free during X").
- _system now includes the character's static daily schedule; /send & /voice-turn append the time-relative "right now" line so replies reference what she's doing.
- Proactive scheduler: when a schedule exists it drives anchors (replaces age-routine) + a BUSY GATE — if she's in a busy block she won't text/call and reschedules next_eval to her next free moment. Sleep gate still applies.
- Calls: _proactive_decide now takes can_call and returns an action ("text"|"call"). can_call = allow_calls AND affection in (adores/warm) AND under daily cap (2/day, tracked via state.calls_day/calls_count) AND local time known. When she chooses "call": inserts an ai_char_calls doc (status ringing, 120s expiry), stores a "📞 Nova tried to call you" thread message, and web-pushes "📞 Nova is calling you". Counts toward the one-proactive-per-pass cap.
- New endpoints: GET /api/ai-characters/incoming-call (latest ringing call for the user), POST /api/ai-characters/calls/{id}/answer, /decline. (curl-verified.)
Frontend:
- Admin form (Messages.jsx): structured schedule editor (time-block rows: start/end/activity + Busy + School-days-only checkboxes, add/remove) + "Let this character call me" toggle. (DOM-verified render + row add + persistence via API.)
- CharacterCall (AiCharacterChat.jsx) exported + new autoListen mode: greets first, then hands-free VAD (AnalyserNode RMS) — after you stop talking ~1.2s it auto-sends and she replies, looping for a natural call; 20s safety cap; manual mic still works. Non-incoming (user-initiated) calls keep tap-to-talk.
- New global IncomingCallListener (mounted in AppShell, admin-only): polls incoming-call every 20s + on focus, shows a full-screen ringing screen with a synthesized "ring ring" ringtone + Answer/Decline; Answer → hands-free CharacterCall(autoListen). (Incoming screen + Answer/Decline DOM-verified.)
Verified: schedule logic unit-tested; create/update persist; call endpoints curl-verified; admin form + incoming-call UI Playwright DOM-verified; lint clean (py+js).
NOT verifiable in automation (needs real device/user): the LLM actually choosing to "call", live microphone auto-listen, and ringtone audio (browser autoplay needs a prior gesture). Web can't truly ring when the app is fully closed — the push notification is the trigger (told user). Requires Publish/Redeploy for production.

### 2026-10 — AI characters: async human-paced replies + busy deferral + web-push fix (preview)
Push enable fix (iOS):
- Root cause of "toggle does nothing / stuck" on iPhone: iOS only exposes Web Push inside an INSTALLED PWA; in a normal Safari tab PushManager is absent and serviceWorker.ready can hang. webpush.js now: isIOS()/isStandalone()/pushUnavailableReason() helpers; enableBrowserPush() throws a clear "Add to Home Screen" message when iOS-not-installed, and races serviceWorker.ready against an 8s timeout so it never hangs. AdminKeys toggle surfaces the message + respects the boolean (Settings already did).
Notification regression root cause + fix:
- The direct AI-reply push had been moved client-side (only fires while the app is running) → on an installed PWA a reply arriving while the app is closed produced NO notification ("not working like it used to"). Restored server-side push at the correct (delivery) moment via the new reply loop.
Async human-paced replies (new realism model):
- /api/ai-characters/{id}/send NO LONGER replies synchronously. It stores the user message and schedules a reply time: human-paced delay via _reply_delay_seconds(affection) (adores: mostly secs, up to ~5m; warm: ~1-6m; neutral/distant: ~1.5-10m) when free; if the character is BUSY on their schedule it defers to just after their next free moment. Returns {pending:true, reply_at, busy}. State field: pending_reply_at.
- New reply_loop (ticks 15s; started in server.py startup) → _replies_once(): finds states with pending_reply_at<=now, re-checks busy (re-defers if still busy), generates the reply via _reply using schedule-now context, stores it, clears pending, captures any new promise, and web-pushes (title=name, body=reply) so you're notified the moment it's actually sent — even with the app closed.
- Client (AiCharacterChat): removed the fake client-side thinking/typing delay; on send it keeps the optimistic user bubble and POSTs (pending). Polls the thread every 8s + on visibility; when a new AI message lands it shows a brief 900ms typing flourish then the message. seenIds ref prevents re-animating existing messages. Cost: still exactly one LLM call per reply (just delayed).
Verified: deferred reply end-to-end (send→pending:true; forced due→loop generated contextual reply "Yes Dad, I'm HERE!!", cleared pending; push invoked); schedule busy/free + delay helpers unit-tested earlier; lint clean (py+js); backend healthy, both loops running, no errors. Test msgs cleaned.
NOT verified (needs prod/device): real iOS PWA push receipt; actual minutes-long cadence feel. Requires Publish/Redeploy. BEHAVIOR CHANGE: replies now take seconds–minutes (intentional).
