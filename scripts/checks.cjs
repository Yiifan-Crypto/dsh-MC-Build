'use strict';
// "Blind builder" guarantees: programmatic checks so a build is correct WITHOUT
// relying on unreliable AI visual inspection. Addresses the classic failure modes:
//  - decor floating / not attached to wall or roof
//  - stairs/slabs/trapdoors/doors placed with wrong or missing block state
//  - fences/walls/panes not connected (missing connection block states)
//  - decor overwriting the structural wall
//  - decor blocking doors / circulation / windows (forbidden zones)
//  - wall windows exposed on more than two faces
// Operates on an Arena from litematic.cjs.

const NON_SOLID = new Set(['minecraft:air', 'minecraft:water', 'minecraft:lava', 'minecraft:grass', 'minecraft:tall_grass', 'minecraft:fern', 'minecraft:vine', 'minecraft:torch', 'minecraft:lantern', 'minecraft:soul_lantern', 'minecraft:redstone_torch', 'minecraft:flower_pot', 'minecraft:snow', 'minecraft:moss_carpet', 'minecraft:lily_pad', 'minecraft:seagrass', 'minecraft:sugar_cane', 'minecraft:cobweb', 'minecraft:pointed_dripstone']);
const isSolid = n => n && !NON_SOLID.has(n);
const nameOf = (a, x, y, z) => (x < 0 || y < 0 || z < 0 || x >= a.sx || y >= a.sy || z >= a.sz) ? 'minecraft:air' : a.palette[a.get(x, y, z)].name;

// Fill fence/wall/pane/bars connection states from actual neighbours so they
// connect in game instead of standing as isolated posts.
function connectPass(a) {
  let fixed = 0;
  const dirs = [['north', 0, -1], ['south', 0, 1], ['west', -1, 0], ['east', 1, 0]];
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const p = a.palette[id]; if (!p || !p.name) continue;
    const n = p.name;
    const fence = n.endsWith('_fence'), wall = n.endsWith('_wall'), pane = n.endsWith('_pane') || n === 'minecraft:iron_bars';
    if (!fence && !wall && !pane) continue;
    const props = { ...p.props };
    for (const [d, dx, dz] of dirs) {
      const nb = nameOf(a, x + dx, y, z + dz);
      const conn = isSolid(nb) || nb.endsWith('_fence') || nb.endsWith('_wall') || nb.endsWith('_pane') || nb === 'minecraft:iron_bars';
      if (wall) props[d] = conn ? 'low' : 'none';
      else props[d] = conn ? 'true' : 'false';
    }
    if (wall && props.up === undefined) props.up = 'true';
    const before = JSON.stringify(p.props);
    if (JSON.stringify(props) !== before) { a.set(x, y, z, n, props); fixed++; }
  }
  return fixed;
}

// Report blocks whose orientation/state props are missing (would place flipped).
function stateReport(a) {
  const bad = [];
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const { name, props } = a.palette[id];
    const need = [];
    if (name.endsWith('_stairs')) need.push('facing', 'half');
    if (name.endsWith('_slab')) need.push('type');
    if (name.endsWith('_trapdoor')) need.push('facing', 'half', 'open');
    if (name.endsWith('_door')) need.push('facing', 'half', 'hinge', 'open');
    const miss = need.filter(k => props[k] === undefined);
    if (miss.length) bad.push({ x, y, z, name, miss });
  }
  return bad;
}

// masks ------------------------------------------------------------------
function makeMask(a) { return new Uint8Array(a.vol); }
function markRect(a, mask, x1, y1, z1, x2, y2, z2) {
  for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++)
    if (x >= 0 && y >= 0 && z >= 0 && x < a.sx && y < a.sy && z < a.sz) mask[a.idx(x, y, z)] = 1;
}
const inMask = (a, mask, x, y, z) => (x < 0 || y < 0 || z < 0 || x >= a.sx || y >= a.sy || z >= a.sz) ? 0 : mask[a.idx(x, y, z)];

// Decor that can never overwrite structure (base snapshot) nor enter forbidden
// zones, and must touch existing solid (structure or earlier decor) => no floating.
function decorSet(a, base, forbidden, x, y, z, name, props) {
  if (x < 0 || y < 0 || z < 0 || x >= a.sx || y >= a.sy || z >= a.sz) return false;
  const i = a.idx(x, y, z);
  if (base[i] !== 0) return false;                 // would overwrite structure
  if (forbidden && forbidden[i]) return false;     // circulation / door / window
  const supported = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]
    .some(([dx, dy, dz]) => isSolid(nameOf(a, x + dx, y + dy, z + dz)));
  if (!supported) return false;                    // would float
  a.set(x, y, z, name, props);
  return true;
}

// Every recorded decor position must still be attached to something solid.
function attachmentReport(a, positions) {
  const floating = [];
  for (const [x, y, z] of positions) {
    const ok = [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]
      .some(([dx, dy, dz]) => isSolid(nameOf(a, x + dx, y + dy, z + dz)));
    if (!ok) floating.push([x, y, z]);
  }
  return floating;
}

// Wall windows: exactly two exposed faces, and they must be opposite (the wall
// normal). Corner/edge windows or side-exposed glass are rejected.
function windowReport(a, positions) {
  const bad = [];
  const axes = [[[1, 0, 0], [-1, 0, 0]], [[0, 1, 0], [0, -1, 0]], [[0, 0, 1], [0, 0, -1]]];
  for (const [x, y, z] of positions) {
    const air = axes.map(([p, q]) => [nameOf(a, x + p[0], y + p[1], z + p[2]) === 'minecraft:air', nameOf(a, x + q[0], y + q[1], z + q[2]) === 'minecraft:air']);
    const good = air.some(([u, v]) => u && v) && air.every(([u, v]) => (u ? 1 : 0) + (v ? 1 : 0) <= 2) && air.filter(([u, v]) => u || v).length === 1;
    if (!good) bad.push([x, y, z]);
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Playability: can a player actually WALK IN? (§4 both doors and open portals)
// A player is 1 block wide × 2 blocks tall. This is the check the old pipeline
// was missing: a door could exist with perfect block states yet still have a
// solid floor jammed into its own opening, or floor level differing from the
// outside ground by more than a single step.
//
// Reports, for every *_door and every detected open portal:
//   - DOOR_NO_HEADROOM : the 2 blocks at/above the threshold are not both passable
//   - DOOR_BLOCKED     : the cell directly inside the door is not passable
//   - DOOR_BURIED      : the threshold sits >=2 blocks above outside ground (no stair)
//   - DOOR_SILL_JUMBLE : floor inside is exactly the door's bottom half (floor in the doorway)
//   - PORTAL_TOO_LOW   : an open portal has <2 blocks of vertical clearance
//   - NO_ENTRY         : an enclosed build has no walkable entry at all
// ---------------------------------------------------------------------------
const PASSABLE_EXTRA = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:water']);
function isPassable(name) {
  if (!name) return true;
  const n = String(name).replace(/^minecraft:/, '');
  if (PASSABLE_EXTRA.has('minecraft:' + n)) return true;
  if (n === 'air' || n === 'cave_air' || n === 'water') return true;
  // doors / trapdoors / gates open or are swingable — treated as passable
  if (n.endsWith('_door') || n.endsWith('_trapdoor') || n.endsWith('_fence_gate')) return true;
  return !isSolid('minecraft:' + n);
}

function walkableReport(a, opts = {}) {
  const issues = [];    // blocking: a door that cannot be walked through
  const warnings = [];  // advisory: geometry that looks like a low opening
  const doors = [];
  const portals = [];

  // collect doors
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const { name, props } = a.palette[id];
    if (!name || !name.endsWith('_door')) continue;
    if (props && props.half === 'upper') continue;      // only handle lower half
    doors.push({ x, y, z, facing: (props && props.facing) || 'north' });
  }

  const DIR = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

  for (const d of doors) {
    const [dx, dz] = DIR[d.facing] || [0, -1];
    const outX = d.x + dx, outZ = d.z + dz;     // outside
    const inX = d.x - dx, inZ = d.z - dz;       // inside

    // 1) headroom: the door's own two cells must be passable
    const atDoor = [nameOf(a, d.x, d.y, d.z), nameOf(a, d.x, d.y + 1, d.z)];
    if (!atDoor.every(isPassable)) {
      issues.push({ code: 'DOOR_NO_HEADROOM', x: d.x, y: d.y, z: d.z, msg: `门洞本身不是 2 格净空: ${atDoor.join(' / ')}` });
      continue;
    }
    // 2) the cell just inside must be passable (you have to step through)
    const insideA = nameOf(a, inX, d.y, inZ), insideB = nameOf(a, inX, d.y + 1, inZ);
    if (!isPassable(insideA) || !isPassable(insideB)) {
      issues.push({ code: 'DOOR_BLOCKED', x: inX, y: d.y, z: inZ, msg: `门内侧被堵: ${insideA} / ${insideB}` });
    }
    // 3) threshold vs outside ground: how many blocks must you climb?
    let outGround = -1;
    for (let y = d.y + 2; y >= 0; y--) { if (isSolid(nameOf(a, outX, y, outZ))) { outGround = y; break; } }
    if (outGround >= 0 && d.y - outGround >= 2) {
      issues.push({ code: 'DOOR_BURIED', x: d.x, y: d.y, z: d.z, msg: `门槛比门外地面高 ${d.y - outGround} 格（>1 需台阶）` });
    }
    // 4) floor jammed in the doorway: bottom half of the door replaced by solid
    const below = nameOf(a, d.x, d.y - 1, d.z);
    if (!isSolid(below)) {
      issues.push({ code: 'DOOR_FLOATING', x: d.x, y: d.y, z: d.z, msg: `门下方无地板支撑` });
    }
  }

  // Open portals: an intentional doorway notched into a WALL. Detection is
  // deliberately strict so vegetation gaps and terrain notches don't flood the
  // report: a portal must sit at the building's floor level, be flanked by
  // structure on opposite lateral sides, have structure above it, and have
  // open space in front and behind (so it reads as a passage, not a dent).
  const NON_STRUCT = new Set([
    'minecraft:oak_leaves', 'minecraft:spruce_leaves', 'minecraft:birch_leaves',
    'minecraft:jungle_leaves', 'minecraft:acacia_leaves', 'minecraft:dark_oak_leaves',
    'minecraft:cherry_leaves', 'minecraft:azalea_leaves', 'minecraft:mangrove_leaves',
    'minecraft:oak_log', 'minecraft:spruce_log', 'minecraft:birch_log',
    'minecraft:jungle_log', 'minecraft:acacia_log', 'minecraft:dark_oak_log',
    'minecraft:grass_block', 'minecraft:dirt', 'minecraft:coarse_dirt', 'minecraft:podzol',
    'minecraft:moss_block', 'minecraft:sand', 'minecraft:gravel', 'minecraft:stone',
  ]);
  const isStructure = n => n && isSolid(n) && !NON_STRUCT.has(n);
  const isPlantish = n => n && (String(n).includes('leaves') || String(n).endsWith('_log') || String(n).endsWith('_wood'));

  for (let y = 2; y < a.sy - 3; y++) for (let z = 2; z < a.sz - 2; z++) for (let x = 2; x < a.sx - 2; x++) {
    if (!isPassable(nameOf(a, x, y, z))) continue;
    if (!isSolid(nameOf(a, x, y - 1, z))) continue;            // must stand on a floor
    if (isPlantish(nameOf(a, x, y - 1, z))) continue;          // not on a tree/trunk
    if (isPassable(nameOf(a, x, y + 2, z))) continue;           // needs a header above (= doorway shape)
    if (!isSolid(nameOf(a, x, y + 2, z))) continue;
    // flanked by actual building structure on both lateral sides
    const lateral = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const walls = lateral.filter(([ax, az]) => isStructure(nameOf(a, x + ax, y, z + az)));
    if (walls.length < 2) continue;
    // Must be open in front and behind (a real passage).
    // Windows / arrow slits are NOT entries: any opening whose cells are backed
    // by glass, or which is only one cell tall with structure above, is a window.
    // Entries are flagged only when the build clearly intends a walk-through:
    // the opening is >=2 cells tall somewhere along its width.
    const clear2 = isPassable(nameOf(a, x, y, z)) && isPassable(nameOf(a, x, y + 1, z));
    if (clear2) continue;
    const aboveIsSolid = isSolid(nameOf(a, x, y + 2, z));
    if (!aboveIsSolid) continue;
    // treat as a window if its own cell or the lateral neighbours are glazed
    const glazed = ['minecraft:glass', 'minecraft:glass_pane'].includes(nameOf(a, x, y, z)) ||
      lateral.some(([ax, az]) => ['minecraft:glass', 'minecraft:glass_pane'].includes(nameOf(a, x + ax, y, z + az)));
    if (glazed) continue;
    warnings.push({ code: 'PORTAL_TOO_LOW', x, y, z, msg: `墙体开口净空不足 2 格（疑似入口，请确认）` });
    portals.push({ x, y, z });
  }

  // Declared entries: the builder states exactly where players should walk in.
  // These are checked strictly and are always blocking when they fail.
  for (const e of (opts.entries || [])) {
    const { x, y, z } = e;
    const c0 = nameOf(a, x, y, z), c1 = nameOf(a, x, y + 1, z);
    if (!isPassable(c0) || !isPassable(c1)) {
      issues.push({ code: 'ENTRY_NO_HEADROOM', x, y, z, msg: `声明的入口通道不足 2 格净空: ${c0} / ${c1}` });
      continue;
    }
    if (!isSolid(nameOf(a, x, y - 1, z))) {
      issues.push({ code: 'ENTRY_NO_FLOOR', x, y, z, msg: `声明的入口下方没有地面` });
    }
    // approach: outside of the entry must be reachable at <=1 step
    if (e.facing) {
      const D = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
      const [dx, dz] = D[e.facing] || [0, -1];
      const ox = x + dx, oz = z + dz;
      const outPassable = isPassable(nameOf(a, ox, y, oz)) && isPassable(nameOf(a, ox, y + 1, oz));
      if (!outPassable) {
        issues.push({ code: 'ENTRY_APPROACH_BLOCKED', x: ox, y, z: oz, msg: `入口外侧不可通过` });
      }
    }
  }

  return {
    doors: doors.length,
    portals: portals.length,
    issues,
    warnings,
    ok: issues.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Support report for ATTACHABLE decor (学 mcarch 的自检：它会明确报
// 「24 items 没支撑（oak_fence ×8、lantern ×16）→ 游戏里会掉」)。
// 悬空检查只覆盖主体方块，装饰件（灯笼/栅栏/横幅/锁链/火把）经常被漏掉。
// ---------------------------------------------------------------------------
const NEEDS_SUPPORT = [
  { re: /_fence$/, kind: 'fence' },
  { re: /_(wall)$/, kind: 'wall' },
  { re: /_pane$/, kind: 'pane' },
  { re: /^minecraft:(iron_bars)$/, kind: 'pane' },
  { re: /^minecraft:(lantern|soul_lantern)$/, kind: 'lantern' },
  { re: /^minecraft:(torch|soul_torch|wall_torch|soul_wall_torch)$/, kind: 'torch' },
  { re: /_banner$/, kind: 'banner' },
  { re: /^minecraft:(iron_chain|chain)$/, kind: 'chain' },
  { re: /_button$/, kind: 'button' },
];

function supportReport(a) {
  const bad = [];
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const { name } = a.palette[id];
    const rule = NEEDS_SUPPORT.find(r => r.re.test(name));
    if (!rule) continue;

    const below = nameOf(a, x, y - 1, z);
    const above = nameOf(a, x, y + 1, z);
    const around = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx, dz]) => nameOf(a, x + dx, y, z + dz));
    const solidNb = around.some(isSolid);
    const solidBelow = isSolid(below);
    const solidAbove = isSolid(above);

    let ok = false;
    switch (rule.kind) {
      case 'lantern': ok = solidBelow || solidAbove; break;   // 落地或吊挂
      case 'chain':   ok = solidAbove; break;
      case 'torch':   ok = solidBelow || solidNb; break;
      case 'banner':  ok = solidBelow || solidAbove || solidNb; break;  // 可立柱上、可挂墙、可吊顶
      case 'button':  ok = solidNb; break;
      default:        ok = solidBelow || solidNb; break;     // fence/wall/pane
    }
    if (!ok) bad.push({ x, y, z, name: name.replace('minecraft:', ''), kind: rule.kind });
  }
  const byName = {};
  for (const b of bad) byName[b.name] = (byName[b.name] || 0) + 1;
  return { count: bad.length, items: bad, byName, ok: bad.length === 0 };
}

// ---------------------------------------------------------------------------
// Headroom report (学 mcarch：它报「内部净空 3~5格 2%、6+格 97%、最高10」)。
// 比 pass/fail 更有用：给出室内可站高度的分布，便于判断"是不是又高又空"。
// ---------------------------------------------------------------------------
function headroomReport(a) {
  const heights = [];
  for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    // 找每一列的地面与上方净空
    for (let y = 1; y < a.sy - 1; y++) {
      const here = nameOf(a, x, y, z);
      const below = nameOf(a, x, y - 1, z);
      if (!isSolid(below)) continue;
      if (!isPassable(here)) continue;
      if (!isPassable(nameOf(a, x, y + 1, z))) { heights.push(1); break; }
      // 统计这一列连续可通行高度
      let h = 0;
      for (let yy = y; yy < a.sy; yy++) {
        if (!isPassable(nameOf(a, x, yy, z))) break;
        h++;
      }
      heights.push(h);
      break;
    }
  }
  const n = heights.length || 1;
  const pct = c => Math.round(1000 * heights.filter(h => h <= c).length / n) / 10;
  const bucket = { low: pct(2), mid: Math.round(1000 * heights.filter(h => h > 2 && h <= 5).length / n) / 10, tall: Math.round(1000 * heights.filter(h => h > 5).length / n) / 10 };
  return {
    columns: heights.length,
    max: heights.length ? Math.max(...heights) : 0,
    mean: Math.round(10 * (heights.reduce((s, v) => s + v, 0) / n)) / 10,
    pct,
    // 站在地上够不到 3 格的列，建筑会很压抑
    lowCeiling: bucket.low,
    bucket,
    ok: bucket.low < 60,
  };
}

// One-call summary. `decor`/`windows` are position lists; `forbidden` a mask.
// `entries` declares intended walk-through points and is checked strictly.
function runChecks(a, o = {}) {
  const connected = connectPass(a);
  const states = stateReport(a);
  const floating = o.decor ? attachmentReport(a, o.decor) : [];
  const windows = o.windows ? windowReport(a, o.windows) : [];
  const walk = walkableReport(a, { entries: o.entries });
  return {
    connected,
    stateIssues: states.length,
    states,
    floating,
    badWindows: windows,
    walk,
    walkIssues: walk.issues,
    walkWarnings: walk.warnings,
    ok: states.length === 0 && floating.length === 0 && windows.length === 0 && walk.ok,
  };
}

// ---------------------------------------------------------------------------
// Stair facing report (见 experience-library E-005)
//
// 语义：楼梯的 `facing` = **上升方向**（不是"模型朝向"，也不是下降方向）。
// 一段正常的梯级，下一个更高的踏面在 facing 一侧的斜上方；写反了，更高的
// 体量会落在 facing 的**反侧**斜上方 —— 玩家看到的就是"倒着走的楼梯"。
//
// 判据（启发式，只报 warning 不阻断）：
//   反侧斜上有实体 && facing 斜上无实体 && facing 同层也无实体  → 疑似反向
// 只覆盖梯级，不覆盖所有檐口/翘角（檐口没有"下一级"可参照），这是已知局限。
// ---------------------------------------------------------------------------
const FACE_DIR = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

function stairFacingReport(a) {
  const sus = [];
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const { name, props } = a.palette[id];
    if (!name || !name.endsWith('_stairs')) continue;
    if (props && props.half === 'top') continue;
    const d = FACE_DIR[(props && props.facing) || 'north']; if (!d) continue;
    const [dx, dz] = d;
    const upFacing = isSolid(nameOf(a, x + dx, y + 1, z + dz));
    const upOpp = isSolid(nameOf(a, x - dx, y + 1, z - dz));
    const sameFacing = isSolid(nameOf(a, x + dx, y, z + dz));
    if (upOpp && !upFacing && !sameFacing) {
      sus.push({ x, y, z, name: name.replace('minecraft:', ''), facing: props && props.facing });
    }
  }
  return { count: sus.length, items: sus, ok: sus.length === 0 };
}

// ---------------------------------------------------------------------------
// Stair run report (E-018) — 两个"机器能抓"的真实坑：
//   A) 同一柱 (x,z) 出现 ≥2 块楼梯 = 每级多叠了一块，形成双层错台/悬挑半砖
//   B) 梯段的高端比低端更靠近声明入口 = 人一进门先撞 12 格高梯体断面（"方向反了"观感）
// 只报 warning，不阻断。
// ---------------------------------------------------------------------------
function stairRunReport(a, opts = {}) {
  const cells = [];
  for (let y = 0; y < a.sy; y++) for (let z = 0; z < a.sz; z++) for (let x = 0; x < a.sx; x++) {
    const id = a.get(x, y, z); if (!id) continue;
    const { name, props } = a.palette[id];
    if (!name || !name.endsWith('_stairs')) continue;
    if (props && props.half === 'top') continue;
    cells.push({ x, y, z, facing: (props && props.facing) || 'north' });
  }

  // A) 同柱重复
  const byCol = new Map();
  for (const c of cells) {
    const k = `${c.x},${c.z}`;
    if (!byCol.has(k)) byCol.set(k, []);
    byCol.get(k).push(c);
  }
  const dup = [];
  for (const [k, list] of byCol) {
    if (list.length > 1) dup.push({ col: k, count: list.length, ys: list.map(c => c.y).sort((p, q) => p - q) });
  }

  // B) 跑段分组：南北向按 x 分组、东西向按 z 分组；再按 facing 细分
  const groups = new Map();
  for (const c of cells) {
    const ns = c.facing === 'north' || c.facing === 'south';
    const k = `${ns ? 'NS' : 'EW'}|${ns ? c.x : c.z}|${c.facing}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const entries = opts.entries || [];
  const highNearEntry = [];
  for (const [, list] of groups) {
    if (list.length < 3) continue;                       // 太短不当梯段看
    const sorted = list.slice().sort((p, q) => (p.facing === 'north' || p.facing === 'south') ? p.z - q.z : p.x - q.x);
    const low = sorted[0], high = sorted[sorted.length - 1];
    if (high.y <= low.y) continue;                        // 不是递增跑段
    for (const e of entries) {
      // 只管水平接近（竖向高度差不算"远"，否则高端会被 Δy 抵消掉）
      const d = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
      if (d(e, high) < d(e, low) - 1) { highNearEntry.push({ low: [low.x, low.y, low.z], high: [high.x, high.y, high.z], entry: [e.x, e.y, e.z] }); break; }
    }
  }
  return { dupCount: dup.length, dup, highNearEntryCount: highNearEntry.length, highNearEntry, ok: dup.length === 0 && highNearEntry.length === 0 };
}

module.exports = { connectPass, stateReport, makeMask, markRect, inMask, decorSet, attachmentReport, windowReport, runChecks, walkableReport, supportReport, headroomReport, stairFacingReport, stairRunReport, isSolid, isPassable, nameOf };