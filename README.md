# Last Boat to Calder

A turn-based zombie outbreak command game. You are the general in charge of Vessmark, a fictional country, during the first two weeks of an outbreak. Move your army, hold the line, blow bridges and get as many people as you can onto the last ships before they sail on Day 13.

**Play it:** https://turbulenceking5.github.io/Last-boat-out/

## How it plays

- The map has 21 places linked by roads and railways: the capital Aldermoor (your headquarters), towns, army bases, supply depots and three evacuation ports.
- Each turn is 12 hours, and there are 24 turns. You get a handful of orders each turn: move battalions, evacuate a place, fortify, air-drop supplies, raise militia, call an air strike, fly civilians out by helicopter, or blow a road or bridge.
- Every second turn is a night. At night hordes spill further, unfortified garrisons that are not yet veterans fight at 85%, and refugee columns caught by infected lose more; by day hordes move more slowly. The forecast arrows allow for it, so time your evacuations and reinforcements.
- Garrisons gain experience by killing infected (green, blooded, veteran, elite): each level adds 12% killing power and cuts losses, and veterans ignore the night penalty. Troops carry their experience when they move; fresh troops, militia and reinforcements dilute it. The army bases start blooded.
- Five air sorties last the whole campaign and are shared by air strikes and helicopter airlifts (1 order: up to 6k civilians from any place that isn't a port onto the least crowded open quay, the only way out for a town cut off from every port).
- Infected places turn their civilians every turn and spill along open roads toward people. Red arrows on the map show where each horde will move when you end the turn; a "!" marks where a new outbreak will start.
- Refugee columns walk to the nearest open port and wait on the quay for ships. Ships carry a fixed number each turn.
- Public order and government confidence react to what you do. Promises, scripted decisions and a late-game march keep the pressure on. Some decisions branch: refuse Dr Okafor's escort and she radios again from the hospital roof when St Brennan's is overrun; when the grid fails you choose whether to light the evacuation roads, floodlight the line, or power the field hospitals.
- You are scored on the share of the population saved. Choose a scenario (Kessler, or a random outbreak), a difficulty, and optionally a seed to replay or share a campaign.

- At the end of a campaign the after-action report shows how close you came to each grade, a turn-by-turn chart of people shipped out and lost, and the turning points. Your past campaigns and personal bests are kept in your browser, and any seed can be replayed or copied to share.

Press `?` in the game for the field manual. Keys: `E` ends the turn, `U` undoes your last order, `Esc` cancels, `+` and `−` zoom. The game can be played by keyboard alone: `Tab` reaches the map, arrow keys move between places, and `Enter` selects a place or picks a destination. Screen readers hear each place's state and the result of every turn.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole game: markup, styles and script in one file, no build step. Progress and your record of past campaigns are saved in the browser's local storage. |
| `tests/strats.js` | A library of scripted strategies (do nothing, evacuate everything, a heuristic bot, and known exploit openings) that play the game through its own functions. |
| `tests/sim.js` | Plays seeded campaigns per strategy and prints a balance table. |
| `tests/peek.js` | Plays one seeded campaign with a strategy and prints any expression after every turn, for example `node tests/peek.js index.html bEP 3 "S.sorties"`. |
| `tests/ui.js` | Clicks and presses keys at random for thousands of steps at desktop and phone sizes, reports any script errors, and saves screenshots to `tests/out/`. |

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
