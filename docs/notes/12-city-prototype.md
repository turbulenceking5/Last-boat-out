# 12. Last Boat to Calder: City (prototype)

A real-time, 3D take on the game, built as a separate page at `city/` so the original stays as it is. The decisions behind it: a new game alongside the original, real time with pause, a 3D city with a top-down camera, and a playable prototype first.

## How it is built

- TypeScript in `city/src/`, type-checked against `@types/three@0.149.0` with `strict`, compiled and joined into `city/city.js` by `npm run build:city` (the same approach as the place models). Three.js r149 from jsDelivr with an integrity hash.
- **Grid:** 74 x 70 cells. Roads 2 cells wide every 8 cells; 9 x 7 blocks of 6 x 6 cells; quay and sea along the south.
- **Movement:** distance fields (multi-source BFS over walkable cells) instead of per-agent pathfinding. One field leads civilians to the nearest evacuation point with room. One leads the infected to people: anyone in the open counts at full strength, populated blocks' doors count 10 cells weaker. Each move order gets its own field, cached. Agents step downhill on their field, sliding along walls.
- **Neighbours:** a spatial hash of 2 x 2 cell buckets, rebuilt every step, for biting, shooting and panic checks.
- **Rendering:** buildings, trees and every person are instanced meshes (a few draw calls for thousands of figures). Vehicles, ships, buses, the gunship and jets are small meshes. Tracers are one line-segment buffer, and explosions and smoke are pooled. The ground is a canvas texture painted once.
- **Simulation:** fixed 1/20 s steps, scaled by game speed, with at most 16 steps a frame.

## Rules that shape the pace (tuned with `tests/city.js`)

| Rule | Value | Why |
|---|---|---|
| The bitten lie still before rising | 10 to 18 s | Without it a crowd turns in seconds and the city falls in 4 minutes |
| Doors hold for | 25 zombie-seconds | Blocks are not instant food |
| A breached block loses | 10 people every 5 s | However many infected are at the doors |
| Evacuating blocks let out | 10 people every 2 s | The streets don't flood all at once |
| The infected hunt from | 18 cells (people), 8 cells (doors) | Quiet streets don't call the whole horde |
| Bus points | 70 people every 10 s, hold 350 | When full, civilians go to the next point |
| Harbour | 700 people every 40 s, holds 4,000 | The final ship takes one normal load, not everyone waiting |

Results, 4 seeded games each:

| Strategy | Saved |
|---|---|
| Do nothing | 23.0% |
| Evacuate every block at once | 32.5% (the harbour's limit) |
| Steady: bus points early, evacuate in waves, infantry screening the east | 50.8% |

## Checks

- Every page renders with no script errors at 1280 x 800 and 390 x 844, and there is no horizontal scroll on phones.
- Real-input test: buying a tank from the bar and tapping the map, Ctrl+A, tapping to move, dragging to pan, wheel zoom, and Space to pause.
- `tests/city-fuzz.js`: random taps, drags, keys and buttons at both sizes with the game running. Last run: about 5 minutes of game time per size with up to 1,300 infected on screen, no script errors, scrollWidth 1280 and 390. It takes about 11 minutes in a headless browser with software rendering.
- The original game's fuzzer still passes after the link to the City was added to its setup screen.

## Not in the prototype yet

- No sound, no night, and no saved games; a reload starts over.
- Line of sight: troops shoot over buildings.
- No box selection (Shift-click and Ctrl+A instead), and no way to garrison troops inside a block.
- Balance is tuned against scripted players only, not people.

## Pictures

- The city at the start: [screens/city/overview.png](screens/city/overview.png)
- A horde pressing down a downtown street: [screens/city/horde.png](screens/city/horde.png)
- An air strike landing: [screens/city/air-strike.png](screens/city/air-strike.png)
- On a phone, with a block selected: [screens/city/phone.png](screens/city/phone.png)
