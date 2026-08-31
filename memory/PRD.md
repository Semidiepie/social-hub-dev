# PostMePlex — Product Requirements

## Overview
**PostMePlex** is a creator-first social platform combining Facebook (text/photo posts), Instagram (3-column profile grid + Stories), TikTok (vertical reels), and long-form Blogs + Videos. Deep dark `#12141c` palette with vivid orange `#FF6B3D` accents — energetic, streamer-coded, never AI-slop. Ships on **iOS + Android (Expo)** and **Desktop / Web (React)**, all against the same FastAPI + MongoDB backend.

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
