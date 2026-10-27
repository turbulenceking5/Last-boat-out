# Rendering

`city/src/view.ts` draws the city with Three.js r149.

## The static city

- **Ground:** one plane with a canvas texture painted once: roads, lane markings, pavements, lots, park paths, the helipad and the quay. 12 px per cell.
- **Sea:** a large plane below the ground, with a quay wall along the edge.
- **Buildings:** instanced meshes. One for bodies (unit boxes scaled per building, coloured per instance), one for flat roofs, one for house gables, one for fuel tanks, and one for dark window bands wrapped round every floor of taller buildings. When a block is overrun, its instances are recoloured to 32% brightness.
- **Trees:** instanced trunks and cones.

The city is built once. "Play again" reuses it, because the street layout never changes.

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
