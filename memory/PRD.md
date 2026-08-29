# PostMePlex — Product Requirements

## Overview
**PostMePlex** is a gaming-focused social media app combining Facebook (text/photo posts), Instagram (3-column profile grid + Stories), and TikTok (vertical reels). Built on the deep dark #12141c palette with vivid orange #FF6B3D accents — energetic, streamer-coded, never AI-slop.

## Tech Stack
- **Frontend:** Expo SDK 54 + Expo Router (file-based), React Native 0.81, expo-video, expo-image-picker, expo-notifications, react-native-reanimated.
- **Backend:** FastAPI + Motor (async MongoDB), JWT auth with bcrypt, httpx for Emergent Push relay.
- **Storage:** MongoDB collections — `users`, `posts` (mixed type=post|reel), `comments`, `likes`, `follows`, `notifications`.

## Implemented Features (v1)

### Auth
- JWT email/password register, login, /me, profile update.
- Token stored via `@/src/utils/storage` (SecureStore on native, localStorage on web).
- 7 seeded demo accounts including 3 streamers shown as LIVE.

### Home Feed
- StoryBar with the user's "Your story" + horizontally scrolling streamers (LIVE badges for live broadcasters with viewer counts).
- Vertical feed of text+image posts with optimistic like, comment sheet, share/bookmark icons, game-tag chips, streamer badges, verified checkmarks.
- Pull-to-refresh.

### Discover
- Sticky chip row: **Top** (3-col masonry grid of trending posts/reels), **Accounts** (followable user list), **Tags** (#valorant, #warzone, etc.), **Live** (active streamer cards with viewer counts).
- Search input wired (UI only for v1).

### Create (+)
- Three modes: **Post** (image + caption + game tag), **Reel** (video upload), **Go Live** (Coming Soon card explaining roadmap).
- Cloudinary unsigned upload integration scaffolded — falls back to local URI when keys aren't set.

### Reels
- Full-screen TikTok-style vertical pager using `expo-video`.
- Side action bar (like, comment, share, creator avatar), bottom info overlay with caption + game tag + view count.
- Auto-plays the visible reel, pauses others.

### Profile
- Avatar, bio, posts/followers/following stats, streamer + verified badges.
- Tabs: Posts grid / Reels grid.
- Own profile shows Edit + Logout; other profiles show Follow/Following toggle and Message button.

### Notifications
- Like, comment, follow events with actor info; mark-all-read on open.
- Push notifications via Emergent relay — fires server-side on signup, like, comment, follow. (`EMERGENT_PUSH_KEY` placeholder in preview; replaced by deployer at build time.)

### Live Streaming (intentionally scoped per user choice)
- "Coming Soon" screen with hero gradient, perk list, and notify-me CTA. Real multi-viewer broadcast requires Agora/LiveKit and will plug in when user provides keys.

## Endpoints (FastAPI, all under `/api`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | – | Health |
| POST | `/auth/register` | – | Sign up + welcome push |
| POST | `/auth/login` | – | JWT |
| GET | `/auth/me` | ✓ | Current user |
| PUT | `/auth/me` | ✓ | Update profile |
| GET | `/users/{id}` | optional | Public profile + follows_them |
| POST/DELETE | `/users/{id}/follow` | ✓ | Toggle follow |
| GET | `/users/{id}/posts`, `/reels` | optional | User content |
| GET | `/feed`, `/reels`, `/stories` | optional | Home feed surfaces |
| GET | `/discover?filter=top\|accounts\|tags\|live` | optional | Discover surfaces |
| POST | `/posts`, `/reels` | ✓ | Create |
| GET / DELETE | `/posts/{id}` | optional/✓ | Read / delete (own) |
| POST/DELETE | `/posts/{id}/like` | ✓ | Toggle like |
| GET/POST | `/posts/{id}/comments` | optional/✓ | List/Create |
| GET | `/notifications` | ✓ | Activity feed |
| POST | `/notifications/read-all` | ✓ | Clear unread |
| POST | `/register-push` | – | Emergent push registration (skips gracefully on placeholder key) |

## Notes
- All MongoDB documents use UUID `id`; `_id` is stripped from every response.
- Datetimes stored as UTC `datetime` and serialized as ISO 8601 in API responses.
- Cloudinary keys (`EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`) optional — user can drop them in `frontend/.env` to enable real video hosting.
- Push notifications work after deploy + iOS/Android build (Expo Go doesn't support push).
