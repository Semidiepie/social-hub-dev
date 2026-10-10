# Messaging Presence & AI Voice Fix

Make Messages feel alive and keep the AI quiet unless you want it talking. Adds an "active now" row of mutual-follower friends, live typing indicators, and stops the AI from reading its text replies aloud.

## Who it's for
PostMePlex users who chat with friends and with Sage AI. Every user can message Sage. They want to see which friends are around right now, know when someone is replying, and only hear Sage's voice when they deliberately start a phone call. (Note: creating custom AI characters is a separate admin-only feature and is out of scope here.)

## Core features and experience

### 1. Sage AI chat stays silent (bug fix)
When you text Sage AI, its reply appears as text only — no voice. Sage only speaks when you tap the phone-call button to start a voice call. Nothing else changes about how Sage answers, and Sage remains available to every user.

### 2. Active status
- A horizontal "Active now" row appears at the top of the Messages list, showing the avatars of friends who are currently active, placed side by side.
- Only people you **mutually follow** (you follow each other) can see each other's active status.
- A friend counts as active when their app is open/connected. When they were online recently but aren't connected right now, their avatar/label shows "active X min ago" instead of a live indicator.
- Tapping a friend's avatar in the row opens a direct chat with that friend.
- A green presence dot also appears on friend avatars inside the Messages list.
- **Privacy toggle:** a setting lets you "appear offline." When on, your active status is hidden from everyone and you also stop seeing others' active status (standard reciprocal behavior), so the feature stays fair.

### 3. Typing indicators
- In a human-to-human DM, when the other person is typing, you see a "typing…" indicator in that conversation.
- When you message Sage AI, a "typing…" bubble shows while Sage is composing its reply, then it's replaced by the text answer.

## User flow
1. Open Messages → an "Active now" row sits at the top showing mutually-followed friends who are online now (or recently, with an "active X min ago" label).
2. Tap a friend's avatar in that row → their DM opens.
3. As you type, the other person sees a "typing…" indicator; when they type, you see theirs.
4. Open the Sage AI chat and send a message → a "typing…" bubble appears while Sage composes, then the text reply lands — with no sound.
5. Tap the phone-call button in the Sage chat → now (and only now) Sage speaks.
6. Go to Settings → toggle "Appear offline" to hide your active status.

## UI/UX feel
- The active-now row mirrors familiar social patterns (Instagram/Messenger): round avatars in a horizontal strip, a small green dot for live presence, subtle "active X min ago" captions for recent activity.
- Typing indicators are lightweight animated dots in the conversation, unobtrusive and auto-clearing.
- Presence updates feel near-instant without the user doing anything.
- The "Appear offline" toggle lives with other privacy/account settings and reads clearly as off by default (you are visible unless you choose otherwise).

## Implementation phases

### Phase 1 — MVP (built now)
- Sage AI voice fix: text replies never spoken; voice only via the phone-call button. Sage stays available to all users.
- Typing indicators in human DMs and a Sage AI "typing…" bubble while it composes.
- Active status: "Active now" row at top of Messages (mutual followers only), live green presence dots, "active X min ago" for recent activity, tap avatar to open DM.
- "Appear offline" privacy toggle in Settings.

### Phase 2 — Presence everywhere (later)
- Show presence on profile pages and in the chat header ("Active now" / "last seen …").
- Extend presence/typing to any group or multi-person conversations if present.

### Phase 3 — Message status (later)
- Delivered/seen (read receipts) for DMs, with a privacy toggle.

## Assumptions
- **Surface:** Built on **both web and mobile**, since Messages and AI chat exist on both and the presence backend is shared. The AI voice bug is treated as present on both and fixed on both.
- **Mutual follow already exists:** The app already has a follow system; "mutual follow" means both users follow each other. No new follow mechanics are introduced.
- **Active threshold:** "Recently active" uses a short rolling window (e.g., last ~5 minutes shown live; older shown as "active X min ago" up to a cutoff, after which the friend is simply not in the active row).
- **Reciprocal privacy:** Turning on "Appear offline" both hides your status and hides others' status from you, matching common social-app behavior.
- **Default visibility:** Active status is on by default; users opt out via the toggle.
- **Tap action:** Avatars in the active-now row open a 1:1 DM (per your choice); the row shows friends only, not Sage.
- **Sage is for everyone:** All users can chat with Sage AI. Creating custom AI characters is a separate admin-only feature and is not changed here.
- **No change to Sage's answer content or speed** — this only changes whether text replies are spoken.
