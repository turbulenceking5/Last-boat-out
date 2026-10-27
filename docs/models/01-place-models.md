# 3D place models

In the original game, selecting a place shows a small low-poly 3D model of it in the side panel (the bottom sheet on phones). It turns slowly, and you can drag it.

## What you see

Each kind of place has its own diorama (see [Per place](#per-place)).

The model reflects the place's live state:

- battalions as soldiers (with tanks or trucks), and fortification as sandbag walls
- road barriers when threatened
- the infected, held off at the rim or roaming the streets
- muzzle flashes, smoke, fire, and charred ruins once it has fallen
- a refugee column with a bus when evacuating
- a crowd on the quay at ports
- lit windows at night

Layouts are seeded by place, so a place looks the same every turn.

## Per place

| Type | Detail |
|---|---|
| capital | parliament with dome and portico, a statue in a fountain in the square, lamps, official cars |
| city | towers with roof clutter, parked cars and a van, street lamps, a billboard, radio mast |
| town | church, houses, cars, street lamps, a war memorial |
| port | quay, crane, lighthouse, freighter, container stack, a rocking fishing boat, gulls |
| base | barracks, wire, watchtower (searchlight at night), a helicopter on its pad, a turning radar |
| depot | warehouses, fuel tanks, siding with wagons, a forklift shuttling a crate, pallets |
| hospital | H-block, ambulances with flashing lights, a medevac helicopter, field tents with green first-aid crosses |
| farm | strip fields, barn, silo, a turning wind pump, grazing cows |
| junction | crossing lines, station, water tower, engine with steam, signals, lamps |

## How it works

- Source: `models/src/*.ts` (`kit.ts` building blocks, `places.ts` one builder per type, `life.ts` state overlays, `viewer.ts` the shared renderer), type-checked against `@types/three@0.149.0`.
- Build: `npm run build:models` compiles and joins them into `models/models.js`, which is committed.
- The game calls `show3d()` on every render, passing the selected place's state. The viewer rebuilds the model only when what it shows has changed, and draws only while it's on screen.
- If Three.js can't load or WebGL isn't available, the panel takes no space and the game is unaffected. With reduced motion, one still frame is drawn.


## Pieces

- **kit.ts**: palette (`COL`), shared materials (`mat`) and unit geometry (`GEO`, including `limb` for swinging limbs, `bag` for sandbags and `disc` for decals and fire beds), and the shared builders: `house`, `block` (with roof clutter: lift housing, air-conditioning boxes, sometimes a water tank), `tree`, `strip`, `car`, `lamp` (lit at night) and `person`.
- **person(body, opts)**: legs and arms that hang from hip and shoulder so they swing, a body, a head and one of helmet, cap, hat or hair. `pose` is `walk` (arms swing), `rifle` (arms forward holding a rifle) or `reach` (the infected's outstretched arms). `scale` makes children, `broad` makes brutes. Figures are drawn 1.45x life size so they read at panel size.
- **places.ts**: one builder per place type, plus `vehicle` (truck with a canvas tilt, tank with a turning turret, bus, ambulance with a flashing light, tractor), `heli`, `cow`, `gulls`, `ship`, `wagons`, `loco`.
- **life.ts**: what changes from turn to turn: sandbags (staggered pillows in three tones, a course per fortification level, machine-gun posts from level 2), barricades with a blinking lamp, soldiers (helmets, packs, rifles; one kneels and they flash when fighting), the infected (shamblers reaching forward, lean runners, and a brute in a big horde; at a held place they fall at the wire), civilians in a few outfits and children, refugees with cases and rucksacks, a waving crowd on the quay, smoke, fire (ember bed, three flickering flames and, for the first fire, a flickering light), and the wreckage of a losing or fallen place (blood, the dead, a wrecked car, rubble, circling crows).
- **viewer.ts**: one shared renderer; rebuilds only when the spec changes. The camera is a lowish three-quarter view (about 32 degrees) so the round slab fills a wide panel and figures show their sides.

## Pictures

- Every type, and a town through its states, at the desktop panel size (430 x 210): [../notes/screens/3d/places-after.png](../notes/screens/3d/places-after.png); the same before this pass: [../notes/screens/3d/places-before.png](../notes/screens/3d/places-before.png)
- At the phone panel size (358 x 140): [../notes/screens/3d/places-phone.png](../notes/screens/3d/places-phone.png)

More on how it is wired into the game: [notes/11-3d-models.md](../notes/11-3d-models.md).
