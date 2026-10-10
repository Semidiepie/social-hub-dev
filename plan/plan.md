# Restyled In-App Notification Popups (Web)

A redesign of the small popups that slide in on the web app — the ones that say things like "Welcome back", "Posted", "Profile updated", "Failed to send", and so on. They move from a plain generic dark box to a polished, on-brand PostMePlex look.

## Who it's for
Everyone using PostMePlex on the web. These popups are the app's quick confirmations and error messages — they appear briefly after actions (logging in, posting, saving settings, sending a message, errors, etc.) and auto-dismiss. The goal is for them to feel like a deliberate part of the product, not a stock/default component.

## Core features and experience
- **One consistent popup style across the whole web app.** Every quick confirmation, info, and error message shares the same redesigned look, so the app feels cohesive. No message wording changes — only the appearance and motion.
- **Clear status at a glance.** Each popup carries a small status icon that signals the type of message:
  - success (e.g. "Posted", "Profile updated")
  - error (e.g. "Failed to send")
  - info / neutral (e.g. "Welcome back", general notices)
  The icon uses the matching accent color so people can read the outcome instantly, even before reading the text.
- **On-brand visual treatment.** Deep dark card matching the app background, a slim vivid-orange accent detail, bold readable text, soft elevation/shadow so it lifts off the page, and rounded corners consistent with the rest of the UI.
- **Smooth, intentional motion.** The popup slides/springs in and fades out gently, rather than appearing abruptly. Stacking of multiple popups stays tidy.
- **Position and timing.** Popups continue to appear in the top-right corner and auto-dismiss after a few seconds (same placement and behavior as today) — only the styling and motion change.
- **No layout disruption.** Popups float above content and never push the page around; they remain dismissible and accessible.

## User flow
1. A person does something that triggers feedback — logs in, publishes a post, updates settings, hits an error, etc.
2. A redesigned popup slides in at the top-right with a status icon, the brand accent, and the message text.
3. It stays briefly, then fades out on its own (or can be dismissed).
4. If several actions happen quickly, popups stack cleanly and clear one by one.

## UI/UX feel
- Matches the PostMePlex brand: near-black surface (#12141c family), vivid orange (#FF6B3D) as the accent, white primary text with muted secondary text.
- A colored status icon (success green, error red, brand orange/neutral for info) anchors the left side; a thin accent bar or icon ring ties it to the brand.
- Bold, confident typography for the headline line; lighter weight for any supporting detail.
- Gentle spring-in / fade-out motion; subtle shadow and rounded corners (consistent with cards and buttons elsewhere).
- No third-party or default-component "feel" — it should look purpose-built for the app. No external brand marks shown.

## Implementation phases

### Phase 1 — MVP (built now)
- Redesign the web popup appearance and motion as described above: brand colors, status icon per type (success / error / info), slim accent, elevation, rounded corners, smooth slide/spring-in and fade-out.
- Apply it globally so all existing web popups ("Welcome back", "Posted", errors, etc.) adopt the new look automatically — no message text changes.
- Keep current top-right placement and auto-dismiss timing.

### Phase 2 — Richer popups (later)
- Optional action buttons inside a popup (e.g. "Undo", "View") for relevant events.
- Optional support for a title + description two-line format where a message benefits from more context.

### Phase 3 — Personality & reach (later)
- Optional small brand mark or avatar on popups for an extra "owned" touch.
- Optional sound/subtle cue, and extending the same styling to a matching mobile toast for cross-surface consistency.

## Assumptions
- **Web only.** Mobile is out of scope for this change (per your choice). The matching mobile toast is deferred to Phase 3.
- **Visual direction = brand-based default.** Deep dark card, vivid orange accent, bold text, colored status icon, slim accent bar, smooth slide/spring-in.
- **Brand touch = status icon only.** Each popup shows the relevant action/status icon (check for success, etc.); no PostMePlex logo image on the popup.
- **No wording or behavior changes.** The same messages fire at the same moments, in the same top-right position, with the same auto-dismiss timing — only the look and motion are upgraded.
- **Covers all existing popups app-wide**, not just "Welcome back" — since they all share one component, restyling once updates them everywhere.
- **Accessibility and dismissal preserved** (readable contrast, dismissible, non-blocking).
