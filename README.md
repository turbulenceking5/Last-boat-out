# Last Boat to Calder

A turn-based zombie outbreak command game. You are the general in charge of Vessmark, a fictional country, during the first two weeks of an outbreak. Move your army, hold the line, blow bridges and get as many people as you can onto the last ships before they sail on Day 13.

**Play it:** https://turbulenceking5.github.io/Last-boat-out/

## How it plays

- The map has 21 places linked by roads and railways: the capital Aldermoor (your headquarters), towns, army bases, supply depots and three evacuation ports.
- Each turn is 12 hours, and there are 24 turns. You get a handful of orders each turn: move battalions, evacuate a place, fortify, air-drop supplies, raise militia, call an air strike, or blow a road or bridge.
- Infected places turn their civilians every turn and spill along open roads toward people. Red arrows on the map show where each horde will move when you end the turn; a "!" marks where a new outbreak will start.
- Refugee columns walk to the nearest open port and wait on the quay for ships. Ships carry a fixed number each turn.
- Public order and government confidence react to what you do. Promises, scripted decisions and a late-game march keep the pressure on.
- You are scored on the share of the population saved. Choose a scenario (Kessler, or a random outbreak), a difficulty, and optionally a seed to replay or share a campaign.

Press `?` in the game for the field manual. Keys: `E` ends the turn, `U` undoes your last order, `Esc` cancels, `+` and `−` zoom.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole game: markup, styles and script in one file, no build step. Progress is saved in the browser's local storage. |
| `tests/strats.js` | A library of scripted strategies (do nothing, evacuate everything, a heuristic bot, and known exploit openings) that play the game through its own functions. |
| `tests/sim.js` | Plays seeded campaigns per strategy and prints a balance table. |
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

Balance targets the game is tuned to (Regular difficulty, Kessler scenario): doing nothing about 14%, evacuating everything about 40%, the heuristic bot about 49%, and no turn-1 opening clearly better than steady play. The grade thresholds are 58%, 46% and 32%.
