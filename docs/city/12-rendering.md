# City rendering: units and props

How the people, vehicles, ships and aircraft of the City are drawn (`city/src/view.ts`). The static city (ground, buildings, trees) is described elsewhere.

## People

- **Eight figure kinds, eight draw calls.** Walker, runner and brute (the infected), three kinds of civilian (shirt and trousers, long coat, hat and rucksack; a sixth of civilians are children, drawn smaller), helmeted infantry with packs and rifles, and militia in caps with hunting rifles. Each kind is one merged, indexed geometry (`figureGeo`) with its colours baked in per vertex, drawn as one `InstancedMesh`.
- **Tinting.** A per-vertex `aTint` marks clothing; the instance colour (the agent's shirt, coat or uniform colour) only tints those parts, so skin, hair, helmets and weapons keep their colours.
- **Animation in the vertex shader.** Each limb vertex carries `aLimb` (how much it swings and the height of its hinge); each instance carries `aAnim` (phase, amplitude, frequency). The material's `onBeforeCompile` rotates limbs about their hinge and adds a bob, driven by the game clock, so walking costs the CPU three numbers per figure. Arms swing against legs; soldiers hold their rifles still; the infected reach forward; runners pump their arms; brutes swing huge arms slowly.
- **Fast instance writes.** `putFig` writes the matrix (heading, forward lean, scale), colour and animation straight into the instance arrays: no `Object3D.updateMatrix`.
- **Kinds of infected.** `zedKind` reads an optional `kind` string on a `Zed` (`'runner'`, `'brute'`); without one, very fast infected (`sp >= 1.25`) are drawn as runners and very tough ones (`hp >= 8`) as brutes. Runners lean hard into their stride; brutes are drawn 1.3x and stooped. The newly bitten lie flat until they rise.
- **Level of detail.** When the camera is high (`cam.dist > 52`) each kind switches to a far geometry with merged legs and no small parts (rifles, packs, fists), about a third fewer triangles. Faces pointing straight down are dropped from every figure.
- **Size.** About 70 to 115 triangles per figure near, 50 to 90 far, against about 60 before; people stay 1.5x life size.

## Vehicles and props

All built from shared geometry (`vgeo` cache) and the shared material cache (`vmat`).

- **APC**: an eight-wheeled hull with a sloped nose, vision blocks, headlights, roof hatches, a rear door, a swaying aerial and a remote gun. Wheels turn with the distance driven.
- **Tank**: tracks with road wheels and cleats that run along the top as it drives, a sloped hull, engine grille and stowage, a faceted turret with bustle rack, cupola and machine gun, and a long gun with a muzzle brake that kicks back when the tank fires (detected from the member's cooldown jumping).
- **Freighter**: hull with a pointed bow and a red boot-top, two tiers of containers in the harbour's colours, two deck cranes, a three-deck bridge aft with windows and a turning radar, a funnel with a band and smoke (a wisp at the quay, a plume under way), lifeboats. She swings her bow out to sea as she leaves and comes back bow first, with a fading wake and bow wave while she moves.
- **Bus**: amber, with a window band, a pale roof, a red stripe, a lit destination board; it now drives along its length, wheels turning.
- **Gunship**: fuselage with glazed nose, tail boom, fin and stabiliser, stub wings and rocket pods, skids, a four-bladed rotor over a faint blur disc and a tail rotor. Nose down and banked as it circles.
- **Strike jets**: a lead and a wingman with swept wings and tailplanes, twin canted fins, canopies and flickering exhaust flames; they roll slightly.
- **Evacuation marker**: ring, pole with a striped foot, flag with a white bar.

## Performance

`drawFrame` with 2,000 infected and 1,000 civilians, headless Chromium with SwiftShader, timed directly with a `readPixels` to wait for the GPU, fastest of 5 rounds alternating between the two builds (the machine was shared, so treat these as a relative comparison):

| Camera | Before | After | Change |
|---|---|---|---|
| wide (dist 95, far figures) | 328 ms | 348 ms | +6% |
| mid (dist 40, near figures) | 432 ms | 498 ms | +15% |
| close (dist 16) | 447 ms | 458 to 480 ms | about +5% (noisy) |

A second run on a busier machine gave +12%, +14% and +3%. Triangles drawn went from 191k to 264k; draw calls from 17 to 18. The JavaScript part of `drawFrame` went down slightly (about 1.4 to 1.2 ms quiet, 3.0 to 2.3 ms busy), since one matrix per figure is written directly instead of two through `Object3D`. Without the index sharing and the far versions, the first draft of the figures cost +40% to +60%.

## Pictures

- People close up: walkers, runners, brutes, the bitten, civilians, infantry and militia: [../notes/screens/city/units-people.png](../notes/screens/city/units-people.png)
- A horde in the street: [../notes/screens/city/units-crowd.png](../notes/screens/city/units-crowd.png)
- APC and tank: [../notes/screens/city/units-vehicles.png](../notes/screens/city/units-vehicles.png)
- The freighter at the quay and leaving: [../notes/screens/city/units-ship.png](../notes/screens/city/units-ship.png), [../notes/screens/city/units-ship-away.png](../notes/screens/city/units-ship-away.png)
- Gunship and strike jets: [../notes/screens/city/units-air.png](../notes/screens/city/units-air.png)
