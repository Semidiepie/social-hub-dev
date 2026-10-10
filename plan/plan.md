# PostMePlex — "X"-Style Web Redesign

A full visual overhaul of the PostMePlex web experience (public website + logged-in web app) modeled on the clean, dense, monochrome feel of X — rebuilt in PostMePlex's own brand.
It keeps every existing feature and page exactly as they work today; only the layout, styling, and motion change.

## Non-negotiable: feature parity & full functionality
This redesign must preserve **100% of the current PostMePlex tools and features** — nothing is removed, hidden, or broken. Every destination, button, and flow that works today keeps working after the restyle: posting, comments/replies, likes/shares, reels, long videos, live, music, pet, market, wallet, messages, notifications, search, profiles, settings, blogs, admin, and auth. The change is strictly visual/layout/motion. Before completion, the full app is tested end-to-end to confirm no regressions and that everything is fully functional.

## Who it's for
Everyone who uses PostMePlex in a browser — visitors landing on the public pages and signed-in creators/gamers using the full app. The goal is a sharper, more premium, instantly familiar social-app feel while staying unmistakably PostMePlex (orange on near-black). Mobile app users are unaffected (the native mobile app is out of scope for this pass).

## Core features and experience

### 1. Signature three-column desktop layout
- **Slim left icon rail** that expands on hover to show labels. Icons for the primary destinations (Home, Videos, Live, Reels, Music, Pet, Market, Wallet, Messages, Notifications, Profile, etc.), a prominent orange **Post/Create** button, and the account menu pinned at the bottom.
- **Center feed column** — the main content, a fixed comfortable reading width, with a sticky top bar.
- **Right sidebar** — a persistent column with a **Search** box, a **Trending** panel (trending game tags / topics), and a **Who to follow** panel (suggested creators), plus small footer links.

### 2. X-style feed and content
- Sticky top bar on the feed with segmented tabs (e.g., **For you / Following**) and the page title.
- Inline compose box at the top of the feed (avatar + "What's happening?"-style prompt) that opens the existing composer.
- Posts presented as a clean, **divider-separated timeline** (not boxed cards): round avatar, name + handle + verified badge + timestamp on one line, content below, and a row of understated actions (comment, like, share, etc.) with hover states and counts.
- Reels, long videos, music, and other content types keep their current behavior but adopt the same visual language.

### 3. Dark + Light themes with a toggle
- **Dark** stays the default (near-black background, the current PostMePlex dark look, refined).
- A new **Light** theme is added.
- A clearly accessible **theme toggle** (in the nav/account area) switches between them, and the choice is remembered across visits.
- **Orange (#FF6B3D)** remains the single brand accent in both themes — used for the Post/Create button, active nav item, links, key highlights, and the verified/active states. Everything else uses a monochrome gray scale (X-like restraint).

### 4. Consistent restyle across every page
Applied app-wide in this pass, so the whole product feels like one redesigned surface:
- Public **website / landing + login/register** pages get the new look (hero, auth forms, buttons).
- Logged-in pages — Home, Profile, Post detail, Messages, Notifications, Search/Explore, Videos, Reels, Live, Music, Pet, Market, Wallet, Settings, Blogs, Admin — all adopt the shared system: pill buttons, round avatars, monochrome surfaces with orange accents, thin dividers, refined inputs, and subtle motion.

### 5. Responsive behavior
- **Desktop:** full three columns (rail + feed + right sidebar).
- **Tablet / medium:** right sidebar drops; left rail stays as icons.
- **Narrow / mobile-web:** collapses to a top bar plus a bottom or slide-out navigation, with a floating orange Post button — the mobile-web stays usable, not a squeezed desktop.

## User flow
1. A visitor opens the public site → sees the redesigned landing and sign-in in the new style → signs in.
2. The signed-in app loads the three-column layout: icon rail on the left, feed in the center, search + trending + who-to-follow on the right.
3. They switch feed tabs (For you / Following), compose a post from the inline prompt, and interact with the divider-separated timeline.
4. They hover the left rail to reveal labels, or navigate via the rail icons; on a phone browser they use the top/bottom nav instead.
5. They flip the theme toggle between Dark and Light at any time; the preference sticks on their next visit.
6. Every page they open — profile, messages, wallet, settings, etc. — carries the same refreshed look, with all existing tools intact.

## UI/UX feel
- **Monochrome-with-one-accent:** near-black (dark) or near-white (light) surfaces, layered grays, and a single confident orange accent — the X discipline, PostMePlex color.
- **Dense but breathable:** tighter, information-rich columns like X, with clear type hierarchy (bold names, muted handles/meta) and thin hairline dividers instead of heavy cards.
- **Pill-shaped controls**, round avatars, crisp focus/hover/active states, and a bold rounded Post button.
- **Subtle, intentional motion:** rail hover-expand, tab underline slide, gentle fade/slide on feed load and menus — fast and understated, never flashy.
- **Familiar yet branded:** anyone who has used X feels at home immediately, but the color, logo, badges, and personality read as PostMePlex.

## Implementation phases

### Phase 1 — MVP (built now)
- New shared visual system (dark + light themes, orange accent, typography, pill buttons, inputs, avatars, dividers, motion primitives) applied across the **entire web app and public website**.
- The three-column desktop layout: hover-expanding left icon rail, center feed, right sidebar (search + trending + who-to-follow).
- X-style feed presentation (sticky tab bar, inline compose prompt, divider-separated timeline, understated action row).
- Theme toggle with remembered preference.
- Responsive collapse for tablet and mobile-web.
- **Full feature-parity pass:** every existing tool/page verified working end-to-end after the restyle (no regressions).

### Phase 2 — Depth & polish (later)
- Richer micro-interactions (hover cards on avatars/handles, animated counts, skeleton loading states everywhere).
- A pure-black "Lights out" variant in addition to Dark/Light.
- Command/quick-search palette and keyboard shortcuts in the X spirit.

### Phase 3 — Personalization (later)
- User-selectable accent colors and font size/density options.
- Customizable left rail (pin/reorder destinations) and layout density presets.

## Assumptions
- **"Website and web app" both mean the single web (browser) product** — the public/marketing + auth pages and the signed-in app, all restyled. The **native mobile app is unchanged** in this pass.
- **No feature, content, route, or behavior changes** — this is purely look, layout, motion, and theming. All existing pages, tools, and flows remain and stay fully functional (verified before completion).
- **Themes = Dark (default) + Light**, switchable via a remembered toggle. (A pure-black "Lights out" mode is deferred to Phase 2.)
- **Orange #FF6B3D stays the one accent** in both themes; everything else is monochrome gray.
- **Right-sidebar content** = Search, Trending (game tags/topics), and Who-to-follow (suggested creators), sourced from existing data where available; panels that lack a data source show a tasteful placeholder rather than being omitted.
- **Primary left-rail destinations** mirror the app's current navigation; secondary/less-used items move into the account or "more" menu to keep the rail clean — but remain reachable (nothing is dropped).
- **Feed tabs** are "For you / Following"; if a dedicated "Following" feed isn't already available it will reuse the closest existing feed behavior without inventing new backend logic.
- **Stories stay hidden on web** (as currently configured) unless requested otherwise.
- **Desktop-first three columns**, gracefully collapsing on smaller widths as described.
