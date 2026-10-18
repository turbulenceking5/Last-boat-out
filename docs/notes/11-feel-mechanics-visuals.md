# 11. Game feel, mechanics and visuals

Three more agents worked in parallel, each in its own worktree, and their work was merged here.

## Game feel

- Sound made in code with the Web Audio API (no audio files): clicks, order confirmations, explosions for strikes and blown bridges, an End turn drum, a ship horn when people sail, an alarm when a place falls, and a low drone that swells as the outbreak grows. It starts after your first click or key press. The speaker button in the top bar, or `M`, turns it off; the setting is saved.
- After End turn: a short "12 hours later" screen, floating numbers over the map (sailed, lost, fallen, cleared), a pulse on places that fell, and a one-line summary of the turn.
- Tips on the first turn of a new campaign, which can be hidden and are remembered.
- The End turn button says how many orders are unused and pulses once all are spent.
- All of it lives in the `feel` section of `index.html`. `feel.endTurn()` wraps `endTurn()`, so the tests, which call `endTurn()` directly, are unaffected.

## Mechanics

- **Day and night.** Night turns: hordes spill 1.15× as far, unfortified garrisons that aren't veterans fight at 85%, and refugee columns caught by infected lose more. By day hordes spill 0.85× as far.
- **Garrison experience** (`n.V`, green → elite): +12% killing power per level and fewer losses. Veterans ignore the night penalty. Troops keep their experience when they move.
- **Helicopter airlift** (`orderAirlift`): up to 6k civilians onto the least crowded quay. It shares the 5 air sorties with air strikes.
- **Events:**
  - Okafor gets a "fly them out" option, plus a follow-up decision if you refuse her.
  - A new grid-failure decision on turn 7.

## Visuals

- **Map:**
  - Terrain with sea, coast, rivers, lakes, forests, hills, compass and scale bar. It is drawn once and cached as one image.
  - A blue tint and lights on night turns.
  - Roads and railways drawn differently.
  - A symbol for each type of place.
- **Infection and ports:** a red glow under infected places, burning ruins where places have fallen, and ships off open ports.
- **Top bar:** restyled, with a strip counting down the 24 turns and threshold marks on the gauges.

## Checks after merging

| Strategy (Kessler, Regular, 20 seeds) | Mean saved |
|---|---|
| nothing | 14.4% |
| evacAll | 41.0% |
| bEP | 49.0% |
| liftK (all sorties as airlifts on turn 0) | 46.4% |

`npm run fuzz`: 12 campaigns, no script errors, no horizontal scroll at 1280px or 390px.

Note: the Playwright that `npm install` fetches (1.64) wants a browser build that isn't preinstalled here. The tests were run with `npm install --no-save playwright@1.56.1`.
