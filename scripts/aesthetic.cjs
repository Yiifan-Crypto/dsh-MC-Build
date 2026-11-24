'use strict';
// aesthetic.cjs — executable implementation of superflat-beautify §7.5 / §16 / §18.
// Turns the "paper rules" into real checks that run on an Arena right after build().
// Goal: a build can't print OK unless its palette, structure and detail are sound.
//
// Input: an Arena from litematic.cjs (a.palette[id].name, a.get(x,y,z), a.sx/sy/sz).
// Output: structured audit objects + grade(a) => {score,grade,pass,issues,summary}.

// ---------------------------------------------------------------------------
// §7.5 material groups. Each block maps to exactly one group; SHADE drives the
// material-hard-cut test (§16.1 step 3). Suffix normalization handles stairs,
// slabs, walls, fences etc. so a `stone_brick_stairs` lands in G_STONE_LIGHT.
// ---------------------------------------------------------------------------
const GROUPS = {
  G_WOOD_LIGHT: { shade: '浅', members: ['birch_planks', 'oak_planks', 'oak_log', 'stripped_oak_log', 'birch_log', 'oak_stairs', 'oak_slab', 'oak_fence', 'birch_stairs', 'spruce_planks', 'spruce_stairs'] },
  G_WOOD_DARK:  { shade: '深', members: ['dark_oak_planks', 'dark_oak_log', 'dark_oak_stairs', 'dark_oak_slab', 'dark_oak_fence', 'dark_oak_door', 'spruce_log', 'spruce_slab'] },
  G_STONE_LIGHT:{ shade: '浅', members: ['white_concrete', 'smooth_stone', 'stone', 'stone_bricks', 'stone_brick_slab', 'stone_brick_stairs', 'cobblestone', 'gravel', 'sand', 'sandstone', 'smooth_sandstone', 'sandstone_stairs', 'light_gray_concrete', 'andesite', 'polished_andesite'] },
  G_STONE_DARK: { shade: '深', members: ['deepslate', 'deepslate_bricks', 'blackstone', 'blackstone_stairs', 'blackstone_slab', 'cracked_stone_bricks', 'mossy_stone_bricks', 'gray_concrete', 'black_concrete', 'polished_deepslate'] },
  G_METAL:      { shade: '深', members: ['gold_block', 'copper_block', 'oxidized_copper', 'cut_copper', 'iron_block', 'iron_bars', 'cauldron', 'daylight_detector', 'exposed_copper', 'weathered_copper'] },
  G_RED:        { shade: '深', members: ['red_concrete', 'red_terracotta', 'red_nether_bricks', 'bricks'] },
  G_PINK:       { shade: '浅', members: ['pink_concrete', 'cherry_leaves', 'cherry_planks'] },
  G_YELLOW:     { shade: '浅', members: ['yellow_concrete', 'yellow_terracotta', 'honeycomb_block'] },
  G_GLASS:      { shade: '浅', members: ['glass', 'glass_pane', 'light_blue_stained_glass', 'white_stained_glass'] },
  // Non-subject groups: excluded from hue/palette counting (§7.5 口径).
  G_WOOL:       { shade: '中性', members: ['white_wool', 'light_gray_wool', 'gray_wool', 'black_wool', 'carpet', 'red_carpet'] },
  G_UTILITY:    { shade: '中性', members: ['lantern', 'sea_lantern', 'glowstone', 'campfire', 'flower_pot', 'red_banner', 'item_frame', 'clock', 'ladder', 'bookshelf', 'barrel', 'composter', 'fence', 'torch', 'soul_lantern', 'soul_torch', 'end_rod', 'beacon'] },
  G_PLANT:      { shade: '中性', members: ['oak_leaves', 'vine', 'glow_lichen', 'grass_block', 'dirt', 'podzol', 'tall_grass', 'fern', 'flower', 'poppy', 'dandelion', 'azalea_leaves', 'moss_block', 'water', 'lava', 'snow', 'sand'] },
};
const SUBJECT_GROUPS = ['G_WOOD_LIGHT','G_WOOD_DARK','G_STONE_LIGHT','G_STONE_DARK','G_METAL','G_RED','G_PINK','G_YELLOW','G_GLASS'];

// Build a name -> group lookup (strip minecraft: prefix).
const MEMBER_INDEX = new Map();
for (const [g, def] of Object.entries(GROUPS)) for (const m of def.members) MEMBER_INDEX.set(m, g);

/** Normalize a block id (strip namespace + common suffixes) to a bare member key. */
function bare(name) {
  let n = String(name || '').replace(/^minecraft:/, '');
  // try exact first
  if (MEMBER_INDEX.has(n)) return n;
  // try stripping common trailing parts to find a base member
  const parts = n.split('_');
  for (let cut = parts.length - 1; cut > 0; cut--) {
    const base = parts.slice(0, cut).join('_');
    if (MEMBER_INDEX.has(base)) return base;
  }
  return n;
}

/** Map a block id to its §7.5 group name, or null for unknown/air. */
function groupOf(name) {
  if (!name || name === 'minecraft:air' || name === 'air') return null;
  const b = bare(name);
  return MEMBER_INDEX.get(b) || null;
}

const shadeOf = g => g ? (GROUPS[g] ? GROUPS[g].shade : null) : null;
const isSubject = g => SUBJECT_GROUPS.includes(g);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function nameAt(a, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= a.sx || y >= a.sy || z >= a.sz) return 'minecraft:air';
  return a.palette[a.get(x, y, z)].name;
}
const NB6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const NON_SOLID = new Set(['minecraft:air','air','minecraft:water','minecraft:lava','minecraft:grass','minecraft:tall_grass','minecraft:fern','minecraft:vine','minecraft:torch','minecraft:lantern','minecraft:soul_lantern','minecraft:flower_pot','minecraft:snow','minecraft:moss_carpet','minecraft:lily_pad','minecraft:seagrass','minecraft:cobweb']);
const isSolid = n => n && !NON_SOLID.has(n);

/** Collect visible non-air blocks with coords + group, bounding box, lowest solid layer. */
function scanBlocks(a) {
  const blocks = [];
  let minY = a.sy, maxY = -1, minX = a.sx, maxX = -1, minZ = a.sz, maxZ = -1;
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const name = a.palette[id].name; if (name === 'minecraft:air') continue;
    const g = groupOf(name);
    blocks.push({ x, y, z, name, group: g });
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { blocks, bbox: { minX, maxX, minY, maxY, minZ, maxZ } };
}

// ---------------------------------------------------------------------------
// §7 palette audit — solves "配色脏乱"
// ---------------------------------------------------------------------------
function paletteAudit(a) {
  const { blocks } = scanBlocks(a);
  const area = new Map();
  let subjectTotal = 0;
  for (const b of blocks) {
    if (!isSubject(b.group)) continue;
    area.set(b.group, (area.get(b.group) || 0) + 1);
    subjectTotal++;
  }
  const entries = [...area.entries()].sort((p, q) => q[1] - p[1]);
  // §7.5 nuance: a few window-glass / stray accent blocks are not "dirty palette".
  // Only groups with >=3% of subject area count toward palette limits. Trace
  // groups (<3%) are ignored — otherwise any 3-color house + windows = 4 groups FAIL.
  const TRACE = 0.03;
  const significant = entries.filter(([, n]) => n / subjectTotal >= TRACE);
  const mains = significant.filter(([, n]) => n / subjectTotal >= 0.10);
  const accents = significant.filter(([, n]) => n / subjectTotal < 0.10);
  const trace = entries.filter(([, n]) => n / subjectTotal < TRACE);
  const issues = [];
  // §7.4 palettes legitimately contain 3 significant groups (e.g. warm_wood =
  // light wood + dark wood + light stone). So allow up to 3 main groups; beyond
  // that is genuinely dirty. Trace groups (<3%) like window glass never count.
  if (mains.length > 3) issues.push({ code: 'COLOR_OVERLOAD', severity: 'P0', msg: `主色分组 ${mains.length} 个 (>3): ${mains.map(e=>e[0]).join(',')}` });
  if (significant.length > 4) issues.push({ code: 'TOO_MANY_GROUPS', severity: 'P0', msg: `主体分组总数 ${significant.length} (>4): ${significant.map(e=>e[0]).join(',')}` });
  if (accents.length > 1) issues.push({ code: 'ACCENT_OVERLOAD', severity: 'P1', msg: `点缀分组 ${accents.length} 个 (>1): ${accents.map(e=>e[0]).join(',')}` });
  return {
    subjectGroups: entries.map(([g, n]) => ({ group: g, count: n, pct: +(100*n/subjectTotal).toFixed(1) })),
    mainCount: mains.length, accentCount: accents.length, totalGroups: significant.length,
    traceGroups: trace.map(([g]) => g),
    issues, ok: issues.length === 0,
  };
}

// ---------------------------------------------------------------------------
// §14/§16 structure audit — solves "比例失调/悬空断裂"
// ---------------------------------------------------------------------------
function structureAudit(a) {
  const { blocks, bbox } = scanBlocks(a);
  const issues = [];
  if (blocks.length === 0) return { issues, bbox, ok: true };

  const w = bbox.maxX - bbox.minX + 1, d = bbox.maxZ - bbox.minZ + 1;
  const h = bbox.maxY - bbox.minY + 1;
  const span = Math.max(w, d);

  // 1. floating blocks.
  //    GROUND MODE (岛/建筑触底 y=0): flood-fill 6-connectivity FROM the ground layer.
  //    VOID MODE  (悬空岛/空岛，最低点 > 0): 没有地面可种子，改用「最大连通体」判定——
  //    不属于主连通体的部分才算脱节。否则整座悬空岛都会被误判成 18000+ 悬空方块。
  const solidAt = (x,y,z) => isSolid(nameAt(a, x, y, z));
  const key = (x,y,z) => (y*a.sz + z)*a.sx + x;
  const touchesGround = bbox.minY === 0;
  const seen = new Uint8Array(a.vol);
  const queue = [];

  if (touchesGround) {
    for (const b of blocks) {
      if (b.y === bbox.minY && isSubject(b.group)) { const k = key(b.x,b.y,b.z); if (!seen[k]) { seen[k]=1; queue.push([b.x,b.y,b.z]); } }
    }
  } else {
    // 先找最大连通体（只在主体方块上做 6 连通）
    const label = new Int32Array(a.vol).fill(-1);
    let best = { id: -1, size: 0 }, cur = 0;
    for (const b of blocks) {
      if (!isSubject(b.group)) continue;
      const k0 = key(b.x,b.y,b.z);
      if (label[k0] !== -1) continue;
      let size = 0; const q2 = [[b.x,b.y,b.z]]; label[k0] = cur;
      for (let h = 0; h < q2.length; h++) {
        const [x,y,z] = q2[h]; size++;
        for (const [dx,dy,dz] of NB6) {
          const nx=x+dx, ny=y+dy, nz=z+dz;
          if (nx<0||ny<0||nz<0||nx>=a.sx||ny>=a.sy||nz>=a.sz) continue;
          if (!solidAt(nx,ny,nz)) continue;
          const kk = key(nx,ny,nz);
          if (label[kk] !== -1) continue;
          label[kk] = cur; q2.push([nx,ny,nz]);
        }
      }
      if (size > best.size) best = { id: cur, size };
      cur++;
    }
    // 主连通体作为"已锚定"，从它内部所有点开始 flood
    for (const b of blocks) {
      if (!isSubject(b.group)) continue;
      const k0 = key(b.x,b.y,b.z);
      if (label[k0] === best.id && !seen[k0]) { seen[k0]=1; queue.push([b.x,b.y,b.z]); }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const [x,y,z] = queue[head];
    for (const [dx,dy,dz] of NB6) {
      const nx=x+dx, ny=y+dy, nz=z+dz;
      if (nx<0||ny<0||nz<0||nx>=a.sx||ny>=a.sy||nz>=a.sz) continue;
      const k = key(nx,ny,nz); if (seen[k]) continue;
      if (solidAt(nx,ny,nz)) { seen[k]=1; queue.push([nx,ny,nz]); }
    }
  }
  const floating = [];
  for (const b of blocks) {
    if (!isSubject(b.group)) continue;
    if (!seen[key(b.x,b.y,b.z)]) floating.push([b.x, b.y, b.z, b.name]);
  }
  if (floating.length) issues.push({ code: 'FLOATING', severity: 'P0', count: floating.length, sample: floating.slice(0, 8), msg: `${floating.length} 个悬空方块 (例: ${floating.slice(0,3).map(f=>f.slice(0,3).join(',')).join(' / ')})` });

  // 2. proportion: 多体量构图不能用整体 bbox 判（P1 根因）。
  //    例：8 座塔放射排开，整体跨度 88、高 45 → 88/45=1.96 尚可；
  //    但若再加一圈外岛，整体跨度会撑到 100+ 而被误判"薄饼"，逼着作者压扁体量。
  //    改为对**最大连通体**单独判比例，多体量构图另有各自的体量检查。
  const compBox = (() => {
    const label = new Int32Array(a.vol).fill(-1);
    let best = { id: -1, size: 0 }, cur = 0;
    const boxes = [];
    for (const b of blocks) {
      if (!isSubject(b.group)) continue;
      const k0 = (b.y*a.sz + b.z)*a.sx + b.x;
      if (label[k0] !== -1) continue;
      let size = 0;
      const bb = { minX: b.x, maxX: b.x, minY: b.y, maxY: b.y, minZ: b.z, maxZ: b.z };
      const q = [[b.x,b.y,b.z]]; label[k0] = cur;
      for (let h = 0; h < q.length; h++) {
        const [x,y,z] = q[h]; size++;
        if (x<bb.minX) bb.minX=x; if (x>bb.maxX) bb.maxX=x;
        if (y<bb.minY) bb.minY=y; if (y>bb.maxY) bb.maxY=y;
        if (z<bb.minZ) bb.minZ=z; if (z>bb.maxZ) bb.maxZ=z;
        for (const [dx,dy,dz] of NB6) {
          const nx=x+dx, ny=y+dy, nz=z+dz;
          if (nx<0||ny<0||nz<0||nx>=a.sx||ny>=a.sy||nz>=a.sz) continue;
          if (!isSolid(nameAt(a, nx, ny, nz))) continue;
          const kk = (ny*a.sz + nz)*a.sx + nx;
          if (label[kk] !== -1) continue;
          label[kk] = cur; q.push([nx,ny,nz]);
        }
      }
      boxes.push({ ...bb, size });
      if (size > best.size) best = { id: cur, size };
      cur++;
    }
    if (!boxes.length) return { w, d, h, span, ratio, multiMass: false };
    const large = boxes[best.id >= 0 ? (best.size === 0 ? 0 : boxes.findIndex(x => x.size === best.size)) : 0] || boxes[0];
    const lw = large.maxX - large.minX + 1, ld = large.maxZ - large.minZ + 1;
    const lh = large.maxY - large.minY + 1;
    const lspan = Math.max(lw, ld);
    return {
      w: lw, d: ld, h: lh, span: lspan, ratio: lspan / Math.max(1, lh),
      multiMass: boxes.length > 1, masses: boxes.length, massSizes: boxes.map(b => b.size).sort((p,q)=>q-p).slice(0, 6),
      overallRatio: span / Math.max(1, h),
    };
  })();

  const ratio = compBox.ratio;
  if (ratio > 2.2) issues.push({ code: 'PROPORTION_FLAT', severity: 'P0', msg: `主体宽:高 = ${ratio.toFixed(2)} (>2.2 最大连通体过扁)` });
  if (ratio < 0.45) issues.push({ code: 'PROPORTION_TALL', severity: 'P0', msg: `主体宽:高 = ${ratio.toFixed(2)} (<0.45 最大连通体过瘦高)` });

  // 3. silhouette: count distinct occupied-height columns bands (top of each column).
  const tops = [];
  for (let z = bbox.minZ; z <= bbox.maxZ; z++) for (let x = bbox.minX; x <= bbox.maxX; x++) {
    let top = -1;
    for (let y = bbox.maxY; y >= bbox.minY; y--) if (isSolid(nameAt(a, x, y, z))) { top = y; break; }
    if (top >= 0) tops.push(top);
  }
  const uniqTops = [...new Set(tops)];
  const levels = uniqTops.length;
  if (levels < 3 && span >= 8) issues.push({ code: 'SILHOUETTE_FLAT', severity: 'P1', msg: `剪影仅 ${levels} 段高度 (<3)，轮廓呆板` });

  // 4. material hard cut: adjacent shared-face blocks, both with shade, different
  //    group AND different shade => jarring cut with no transition.
  let hardCuts = 0; const cutSample = [];
  for (const b of blocks) {
    if (!isSubject(b.group)) continue;
    const sg = shadeOf(b.group);
    if (sg === '中性') continue;
    for (const [dx,dy,dz] of NB6) {
      const nb = nameAt(a, b.x+dx, b.y+dy, b.z+dz);
      const ng = groupOf(nb);
      if (!ng || !isSubject(ng)) continue;
      const ngShade = shadeOf(ng);
      if (ngShade === '中性' || ng === b.group || ngShade === sg) continue;
      hardCuts++;
      if (cutSample.length < 6) cutSample.push([b.x,b.y,b.z,b.group,'<->',b.x+dx,b.y+dy,b.z+dz,ng]);
    }
  }
  if (hardCuts > 0) issues.push({ code: 'MATERIAL_HARD_CUT', severity: 'P1', count: hardCuts, sample: cutSample, msg: `${hardCuts} 处材质硬切 (深浅骤变且无过渡)` });

  return { issues, bbox, dims: { w, d, h, span, ratio, silhouetteLevels: levels }, ok: issues.length === 0 };
}

// ---------------------------------------------------------------------------
// §8 detail audit — solves "细节太少"
// ---------------------------------------------------------------------------
function detailAudit(a) {
  const { blocks, bbox } = scanBlocks(a);
  const issues = [];
  const total = blocks.length;
  const groups = new Map();
  for (const b of blocks) groups.set(b.group, (groups.get(b.group) || 0) + 1);
  const has = g => (groups.get(g) || 0) > 0;

  // Glass present? (windows)
  const glassCount = (groups.get('G_GLASS') || 0);
  // Trim/detail-ish blocks: dark wood or metal or red/accent as framing.
  const trimCount = ['G_WOOD_DARK','G_METAL','G_RED','G_PINK','G_YELLOW'].reduce((s,g)=>s+(groups.get(g)||0),0);
  // Light sources present?
  const lightCount = blocks.filter(b => ['lantern','sea_lantern','glowstone','campfire','torch','soul_lantern'].some(k => b.name.includes(k))).length;

  if (glassCount === 0) issues.push({ code: 'NO_WINDOWS', severity: 'P1', msg: '没有玻璃/窗，立面缺少开窗' });
  if (trimCount === 0) issues.push({ code: 'NO_TRIM', severity: 'P1', msg: '没有深色木/金属/彩色收边，立面缺层次' });
  if (lightCount === 0) issues.push({ code: 'NO_LIGHT', severity: 'P2', msg: '没有灯/光源，夜晚漆黑且无细节焦点' });

  // detail density: decorative (utility/plant/glass/trim) per 100 structural blocks.
  const decorish = glassCount + trimCount + lightCount + (groups.get('G_PLANT') || 0);
  const density = total ? +(100 * decorish / total).toFixed(1) : 0;
  if (total >= 100 && density < 4) issues.push({ code: 'DETAIL_SPARSE', severity: 'P1', msg: `细节密度 ${density}% (<4%)，墙面光秃` });

  return { issues, glassCount, trimCount, lightCount, detailDensity: density, ok: issues.length === 0 };
}

// ---------------------------------------------------------------------------
// Grade — aggregate. P0 blocks delivery; P1/P2 lower the grade.
// ---------------------------------------------------------------------------
function grade(a) {
  const palette = paletteAudit(a);
  const structure = structureAudit(a);
  const detail = detailAudit(a);
  const all = [...palette.issues, ...structure.issues, ...detail.issues];
  const p0 = all.filter(i => i.severity === 'P0');
  const p1 = all.filter(i => i.severity === 'P1');
  const p2 = all.filter(i => i.severity === 'P2');
  let score = 100 - p0.length * 30 - p1.length * 10 - p2.length * 4;
  if (score < 0) score = 0;
  const g = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : 'D';
  return {
    score, grade: g, pass: p0.length === 0,
    palette: { mainCount: palette.mainCount, totalGroups: palette.totalGroups, subjectGroups: palette.subjectGroups, ok: palette.ok },
    structure: { dims: structure.dims, ok: structure.ok },
    detail: { glass: detail.glassCount, trim: detail.trimCount, light: detail.lightCount, density: detail.detailDensity, ok: detail.ok },
    issues: all,
    summary: `${g}(${score}) palette=${palette.ok?'ok':'BAD'} structure=${structure.ok?'ok':'BAD'} detail=${detail.ok?'ok':'BAD'} issues=${all.length}${p0.length?` P0=${p0.length}`:''}`,
  };
}

module.exports = { GROUPS, SUBJECT_GROUPS, groupOf, shadeOf, isSubject, paletteAudit, structureAudit, detailAudit, grade, scanBlocks };
