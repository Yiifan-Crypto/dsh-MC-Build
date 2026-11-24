import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLE_DIR } from '../paths.mjs'

const pkg = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
const clientSource = readFileSync(join(BUNDLE_DIR, 'client.js'), 'utf8')

/** The module id the client bundle registers itself under. */
function clientModuleId(source) {
  const m = /__ModuleLoader__\s*\.\s*load\(\s*\{\s*id\s*:\s*['"`]([^'"`]+)['"`]/.exec(source)
  return m ? m[1] : null
}

test('client.js registers a module id equal to the package name', () => {
  // DSH mounts client bundles by package name. If the id inside client.js
  // drifts from package.json name, the host half loads but no client UI is
  // injected — the plugin silently loses its panel with no error anywhere.
  const id = clientModuleId(clientSource)
  assert.ok(id, 'client.js declares a __ModuleLoader__.load({ id }) module id')
  assert.equal(
    id,
    pkg.name,
    `client module id (${id}) must match package name (${pkg.name}); ` +
      'a mismatch makes DSH skip the client bundle, so the panel never appears',
  )
})

test('the client bundle declares the web platform it is injected into', () => {
  const client = pkg.dsh && pkg.dsh.client
  assert.ok(client, 'package.json declares dsh.client')
  assert.equal(client.platform, 'web')
  assert.ok(Array.isArray(client.inject) && client.inject.length > 0, 'client.inject lists its host slots')
})

test('the client bundle is reachable through the package exports', () => {
  assert.equal(pkg.exports['./client'], './client.js')
  assert.ok(pkg.files.includes('client.js'), 'client.js ships in the published package')
})

test('no shipping source still references the retired private package name', () => {
  const retired = '@local/opusmc-viewer'
  const files = ['index.js', 'client.js', 'paths.mjs', 'mctools.mjs', 'mcbuild.mjs', 'render-shot.cjs', 'cordis.patch.yml']
  for (const f of files) {
    const text = readFileSync(join(BUNDLE_DIR, f), 'utf8')
    assert.equal(
      text.includes(retired),
      false,
      `${f} still references ${retired} — that name does not exist for GitHub installs`,
    )
  }
})