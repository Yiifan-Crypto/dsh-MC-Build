import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLE_DIR } from '../paths.mjs'
import { currentVersion, compareVersions, highestTag } from '../version.mjs'

const pkg = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))

test('currentVersion matches package.json', () => {
  assert.equal(currentVersion(), pkg.version)
})

test('compareVersions orders by numeric segment, not string', () => {
  assert.ok(compareVersions('3.0.6', '3.0.5') > 0)
  assert.ok(compareVersions('3.0.5', '3.0.5') === 0)
  assert.ok(compareVersions('3.0.5', '3.0.6') < 0)
  // the classic string-sort trap: "3.0.10" must beat "3.0.9"
  assert.ok(compareVersions('3.0.10', '3.0.9') > 0)
  assert.ok(compareVersions('3.1.0', '3.0.9') > 0)
  assert.ok(compareVersions('v3.0.6', '3.0.5') > 0, 'a leading v is ignored')
})

test('highestTag picks the greatest semantic tag and ignores junk', () => {
  const output = [
    'aaaa\trefs/tags/v3.0.4',
    'bbbb\trefs/tags/v3.0.5',
    'cccc\trefs/tags/v3.0.10',
    'dddd\trefs/tags/v3.1.0',
    'eeee\trefs/tags/nightly',
    'ffff\trefs/tags/v3.1.0^{}',
    'gggg\trefs/heads/main',
  ].join('\n')
  assert.equal(highestTag(output), '3.1.0')
})

test('highestTag returns null when there are no version tags', () => {
  assert.equal(highestTag('aaaa\trefs/heads/main\nbbbb\trefs/tags/nightly'), null)
  assert.equal(highestTag(''), null)
})

test('/api/version reports the installed version and a shape the panel can render', async () => {
  const { apply } = await import('../index.js')
  const route = { kind: '', path: '', resource: null }
  const ctx = {
    get: (s) => (s === 'skills' ? { register() {} } : s === 'tools' ? { register() { return () => {} } } : undefined),
    effect: (fn) => { fn() },
    webServer: { register: (spec) => Object.assign(route, spec) },
  }
  apply(ctx)
  await new Promise((r) => setTimeout(r, 300))

  const res = await route.resource(new Request('http://localhost/opusmc/api/version'))
  assert.equal(res.status, 200)
  const body = await res.json()

  assert.equal(typeof body.current, 'string')
  assert.equal(body.current, pkg.version, 'reports the version actually installed')
  assert.equal(typeof body.hasUpdate, 'boolean')
  // latest may legitimately be null when the network or tags are unavailable;
  // in that case an explanatory error must come with it rather than silence.
  if (body.latest === null) {
    assert.equal(typeof body.error, 'string')
    assert.ok(body.error.length > 0, 'a missing latest version explains itself')
  } else {
    assert.equal(body.error, null)
    assert.equal(typeof body.latest, 'string')
  }
})

test('/api/update refuses an unconfirmed GET so a stray link cannot trigger an install', async () => {
  const { apply } = await import('../index.js')
  const route = { kind: '', path: '', resource: null }
  const ctx = {
    get: (s) => (s === 'skills' ? { register() {} } : s === 'tools' ? { register() { return () => {} } } : undefined),
    effect: (fn) => { fn() },
    webServer: { register: (spec) => Object.assign(route, spec) },
  }
  apply(ctx)
  await new Promise((r) => setTimeout(r, 300))

  const res = await route.resource(new Request('http://localhost/opusmc/api/update'))
  assert.equal(res.status, 405)
  const body = await res.json()
  assert.match(body.error, /confirm|POST/i)
})

test('/api/update accepts ?confirm=1 even when the request carries no method', async () => {
  // The DSH webserver does not always pass the HTTP method through, which is
  // exactly how the panel's update button ended up getting 405.
  const { apply } = await import('../index.js')
  const route = { kind: '', path: '', resource: null }
  const ctx = {
    get: (s) => (s === 'skills' ? { register() {} } : s === 'tools' ? { register() { return () => {} } } : undefined),
    effect: (fn) => { fn() },
    webServer: { register: (spec) => Object.assign(route, spec) },
  }
  apply(ctx)
  await new Promise((r) => setTimeout(r, 300))

  // A request-shaped object with no method, like the one DSH hands over.
  const res = await route.resource({
    url: 'http://localhost/opusmc/api/update?confirm=1',
    method: undefined,
  })
  assert.notEqual(res.status, 405, 'an explicit confirmation must be accepted')
  const body = await res.json()
  // Either "already up to date" (ok:true, from===to) or "cannot install from
  // here" (ok:false with a reason) is fine — what must never happen is the
  // method rejection that made the panel's update button useless.
  assert.equal(typeof body.ok, 'boolean')
  if (body.ok === false) {
    assert.ok(typeof body.error === 'string' && body.error.length > 0, 'the failure explains itself')
  } else {
    assert.equal(typeof body.from, 'string')
  }
})