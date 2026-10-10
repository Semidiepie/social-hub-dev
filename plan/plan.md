# Comment Replies & Delete on Mobile

Bring the mobile app's comments up to parity with the website: let people reply to any comment and delete the comments or replies they posted. On web this already works; this change adds it to the mobile app.

## Who it's for
Everyone using the PostMePlex mobile app who reads or writes comments on posts, reels, and long videos. Today they can only add a flat comment — they cannot reply to someone and cannot remove their own comment. This closes that gap so the mobile comment experience matches the web.

## Core features and experience
- **Reply to any comment.** Every comment shows a "Reply" action. Tapping it opens an inline reply composer pre-filled with an "@username" mention, so a reply is clearly directed at a person.
- **Single-level threads.** Replies group under their top-level comment (matching the website). Replying to a reply still attaches it under the same top comment, with the "@username" mention showing who it's aimed at — no endlessly nested threads.
- **View / hide replies.** A top comment with replies shows a "View N replies" toggle that expands or collapses them, keeping the list tidy.
- **Delete your own.** A "Delete" action appears only on comments and replies you posted. Deleting asks for a quick confirm, then removes it. Deleting a top-level comment also removes its replies. The comment count updates accordingly.
- **No one else's delete.** You cannot delete other people's comments. (Post-owner and admin moderation are out of scope here — see Assumptions.)
- **Consistent across content.** Works everywhere comments appear on mobile — posts, reels, and long videos — using the same behavior.

## User flow
1. A person opens the comments on a post, reel, or video in the mobile app.
2. They tap "Reply" on a comment → an inline composer opens with "@username " ready → they type and send → the reply appears under that comment, and the thread is expanded.
3. Comments with replies show "View N replies"; tapping expands/collapses them.
4. On a comment or reply they posted, they tap "Delete" → confirm → it's removed and the count drops. Deleting a top comment removes its replies too.
5. The author sees no "Delete" on comments that aren't theirs.

## UI/UX feel
- Matches the existing mobile comment sheet styling (dark sheet, rounded avatars, brand accents) and the website's comment behavior, so the two surfaces feel like one product.
- Replies are visually indented/smaller under their parent; the "Reply" and "Delete" actions sit as light, unobtrusive text actions beneath each comment with timestamp.
- Reply composer appears inline under the comment being answered, with a cancel option.
- Delete uses a confirm step (consistent with how the app guards destructive actions) rather than deleting instantly.
- Empty, loading, and post-action states stay smooth; the keyboard behavior of the existing comment sheet is preserved.

## Implementation phases

### Phase 1 — MVP (built now)
- Mobile: reply to any comment (single-level, @mention), view/hide replies toggle, inline reply composer.
- Mobile: delete your own comments and replies with a confirm step; deleting a top comment removes its replies; comment counts update.
- Applied wherever comments appear on mobile (posts, reels, long videos).
- Web is unchanged (already has these).

### Phase 2 — Moderation reach (later)
- Let the post/content owner delete comments on their own content.
- Let admins delete any comment anywhere.

### Phase 3 — Richer threads (later)
- Optional edit-your-comment.
- Optional reply counts/threading refinements and reply notifications.

## Assumptions
- **Scope is the mobile app only.** The website already supports reply and delete and is left as-is (per your choice).
- **Delete = your own only.** Only the person who posted a comment or reply can delete it. Post-owner and admin deletion are deferred to Phase 2 (you skipped this question; this is the safe default matching your wording "delete any comment or reply they post").
- **Single-level threads with @mention**, mirroring the website — no deeply nested replies (you skipped this; chosen for consistency).
- **Deleting a top-level comment removes its replies**, and the displayed comment count is adjusted — matching current web behavior.
- **Confirm before delete**, consistent with the app's other destructive actions.
- **No change to what a comment contains or how it's written** — same text limits and posting behavior as today; only reply and delete are added on mobile.
- **Behavior parity with web** is the target for anything not explicitly specified above.
