# 11. 3D place models

Selecting a place now shows a small low-poly Three.js model of it in the side panel (in the bottom sheet on phones). The models are written in TypeScript.

## How it fits together

- **Source:** `models/src/*.ts`, plain global scripts type-checked against `@types/three@0.149.0` with `strict` and `noUnusedLocals`.
- **Build:** `npm run build:models` runs `tsc -p models` and then `models/build.js`, which joins the compiled files into one classic script, `models/models.js`, inside a function scope. TypeScript 6 deprecates `outFile`, which is why there is a small join step rather than a single compiler option.
- **Loading:** `index.html` loads Three.js r149 from jsDelivr (pinned with a subresource-integrity hash) and `models/models.js`, both with `defer`. A plain script, not an ES module, so it also works when the game is opened from `file://`, as the tests do.
- **Hand-off:** when ready, `models.js` sets `window.LBModels`, adds the `has3d` class to `<html>` (which makes the panel box visible) and fires `lbmodels:ready`, which makes the game render again. On every render the game calls `show3d()`, which passes the selected place's type, state, civilians, infected, battalions, fortification, evacuation, quay queue and day or night.
- **Cost:** the viewer rebuilds the model only when something it shows changes (counts are bucketed), and draws frames only while the canvas is on screen and the tab is visible. With nothing changed, `show3d()` costs about 0.02ms per game render.

## What the models show

- One diorama per place type: capital (parliament with dome and portico), city (tower blocks), town (church and houses), port (quay, crane, lighthouse, moored freighter), army base (barracks, wire, watchtower), depot (warehouses, fuel tanks, rail siding), hospital (H-shaped block, helipad, field tents), farm (fields, barn, silo), rail junction (crossing lines, station, water tower, engine).
- Live state: soldiers in squads of three per battalion, with trucks or tanks; sandbag walls, one course per fortification level; road barriers when threatened; infected streaming in from the rim when held and wandering the streets when overrun; muzzle flashes while fighting; smoke when holding; fires and black smoke when losing; charred, roofless ruins when fallen; a refugee column with a bus when evacuating; a crowd on the quay at ports; lit windows, cold light and a base searchlight at night.
- Layouts are seeded by place, so a place always looks the same from turn to turn.

## Checks

- Every type and state was rendered and looked at, at 1280px and 390px widths.
- Fallbacks: with jsDelivr blocked, or with WebGL disabled, the panel box takes no space, no errors are thrown, and turns still play.
- With reduced motion, one still frame is drawn and no animation loop runs; dragging redraws it.
- UI fuzzer: 12 campaigns, no script errors, scrollWidth 1280 and 390 (default headless Chromium has WebGL, so the models were exercised). A balance run with 20 campaigns per strategy is unchanged.

## Limits

- The 3D view needs the CDN the first time; offline play works, just without models.
- People are small at panel size; the models are a picture of the place, not a precise count. The panel's numbers stay the source of truth.
