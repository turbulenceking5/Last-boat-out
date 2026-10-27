# Changelog

All notable changes, newest first. Dates are when the work was committed.

## Unreleased (on `claude/optimistic-galileo-svkncv`)

### City
- Runners and brutes: fast, fragile infected, and huge, tough ones that smash doors and vehicles.
- APC rescues: park beside a block to take up to 60 people aboard, then drop them at an evacuation point.
- Missions: supply drops for money, and rooftop survivors to reach before the infected do.
- The great horde: 220 infected arrive from the east at minute 8, after a siren and a 30-second warning.
- Synthesised sound for gunfire, cannon, explosions, horns, the siren, chimes and groans; camera shake on air strikes; mute with M.
- `tests/city.js` gains an `active` strategy using missions and APCs (64.5% saved).
- Unit abilities on F (grenades, molotovs, tank HE barrage, APC flare and siren), ranks from kills, and reinforcing on R.
- Four decisions that pause the game; orders from HQ for the first four minutes; hold-a-block and VIP missions; rooftop survivors through the last six minutes; the great horde makes for the biggest crowd; a last-ship countdown.
- Floating text over the map for saves, money, promotions and unit barks; deaths by cause and the unit of the night on the end screen.

### Docs
- A full documentation set under `docs/`: player guides and code references for both games, the 3D models, a glossary, an FAQ and deployment notes. Plus this changelog and `CONTRIBUTING.md`.

## 2026-10-27: Last Boat to Calder: City ([#3](https://github.com/turbulenceking5/Last-boat-out/pull/3))
- A new real-time 3D game at `city/`: one city, evacuation points, militia, infantry, APCs, tanks, air strikes and a gunship, against an outbreak that spreads block by block. Real time with pause; the last ship sails after 12 minutes.
- Written in TypeScript, compiled to the committed `city/city.js`.
- `tests/city.js` balance and `tests/city-fuzz.js` random-input tests.
- The original's setup screen links to it.

## 2026-10-27: 3D place models ([#2](https://github.com/turbulenceking5/Last-boat-out/pull/2))
- Selecting a place shows a low-poly Three.js diorama of it that reflects its live state.
- Written in TypeScript (`models/src/`), compiled to the committed `models/models.js`.

## 2026-10-18: Mechanics, feel and visuals (merged in [#2](https://github.com/turbulenceking5/Last-boat-out/pull/2))
- Night turns, garrison experience (green to elite), helicopter airlifts, and branching events (the grid failing, Dr Okafor's siege).
- Procedural sound, turn feedback and first-turn tips.
- Hordes and army units drawn as figures on the map; a richer map and command bar.

## 2026-10-08: Share links (merged in [#2](https://github.com/turbulenceking5/Last-boat-out/pull/2))
- Copy seed includes a link that opens setup with that campaign filled in.
- Arrow keys step through dialog buttons.

## 2026-10-07: Fixes, accessibility and the after-action report ([#1](https://github.com/turbulenceking5/Last-boat-out/pull/1))
- Fixed people vanishing when a small port fell, a "great march" scheduled in the past, and dead towns being cleared and falling twice.
- Grade thresholds in one constant, `GRADES`, read by the end screen and the balance tests.
- Full keyboard play, screen-reader announcements, reasons on disabled orders, and a better phone layout.
- After-action report with a turn-by-turn chart and turning points; a local service record; replay and copy-seed.

## 2026-10-07: First release
- Last Boat to Calder: the turn-based outbreak command game in one HTML file, with balance and fuzz tests.
