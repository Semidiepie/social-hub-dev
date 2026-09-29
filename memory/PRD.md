# PostMePlex — Product Requirements

## Overview
**PostMePlex** is a creator-first social platform combining Facebook (text/photo posts), Instagram (3-column profile grid + Stories), TikTok (vertical reels), and long-form Blogs + Videos. Deep dark `#12141c` palette with vivid orange `#FF6B3D` accents — energetic, streamer-coded, never AI-slop. Ships on **iOS + Android (Expo)** and **Desktop / Web (React)**, all against the same FastAPI + MongoDB backend.

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
