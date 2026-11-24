import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

/** Build a minimal Cordis-like context that captures the registered route. */
function mockContext() {
  const route = { kind: 'prefix', path: null, resource: null }
  const registeredSkills = []
  const registeredTools = []
  const effects = []
  const ctx = {
    get(name) {
      if (name === 'skills') return { register: (spec) => registeredSkills.push(spec) }
      if (name === 'tools') return { register: (t) => registeredTools.push(t) }
      return undefined
    },
    effect(fn, label) {
      effects.push({ label, dispose: fn() })
    },
    webServer: {
      register: (spec) => { Object.assign(route, spec) },
    },
  }
  return { ctx, route, registeredSkills, registeredTools, effects }
}

test('apply registers the /opusmc prefix route, skills and tools', async () => {
  const { ctx, route, registeredSkills, registeredTools } = mockContext()
  apply(ctx)

  // The route is registered through ctx.effect -> webServer.register.
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/opusmc')
  assert.equal(typeof route.resource, 'function')

  // Wait for the async skill/tool registration promises to settle.
  await new Promise((r) => setTimeout(r, 300))

  const skillNames = registeredSkills.map((s) => s.name).sort()
  assert.deepEqual(skillNames, [
    'build-litematic', 'mc-architecture-workflow', 'mc-build-plan', 'superflat-beautify',
  ])
  for (const s of registeredSkills) {
    assert.ok(s.content && s.content.length > 0, `${s.name} has content`)
    assert.equal(s.source, 'plugin:dsh-opusmc-viewer')
  }

  const toolNames = registeredTools.map((t) => t.name)
  assert.ok(toolNames.includes('mc_build_code'), 'the code-path builder is registered')
  assert.ok(toolNames.includes('mc_build'))
})

test('the /opusmc route serves the viewer and the builds API', async () => {
  const { ctx, route } = mockContext()
  apply(ctx)
  await new Promise((r) => setTimeout(r, 300))

  const get = async (path) => {
    const res = await route.resource(new Request('http://localhost' + path))
    return { status: res.status, body: await res.text() }
  }

  // The viewer HTML is served from the bundled viewer directory.
  const viewer = await get('/opusmc/viewer.html')
  assert.equal(viewer.status, 200)
  assert.match(viewer.body, /<html|<!DOCTYPE/i)

  // The builds list is a JSON envelope. A fresh install has no output/ yet,
  // but the bundled sample must still be listed so the panel is never empty.
  const builds = await get('/opusmc/api/builds')
  assert.equal(builds.status, 200)
  const parsed = JSON.parse(builds.body)
  assert.ok(Array.isArray(parsed.builds))
  const sample = parsed.builds.find((b) => b.sample === true)
  assert.ok(sample, 'the bundled sample blueprint is listed for fresh installs')
  assert.ok(sample.blocks > 0, 'the sample sidecar is read (block count present)')

  // The sample converts to a viewer payload like any other build.
  const payload = await get('/opusmc/api/build/' + sample.id)
  assert.equal(payload.status, 200)
  const conv = JSON.parse(payload.body)
  assert.ok(Array.isArray(conv.keys) && conv.keys.includes('air'))
  assert.ok(Array.isArray(conv.runs) && conv.runs.length > 0)

  // An unknown build id is a clean 404, not a crash.
  const missing = await get('/opusmc/api/build/does-not-exist')
  assert.equal(missing.status, 404)
  assert.match(JSON.parse(missing.body).error, /unknown build/)

  // Path traversal out of the viewer directory is refused.
  const traversal = await get('/opusmc/../index.js')
  assert.ok(traversal.status === 403 || traversal.status === 404, 'traversal is not served')
})
