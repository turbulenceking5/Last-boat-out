# 05. Architecture

Everything is in one file, `index.html` (about 84 KB): markup, CSS and script, no build step.

## Global state

| Name | Role |
|---|---|
| `S` | The campaign state: turn, places (`S.nodes`), pending events (`S.events`), result (`S.over`) |
| `UI` | View state: selected place (`UI.sel`), whether setup or the report is showing |
| `PREFS` | Saved preferences |

## Main functions

| Function | Does |
|---|---|
| `orderMove`, `orderEvac`, `orderFortify`, `orderAirdrop`, `orderMilitia`, `orderStrike`, `orderCut` | Queue the player's orders |
| `undo` | Removes the last order |
| `endTurn` | Resolves 12 hours: spread, combat, refugees, ships, events |
| `decide(i)` | Picks option `i` for the event at the front of `S.events` |
| `render` | Redraws the map, side panel and overlays |
| `save` / `load` / `savePrefs` | Local storage |

Because these are globals, the tests drive the game by calling them through Playwright's `page.evaluate` instead of clicking.

## Tests

| File | Does |
|---|---|
| `tests/strats.js` | Scripted strategies |
| `tests/sim.js` | Plays seeded campaigns per strategy, prints a balance table |
| `tests/ui.js` | Random clicks and keys at desktop and phone sizes, plus screenshots to `tests/out/` |
