# Code architecture

The City is a separate page at `city/`. It is written in TypeScript and loads Three.js r149 from jsDelivr.

## Files

| File | Responsibility |
|---|---|
| `city/index.html` | The page: markup for the HUD, side panel, build bar and overlays, and all CSS |
| `city/src/env.d.ts` | Type aliases for Three.js, so the sources can stay plain scripts |
| `city/src/core.ts` | Constants, data types, the global game state `G`, grid helpers, distance fields, steering and the spatial hash |
| `city/src/citygen.ts` | Builds the grid, the river and its bridges, the blocks, their buildings and landmarks, and the scenery (trees, abandoned cars, the outskirts) |
| `city/src/sim.ts` | The simulation: one fixed step at a time, plus every player order |
| `city/src/view.ts` | The Three.js scene: ground texture, instanced buildings and people, vehicles, aircraft, effects, camera and picking |
| `city/src/audio.ts` | Synthesised Web Audio, driven by events the simulation records |
| `city/src/fx.ts` | Effects for abilities and feedback: floating text (`G.pops`), rank stars, grenades and shells in flight (`G.shells`), an APC's flare, rings round held blocks. Called once a frame from `drawFrame` |
| `city/src/ui.ts` | The HTML interface and all input |
| `city/src/main.ts` | Boot and the main loop; exposes `window.City` for tests |
| `city/build.js` | Joins the compiled files into one script |
| `city/city.js` | The compiled game, committed so the page needs no build step |

## Building

```sh
npm install
npm run build:city   # tsc -p city && node city/build.js
```

`tsc` type-checks the sources (`strict`, `noUnusedLocals`) against `@types/three@0.149.0` and compiles each to `city/build/`. `build.js` joins them, in `tsconfig.json` order, into `city/city.js`, wrapped in a function scope. The bundle checks that `THREE` loaded first, and marks the page `no3d` if it didn't.

The sources are plain global scripts, with no `import` or `export`, so the result loads with an ordinary `<script>` tag. That works from `file://`, which the tests use, as well as from GitHub Pages. TypeScript 6 deprecates `outFile`, which is why there is a join step.

## Data flow

```
input (ui.ts) ──orders──▶ sim.ts ──mutates──▶ G ◀──reads── view.ts ──▶ WebGL
                                     │
                                     └─ G.sfx events ──▶ audio.ts ──▶ Web Audio
```

- The simulation never touches the DOM or Three.js. That lets `tests/city.js` run it flat out, and keeps rendering optional.
- The view reads `G` every frame and keeps its own meshes in step: maps keyed by unit, evacuation point, gunship, strike and mission.
- Sound, camera shake and floating text are recorded by the simulation (`G.sfx`, `G.shake`, `G.pops`) and played by the view and `fx.ts`. A pending decision (`G.decision`) makes `main.ts` stop stepping and show the decision card. When nobody drains `G.sfx`, as in the tests, it is capped at 300 entries.

## The main loop (`main.ts`)

Each animation frame:

1. Adds real time × game speed to an accumulator, and runs fixed simulation steps of 1/20 s from it (at most 16 a frame).
2. Pans the camera for held keys.
3. Shows the end screen if the game is over.
4. Draws the frame, plays queued sounds, updates the alert banner and the HUD (the HUD at most 5 times a second).

While an overlay (start, help or end) is up, the simulation doesn't run.

## Test hooks

`window.City` exposes `G`, `tick`, `order`, `moveUnits`, `evacuateBlock`, `sendToBlock`, `useAbility`, `reinforce`, `choose`, `UI`, `showOverlay`, `reset(seed)` and `look(x, z, dist)`. The tests and the screenshot scripts use these.
