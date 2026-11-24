'use strict';
// Aesthetic country villa — enclosed example per the Phase 1/2-B/3/4 rules.
// Phase 1: main volume + subordinate porch + subordinate chimney.
// Phase 3: palette 60/30/10 (stone_bricks / spruce+dark_oak / mossy+glass+glowstone).
// Phase 4: story height 4, partition with door, interior lighting.
// Run: node litematic.cjs run aesthetic_villa.cjs --out <file>.litematic
const { hollowBox, gableRoof, door } = require('./litematic.cjs');

const STONE   = 'minecraft:stone_bricks';       // 60% dominant wall
const MOSSY   = 'minecraft:mossy_stone_bricks'; // accent trim
const WOOD    = 'minecraft:spruce_planks';      // 30% secondary
const DARK    = 'minecraft:dark_oak_planks';    // secondary variant / roof
const GLASS   = 'minecraft:glass';
const GLOW    = 'minecraft:glowstone';
const LANTERN = 'minecraft:lantern';
const FENCE   = 'minecraft:oak_fence';

module.exports = {
  name: 'aesthetic_villa',
  desc: 'Country villa: stepped gable roof, porch, chimney, layered palette',
  size: [30, 22, 28],
  build(a) {
    // Phase 1 massing: main x[3,26] z[3,21]; porch z[22,23]; chimney x[26,27]
    a.box(3, 0, 3, 26, 1, 21, STONE);            // double-base foundation
    a.box(11, 1, 22, 19, 1, 23, WOOD);           // porch floor
    for (const cx of [11, 19]) for (const cz of [22, 23]) a.box(cx, 2, cz, cx, 5, cz, STONE);
    a.box(10, 6, 21, 20, 6, 23, WOOD);           // porch roof, +1 overhang
    hollowBox(a, 3, 2, 3, 26, 5, 21, STONE);     // story 1 (h4)
    hollowBox(a, 3, 6, 3, 26, 9, 21, STONE);     // story 2 (h4)
    a.box(4, 2, 4, 25, 2, 20, WOOD);
    a.box(4, 6, 4, 25, 6, 20, WOOD);
    a.box(26, 6, 8, 27, 9, 9, STONE);            // chimney

    // Phase 4: partition + door + interior light
    a.box(4, 2, 12, 25, 5, 12, STONE);
    a.set(14, 2, 12, 'minecraft:air'); a.set(14, 3, 12, 'minecraft:air');
    a.set(15, 2, 12, 'minecraft:air'); a.set(15, 3, 12, 'minecraft:air');
    door(a, 14, 2, 12, 'east', 'minecraft:oak_door');
    for (const p of [[7, 3, 7], [23, 3, 17], [7, 7, 7], [23, 7, 17], [15, 3, 7], [15, 7, 17]]) a.set(p[0], p[1], p[2], GLOW);
    a.box(22, 2, 17, 23, 2, 18, WOOD); a.set(22, 3, 17, 'minecraft:red_wool'); a.set(23, 3, 18, 'minecraft:red_wool');
    a.box(6, 2, 5, 7, 2, 6, STONE); a.set(6, 3, 5, 'minecraft:furnace');
    door(a, 14, 2, 21, 'north', 'minecraft:oak_door');
    door(a, 15, 2, 21, 'north', 'minecraft:oak_door');

    // windows: glass + mossy trim
    function win(x1, y1, x2, y2, z) {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) a.set(x, y, z, GLASS);
      for (let y = y1 - 1; y <= y2 + 1; y++) for (let x = x1 - 1; x <= x2 + 1; x++)
        if (x === x1 - 1 || x === x2 + 1 || y === y1 - 1 || y === y2 + 1) a.set(x, y, z, MOSSY);
    }
    function winX(x, y1, y2, z1, z2) {
      for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) a.set(x, y, z, GLASS);
      for (let y = y1 - 1; y <= y2 + 1; y++) for (let z = z1 - 1; z <= z2 + 1; z++)
        if (y === y1 - 1 || y === y2 + 1 || z === z1 - 1 || z === z2 + 1) a.set(x, y, z, MOSSY);
    }
    win(7, 3, 8, 4, 21); win(20, 3, 21, 4, 21);
    win(7, 7, 8, 8, 21); win(13, 7, 14, 8, 21); win(20, 7, 21, 8, 21);
    winX(26, 3, 4, 7, 8); winX(26, 7, 8, 7, 8); winX(3, 3, 4, 7, 8);

    // stepped gable roof, +1 eaves, dark wood vs stone
    gableRoof(a, 2, 2, 27, 22, 10, DARK);
    a.box(26, 10, 8, 27, 12, 9, STONE);
    a.set(26, 13, 8, MOSSY); a.set(27, 13, 8, MOSSY); a.set(26, 13, 9, MOSSY); a.set(27, 13, 9, MOSSY);

    // front yard: mixed paving + soft fence boundary + lamp anchor + tree
    for (let z = 24; z <= 27; z++) for (let x = 8; x <= 22; x++) {
      a.set(x, 0, z, (x + z) % 3 === 0 ? 'minecraft:sand' : 'minecraft:dirt');
      a.set(x, 1, z, (x + z) % 4 === 0 ? 'minecraft:gravel' : 'minecraft:sand');
    }
    for (let x = 8; x <= 22; x += 3) { a.set(x, 1, 24, FENCE); a.set(x, 2, 24, FENCE); a.set(x, 1, 27, FENCE); a.set(x, 2, 27, FENCE); }
    for (let z = 24; z <= 27; z += 3) { a.set(8, 1, z, FENCE); a.set(8, 2, z, FENCE); a.set(22, 1, z, FENCE); a.set(22, 2, z, FENCE); }
    a.box(15, 1, 25, 15, 3, 25, FENCE); a.set(15, 3, 25, LANTERN);
    a.box(12, 1, 26, 12, 3, 26, 'minecraft:oak_log');
    for (let dy = 2; dy <= 4; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      if (Math.abs(dx) + Math.abs(dz) <= 1) a.set(12 + dx, dy, 26 + dz, 'minecraft:oak_leaves', { persistent: 'true' });
  },
};