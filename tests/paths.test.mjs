import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUNDLE_DIR, DESIGN_DIR, LITEMATIC_DIR, OUTPUT_DIR, SAMPLES_DIR, SHOT_DIR, SCRIPTS_DIR,
  USER_ROOT, VIEWER_DIR, ENV_LITEMATIC_DIR, ENV_PROJECT_DIR, resolveProjectDir,
} from '../paths.mjs'

const SOURCES = ['paths.mjs', 'index.js', 'client.js', 'mctools.mjs', 'mcbuild.mjs', 'render-shot.cjs']

test('bundled assets stay inside the bundle', () => {
  for (const [label, dir] of [['SCRIPTS_DIR', SCRIPTS_DIR], ['VIEWER_DIR', VIEWER_DIR], ['SAMPLES_DIR', SAMPLES_DIR]]) {
    assert.ok(isAbsolute(dir), `${label} is absolute`)
    const rel = relative(BUNDLE_DIR, dir)
    assert.ok(!rel.startsWith('..'), `${label} is inside the bundle`)
  }
})

test('user build output lives OUTSIDE the bundle', () => {
  // Package managers rebuild node_modules on update. If builds were stored in
  // the bundle, `pnpm update` would silently delete the user's work.
  for (const [label, dir] of [['OUTPUT_DIR', OUTPUT_DIR], ['LITEMATIC_DIR', LITEMATIC_DIR], ['SHOT_DIR', SHOT_DIR]]) {
    assert.ok(isAbsolute(dir), `${label} is absolute`)
    assert.ok(
      !dir.toLowerCase().includes('node_modules'),
      `${label} must not sit under node_modules (got ${dir})`,
    )
    assert.ok(dir.startsWith(USER_ROOT), `${label} lives under the DSH home tree`)
  }
})

test('the user output root is the DSH home tree', () => {
  assert.equal(OUTPUT_DIR, join(USER_ROOT, 'opusmc'))
  assert.equal(LITEMATIC_DIR, join(USER_ROOT, 'opusmc', 'litematic'))
})

test('resolveProjectDir defaults to the bundle itself', async () => {
  assert.equal(await resolveProjectDir(), BUNDLE_DIR)
})

test('resolveProjectDir honours an explicit project that ships the CLI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'opusmc-projdir-'))
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    writeFileSync(join(dir, 'scripts', 'litematic.cjs'), '// stub\n')
    assert.equal(await resolveProjectDir(dir), resolve(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveProjectDir falls back to the bundle for a bogus project', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'opusmc-bogus-'))
  try {
    assert.equal(await resolveProjectDir(dir), BUNDLE_DIR, 'a dir without the CLI is skipped')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveProjectDir never returns a path containing traversal segments', async () => {
  const escaped = resolve(BUNDLE_DIR, '..', 'nowhere')
  const result = await resolveProjectDir(escaped)
  assert.ok(!result.split(/[\\/]/).some((seg) => seg === '..'), 'no .. segment survives')
  assert.equal(result, BUNDLE_DIR, 'a traversal-ish path without the CLI falls back to the bundle')
})

test('no plugin source hard-codes a Windows drive-letter path', () => {
  // The plugin must be installable anywhere; a hard-coded D:/ or C:\ path
  // would make it unusable on any other machine. The leading-boundary avoids
  // matching URLs such as https://.
  const re = /(^|[^A-Za-z0-9_])[A-Za-z]:[\\/]/
  for (const src of SOURCES) {
    const text = readFileSync(join(BUNDLE_DIR, src), 'utf8')
    const hits = text.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l))
    assert.equal(hits.length, 0, `${src} contains hard-coded drive paths:\n${hits.map(([n, l]) => `${n}: ${l}`).join('\n')}`)
  }
})

test('paths.mjs advertises the documented environment variables', () => {
  const text = readFileSync(join(BUNDLE_DIR, 'paths.mjs'), 'utf8')
  assert.match(text, new RegExp(ENV_PROJECT_DIR))
  assert.match(text, new RegExp(ENV_LITEMATIC_DIR))
})

test('the bundle directory is the module directory', () => {
  assert.equal(BUNDLE_DIR, resolve(fileURLToPath(new URL('..', import.meta.url))))
})
