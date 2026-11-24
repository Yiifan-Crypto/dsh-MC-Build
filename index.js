'use strict'
// Host half of the OpusMC viewer bundle: serves the bundled OpusMC game plus
// converted .litematic builds over a named webserver route, so the Client panel
// can load them in an iframe on the same origin.
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENV_LITEMATIC_DIR, LITEMATIC_DIR, VIEWER_DIR } from './paths.mjs'
// mctools.mjs is hot-reloaded when edited so fixes take effect without a
// full DSH restart (tool names/schemas are re-registered on next mount).
import { statSync, readFileSync } from 'node:fs'
// Code-path builder: runs a full builder program (Arena + aesthetic_kit +
// checks) and writes a .litematic. This is how the detailed builds in
// build-litematic/scripts get their finish — far more precise than placing
// primitives one call at a time. Registered as `mc_build_code`.
import { createMcBuildTool } from './mcbuild.mjs'
let mcToolsMod = null
let mcToolsStamp = ''
async function freshMCTools() {
  const f = new URL('./mctools.mjs', import.meta.url)
  let stamp = ''
  try { const s = statSync(f); stamp = `${s.mtimeMs}:${s.size}` } catch {}
  if (!mcToolsMod || stamp !== mcToolsStamp) {
    mcToolsMod = await import(`./mctools.mjs?v=${stamp}`)
    mcToolsStamp = stamp
  }
  return mcToolsMod.createMCTools
}

/** This bundle's own directory (the route serves files from inside it only). */
const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url))

/** Stable Cordis plugin name. */
export const name = 'opusmc-viewer'

/** The webserver is the only service this bundle needs. */
export const inject = ['webServer']

/** Mount point for every request this bundle answers. */
const BASE = '/opusmc'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/** Where generated .litematic files are discovered, first existing wins. */
const BUILD_DIRS = [
  process.env[ENV_LITEMATIC_DIR],
  LITEMATIC_DIR,
].filter((v) => typeof v === 'string' && v.length > 0)

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** List the .litematic files available to the viewer. */
/** 读取蓝图旁注（与 .litematic 同名的 .json，由构建 CLI 写出）：
 *  让面板列表直接显示方块数与体量档位，不必为每个蓝图解析一遍。 */
function sidecarOf(dir, id) {
  try {
    const p = join(dir, id + '.json')
    if (!existsSync(p)) return {}
    const j = JSON.parse(readFileSync(p, 'utf8'))
    return {
      blocks: typeof j.blocks === 'number' ? j.blocks : undefined,
      tier: typeof j.tier === 'string' ? j.tier : undefined,
      tierLabel: typeof j.tierLabel === 'string' ? j.tierLabel : undefined,
      dims: typeof j.size === 'string' ? j.size : undefined,
    }
  } catch { return {} }
}

async function listBuilds() {
  const out = []
  for (const dir of BUILD_DIRS) {
    if (!existsSync(dir)) continue
    let entries
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.litematic')) continue
      const id = entry.slice(0, -'.litematic'.length)
      if (out.some((b) => b.id === id)) continue
      let size = 0
      let mtimeMs = 0
      try {
        const info = await stat(join(dir, entry))
        size = info.size
        mtimeMs = info.mtimeMs
      } catch {
        /* a vanished file simply reports no size */
      }
      out.push({ id, file: entry, dir, bytes: size, mtimeMs, ...sidecarOf(dir, id) })
    }
  }
  // 新生成的建筑排在最上面：按修改时间倒序（时间相同再按 id）
  out.sort((a, b) => (b.mtimeMs - a.mtimeMs) || a.id.localeCompare(b.id))
  return out
}

/**
 * Load the litematic reader on first use and re-import it when the file
 * changes, so the block mapping can be corrected without restarting the Host.
 */
let readerModule = null
let readerStamp = ''
async function reader() {
  const file = join(BUNDLE_DIR, 'litematic.mjs')
  const info = await stat(file)
  const stamp = `${String(info.mtimeMs)}:${String(info.size)}`
  if (readerModule === null || stamp !== readerStamp) {
    readerModule = await import(`./litematic.mjs?v=${stamp}`)
    readerStamp = stamp
  }
  return readerModule
}

/**
 * Convert one build to the viewer's payload: palette keys plus run-length
 * encoded palette indices in litematic index order (y, z, x). Crystal-clear
 * builds compress extremely well because air dominates the volume.
 */
async function convertBuild(hit) {
  const { readLitematic, blockKey } = await reader()
  const { sx, sy, sz, palette, indexAt } = readLitematic(join(hit.dir, hit.file))

  // palette index -> OpusMC key, resolved once per palette entry
  const keyOf = palette.map((entry) => blockKey(entry.Name))
  const keys = []
  const keyIndex = new Map()
  const remap = new Int32Array(keyOf.length)
  for (let i = 0; i < keyOf.length; i++) {
    const key = keyOf[i]
    let at = keyIndex.get(key)
    if (at === undefined) {
      at = keys.length
      keys.push(key)
      keyIndex.set(key, at)
    }
    remap[i] = at
  }

  // run-length encode in index order, tracking the non-air bounding box
  const runs = []
  let runValue = -1
  let runLength = 0
  const lo = [sx, sy, sz]
  const hi = [-1, -1, -1]
  for (let y = 0; y < sy; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const v = remap[indexAt(x, y, z)]
        if (v !== 0) {
          if (x < lo[0]) lo[0] = x
          if (y < lo[1]) lo[1] = y
          if (z < lo[2]) lo[2] = z
          if (x > hi[0]) hi[0] = x
          if (y > hi[1]) hi[1] = y
          if (z > hi[2]) hi[2] = z
        }
        if (v === runValue) {
          runLength++
        } else {
          if (runLength > 0) runs.push(runValue, runLength)
          runValue = v
          runLength = 1
        }
      }
    }
  }
  if (runLength > 0) runs.push(runValue, runLength)

  const content = hi[0] >= 0 ? { min: lo, max: hi } : { min: [0, 0, 0], max: [sx - 1, sy - 1, sz - 1] }
  return { id: hit.id, size: [sx, sy, sz], content, keys, runs }
}

/** Serve one file from the bundled viewer directory, rejecting traversal. */
async function serveFile(relPath) {
  const target = resolve(join(VIEWER_DIR, relPath))
  if (target !== VIEWER_DIR && !target.startsWith(VIEWER_DIR + sep)) {
    return new Response(null, { status: 403 })
  }
  let body
  try {
    body = await readFile(target)
  } catch {
    return new Response(null, { status: 404 })
  }
  const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream'
  return new Response(body, { status: 200, headers: { 'content-type': type, 'cache-control': 'no-cache' } })
}

/** Answer one /opusmc request. */
async function handle(request) {
  const url = new URL(request.url)
  let path = url.pathname.slice(BASE.length) || '/'
  if (path === '/' || path === '') path = '/viewer.html'

  if (path === '/api/builds') return json({ builds: await listBuilds() })

  if (path.startsWith('/api/build/')) {
    const id = decodeURIComponent(path.slice('/api/build/'.length))
    const builds = await listBuilds()
    const hit = builds.find((b) => b.id === id)
    if (hit === undefined) return json({ error: 'unknown build' }, 404)
    return json(await convertBuild(hit))
  }

  return serveFile(path)
}

// Skills registered into the agent's catalog. Descriptions are what the agent
// sees; bodies load on demand, so registering all four costs almost nothing.
//   mc-build-plan          — plan before building (was the only one)
//   mc-architecture-workflow — end-to-end总控: 方案→建造→诊断→P0~P5美化→双检测→QA
//   build-litematic        — the full aesthetic workflow for .litematic builds
//   superflat-beautify     — 超平坦美化与一致性规范（45KB 手法库：立面12手法/60-30-10/断节检测）
const SKILLS = [
  { content: 'skills/plan-skill.md', meta: 'skills/plan-skill-meta.json' },
  { content: 'skills/workflow-skill.md', meta: 'skills/workflow-skill-meta.json' },
  { content: 'skills/skill.md', meta: 'skills/skill-meta.json' },
  { content: 'skills/superflat-beautify.md', meta: 'skills/superflat-beautify-meta.json' },
]

/** Register the planning skill so the agent plans before constructing. */
function mountSkill(ctx) {
  const skills = ctx.get?.('skills')
  if (skills?.register === undefined) return
  for (const spec of SKILLS) {
    Promise.all([
      readFile(join(BUNDLE_DIR, spec.content), 'utf8'),
      readFile(join(BUNDLE_DIR, spec.meta), 'utf8').then((s) => JSON.parse(s)),
    ]).then(([content, meta]) => {
      try {
        skills.register({
          name: meta.name,
          description: meta.description,
          content,
          source: 'plugin:dsh-opusmc-viewer',
        })
      } catch (e) {
        console.warn(`[opusmc-viewer] skill ${spec.meta} registration failed:`, e && e.message || e)
      }
    }).catch(() => { /* a missing skill file must not break the viewer */ })
  }
}

/** Register the mc_* construction tools. */
function mountTools(ctx) {
  const tools = ctx.get?.('tools')
  if (tools?.register === undefined) return
  freshMCTools().then((makeTools) => {
    const created = makeTools()
    const disposers = created.map((t) => tools.register(t)).filter((d) => typeof d === 'function')
    // Code-path builder, registered next to the primitives. Wrapped so a
    // failure here can never take the mc_* tools down with it.
    try {
      const codeTool = createMcBuildTool(console)
      codeTool.name = 'mc_build_code'
      codeTool.description = '[进阶] 写一段完整构建程序直接产出 .litematic：可用 Arena/aesthetic_kit/scenery 的构件与循环，'
        + '能做贴面、细节、配景与自动美学体检，精度远高于逐个摆原语。' + codeTool.description
      const d = tools.register(codeTool)
      if (typeof d === 'function') disposers.push(d)
    } catch (e) {
      console.warn('[opusmc-viewer] mc_build_code registration failed:', e && e.message || e)
    }
    if (disposers.length && typeof ctx.effect === 'function') {
      ctx.effect(() => () => disposers.forEach((d) => d()), 'opusmc-viewer: mc_* tools')
    }
  }).catch((e) => console.warn('[opusmc-viewer] tool registration failed:', e && e.message || e))
}

/**
 * Register the route, the plan skill and the construction tools.
 * @param ctx - plugin context carrying the webServer service.
 */
export function apply(ctx) {
  mountSkill(ctx)
  mountTools(ctx)
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: BASE,
      resource: (request) => handle(request),
    }), 'opusmc-viewer: route')
}