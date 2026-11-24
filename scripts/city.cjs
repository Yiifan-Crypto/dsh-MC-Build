'use strict';
// City-scale layout (Level 0-3 of the decomposition tower).
// Road-first GROWTH layout: seed a road, extend with random turns + branches,
// then place house plots along the roads. Hue unity is enforced per district by
// handing every house in a district the same converged palette.
const { rng } = require('./scenery.cjs');

// road: Uint8Array(sx*sz). Walkers persist direction (organic, 7-block rule) and
// occasionally turn / spawn a branch.
function growRoads(sx, sz, o = {}) {
  const rand = rng(o.seed ?? 11);
  const width = o.width ?? 3, steps = o.steps ?? 120, branch = o.branch ?? 0.12;
  const road = new Uint8Array(sx * sz);
  const start = o.start || [Math.floor(sx / 2), Math.floor(sz / 2)];
  const stamp = (x, z) => { for (let dz = -Math.floor(width / 2); dz <= Math.floor(width / 2); dz++) for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) { const X = x + dx, Z = z + dz; if (X >= 1 && Z >= 1 && X < sx - 1 && Z < sz - 1) road[Z * sx + X] = 1; } };
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let walkers = [{ x: start[0], z: start[1], d: Math.floor(rand() * 4) }];
  stamp(start[0], start[1]);
  for (let i = 0; i < steps && walkers.length; i++) {
    const w = walkers[Math.floor(rand() * walkers.length)];
    if (rand() < 0.3) w.d = (w.d + (rand() < 0.5 ? 1 : 3)) % 4;      // turn
    const nx = w.x + D[w.d][0], nz = w.z + D[w.d][1];
    if (nx < 2 || nz < 2 || nx >= sx - 2 || nz >= sz - 2) { w.d = (w.d + 1) % 4; continue; }
    w.x = nx; w.z = nz; stamp(nx, nz);
    if (rand() < branch && walkers.length < 8) walkers.push({ x: nx, z: nz, d: (w.d + (rand() < 0.5 ? 1 : 3)) % 4 });
    if (walkers.length > 1 && rand() < 0.08) walkers = walkers.filter(v => v !== w); // terminate a branch, never the last
  }
  return { road, width };
}

// House plots adjacent to a road, non-overlapping, front facing the road.
function plotsAlongRoad(road, sx, sz, o = {}) {
  const w = o.w ?? 9, d = o.d ?? 8, gap = o.gap ?? 3, rand = rng(o.seed ?? 21);
  const isRoad = (x, z) => x >= 0 && z >= 0 && x < sx && z < sz && road[z * sx + x];
  const plots = [];
  const free = (x, z, W, D) => { for (let Z = z; Z < z + D; Z++) for (let X = x; X < x + W; X++) { if (X < 1 || Z < 1 || X >= sx - 1 || Z >= sz - 1) return false; if (isRoad(X, Z)) return false; } return true; };
  const touches = (x, z, W, D) => {
    for (let Z = z; Z < z + D; Z++) if (isRoad(x - 1, Z) || isRoad(x + W, Z)) return true;
    for (let X = x; X < x + W; X++) if (isRoad(X, z - 1) || isRoad(X, z + D)) return true;
    return false;
  };
  for (let z = 2; z < sz - d - 2; z += 4) for (let x = 2; x < sx - w - 2; x += 4) {
    const jx = x + Math.floor(rand() * 2), jz = z + Math.floor(rand() * 2);
    if (!free(jx, jz, w, d) || !touches(jx, jz, w, d)) continue;
    if (plots.some(p => !(jx + w + 1 < p.x || p.x + p.w + 1 < jx || jz + d + 1 < p.z || p.z + p.d + 1 < jz))) continue;
    let facing = 'south';
    const edgeN = Array.from({ length: w }, (_, k) => isRoad(jx + k, jz - 1)).some(Boolean);
    const edgeS = Array.from({ length: w }, (_, k) => isRoad(jx + k, jz + d)).some(Boolean);
    const edgeW = Array.from({ length: d }, (_, k) => isRoad(jx - 1, jz + k)).some(Boolean);
    const edgeE = Array.from({ length: d }, (_, k) => isRoad(jx + w, jz + k)).some(Boolean);
    if (edgeN) facing = 'north'; else if (edgeW) facing = 'west'; else if (edgeE) facing = 'east'; else if (edgeS) facing = 'south';
    plots.push({ x: jx, z: jz, w, d, facing });
  }
  return plots;
}

// Hue-converged palettes: one family per district, no clashing light/dark mixes.
const FAMILIES = [
  { wall: 'minecraft:stone_bricks', roof: 'minecraft:dark_oak_planks', trim: 'minecraft:mossy_stone_bricks', floor: 'minecraft:spruce_planks' },
  { wall: 'minecraft:stone_bricks', roof: 'minecraft:spruce_planks', trim: 'minecraft:cobblestone', floor: 'minecraft:oak_planks' },
  { wall: 'minecraft:sandstone', roof: 'minecraft:oak_planks', trim: 'minecraft:cut_sandstone', floor: 'minecraft:birch_planks' },
  { wall: 'minecraft:bricks', roof: 'minecraft:dark_oak_planks', trim: 'minecraft:stone_bricks', floor: 'minecraft:spruce_planks' },
];
function districtPalette(seed) { return FAMILIES[Math.abs(seed | 0) % FAMILIES.length]; }

module.exports = { growRoads, plotsAlongRoad, districtPalette, FAMILIES };