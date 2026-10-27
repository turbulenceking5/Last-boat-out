# Rendering

`city/src/view.ts` draws the city with Three.js r149.

## The static city

Everything here is built once, by `buildCity()`. "Play again" reuses it, because the map never changes.

- **Ground:** one plane with a canvas texture painted once at 16 px per cell: asphalt with grain, repair patches, oil stains and cracks; dashed lane lines between the junctions and zebra crossings on every approach; paved pavements with kerbs round every block; each block's own ground (lawns and hedges, paving, yards with bay markings, cobbles, ballast and rails, a pitch); the helipad; the quay's slabs, crane rails and yellow edge. Water cells are left transparent (`alphaTest`), so the sea plane shows through as the river and the pond.
- **Outskirts:** a second, coarser plane (5 px per cell) reaching 60 cells beyond the map on three sides: fields, suburban lawns, the roads out of town, the railway and the shore, with holes for the city and the river. Houses, barns and silos stand on it, and the fog swallows its far edge.
- **Water:** a large, slightly glossy plane 0.35 below the ground. Embankment walls stand wherever water meets land (with a low parapet where a street ends at the river), and each bridge has a stone face with an arch on both sides (an instanced extruded shape).
- **Buildings:** instanced meshes, one per shape: boxes for bodies (unit boxes scaled, turned and coloured per instance), flat roof caps, pitched roofs (an extruded gable with its ridge along the longer side), cylinders (tanks, chimneys, the apse, the fountain), cones (spires), half-spheres (the City Hall dome) and the dark window bands wrapped round every floor of flats and towers. A piece can stand on another (`y`), so towers have setback crowns and the hospital its red cross. When a block is overrun, its instances are recoloured to 32% brightness.
- **Trees:** instanced trunks, with cones for conifers and low-poly balls for broadleaves, shaded per tree.
- **Props:** two more instanced meshes (boxes and cylinders) for the embankment walls, the gantry cranes, the bollards, the lighthouse and mole, and Fort Aldermoor's sandbags.
- **Cars:** abandoned cars as two instanced meshes, body and cabin.

## People

Six instanced meshes: bodies and heads for the infected, bodies and heads for civilians, and bodies and helmets for soldiers. Every figure is drawn 1.5 times life size so it reads from the air. Each frame, the view writes a matrix and colour per figure:

- The infected lean, bob, and lie flat while rising. Runners lean further and bob faster; brutes are drawn 1.6 times larger.
- Civilians bob as they walk. Crowds at evacuation points and survivors at missions are drawn in rings round the spot.
- Soldiers are blue (infantry) or drab (militia), and face their target.

## Vehicles and aircraft

Small meshes built from boxes, kept in maps keyed by their simulation object and removed when it goes. APC and tank turrets turn toward their target. Ships and buses pull away when they depart and come back. Gunship rotors spin; jets fly over the strike line.

## Effects

- **Tracers:** one `LineSegments` buffer of up to 800 segments with additive blending.
- **Explosions:** pooled additive spheres that grow and fade.
- **Smoke:** an instanced mesh of translucent puffs rising over overrun blocks.
- **Mission beacons:** a translucent beam, a pulsing ring, and a crate or flare.
- **Markers:** selection rings, a pulsing move target, an outline round the selected block, and a placement ring (green if you can afford it, red if not) sized to what you're placing.

## Camera

A perspective camera looking down at about 54°. It orbits a target point at a given distance (14 to 95) and yaw. The sun's shadow camera follows the target, so shadows stay sharp where you look. Air strikes shake the camera. `screenToGround` raycasts onto the ground plane for picking.
