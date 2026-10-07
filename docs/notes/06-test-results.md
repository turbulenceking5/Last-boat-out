# 06. Test results

Balance simulation run in this session, 10 seeded campaigns per strategy (the `npm run balance` script uses 40):

```sh
NODE_PATH=$(npm root -g) node tests/sim.js index.html 10 nothing evacAll bEP
```

| Strategy | Mean saved | SD | Min | Max | README target |
|---|---|---|---|---|---|
| `nothing` | 14.4% | 0.2 | 14.0 | 14.6 | about 14% |
| `evacAll` | 40.1% | 1.7 | 37.8 | 42.7 | about 40% |
| `bEP` (heuristic bot) | 49.7% | 2.5 | 44.1 | 53.7 | about 49% |

All three match the tuning targets in the README.

Not run this session: `strikeK`, `crush`, `cutKessler_bot` (the exploit openings) and the UI fuzzer (`npm run fuzz`).
