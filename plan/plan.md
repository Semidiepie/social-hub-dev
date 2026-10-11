# X-Style Redesign — App-Wide Rollout (Web)

Extends the X-inspired look already applied to the shell and Home feed to every remaining web page, so the whole product reads as one cohesive, monochrome-with-orange surface.
It changes only layout, styling, and motion — every existing page, tool, and flow stays exactly as it works today.

## Who it's for
Everyone using PostMePlex in a browser — visitors on public pages and signed-in creators/gamers across the full app. The goal is a consistent, premium, instantly-familiar social feel on every screen, not just the home timeline. The native mobile app is out of scope for this pass.

## Core features and experience

### Non-negotiable: nothing breaks
Every page keeps 100% of its current tools and behavior. This is purely a visual/layout/motion restyle; no feature is removed, hidden, moved out of reach, or re-wired. Every surface works in both the Dark (default) and Light themes already in the app, with orange (#FF6B3D) as the single accent and everything else on a monochrome gray scale.

### Full X-style profile
- A cover banner at the top, with a large round avatar overlapping its lower edge.
- Display name, @handle, verified badge, bio, and following/followers counts beneath the avatar.
- A pill-shaped primary action on the right: "Edit profile" on your own profile, "Follow"/"Following" on others.
- A sticky tab row under the header — Posts / Replies / Media / Likes — that switches the content below without leaving the page.
- The profile's content shows as the same divider-separated timeline used on Home.

### Divider timeline everywhere content is listed
Posts, replies, and media lists on Profile and Post detail adopt the Home feed's clean, divider-separated timeline (round avatar, name + handle + timestamp on one line, content below, an understated action row) instead of boxed cards.

### Post detail
The focused post sits at the top in the timeline style, followed by its divider-separated comment thread (with the existing reply / view-replies / delete behavior intact) and the action row.

### Every other page adopts the shared system
Applied in this pass so the product feels uniform:
- **Notifications** — a clean divider list: avatar, who did what, timestamp, orange accent on unread; tapping opens the target.
- **Discover / Search** — a prominent search field, a trending panel, suggested people as list rows; media/explore results stay in a grid, restyled to the monochrome surface.
- **Settings** — sectioned rows separated by hairlines, pill buttons, refined inputs and toggles.
- **Wallet** — a monochrome balance header with the orange accent and a divider-separated transaction/history list.
- **Market** — product listings on the monochrome surface with pill actions and orange primary buttons.
- **Pet** — surrounding panels, stats, and buttons restyled to the system (the pet/game canvas itself is unchanged).
- **Music** — track list as divider rows and a restyled player bar.
- **Blogs** — article lists as divider rows; the reader view gets clean, typographic styling.
- **Admin** — tables, rows, and controls restyled to the monochrome surface with pill controls.
- **Messages** — conversation list as divider rows and restyled chat bubbles, keeping the current two-pane layout and all messaging behavior.

### Shared visual language
Pill-shaped controls, round avatars, thin hairline dividers instead of heavy cards, refined inputs, crisp hover/focus/active states, and subtle, fast motion (tab underline slide, gentle fade/slide on load and menus). Consistent type hierarchy: bold names, muted handles/meta.

## User flow
1. A person opens any page — profile, a post, notifications, wallet, settings, and so on — and finds the same refreshed look and motion they already see on Home.
2. On a profile they see the banner, overlapping avatar, bio, counts, the Follow/Edit pill, and sticky Posts / Replies / Media / Likes tabs; switching tabs swaps the timeline below.
3. Opening a post shows it at the top with its comment thread beneath in the divider style, all existing comment actions working.
4. Browsing Discover, Market, Wallet, Music, Blogs, Admin, or Messages, every control, list, and action behaves exactly as before but in the new style.
5. Flipping the Dark/Light toggle restyles every page consistently, and the choice persists.

## UI/UX feel
- Monochrome-with-one-accent discipline, like X, in PostMePlex's color: near-black (dark) or near-white (light) surfaces, layered grays, a single confident orange accent.
- Dense but breathable, with clear hierarchy and hairline dividers rather than boxed cards.
- Pill controls, round avatars, overlapping profile avatar on a cover banner, sticky tab rows with a sliding underline.
- Subtle, intentional motion everywhere — never flashy.
- Familiar to anyone who has used X, but unmistakably branded as PostMePlex.

## Implementation phases

### Phase 1 — MVP (built now)
Apply the X-style art direction across all remaining web pages in one pass:
- Full X-style Profile (cover banner, overlapping avatar, bio + counts, Follow/Edit pill, sticky Posts / Replies / Media / Likes tabs, divider timeline).
- Post detail in the divider timeline style with its comment thread.
- Notifications, Discover/Search, Settings, Wallet, Market, Pet, Music, Blogs, Admin, and Messages all restyled to the shared monochrome-+-orange system.
- Full feature-parity: every page, tool, and flow verified working in both Dark and Light, with nothing removed or broken.

### Phase 2 — Depth & polish (later)
- Richer micro-interactions: avatar/handle hover cards, animated counts, skeleton loading states across pages.
- A pure-black "Lights out" theme variant alongside Dark/Light.
- A command/quick-search palette and keyboard shortcuts in the X spirit.

### Phase 3 — Personalization (later)
- User-selectable accent colors and font-size/density options.
- Customizable navigation (pin/reorder destinations) and layout density presets.

## Assumptions
- **Scope = all listed pages in Phase 1** (Profile, Post detail, Notifications, Discover/Search, Settings, Wallet, Market, Pet, Music, Blogs, Admin, Messages), per the choice to do everything at once.
- **Profile = full X-style** (cover banner + overlapping round avatar + sticky Posts / Replies / Media / Likes tabs + Follow/Edit pill).
- **Timeline style = match the Home feed everywhere** (divider-separated, no boxed cards) for Profile and Post detail content — the default, since this question was left open.
- **Profile tabs** mirror what the app can already show: "Posts" and "Media" use existing profile content; "Replies" and "Likes" reuse the closest existing data the profile already exposes, and if a given tab has no existing data source it shows a tasteful empty state rather than being dropped.
- **If a profile has no cover banner set**, a branded placeholder banner (dark/gradient-neutral) is shown; adding a cover-image uploader is not part of this pass unless one already exists.
- **Discover/Explore keeps a grid** for media results (matching X's explore grid), restyled to the monochrome surface; people and tags render as divider list rows.
- **Messages keeps its two-pane layout and all behavior**; only styling of the conversation list and chat bubbles changes.
- **Pet/game canvas and any live/reels fullscreen media stay functionally unchanged**; only the surrounding UI adopts the new system.
- **Both themes are in scope**: every restyled page must be legible and consistent in Dark and Light.
- **No content, route, data, or behavior changes** anywhere — visual/layout/motion only, verified for parity before completion.
- **Web only**; the native mobile app is untouched.
- **Stories stay hidden on web** (as currently configured) unless requested otherwise.
