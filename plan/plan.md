# Games: Candy-Crush-Grade Overhaul — Full-Screen Play, Custom Icons, Juicier Engines

The PostMePlex arcade gets a look-and-feel overhaul: games play full-screen and immersive instead of inside a narrow card, with hand-crafted candy-style graphics and satisfying animations.
Admins can upload a custom image that becomes a game's cover and in-play backdrop, and Sage keeps turning any game idea into the best-fitting playable engine — with more engine types added over time.

## Who it's for

- Players on the web app who open **Games** and want polished, console-feeling mini-games that are fun to look at and play.
- The app owner/admin who creates games with Sage and wants each game to look bespoke — upload their own art, see a Candy-Crush-grade result, and not feel boxed into one or two game styles.

## Core features and experience

- **Full-screen, immersive play.** Starting a game/level fills the screen edge-to-edge instead of sitting in a bordered box in a narrow column. The level map, start screen, and results all read as game screens rather than web forms. A clear close/back control is always visible. On desktop the play area is large and centered rather than cramped.
- **Candy-Crush-grade match-3 overhaul.** The default match-3 engine (what a "Candy Crush" request becomes) gets redesigned glossy "candy" pieces with depth and shine, plus real juice: pieces pop/burst when matched, remaining pieces cascade and fall with a bounce, combos and chain reactions trigger effects and floating score popups, big clears shake the board with sound, and clearing a level plays a celebratory moment. Bigger matches create special pieces (a line-clearing piece from a 4-match and a bigger board-clearing effect from a 5-match).
- **Custom game cover image.** In the Sage game creator, upload an image for a game. It fully covers that game's card in the Games list (replacing the emoji), and the same art becomes the game's in-play background/theme. If no image is uploaded, today's emoji + gradient is the fallback.
- **Sage still turns any idea into a playable game.** The creator keeps accepting any request and maps it to the best-fitting built-in engine, now themed with the uploaded art and the upgraded visuals — and it tells you which engine it picked. The range of engines widens across the phases.
- **Light, mute-respecting sound.** Match, cascade, and win sounds that follow the app's existing mute/volume behavior.
- **Same rules, better feel.** Scoring, levels, stars, token rewards, and daily caps are unchanged — this effort is about look, feel, the custom icon, and the full-screen experience.

## User flow

1. Open **Games**. Each game shows as a rich card — a full-bleed custom image (or themed art) with its title and your progress.
2. Tap a game → its level map / start screen opens in a game-like, full-screen view.
3. Tap a level → full-screen play begins over the game's backdrop; the board and graphics are polished and animated; a clean HUD shows moves, target, and score.
4. Clear it → a celebratory full-screen result with stars and rewards; continue to the next level or return to the map. A close/back control is always available to exit.
5. (Admin) In the Sage creator: describe a game, confirm the engine Sage chose, upload a cover image, preview it, and publish.

## UI/UX feel

Arcade-grade and tactile — full-bleed, colorful, high-contrast game screens with depth (glossy pieces, soft shadows, bursts/particles) and bouncy spring motion, a clear step up from the current flat "emoji on a gradient, boxed in a card" look. Match-3 should feel juicy: every match rewards the eye and the ear. Uploaded art makes each game feel custom-made. It stays consistent with PostMePlex branding (orange energy) while letting each game carry its own themed art and palette, and it respects the app's mute/volume behavior and large, readable touch targets.

## Implementation phases

**Phase 1 — built now (MVP)**
- Full-screen, immersive play for the match-3 engine (board, start/intro, and result screens), with a persistent close/back control; the Games list and level map restyled to feel like game screens.
- Candy-Crush-grade match-3 visual + animation overhaul: glossy candy pieces, pop/burst, cascade-with-bounce, combo/chain effects, floating score, special pieces from 4- and 5-matches, and win/lose celebrations — hand-crafted, with no per-game AI art cost.
- Custom cover-image upload in the Sage game creator: the image fully covers the game card and becomes the in-play backdrop, with an emoji/gradient fallback.
- Light, mute-respecting match/cascade/win sound effects.

**Phase 2 — later**
- Bring the same full-screen framing, custom-art backdrop, and polish to the other existing engines (spin & raid / "Coin Master", farm sim, memory, quiz, tapper) so each feels bespoke.
- Deeper match-3 boosters (wrapped / striped / color-bomb-style special pieces and their combinations) and optional level goals beyond score (e.g. clear-the-jelly / collect-the-target).

**Phase 3 — later**
- Add new engine types to widen what Sage can build — for example endless runner, bubble-shooter, and merge/2048-style — each with the same polished, full-screen, custom-art treatment.
- Optional per-game theme controls (palette, music) and richer celebration / shareable "win" moments.

## Assumptions

- Scope is the **web app** (the arcade is a web feature); the mobile app is out of scope for this work.
- **Custom icon (question skipped → default):** the uploaded image both fully covers the game's card AND becomes its in-play background/theme; when no image is uploaded, the current emoji + gradient is the fallback.
- **MVP (question skipped → default):** Phase 1 is the match-3 ("Candy Crush") overhaul + full-screen play + custom cover upload; the other engines and brand-new engine types come in later phases.
- "Better graphics" are **hand-crafted once** (art + animation), so creating a game costs **no extra AI/image credits**; Sage's design step keeps using the same lightweight text model it uses today.
- Sage continues to **map any idea to the best-fitting built-in engine** (the set of engines grows across the phases) rather than writing and running brand-new arbitrary game code, and it will tell you which engine it chose.
- **Gameplay balance is unchanged:** scoring, level counts, star thresholds, token rewards, and daily earning caps all stay as they are.
- Uploaded images use the app's existing image hosting; large images are resized/optimized for fast loading, with a sensible file-size and type limit.
- In the MVP, match-3 special pieces are limited to a **line-clear** (from 4-matches) and a bigger **board-clearing effect** (from 5-matches); full Candy-Crush-style booster combinations are Phase 2.
- Match-3 keeps its current board size and tap/slide controls; only the visuals, animation, and screen framing change.
- Full-screen play always shows a clear exit/back control and keeps a readable HUD and large touch targets.
