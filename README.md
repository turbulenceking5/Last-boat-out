# Last Boat to Calder

A turn-based zombie outbreak command game. You are the general in charge of Vessmark, a fictional country, during the first two weeks of an outbreak. Move your army, hold the line, blow bridges and get as many people as you can onto the last ships before they sail on Day 13.

**Play it:** https://turbulenceking5.github.io/Last-boat-out/

## Last Boat to Calder: City (prototype)

**Play it:** https://turbulenceking5.github.io/Last-boat-out/city/

A real-time take on the same outbreak, fought street by street across one city in 3D. Pause at any time; play at 1×, 2× or 4× speed.

- The city has downtown towers, apartment blocks, suburbs, an industrial east side, two parks, Fort Aldermoor in the north-west and the harbour along the south shore. The outbreak starts at St Brennan's Hospital, with new ones later.
- People shelter at home until you order a block to evacuate, or the infected come close and they panic. Evacuees walk to the nearest evacuation point with room and wait for a ship or bus. Each figure stands for 10 people.
- The infected hunt the nearest people: anyone in the streets, crowds at the evacuation points, your troops, and blocks they can break into. The bitten lie still for a few seconds, then rise.
- Buy bus evacuation points, militia (raised from a block's residents), infantry squads, APCs, tanks, air strikes and a gunship. Troops fire at anything in range on their own; you choose where they stand.
- The last ship sails after 12 minutes. You are scored on the share of the city saved: 60% is the top grade.

## How it plays

- The map has 21 places linked by roads and railways: the capital Aldermoor (your headquarters), towns, army bases, supply depots and three evacuation ports.
- Each turn is 12 hours, and there are 24 turns. You get a handful of orders each turn: move battalions, evacuate a place, fortify, air-drop supplies, raise militia, call an air strike, fly civilians out by helicopter, or blow a road or bridge.
- Infected places turn their civilians every turn and spill along open roads toward people. Each horde shows on the map as a ring of shambling figures that grows with its size. Red arrows, with figures walking along them, show where each horde will move when you end the turn; a "!" marks where a new outbreak will start.
- Battalion badges show soldiers (one to three, by strength) and the count, and soldiers walk the route when you give a move order. Animations are switched off if your system asks for reduced motion.
- Every second turn is a night. At night hordes spill further, unfortified garrisons that are not yet veterans fight at 85%, and refugee columns caught by infected lose more; by day hordes move more slowly. The forecast arrows allow for it, so time your evacuations and reinforcements.
- Garrisons gain experience by killing infected (green, blooded, veteran, elite): each level adds 12% killing power and cuts losses, and veterans ignore the night penalty. Troops carry their experience when they move; fresh troops, militia and reinforcements dilute it. The army bases start blooded.
- Five air sorties last the whole campaign and are shared by air strikes and helicopter airlifts (1 order: up to 6k civilians from any place that isn't a port onto the least crowded open quay, the only way out for a town cut off from every port).
- Refugee columns walk to the nearest open port and wait on the quay for ships. Ships carry a fixed number each turn.
- Public order and government confidence react to what you do. Promises, scripted decisions and a late-game march keep the pressure on. Some decisions branch: refuse Dr Okafor's escort and she radios again from the hospital roof when St Brennan's is overrun; when the grid fails you choose whether to light the evacuation roads, floodlight the line, or power the field hospitals.
- You are scored on the share of the population saved. Choose a scenario (Kessler, or a random outbreak), a difficulty, and optionally a seed to replay or share a campaign.

- Selecting a place shows a small 3D model of it that you can drag to turn. Each kind of place has its own model, and it shows what is happening there: troops and vehicles, sandbags, the infected, smoke and fire, burnt-out ruins, refugees leaving, the crowd on the quay, and lit windows at night.
- At the end of a campaign the after-action report shows how close you came to each grade, a turn-by-turn chart of people shipped out and lost, and the turning points. Your past campaigns and personal bests are kept in your browser, and any campaign can be replayed or shared as a link (for example `#seed=4242&scenario=random&diff=veteran`) that opens the setup screen with the same outbreak filled in.

Press `?` in the game for the field manual. Keys: `E` ends the turn, `U` undoes your last order, `Esc` cancels, `+` and `−` zoom. The game can be played by keyboard alone: `Tab` reaches the map, arrow keys move between places, and `Enter` selects a place or picks a destination. In a dialog, arrow keys step through its buttons. Screen readers hear each place's state and the result of every turn.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole game: markup, styles and script in one file, no build step. Progress and your record of past campaigns are saved in the browser's local storage. |
| `city/index.html`, `city/src/*.ts` | The City prototype. `core.ts` (types, grid, pathfinding fields, spatial hash), `citygen.ts` (the city), `sim.ts` (the simulation), `view.ts` (the Three.js view), `ui.ts` (HUD and input), `main.ts` (the loop). Compiled into `city/city.js`, which is committed. |
| `tests/city.js`, `tests/city-fuzz.js` | City balance (seeded games per scripted strategy) and random input testing at desktop and phone sizes. |
| `models/src/*.ts` | The 3D place models, written in TypeScript against [Three.js](https://threejs.org/) r149: `kit.ts` (palette and building blocks), `places.ts` (one model per kind of place), `life.ts` (troops, infected, civilians, smoke and fire), `viewer.ts` (the shared renderer the game talks to). |
| `models/models.js` | The compiled models, committed so the game still needs no build step. `index.html` loads it and Three.js (from the jsDelivr CDN) with plain script tags; if either can't load, or the browser has no WebGL, the game runs without the 3D view. |
| `tests/strats.js` | A library of scripted strategies (do nothing, evacuate everything, a heuristic bot, and known exploit openings) that play the game through its own functions. |
| `tests/sim.js` | Plays seeded campaigns per strategy and prints a balance table. |
| `tests/peek.js` | Plays one seeded campaign with a strategy and prints any expression after every turn, for example `node tests/peek.js index.html bEP 3 "S.sorties"`. |
| `tests/ui.js` | Clicks and presses keys at random for thousands of steps at desktop and phone sizes, reports any script errors, and saves screenshots to `tests/out/`. |

## Changing the 3D models or the City

Edit the TypeScript in `models/src/` or `city/src/`, then rebuild:

```sh
npm install
npm run build:models   # models/src -> models/models.js
npm run build:city     # city/src -> city/city.js
npm run city           # City balance: 4 seeded games per strategy
node tests/city-fuzz.js  # City random input test
```

Commit the rebuilt `.js` files along with the TypeScript.

## Running the tests

```sh
npm install
npx playwright install chromium
npm run balance   # 40 seeded campaigns per strategy
npm run fuzz      # random click and key testing, plus screenshots
```

Any strategy in `tests/strats.js` can be run by name, with event choices overridden, for example:

```sh
node tests/sim.js index.html 40 bEP "bEP:origin=0"
```

Balance targets the game is tuned to (Regular difficulty, Kessler scenario): doing nothing about 14%, evacuating everything about 40% (41% now), the heuristic bot about 49% (`bEP`, which also uses airlifts for places that are cut off or being overrun), and no turn-1 opening clearly better than steady play. The grade thresholds are 58%, 46% and 32% (`GRADES` in `index.html`; `tests/sim.js` reads them from there).
