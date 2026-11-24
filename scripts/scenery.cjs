'use strict';
// Aesthetic scenery primitives for build-litematic.
// Implements the Phase 2-O (open structures) and Phase 2-N (nature) hard rules:
// 7-block organic rule, double-layer base, hue-converged material mixing, asymmetry,
// arch keystone/cutwaters, tower taper/cornice, plaza anchor, ruins collapse logic,
// L-system-ish layered canopies. All functions take an Arena `a` and place blocks.
// Deterministic: every random choice is seeded, so a build is reproducible.

// ---------------- seeded noise ----------------
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function noise2(seed) {
  const hash = (x, z) => { let h = (x | 0) * 374761393 + (z | 0) * 668265263 + (seed | 0) * 144665; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  return (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const A = hash(ix, iz), B = hash(ix + 1, iz), C = hash(ix, iz + 1), D = hash(ix + 1, iz + 1);
    const u = sm(fx), v = sm(fz);
    return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v;
  };
}
function fbm(n, x, z, oct = 4) { let amp = 1, f = 1, sum = 0, norm = 0; for (let i = 0; i < oct; i++) { sum += amp * n(x * f, z * f); norm += amp; amp *= 0.5; f *= 2; } return sum / norm; }
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

// ---------------- Phase 2-N: terrain heightfield ----------------
// Asymmetric hills via domain-warped fbm + optional background ridge.
// Double-layer base (>=2 sub blocks under every surface) + hue-converged surface mix.
function terrain(a, o = {}) {
  const seed = o.seed ?? 1, base = o.base ?? 6, amp = o.amp ?? 10, scale = o.scale ?? 0.045;
  const ridge = o.ridge ?? 0, ridgeStart = o.ridgeStart ?? 0.6, warp = o.warp ?? 10;
  const rock = o.rock || ['minecraft:stone', 'minecraft:andesite', 'minecraft:diorite'];
  const sub = o.sub || ['minecraft:dirt', 'minecraft:coarse_dirt'];
  const surf = o.surface || ['minecraft:grass_block', 'minecraft:grass_block', 'minecraft:grass_block', 'minecraft:moss_block', 'minecraft:coarse_dirt', 'minecraft:podzol'];
  const n = noise2(seed), n2 = noise2(seed + 101), nm = noise2(seed + 202), nr = noise2(seed + 303);
  const alpine = o.alpine ?? Infinity;
  const alpineSurf = ['minecraft:stone', 'minecraft:andesite', 'minecraft:snow_block'];
  const H = new Int32Array(a.sx * a.sz);
  for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const wx = x + (n2(x * 0.04, z * 0.04) - 0.5) * warp;
    const wz = z + (n2(x * 0.04 + 50, z * 0.04 + 50) - 0.5) * warp;
    let v = fbm(n, wx * scale, wz * scale, 4);
    const bg = clamp((z / a.sz - ridgeStart) / (1 - ridgeStart), 0, 1);
    const bgs = bg * bg * (3 - 2 * bg);
    let h = base + amp * v + ridge * bgs * (0.5 + 0.5 * nr(x * 0.03, z * 0.03));
    h = clamp(Math.round(h), 1, a.sy - 8);
    H[z * a.sx + x] = h;
    const high = h >= alpine;
    for (let y = 0; y <= h; y++) {
      let name;
      if (y <= h - 3) name = rock[Math.floor(nr(x * 0.2 + y, z * 0.2) * rock.length) % rock.length];
      else if (y <= h - 1) name = high ? rock[Math.floor(nr(x * 0.2, z * 0.2 + y) * rock.length) % rock.length] : sub[Math.floor(nm(x * 0.3, z * 0.3 + y) * sub.length) % sub.length];
      else name = high ? alpineSurf[Math.floor(nr(x * 0.25, z * 0.25) * alpineSurf.length) % alpineSurf.length] : surf[Math.floor(nm(x * 0.15, z * 0.15) * surf.length) % surf.length];
      a.set(x, y, z, name);
    }
  }
  return { H, heightAt: (x, z) => H[z * a.sx + x] };
}

// Carve a winding river (7-block rule: centerline never straight for long).
function river(H, a, o = {}) {
  const level = o.level ?? 8, seed = o.seed ?? 5, amp = o.amp ?? 8, width = o.width ?? 4;
  const n = noise2(seed + 77);
  const mid = o.mid ?? a.sz * 0.5;
  const center = x => mid + (fbm(n, x * 0.08, 0.5, 3) - 0.5) * 2 * amp + (n(x * 0.25, 7.7) - 0.5) * 3;
  for (let x = 0; x < a.sx; x++) {
    const zc = center(x), w = width + (n(x * 0.1, 3.3) - 0.5) * 2;
    for (let z = 0; z < a.sz; z++) {
      const d = Math.abs(z - zc);
      if (d < w) {
        const i = z * a.sx + x, old = H[i];
        const bed = level - 2 - Math.round((1 - d / w) * 1.5);
        if (bed < old) { for (let y = bed + 1; y <= old; y++) a.set(x, y, z, 'minecraft:air'); H[i] = bed; }
      }
    }
  }
  return { center, level };
}

// Flood columns below level: mixed bed + water + sandy shore transition.
function water(a, H, o = {}) {
  const level = o.level ?? 8;
  const bed = o.bed || ['minecraft:sand', 'minecraft:gravel', 'minecraft:clay', 'minecraft:sand'];
  const n = noise2((o.seed ?? 5) + 999);
  const isWater = (x, z) => x >= 0 && z >= 0 && x < a.sx && z < a.sz && H[z * a.sx + x] < level;
  for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const h = H[z * a.sx + x];
    if (h < level) {
      a.set(x, h, z, bed[Math.floor(n(x * 0.3, z * 0.3) * bed.length) % bed.length]);
      for (let y = h + 1; y <= level; y++) a.set(x, y, z, 'minecraft:water', { level: '0' });
    } else if (h <= level + 1 && (isWater(x + 1, z) || isWater(x - 1, z) || isWater(x, z + 1) || isWater(x, z - 1))) {
      a.set(x, h, z, 'minecraft:sand');
    }
  }
}

// ---------------- Phase 2-N: vegetation ----------------
function canopy(a, cx, cy, cz, r, layers, leaf, rand) {
  for (let L = 0; L < layers; L++) {
    const rr = Math.max(1, r - (L > 0 ? 1 : 0));
    for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
      if (dx * dx + dz * dz > rr * rr + 0.6) continue;
      if (Math.abs(dx) === rr && Math.abs(dz) === rr && rand() < 0.6) continue; // break the sphere
      a.set(cx + dx, cy + L, cz + dz, leaf, { persistent: 'true', distance: '1' });
    }
  }
}
// type: 'oak' | 'spruce' | 'birch'. Layered/recursive canopy, trunk forks at 2-4.
function tree(a, x, z, gy, type, rand) {
  rand = rand || rng(x * 7919 + z * 104729 + 13);
  if (type === 'spruce') {
    const H = 8 + Math.floor(rand() * 5), log = 'minecraft:spruce_log', leaf = 'minecraft:spruce_leaves';
    for (let y = 1; y <= H; y++) a.set(x, gy + y, z, log, { axis: 'y' });
    let r = 3;
    for (let ty = H - 1; ty >= 3; ty -= 2) { canopy(a, x, gy + ty, z, r, 1, leaf, rand); r = r >= 3 ? 2 : r + 1; }
    canopy(a, x, gy + H, z, 1, 2, leaf, rand);
    return;
  }
  const birch = type === 'birch';
  const H = birch ? 7 + Math.floor(rand() * 3) : 5 + Math.floor(rand() * 3);
  const log = birch ? 'minecraft:birch_log' : 'minecraft:oak_log';
  const leaf = birch ? 'minecraft:birch_leaves' : 'minecraft:oak_leaves';
  for (let y = 1; y <= H; y++) a.set(x, gy + y, z, log, { axis: 'y' });
  const nb = 2 + Math.floor(rand() * 2); // 2-3 limbs
  for (let k = 0; k < nb; k++) {
    const ang = rand() * Math.PI * 2, len = 2 + Math.floor(rand() * 2);
    const bx = x + Math.round(Math.cos(ang) * len), bz = z + Math.round(Math.sin(ang) * len);
    const by = gy + H - 1 + Math.floor(rand() * 2);
    a.set(x + Math.round(Math.cos(ang)), gy + H, z + Math.round(Math.sin(ang)), log, { axis: 'y' });
    canopy(a, bx, by, bz, 2, 2 + Math.floor(rand() * 2), leaf, rand);
  }
  canopy(a, x, gy + H, z, 2, 2, leaf, rand);
}
// Randomized spacing/height/type; keep trees off water and off the mountain foot.
function scatterTrees(a, H, o = {}) {
  const rand = rng(o.seed ?? 42), count = o.count ?? 40, level = o.level ?? 8;
  const types = o.types || ['oak', 'spruce', 'birch'], minDist = o.minDist ?? 5;
  const maxZ = o.maxZ ?? a.sz * 0.62, placed = [];
  let tries = 0;
  while (placed.length < count && tries < count * 40) {
    tries++;
    const x = 2 + Math.floor(rand() * (a.sx - 4)), z = 2 + Math.floor(rand() * (maxZ - 4));
    const h = H[z * a.sx + x];
    if (h <= level || h > level + 14) continue;
    const slope = Math.max(Math.abs(H[z * a.sx + x + 1] - h), Math.abs(H[(z + 1) * a.sx + x] - h));
    if (slope > 2) continue;
    if (placed.some(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 < minDist * minDist)) continue;
    placed.push([x, z]);
    tree(a, x, z, h, pick(rand, types), rand);
  }
  return placed.length;
}

// ---------------- Phase 2-O: arch bridge ----------------
// Semicircular arch (diameter ~8), keystone proud by 1, deck 3-4 above water,
// piers/abutments with upstream cutwaters, fence+trapdoor railing, mossy/stone alternation.
function archBridge(a, o = {}) {
  const x = o.x, z1 = o.z1, z2 = o.z2, waterY = o.waterY ?? 8;
  const deckY = o.deckY ?? waterY + 4, r = o.r ?? 4, zc = (z1 + z2) / 2, cy = deckY - r - 1;
  const ring = o.ring || ['minecraft:stone_bricks', 'minecraft:mossy_stone_bricks'];
  const abut = o.abut || 'minecraft:deepslate_bricks';
  const x1 = x - 1, x2 = x + 1;
  for (let z = z1; z <= z2; z++) for (let y = cy; y <= deckY; y++) for (let xx = x1; xx <= x2; xx++) {
    const d = Math.hypot(z - zc, y - cy);
    if (y < deckY && d < r - 0.4) continue; // opening
    if (y < deckY && d <= r + 0.6) a.set(xx, y, z, ring[(z + y) % 2], {}); // arch ring
    else if (y < deckY) a.set(xx, y, z, ring[(z + y) % 2], {}); // spandrel fill
  }
  // abutments / piers down to bed
  for (const [za, zb] of [[z1, z1 + 1], [z2 - 1, z2]]) {
    a.box(x1, waterY - 3, za, x2, deckY, zb, abut);
    // upstream cutwater (triangular taper on -x side)
    for (let y = waterY - 2; y <= waterY + 1; y++) { const t = waterY + 1 - y; for (let k = 1; k <= t; k++) a.set(x1 - k, y, za, abut); }
  }
  // deck
  a.box(x1, deckY, z1, x2, deckY, z2, 'minecraft:stone_bricks');
  // keystone proud by 1 at crown
  a.set(x, cy + r, zc, 'minecraft:chiseled_stone_bricks');
  a.set(x, cy + r + 1, zc, 'minecraft:stone_brick_stairs', { half: 'top', facing: 'north', shape: 'straight' });
  // railing: wall posts + trapdoor panels
  for (let z = z1; z <= z2; z++) for (const xx of [x1, x2]) {
    if ((z - z1) % 2 === 0) a.set(xx, deckY + 1, z, 'minecraft:cobblestone_wall', { up: 'true' });
    else a.set(xx, deckY + 1, z, 'minecraft:oak_trapdoor', { half: 'top', facing: 'north', open: 'false' });
  }
  // approach ramps
  for (let s = 1; s <= 2; s++) {
    a.set(x, deckY - s, z1 - s, 'minecraft:stone_brick_stairs', { half: 'bottom', facing: 'south', shape: 'straight' });
    a.set(x, deckY - s, z2 + s, 'minecraft:stone_brick_stairs', { half: 'bottom', facing: 'north', shape: 'straight' });
  }
  return { deckY, zc };
}

// ---------------- Phase 2-O: tapering tower ----------------
// Taper 1 per 4-6 height, horizontal ring bands, cornice +1 beyond body,
// windows increase in count / decrease in size upward.
function tower(a, o = {}) {
  const x = o.x, z = o.z, baseY = o.baseY ?? 6, height = o.height ?? 24, baseR = o.baseR ?? 4;
  const taperEvery = o.taperEvery ?? 5;
  const bands = o.bands || ['minecraft:stone_bricks', 'minecraft:mossy_stone_bricks', 'minecraft:cracked_stone_bricks', 'minecraft:stone_bricks'];
  const ringAt = (yy, r, name) => { for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const d = Math.hypot(dx, dz); if (d <= r + 0.3 && d > r - 1.1) a.set(x + dx, yy, z + dz, name); } };
  for (let y = 0; y <= height; y++) {
    const band = Math.floor(y / taperEvery), r = Math.max(1, baseR - band);
    ringAt(baseY + y, r, bands[band % bands.length]);
    if (y > 0 && y % taperEvery === 0) ringAt(baseY + y, r, 'minecraft:stone_brick_slab'); // ring band
    // windows: more, smaller as you go up
    if (y > 1 && y % 3 === 0) {
      const count = Math.min(4, band + 1);
      for (let k = 0; k < count; k++) {
        const ang = (k / count) * Math.PI * 2 + band * 0.4;
        const wx = x + Math.round(Math.cos(ang) * r), wz = z + Math.round(Math.sin(ang) * r);
        a.set(wx, baseY + y, wz, 'minecraft:air');
        if (band === 0) a.set(wx, baseY + y + 1, wz, 'minecraft:air');
      }
    }
  }
  const topR = Math.max(1, baseR - Math.floor(height / taperEvery));
  ringAt(baseY + height + 1, topR + 1, 'minecraft:stone_bricks'); // cornice overhang +1
  for (let dx = -topR - 1; dx <= topR + 1; dx++) for (let dz = -topR - 1; dz <= topR + 1; dz++) {
    const d = Math.hypot(dx, dz);
    if (d <= topR + 1.3 && d > topR - 0.2 && (dx + dz) % 2 === 0) a.set(x + dx, baseY + height + 2, z + dz, 'minecraft:cobblestone_wall', { up: 'true' });
  }
  a.set(x, baseY + 1, z - topR, 'minecraft:air'); a.set(x, baseY + 2, z - topR, 'minecraft:air'); // door
  return { top: baseY + height + 2 };
}

// ---------------- Phase 2-O: plaza ----------------
// Central visual anchor, soft boundary (colonnade/flowerbeds/steps), 2-3 paving mixes
// laid in different directions per zone.
function plaza(a, o = {}) {
  const x1 = o.x1, z1 = o.z1, x2 = o.x2, z2 = o.z2, y = o.y ?? 8;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const pave = o.pave || ['minecraft:stone_bricks', 'minecraft:andesite', 'minecraft:polished_andesite'];
  for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) {
    const d = Math.hypot(x - cx, z - cz);
    let name;
    if (d < 3.5) name = pave[2]; // anchor ring
    else if (x < cx) name = pave[(Math.floor(z / 2)) % 2]; // stripes along x
    else name = pave[(Math.floor(x / 2)) % 2]; // stripes along z (different direction)
    a.set(x, y, z, name);
  }
  // soft boundary: colonnade posts + flowerbeds, not a continuous wall
  for (let x = x1; x <= x2; x += 3) { a.set(x, y + 1, z1, 'minecraft:stone_brick_wall', { up: 'true' }); a.set(x, y + 1, z2, 'minecraft:stone_brick_wall', { up: 'true' }); }
  for (let z = z1; z <= z2; z += 3) { a.set(x1, y + 1, z, 'minecraft:stone_brick_wall', { up: 'true' }); a.set(x2, y + 1, z, 'minecraft:stone_brick_wall', { up: 'true' }); }
  const flowers = ['minecraft:poppy', 'minecraft:dandelion', 'minecraft:azure_bluet', 'minecraft:cornflower'];
  const rand = rng((o.seed ?? 3) + 17);
  for (const [fx, fz] of [[x1 + 1, z1 + 1], [x2 - 1, z1 + 1], [x1 + 1, z2 - 1], [x2 - 1, z2 - 1]]) {
    a.set(fx, y, fz, 'minecraft:grass_block'); a.set(fx, y + 1, fz, pick(rand, flowers));
  }
  // anchor: fountain
  a.ring(cx, cz, 2, y + 1, 'minecraft:stone_bricks');
  a.disc(cx, cz, 1, y + 1, 'minecraft:water', { level: '0' });
  a.set(cx, y + 1, cz, 'minecraft:chiseled_stone_bricks');
  a.set(cx, y + 2, cz, 'minecraft:stone_brick_wall', { up: 'true' });
  a.set(cx, y + 3, cz, 'minecraft:lantern', { hanging: 'false' });
  return { cx, cz };
}

// ---------------- Phase 2-O: ruins ----------------
// Consistent collapse direction, rhythmic残 wall heights, 1-2 intact readable parts,
// vines pincer from wall tops + ground.
function ruins(a, o = {}) {
  const x1 = o.x1, x2 = o.x2, z = o.z, y = o.y ?? 8, dir = o.dir ?? 1;
  const mats = ['minecraft:mossy_stone_bricks', 'minecraft:cracked_stone_bricks', 'minecraft:stone_bricks', 'minecraft:mossy_cobblestone'];
  const rhythm = [6, 3, 5, 2, 7, 4, 6, 3];
  const rand = rng((o.seed ?? 9) + 5);
  const span = x2 - x1;
  const intactAt = x1 + Math.round(span * 0.3);
  for (let x = x1; x <= x2; x++) {
    const t = dir > 0 ? (x - x1) / span : (x2 - x) / span; // 0 intact end -> 1 collapsed end
    const base = rhythm[(x - x1) % rhythm.length];
    const h = Math.max(1, Math.round(base * (1 - 0.7 * t)));
    for (let yy = 1; yy <= h; yy++) a.set(x, y + yy, z, mats[Math.floor(rand() * mats.length) % mats.length]);
    // vines from the top down
    if (h >= 3 && rand() < 0.6) for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) a.set(x, y + h - k, z + 1, 'minecraft:vine', { south: 'true', up: 'false' });
    // ground vines climbing up
    if (rand() < 0.4) a.set(x, y + 1, z - 1, 'minecraft:vine', { north: 'true', up: 'false' });
    // rubble on the collapse side
    if (t > 0.5 && rand() < 0.5) a.set(x, y + 1, z + 1 + Math.floor(rand() * 2), pick(rand, ['minecraft:cobblestone', 'minecraft:mossy_cobblestone', 'minecraft:stone_brick_slab']));
  }
  // one intact readable window with a full frame
  for (let dx = -1; dx <= 1; dx++) for (let dy = 2; dy <= 4; dy++) a.set(intactAt + dx, y + dy, z, 'minecraft:stone_bricks');
  a.set(intactAt, y + 3, z, 'minecraft:air');
  return { intactAt };
}

// ---------------- Phase 5: composition metrics ----------------
function compositionReport(a) {
  const sky = new Int32Array(a.sx);
  let solid = 0;
  for (let x = 0; x < a.sx; x++) { let mh = 0; for (let z = 0; z < a.sz; z++) for (let y = a.sy - 1; y >= 0; y--) if (a.get(x, y, z)) { if (y > mh) mh = y; break; } sky[x] = mh; }
  for (let i = 0; i < a.vol; i++) if (a.grid[i]) solid++;
  let peaks = 0; for (let x = 1; x < a.sx - 1; x++) if (sky[x] > sky[x - 1] && sky[x] >= sky[x + 1] && sky[x] > 4) peaks++;
  const mean = sky.reduce((s, v) => s + v, 0) / a.sx;
  const variance = sky.reduce((s, v) => s + (v - mean) ** 2, 0) / a.sx;
  return { skyline: Array.from(sky), peaks, meanHeight: +mean.toFixed(1), heightVariance: +variance.toFixed(1), solidRatio: +(solid / a.vol).toFixed(3) };
}

module.exports = { rng, noise2, fbm, terrain, river, water, tree, canopy, scatterTrees, archBridge, tower, plaza, ruins, compositionReport };