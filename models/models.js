/* Last Boat to Calder: 3D place models. Generated from models/src/*.ts by `npm run build:models`; edit the TypeScript, not this file. */
(function () {
"use strict";
if (typeof THREE === "undefined") return; // the CDN was unreachable: no 3D view, the game is unaffected
// ---- kit.ts ----
// Shared building blocks: the place description the game passes in, a seeded random source,
// the palette, cached geometry and the small pieces (houses, trees, people) every model is made of.
function seeded(str) {
    let a = 0;
    for (let i = 0; i < str.length; i++)
        a = (Math.imul(a ^ str.charCodeAt(i), 2654435761) + i) | 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// The game's own palette, so the models sit with the paper map and dark panels.
const COL = {
    paper: 0xcdc7af, grass: 0x8f9a6a, field1: 0xa7a46a, field2: 0x7f8f55, moss: 0x5f7a48, trunk: 0x6b5236,
    road: 0x8a7652, rail: 0x3a3c31, sleeper: 0x6b5a44, water: 0x5f7f86, quay: 0x9a948a,
    wall1: 0xe4dfcf, wall2: 0xd8cbb0, wall3: 0xc2b190, brick: 0xa0644a, stone: 0xb7b2a4,
    roof1: 0x8a4b3a, roof2: 0x5d6b72, roof3: 0x6e5a48, dome: 0x6f8f86,
    olive: 0x55633a, khaki: 0x8c8456, troop: 0x3d5a78, steel: 0x6d767a,
    zed: 0x7d8a63, zedShirt: 0x6a4f45, blood: 0xc4432f, civ: 0xe9e3cf, civ2: 0x7f93a6, civ3: 0xb8865b,
    skin: 0xd9b08c, amber: 0xe2a23a, char: 0x2c2925, char2: 0x3b3631, sand: 0xbfa978, hull: 0x2f3a40,
    window: 0x30383c, glow: 0xffc96b, white: 0xf1eee4,
};
const matCache = new Map();
/** Shared flat-shaded materials, keyed by colour and glow. */
function mat(color, opts = {}) {
    var _a, _b;
    const key = `${color}|${(_a = opts.glow) !== null && _a !== void 0 ? _a : 0}|${(_b = opts.opacity) !== null && _b !== void 0 ? _b : 1}`;
    let m = matCache.get(key);
    if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
        if (opts.glow) {
            m.emissive = new THREE.Color(opts.glow);
            m.emissiveIntensity = 1;
        }
        if (opts.opacity !== undefined && opts.opacity < 1) {
            m.transparent = true;
            m.opacity = opts.opacity;
            m.depthWrite = false;
        }
        matCache.set(key, m);
    }
    return m;
}
/** Walls and roofs scorch on a fallen place. */
const wallMat = (c, color) => mat(c.burnt ? (color === COL.brick ? COL.char2 : COL.char) : color);
const roofMat = (c, color) => mat(c.burnt ? COL.char : color);
// Unit-sized geometry, shared by every mesh and stretched with mesh.scale.
const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
    cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0),
    cone4: new THREE.ConeGeometry(0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    cone6: new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0),
    dome: new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    ball: new THREE.SphereGeometry(0.5, 7, 5),
    gable: (() => {
        // a 1 x 1 x 1 pitched roof, ridge along z
        const s = new THREE.Shape();
        s.moveTo(-0.5, 0);
        s.lineTo(0.5, 0);
        s.lineTo(0, 1);
        s.lineTo(-0.5, 0);
        return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
    })(),
    vault: new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
};
/** Add a mesh of a shared geometry, sized, placed and turned. */
function part(parent, geo, m, sx, sy, sz, x = 0, y = 0, z = 0, ry = 0) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
const box = (p, m, w, h, d, x = 0, y = 0, z = 0, ry = 0) => part(p, GEO.box, m, w, h, d, x, y, z, ry);
/** A row of windows on the two long faces of a block, lit at night. */
function windows(c, g, w, h, d, floors) {
    if (c.burnt)
        return;
    const m = c.lit ? mat(COL.glow, { glow: COL.glow }) : mat(COL.window);
    const cols = Math.max(1, Math.floor(w / 0.42));
    for (let f = 0; f < floors; f++) {
        const y = (h / floors) * (f + 0.45);
        for (let i = 0; i < cols; i++) {
            if (c.lit && c.lrnd() < 0.35)
                continue; // not every room is awake
            const x = -w / 2 + (w / cols) * (i + 0.5);
            for (const side of [-1, 1])
                box(g, m, 0.16, 0.18, 0.02, x, y, side * (d / 2 + 0.005));
        }
    }
}
/** A gabled house. Returns its group so callers can place it. */
function house(c, x, z, ry, w = 0.9, d = 0.7, h = 0.6, wall = COL.wall1, roof = COL.roof1) {
    const g = new THREE.Group();
    box(g, wallMat(c, wall), w, h, d);
    if (c.burnt && c.rnd() < 0.5) {
        // roof caved in: a few fallen beams
        for (let i = 0; i < 2; i++)
            box(g, mat(COL.char), w * 0.9, 0.05, 0.06, 0, h * 0.6, -d / 4 + i * d / 2, 0.3 - i * 0.5);
    }
    else {
        part(g, GEO.gable, roofMat(c, roof), d * 1.15, h * 0.65, w * 1.12, 0, h, 0, Math.PI / 2);
    }
    windows(c, g, w, h, d, 1);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    c.root.add(g);
    return g;
}
/** A flat-roofed block of flats or offices. */
function block(c, x, z, ry, w, d, h, wall = COL.wall2) {
    const g = new THREE.Group();
    const top = c.burnt ? h * (0.45 + c.rnd() * 0.4) : h; // burnt-out shells are broken off
    box(g, wallMat(c, wall), w, top, d);
    if (!c.burnt)
        box(g, mat(COL.stone), w + 0.06, 0.06, d + 0.06, 0, top, 0);
    windows(c, g, w, top, d, Math.max(1, Math.round(top / 0.55)));
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    c.root.add(g);
    return g;
}
function tree(c, x, z, s = 1) {
    const g = new THREE.Group();
    part(g, GEO.cyl6, mat(c.burnt ? COL.char : COL.trunk), 0.09 * s, 0.35 * s, 0.09 * s);
    if (!c.burnt) {
        part(g, GEO.cone6, mat(COL.moss), 0.55 * s, 0.75 * s, 0.55 * s, 0, 0.25 * s, 0);
        part(g, GEO.cone6, mat(COL.moss), 0.42 * s, 0.55 * s, 0.42 * s, 0, 0.6 * s, 0);
    }
    g.position.set(x, 0, z);
    g.rotation.y = c.rnd() * 6;
    c.root.add(g);
}
/** A flat strip lying on the ground: roads, fields, platforms. */
function strip(c, color, w, d, x, z, ry = 0, y = 0.005) {
    const m = box(c.root, mat(color), w, 0.02, d, x, y, z, ry);
    m.castShadow = false;
    return m;
}
/** A chunky little person: body, head, two legs, optional helmet. */
function person(body, opts = {}) {
    var _a, _b;
    const g = new THREE.Group();
    const s = ((_a = opts.scale) !== null && _a !== void 0 ? _a : 1) * 1.3; // a touch larger than life so they read at panel size
    const legs = [];
    for (const side of [-1, 1]) {
        const leg = part(g, GEO.box, mat(COL.char2), 0.07 * s, 0.16 * s, 0.08 * s, side * 0.05 * s, 0, 0);
        legs.push(leg);
    }
    part(g, GEO.cyl6, mat(body), 0.2 * s, 0.2 * s, 0.15 * s, 0, 0.15 * s, 0);
    part(g, GEO.ball, mat((_b = opts.head) !== null && _b !== void 0 ? _b : COL.skin), 0.14 * s, 0.14 * s, 0.14 * s, 0, 0.42 * s, 0);
    if (opts.helmet !== undefined)
        part(g, GEO.dome, mat(opts.helmet), 0.17 * s, 0.13 * s, 0.17 * s, 0, 0.44 * s, 0);
    return { g, legs };
}
/** Pick a free spot, preferring the yards a builder set aside, else a ring between r0 and r1. */
function spot(c, r0, r1) {
    if (c.yards.length && c.rnd() < 0.7) {
        const [x, z] = c.yards[Math.floor(c.rnd() * c.yards.length)];
        return [x + (c.rnd() - 0.5) * 0.5, z + (c.rnd() - 0.5) * 0.5];
    }
    const a = c.rnd() * Math.PI * 2, r = r0 + c.rnd() * (r1 - r0);
    return [Math.cos(a) * r, Math.sin(a) * r];
}

// ---- places.ts ----
// One low-poly diorama per place type, on an octagonal slab about 10 units across.
// Builders lay out buildings and roads, and record open "yards" where people can stand.
const GROUND = {
    full: new THREE.CylinderGeometry(5, 5.3, 0.5, 8).translate(0, -0.25, 0),
    // ports: land on the -z half, harbour water on the +z half (the quay runs along z = 0)
    land: new THREE.CylinderGeometry(5, 5.3, 0.5, 8, 1, false, Math.PI / 2, Math.PI).translate(0, -0.25, 0),
    seabed: new THREE.CylinderGeometry(5, 5.3, 0.2, 8, 1, false, -Math.PI / 2, Math.PI).translate(0, -0.6, 0),
    sea: new THREE.CylinderGeometry(4.98, 4.98, 0.02, 8, 1, false, -Math.PI / 2, Math.PI).translate(0, -0.32, 0),
};
function ground(c, color) {
    const m = new THREE.Mesh(c.spec.type === 'port' ? GROUND.land : GROUND.full, mat(c.burnt ? 0x8d8574 : color));
    m.receiveShadow = true;
    c.root.add(m);
    if (c.spec.type === 'port') {
        c.root.add(new THREE.Mesh(GROUND.seabed, mat(0x46585c)));
        const sea = new THREE.Mesh(GROUND.sea, mat(COL.water, { opacity: 0.85 }));
        sea.receiveShadow = true;
        c.root.add(sea);
    }
}
/** Railway: ballast, sleepers and two rails from (x1,z1) to (x2,z2). */
function track(c, x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
    const g = new THREE.Group();
    g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    g.rotation.y = ry;
    c.root.add(g);
    box(g, mat(0x8a8478), len, 0.03, 0.62).castShadow = false;
    for (let s = -len / 2 + 0.15; s < len / 2; s += 0.3)
        box(g, mat(c.burnt ? COL.char : COL.sleeper), 0.09, 0.04, 0.56, s, 0.03, 0);
    for (const side of [-0.18, 0.18])
        box(g, mat(COL.rail), len, 0.05, 0.05, 0, 0.07, side);
}
function road(c, x1, z1, x2, z2, w = 0.6) {
    const dx = x2 - x1, dz = z2 - z1;
    strip(c, c.burnt ? 0x5e5546 : COL.road, Math.hypot(dx, dz), w, (x1 + x2) / 2, (z1 + z2) / 2, Math.atan2(-dz, dx));
}
/** Trees scattered round the rim, clear of the given keep-out test. */
function treeRing(c, n, r0 = 3.6, r1 = 4.6, clear = () => true) {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
        const a = c.rnd() * Math.PI * 2, r = r0 + c.rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!clear(x, z))
            continue;
        tree(c, x, z, 0.8 + c.rnd() * 0.5);
        i++;
    }
}
function church(c, x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    c.root.add(g);
    box(g, wallMat(c, COL.stone), 1.5, 0.75, 0.8);
    part(g, GEO.gable, roofMat(c, COL.roof2), 0.92, 0.5, 1.6, 0, 0.75, 0, Math.PI / 2);
    box(g, wallMat(c, COL.stone), 0.5, 1.5, 0.5, -0.95, 0, 0);
    if (!c.burnt)
        part(g, GEO.cone4, roofMat(c, COL.roof2), 0.5, 0.9, 0.5, -0.95, 1.5, 0);
    if (c.lit)
        box(g, mat(COL.glow, { glow: COL.glow }), 0.2, 0.32, 0.02, -0.95, 1.05, 0.26);
}
const BUILD = {
    town(c) {
        ground(c, COL.grass);
        road(c, -5, 0.2, 5, 0.2);
        road(c, 0.6, -5, 0.6, 5, 0.5);
        church(c, -1.6, -1.5, 0);
        const lots = [
            [-3.2, 1.4, 0], [-2.0, 1.4, 0], [-0.8, 1.5, 0.1], [1.9, 1.3, 0], [3.1, 1.2, -0.1],
            [2.0, -1.0, 0], [3.2, -1.1, 0.1], [-0.6, -2.9, Math.PI / 2], [2.0, -2.5, 0], [-3.2, -0.9, 0.2],
            [1.8, 2.8, 0.1], [-1.9, 2.9, -0.1],
        ];
        const walls = [COL.wall1, COL.wall2, COL.wall3, COL.brick], roofs = [COL.roof1, COL.roof3, COL.roof2];
        for (const [x, z, r] of lots)
            house(c, x, z, r, 0.8 + c.rnd() * 0.3, 0.65, 0.5 + c.rnd() * 0.25, walls[Math.floor(c.rnd() * 4)], roofs[Math.floor(c.rnd() * 3)]);
        c.yards.push([0.6, 0.2], [-1.2, 0.2], [2.5, 0.2], [0.6, -1.5], [0.6, 1.8], [-0.3, -0.6]);
        treeRing(c, 9, 3.7, 4.6, (x, z) => Math.abs(z - 0.2) > 0.7 && Math.abs(x - 0.6) > 0.6);
    },
    city(c) {
        ground(c, 0xa9a28c);
        for (const v of [-1.5, 1.5]) {
            road(c, -5, v, 5, v, 0.7);
            road(c, v, -5, v, 5, 0.7);
        }
        const cells = [-3.1, 0, 3.1];
        for (const gx of cells)
            for (const gz of cells) {
                if (Math.hypot(gx, gz) > 4.3)
                    continue;
                const tall = gx === 0 && gz === 0;
                const n = tall ? 1 : 2;
                for (let i = 0; i < n; i++) {
                    const w = tall ? 1.4 : 0.9 + c.rnd() * 0.4, d = tall ? 1.4 : 0.9 + c.rnd() * 0.3;
                    const h = tall ? 3.6 : 1 + c.rnd() * 2.2;
                    const ox = n === 1 ? 0 : (i ? 0.55 : -0.55), oz = n === 1 ? 0 : (c.rnd() - 0.5) * 0.6;
                    block(c, gx + ox, gz + oz, 0, n === 1 ? w : 0.95, d, h, [COL.wall2, COL.wall3, COL.stone, COL.brick][Math.floor(c.rnd() * 4)]);
                }
            }
        if (!c.burnt) { // a radio mast on the tallest tower
            box(c.root, mat(COL.steel), 0.06, 0.9, 0.06, 0, 3.6, 0);
            box(c.root, mat(COL.blood, { glow: c.spec.night ? COL.blood : undefined }), 0.12, 0.12, 0.12, 0, 4.5, 0);
        }
        c.yards.push([-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5], [0, 1.5], [0, -1.5], [-1.5, 0], [1.5, 0]);
    },
    capital(c) {
        ground(c, 0xb9b39b);
        strip(c, 0xd6d0bc, 3.4, 2.0, 0, 1.6); // the square in front of parliament
        road(c, -5, 2.9, 5, 2.9, 0.7);
        road(c, -2.6, -5, -2.6, 5, 0.6);
        road(c, 2.6, -5, 2.6, 5, 0.6);
        // parliament: a long hall, a columned portico and a green dome
        const g = new THREE.Group();
        c.root.add(g);
        g.position.set(0, 0, -0.9);
        box(g, wallMat(c, COL.stone), 3.2, 0.9, 1.5);
        box(g, wallMat(c, COL.wall1), 3.35, 0.12, 1.65, 0, 0.9, 0);
        for (let i = 0; i < 6; i++)
            part(g, GEO.cyl, wallMat(c, COL.white), 0.14, 0.75, 0.14, -0.9 + i * 0.36, 0, 0.92);
        box(g, wallMat(c, COL.wall1), 2.2, 0.14, 0.42, 0, 0.75, 0.92);
        part(g, GEO.gable, roofMat(c, COL.wall1), 0.42, 0.3, 2.2, 0, 0.89, 0.92, Math.PI / 2);
        part(g, GEO.cyl, wallMat(c, COL.stone), 1.1, 0.45, 1.1, 0, 1.02, 0);
        if (!c.burnt) {
            part(g, GEO.dome, mat(COL.dome), 1.2, 1.1, 1.2, 0, 1.47, 0);
            box(g, mat(COL.steel), 0.04, 0.9, 0.04, 0, 2.0, 0);
            const flag = box(g, mat(COL.troop), 0.42, 0.24, 0.02, 0.23, 2.62, 0);
            c.ticks.push(t => { flag.rotation.y = Math.sin(t * 2.2) * 0.25; });
        }
        windows(c, g, 3.2, 0.9, 1.5, 2);
        for (const [x, z, w, d, h] of [[-3.7, -0.8, 1, 1.4, 1.6], [3.7, -0.8, 1, 1.4, 1.9], [-3.6, 1.3, 1.1, 1, 1.2], [3.6, 1.3, 1.1, 1, 1.4],
            [-1.2, -3.3, 1.3, 0.9, 1.3], [1.3, -3.3, 1.3, 0.9, 1.1], [-1.3, 3.9, 1.2, 0.7, 0.9], [1.3, 3.9, 1.2, 0.7, 1.0]])
            block(c, x, z, 0, w, d, h, c.rnd() < 0.5 ? COL.wall2 : COL.wall3);
        c.yards.push([-1, 1.4], [1, 1.4], [0, 2.2], [-2.6, 0.3], [2.6, 0.3], [0, 2.9]);
        treeRing(c, 5, 3.9, 4.5, (x, z) => Math.abs(x) < 2.2 && z < 0);
    },
    port(c) {
        ground(c, COL.grass);
        box(c.root, mat(c.burnt ? 0x5e5a52 : COL.quay), 8.4, 0.6, 1.3, 0, -0.6, 0.65); // the quay wall
        for (let x = -3.6; x <= 3.7; x += 1.2)
            part(c.root, GEO.cyl6, mat(COL.char2), 0.12, 0.12, 0.12, x, 0, 1.2); // bollards
        road(c, -5, -0.6, 5, -0.6, 0.5);
        // a cargo crane on the quay
        const cr = new THREE.Group();
        cr.position.set(2.6, 0, 0.35);
        c.root.add(cr);
        for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]])
            box(cr, mat(c.burnt ? COL.char : COL.amber), 0.08, 1.4, 0.08, x, 0, z);
        box(cr, mat(c.burnt ? COL.char : COL.amber), 0.8, 0.4, 0.7, 0, 1.4, 0);
        box(cr, mat(c.burnt ? COL.char : COL.amber), 0.14, 0.14, 2.6, 0, 1.75, 1.0); // jib over the water
        if (!c.burnt)
            c.ticks.push(t => { cr.rotation.y = Math.sin(t * 0.3) * 0.4; });
        // sheds and the harbour town behind
        for (const x of [-3.2, -1.6]) {
            const g = new THREE.Group();
            g.position.set(x, 0, -1.6);
            c.root.add(g);
            box(g, wallMat(c, COL.wall3), 1.4, 0.55, 1.0);
            part(g, GEO.vault, roofMat(c, COL.roof2), 1.0, 0.5, 1.4, 0, 0.55, 0, Math.PI / 2);
        }
        for (const [x, z] of [[0.6, -1.6], [1.7, -1.7], [3.0, -1.7], [-0.5, -3.0], [0.8, -3.1], [2.1, -3.0], [-2.4, -3.2]])
            house(c, x, z, c.rnd() * 0.2 - 0.1, 0.85, 0.65, 0.55 + c.rnd() * 0.3, c.rnd() < 0.5 ? COL.wall1 : COL.wall2, c.rnd() < 0.5 ? COL.roof1 : COL.roof2);
        // a lighthouse at the harbour mouth
        const lh = new THREE.Group();
        lh.position.set(-4.0, 0, 0.6);
        c.root.add(lh);
        part(lh, GEO.cyl, wallMat(c, COL.white), 0.4, 1.6, 0.4);
        part(lh, GEO.cyl, mat(COL.blood), 0.42, 0.25, 0.42, 0, 0.7);
        part(lh, GEO.cyl, mat(c.spec.night && !c.burnt ? COL.glow : COL.window, { glow: c.spec.night && !c.burnt ? COL.glow : undefined }), 0.3, 0.25, 0.3, 0, 1.6);
        part(lh, GEO.cone6, roofMat(c, COL.roof2), 0.45, 0.3, 0.45, 0, 1.85);
        ship(c);
        c.yards.push([-2.2, 0.55], [-1, 0.55], [0.2, 0.55], [1.4, 0.55], [-0.4, -0.6], [1.2, -0.6]);
        treeRing(c, 5, 3.9, 4.6, (x, z) => z < -2.2 && Math.abs(x) > 2.8);
    },
    base(c) {
        ground(c, 0x9a9a72);
        strip(c, 0xb3ab8e, 3.2, 2.2, 0.3, 0.7); // parade ground
        road(c, -5, 2.4, 0.3, 2.4, 0.6);
        road(c, 0.3, 2.4, 0.3, 5, 0.6);
        // perimeter fence with a gate on the south side
        for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * 4.3, z = Math.sin(a) * 4.3;
            if (Math.abs(x - 0.3) < 0.6 && z > 0)
                continue;
            box(c.root, mat(COL.steel), 0.05, 0.45, 0.05, x, 0, z);
            if (i % 2 === 0)
                box(c.root, mat(COL.steel), 0.68, 0.03, 0.02, x, 0.38, z, -a + Math.PI / 2);
        }
        for (const z of [-2.6, -1.4]) {
            const g = new THREE.Group();
            g.position.set(-0.4, 0, z);
            c.root.add(g);
            box(g, wallMat(c, COL.khaki), 3.4, 0.5, 0.8);
            part(g, GEO.gable, roofMat(c, COL.olive), 0.9, 0.3, 3.5, 0, 0.5, 0, Math.PI / 2);
            windows(c, g, 3.4, 0.5, 0.8, 1);
        }
        block(c, 2.8, -1.5, 0, 1.2, 1.0, 0.9, COL.wall2); // headquarters
        // watchtower by the gate
        const t = new THREE.Group();
        t.position.set(-1.0, 0, 3.4);
        c.root.add(t);
        for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]])
            box(t, mat(COL.trunk), 0.07, 1.4, 0.07, x, 0, z);
        box(t, wallMat(c, COL.trunk), 0.7, 0.35, 0.7, 0, 1.4, 0);
        part(t, GEO.cone4, roofMat(c, COL.olive), 0.9, 0.3, 0.9, 0, 1.75, 0);
        if (c.spec.night && !c.burnt) { // searchlight sweeping the wire
            const beam = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3, 12, 1, true).translate(0, -1.5, 0).rotateX(-Math.PI / 2), mat(0xfff3c8, { glow: 0xfff3c8, opacity: 0.18 }));
            beam.position.set(0, 1.6, 0);
            t.add(beam);
            c.ticks.push(tt => { beam.rotation.y = Math.sin(tt * 0.6) * 1.2; beam.rotation.x = 0.35; });
        }
        box(c.root, mat(COL.steel), 0.04, 1.6, 0.04, 1.9, 0, 0.7);
        const flag = box(c.root, mat(COL.troop), 0.42, 0.26, 0.02, 2.12, 1.32, 0.7);
        c.ticks.push(tt => { flag.rotation.y = Math.sin(tt * 2) * 0.3; });
        for (const x of [2.6, 3.3])
            vehicle(c, x, 1.6, Math.PI / 2, 'truck');
        c.yards.push([0.3, 0.7], [-0.6, 0.4], [1.0, 1.2], [-0.4, 1.3], [0.9, 0.2]);
        treeRing(c, 6, 4.5, 4.9);
    },
    depot(c) {
        ground(c, 0xa59f86);
        track(c, -5, 2.6, 5, 2.6);
        road(c, -5, 0.6, 5, 0.6, 0.6);
        for (const [x, z] of [[-1.9, -1.2], [0.7, -1.2]]) {
            const g = new THREE.Group();
            g.position.set(x, 0, z);
            c.root.add(g);
            box(g, wallMat(c, COL.wall3), 2.2, 0.6, 1.4);
            part(g, GEO.vault, roofMat(c, COL.roof2), 1.4, 0.8, 2.2, 0, 0.6, 0, Math.PI / 2);
            box(g, mat(COL.window), 0.7, 0.5, 0.02, 0, 0, 0.71);
        }
        for (const [x, z] of [[2.9, -1.9], [3.6, -0.7], [2.6, -3.0]]) { // fuel tanks
            part(c.root, GEO.cyl, wallMat(c, COL.white), 1.0, 0.9, 1.0, x, 0, z);
            part(c.root, GEO.dome, roofMat(c, COL.steel), 1.0, 0.25, 1.0, x, 0.9, z);
        }
        for (let i = 0; i < 7; i++) { // stacks of crates
            const x = -3.4 + (i % 4) * 0.45, z = 1.5 + Math.floor(i / 4) * 0.45;
            box(c.root, wallMat(c, COL.trunk), 0.4, 0.35, 0.4, x, 0, z);
            if (c.rnd() < 0.5)
                box(c.root, wallMat(c, COL.khaki), 0.38, 0.33, 0.38, x, 0.35, z);
        }
        vehicle(c, 1.4, 1.5, 0, 'truck');
        if (!c.burnt)
            wagons(c, -1.5, 2.6, 3);
        c.yards.push([-0.6, 0.6], [1.4, 0.6], [-2.6, 0.6], [0.4, 1.6], [-0.6, -2.6]);
        treeRing(c, 5, 3.9, 4.6, (x, z) => z < -2.2 && x < 1.6);
    },
    hospital(c) {
        ground(c, COL.grass);
        road(c, -5, 1.9, 5, 1.9, 0.6);
        strip(c, 0xc8c2ae, 1.2, 1.2, 0, 1.0);
        // an H-shaped hospital: a central wing and two side wings
        block(c, 0, -1.0, 0, 2.6, 1.0, 1.3, COL.wall1);
        block(c, -1.7, -1.0, 0, 0.9, 2.4, 1.6, COL.wall1);
        block(c, 1.7, -1.0, 0, 0.9, 2.4, 1.6, COL.wall1);
        box(c.root, mat(COL.white), 1.0, 0.08, 0.6, 0, 0.55, -0.25); // entrance canopy
        // a green first-aid cross on the front
        if (!c.burnt) {
            const sm = mat(0x3f8f5a, { glow: c.spec.night ? 0x2f7f4a : undefined });
            box(c.root, sm, 0.42, 0.13, 0.03, 0, 1.0, -0.48);
            box(c.root, sm, 0.13, 0.42, 0.03, 0, 0.855, -0.48);
        }
        // helipad
        part(c.root, GEO.cyl, mat(0x4b4f50), 1.7, 0.03, 1.7, 2.9, 0, 2.9).castShadow = false;
        const hm = mat(COL.white);
        box(c.root, hm, 0.1, 0.04, 0.7, 2.65, 0.02, 2.9);
        box(c.root, hm, 0.1, 0.04, 0.7, 3.15, 0.02, 2.9);
        box(c.root, hm, 0.5, 0.04, 0.1, 2.9, 0.02, 2.9);
        // field tents for the overflow
        for (const [x, z] of [[-3.0, 2.9], [-1.8, 3.2], [-3.4, 1.0]]) {
            const g = new THREE.Group();
            g.position.set(x, 0, z);
            g.rotation.y = 0.2;
            c.root.add(g);
            part(g, GEO.gable, roofMat(c, COL.khaki), 1.0, 0.6, 1.2);
            box(g, mat(COL.char2), 0.3, 0.3, 0.02, 0, 0, 0.6); // the open flap
        }
        vehicle(c, 0.9, 1.3, Math.PI / 2, 'ambulance');
        vehicle(c, -0.9, 1.3, Math.PI / 2, 'ambulance');
        c.yards.push([0, 1.0], [-2.3, 2.0], [0.5, 2.6], [-1.2, 1.0], [1.4, 0.5]);
        treeRing(c, 7, 3.8, 4.6, (x, z) => z < 1.3 || x > 4);
    },
    farm(c) {
        ground(c, COL.grass);
        // strip fields on the north half
        for (let i = 0; i < 7; i++)
            strip(c, i % 2 ? COL.field1 : COL.field2, 0.95, 3.4 - Math.abs(i - 3) * 0.35, -3.0 + i * 1.0, -1.6 + Math.abs(i - 3) * 0.17, 0, 0.01);
        road(c, -5, 0.8, 5, 0.8, 0.5);
        const barn = new THREE.Group();
        barn.position.set(-1.6, 0, 2.3);
        c.root.add(barn);
        box(barn, wallMat(c, COL.brick), 2.0, 0.9, 1.3);
        part(barn, GEO.gable, roofMat(c, COL.roof2), 1.45, 0.7, 2.1, 0, 0.9, 0, Math.PI / 2);
        box(barn, mat(COL.char2), 0.6, 0.65, 0.02, 0, 0, 0.66);
        part(c.root, GEO.cyl, wallMat(c, COL.stone), 0.8, 1.8, 0.8, 0.2, 0, 2.8);
        if (!c.burnt)
            part(c.root, GEO.dome, mat(COL.steel), 0.8, 0.5, 0.8, 0.2, 1.8, 2.8);
        house(c, 2.0, 2.4, 0, 1.3, 0.9, 0.75, COL.wall1, COL.roof1);
        for (const [x, z] of [[1.0, 1.4], [1.4, 1.5], [3.4, 1.3]]) { // hay bales
            const b = part(c.root, GEO.cyl, mat(c.burnt ? COL.char : 0xc9b46a), 0.38, 0.4, 0.38, x, 0.19, z);
            b.rotation.z = Math.PI / 2;
            b.position.y = 0.19;
            b.position.x += 0.2;
        }
        for (let i = 0; i < 18; i++)
            box(c.root, mat(COL.trunk), 0.05, 0.3, 0.05, -4 + i * 0.45, 0, 0.35); // fence
        box(c.root, mat(COL.trunk), 8, 0.04, 0.03, -0.2, 0.22, 0.35);
        vehicle(c, -3.2, 1.8, 0.4, 'tractor');
        c.yards.push([0.4, 1.6], [-0.4, 1.4], [2.6, 1.5], [-2.8, 0.8], [0.6, 0.8]);
        treeRing(c, 6, 3.9, 4.6, (x, z) => z > 1.6);
    },
    junction(c) {
        ground(c, 0xa7a17f);
        track(c, -5, -0.4, 5, -0.4);
        track(c, -3.6, 3.6, 3.6, -3.6);
        // station building and a covered platform beside the main line
        strip(c, 0xc4bca4, 4.0, 0.7, -0.4, 0.45, 0, 0.04);
        box(c.root, mat(COL.stone), 4.0, 0.12, 0.7, -0.4, 0, 0.45);
        for (let i = 0; i < 5; i++)
            box(c.root, mat(COL.char2), 0.06, 0.65, 0.06, -2.2 + i * 0.9, 0.12, 0.6);
        box(c.root, roofMat(c, COL.roof2), 4.0, 0.06, 0.8, -0.4, 0.78, 0.45);
        const st = new THREE.Group();
        st.position.set(-0.6, 0, 1.6);
        c.root.add(st);
        box(st, wallMat(c, COL.brick), 2.0, 0.8, 1.0);
        part(st, GEO.gable, roofMat(c, COL.roof1), 1.15, 0.45, 2.1, 0, 0.8, 0, Math.PI / 2);
        windows(c, st, 2.0, 0.8, 1.0, 1);
        // water tower and a signal
        const wt = new THREE.Group();
        wt.position.set(2.8, 0, 1.4);
        c.root.add(wt);
        for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]])
            box(wt, mat(COL.trunk), 0.07, 1.1, 0.07, x, 0, z);
        part(wt, GEO.cyl, wallMat(c, COL.trunk), 0.8, 0.6, 0.8, 0, 1.1);
        part(wt, GEO.cone6, roofMat(c, COL.roof2), 0.9, 0.3, 0.9, 0, 1.7);
        box(c.root, mat(COL.char2), 0.06, 1.2, 0.06, 2.1, 0, -1.0);
        box(c.root, mat(COL.blood, { glow: c.spec.night ? COL.blood : undefined }), 0.16, 0.1, 0.05, 2.1, 1.12, -0.97);
        if (!c.burnt)
            loco(c, 1.4, -0.4);
        for (const [x, z] of [[-3.0, -2.2], [-1.8, -2.6], [2.4, 2.9], [-3.4, 1.9]])
            house(c, x, z, c.rnd() * 0.3, 0.8, 0.65, 0.55, COL.wall2, COL.roof3);
        c.yards.push([-1.6, 0.45], [-0.4, 0.45], [0.8, 0.45], [0.6, 2.4], [-2.0, 1.0]);
        treeRing(c, 6, 3.9, 4.6, (x, z) => Math.abs(z + 0.4) > 0.8 && Math.abs(x + z) > 1);
    },
};
/** A small freighter moored along the quay, bobbing on the swell. */
function ship(c) {
    const g = new THREE.Group();
    g.position.set(0.2, -0.32, 2.3);
    c.root.add(g);
    const s = new THREE.Shape();
    s.moveTo(-2.3, -0.55);
    s.lineTo(1.5, -0.55);
    s.lineTo(2.4, 0);
    s.lineTo(1.5, 0.55);
    s.lineTo(-2.3, 0.55);
    s.lineTo(-2.3, -0.55);
    const hullGeo = shipHull !== null && shipHull !== void 0 ? shipHull : (shipHull = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.15, 0));
    const hull = new THREE.Mesh(hullGeo, mat(COL.hull));
    hull.castShadow = true;
    g.add(hull);
    box(g, mat(COL.blood), 4.6, 0.08, 1.12, -0.4, -0.04, 0); // waterline
    box(g, mat(0x8f8a7c), 3.6, 0.04, 1.0, -0.3, 0.55, 0); // deck
    const bridge = new THREE.Group();
    bridge.position.set(-1.6, 0.59, 0);
    g.add(bridge);
    box(bridge, mat(COL.white), 1.0, 0.6, 0.85);
    box(bridge, mat(COL.white), 0.7, 0.3, 0.7, 0, 0.6, 0);
    windows(c, bridge, 1.0, 0.6, 0.85, 1);
    part(g, GEO.cyl, mat(COL.char2), 0.3, 0.6, 0.3, -0.8, 0.59, 0);
    part(g, GEO.cyl, mat(COL.amber), 0.31, 0.12, 0.31, -0.8, 1.04, 0);
    box(g, mat(COL.steel), 0.05, 1.2, 0.05, 1.3, 0.59, 0);
    for (const x of [0.1, 0.8])
        box(g, mat(COL.troop), 0.55, 0.35, 0.8, x, 0.59, 0); // containers
    // gangway down to the quay
    const gw = box(c.root, mat(COL.steel), 0.25, 0.04, 1.2, -0.6, 0.1, 1.45);
    gw.rotation.x = -0.25;
    c.ticks.push(t => { g.position.y = -0.32 + Math.sin(t * 1.1) * 0.04; g.rotation.x = Math.sin(t * 0.9) * 0.02; });
}
let shipHull = null;
function vehicle(c, x, z, ry, kind) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    c.root.add(g);
    const burnt = c.burnt && kind !== 'tank';
    const body = burnt ? COL.char : { truck: COL.olive, ambulance: COL.white, tractor: COL.blood, tank: COL.olive, bus: COL.amber }[kind];
    for (const sx of [-0.25, 0.25])
        for (const sz of [-0.17, 0.17]) {
            const w = part(g, GEO.cyl, mat(COL.char2), 0.16, 0.08, 0.16, sx, 0.08, sz);
            w.rotation.x = Math.PI / 2;
            w.position.z = sz * 1.15;
        }
    if (kind === 'tank') {
        box(g, mat(COL.char2), 0.9, 0.16, 0.5);
        box(g, mat(body), 0.85, 0.16, 0.44, 0, 0.14, 0);
        part(g, GEO.cyl6, mat(body), 0.34, 0.14, 0.34, -0.05, 0.3, 0);
        box(g, mat(body), 0.5, 0.05, 0.05, 0.3, 0.37, 0);
    }
    else if (kind === 'tractor') {
        box(g, mat(body), 0.5, 0.2, 0.3, 0, 0.08, 0);
        box(g, mat(COL.window), 0.22, 0.24, 0.26, -0.1, 0.28, 0);
    }
    else {
        const len = kind === 'bus' ? 1.2 : 0.75;
        box(g, mat(body), len, 0.3, 0.38, 0, 0.08, 0);
        box(g, mat(kind === 'truck' ? COL.khaki : body), len * 0.62, 0.18, 0.4, -len * 0.18, 0.38, 0);
        if (kind === 'ambulance' && !burnt)
            box(g, mat(COL.blood), len * 0.6, 0.05, 0.39, -len * 0.18, 0.28, 0);
        if (kind === 'bus')
            box(g, mat(COL.window), len * 0.9, 0.1, 0.39, 0, 0.26, 0);
    }
    return g;
}
/** A row of goods wagons on the depot siding. */
function wagons(c, x, z, n) {
    for (let i = 0; i < n; i++) {
        box(c.root, mat(i % 2 ? COL.roof3 : COL.brick), 1.0, 0.45, 0.42, x + i * 1.1, 0.1, z);
    }
}
/** A tank engine waiting at the junction. */
function loco(c, x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0.1, z);
    c.root.add(g);
    const boiler = part(g, GEO.cyl, mat(COL.char2), 0.42, 1.0, 0.42, 0.7, 0.25, 0);
    boiler.rotation.z = Math.PI / 2; // lies along the track, from x = 0.7 back to the cab
    box(g, mat(COL.char2), 0.45, 0.55, 0.44, -0.5, 0.0, 0);
    box(g, mat(COL.blood), 1.4, 0.1, 0.46, 0, 0, 0);
    part(g, GEO.cyl, mat(COL.char2), 0.12, 0.25, 0.12, 0.45, 0.45, 0);
    if (c.spec.state === 'secure' || c.spec.state === 'threat')
        puff(c, x + 0.45, 0.85, z, 0xe7e2d6, 0.7);
}

// ---- life.ts ----
// Everything that changes turn to turn: troops, sandbags, the infected, civilians,
// refugee columns, the crowd on the quay, smoke and fire.
/** Where refugees walk out of each place: from the first point to the second. */
const EXIT = {
    town: [[0.6, 0.2], [4.8, 0.2]],
    city: [[0, 1.5], [4.8, 1.5]],
    capital: [[0, 2.9], [4.8, 2.9]],
    port: [[-3.4, -0.6], [-0.6, 1.0]],
    base: [[0.3, 1.2], [0.3, 4.8]],
    depot: [[-0.6, 0.6], [4.8, 0.6]],
    hospital: [[0, 1.9], [4.8, 1.9]],
    farm: [[0.4, 0.8], [4.8, 0.8]],
    junction: [[-2.2, 0.45], [1.6, 0.45]],
};
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
function populate(c) {
    const s = c.spec, infected = s.H >= 0.5, dead = s.state === 'fallen';
    if (s.F > 0)
        sandbags(c, s.F);
    else if (s.state === 'threat')
        barricade(c);
    if (s.T >= 0.05 && !dead)
        troops(c, clampN(s.T, 1, 6), infected);
    if (infected)
        zombies(c, clampN(2 + Math.sqrt(s.H) * 1.3, 2, 26), s.state === 'holding');
    if (!c.ghost && !dead && s.pop >= 1) {
        if (s.evac)
            refugees(c, clampN(4 + Math.sqrt(s.pop) * 0.5, 4, 12));
        else
            bystanders(c, clampN(Math.sqrt(s.pop) * 0.6, 1, 8), infected);
    }
    if (s.type === 'port' && s.queue >= 0.5 && !dead)
        quayCrowd(c, clampN(Math.sqrt(s.queue) * 1.6, 2, 22));
    if (s.state === 'holding')
        for (let i = 0; i < 2; i++) {
            const [x, z] = spot(c, 1, 3.5);
            puff(c, x, 0.4, z, 0x8d8a82, 0.8);
        }
    if (s.state === 'losing')
        for (let i = 0; i < 3; i++) {
            const [x, z] = spot(c, 0.5, 3.5);
            fire(c, x, z);
            puff(c, x, 0.5, z, 0x3d3a36, 1.1);
        }
    if (dead)
        for (let i = 0; i < 4; i++) {
            const [x, z] = spot(c, 0, 3.8);
            if (i < 2)
                fire(c, x, z, 0.6);
            puff(c, x, 0.3, z, 0x2e2c2a, 1.3);
        }
}
/** Sandbag walls across the approaches, one course per fortification level. */
function sandbags(c, level) {
    const m = mat(COL.sand), r = 3.15;
    for (const a0 of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        if (c.spec.type === 'port' && Math.sin(a0) > 0.1)
            continue; // no walls in the harbour
        for (let k = 0; k < level; k++) {
            for (let a = a0 - 0.42 + (k % 2) * 0.05; a <= a0 + 0.42; a += 0.11) {
                box(c.root, m, 0.32, 0.13, 0.2, Math.cos(a) * r, k * 0.13, Math.sin(a) * r, -a + Math.PI / 2);
            }
        }
    }
}
/** Striped road barriers where the danger will come from. */
function barricade(c) {
    const [, [x, z]] = EXIT[c.spec.type];
    const a = Math.atan2(z, x), bx = Math.cos(a) * 3.4, bz = Math.sin(a) * 3.4;
    const g = new THREE.Group();
    g.position.set(bx, 0, bz);
    g.rotation.y = -a + Math.PI / 2;
    c.root.add(g);
    for (const ox of [-0.4, 0.4]) {
        box(g, mat(COL.char2), 0.05, 0.3, 0.05, ox, 0, 0);
    }
    for (let i = 0; i < 4; i++)
        box(g, mat(i % 2 ? COL.white : COL.blood), 0.25, 0.1, 0.05, -0.375 + i * 0.25, 0.28, 0);
}
/** Legs swing as a figure walks; phase offsets keep a crowd out of step. */
function stride(f, t, speed) {
    const a = Math.sin(t * speed) * 0.5;
    f.legs[0].rotation.x = a;
    f.legs[1].rotation.x = -a;
}
function troops(c, battalions, fighting) {
    for (let b = 0; b < battalions; b++) {
        const [cx, cz] = b < c.yards.length ? c.yards[b] : spot(c, 1.5, 3);
        const face = Math.atan2(cx, cz) + (c.rnd() - 0.5) * 0.6; // face outward, toward the threat
        for (let i = 0; i < 3; i++) {
            const f = person(COL.troop, { helmet: COL.olive, head: COL.skin });
            const ox = (i - 1) * 0.28, oz = i === 1 ? -0.15 : 0;
            f.g.position.set(cx + Math.cos(face) * ox + Math.sin(face) * oz, 0, cz - Math.sin(face) * ox + Math.cos(face) * oz);
            f.g.rotation.y = face;
            box(f.g, mat(COL.char2), 0.04, 0.04, 0.3, 0.08, 0.26, 0.12); // rifle
            c.root.add(f.g);
            if (fighting) { // muzzle flashes
                const flash = box(f.g, mat(COL.glow, { glow: COL.glow }), 0.08, 0.08, 0.08, 0.08, 0.24, 0.32);
                flash.castShadow = false;
                const ph = c.rnd() * 10;
                c.ticks.push(t => { flash.visible = Math.sin(t * 9 + ph) > 0.85; });
            }
        }
        if (b % 2 === 1)
            vehicle(c, cx + Math.sin(face) * -0.7, cz + Math.cos(face) * -0.7, face + Math.PI / 2, c.spec.type === 'base' || battalions >= 4 ? 'tank' : 'truck');
    }
}
function zombies(c, n, heldOff) {
    const shirts = [COL.zedShirt, 0x5b6470, 0x7a6a50, 0x4d5a4a, COL.blood];
    for (let i = 0; i < n; i++) {
        const f = person(shirts[Math.floor(c.rnd() * shirts.length)], { head: COL.zed });
        for (const side of [-1, 1])
            box(f.g, mat(COL.zed), 0.05, 0.05, 0.24, side * 0.09, 0.27, 0.1); // arms out in front
        c.root.add(f.g);
        const a0 = c.rnd() * Math.PI * 2, ph = c.rnd() * 20, sp = 0.05 + c.rnd() * 0.05, lean = 0.15 + c.rnd() * 0.2;
        f.g.rotation.z = (c.rnd() - 0.5) * 0.2;
        if (heldOff) {
            // a held place: they keep coming in from the rim and are cut down at the wire
            const r0 = 4.6, r1 = 3.4;
            c.ticks.push(t => {
                const u = ((t * sp + ph) % 1);
                const r = r0 - (r0 - r1) * u, a = a0 + Math.sin(t * 0.3 + ph) * 0.05;
                f.g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
                f.g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
                f.g.rotation.x = lean;
                f.g.visible = u < 0.94;
                stride(f, t + ph, 3);
            });
        }
        else {
            // overrun: they wander the streets
            const [hx, hz] = spot(c, 0.3, 4.2);
            c.ticks.push(t => {
                const a = t * 0.25 * (i % 2 ? 1 : -1) + ph;
                const x = hx + Math.cos(a) * 0.35, z = hz + Math.sin(a * 1.3) * 0.35;
                f.g.rotation.y = Math.atan2(x - f.g.position.x, z - f.g.position.z) || f.g.rotation.y;
                f.g.position.set(x, 0, z);
                f.g.rotation.x = lean;
                stride(f, t + ph, 2.5);
            });
        }
    }
}
const civColor = (c) => [COL.civ, COL.civ2, COL.civ3, COL.wall3][Math.floor(c.rnd() * 4)];
function bystanders(c, n, scared) {
    for (let i = 0; i < n; i++) {
        const f = person(civColor(c));
        const [x, z] = spot(c, 0.5, 2.5);
        f.g.position.set(x, 0, z);
        f.g.rotation.y = c.rnd() * 6;
        c.root.add(f.g);
        const ph = c.rnd() * 10;
        if (scared)
            c.ticks.push(t => { f.g.rotation.y = Math.sin(t * 2 + ph) * 1.5; });
    }
}
/** A column of refugees walking out along the exit road, with a bus at its head. */
function refugees(c, n) {
    const [[x1, z1], [x2, z2]] = EXIT[c.spec.type];
    const dir = Math.atan2(x2 - x1, z2 - z1);
    vehicle(c, x1 + (x2 - x1) * 0.82, z1 + (z2 - z1) * 0.82, dir - Math.PI / 2, 'bus');
    for (let i = 0; i < n; i++) {
        const f = person(civColor(c), { scale: c.rnd() < 0.25 ? 0.7 : 1 }); // some children
        if (c.rnd() < 0.5)
            box(f.g, mat(COL.trunk), 0.16, 0.14, 0.1, 0.12, 0.12, 0); // a suitcase
        f.g.rotation.y = dir;
        c.root.add(f.g);
        const off = (c.rnd() - 0.5) * 0.35, ph = i / n;
        c.ticks.push(t => {
            const u = (t * 0.04 + ph) % 1;
            f.g.position.set(x1 + (x2 - x1) * u * 0.75 + Math.cos(dir) * off, 0, z1 + (z2 - z1) * u * 0.75 - Math.sin(dir) * off);
            stride(f, t + ph * 7, 6);
        });
    }
}
/** People waiting on the quay for the next ship, facing the water. */
function quayCrowd(c, n) {
    for (let i = 0; i < n; i++) {
        const f = person(civColor(c), { scale: c.rnd() < 0.2 ? 0.7 : 1 });
        f.g.position.set(-3.3 + c.rnd() * 5.4, 0, 0.25 + c.rnd() * 0.8);
        f.g.rotation.y = (c.rnd() - 0.5) * 0.8;
        c.root.add(f.g);
        const ph = c.rnd() * 10;
        c.ticks.push(t => { f.g.position.y = Math.max(0, Math.sin(t * 1.5 + ph)) * 0.02; });
    }
}
/** A rising column of smoke: a few puffs that drift up, grow and fade, then start again. */
function puff(c, x, y, z, color, size) {
    const balls = [];
    const m = mat(color, { opacity: 0.55 });
    for (let i = 0; i < 5; i++) {
        const b = part(c.root, GEO.ball, m, 1, 1, 1, x, y, z);
        b.castShadow = false;
        b.receiveShadow = false;
        balls.push(b);
    }
    const ph = c.rnd() * 5;
    c.ticks.push(t => {
        balls.forEach((b, i) => {
            const u = ((t * 0.12 + ph + i / balls.length) % 1);
            const s = size * (0.25 + u * 0.9);
            b.scale.set(s, s, s);
            b.position.set(x + Math.sin(u * 3 + ph) * 0.3 + u * 0.6, y + u * 2.6, z + u * 0.2);
        });
    });
}
function fire(c, x, z, size = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    c.root.add(g);
    const outer = part(g, GEO.cone6, mat(0xe2642a, { glow: 0xc4432f }), 0.45 * size, 0.6 * size, 0.45 * size);
    const inner = part(g, GEO.cone6, mat(COL.glow, { glow: COL.amber }), 0.25 * size, 0.4 * size, 0.25 * size);
    outer.castShadow = inner.castShadow = false;
    const ph = c.rnd() * 10;
    c.ticks.push(t => {
        const f = 1 + Math.sin(t * 13 + ph) * 0.15 + Math.sin(t * 7.3 + ph) * 0.1;
        outer.scale.y = 0.6 * size * f;
        inner.scale.y = 0.4 * size * (2 - f);
        g.rotation.y = t * 0.8;
    });
}

// ---- viewer.ts ----
// One shared WebGL renderer. The game calls LBModels.show(box, spec) on every render; the model
// is rebuilt only when what it shows has changed, and frames are drawn only while it is on screen.
(() => {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    }
    catch (e) {
        return; // no WebGL: the game simply shows no 3D view
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
    const hemi = new THREE.HemisphereLight(0xfff5e0, 0x5a5a48, 0.62);
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
    sun.position.set(6, 11, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    sun.shadow.bias = -0.002;
    scene.add(hemi, sun);
    const turntable = new THREE.Group();
    scene.add(turntable);
    const shared = new Set([...Object.values(GEO), ...Object.values(GROUND)]);
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let key = '', root = null, ticks = [];
    let running = false, last = 0, clock = 0, spin = 0, dragging = false, dragX = 0, w = 0, h = 0;
    function build(spec) {
        if (root) {
            turntable.remove(root);
            root.traverse(o => { const g = o.geometry; if (g && !shared.has(g) && g !== shipHull)
                g.dispose(); });
        }
        const dead = spec.state === 'fallen', ghost = spec.state === 'cleared' || (spec.pop < 1 && spec.queue < 0.5);
        const c = {
            root: new THREE.Group(), spec, rnd: seeded(spec.id), lrnd: seeded(spec.id + '/lights'), ticks: [],
            burnt: dead, ghost, lit: spec.night && !dead && !ghost, yards: [],
        };
        BUILD[spec.type](c);
        c.rnd = seeded(`${spec.id}/${spec.state}`); // people and effects draw from their own stream
        populate(c);
        root = c.root;
        ticks = c.ticks;
        turntable.add(root);
        // light for the hour: warm sun by day, cold moonlight at night
        if (spec.night) {
            hemi.color.set(0x6f86b0);
            hemi.groundColor.set(0x1d2230);
            hemi.intensity = 0.7;
            sun.color.set(0xa9bde6);
            sun.intensity = 0.55;
        }
        else {
            hemi.color.set(0xfff5e0);
            hemi.groundColor.set(0x5a5a48);
            hemi.intensity = 0.62;
            sun.color.set(0xfff1d6);
            sun.intensity = 0.85;
        }
    }
    function size(box) {
        const r = box.getBoundingClientRect(), nw = Math.round(r.width), nh = Math.round(r.height);
        if (nw === w && nh === h)
            return;
        w = nw;
        h = nh;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        // pull back on narrow boxes so the whole diorama fits
        const dist = 15.5 + Math.max(0, 2 - camera.aspect) * 7;
        camera.position.set(0, dist * 0.62, dist * 0.78);
        camera.lookAt(0, 0.5, 0);
        camera.updateProjectionMatrix();
    }
    function draw() {
        for (const t of ticks)
            t(clock, 0);
        turntable.rotation.y = spin;
        renderer.render(scene, camera);
    }
    function frame(now) {
        if (!running)
            return;
        if (!canvas.isConnected || canvas.offsetParent === null || document.hidden) {
            running = false;
            return;
        }
        const dt = Math.min(0.1, (now - last) / 1000 || 0);
        last = now;
        if (!still.matches) {
            clock += dt;
            if (!dragging)
                spin += dt * 0.12;
        }
        draw();
        requestAnimationFrame(frame);
    }
    function start() {
        if (still.matches) {
            draw();
            return;
        } // reduced motion: one still frame, redrawn on drag
        if (running)
            return;
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
    }
    canvas.addEventListener('pointerdown', e => { dragging = true; dragX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', e => {
        if (!dragging)
            return;
        spin += (e.clientX - dragX) * 0.01;
        dragX = e.clientX;
        if (still.matches)
            draw();
    });
    const drop = () => { dragging = false; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && canvas.isConnected)
        start(); });
    const api = {
        show(box, spec) {
            const k = [spec.id, spec.type, spec.state, spec.night, spec.evac, Math.round(spec.T), spec.F,
                clampN(Math.sqrt(spec.H) * 1.3, 0, 26), clampN(Math.sqrt(spec.pop) * 0.6, 0, 12), clampN(Math.sqrt(spec.queue) * 1.6, 0, 22)].join('|');
            if (k !== key) {
                if (spec.id !== key.split('|')[0])
                    spin = 0.5; // a new place starts from the same three-quarter view
                key = k;
                build(spec);
            }
            if (canvas.parentElement !== box)
                box.appendChild(canvas);
            size(box);
            start();
        },
        hide() { running = false; canvas.remove(); },
    };
    window.LBModels = api;
    document.documentElement.classList.add('has3d');
    document.dispatchEvent(new Event('lbmodels:ready'));
})();

})();
