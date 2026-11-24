'use strict';
// Core .litematic writer/reader + CLI. Minecraft Java (Litematica), DataVersion 3700 (1.20.4).
// CRITICAL: BlockStates uses CONTIGUOUS packing that CROSSES 64-bit word boundaries
// (pre-1.16 style). Vanilla's per-word padded packing produces scrambled blocks.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_VERSION = 3700;

// ---------------- NBT encode (big endian) ----------------
function encodeNBT(rootName, root) {
  const chunks = [];
  const u8 = v => { const b = Buffer.alloc(1); b.writeUInt8(v & 0xff); chunks.push(b); };
  const i16 = v => { const b = Buffer.alloc(2); b.writeInt16BE(v); chunks.push(b); };
  const i32 = v => { const b = Buffer.alloc(4); b.writeInt32BE(v); chunks.push(b); };
  const i64 = v => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt.asIntN(64, BigInt(v))); chunks.push(b); };
  const str = s => { const b = Buffer.from(s, 'utf8'); i16(b.length); chunks.push(b); };
  const header = (t, n) => { u8(t); str(n); };
  function payload(t, v) {
    switch (t) {
      case 1: u8(v); break;
      case 2: i16(v); break;
      case 3: i32(v); break;
      case 4: i64(v); break;
      case 8: str(v); break;
      case 9: u8(v.type); i32(v.items.length); for (const it of v.items) payload(v.type, it); break;
      case 10: for (const [n, tt, vv] of v) { header(tt, n); payload(tt, vv); } u8(0); break;
      case 11: i32(v.length); for (const x of v) i32(x); break;
      case 12: i32(v.length); for (const x of v) i64(x); break;
      default: throw new Error('bad tag ' + t);
    }
  }
  header(10, rootName); payload(10, root);
  return Buffer.concat(chunks);
}
const L = (type, items) => ({ type, items });
const propsCompound = props => {
  const keys = Object.keys(props).sort();
  if (!keys.length) return [];
  return [['Properties', 10, keys.map(k => [k, 8, String(props[k])])]];
};

// ---------------- Arena canvas ----------------
class Arena {
  constructor(name, desc, sx = 50, sy = 12, sz = 50) {
    this.name = name; this.desc = desc || '';
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.vol = sx * sy * sz;
    this.grid = new Int32Array(this.vol);
    this.palette = [{ name: 'minecraft:air', props: {} }];
    this.pmap = new Map([['minecraft:air|', 0]]);
  }
  idx(x, y, z) { return y * this.sx * this.sz + z * this.sx + x; }
  pid(name, props = {}) {
    const keys = Object.keys(props).sort();
    const k = name + '|' + keys.map(x => x + '=' + props[x]).join(',');
    if (this.pmap.has(k)) return this.pmap.get(k);
    const id = this.palette.length;
    this.palette.push({ name, props });
    this.pmap.set(k, id);
    return id;
  }
  set(x, y, z, name, props) {
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz || y < 0 || y >= this.sy) return;
    this.grid[this.idx(x, y, z)] = this.pid(name, props);
  }
  get(x, y, z) { return this.grid[this.idx(x, y, z)]; }
  box(x1, y1, z1, x2, y2, z2, name, props) {
    for (let y = y1; y <= y2; y++)
      for (let z = z1; z <= z2; z++)
        for (let x = x1; x <= x2; x++) this.set(x, y, z, name, props);
  }
  mbox(x1, y1, z1, x2, y2, z2, name, props) {
    const mx1 = this.sx - 1 - x2, mx2 = this.sx - 1 - x1, mz1 = this.sz - 1 - z2, mz2 = this.sz - 1 - z1;
    this.box(x1, y1, z1, x2, y2, z2, name, props);
    this.box(mx1, y1, z1, mx2, y2, z2, name, props);
    this.box(x1, y1, mz1, x2, y2, mz2, name, props);
    this.box(mx1, y1, mz1, mx2, y2, mz2, name, props);
  }
  mset(x, y, z, name, props) {
    this.set(x, y, z, name, props);
    this.set(this.sx - 1 - x, y, z, name, props);
    this.set(x, y, this.sz - 1 - z, name, props);
    this.set(this.sx - 1 - x, y, this.sz - 1 - z, name, props);
  }
  disc(cx, cz, r, y, name, props) {
    for (let x = 0; x < this.sx; x++) for (let z = 0; z < this.sz; z++)
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.01) this.set(x, y, z, name, props);
  }
  ring(cx, cz, r, y, name, props) {
    for (let x = 0; x < this.sx; x++) for (let z = 0; z < this.sz; z++) {
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d <= r * r + 0.01 && d > (r - 1) * (r - 1)) this.set(x, y, z, name, props);
    }
  }
  nonAir() { let n = 0; for (let i = 0; i < this.vol; i++) if (this.grid[i]) n++; return n; }
}

// ---------------- save (.litematic) ----------------
function save(a, file) {
  const bits = Math.max(2, Math.ceil(Math.log2(a.palette.length)));
  const numLongs = Math.ceil(a.vol * bits / 64);
  const longs = new Array(numLongs).fill(0n);
  for (let i = 0; i < a.vol; i++) {
    const v = a.grid[i];
    if (!v) continue;
    const start = i * bits;
    const sw = Math.floor(start / 64);
    const off = start % 64;
    const ew = Math.floor((start + bits - 1) / 64);
    const val = BigInt(v);
    longs[sw] |= val << BigInt(off);
    if (ew !== sw) longs[ew] |= val >> BigInt(64 - off);
  }
  for (let w = 0; w < numLongs; w++) longs[w] = BigInt.asUintN(64, longs[w]);
  const paletteList = L(10, a.palette.map(p => [['Name', 8, p.name], ...propsCompound(p.props)]));
  const size = [['x', 3, a.sx], ['y', 3, a.sy], ['z', 3, a.sz]];
  const region = [
    ['Position', 10, [['x', 3, 0], ['y', 3, 0], ['z', 3, 0]]],
    ['Size', 10, size],
    ['BlockStatePalette', 9, paletteList],
    ['BlockStates', 12, longs],
    ['TileEntities', 9, L(10, [])],
  ];
  const now = BigInt(Date.now());
  const meta = [
    ['Name', 8, a.name], ['Author', 8, 'build-litematic'], ['Description', 8, a.desc],
    ['TimeCreated', 4, now], ['TimeModified', 4, now],
    ['EnclosingSize', 10, size], ['TotalVolume', 3, a.vol],
    ['TotalBlocks', 3, a.nonAir()], ['RegionCount', 3, 1],
  ];
  const root = [
    ['MinecraftDataVersion', 3, DATA_VERSION], ['Version', 3, 6], ['SubVersion', 3, 1],
    ['Metadata', 10, meta], ['Regions', 10, [[a.name, 10, region]]],
  ];
  fs.writeFileSync(file, zlib.gzipSync(encodeNBT('', root), { level: 9 }));
  return { bits, blocks: a.nonAir(), palette: a.palette.length, longs: numLongs };
}

// ---------------- read back (.litematic) ----------------
function parseNBT(buf) {
  let p = 0;
  const u8 = () => buf.readUInt8(p++);
  const i16 = () => { const v = buf.readInt16BE(p); p += 2; return v; };
  const i32 = () => { const v = buf.readInt32BE(p); p += 4; return v; };
  const i64 = () => { const v = buf.readBigInt64BE(p); p += 8; return v; };
  const str = () => { const n = i16(); const s = buf.toString('utf8', p, p + n); p += n; return s; };
  function payload(t) {
    switch (t) {
      case 1: return u8();
      case 2: return i16();
      case 3: return i32();
      case 4: return i64();
      case 8: return str();
      case 9: { const et = u8(); const n = i32(); const a = []; for (let i = 0; i < n; i++) a.push(payload(et)); return a; }
      case 10: { const o = {}; while (true) { const tt = u8(); if (tt === 0) break; const name = str(); o[name] = payload(tt); } return o; }
      case 11: { const n = i32(); const a = []; for (let i = 0; i < n; i++) a.push(i32()); return a; }
      case 12: { const n = i32(); const a = []; for (let i = 0; i < n; i++) a.push(i64()); return a; }
      default: throw new Error('bad tag ' + t);
    }
  }
  const rt = u8(); str(); return payload(rt);
}
function readLitematic(file) {
  const root = parseNBT(zlib.gunzipSync(fs.readFileSync(file)));
  const regionName = Object.keys(root.Regions)[0];
  const r = root.Regions[regionName];
  const sx = r.Size.x, sy = r.Size.y, sz = r.Size.z;
  const vol = sx * sy * sz;
  const pal = r.BlockStatePalette;
  const bits = Math.max(2, Math.ceil(Math.log2(pal.length)));
  const longs = r.BlockStates;
  const mask = (1n << BigInt(bits)) - 1n;
  const nameAt = (x, y, z) => {
    const i = y * sx * sz + z * sx + x;
    const start = i * bits;
    const sw = Math.floor(start / 64), off = start % 64;
    const ew = Math.floor((start + bits - 1) / 64);
    let val = BigInt.asUintN(64, longs[sw]) >> BigInt(off);
    if (ew !== sw) {
      const hbits = off + bits - 64;
      const high = BigInt.asUintN(64, longs[ew]) & ((1n << BigInt(hbits)) - 1n);
      val |= high << BigInt(64 - off);
    }
    return pal[Number(val & mask)].Name;
  };
  return { root, region: r, regionName, sx, sy, sz, vol, pal, bits, longs, nameAt };
}
function verifyFile(file) {
  const d = readLitematic(file);
  const expectLongs = Math.ceil(d.vol * d.bits / 64);
  let nonAir = 0, leaks = 0;
  const counts = {};
  for (let y = 0; y < d.sy; y++) for (let z = 0; z < d.sz; z++) for (let x = 0; x < d.sx; x++) {
    const n = d.nameAt(x, y, z);
    counts[n] = (counts[n] || 0) + 1;
    if (n !== 'minecraft:air') nonAir++;
  }
  for (let x = 0; x < d.sx; x++) for (let z = 0; z < d.sz; z++) {
    if (d.nameAt(x, 0, z) === 'minecraft:air') leaks++;
    if (d.nameAt(x, d.sy - 1, z) === 'minecraft:air') leaks++;
  }
  for (let y = 1; y < d.sy - 1; y++) {
    for (let x = 0; x < d.sx; x++) { if (d.nameAt(x, y, 0) === 'minecraft:air') leaks++; if (d.nameAt(x, y, d.sz - 1) === 'minecraft:air') leaks++; }
    for (let z = 0; z < d.sz; z++) { if (d.nameAt(0, y, z) === 'minecraft:air') leaks++; if (d.nameAt(d.sx - 1, y, z) === 'minecraft:air') leaks++; }
  }
  const ok = d.longs.length === expectLongs && nonAir === d.root.Metadata.TotalBlocks;
  return { ok, counts, leaks, nonAir, size: [d.sx, d.sy, d.sz], palette: d.pal.length, bits: d.bits };
}

// ---------------- top-down PNG preview ----------------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function writePNG(file, w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const COLORS = {
  lava: [255, 90, 0], magma_block: [200, 60, 20], water: [40, 90, 220], powder_snow: [240, 248, 255],
  blue_ice: [120, 170, 255], packed_ice: [160, 200, 250], snow_block: [250, 250, 255], snow: [255, 255, 255],
  soul_sand: [90, 70, 55], soul_soil: [70, 55, 45], soul_fire: [80, 220, 220], cactus: [40, 140, 40],
  sweet_berry_bush: [60, 120, 50], cobweb: [230, 230, 230], slime_block: [120, 220, 120],
  sand: [230, 210, 150], sandstone: [220, 200, 140], cut_sandstone: [210, 190, 130], chiseled_sandstone: [200, 180, 120],
  red_sand: [190, 110, 60], red_sandstone: [180, 100, 50], podzol: [110, 80, 50], jungle_planks: [160, 120, 80],
  tnt: [220, 50, 40], basalt: [70, 70, 80], blackstone: [40, 35, 45], polished_blackstone: [50, 45, 55],
  polished_basalt: [80, 80, 90], glowstone: [255, 220, 120], grass_block: [90, 160, 70], mossy_cobblestone: [90, 120, 80],
  jungle_log: [110, 80, 50], jungle_leaves: [40, 120, 40], vine: [50, 130, 50], shroomlight: [255, 160, 90],
  prismarine: [90, 160, 150], dark_prismarine: [40, 90, 80], prismarine_bricks: [100, 175, 165], sea_lantern: [180, 230, 230],
  netherrack: [130, 50, 50], nether_bricks: [70, 30, 35], red_nether_bricks: [110, 30, 35],
  end_stone: [220, 220, 170], end_stone_bricks: [210, 210, 160], purpur_block: [170, 120, 170], purpur_pillar: [180, 130, 180],
  obsidian: [20, 15, 35], end_rod: [255, 255, 230], stone_bricks: [130, 130, 130], cobblestone: [110, 110, 110],
  iron_bars: [180, 180, 185], lantern: [255, 200, 100], red_wool: [200, 40, 40], blue_wool: [40, 60, 200],
  pointed_dripstone: [150, 140, 130],
  // sakura / pink palette
  cherry_leaves: [255, 183, 198], cherry_log: [116, 82, 92], cherry_planks: [212, 170, 160],
  cherry_slab: [200, 160, 152], pink_petals: [250, 200, 220], cherry_sapling: [120, 180, 90],
  quartz_block: [240, 240, 235], quartz_bricks: [230, 230, 225], quartz_slab: [225, 225, 220], quartz_stairs: [225, 225, 220],
  chiseled_stone_bricks: [125, 125, 120], glass_pane: [200, 230, 240], red_banner: [180, 50, 50],
  pink_terracotta: [216, 146, 146], pink_concrete: [244, 158, 187], pink_carpet: [249, 191, 211],
  oak_sign: [160, 130, 80], deepslate: [55, 55, 60], smooth_stone: [175, 175, 175],
  chorus_flower: [180, 140, 205], chorus_plant: [150, 110, 175], purpur_slab: [175, 125, 175], purpur_stairs: [172, 122, 172],
  // scenery / nature
  dirt: [120, 85, 55], coarse_dirt: [105, 75, 50], rooted_dirt: [110, 80, 55], grass_block: [95, 160, 70],
  mycelium: [120, 105, 120], stone: [125, 125, 125], andesite: [135, 135, 130], diorite: [190, 190, 190],
  granite: [150, 105, 85], tuff: [105, 105, 100], calcite: [225, 225, 220], gravel: [130, 125, 120],
  clay: [160, 165, 175], moss_block: [90, 130, 55], moss_carpet: [95, 135, 60],
  oak_leaves: [70, 130, 50], spruce_leaves: [50, 95, 55], birch_leaves: [110, 150, 70],
  azalea_leaves: [80, 135, 55], flowering_azalea_leaves: [120, 140, 70],
  oak_log: [110, 85, 50], spruce_log: [70, 50, 30], birch_log: [210, 205, 195],
  mossy_stone_bricks: [110, 125, 95], cracked_stone_bricks: [115, 115, 110], chiseled_stone_bricks: [125, 125, 120],
  deepslate_bricks: [70, 70, 75], deepslate_tiles: [60, 60, 65], polished_deepslate: [75, 75, 80],
  cobbled_deepslate: [80, 80, 85], smooth_stone: [160, 160, 160], polished_andesite: [140, 140, 135],
  stone_brick_stairs: [125, 125, 125], stone_brick_slab: [130, 130, 130], cobblestone_wall: [110, 110, 110],
  stone_brick_wall: [125, 125, 125], mossy_cobblestone_wall: [95, 120, 85],
  oak_fence: [150, 120, 75], spruce_fence: [90, 65, 40], oak_trapdoor: [150, 120, 75],
  poppy: [200, 40, 40], dandelion: [230, 210, 60], azure_bluet: [230, 235, 220], oxeye_daisy: [235, 235, 225],
  cornflower: [70, 110, 200], allium: [180, 120, 200], blue_orchid: [70, 160, 220],
  fern: [80, 140, 60], grass: [95, 160, 70], tall_grass: [95, 160, 70], dead_bush: [140, 110, 60],
  sugar_cane: [140, 190, 110], lily_pad: [60, 130, 50], seagrass: [70, 150, 70],
  // common build accents (added for faithful previews)
  gold_block: [245, 205, 70], lapis_block: [45, 75, 185], smooth_quartz: [235, 235, 232],
  polished_tuff: [110, 110, 105], black_concrete: [28, 28, 34], white_concrete: [235, 235, 235],
  raw_gold: [245, 205, 70], cut_copper: [200, 125, 80], weathered_copper: [120, 165, 150],
  amethyst_block: [165, 110, 200], calcite: [225, 225, 220], diorite: [190, 190, 190],
  bamboo_fence: [155, 175, 85], bamboo_block: [180, 200, 100], bamboo_planks: [200, 195, 120],
  iron_chain: [110, 112, 118], chain: [110, 112, 118],
  smooth_quartz: [236, 235, 228], cyan_terracotta: [70, 120, 125], green_terracotta: [80, 110, 70],
  yellow_terracotta: [215, 180, 60], oxidized_cut_copper: [100, 160, 135],
  oxidized_cut_copper_stairs: [100, 160, 135], oxidized_cut_copper_slab: [100, 160, 135],
  dark_prismarine_stairs: [40, 90, 80], dark_prismarine_slab: [40, 90, 80],
  stone_brick_wall: [122, 126, 122], cobblestone_wall: [110, 110, 110],
  dark_oak_leaves: [45, 85, 45], deepslate_tile_stairs: [45, 52, 62], deepslate_tile_slab: [55, 62, 72],
  oxidized_cut_copper_stairs: [100, 160, 135], oxidized_cut_copper_slab: [100, 160, 135],
  // eight portal colours (concrete + matching stained glass) so AI screenshots
  // distinguish every gate at a glance.
  red_concrete: [205, 45, 45], yellow_concrete: [240, 210, 55], green_concrete: [45, 170, 75],
  purple_concrete: [135, 70, 195], pink_concrete: [244, 158, 187], blue_concrete: [50, 95, 215],
  brown_concrete: [120, 75, 45], white_concrete: [235, 235, 235],
  red_stained_glass: [235, 90, 90], yellow_stained_glass: [250, 225, 110], green_stained_glass: [95, 210, 120],
  purple_stained_glass: [175, 120, 225], pink_stained_glass: [250, 175, 205], blue_stained_glass: [105, 145, 235],
  brown_stained_glass: [160, 115, 80], white_stained_glass: [245, 245, 245],
  // utility / furniture (added so previews of furnished interiors stay faithful)
  beacon: [150, 210, 215], campfire: [150, 100, 60], barrel: [140, 110, 70],
  crafting_table: [150, 115, 75], bookshelf: [140, 100, 60], lectern: [130, 95, 55],
  // team banners (all eight colours, so colour-coded builds preview correctly)
  red_banner: [180, 50, 50], green_banner: [80, 160, 90], yellow_banner: [220, 200, 80],
  blue_banner: [70, 90, 170], purple_banner: [130, 90, 175], pink_banner: [220, 150, 175],
  brown_banner: [120, 85, 55], white_banner: [225, 225, 220],
  // full 16-colour families (needed so colour+material resolvers pick the right block)
  white_wool: [233, 236, 236], orange_wool: [240, 118, 19], magenta_wool: [189, 68, 179],
  light_blue_wool: [58, 175, 217], yellow_wool: [248, 198, 39], lime_wool: [112, 185, 25],
  pink_wool: [237, 141, 172], gray_wool: [62, 68, 71], light_gray_wool: [142, 142, 134],
  cyan_wool: [21, 137, 145], purple_wool: [121, 42, 172], blue_wool: [53, 57, 157],
  brown_wool: [114, 71, 40], green_wool: [84, 109, 27], black_wool: [20, 21, 25],
  white_concrete: [207, 213, 214], orange_concrete: [224, 108, 0], magenta_concrete: [169, 48, 155],
  light_blue_concrete: [35, 137, 198], yellow_concrete: [241, 175, 21], lime_concrete: [94, 168, 21],
  pink_concrete: [213, 101, 143], gray_concrete: [84, 88, 91], light_gray_concrete: [158, 167, 168],
  cyan_concrete: [21, 119, 136], purple_concrete: [100, 32, 156], blue_concrete: [44, 46, 143],
  brown_concrete: [97, 60, 32], green_concrete: [71, 90, 25], red_concrete: [143, 33, 32],
  black_concrete: [8, 10, 15],
  amethyst_block: [133, 97, 191], emerald_block: [43, 200, 112], diamond_block: [98, 219, 214],
  redstone_block: [175, 24, 5], ice: [145, 183, 253], packed_ice: [141, 180, 250], blue_ice: [116, 167, 253],
  smooth_quartz: [235, 235, 232], white_terracotta: [209, 178, 161], rooted_dirt: [150, 110, 80],
  calcite: [224, 224, 220], diorite: [188, 188, 190], polished_andesite: [132, 134, 133],
  cherry_log: [55, 33, 44], cherry_planks: [226, 178, 172],
};
function colorOf(name) {
  const key = name.replace('minecraft:', '');
  if (COLORS[key]) return COLORS[key];
  if (key.endsWith('_stained_glass')) return [150, 200, 230];
  if (key === 'glass' || key.endsWith('_glass')) return [200, 230, 240];
  if (key.endsWith('_door')) return [120, 80, 40];
  if (key.endsWith('_planks')) return [160, 130, 80];
  if (key.endsWith('_log') || key.endsWith('_wood')) return [110, 85, 50];
  if (key.endsWith('_stairs') || key.endsWith('_slab')) return [140, 140, 140];
  if (key.endsWith('_wool')) return [200, 200, 200];
  if (key.endsWith('_concrete')) return [120, 120, 120];
  if (key.endsWith('_terracotta')) return [150, 90, 60];
  return [255, 0, 255];
}
function preview(a, file) {
  const S = 6, w = a.sx * S, h = a.sz * S;
  const rgba = Buffer.alloc(w * h * 4);
  for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    let id = 0;
    for (let y = a.sy - 2; y >= 0; y--) { const g = a.get(x, y, z); if (g) { id = g; break; } }
    const col = id ? colorOf(a.palette[id].name) : [0, 0, 0];
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const px = x * S + dx, pz = z * S + dy, o = (pz * w + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
  }
  writePNG(file, w, h, rgba);
}

// side elevation (look from -z toward +z): foreground silhouette vs background skyline
function previewSide(a, file) {
  const S = 4, w = a.sx * S, h = a.sy * S;
  const rgba = Buffer.alloc(w * h * 4);
  for (let x = 0; x < a.sx; x++) for (let y = 0; y < a.sy; y++) {
    let id = 0;
    for (let z = 0; z < a.sz; z++) { const g = a.get(x, y, z); if (g) { id = g; break; } }
    const col = id ? colorOf(a.palette[id].name) : [12, 14, 20];
    const py = a.sy - 1 - y;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const px = x * S + dx, pz = py * S + dy, o = (pz * w + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
  }
  writePNG(file, w, h, rgba);
}

// ---------------- general building helpers ----------------
function hollowBox(a, x1, y1, z1, x2, y2, z2, name, props) {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++)
    if (x === x1 || x === x2 || z === z1 || z === z2) a.set(x, y, z, name, props);
}
// floor at y0, walls y0+1..y0+h, flat roof y0+h+1
function room(a, x1, z1, x2, z2, y0, h, mat) {
  a.box(x1, y0, z1, x2, y0, z2, mat.floor);
  hollowBox(a, x1, y0 + 1, z1, x2, y0 + h, z2, mat.wall);
  a.box(x1, y0 + h + 1, z1, x2, y0 + h + 1, z2, mat.roof);
}
// stepped gable roof, ridge runs along x
function gableRoof(a, x1, z1, x2, z2, y, name, props) {
  let za = z1, zb = z2, yy = y;
  while (za <= zb) { a.box(x1, yy, za, x2, yy, zb, name, props); za++; zb--; yy++; }
}
// clear a 1x2 wall opening and fit a door
function door(a, x, y, z, facing, name) {
  a.set(x, y, z, 'minecraft:air'); a.set(x, y + 1, z, 'minecraft:air');
  a.set(x, y, z, name, { facing, half: 'lower', hinge: 'left', open: 'false' });
  a.set(x, y + 1, z, name, { facing, half: 'upper', hinge: 'left', open: 'false' });
}

// ---------------- CLI ----------------
function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const getOut = def => { const i = args.indexOf('--out'); return i >= 0 ? args[i + 1] : def; };
  if (cmd === 'run') {
    const bp = args[1];
    if (!bp) { console.error('usage: run <builder.cjs> [--out file.litematic]'); process.exit(1); }
    const b = require(path.resolve(bp));
    // 「先思考后写」闸门：构建前必须有设计书（可用 --skip-design 跳过，仅调试用）
    let designOk = true;
    if (!args.includes('--skip-design')) {
      const dr = require('./require_design.cjs').checkDesign(path.resolve(bp));
      designOk = dr.ok;
      if (dr.ok) {
        console.log(`DESIGN OK  ${path.relative(process.cwd(), dr.path)}`);
      } else {
        console.error(`DESIGN BLOCK  ${dr.reason}`);
      }
    }
    const size = b.size || [16, 12, 16];
    const a = new Arena(b.name || 'build', b.desc || '', size[0], size[1], size[2]);
    b.build(a);
    const connected = require('./checks.cjs').connectPass(a); // fences/walls/panes connect in game
    // Playability gate: a player is 1x2. A door you cannot walk through is a
    // failed build no matter how good the palette is, so this runs alongside the
    // aesthetic gate and blocks delivery on any blocking issue.
    let walk = null;
    if (!args.includes('--no-walkable')) {
      walk = require('./checks.cjs').walkableReport(a, { entries: b.entries });
      console.log(`WALKABLE doors=${walk.doors} portals=${walk.portals} blocking=${walk.issues.length} warnings=${walk.warnings.length}`);
      for (const issue of walk.issues) console.error(`  [BLOCK] ${issue.code}: ${issue.msg}`);
    }
    const walkOk = !walk || walk.ok;
    // 楼梯朝向自检（E-005）：facing = 上升方向。只报 warning，不阻断构建。
    let stairWarn = 0;
    if (!args.includes('--no-stair')) {
      try {
        const st = require('./checks.cjs').stairFacingReport(a);
        if (!st.ok) {
          stairWarn = st.count;
          console.log(`STAIR facing 疑似反向 ${st.count} 处（facing 应为"上升方向"，见 experience-library E-005）`);
          for (const it of st.items.slice(0, 6)) {
            console.log(`  [stair?] (${it.x},${it.y},${it.z}) ${it.name} facing=${it.facing}`);
          }
          if (st.count > 6) console.log(`  … 另有 ${st.count - 6} 处`);
        }
        const sr = require('./checks.cjs').stairRunReport(a, { entries: b.entries });
        if (sr.dupCount > 0) {
          stairWarn += sr.dupCount;
          console.log(`STAIR 同柱重复 ${sr.dupCount} 处（每级只能 1 块楼梯，下方用实心填充；见 E-018）`);
          for (const d of sr.dup.slice(0, 4)) console.log(`  [stair!] 柱 ${d.col} 有 ${d.count} 块楼梯 y=${d.ys.join('/')}`);
        }
        if (sr.highNearEntryCount > 0) {
          stairWarn += sr.highNearEntryCount;
          console.log(`STAIR 梯段高端朝向入口 ${sr.highNearEntryCount} 处（人一进门先撞梯体断面，见 E-018）`);
          for (const h of sr.highNearEntry.slice(0, 3)) {
            console.log(`  [stair!] 低端(${h.low.join(',')}) 高端(${h.high.join(',')}) 入口(${h.entry.join(',')})`);
          }
        }
      } catch { /* 检查器缺失不影响构建 */ }
    }
    // Aesthetic gate (§7.5/§16/§18): catch ugly builds before they are delivered.
    // Pass --no-aesthetic to skip (debug only).
    let aes = null;
    if (!args.includes('--no-aesthetic')) {
      aes = require('./aesthetic.cjs').grade(a);
      console.log(`AESTHETIC ${aes.summary}`);
      for (const issue of aes.issues) {
        if (issue.severity === 'P0') console.error(`  [${issue.severity}] ${issue.code}: ${issue.msg}`);
      }
    }
    const aesOk = !aes || aes.pass;
    const baseName = (b.name || 'build') + '.litematic';
    const fileName = path.basename(getOut(baseName));
    const outLit = path.resolve(path.join('output', 'litematic', fileName));
    const outPrev = path.resolve(path.join('output', 'preview', fileName.replace(/\.litematic$/, '_preview.png')));
    const outSide = path.resolve(path.join('output', 'side', fileName.replace(/\.litematic$/, '_side.png')));
    fs.mkdirSync(path.dirname(outLit), { recursive: true });
    fs.mkdirSync(path.dirname(outPrev), { recursive: true });
    fs.mkdirSync(path.dirname(outSide), { recursive: true });
    const info = save(a, outLit);
    // 旁注文件：把方块数/档位/尺寸写到 .litematic 旁边，供上帝视角面板列表直接读取，
    // 免得面板为了显示元数据去解析每个蓝图（多了会很慢）。
    try {
      const S = require('./scale.cjs');
      const sc = S.classify(info.blocks);
      const sidecar = {
        id: fileName.replace(/\.litematic$/, ''),
        file: fileName,
        size: size.join('x'),
        blocks: info.blocks,
        palette: info.palette,
        tier: sc.tier,
        tierLabel: sc.label,
        generatedAt: new Date().toISOString(),
        design: require('./require_design.cjs').findDesign(path.resolve(bp)) || null,
      };
      fs.writeFileSync(path.join(path.dirname(outLit), sidecar.id + '.json'), JSON.stringify(sidecar, null, 2), 'utf8');
    } catch { /* 旁注失败不影响构建 */ }
    preview(a, outPrev);
    previewSide(a, outSide);
    const v = verifyFile(outLit);
    // 体量分档（小 <10k / 中型 10k~80k / 大型 ≥100k；默认目标中型 20k~50k）
    let scaleLine = '';
    try {
      const S = require('./scale.cjs');
      const sc = S.classify(info.blocks);
      scaleLine = `\nSCALE ${S.describe(info.blocks)}`;
      if (sc.tier === 'medium' && !sc.inDefaultBand) {
        console.error(`  [体量] 中型但不在默认区间 20k~50k（当前 ${info.blocks}）`);
      }
    } catch { /* 分档模块缺失不影响构建 */ }
    // P14：新建件不许复用旧参数；修改件（--base）则要求沿用基准
    try {
      const bi = args.indexOf('--base');
      const baseArg = bi >= 0 ? args[bi + 1] : undefined;
      const rr = require('./check_reuse.cjs').checkReuse(path.resolve(bp), { base: baseArg });
      if (rr.mode === 'modify') {
        if (rr.error) console.error(`REUSE 修改模式无法比对：${rr.error}`);
        else {
          console.log(`REUSE MODIFY  ← 基准 ${rr.base}  参数重合=${rr.numericSimilarity} 配色重合=${rr.paletteSimilarity}`);
          if (rr.sizeChanged) console.error('  [注意] 尺寸与基准不同：修改应保持原尺寸，除非明确要求缩放');
          if (rr.paletteChanged) console.error('  [注意] 配色与基准差异较大：修改应沿用原色阶');
        }
      } else if (!rr.ok) {
        console.error('REUSE SUSPECT  疑似复用历史参数（新建件禁止；若是改建筑请用 --base）：');
        for (const f of rr.flagged) {
          console.error(`  ${f.other}  同尺寸=${f.sameSize} 数值重合=${f.numericSimilarity} 配色重合=${f.paletteSimilarity}`);
        }
      } else {
        console.log(`REUSE OK  ${rr.builder} 与既有 builder 无数值/配色高重合`);
      }
    } catch { /* 检查不可用不影响构建 */ }
    const allOk = v.ok && aesOk && walkOk && designOk;
    console.log(`${fileName} ${allOk ? 'OK' : 'FAIL'} size=${size.join('x')} blocks=${info.blocks} palette=${info.palette} bits=${info.bits} leaks=${v.leaks} connected=${connected}${aes ? ` aesthetic=${aes.pass ? 'PASS' : 'BLOCK'}` : ''}${walk ? ` walkable=${walk.ok ? 'PASS' : 'BLOCK'}` : ''}${designOk ? '' : ' design=BLOCK'}${scaleLine}`);
    process.exit(allOk ? 0 : 1);
  }
  if (cmd === 'verify') {
    let allOk = true;
    for (const f of args.slice(1)) {
      const v = verifyFile(f);
      if (!v.ok) allOk = false;
      console.log(`${path.basename(f)} ${v.ok ? 'OK' : 'FAIL'} size=${v.size.join('x')} blocks=${v.nonAir} palette=${v.palette} bits=${v.bits} leaks=${v.leaks}`);
    }
    process.exit(allOk ? 0 : 1);
  }
  console.log('usage: node litematic.cjs run <builder.cjs> [--out file.litematic] | verify <file...>');
}
module.exports = { Arena, save, readLitematic, verifyFile, preview, previewSide, encodeNBT, hollowBox, room, gableRoof, door, colorOf, DATA_VERSION };
if (require.main === module) main();