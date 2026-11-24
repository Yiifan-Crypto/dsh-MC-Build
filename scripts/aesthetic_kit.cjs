'use strict';
// aesthetic_kit.cjs — positive building primitives so a good-looking build is
// the easy default. Complements aesthetic.cjs (which catches bad builds).
// Everything here returns plain data or uses the Arena API; no external deps.

// §7.4 ready-made 60/30/10 palettes. main=60% walls, aux=30% roof/pillars/base,
// accent=10% lamps/flowers/flags. All satisfy §7.5 "subject groups <=3".
const PALETTES = {
  warm_wood:  { main: 'birch_planks',        aux: ['dark_oak_log', 'stone_bricks'],       accent: ['lantern', 'oak_leaves'],                     groups: ['G_WOOD_LIGHT','G_WOOD_DARK','G_STONE_LIGHT'] },
  modern:     { main: 'white_concrete',      aux: ['blackstone'],                          accent: ['light_blue_stained_glass', 'sea_lantern'],     groups: ['G_STONE_LIGHT','G_STONE_DARK','G_GLASS'] },
  japanese:   { main: 'white_concrete',      aux: ['dark_oak_log', 'blackstone_stairs'],   accent: ['cherry_leaves', 'lantern'],                  groups: ['G_STONE_LIGHT','G_WOOD_DARK','G_STONE_DARK'] },
  chinese:    { main: 'red_concrete',        aux: ['gold_block', 'yellow_concrete'],       accent: ['white_concrete', 'lantern'],                 groups: ['G_RED','G_METAL','G_YELLOW'] },
  castle:     { main: 'stone_bricks',        aux: ['deepslate_bricks'],                     accent: ['red_banner', 'campfire'],                    groups: ['G_STONE_LIGHT','G_STONE_DARK'] },
  fairy:      { main: 'pink_concrete',       aux: ['birch_log', 'mossy_stone_bricks'],      accent: ['glowstone', 'vine'],                         groups: ['G_PINK','G_WOOD_LIGHT','G_STONE_DARK'] },
};

/** Get a palette by style name (throws a helpful error if unknown). */
function palettePick(style) {
  const p = PALETTES[style];
  if (!p) throw new Error(`unknown palette style '${style}'. Available: ${Object.keys(PALETTES).join(', ')}`);
  return { style, ...p };
}

// ---------------------------------------------------------------------------
// Window four-step (§6.1): clear hole + frame + glass pane + sill + eyebrow.
// `a` is an Arena; wall is along the given axis at fixed coord.
// axis: 'x' means wall faces +/-x (window spans z,y); 'z' means faces +/-z.
// ---------------------------------------------------------------------------
function windowFourStep(a, { x, y, z, axis = 'z', w = 3, h = 2, frame = 'dark_oak_log', sill = 'stone_brick_slab', glass = 'glass_pane', eyebrow = 'stone_brick_stairs' }) {
  const place = (px, py, pz, name, props) => a.set(px, py, pz, `minecraft:${name}`, props);
  const half = Math.floor(w / 2);
  for (let i = -half; i <= half; i++) for (let j = 0; j < h; j++) {
    const px = axis === 'z' ? x + i : x;
    const pz = axis === 'z' ? z : z + i;
    place(px, y + j, pz, 'air'); // 1) clear hole
  }
  // 2) frame around the hole
  for (let i = -half - 1; i <= half + 1; i++) {
    const px = axis === 'z' ? x + i : x, pz = axis === 'z' ? z : z + i;
    place(px, y - 1, pz, frame);            // bottom frame
    place(px, y + h, pz, frame);            // top frame (eyebrow row)
  }
  for (let j = -1; j <= h; j++) {
    const px = axis === 'z' ? x - half - 1 : x, pz = axis === 'z' ? z : z - half - 1;
    place(px, y + j, pz, frame);
    const px2 = axis === 'z' ? x + half + 1 : x, pz2 = axis === 'z' ? z : z + half + 1;
    place(px2, y + j, pz2, frame);
  }
  // 3) glass panes inside
  for (let i = -half; i <= half; i++) for (let j = 0; j < h; j++) {
    const px = axis === 'z' ? x + i : x, pz = axis === 'z' ? z : z + i;
    place(px, y + j, pz, glass);
  }
  // 4) sill below + eyebrow above
  for (let i = -half; i <= half; i++) {
    const px = axis === 'z' ? x + i : x, pz = axis === 'z' ? z : z + i;
    place(px, y - 1, pz, sill);
    place(px, y + h, pz, eyebrow, { facing: axis === 'z' ? 'north' : 'west', half: 'top' });
  }
}

// ---------------------------------------------------------------------------
// Entrance three-piece (§8.1): step + two side lamps + small awning.
// ---------------------------------------------------------------------------
function entranceKit(a, { x, y, z, facing = 'north', lamp = 'lantern', step = 'stone_brick_slab', awning = 'dark_oak_stairs' }) {
  const place = (px, py, pz, name, props) => a.set(px, py, pz, `minecraft:${name}`, props);
  const dx = facing === 'north' ? 0 : facing === 'south' ? 0 : facing === 'east' ? 1 : -1;
  const dz = facing === 'north' ? -1 : facing === 'south' ? 1 : 0;
  // step in front of the door
  place(x + dx, y - 1, z + dz, step);
  // two lamps flanking the door (perpendicular to facing)
  const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;
  place(x + px, y + 1, z + pz, lamp);
  place(x - px, y + 1, z - pz, lamp);
  // awning one block above the door
  place(x + dx, y + 2, z + dz, awning, { facing, half: 'top' });
}

// ---------------------------------------------------------------------------
// Facade depth (§4): pilaster + waist line + cornice ring on a box shell.
// ---------------------------------------------------------------------------
function facadeKit(a, { x1, y1, z1, x2, y2, z2, pillar = 'dark_oak_log', waist = 'stone_brick_slab', cornice = 'stone_brick_stairs' }) {
  const place = (x, y, z, name, props) => a.set(x, y, z, `minecraft:${name}`, props);
  // corner pilasters
  for (const [cx, cz] of [[x1,z1],[x1,z2],[x2,z1],[x2,z2]]) for (let y = y1; y <= y2; y++) place(cx, y, cz, pillar);
  // waist line at mid height around the perimeter
  const mid = Math.floor((y1 + y2) / 2);
  for (let x = x1; x <= x2; x++) { place(x, mid, z1, waist); place(x, mid, z2, waist); }
  for (let z = z1; z <= z2; z++) { place(x1, mid, z, waist); place(x2, mid, z, waist); }
  // cornice ring at the top, overhanging by one (caller should give 1-block margin)
  for (let x = x1; x <= x2; x++) { place(x, y2, z1, cornice, { facing:'north', half:'top' }); place(x, y2, z2, cornice, { facing:'south', half:'top' }); }
  for (let z = z1; z <= z2; z++) { place(x1, y2, z, cornice, { facing:'west', half:'top' }); place(x2, y2, z, cornice, { facing:'east', half:'top' }); }
}

module.exports = { PALETTES, palettePick, windowFourStep, entranceKit, facadeKit };
