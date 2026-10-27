# 3D place models

In the original game, selecting a place shows a small low-poly 3D model of it in the side panel (the bottom sheet on phones). It turns slowly, and you can drag it.

## What you see

Each kind of place has its own diorama:

| Place type | Model |
|---|---|
| Capital | A parliament with a green dome and a columned portico, a square and office blocks |
| City | Tower blocks, one with a radio mast |
| Town | A church and gabled houses along crossing roads |
| Port | A quay with a crane, a lighthouse, sheds, and a freighter moored alongside |
| Army base | Barracks, a wire fence, a watchtower, a flag and trucks |
| Supply depot | Vaulted warehouses, fuel tanks, crates and a rail siding |
| Hospital | An H-shaped hospital, a helipad, ambulances and field tents |
| Farmland | Strip fields, a barn, a silo and a tractor |
| Rail junction | Crossing railways, a station with a platform, a water tower and an engine |

The model reflects the place's live state:

- battalions as soldiers (with tanks or trucks), and fortification as sandbag walls
- road barriers when threatened
- the infected, held off at the rim or roaming the streets
- muzzle flashes, smoke, fire, and charred ruins once it has fallen
- a refugee column with a bus when evacuating
- a crowd on the quay at ports
- lit windows at night

Layouts are seeded by place, so a place looks the same every turn.

## How it works

- Source: `models/src/*.ts` (`kit.ts` building blocks, `places.ts` one builder per type, `life.ts` state overlays, `viewer.ts` the shared renderer), type-checked against `@types/three@0.149.0`.
- Build: `npm run build:models` compiles and joins them into `models/models.js`, which is committed.
- The game calls `show3d()` on every render, passing the selected place's state. The viewer rebuilds the model only when what it shows has changed, and draws only while it's on screen.
- If Three.js can't load or WebGL isn't available, the panel takes no space and the game is unaffected. With reduced motion, one still frame is drawn.

More detail and pictures: [notes/11-3d-models.md](../notes/11-3d-models.md).
