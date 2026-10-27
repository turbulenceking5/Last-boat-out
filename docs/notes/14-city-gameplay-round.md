# 14. City gameplay: abilities, ranks, decisions, late missions

## What playing it showed

Watching scripted games minute by minute (state every 30 s, screenshots, full dispatch logs):

- **The last third was dead.** A good player had every block empty by 6:00 to 7:00. The great horde at 8:00 marched into an empty city, and the last four minutes were waiting for the harbour queue to drain, with $15,000 to $25,000 unspent.
- **Units only stood and shot.** Once placed, there was nothing to do with a squad.
- **Little feedback.** Saves, money and losses showed only as log lines.
- **Most people died in the streets** (about 10,000 of 18,000 in a steady game), then at evacuation points, then in their homes.

## What changed, and why

| Change | Why it's more fun |
|---|---|
| **Abilities on F**: grenades, molotovs, tank HE barrage, APC flare and siren | Something to do with a unit in a fight, on a cooldown, so timing matters. The siren is a real tactic: bait the infected into your guns, or lead them away from a crowd |
| **Ranks** at 50 and 150 kills, with stars over the unit and a bugle | Squads become characters you want to keep alive; "unit of the night" on the end screen |
| **Reinforce and repair (R)** at the fort or an evacuation point | A reason to pull a battered veteran squad back, and a use for spare money |
| **Four decisions** (Radio Calder, the dockers, the Marguerite, the bridges), pausing the game | Trade-offs in the spirit of the original game's events: people against safety, money against places on the ships |
| **New missions**: hold a block for 30 s; reach a VIP and bring them to the harbour or fort | A defend-a-point objective and a two-leg escort, alongside crates and survivors |
| **Late rooftop survivors**: from 6:00 left, missions every 26 to 40 s, up to three, with bigger groups | The last six minutes now have work to do: search-and-rescue while the great horde roams |
| **The horde makes for the biggest crowd** (300+ waiting), else the centre | A climax at the harbour for players who've queued thousands there |
| **Last-ship countdown**: horns at 1:30 and 0:30, a ticking banner for the final 10 s; troops and APC passengers at the quay sail too | Drama at the end, and a reason to fall back |
| **Orders from HQ**: four first tasks worth $500 in all, gone after 4 minutes | A tutorial nudge that rewards the right first moves |
| **Feedback**: floating "+700 saved", "+$700", "Held", rank-ups and unit barks ("Contact east!", "Man down!", "We're being overrun!") over the map; deaths by cause on the end screen | You see what your actions did, where they did it |

Fixes found while playing: an APC parked at a door near a bus stop loaded and unloaded 10 people every half second (instant transfer and log spam); it now only unloads beside a stop. APC messages are rationed. The game no longer ends "empty" while survivors still wait on a rooftop or ride in an APC.

## How it's built

- Sim state is added with interface merges at the end of `core.ts` (`Unit`, `Mission`, `Evac`, `Game`), so the original declarations are untouched.
- `sim.ts` records floating text in `G.pops` and thrown weapons in `G.shells`; `fx.ts` draws them, plus rank stars, the APC flare and hold rings. `view.ts` gained one line (`drawFx(time)` in `drawFrame`).
- `G.decision` pauses the page (`main.ts` shows the card). Headless tests answer with `City.choose(i)`, or after 30 s of game time nothing happens.
- Unit-panel buttons act on pointerdown, since the panel can be rebuilt between press and release mid-fight; cooldowns update in place.

## Balance (tests/city.js)

| Strategy | Before (4 games) | After (4 games) | After (10 games) |
|---|---|---|---|
| nothing | 19.7% | 18.7% | 17.9% |
| evacAll | 32.1% | 32.1% | 32.1% |
| steady | 51.7% | 52.7% | 49.9% |
| missions (the old `active`) | 64.5% | 58.1% | 59.4% |
| active (missions + the new verbs) | | 61.7% | 61.5% |

The old `active` falls from 64.5% to 58% on the same 4 seeds, but over 10 seeds it was 58.3% before this round as well: seed-to-seed spread (40 to 78%) dominates 4-game means. Abilities alone were worth about 4 points over 10 seeds once thrown weapons stopped killing civilians (an early version killed 5,000 people a game with grenades). No script errors in any run.
