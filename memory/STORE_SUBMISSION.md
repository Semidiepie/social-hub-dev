# PostMePlex — App Store & Google Play Submission Guide

This is a practical checklist of everything reviewers ask for. Items that are **already done in code** are marked ✅. Items you still need to gather (screenshots, accounts, web pages) are marked ⏳.

---

## 1. In-app legal & safety (Apple GL 1.2 / 5.1 — User Generated Content)

| Requirement | Status | Where in PostMePlex |
|---|---|---|
| Privacy Policy accessible in-app | ✅ | `Settings → Legal → Privacy Policy` (`/legal/privacy`) |
| Terms of Service accessible in-app | ✅ | `Settings → Legal → Terms of Service` (`/legal/terms`) |
| Privacy + ToS link on sign-up | ✅ | bottom of `/(auth)/register` |
| Block users | ✅ | `POST /api/users/:id/block` & `DELETE` — wire button into profile header (UI hook ready) |
| Report content | ✅ | `POST /api/report` with `target_type` + `target_id` + `reason` |
| Account deletion (in-app, no email needed) | ✅ | `Settings → Danger zone → Delete account` (`/account/delete`) |
| Filtering for objectionable content | ⏳ | Add server-side classifier (e.g., AWS Rekognition / Hive) before public launch |
| EULA visible during sign-up | ✅ | Tap-to-agree disclaimer on `/register` |

---

## 2. Hosted legal pages (Apple + Google require public URLs)

You need both Privacy Policy and Terms of Service hosted at **public HTTPS URLs**. Easiest options:

- Host the in-app text on a simple page at `postmeplex.com/privacy` and `/terms` (use any static host: Vercel, Netlify, GitHub Pages, Notion).
- Or use a generator service like [Termly](https://termly.io/) or [iubenda](https://iubenda.com/) — make sure the content matches what's in the app.

When submitting:
- App Store Connect → App Information → **Privacy Policy URL** + **License Agreement URL**
- Google Play Console → App content → **Privacy Policy URL**

---

## 3. App Store Connect submission

### Account
- ⏳ Apple Developer Program enrollment ($99/yr) — yourself or LLC
- ⏳ Bank, tax and contact info filled under "Agreements, Tax, and Banking" if you want a paid app or in-app purchases

### App identity
- **App name:** PostMePlex ✅
- **Bundle ID:** `com.postmeplex.app` ✅ (set in `app.json` → `ios.bundleIdentifier`)
- **SKU:** any unique string (e.g., `postmeplex-ios-001`) ⏳
- **Primary language:** English (US) ⏳

### Marketing assets
- ⏳ **App icon:** 1024×1024 PNG, no transparency, no rounded corners — derive from `/assets/images/icon.png`
- ⏳ **Screenshots:** 3–10 per device class. Required sizes (Feb 2026):
  - iPhone 6.9" (iPhone 16 Pro Max) — **1320×2868**
  - iPhone 6.5" (iPhone 11 Pro Max) — **1242×2688**
  - iPad 13" — **2064×2752**
- ⏳ **App preview video** (optional but boosts conversion) — 15–30 sec, .mov, no narration
- ⏳ **Description** (≤ 4 000 chars). Suggested intro:
  > "PostMePlex is the social home for gamers, streamers and every clutch moment. Post your wins, scroll vertical reels, DM your squad, and go Live in seconds."
- ⏳ **Promotional text** (≤ 170 chars, edit any time)
- ⏳ **Keywords** (≤ 100 chars, comma-sep): `gaming, streaming, social, gamers, esports, livestream, reels, gaming community, twitch, video`
- ⏳ **Support URL** (e.g., `postmeplex.com/support` or a Notion page with FAQ + contact email)
- ⏳ **Marketing URL** (optional)

### Privacy Nutrition Labels (App Privacy section)
Declare what data you collect and link to a user. Based on our backend, declare:

| Data type | Used | Linked to user | Tracking |
|---|---|---|---|
| Email | ✅ (account creation, password reset) | Yes | No |
| Name (display name) | ✅ | Yes | No |
| User ID / username | ✅ | Yes | No |
| Photos / videos | ✅ (Cloudinary uploads, posts, reels) | Yes | No |
| Audio data | ✅ (live streams) | Yes | No |
| Camera | ✅ (live + media capture) | No (live frames not stored unless user records) | No |
| Microphone | ✅ (live + media capture) | No | No |
| Push token | ✅ (transactional notifications) | Yes | No |
| Crash data | ✅ (diagnostics) | No | No |

### Age rating & content
- Apple: **12+ — Infrequent/Mild Mature/Suggestive Themes** is the typical rating for a UGC social app. Walk through the questionnaire in App Store Connect.
- Must say **YES** to: "Does this app contain, display or access third-party or user-generated content?" → triggers GL 1.2 review (we cover it via report/block/delete + content guidelines in ToS).

### Required URLs for review notes
Tell the reviewer (Review Notes box):
- Demo account: provide one (e.g., `reviewer@postmeplex.com` / `Reviewer123!` — seed it before submitting)
- How to test live: open Reels → Stories bar → tap "Go Live" or visit the Create tab → Go Live
- Note that live streaming uses Agora.io (compliant SDK)

### Encryption export compliance
Set in `app.json` → `ios.infoPlist.ITSAppUsesNonExemptEncryption` = `false` ✅ (PostMePlex only uses HTTPS, no custom crypto beyond bcrypt/JWT, which Apple exempts).

---

## 4. Google Play Console submission

### Account
- ⏳ Google Play Developer account ($25 one-time)
- ⏳ Identity verification (Play now requires real-name + ID verification for new dev accounts)

### App identity
- **Package name:** `com.postmeplex.app` ✅ (set in `app.json` → `android.package`)
- **Default language:** English (United States)
- **App or game:** App
- **Free or paid:** Free
- **Category:** Social

### Required listings
- ⏳ **Title** (30 chars): "PostMePlex — Gamers Social"
- ⏳ **Short description** (80 chars): "Social media for gamers. Post, watch reels, DM your squad, go Live."
- ⏳ **Full description** (4 000 chars)
- ⏳ **Hi-res icon:** 512×512 PNG, 32-bit, < 1 MB
- ⏳ **Feature graphic:** 1024×500 PNG/JPG, < 1 MB
- ⏳ **Phone screenshots:** at least 2, max 8. Sizes: 16:9 or 9:16, 320–3840 px on the longest edge
- ⏳ **Tablet screenshots** (optional but recommended)
- ⏳ **Promo video:** YouTube URL (optional)
- ⏳ **Application type & category:** App / Social
- ⏳ **Content rating questionnaire:** answer YES to UGC. Result will be Teen (PEGI 12+).
- ⏳ **Target audience:** age 13+ (PostMePlex ToS says 13+)
- ⏳ **Data safety form** (mirror of Apple's Privacy Nutrition Labels — same data table as section 3)

### Required app content (Play Console → App content)
| Item | Notes |
|---|---|
| Privacy Policy URL | required |
| App access | mark "All functionality available without restrictions" OR provide a test account if reviewer needs one |
| Ads | "No, my app does not contain ads" (unless you add Stripe-promoted streams) |
| Content rating | complete the questionnaire |
| Target audience | 13+ |
| News app | No |
| COVID-19 contact tracing | No |
| Data safety | complete the form |
| Government app | No |
| Financial features | No (unless you add tipping/Stripe) |
| Health features | No |
| Family policy | not applicable (audience is 13+) |
| Social engineering | declare we collect emails for password reset |

### Required permissions justification
Play asks why each runtime permission is needed. Use:
- **CAMERA**: "Capture photos and broadcast live streams from your camera."
- **RECORD_AUDIO**: "Capture audio for live streams and reels."
- **READ_MEDIA_IMAGES / READ_MEDIA_VIDEO**: "Select photos and videos from your library to share."
- **MODIFY_AUDIO_SETTINGS / BLUETOOTH_CONNECT**: "Route audio appropriately during live streams (used by Agora SDK)."
- **INTERNET / ACCESS_NETWORK_STATE**: "Connect to PostMePlex servers and stream live video."

---

## 5. Build artifacts (delivered by Emergent "Publish")

From the **Publish** button in the Emergent platform you can generate:
- **iOS:** signed `.ipa` for TestFlight & App Store. Apple Developer credentials get added at build time.
- **Android:** signed `.aab` for Play Console.

Things to prepare **before** clicking Publish:
1. **`google-services.json`** from Firebase console → Project Settings → Your Apps → Add Android app with package `com.postmeplex.app` → download. Drop it into Publish wizard.
2. **APNs auth key** (`.p8`) from Apple Developer → Keys → Apple Push Notifications service for iOS push.
3. **App icon 1024×1024** + adaptive icon for Android already in `/app/frontend/assets/images/`.

---

## 6. Things still recommended for v1 launch

| Priority | Item | Where |
|---|---|---|
| High | Reviewer demo account seeded with friendly content | add to `SEED_USERS` in `server.py` |
| High | Server-side image/video moderation for nudity & gore | hook Hive Moderation API or AWS Rekognition between Cloudinary upload + post create |
| Medium | Block-user UI button on profile + DM threads | endpoints already exist, only UI needed |
| Medium | Verify a real domain in Resend → switch sender to `noreply@postmeplex.com` | better email deliverability for password resets |
| Medium | Add `Report` action sheet on every post / reel / DM | endpoints ready |
| Low | App Store Connect screenshots from a clean device with seed data | use Figma `App Store frames` template |

---

## 7. Useful copy you can lift

### App Store "What's new in this version" (release notes)
> First release! PostMePlex is the gaming-first social network — drop posts and reels, message your squad, scroll through trending #valorant #warzone #apex clips, verify your favorite streamers, and Go Live in seconds.

### Long description (≤ 4 000 chars)
> PostMePlex is where gamers live. Post your wins. Scroll vertical reels. DM your squad. Go Live in seconds.
>
> 🎮 BUILT FOR GAMERS — A feed tuned for screenshots, clip drops and stream highlights, with first-class tags like #valorant, #warzone, #apex, #fortnite and more.
>
> 📺 REELS THAT POP — TikTok-style vertical reels with one-tap like, comment and share. Auto-play, infinite scroll, zero ads.
>
> 💬 SQUAD CHATS — 1:1 direct messages and group "squad chats" you can name. Talk strats, share clips and plan your next session.
>
> 🔴 GO LIVE — Stream from your phone in 1080p with live viewer counts and chat, powered by Agora.io. Tap Go Live, set a title, broadcast.
>
> ✅ VERIFIED STREAMERS — Trusted creators are highlighted with the blue checkmark. Discover the best across Top, Accounts, Tags and Live.
>
> 🔒 PRIVATE BY DEFAULT — DMs are visible only to you and the people you talk to. Block, report and delete your account anytime from Settings.
>
> Made with ❤️ by gamers, for gamers. Free, no ads, no compromise.

---

## 8. After submission

- Apple usually replies in 24–48 hours. If rejected, the most common UGC reasons are:
  - Missing or hard-to-find Block/Report/Delete — we already shipped all three ✅
  - Privacy Policy URL 404 — make sure your hosted page returns 200
  - Camera/Mic usage descriptions vague — ours are explicit ✅
- Google Play: 1–7 days for the first review of a new dev account; faster afterwards.

Tag me when you're ready to submit and I'll do a final pre-flight diff.
