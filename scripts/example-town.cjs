'use strict';
// Worked example: small town via the hierarchical / road-first workflow.
// L2 streets = growRoads; L3 houses = plotsAlongRoad; L4 body/doors/windows/decor
// built in the safe order with forbidden zones; L5 attached decor last.
// Ends with the "blind builder" programmatic checks (no visual reliance).
const C = require('./city.cjs');
const K = require('./checks.cjs');
const { hollowBox, gableRoof, door } = require('./litematic.cjs');

const GY = 2; // ground top / floor level

function house(a, p, pal, forbidden, decor, windows) {
  const { x, z, w, d } = p, x2 = x + w - 1, z2 = z + d - 1;
  // 1) body structure + material FIRST
  a.box(x, GY, z, x2, GY, z2, pal.floor);
  hollowBox(a, x, GY + 1, z, x2, GY + 4, z2, pal.wall);
  gableRoof(a, x - 1, z - 1, x2 + 1, z2 + 1, GY + 5, pal.roof);
  // 2) door + circulation forbidden zone
  let dx = x + Math.floor(w / 2), dz = z2, fx = p.facing;
  if (p.facing === 'north') dz = z; else if (p.facing === 'west') { dx = x; dz = z + Math.floor(d / 2); } else if (p.facing === 'east') { dx = x2; dz = z + Math.floor(d / 2); }
  door(a, dx, GY + 1, dz, fx, 'minecraft:oak_door');
  K.markRect(a, forbidden, dx, GY + 1, dz, dx, GY + 3, dz);
  const ix = fx === 'west' ? 1 : fx === 'east' ? -1 : 0, iz = fx === 'north' ? 1 : fx === 'south' ? -1 : 0;
  for (let s = 1; s <= 3; s++) K.markRect(a, forbidden, dx + ix * s, GY + 1, dz + iz * s, dx + ix * s, GY + 3, dz + iz * s);
  // 3) wall windows (faces only, inset from corners) + window forbidden zone
  for (const wx of [x + 2, x + w - 3]) for (const wz of [z, z2]) for (let wy = GY + 2; wy <= GY + 3; wy++) {
    a.set(wx, wy, wz, 'minecraft:glass'); windows.push([wx, wy, wz]);
    K.markRect(a, forbidden, wx, wy, wz, wx, wy, wz);
  }
  // 4) decor AFTER structure is final; never overwrite structure / forbidden
  const base = a.grid.slice();
  const put = (X, Y, Z, n, pr) => { if (K.decorSet(a, base, forbidden, X, Y, Z, n, pr)) decor.push([X, Y, Z]); };
  for (const [cx, cz] of [[x + 1, z + 1], [x2 - 1, z + 1], [x + 1, z2 - 1], [x2 - 1, z2 - 1]]) put(cx, GY + 1, cz, 'minecraft:hay_block');
  put(x - 1, GY + 1, z + 2, 'minecraft:oak_log'); put(x - 1, GY + 2, z + 2, 'minecraft:oak_log');
  put(x + 2, GY + 6, z - 1, 'minecraft:moss_carpet');
  // 5) attached small decor LAST, on top of the piles
  put(x - 1, GY + 3, z + 2, 'minecraft:lantern', { hanging: 'false' });
}

module.exports = {
  name: 'growth_town',
  desc: 'Road-first growth town: districts, plots, safe build order, blind checks',
  size: [72, 20, 72],
  build(a) {
    a.box(0, 0, 0, a.sx - 1, GY, a.sz - 1, 'minecraft:dirt');
    a.box(0, GY, 0, a.sx - 1, GY, a.sz - 1, 'minecraft:grass_block');
    const { road } = C.growRoads(a.sx, a.sz, { seed: 11, steps: 600, width: 3, branch: 0.12 });
    for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) if (road[z * a.sx + x]) a.set(x, GY, z, (x + z) % 4 === 0 ? 'minecraft:andesite' : 'minecraft:gravel');
    const plots = C.plotsAlongRoad(road, a.sx, a.sz, { w: 9, d: 8, gap: 3, seed: 21 });
    const forbidden = K.makeMask(a), decor = [], windows = [];
    plots.forEach((p, i) => house(a, p, C.districtPalette(i), forbidden, decor, windows));
    const r = K.runChecks(a, { decor, windows, forbidden });
    console.log(`[town] plots=${plots.length} decor=${decor.length} windows=${windows.length} connected=${r.connected} stateIssues=${r.stateIssues} floating=${r.floating.length} badWindows=${r.badWindows.length} checksOK=${r.ok}`);
  },
};