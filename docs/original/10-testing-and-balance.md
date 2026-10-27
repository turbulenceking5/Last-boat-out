# Testing and balance

| Command | What it does |
|---|---|
| `npm run balance` | `node tests/sim.js index.html 40 nothing evacAll bEP strikeK crush cutKessler_bot`: plays 40 seeded campaigns per strategy and prints a balance table |
| `node tests/sim.js index.html N strategy "strategy:origin=0"` | Any strategy from `tests/strats.js`, with event choices overridden |
| `npm run fuzz` | `tests/ui.js`: random clicks and keys for thousands of steps at desktop and phone sizes; reports script errors and saves screenshots to `tests/out/` |

## The balance table

Each row shows the mean, spread, minimum and maximum share saved, then:

- how many campaigns reached each grade (`>=58 >=46 >=32`, read from `GRADES`)
- how campaigns ended
- people evacuated and sheltered
- when places fell
- a **leak** check, which must stay at 0.00, showing every person is accounted for
- which events fired

## Targets (Regular, Kessler)

| Strategy | Target | Measured (20 campaigns) |
|---|---|---|
| Do nothing | about 14% | 14.4% |
| Evacuate everything | about 40% | 41.0% |
| Heuristic bot | about 49% | 49.0% |
| Best turn-1 opening | not clearly better than steady play | `funnel` 51.5%, `strikeK` 48.4% |

## Bugs the tests have caught

- People on a small quay vanished from the books when a port fell (the leak check).
- A late "great march" was scheduled in the past and the countdown went negative.
- Dead towns could be "cleared" and fall again, repeating the penalty.
