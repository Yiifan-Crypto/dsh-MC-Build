'use strict';
// build_kit.cjs — 从 mcarch 学到的高层建造原语
//
// 三个东西：
//   1) mat(color, material)  颜色+材质 → 实际方块（含同族降级），让 builder 不写死方块 ID
//   2) revolve(a, {cx,cy,cz,profile})  剖面表旋转体：给每层半径，自动成形（倒锥/穹顶/圆台）
//   3) frame(i, {count,cx,cz,radius})  放射布局的局部坐标系：at(a,b) / 单位向量 / 扇区
//
// 依赖 litematic.cjs 的 COLORS（已有方块→RGB 表）做反查，保证颜色尽量贴近设计意图。

const { colorOf } = require('./litematic.cjs');

// ---------- 1) 材质族 ----------
// family → 可用方块后缀白名单（不含 minecraft: 前缀）
const FAMILY = {
  '石':   ['stone', 'stone_bricks', 'cobblestone', 'andesite', 'gravel', 'deepslate', 'deepslate_bricks', 'cracked_stone_bricks', 'mossy_stone_bricks', 'tuff', 'cobbled_deepslate'],
  '抹灰': ['smooth_stone', 'white_concrete', 'light_gray_concrete', 'quartz_block', 'smooth_quartz', 'calcite', 'diorite', 'polished_andesite', 'polished_deepslate', 'white_terracotta'],
  '木':   ['oak_planks', 'spruce_planks', 'birch_planks', 'dark_oak_planks', 'jungle_planks', 'cherry_planks'],
  '原木': ['oak_log', 'spruce_log', 'birch_log', 'dark_oak_log', 'jungle_log', 'cherry_log'],
  '土':   ['dirt', 'coarse_dirt', 'podzol', 'moss_block', 'rooted_dirt'],
  '冰':   ['ice', 'packed_ice', 'blue_ice', 'snow_block'],
  '金属': ['gold_block', 'iron_block', 'copper_block', 'exposed_copper', 'weathered_copper', 'oxidized_copper'],
  '灯':   ['glowstone', 'sea_lantern', 'shroomlight', 'lantern', 'end_rod'],
  '布':   ['red_wool', 'green_wool', 'yellow_wool', 'blue_wool', 'purple_wool', 'pink_wool', 'brown_wool', 'white_wool', 'light_gray_wool', 'gray_wool', 'black_wool', 'orange_wool', 'lime_wool', 'cyan_wool', 'magenta_wool', 'light_blue_wool'],
  '混凝土': ['white_concrete', 'orange_concrete', 'magenta_concrete', 'light_blue_concrete', 'yellow_concrete', 'lime_concrete', 'pink_concrete', 'gray_concrete', 'light_gray_concrete', 'cyan_concrete', 'purple_concrete', 'blue_concrete', 'brown_concrete', 'green_concrete', 'red_concrete', 'black_concrete'],
  '玻璃': ['glass', 'white_stained_glass', 'red_stained_glass', 'green_stained_glass', 'yellow_stained_glass', 'blue_stained_glass', 'purple_stained_glass', 'pink_stained_glass', 'brown_stained_glass', 'light_blue_stained_glass'],
  '砖':   ['bricks', 'stone_bricks', 'red_nether_bricks', 'nether_bricks', 'deepslate_bricks'],
  '宝石': ['amethyst_block', 'lapis_block', 'emerald_block', 'diamond_block', 'redstone_block', 'gold_block'],
};

const hexToRgb = h => {
  const s = String(h).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const dist2 = (a, b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;

// 预建 family 的候选项：{name, rgb}
const FAMILY_INDEX = {};
for (const [fam, names] of Object.entries(FAMILY)) {
  const list = [];
  for (const n of names) {
    const rgb = colorOf('minecraft:' + n);
    if (!rgb) continue;
    if (rgb[0] === 255 && rgb[1] === 0 && rgb[2] === 255) continue;  // 未收录色
    list.push({ name: 'minecraft:' + n, rgb });
  }
  FAMILY_INDEX[fam] = list;
}

const matCache = new Map();

/**
 * 颜色 + 材质 → 方块 id。
 * @param {string} color   '#RRGGBB'
 * @param {string} material 材质词（石/抹灰/木/原木/土/冰/金属/灯/布/玻璃/砖/宝石）
 * @param {string[]} [allow] 额外允许的方块白名单（可选，用于限定降级范围）
 * @returns {string} 方块 id
 */
function mat(color, material, allow) {
  const key = color + '|' + material + '|' + (allow ? allow.join(',') : '');
  if (matCache.has(key)) return matCache.get(key);

  let pool = FAMILY_INDEX[material];
  if (!pool || !pool.length) pool = FAMILY_INDEX['石'];           // 未知材质退回石
  if (allow && allow.length) {
    const allowed = new Set(allow.map(n => n.startsWith('minecraft:') ? n : 'minecraft:' + n));
    const filtered = pool.filter(p => allowed.has(p.name));
    if (filtered.length) pool = filtered;
  }
  const target = hexToRgb(color);
  let best = pool[0], bestD = Infinity;
  for (const p of pool) {
    const d = dist2(target, p.rgb);
    if (d < bestD) { bestD = d; best = p; }
  }
  matCache.set(key, best.name);
  return best.name;
}

/**
 * 解析一组 5 档色阶（学习 mcarch 的做法：wall/deep/roof/glass/tone）。
 * 返回 { wall, deep, roof, glass, tone } 各自的方块 id，便于一个队伍色统一取用。
 */
function teamPalette(color, opts = {}) {
  const wallMat  = opts.wall  || '混凝土';
  const deepMat  = opts.deep  || '混凝土';
  const roofMat  = opts.roof  || '混凝土';
  const glassMat = opts.glass || '玻璃';
  const toneMat  = opts.tone  || '布';
  return {
    wall:  mat(color, wallMat),
    deep:  mat(opts.deepColor  || shade(color, -0.30), deepMat),
    roof:  mat(opts.roofColor  || shade(color, -0.15), roofMat),
    glass: mat(opts.glassColor || shade(color, +0.35), glassMat),
    tone:  mat(opts.toneColor  || shade(color, +0.55), toneMat),
  };
}

/** 简单明度调整：f>0 提亮，f<0 压暗。 */
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const adj = v => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  const to = v => v.toString(16).padStart(2, '0');
  return '#' + to(adj(r)) + to(adj(g)) + to(adj(b));
}

// ---------- 1b) 带色差报告的全局材质解析 ----------
// 学 mcarch：它报 [#9257cf 抹灰] → purple_concrete（色差 20），说明它是**全局搜索 + 报误差**，
// 而不是只在本材质族里挑。这样即使族内没有合适方块，也能给出最接近的真实方块并让人看到偏差。
const GLOBAL_INDEX = (() => {
  const out = [];
  for (const [k, v] of Object.entries(require('./litematic.cjs').COLORS || {})) {
    if (!Array.isArray(v) || v.length < 3) continue;
    if (v[0] === 255 && v[1] === 0 && v[2] === 255) continue;
    out.push({ name: 'minecraft:' + k, rgb: v, fam: famOf(k) });
  }
  return out;
})();

function famOf(blockName) {
  for (const [fam, names] of Object.entries(FAMILY)) {
    if (names.includes(blockName)) return fam;
  }
  return null;
}

/** 颜色距离（0 最接近，255 最远），用于"色差"报告。 */
const colorDelta = (a, b) => Math.round(Math.sqrt(dist2(a, b)));

/**
 * 解析并返回诊断：{ block, delta, family, alt }。
 * 优先在指定材质族里找；族内最优色差 > threshold 时扩大到全局，
 * 但会在报告里标出「跨族」以便人工复核。
 */
function matReport(color, material = '石', opts = {}) {
  const threshold = opts.threshold ?? 40;
  const target = hexToRgb(color);
  const familyPool = (FAMILY_INDEX[material] || []).map(p => ({ ...p, fam: material }));
  const kind = opts.kind;                        // 'full' 只接受整方块，排除 stairs/slab/wall/pane
  const usable = p => !kind || (kind === 'full'
    ? !/_(stairs|slab|wall|fence|pane|door|trapdoor|gate|button|plate|sign|banner|carpet)$/.test(p.name)
    : true);

  const pickNearest = pool => {
    let best = null, bestD = Infinity;
    for (const p of pool) {
      if (!usable(p)) continue;
      const d = colorDelta(target, p.rgb);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ? { ...best, delta: bestD } : null;
  };

  let hit = pickNearest(familyPool);
  let crossed = false;
  if (!hit || hit.delta > threshold) {
    const g = pickNearest(GLOBAL_INDEX);
    if (g && (!hit || g.delta < hit.delta)) { hit = g; crossed = true; }
  }
  if (!hit) hit = { name: 'minecraft:stone_bricks', delta: 255, fam: '石' };
  return {
    block: hit.name, delta: hit.delta, family: hit.fam || material,
    crossedFamily: crossed, requested: color, material,
  };
}

// ---------- 2) 剖面旋转体 ----------
/**
 * 用剖面表生成旋转体（lathe）。
 * profile: [[y, radius], ...] 或 [[y, radius, blockName], ...]
 * 逐层把半径内的格子填满（实心）。
 *
 * @param {Arena} a
 * @param {{cx:number, cy?:number, cz:number, profile:any[], name?:string, hollow?:boolean, thickness?:number}} o
 */
function revolve(a, o) {
  const cx = o.cx, cz = o.cz;
  const defaultName = o.name || 'minecraft:stone_bricks';
  const hollow = !!o.hollow;
  const th = o.thickness ?? 1;
  let placed = 0;
  for (const row of o.profile) {
    const [y, r] = row;
    const name = row[2] || defaultName;
    const ri = Math.ceil(r);
    for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      if (hollow && d < r - th) continue;      // 只留壳
      a.set(cx + dx, y, cz + dz, name);
      placed++;
    }
  }
  return placed;
}

/**
 * 圆环（只放 r-hole .. r 的壳），常用于穹顶/檐口。
 */
function ring(a, o) {
  const { cx, cy, cz, r, hole = r - 1, name } = o;
  const ri = Math.ceil(r);
  let placed = 0;
  for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const d = Math.hypot(dx, dz);
    if (d > r || d < hole) continue;
    a.set(cx + dx, cy, cz + dz, name);
    placed++;
  }
  return placed;
}

// ---------- 3) 放射布局局部坐标系 ----------
/**
 * 第 i 个放射分区的局部坐标系。
 * @param {number} i 分区序号（0 起）
 * @param {{count?:number, cx:number, cz:number, radius:number, start?:number}} o
 * @returns {{cx,cz,ux,uz,px,pz,fx,fz,t,at:(a,b)=>[number,number]}}
 */
function frame(i, o) {
  const count = o.count ?? 8;
  const start = (o.start ?? 0) * Math.PI / 180;
  const t = start + i * (2 * Math.PI / count);
  const ux = Math.cos(t), uz = Math.sin(t);       // 径向
  const px = -Math.sin(t), pz = Math.cos(t);      // 切向
  const fx = -ux, fz = -uz;                        // 朝向中心
  const cx = o.cx + ux * o.radius;
  const cz = o.cz + uz * o.radius;
  return {
    cx, cz, ux, uz, px, pz, fx, fz, t,
    // 局部 (a: 朝中心为正, b: 切向) → 世界坐标
    at: (aa, bb) => [
      Math.round(cx + fx * aa + px * bb),
      Math.round(cz + fz * aa + pz * bb),
    ],
  };
}

// 角度工具（与 mcarch 同口径）
const angOf = (x, z) => (Math.atan2(z, x) * 180 / Math.PI + 360) % 360;
const angDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const nearSector = (t, count = 8) => ((Math.round(t / (360 / count)) % count) + count) % count;

// ---------- 4) 输出完整性守卫 ----------
/**
 * 检查 builder 是否"写完整"：导出 name/size/build，且 build 是函数。
 * 用于对抗"程序被截断、跑到一半 SyntaxError"（mcarch 这次就死在这）。
 */
function checkComplete(mod) {
  const problems = [];
  if (!mod || typeof mod !== 'object') problems.push('模块未导出对象');
  if (!mod.name) problems.push('缺少 name');
  if (!Array.isArray(mod.size) || mod.size.length !== 3) problems.push('size 必须是长度为 3 的数组');
  if (typeof mod.build !== 'function') problems.push('build 不是函数');
  if (Array.isArray(mod.entries)) {
    for (const e of mod.entries) {
      if (typeof e.x !== 'number' || typeof e.y !== 'number' || typeof e.z !== 'number') {
        problems.push('entries 里的坐标必须是数字');
        break;
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

module.exports = {
  mat, matReport, teamPalette, shade, revolve, ring, frame,
  angOf, angDist, nearSector, checkComplete, colorDelta,
  FAMILY, FAMILY_INDEX,
};