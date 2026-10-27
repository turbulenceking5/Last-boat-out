# Simulation reference

Every constant below lives in `city/src/core.ts` or `city/src/sim.ts`.

## The step

`tick(dt)` runs with `dt = 1/20` s of game time:

1. Advance the clock; infected speed scales by `1 + 0.35 × t / 720`; add $10 × dt.
2. Recompute the civilians' field when an evacuation point fills up, empties or is added. Recompute the infected's field every 0.4 s.
3. Rebuild the spatial hashes for infected and civilians.
4. Run any outbreak, the great horde and missions that are due.
5. Update blocks (panic and evacuation), civilians, units (moving, APC cargo, firing), air strikes, gunships, the infected and evacuation points.
6. Clear away the dead: infected at 0 health, civilians marked gone, finished strikes and gunships, soldiers at 0 health, empty units.
7. End the game at 720 s, or when nobody is left.

Removal is deferred to step 6, so hash indices stay valid for the whole step.

## Movement: distance fields

`distanceField(out, sources)` is a multi-source breadth-first search over walkable cells (4 neighbours, unit cost). Agents step "downhill" to the neighbouring cell (8 neighbours, no corner cutting) with the lowest value, and `stepToward` slides along walls rather than entering buildings.

| Field | Sources | Used by |
|---|---|---|
| `G.eField` | Evacuation points with room (or all, if every one is full) | Civilians; choosing which door a block uses |
| `G.zField` | Civilians, soldiers, crowds at evacuation points and survivors at 0; populated blocks' doors at +10 | The infected, who hunt where the value is under 18 (runners 26) |
| `fieldTo(cell)` | One cell; cached (up to 40 cells) | Move orders; the great horde marching to the city centre |

## Spatial hash

Buckets of 2 × 2 cells. `near(x, z, r, fn)` visits items within `r`; `nearest(x, z, r, ok)` returns the closest item that passes `ok`.

## Tuning constants

| Constant | Value | Meaning |
|---|---|---|
| `PER_AGENT` | 10 | People per figure |
| `GAME_SECONDS` | 720 | Until the last ship |
| `BREACH` | 25 | Infected-seconds of battering before a block's doors give way (brutes add 6 per hit) |
| `CONVERT_EVERY` | 5 s | Once a block is breached, 10 people are caught this often |
| `EMIT_EVERY` | 2 s | An evacuating block lets 10 people out this often |
| `AGGRO`, `DOOR_SCENT` | 18, 10 | Hunting range; how much weaker doors smell than people |
| rise | 10 to 18 s | How long the bitten lie still |
| bite cooldown | 0.9 s | Between bites on civilians |
| evacuation crowd bite | every 0.8 s | Per evacuation point |
| `WAVE_AT`, `WAVE_SIZE` | 480 s, 220 | The great horde |
| `APC_CAP` | 60 | People an APC carries |
| `MAX_ZOMBIES`, `MAX_CIVS` | 2,400, 1,400 | Figure caps |
| outbreaks | 150, 320 and 500 s, 8 each | Plus 20 at the hospital at the start |

## Determinism

The street layout comes from a fixed seed (`20261027`). Everything else draws from `G.rnd`, seeded per game, so a seed replays the same game for the same inputs. Rendering, sound and particle jitter use `Math.random` and never affect the simulation.
