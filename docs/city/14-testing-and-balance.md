# Testing and balance

## Tests

| Command | What it does |
|---|---|
| `npm run city` (`node tests/city.js [games] [strategies...]`) | Plays seeded games per scripted strategy flat out through `window.City`, and prints the share saved per game and on average, plus any script errors |
| `node tests/city-fuzz.js` | Random taps, drags, wheel turns, keys and button presses at 1280 × 800 and 390 × 844, with the game at 4× and money topped up. Reports script errors and horizontal overflow. Takes about 11 minutes with software rendering. |

`tests/city.js` exports its strategies (`module.exports = { STRATS }`), so other scripts can reuse them.

## Strategies

| Name | Plays |
|---|---|
| `nothing` | Never gives an order |
| `evacAll` | Evacuates every block in the first second |
| `steady` | Five bus points at once; evacuates the east at 5 s and everything at 90 s; up to 8 infantry screening the east; a tank; a gunship on the infected's centre whenever there are over 300 |
| `missions` | `steady`, plus sending the nearest free unit to every mission, and two APCs that shuttle people from the nearest populated block to the nearest evacuation point (this was `active` before the abilities round) |
| `active` | `missions`, plus answering each decision (make for the evacuation points, arm the dockers, pay for the ferry and mine the roads when it can afford them), using every ground unit's ability whenever it is ready, taking VIPs home, and pulling squads under half strength back to the nearest evacuation point to reinforce |

Strategies take `(C, t, s, lib)`: the `City` hooks, game time, their own state, and every strategy by name, so one can build on another.

## Balance history (4 seeded games each)

| Version | nothing | evacAll | steady | missions | active |
|---|---|---|---|---|---|
| First build | about 4% (city lost by minute 4) | | | |
| Rising delay, block capacity cap | 9% | | | |
| Slower doors and spread (2 games) | 9 to 11% | 20 to 97% (loophole) | 25 to 72% | |
| Last ship takes one load; slower evacuation | 12.8% | 11.2% | 24% | |
| Crowd limits at evacuation points | 23.0% | 32.5% | 50.8% | |
| Special infected, missions, APC rescues, the great horde | 19.7% | 32.1% | 51.7% | 64.5% | |
| Abilities, ranks, decisions, new missions, late rooftop survivors | 18.7% | 32.1% | 52.7% | 58.1% | 61.7% |

The 4-game means swing by several points with any change to the random sequence, so compare over 10 games too. Over seeds 1 to 10 in the abilities round: nothing 17.9%, evacAll 32.1%, steady 49.9%, missions 59.4%, active 61.5%.

The targets: doing nothing is a catastrophe, emptying the city at once is capped by the harbour, steady play reaches an orderly withdrawal, and good use of every tool can reach the top grade.
