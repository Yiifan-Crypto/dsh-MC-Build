import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUNDLE_DIR } from '../paths.mjs'

// Environment variables are read when the modules load, so the redirect
// behaviour is checked in a child process rather than by mutating env here.

function runChild(env, script) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: BUNDLE_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  }).trim()
}

test('mc_* output follows OPUSMC_BUILD_DIR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opusmc-redirect-'))
  try {
    const out = runChild({ OPUSMC_BUILD_DIR: dir, MC_BUILD_PROJECT_DIR: '' }, `
      import { createMCTools } from './mctools.mjs'
      const t = createMCTools()
      const run = (n, a) => t.find((x) => x.name === n).execute(a)
      await run('mc_init', { size: [12, 10, 12] })
      await run('mc_build', { shape: 'box', block: 'minecraft:stone_bricks', box: [1, 1, 1, 6, 4, 6] })
      const r = await run('mc_export', { name: 'redirected' })
      console.log(JSON.stringify({ file: r.file, ok: r.ok }))
    `)
    const parsed = JSON.parse(out)
    assert.equal(parsed.ok, true, 'export verifies')
    assert.ok(
      parsed.file.startsWith(dir),
      `export should land in OPUSMC_BUILD_DIR (${dir}) but went to ${parsed.file}`,
    )
    assert.ok(existsSync(parsed.file), 'the exported file exists')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('without OPUSMC_BUILD_DIR, mc_* output stays inside the bundle', () => {
  const out = runChild({ OPUSMC_BUILD_DIR: '', MC_BUILD_PROJECT_DIR: '' }, `
    import { createMCTools } from './mctools.mjs'
    import { LITEMATIC_DIR } from './paths.mjs'
    const t = createMCTools()
    const run = (n, a) => t.find((x) => x.name === n).execute(a)
    await run('mc_init', { size: [10, 8, 10] })
    const r = await run('mc_export', { name: '.redirect-default-probe' })
    console.log(JSON.stringify({ file: r.file, expected: LITEMATIC_DIR }))
  `)
  const parsed = JSON.parse(out)
  try {
    assert.ok(
      parsed.file.startsWith(parsed.expected),
      `default export should stay in ${parsed.expected} but went to ${parsed.file}`,
    )
  } finally {
    try { rmSync(parsed.file, { force: true }) } catch { /* best effort */ }
    try { rmSync(parsed.file.replace(/\.litematic$/, '.json'), { force: true }) } catch { /* best effort */ }
  }
})