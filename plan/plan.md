# Pet Care Mini-Games — Make Feed, Bath & Play Genuinely Fun

Rework the virtual pet's three care activities so they feel playful and worth doing, not like chores. Feeding shows foods the pet actually likes, bathing becomes a bubbly, satisfying scrub, and playing becomes a lively aim-and-throw fetch.
This is a polish/retention pass on the existing Feed, Bath and Play rooms — the rewards don't change, only how much fun they are.

## Who it's for

Verified PostMePlex members who own a Sage AI virtual pet and open its care screen on the web app (including on a phone browser). The goal is that caring for the pet feels delightful enough that people want to come back and do it.

## Core features and experience

### Feed — "the right food, no ugly backdrop"
- The distracting white circle/ring drawn behind each food piece is removed; food now sits cleanly in the scene with a soft shadow.
- The foods shown match what the pet would actually like, based on the pet's own description. Examples: a bunny gets carrots, leafy greens and berries; a cat gets fish and milk; a dog gets a bone and meat; a dragon/dino gets meat and a chili; a bird gets seeds and fruit; and a friendly default mix (fruit, berries) for anything unusual. This is worked out automatically and instantly — it costs nothing extra.
- Dragging (or tapping) a piece to the pet still makes it chomp happily; a short "yum" reaction and the portion counter remain.

### Bath — "way more bubbles, longer, more satisfying"
- Noticeably more dirt to clean so the scrub lasts longer and feels earned (not over in two swipes).
- Dragging the sponge lays down a lively trail of foam and bubbles that drift and pop all over the scene — lots of them, everywhere, not one at a time.
- A foam/bubble layer builds up as cleaning progresses, and reaching 100% triggers a satisfying rinse-and-sparkle moment where the pet shakes off and shines.
- Tapping dirt directly still works as a fallback, and the sponge stays easy to grab.

### Play — "a real game of fetch"
- Instead of a ball that just pops left or right, the player aims and flings: the throw's direction and strength decide where the toy goes, and it arcs with a bit of bounce.
- The pet runs to wherever the toy lands, grabs it, and trots it back for the next throw, reacting with excitement.
- A few successful fetches build a happiness meter; a short "catch streak" adds a little flourish, and the round ends on an excited celebration.
- More than one toy (e.g. ball, then a flying disc) keeps it from feeling repetitive. Tapping to throw still works for anyone who doesn't want to drag.

### Shared
- The player's own pet remains the star, with its idle / reacting / happy animations.
- Each activity keeps its friendly banner, progress meter, close/cancel control, celebratory finish, and light mute-respecting sound effects.
- Every activity grants the exact same stat boost, XP and cooldown as today — balance is unchanged; only the experience is richer.

## User flow

1. On the pet screen, tap Feed, Bath or Play (when off cooldown).
2. The matching room opens full-screen with the pet inside.
3. **Feed:** drag/tap the pet's favourite foods to its mouth until it's full.
4. **Bath:** scrub with the sponge; bubbles spread everywhere and foam builds until the pet is 100% clean, then it rinses and sparkles.
5. **Play:** aim and fling the toy; the pet chases it down and brings it back; land a few fetches to fill the happiness meter.
6. A celebration plays, the room closes, and the pet's stats/XP update with the normal cooldown. A close control is always available to leave early.

## UI/UX feel

Warm, bright and tactile — the same cozy pastel rooms and the existing theme picker, with bouncier, more generous motion and feedback. Bathing should look foamy and alive (bubbles drifting and popping across the whole scene); feeding should look clean and appetising with no stray white shapes; playing should feel energetic, with the pet visibly chasing and fetching. Interactions stay forgiving and immediate, readable on a phone, with large touch targets.

## Implementation phases

**Phase 1 — built now (MVP)**
- Feed: remove the white slab behind food; show species-appropriate foods derived automatically (free) from the pet's description, with a sensible default.
- Bath: more dirt, a longer scrub, a lively foam/bubble trail that spreads and pops everywhere, a building foam layer, and a rinse-and-sparkle finish.
- Play: aim-and-throw fetch with directional/arced throws, the pet chasing to where the toy lands and bringing it back, a happiness meter, a catch streak, and at least a second toy. Tap-to-throw fallback kept.
- All existing rewards, XP and cooldowns preserved; light mute-respecting sound effects.

**Phase 2 — later**
- Food variety the pet "prefers" vs "tolerates" (favourites give a little extra flourish), plus more foods and feeding props.
- Bath extras: choosable soaps/scents, bubble-pop combos, and a few bath toys.
- Play extras: more toys, simple difficulty/skill scoring, and optional mini-goals — all still on top of the unchanged base reward.

**Phase 3 — later**
- Bring the richer Feed/Bath/Play experience to the native mobile app.
- Seasonal/limited-time themed rooms, props and shareable "happy pet" moments.

## Assumptions

- **Foods are matched for free (user chose option a):** the pet's foods are inferred automatically from its stored description using built-in keyword rules plus a friendly default — no AI image/text generation, so no extra credits are spent.
- The decorative white circle/ring behind food pieces is removed entirely (not restyled); food shows directly with a soft shadow.
- "More bubbles / longer scrub / more fun" is delivered by increasing the amount to clean, adding a continuous spreading foam-and-bubble trail with a build-up layer, and a rinse-and-sparkle finish — while keeping the drag-the-sponge control and the tap fallback.
- "More interactive play" is delivered as an aim-and-throw fetch (direction + strength, arc and bounce, pet chases and returns), a catch streak, and at least one additional toy — keeping tap-to-throw as a fallback.
- Rewards, XP, stat gains, level thresholds and cooldowns are unchanged for all three activities; only visuals, animation, interactivity and sound change.
- Scope is the web pet experience only (the pet is a web feature today, including in a phone browser); native mobile is Phase 3.
- The existing cozy room theme picker, full-screen framing, progress meter, celebration and mute/volume behaviour are kept as-is.
- Activities continue to feel good on a phone, with large touch targets and no sideways scrolling.
