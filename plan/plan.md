# Pet Care Mini-Games — Cozy Room Redesign

A redesign of the virtual pet's Feed, Bath, and Play interactions from flat dark pop-ups into bright, cozy, immersive room scenes with hands-on mini-games.
The pet sits inside a warm illustrated room and reacts in real time as the player feeds, washes, or plays with it.

## Who it's for

Verified PostMePlex members who own a Sage AI virtual pet and open its care screen on the web app (including on a phone browser). It is a delight/retention feature: caring for the pet should feel playful and satisfying rather than like tapping away a chore.

## Core features and experience

Each of the three care activities becomes its own full-screen cozy scene with a hands-on mini-game, replacing the current dark box with floating emoji.

- **Feed — "Bon appétit!"**: a dining nook with food served on a plate. The player drags food pieces to the pet's mouth; the pet opens up, chews, and looks happy. A portion counter shows how many bites are left; finishing triggers a cheerful "full and happy" reaction.
- **Bath — "Scrub-a-dub!"**: a bubbly bathroom. The pet starts visibly grubby; the player drags a sponge across it to scrub away dirt and raise foamy bubbles. A cleanliness meter fills as they scrub; reaching 100% rinses the pet sparkling clean.
- **Play — "Fetch!"**: a sunny playroom/garden. The player drags back and flings a ball; the pet chases and catches it and brings it back for another throw. A few successful fetches fill a happiness/affection meter and end on an excited reaction.

Shared across all three:
- The player's **actual pet image** is the star of every scene, with idle, reacting, and happy animations.
- A friendly header banner names the activity, a progress indicator shows how close it is to done, and finishing plays a satisfying burst (sparkles/confetti + a happy chime).
- **Scene/theme picker**: a small set of preset cozy room themes the player can choose from and keep (applies the look across the three rooms). This is where the player "picks the scene/theme."
- Light, mute-respecting sound effects (nibbling, splashing, a happy chime) to make interactions feel tactile.
- Every mini-game still grants the same stat boosts, XP, and cooldowns as today — the rewards and rules do not change, only the experience does.
- A safe fallback: if a drag doesn't register (older/odd touch devices), a tap still completes the action so no one gets stuck.

## User flow

1. On the pet screen, the player taps Feed, Bath, or Play (when off cooldown).
2. The matching cozy room opens full-screen with the pet inside and a short friendly prompt.
3. The player performs the hands-on mini-game (drag food / scrub with sponge / fling the ball) while the pet reacts live and a meter fills.
4. On completion, a happy celebration plays, the room closes, and the pet's stats/XP update with the relevant cooldown starting.
5. The player can leave early at any time with a clear close/cancel control.
6. From a settings/theme control on the pet screen, the player can switch the room theme; the choice is saved to their pet.

## UI/UX feel

Warm, bright, and playful — cream, peach, mint, and lavender rooms with soft depth (gentle shadows, rounded "chunky" panels and buttons), in contrast to the darker rest of the app, because a pet-care toy reads best as light and cheerful. The pet is large and central. Motion is bouncy and characterful: the pet wiggles when idle, leans in to eat, shakes off water, and bounces when happy; food, bubbles, and the ball move with spring-like easing. Interactions are forgiving and immediate, with clear visual and audio feedback at every step so the activity feels alive rather than transactional.

## Implementation phases

**Phase 1 (MVP — built now):** All three activities redesigned as immersive cozy rooms with the three richer drag-based mini-games (drag-to-feed, sponge-scrub bath, fling-fetch play), the bright pastel visual system, animated pet reactions, progress meters, completion celebrations, light sound, the tap fallback, and a scene/theme picker with a small set of preset cozy themes. Existing stat/XP/cooldown rewards preserved.

**Phase 2 (later):** More room themes and unlockable scenes/props (via level or tokens), extra food varieties, and optional "do it well for a small bonus" scoring on top of the base reward, plus simple care achievements.

**Phase 3 (later):** Bring the redesigned pet-care experience to the native mobile app, and add seasonal/limited-time themed rooms and shareable "happy pet" moments.

## Assumptions

- Palette and style are chosen as warm bright pastel (cream/peach/mint/lavender) with soft rounded panels, keeping the PostMePlex orange as a small accent so it still feels on-brand. (Chosen because the answer was "you decide what looks best.")
- "Let me pick the scenes/themes" is delivered as an in-app theme picker with a few preset cozy room themes the player chooses from, defaulting to a nice one — rather than the player having to specify exact scenes up front.
- All three activities are richer drag-based mini-games (drag-to-feed, sponge-scrub, fling-fetch), per the interaction-style choice.
- Reference "nice-to-haves" are included by default: a friendly activity banner, a portion/progress indicator, and celebratory completion feedback. The reference's extra bottom toolbar of activity icons (toilet/sleep/shop, etc.) is not added — PostMePlex keeps its three activities (Feed/Bath/Play).
- The pet shown is always the player's own Sage-generated pet; the reference's third-party mascot/character is not copied — the rooms are original art inspired by the cozy, playful spirit of the reference.
- Room scenes are custom-made art prepared once (no per-use AI image cost), so entering an activity is instant and free.
- Scope is the web pet experience only (the pet is a web feature today, including when viewed in a phone browser); native mobile is Phase 3.
- Each mini-game grants the same stat gains, XP, and cooldowns as the current version — balance is unchanged.
- Light sound effects are added and respect the app's existing mute/volume behavior.
