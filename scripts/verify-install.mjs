#!/usr/bin/env node
// Self-check for an installed copy of dsh-opusmc-viewer.
//
// Mounts the plugin against a minimal DSH host, serves its routes over real
// HTTP, builds and exports a blueprint, and reports pass/fail per check. Use it
// to confirm an install actually works before blaming the plugin:
//
//   node scripts/verify-install.mjs                 # check this package
//   node scripts/verify-install.mjs <plugin-dir>    # check another install
//
// Exits 1 if any check fails. No external dependencies.

import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.resolve(process.argv[2] || path.join(here, '..'))
const BASE = 'http://127.0.0.1'

if (!fs.existsSync(path.join(pluginDir, 'index.js'))) {
  console.error(`not a plugin directory (no index.js): ${pluginDir}`)
  process.exit(1)
}

console.log(`checking plugin at: ${pluginDir}\n`)

const routes = []
const tools = []
const skills = []

const ctx = {
  get(service) {
    if (service === 'skills') return { register: (s) => { if (!s || !s.name) throw new Error('skill needs a name'); skills.push(s) } }
    if (service === 'tools') return { register: (t) => { if (!t || !t.name) throw new Error('tool needs a name'); tools.push(t); return () => {} } }
    return undefined
  },
  effect(fn) { fn() },
  webServer: { register: (spec) => routes.push(spec) },
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

function serve(port) {
  const server = http.createServer(async (req, res) => {
    const match = routes.find((r) => r.kind === 'prefix' && req.url.startsWith(r.path))
    if (!match) { res.writeHead(404).end('no route'); return }
    try {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, String(v))
      const response = await match.resource(new Request(BASE + ':' + port + req.url, { method: req.method, headers }))
      const body = Buffer.from(await response.arrayBuffer())
      const out = {}
      response.headers.forEach((v, k) => { out[k] = v })
      res.writeHead(response.status, out).end(body)
    } catch (e) {
      res.writeHead(500).end('handler error: ' + (e && e.message))
    }
  })
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)))
}

const mod = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href)
check('exports name / inject / apply',
  mod.name === 'opusmc-viewer' && Array.isArray(mod.inject) && typeof mod.apply === 'function',
  `name=${mod.name}`)

mod.apply(ctx)
await new Promise((r) => setTimeout(r, 600))

check('webServer route registered', routes.some((r) => r.path === '/opusmc'))
check('skills registered', skills.length === 4, skills.map((s) => s.name).join(', '))
check('tools registered', tools.length >= 14, tools.length + ' tools')

const port = 42000 + (process.pid % 1000)
const server = await serve(port)
const get = async (p) => {
  const r = await fetch(`${BASE}:${port}${p}`)
  const buf = Buffer.from(await r.arrayBuffer())
  return { status: r.status, bytes: buf.length, body: buf }
}

try {
  const viewer = await get('/opusmc/viewer.html')
  check('GET /opusmc/viewer.html', viewer.status === 200 && viewer.bytes > 1000, `${viewer.bytes} bytes`)

  const builds = JSON.parse((await get('/opusmc/api/builds')).body.toString())
  check('build list responds', Array.isArray(builds.builds), builds.builds.map((b) => b.id).join(', ') || 'empty')
  const sample = builds.builds.find((b) => b.sample === true)
  check('bundled sample is listed', Boolean(sample), sample ? sample.id : 'none')

  if (sample) {
    const conv = JSON.parse((await get('/opusmc/api/build/' + sample.id)).body.toString())
    const cells = conv.runs.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0)
    const vol = conv.size[0] * conv.size[1] * conv.size[2]
    check('blueprint converts completely', cells === vol, `${conv.size.join('x')}, ${cells}/${vol} cells`)
  }

  check('unknown build -> 404', (await get('/opusmc/api/build/nope')).status === 404)
  check('traversal refused', [403, 404].includes((await get('/opusmc/../package.json')).status))

  const asset = await get('/opusmc/viewer.js')
  check('viewer engine served', asset.status === 200 && asset.bytes > 1000, `${asset.bytes} bytes`)

  // Build, render and export in a throwaway project so the install stays clean.
  const { createMCTools } = await import(pathToFileURL(path.join(pluginDir, 'mctools.mjs')).href)
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'opusmc-selfcheck-'))
  const t = createMCTools({ projectDir: out })
  const run = (n, a) => t.find((x) => x.name === n).execute(a)
  try {
    await run('mc_init', { size: [16, 12, 16] })
    const built = await run('mc_build', { shape: 'box', block: 'minecraft:stone_bricks', box: [1, 1, 1, 8, 5, 8] })
    check('mc_build works', built.changed > 0, built.changed + ' blocks')

    const win = await run('mc_window', { x: 9, y: 3, z: 4, axis: 'x', w: 3, h: 3 })
    check('mc_window works', win.ok === true, win.changed + ' blocks')

    const shot = await run('mc_screenshot', { view: 'persp', scale: 4, name: 'selfcheck' })
    check('mc_screenshot works', shot.ok && fs.existsSync(shot.file))

    const exp = await run('mc_export', { name: 'selfcheck' })
    check('mc_export verifies', exp.ok && exp.verify === 'OK' && fs.existsSync(exp.file), exp.verify)
  } finally {
    fs.rmSync(out, { recursive: true, force: true })
  }
} finally {
  server.close()
}

const failed = results.filter((r) => !r.ok)
console.log('\n' + '='.repeat(56))
console.log(`${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('\nfailed:')
  for (const f of failed) console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : ''))
  process.exit(1)
}
console.log('install looks healthy.')