# Code architecture

The whole game is `index.html`: markup, CSS and script, with no build step. The optional 3D place models load from `models/models.js` (see [the models page](../models/01-place-models.md)).

## Global state

| Name | Role |
|---|---|
| `S` | The campaign: turn, places (`S.nodes`), cut links, refugee columns, pending events, promises, flags, log and result. Saved to local storage after every render. |
| `UI` | View state: selected place, order mode (move or cut), undo stack, setup and help screens, report visibility, focus bookkeeping |
| `PREFS` | Saved preferences: report pop-up and zoom |
| `P`, `E` | The static map: places and links |
| `EVENTS` | The scripted decisions |
| `DIFFS`, `GRADES` | Difficulty settings and grade thresholds |

## Main functions

| Function | Does |
|---|---|
| `newGame(opts)` | Seeds the RNG and builds `S` for a scenario and difficulty |
| `orderMove`, `orderEvac`, `orderFortify`, `orderAirdrop`, `orderMilitia`, `orderStrike`, `orderAirlift`, `orderCut` | Spend orders, recording an undo snapshot first |
| `undo` | Restores the last snapshot |
| `endTurn` | Resolves 12 hours: production and supply, fighting and infection, hordes spreading, outbreaks, the march, refugee columns, new columns, ships, reinforcements, falls and clearances, promises, then the next turn's orders and events |
| `plan` | Forecasts where hordes will go next turn, and whether a new outbreak will start |
| `decide(i)` | Picks choice `i` of the first pending event |
| `finish(why)` | Scores the campaign and builds the after-action data |
| `render` | Redraws the top bar, map, side panel and overlay, keeps keyboard focus and screen-reader announcements, and saves |

## Determinism

`endTurn` reseeds the RNG from the campaign seed and the turn number, so the same seed and orders always give the same result. That is what lets the balance tests compare strategies fairly.

## Accessibility

The map is one Tab stop; arrow keys move between places, and Enter selects. Places and roads have accessible names. A live region announces turn results and every order. Dialogs hold focus, and the page behind them is inert. Disabled orders say why.

## Saving

The campaign saves to `localStorage` under `lastboat_command_v3`, preferences under `lastboat_prefs`, the record of past campaigns under `lastboat_record_v1`, and which first-turn tips you've seen under `lastboat_tips_done`. Every storage access is wrapped in try/catch, so the game works with storage blocked.
