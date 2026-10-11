# Games on PostMePlex — admin-curated, embedded game hub

Admins add games through a form in the admin panel; a single "Games" entry appears in the web side menu once the first game exists, and all games live inside it. Selecting a game opens a full in-app player with the game embedded on the left and a Facebook-style action panel on the right.

## Who it's for
Logged-in PostMePlex members who want to play web games without leaving the app, and admins who curate which games appear.

## Core features and experience

### Admin: add and manage games (admin panel → "Games" tab)
- A form to add a game with:
  - **Game icon** (image, shown as a circle like a profile picture) — required
  - **Game name** — required
  - **Play / website URL** — required (the page that loads when the game opens)
  - **Short description**
  - **Developer / studio name** (e.g. "by King")
  - **Category** (free text, e.g. Puzzle, Action)
  - **Banner image** (optional; used on cards and the fallback screen)
- A list of existing games where **every field and setting above can be edited at any time** (icon, name, URL, description, developer, category, banner), plus **delete**.
- Per game, the admin can **post and manage "Game updates"** (a title + message) that followers see in the game's Updates panel.

### Members: the "Games" side-menu entry (single, auto-appearing)
- There is exactly **one "Games" item** in the web side menu. It is **hidden while no games exist** and appears automatically **once the first game is added**. Every game after that is listed inside the Games hub — never as additional side-menu entries.
- Visible to logged-in users only (hidden when logged out).
- Opening it shows the catalog of games as cards (circular icon, name, developer, category), with simple sections: **Continue playing** (recently played), **Following**, **Saved**, and **All games**.

### Members: the game player (opens when a game is selected)
Mirrors the reference layout:
- **Left:** large embedded play area that loads the game's site inside PostMePlex, with **close (X)** and **fullscreen (expand)** controls. The game's own loading screen (e.g. a "Downloading" bar) shows inside the embed.
- **Right panel (fully functional):**
  - **Currently playing:** game icon, name, "by {developer}".
  - **Save** — bookmark the game; it appears in the hub's Saved section. Toggle on/off.
  - **Follow** — follow the game to receive its updates; shows followed state and a follower count. Toggle on/off.
  - **Game updates** — opens the list of updates posted by admins for this game, with a simple "new" indicator when there are unseen updates.
  - **Game privacy** — a per-game toggle controlling whether your playing activity (currently/recently played) is visible to other members. Default: visible.
  - **More** — menu with **Open in new tab**, **Copy link**, and (for admins) **Edit / Delete**.
  - **Recently played** — your recent games.
  - **Related games** — other games in the same category (falling back to the newest games), with a "See more" link.
- **Embed fallback:** if a game's website refuses to load inside another site (a common security setting), the play area shows the banner, a short explanation, and a prominent **"Open in new tab"** button so the game is still reachable.

## User flow
1. Admin opens the admin panel → **Games** → fills the form → the game goes live, and the single "Games" item appears in the side menu (if it wasn't already there).
2. A member clicks **Games** in the side menu → sees the catalog of all games.
3. They pick a game → the player opens with the game embedded and the right-side panel.
4. They can Save, Follow, read Game updates, set Game privacy, see Recently played and Related games, or open the game in a new tab.
5. If embedding is blocked, they use "Open in new tab" to play.
6. Admin can return anytime to edit any game's info/settings or remove it.

## UI/UX feel
Keeps the PostMePlex look: dark theme, orange accent, rounded cards, circular game icons. The player uses the reference's split layout — large dark play area on the left (~two-thirds), a card-style action panel on the right (~one-third) — with a slim top bar holding the close and fullscreen controls. Clear states throughout: loading while the embed starts, friendly empty states (no games yet, nothing saved/followed), and the plain-language "can't embed → open in new tab" fallback.

## Implementation phases

**Phase 1 — MVP (built now)**
- Admin "Games" tab: add games, **edit every field/setting of any game**, delete games, and post/manage Game updates per game.
- A single auto-appearing "Games" side-menu entry (hidden at zero games, shown once one exists) for logged-in users; the catalog hub with Continue playing / Following / Saved / All games.
- The full game player: embedded play area with close + fullscreen, and the complete right panel — Currently playing, Save, Follow, Game updates, Game privacy, More (Open in new tab / Copy link / admin Edit-Delete), Recently played, Related games — all functional.
- Embed-blocked fallback to "Open in new tab".

**Phase 2 — Discovery & social**
- Browse and search games; category browsing; featured / trending row.
- Ratings and reviews.
- "Friends who play" / who's currently playing (built on the privacy toggle).
- Notifications and unread badges when followed games post updates.
- Play-time tracking.

**Phase 3 — Scale**
- Leaderboards / achievements where a game exposes them; per-game analytics for admins.
- Curated collections and scheduled features.
- Games in the mobile app.
- Optional developer self-serve submission with an admin review queue.

## Assumptions
- There is only **one "Games" side-menu entry**; it is hidden when no games exist and appears automatically after the first game is added. All games live inside the Games hub, not as separate menu items.
- Games open **embedded (iframe)** inside PostMePlex. Websites that block embedding (via security headers) or that aren't served over https **cannot** be embedded — those automatically use the **"Open in new tab"** fallback. This is a browser-enforced limitation that can't be bypassed, so admins should prefer embeddable, https game URLs.
- Only **admins** add, edit, remove games and post game updates; **all game info and settings are editable from the admin panel at any time**.
- Games are for **logged-in users only**; the side-menu item is hidden when logged out.
- **"Game privacy"** means a per-member, per-game toggle for whether your playing activity (currently/recently played) is visible to other members — not management of app data permissions (embedded games can't access your PostMePlex account or data).
- **Follow** = receive that game's updates and have it in a Following list; **Save** = bookmark to a Saved list; **Recently played** = auto-tracked history; **Related games** = same category, falling back to the newest games.
- **Game updates** are authored by admins (title + message); in v1 the follower "new updates" indicator is a simple unseen marker (full notifications come in Phase 2).
- Form fields are: circular icon (required), banner image (optional), name (required), play URL (required), short description, developer name, category (free text). The icon renders as a circle like a profile picture.
- The "Downloading / loading" bar seen in the reference is the game's own loading screen inside the embed, not something PostMePlex renders.
- **Web only** in this version; the mobile Games tab is deferred to Phase 3.
- No payments and no account/data linking with the game providers.
