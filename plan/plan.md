# Fix: Messages screen overflows sideways on phones

The Messages screen renders wider than a phone's screen, so the left edge is cut off and the top controls (New chat / add person, and an open chat's buttons) can only be reached by scrolling sideways. This makes it feel like a cramped desktop view instead of a phone screen. The fix makes Messages fit the phone width as a clean, full-width screen with every control visible — no sideways scrolling.

## Who it's for

People using PostMePlex on a phone — both in the phone's web browser and in the installed web app (PWA). These run the same web code, so both are fixed together. Desktop users are unaffected (their side-by-side list + chat layout stays exactly as it is today).

## Core features and experience

- On a phone, the Messages screen fills the width of the screen with nothing cut off on either side.
- The conversation list and its header controls — the **New** button, the admin **add-person** control, each conversation row, timestamps, and the delete control — are all fully visible without scrolling sideways.
- When a conversation is opened on a phone, its header controls — **back**, **call**, **video**, and **group settings** — are all reachable without sideways scrolling, and the message list and the type-a-message bar fit the screen width.
- Nothing about how messaging works changes: sending, searching people, starting direct chats or groups, group settings, AI/Sage chats, and calls all behave exactly as before. Only the on-phone sizing/layout is corrected.
- The desktop experience (conversation list on the left, open chat on the right) is unchanged.

## User flow

1. Open Messages on a phone.
2. The conversation list fills the screen; the New / add-person controls sit within view at the top.
3. Tap a conversation; it opens full-width with its back, call, video, and settings controls all visible.
4. Tap back to return to the list. No point in this flow requires scrolling sideways.

## UI/UX feel

Same visual style as today — same colors, spacing, and components — just correctly contained to the phone's width so it reads as a native-feeling full-screen messaging view rather than a shrunken desktop layout. Vertical scrolling (through conversations and messages) works as normal; horizontal scrolling of the whole screen is eliminated.

## Implementation phases

**Phase 1 — built now (MVP):** Correct the Messages screen's on-phone layout so it fits the screen width with no sideways scrolling, for both the conversation list and an open chat, covering the phone browser and the installed web app (PWA). Messaging behavior and the desktop layout are untouched.

**Phase 2 — later:** Quick pass over the rest of the app's screens on phones to catch and fix any similar sideways-scroll issue elsewhere (none reported so far beyond Messages).

**Phase 3 — later:** Optional mobile-web polish for Messages beyond the overflow fix — e.g. the open chat using the full screen height and the message bar staying put above the on-screen keyboard.

## Assumptions

- The reported issue is in the web app code; because the phone browser and the installed PWA share that code, fixing it covers both. The separate native/installed app (if it ever shows something similar) is not part of this minimal fix.
- Scope is limited to the Messages screen only, matching the report that other screens (Home, Profile, etc.) do not scroll sideways.
- No backend, data, or messaging-behavior changes — this is a layout/sizing fix only.
- The desktop two-pane layout stays exactly as it is.
- The fix is made in the preview environment; production (postmeplex.com) updates only after a redeploy.
- To respect the stated credit budget, the change is kept minimal and verified with a phone-sized preview check rather than a full test pass.
