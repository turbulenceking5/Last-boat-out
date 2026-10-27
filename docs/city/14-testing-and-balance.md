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
| `active` | `steady`, plus sending the nearest free unit to every mission, and two APCs that shuttle people from the nearest populated block to the nearest evacuation point |

## Balance history (4 seeded games each)

| Version | nothing | evacAll | steady | active |
|---|---|---|---|---|
| First build | about 4% (city lost by minute 4) | | | |
| Rising delay, block capacity cap | 9% | | | |
| Slower doors and spread (2 games) | 9 to 11% | 20 to 97% (loophole) | 25 to 72% | |
| Last ship takes one load; slower evacuation | 12.8% | 11.2% | 24% | |
| Crowd limits at evacuation points | 23.0% | 32.5% | 50.8% | |
| Special infected, missions, APC rescues, the great horde | 19.7% | 32.1% | 51.7% | 64.5% |

The targets: doing nothing is a catastrophe, emptying the city at once is capped by the harbour, steady play reaches an orderly withdrawal, and good use of every tool can reach the top grade.
