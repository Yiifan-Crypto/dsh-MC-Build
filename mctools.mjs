'use strict';
// MC tools backed by an in-memory Arena model. No browser, no WebGL, no
// persistent process. Tools mutate a shared model; mc_export writes a
// .litematic (picked up by the god-view panel) and mc_screenshot renders a
// one-shot PNG so the AI can look and iterate.
//
// FIX 2026-11-19:
//  - Every tool now declares a full JSON-Schema `parameters` (properties /
//    required / additionalProperties). The old `OBJ` placeholder had no
//    properties, so the framework dropped all arguments (box/blocks/...)
//    and construction silently did nothing.
//  - Added mc_undo: incremental inverse of the last build operation (no
//    whole-world snapshots).
//  - Removed mc_camera: camera/view is now handled entirely by the
//    bottom-right god-view panel; render options are passed per-screenshot.

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { BUNDLE_DIR, SCRIPTS_DIR, resolveProjectDir } from './paths.mjs'
const require = createRequire(import.meta.url)

// The build scripts are vendored inside this bundle (scripts/), so the tools
// work from any install location. MC_BUILD_PROJECT_DIR can still redirect the
// output tree elsewhere when a project wants it.
const lib = require(join(SCRIPTS_DIR, 'litematic.cjs'))
const renderLib = require('./render-shot.cjs')
const { Arena, save, verifyFile } = lib

// Component kit: windowFourStep / entranceKit / facadeKit / palettePick.
// These are the "positive primitives" that make a build look good by default
// (4-step window, entrance trio, facade depth, 60/30/10 palettes). They talk to
// the Arena API directly, so they work against the live model unchanged.
let kit = null
try {
  kit = require(join(SCRIPTS_DIR, 'aesthetic_kit.cjs'))
} catch (e) {
  console.warn('[mc-tools] aesthetic_kit not available:', e && e.message || e)
}

const DEFAULT_SIZE = [128, 96, 128]
const TEXT_OUT = (v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }]

// ---- JSON Schema helpers ---------------------------------------------------
const OBJ = (props, required = []) => ({
  type: 'object',
  properties: props,
  ...(required.length ? { required } : {}),
  additionalProperties: true,
})
const NUM = { type: 'number' }
const INT = { type: 'integer' }
const STR = { type: 'string' }
const BOOL = { type: 'boolean' }
const ARR = (items) => ({ type: 'array', items })
const BOX = ARR(NUM)                       // [x0,y0,z0,x1,y1,z1]
const OUT = { schema: { type: 'object', additionalProperties: true }, render: (_a, v) => TEXT_OUT(v) }

// ---- shared model ----------------------------------------------------------
let model = null
// undo stack: each entry is a sparse list of [index, previousPaletteId] —
// only the cells a build operation touched, so memory cost stays tiny.
let undoStack = []

function ensure(size) {
  if (model) return model
  const s = size || DEFAULT_SIZE
  model = new Arena('opusmc-build', 'AI live build', s[0], s[1], s[2])
  // Superflat ground at y=0, build starts at y=1.
  model.box(0, 0, 0, s[0] - 1, 0, s[2] - 1, 'minecraft:grass_block')
  return model
}
function validName(n, fallback) { return typeof n === 'string' && n ? (n.startsWith('minecraft:') ? n : 'minecraft:' + n) : fallback }

// ---- block state support ----------------------------------------------------
// Names may be written either way:
//   "oak_stairs"                                  -> name only
//   "oak_stairs[facing=east,half=bottom]"         -> name + parsed props
// plus an explicit `state: {...}` argument which wins over inline props.
// Without this the model could only ever place full cubes: no stair slopes,
// no slab sills, no connected panes/walls — which is why roofs and windows
// looked flat.
function splitState(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { name: undefined, props: undefined }
  const s = raw.trim()
  const m = /^([^\[\]]+?)(?:\[([^\]]*)\])?$/.exec(s)
  if (!m) return { name: validName(s), props: undefined }
  const name = validName(m[1].trim())
  let props
  if (m[2] && m[2].trim()) {
    props = {}
    for (const part of m[2].split(',')) {
      const i = part.indexOf('=')
      if (i <= 0) continue
      const k = part.slice(0, i).trim()
      const v = part.slice(i + 1).trim()
      if (k) props[k] = v
    }
    if (!Object.keys(props).length) props = undefined
  }
  return { name, props }
}
function mergeProps(...parts) {
  const out = {}
  for (const p of parts) if (p && typeof p === 'object') for (const k of Object.keys(p)) out[k] = p[k]
  return out
}
function paletteAt(m, x, y, z) {
  const id = m.get(x, y, z)
  return (id ? m.palette[id] : null) || { name: 'minecraft:air', props: {} }
}
// Canonical "name[props]" key, used to compare states in mc_region.
function blockKey(p) {
  const name = String(p.name || 'minecraft:air')
  const keys = Object.keys(p.props || {}).sort()
  if (!keys.length) return name
  return name + '[' + keys.map(k => k + '=' + p.props[k]).join(',') + ']'
}
// Rotate a horizontal-facing property so stairs/doors stay oriented after
// mc_region rotate. 90 degrees clockwise: north->east->south->west.
const FACING_CW = { north: 'east', east: 'south', south: 'west', west: 'north' }
const FACING_CCW = { north: 'west', west: 'south', south: 'east', east: 'north' }
function rotateFacing(props, times) {
  if (!props || !props.facing) return props
  let f = String(props.facing)
  for (let i = 0; i < times; i++) f = FACING_CW[f] || f
  return { ...props, facing: f }
}
function mirrorFacing(props, axis) {
  if (!props || !props.facing) return props
  const f = String(props.facing)
  const map = axis === 'z' ? { north: 'south', south: 'north' } : { east: 'west', west: 'east' }
  return { ...props, facing: map[f] || f }
}

// Snapshot the cells touched by a mutation. Call BEFORE mutating.
function beginChange() {
  const m = ensure()
  return { m, before: new Map() }
}
function record(ctx, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= ctx.m.sx || y >= ctx.m.sy || z >= ctx.m.sz) return
  const i = ctx.m.idx(x, y, z)
  if (!ctx.before.has(i)) ctx.before.set(i, ctx.m.grid[i])
}
function commit(ctx) {
  if (ctx.before.size === 0) return 0
  const changes = []
  for (const [i, prev] of ctx.before) {
    if (ctx.m.grid[i] !== prev) changes.push([i, prev])
  }
  if (changes.length) undoStack.push({ label: ctx.label || 'build', changes })
  if (undoStack.length > 100) undoStack.shift()   // bound memory
  return changes.length
}

// Adapter so the aesthetic kit (which expects an Arena) writes through the
// undo recorder. Only `set`/`box` are used by the kit.
function kitArena(ctx) {
  const m = ctx.m
  return {
    set(x, y, z, name, props) { record(ctx, x, y, z); m.set(x, y, z, name, props) },
    get(x, y, z) { return m.get(x, y, z) },
    box(x1, y1, z1, x2, y2, z2, name, props) {
      for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) this.set(x, y, z, name, props)
    },
  }
}

// save() writes the palette wholesale, so entries from superseded operations
// stay in the blueprint. That inflates bits-per-block (file size) and makes a
// palette audit count colours the build no longer contains. Export through a
// copy that only carries the blocks actually in the grid — the live model and
// its undo stack stay untouched.
function exportCopy(m) {
  const a = new Arena(m.name, m.desc, m.sx, m.sy, m.sz)
  if (m.grid && !!m.grid.length) a.grid = new Int32Array(m.grid)   // start from same cells, then remap
  const map = new Map([[0, 0]])
  for (let i = 0; i < m.vol; i++) {
    const id = m.grid[i]
    if (!id) { a.grid[i] = 0; continue }
    let nid = map.get(id)
    if (nid === undefined) {
      const p = m.palette[id] || { name: 'minecraft:air', props: {} }
      nid = a.pid(p.name, p.props || {})
      map.set(id, nid)
    }
    a.grid[i] = nid
  }
  return a
}

function tool(name, description, parameters, execute) {
  return { name, description, parameters, output: OUT, execute }
}

export function createMCTools(opts = {}) {
  // Same project resolution as mc_build_code and the panel's build list, so a
  // redirected project writes where the panel looks for it.
  const project = () => opts.projectDir || resolveProjectDir() || BUNDLE_DIR
  const shotDir = () => join(project(), 'output', 'screenshot')
  const litDir = () => join(project(), 'output', 'litematic')

  return [
    tool('mc_health', '检查 MC 施工模型是否就绪、世界尺寸、方块数、可撤销步数。施工前先调用确认。',
      OBJ({}), async () => {
        const m = ensure()
        let blocks = 0
        for (let i = 0; i < m.vol; i++) if (m.grid[i]) blocks++
        return { ok: true, size: [m.sx, m.sy, m.sz], blocks, undoDepth: undoStack.length }
      }),

    tool('mc_scan', '扫描世界。mode: count(方块统计) / heightmap(高度图) / bbox(非空气包围盒，忽略 y=0 地面)。box 可选 [x0,y0,z0,x1,y1,z1]。',
      OBJ({
        mode: STR,
        box: BOX,
      }), async (a) => {
        const m = ensure()
        const [x0, y0, z0, x1, y1, z1] = Array.isArray(a.box) && a.box.length === 6 ? a.box : [0, 1, 0, m.sx - 1, m.sy - 1, m.sz - 1]
        const mode = a.mode || 'count'
        const counts = new Map()
        let min = [Infinity, Infinity, Infinity], max = [-1, -1, -1], total = 0
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const id = m.get(x, y, z)
          if (!id) continue
          total++
          const n = m.palette[id].name
          counts.set(n, (counts.get(n) || 0) + 1)
          if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z
          if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z
        }
        if (mode === 'bbox') return { mode, min: max[0] < 0 ? [0, 0, 0] : min, max: max[0] < 0 ? [0, 0, 0] : max, total }
        if (mode === 'heightmap') {
          const rows = []
          for (let z = z0; z <= z1; z++) {
            const row = []
            for (let x = x0; x <= x1; x++) {
              let h = 0
              for (let y = y1; y >= y0; y--) if (m.get(x, y, z)) { h = y + 1; break }
              row.push(h)
            }
            rows.push(row)
          }
          return { mode, size: [x1 - x0 + 1, z1 - z0 + 1], rows }
        }
        const list = [...counts.entries()].map(([block, count]) => ({ block, count })).sort((p, q) => q.count - p.count)
        return { mode, total, blocks: list.slice(0, 64) }
      }),

    tool('mc_build', '参数化施工。shape: box(box:[x0,y0,z0,x1,y1,z1]) / pillar(x,z,y0,height) / wall(x0,z0,x1,z1,y0,height) / circle(cx,cz,y,r,filled) / arc_wall(cx,cz,y0,r,start,end,height) / dome(cx,cy,cz,r) / gable_roof(x0,x1,z0,z1,y0,rise) / spiral_stairs(cx,cz,y0,r,steps)。block 原版方块名，可带方块状态两种写法：内联 `oak_stairs[facing=east,half=bottom]`，或 block + state:{facing:"east"}。y=0 是超平坦地面，建筑从 y=1 起。',
      OBJ({
        shape: STR, block: STR, state: { type: 'object' }, box: BOX,
        x: NUM, y0: NUM, z: NUM, height: NUM,
        x0: NUM, x1: NUM, z0: NUM, z1: NUM,
        cx: NUM, cz: NUM, cy: NUM, r: NUM, filled: BOOL,
        start: NUM, end: NUM, rise: NUM, steps: NUM,
        size: ARR(NUM),
      }), async (a) => {
        // `size` only applies on the very first build (it creates the canvas).
        if (Array.isArray(a.size) && a.size.length === 3 && a.size.every(v => typeof v === 'number' && v > 0) && !model) ensure(a.size)
        const spec = splitState(a.block)
        const block = spec.name || 'minecraft:stone'
        const props = mergeProps(spec.props, a.state)
        const shape = a.shape || 'box'
        const ctx = beginChange()
        const m = ctx.m
        const rec = (x, y, z) => record(ctx, x, y, z)
        const set = (x, y, z) => { rec(x, y, z); m.set(x, y, z, block, props) }
        switch (shape) {
          case 'box': {
            const [bx0, by0, bz0, bx1, by1, bz1] = a.box || []
            for (let y = by0; y <= by1; y++) for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) set(x, y, z)
            break
          }
          case 'pillar': for (let k = 0; k < a.height; k++) set(a.x, a.y0 + k, a.z); break
          case 'wall': {
            const steps = Math.max(Math.abs(a.x1 - a.x0), Math.abs(a.z1 - a.z0))
            for (let k = 0; k <= steps; k++) { const t = steps ? k / steps : 0; const x = Math.round(a.x0 + (a.x1 - a.x0) * t), z = Math.round(a.z0 + (a.z1 - a.z0) * t); for (let y = a.y0; y < a.y0 + a.height; y++) set(x, y, z) }
            break
          }
          case 'circle': {
            const ri = Math.ceil(a.r)
            for (let z = a.cz - ri; z <= a.cz + ri; z++) for (let x = a.cx - ri; x <= a.cx + ri; x++) { const d = Math.hypot(x - a.cx, z - a.cz); if (d <= a.r + 0.01 && (a.filled || d >= a.r - 1)) set(x, a.y, z) }
            break
          }
          case 'arc_wall': {
            const steps = Math.max(8, Math.ceil(Math.abs(a.end - a.start) * a.r))
            for (let k = 0; k <= steps; k++) { const ang = a.start + (a.end - a.start) * (k / steps); const x = Math.round(a.cx + Math.cos(ang) * a.r), z = Math.round(a.cz + Math.sin(ang) * a.r); for (let y = a.y0; y < a.y0 + a.height; y++) set(x, y, z) }
            break
          }
          case 'dome': {
            const ri = Math.ceil(a.r)
            for (let y = 0; y <= ri; y++) { const rr = Math.sqrt(Math.max(0, a.r * a.r - y * y)); for (let z = a.cz - ri; z <= a.cz + ri; z++) for (let x = a.cx - ri; x <= a.cx + ri; x++) { const d = Math.hypot(x - a.cx, z - a.cz); if (d <= rr + 0.01 && d >= rr - 1) set(x, a.cy + y, z) } }
            break
          }
          case 'gable_roof': {
            const mid = (a.x0 + a.x1) / 2, half = (a.x1 - a.x0) / 2
            for (let z = a.z0; z <= a.z1; z++) for (let x = a.x0; x <= a.x1; x++) { const yy = a.y0 + Math.round(a.rise * (1 - Math.abs(x - mid) / (half || 1))); set(x, yy, z) }
            break
          }
          case 'spiral_stairs': for (let k = 0; k < a.steps; k++) { const ang = k * Math.PI / 4; set(Math.round(a.cx + Math.cos(ang) * a.r), a.y0 + k, Math.round(a.cz + Math.sin(ang) * a.r)) } break
          default: throw new Error('unknown shape: ' + shape)
        }
        ctx.label = 'build:' + shape
        const changed = commit(ctx)
        return { shape, block, changed, undoDepth: undoStack.length }
      }),

    // ---- 构件库（aesthetic_kit）：一次调用就把"好看"做出来 ----------------
    tool('mc_palette', '取一套 60/30/10 配色的具体方块名（主色 60% 墙体 / 副色 30% 屋顶柱子基座 / 强调色 10% 灯花旗帜）。不给 style 就列出全部可选风格。施工前先调它定色，别自己临时拼色。',
      OBJ({ style: STR }), async (a) => {
        if (!kit) return { ok: false, error: 'aesthetic_kit 不可用（检查 build-litematic/scripts/aesthetic_kit.cjs）' }
        const styles = Object.keys(kit.PALETTES)
        if (!a.style) return { ok: true, styles, hint: '选一个风格传 style 拿具体配色' }
        try { return { ok: true, ...kit.palettePick(a.style) } }
        catch (e) { return { ok: false, error: e.message, styles } }
      }),

    tool('mc_window', '四层窗（§6.1 一次成型）：挖空 + 木框 + 玻璃 + 窗台半砖 + 眉檐楼梯。窗是建筑最显细节的地方，成排窗户请逐个调它，不要用 box 直接糊玻璃。axis: z=窗开在 z 面的墙上(默认) / x=窗开在 x 面墙上。w 宽 h 高，默认 3×2。',
      OBJ({
        x: NUM, y: NUM, z: NUM, axis: STR, w: NUM, h: NUM,
        frame: STR, sill: STR, glass: STR, eyebrow: STR,
      }), async (a) => {
        if (!kit) return { ok: false, error: 'aesthetic_kit 不可用' }
        const ctx = beginChange()
        const opt = { x: a.x | 0, y: a.y | 0, z: a.z | 0 }
        if (a.axis) opt.axis = a.axis
        if (a.w) opt.w = a.w
        if (a.h) opt.h = a.h
        for (const k of ['frame', 'sill', 'glass', 'eyebrow']) if (a[k]) opt[k] = a[k]
        kit.windowFourStep(kitArena(ctx), opt)
        ctx.label = 'window'
        const changed = commit(ctx)
        return { ok: true, at: [opt.x, opt.y, opt.z], axis: opt.axis || 'z', size: [opt.w || 3, opt.h || 2], changed, undoDepth: undoStack.length }
      }),

    tool('mc_entrance', '入口三件套（§8.1）：门前台阶 + 两侧壁灯 + 门楣雨棚（楼梯）。facing 是门口朝向，默认 north。',
      OBJ({ x: NUM, y: NUM, z: NUM, facing: STR, lamp: STR, step: STR, awning: STR }), async (a) => {
        if (!kit) return { ok: false, error: 'aesthetic_kit 不可用' }
        const ctx = beginChange()
        const opt = { x: a.x | 0, y: a.y | 0, z: a.z | 0 }
        if (a.facing) opt.facing = a.facing
        for (const k of ['lamp', 'step', 'awning']) if (a[k]) opt[k] = a[k]
        kit.entranceKit(kitArena(ctx), opt)
        ctx.label = 'entrance'
        const changed = commit(ctx)
        return { ok: true, at: [opt.x, opt.y, opt.z], facing: opt.facing || 'north', changed, undoDepth: undoStack.length }
      }),

    tool('mc_facade', '立面进深（§4）：四角壁柱 + 半高腰线 + 顶部出挑檐口，一次给盒子外壳加上凸凹层次。这是让方盒子不像盒子的关键一步，主体墙砌完就该调它。box:[x1,y1,z1,x2,y2,z2] 是外壳范围。',
      OBJ({
        box: BOX, x1: NUM, y1: NUM, z1: NUM, x2: NUM, y2: NUM, z2: NUM,
        pillar: STR, waist: STR, cornice: STR,
      }), async (a) => {
        if (!kit) return { ok: false, error: 'aesthetic_kit 不可用' }
        const b = Array.isArray(a.box) && a.box.length === 6 ? a.box : [a.x1, a.y1, a.z1, a.x2, a.y2, a.z2]
        const [x1, y1, z1, x2, y2, z2] = b
        if ([x1, y1, z1, x2, y2, z2].some(v => typeof v !== 'number')) return { ok: false, error: '需要 box:[x1,y1,z1,x2,y2,z2] 或 x1..z2 六个坐标' }
        const ctx = beginChange()
        const opt = { x1, y1, z1, x2, y2, z2 }
        for (const k of ['pillar', 'waist', 'cornice']) if (a[k]) opt[k] = a[k]
        kit.facadeKit(kitArena(ctx), opt)
        ctx.label = 'facade'
        const changed = commit(ctx)
        return { ok: true, box: [x1, y1, z1, x2, y2, z2], changed, undoDepth: undoStack.length }
      }),

    tool('mc_init', '重置画布到指定尺寸并重铺 y=0 超平坦草地（清空当前模型与撤销栈）。尺寸要在第一次施工前定，默认 128×96×128。',
      OBJ({ size: ARR(NUM) }), async (a) => {
        const s = Array.isArray(a.size) && a.size.length === 3 ? a.size : DEFAULT_SIZE
        if (!s.every(v => typeof v === 'number' && v > 0)) return { ok: false, error: 'size 需要 [sx,sy,sz] 三个正数' }
        model = new Arena('opusmc-build', 'AI live build', s[0] | 0, s[1] | 0, s[2] | 0)
        model.box(0, 0, 0, model.sx - 1, 0, model.sz - 1, 'minecraft:grass_block')
        undoStack = []
        return { ok: true, size: [model.sx, model.sy, model.sz], undoDepth: 0 }
      }),

    tool('mc_set_blocks', '按坐标批量设置方块。blocks: [[x,y,z,"block_name"], ...]，第 5 项可选方块状态对象 [[x,y,z,"oak_stairs",{"facing":"east","half":"bottom"}]]；方块名也可内联写成 "oak_stairs[facing=east]"。省略 minecraft: 前缀即可。批量改细节、贴面、加装饰都走这里。',
      OBJ({ blocks: ARR({ type: 'array' }) }), async (a) => {
        const ctx = beginChange()
        const m = ctx.m
        let n = 0
        for (const b of a.blocks || []) {
          if (!Array.isArray(b) || b.length < 4) continue
          const [x, y, z] = b
          const spec = splitState(b[3])
          const props = mergeProps(spec.props, b[4] && typeof b[4] === 'object' ? b[4] : undefined)
          record(ctx, x, y, z)
          const before = m.get(x, y, z)
          m.set(x, y, z, spec.name || 'minecraft:stone', props)
          if (m.get(x, y, z) !== before) n++
        }
        ctx.label = 'set_blocks'
        commit(ctx)
        return { changed: n, undoDepth: undoStack.length }
      }),

    tool('mc_region', '区域编辑。op: fill(box+block) / replace(box+from+to) / copy(box+to:[x,y,z]) / rotate(box+cx,cz,degrees) / mirror(box+cx,cz,axis:x|z)。所有方块名都支持内联状态 `oak_stairs[facing=east]` 或配 state:{facing:"east"}；copy/rotate/mirror 会连方块状态一起搬运，楼梯朝向随旋转自动跟着转。',
      OBJ({
        op: STR, box: BOX, block: STR, from: STR, to: { type: ['array', 'string'] },
        state: { type: 'object' }, toState: { type: 'object' },
        cx: NUM, cz: NUM, degrees: NUM, axis: STR,
      }), async (a) => {
        const ctx = beginChange()
        const m = ctx.m
        const [x0, y0, z0, x1, y1, z1] = a.box || []
        const nameOf = (x, y, z) => { const id = m.get(x, y, z); return id ? m.palette[id].name : 'minecraft:air' }
        const keyOf = (x, y, z) => blockKey(paletteAt(m, x, y, z))
        const snap = []
        const put = (x, y, z, name, props) => { record(ctx, x, y, z); m.set(x, y, z, name, props) }
        if (a.op === 'rotate' || a.op === 'mirror') {
          for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
            const p = paletteAt(m, x, y, z)
            snap.push([x, y, z, p.name, p.props])
          }
          for (const s of snap) put(s[0], s[1], s[2], 'minecraft:air')
        }
        let n = 0
        const set = (x, y, z, name, props) => {
          const before = keyOf(x, y, z)
          put(x, y, z, name, props)
          if (keyOf(x, y, z) !== before) n++
        }
        if (a.op === 'fill') {
          const spec = splitState(a.block)
          const blockName = spec.name || 'minecraft:stone'
          const blockProps = mergeProps(spec.props, a.state)
          for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, blockName, blockProps)
        } else if (a.op === 'replace') {
          // `from` matches by name only when no props are given, so
          // replace(from:"stone_bricks") catches every state of that block.
          const fromSpec = splitState(a.from)
          const fromName = fromSpec.name || 'minecraft:air'
          const fromProps = fromSpec.props || null
          const toSpec = typeof a.to === 'string' ? splitState(a.to) : splitState(a.block)
          const toName = toSpec.name || 'minecraft:stone'
          const toProps = mergeProps(toSpec.props, a.toState, a.state)
          for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
            const p = paletteAt(m, x, y, z)
            if (p.name !== fromName) continue
            if (fromProps) {
              let same = true
              for (const k of Object.keys(fromProps)) if (String(p.props && p.props[k]) !== String(fromProps[k])) { same = false; break }
              if (!same) continue
            }
            set(x, y, z, toName, toProps)
          }
        } else if (a.op === 'copy') {
          const [tx, ty, tz] = Array.isArray(a.to) ? a.to : [x0, y0, z0]
          for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
            const p = paletteAt(m, x, y, z)
            set(tx + x - x0, ty + y - y0, tz + z - z0, p.name, p.props)
          }
        } else if (a.op === 'rotate' || a.op === 'mirror') {
          const cx = a.cx !== undefined ? a.cx : (x0 + x1) / 2, cz = a.cz !== undefined ? a.cz : (z0 + z1) / 2
          const times = a.op === 'mirror' ? 1 : ((((a.degrees || 90) / 90) % 4) + 4) % 4
          for (const s of snap) {
            let nx = s[0], nz = s[2]
            for (let t = 0; t < times; t++) { if (a.op === 'mirror') nx = 2 * cx - nx; else { const dx = nx - cx, dz = nz - cz; nx = cx - dz; nz = cz + dx } }
            if (a.op === 'mirror' && a.axis === 'z') nz = 2 * cz - nz
            const props = a.op === 'mirror' ? mirrorFacing(s[4], a.axis || 'x') : rotateFacing(s[4], times)
            set(Math.round(nx), s[1], Math.round(nz), s[3], props)
          }
        } else throw new Error('unknown region op: ' + a.op)
        ctx.label = 'region:' + a.op
        commit(ctx)
        return { op: a.op, changed: n, undoDepth: undoStack.length }
      }),

    tool('mc_undo', '撤销上一次施工操作（mc_build / mc_set_blocks / mc_region / mc_clear），只回滚被改动的方块，不做整世界快照。可传 steps 一次撤销多步。',
      OBJ({ steps: INT }), async (a) => {
        const m = ensure()
        let steps = Number.isInteger(a.steps) && a.steps > 0 ? a.steps : 1
        steps = Math.min(steps, undoStack.length)
        let undone = 0, blocks = 0
        while (steps-- > 0) {
          const entry = undoStack.pop()
          if (!entry) break
          for (const [i, prev] of entry.changes) { m.grid[i] = prev; blocks++ }
          undone++
        }
        return { ok: true, undone, blocksRestored: blocks, undoDepth: undoStack.length }
      }),

    tool('mc_screenshot', '一次性渲染当前模型的截图到 output/screenshot 并返回本地路径，供 AI 看图后继续修改。view: persp(等距) / top(俯视) / side(正视)，可覆盖默认；yaw 旋转弧度，scale 缩放(2-14)。视角的最终呈现以右下角「建筑上帝视角」面板为准。',
      OBJ({ view: STR, yaw: NUM, scale: NUM, name: STR }), async (a) => {
        const m = ensure()
        const file = join(shotDir(), (a.name || 'mc-shot-' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_') + '.png')
        const view = ['persp', 'top', 'side'].includes(a.view) ? a.view : 'persp'
        const yaw = typeof a.yaw === 'number' ? a.yaw : Math.PI / 4
        const scale = Math.max(2, Math.min(14, typeof a.scale === 'number' ? a.scale : 7))
        const r = renderLib.renderToFile(m, { view, yaw, scale }, file)
        return { ok: true, view, yaw, scale, ...r }
      }),

    tool('mc_clear', '清空 y>=yMin 的所有方块，回到只有 y=0 超平坦地面的状态。此操作可撤销。',
      OBJ({ yMin: NUM }), async (a) => {
        const ctx = beginChange()
        const m = ctx.m
        const yMin = a.yMin === undefined ? 1 : a.yMin
        let n = 0
        for (let y = yMin; y < m.sy; y++) for (let z = 0; z < m.sz; z++) for (let x = 0; x < m.sx; x++) if (m.get(x, y, z)) { record(ctx, x, y, z); m.set(x, y, z, 'minecraft:air'); n++ }
        ctx.label = 'clear'
        commit(ctx)
        return { changed: n, undoDepth: undoStack.length }
      }),

    tool('mc_export', '导出当前模型为 .litematic 到 output/litematic，右下角建筑上帝视角面板会自动显示。name 可选。返回产物路径。',
      OBJ({ name: STR }), async (a) => {
        const m = ensure()
        let name = (a.name || m.name || 'opusmc-build').replace(/[^a-zA-Z0-9_-]/g, '_')
        if (!name.endsWith('.litematic')) name += '.litematic'
        const file = join(litDir(), name)
        // `save()` writes straight to disk and does not create directories, so
        // make sure the output tree exists (a fresh install has no output/ yet).
        mkdirSync(litDir(), { recursive: true })
        const out = exportCopy(m)
        const info = save(out, file)
        const v = verifyFile(file)
        return { ok: v.ok, file, size: [m.sx, m.sy, m.sz], blocks: info.blocks, palette: out.palette.length, verify: v.ok ? 'OK' : 'FAIL', hint: '已导出，右下角「建筑上帝视角」面板会自动刷新显示。' }
      }),
  ]
}
