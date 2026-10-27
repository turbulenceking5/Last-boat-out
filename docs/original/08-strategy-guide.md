# Strategy guide

What works, according to the scripted strategies in `tests/strats.js`. These are current measurements: 20 seeded campaigns each, Kessler scenario, Regular difficulty.

| Strategy | What it does | Saved |
|---|---|---|
| `nothing` | Never gives an order | 14.4% |
| `evacAll` | Evacuates the biggest places first, every turn | 41.0% |
| `bEP` (the heuristic bot) | Evacuates the most endangered places and the ports, airlifts the stranded, rails spare troops to the biggest threatened place, fortifies | 49.0% |
| `strikeK` | Opens with air strikes on Kessler, then plays the bot | 48.4% |
| `crush` | Opens by stacking troops on Kessler, then plays the bot | 45.8% |
| `cutKessler_bot` | Blows every road out of Kessler on turn 1, then plays the bot | 38.9% (very variable) |
| `funnel` | Evacuates Kessler by rail onto Port Calder's quay, stacks troops on Calder, blows Kessler's other links | 51.5% |

None of them reaches the top grade (58%) on Regular. That takes better play than the bot's.

## Lessons

1. **Evacuate early and steadily.** Doing nothing loses 85% of the country. Simply evacuating everywhere, biggest first, gets you to a bitter retreat.
2. **Evacuate the ports' own people.** They go straight onto the quay, with no walk past the infected.
3. **Don't seal Kessler on turn 1.** Cutting every road out traps 600k people with the infection. It scores worse on average than steady play and swings wildly.
4. **Funnel Kessler to Port Calder.** Moving Kessler's people by rail onto Calder's quay, with troops stacked to hold Calder, was the best opening measured.
5. **Hold the ports.** People on an open quay count 75% even if no ship takes them; a fallen port loses everyone waiting there.
6. **Fortify where you'll stand.** Each level is worth 50% more killing power, and unfortified garrisons weaken at night.
7. **Keep promises, or don't make them.** A kept promise is +10 confidence; a broken one is −12. Confidence of 80 or more gives you a sixth order every turn.
8. **Save sorties for airlifts.** An airlift is the only way out for a town cut off from every port, and every civilian killed by an air strike costs you.
