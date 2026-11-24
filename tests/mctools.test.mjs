import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMCTools } from '../mctools.mjs'

/** Tools bound to a throwaway project dir so file-writing tools never touch the repo. */
function makeTools() {
  const projectDir = mkdtempSync(join(tmpdir(), 'opusmc-proj-'))
  const tools = createMCTools({ projectDir })
  return { tools, projectDir, by: (n) => tools.find((t) => t.name === n), run: (n, a) => tools.find((t) => t.name === n).execute(a) }
}

test('the mc_* tool set is registered with full parameter schemas', () => {
  const { tools, projectDir, by } = makeTools()
  try {
    const expected = [
      'mc_health', 'mc_scan', 'mc_build', 'mc_palette', 'mc_window', 'mc_entrance',
      'mc_facade', 'mc_init', 'mc_set_blocks', 'mc_region', 'mc_undo',
      'mc_screenshot', 'mc_clear', 'mc_export',
    ]
    for (const name of expected) {
      const t = by(name)
      assert.ok(t, `${name} is registered`)
      assert.equal(typeof t.execute, 'function')
      assert.ok(t.parameters && t.parameters.type === 'object', `${name} declares an object schema`)
    }
    assert.ok(tools.length >= expected.length)
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_init -> mc_build -> mc_health reports the placed blocks', async () => {
  const { run, projectDir } = makeTools()
  try {
    const init = await run('mc_init', { size: [24, 16, 24] })
    assert.equal(init.ok, true)
    assert.deepEqual(init.size, [24, 16, 24])

    const built = await run('mc_build', {
      shape: 'box', block: 'minecraft:stone_bricks',
      box: [1, 1, 1, 10, 6, 10],
    })
    assert.equal(built.changed > 0, true, 'the box placed blocks')
    assert.equal(built.block, 'minecraft:stone_bricks')

    const health = await run('mc_health', {})
    assert.equal(health.ok, true)
    assert.deepEqual(health.size, [24, 16, 24])
    assert.ok(health.blocks >= 10 * 6 * 10, 'health counts the placed box')
    assert.equal(health.undoDepth, 1, 'one build step is undoable')
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_scan counts blocks and reports a bounding box', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [16, 12, 16] })
    await run('mc_build', { shape: 'box', block: 'minecraft:diorite', box: [2, 2, 2, 6, 5, 6] })

    const counted = await run('mc_scan', { mode: 'count' })
    assert.equal(counted.mode, 'count')
    assert.ok(counted.total > 0)
    assert.ok(counted.blocks.some((b) => b.block === 'minecraft:diorite'))

    // Default scan starts at y=1, so the y=0 ground is excluded from the bbox.
    const boxed = await run('mc_scan', { mode: 'bbox' })
    assert.deepEqual(boxed.min, [2, 2, 2])
    assert.deepEqual(boxed.max, [6, 5, 6])
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_undo rolls back a build incrementally', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [16, 12, 16] })
    await run('mc_build', { shape: 'box', block: 'minecraft:stone', box: [1, 1, 1, 4, 3, 4] })
    const before = await run('mc_health', {})

    const undone = await run('mc_undo', {})
    assert.equal(undone.undone, 1)
    assert.ok(undone.blocksRestored > 0)

    const after = await run('mc_health', {})
    assert.equal(after.blocks, before.blocks - undone.blocksRestored, 'the build was rolled back')
    assert.equal(after.undoDepth, 0)
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_region copy and rotate carry block states', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [20, 12, 20] })
    await run('mc_set_blocks', {
      blocks: [
        [1, 1, 1, 'minecraft:oak_stairs[facing=north,half=bottom]'],
        [1, 2, 1, 'minecraft:oak_stairs[facing=north,half=bottom]'],
        [2, 1, 1, 'minecraft:stone_bricks'],
      ],
    })

    const copied = await run('mc_region', { op: 'copy', box: [1, 1, 1, 2, 2, 1], to: [5, 1, 1] })
    assert.equal(copied.op, 'copy')
    assert.ok(copied.changed >= 3, 'the region was copied')

    // Rotating the copied stair column 90° clockwise turns facing north -> east.
    const rotated = await run('mc_region', { op: 'rotate', box: [5, 1, 1, 5, 2, 1], cx: 5, cz: 1, degrees: 90 })
    assert.equal(rotated.op, 'rotate')
    assert.ok(rotated.changed >= 1)

    const scan = await run('mc_scan', { mode: 'count', box: [5, 1, 1, 5, 2, 1] })
    assert.ok(scan.total >= 2, 'the rotated column still has blocks')
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_set_blocks accepts inline and object block states', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [12, 10, 12] })
    const inline = await run('mc_set_blocks', {
      blocks: [[1, 1, 1, 'minecraft:oak_stairs[facing=east]']],
    })
    assert.ok(inline.changed >= 1)
    const explicit = await run('mc_set_blocks', {
      blocks: [[2, 1, 1, 'minecraft:oak_stairs', { facing: 'west', half: 'top' }]],
    })
    assert.ok(explicit.changed >= 1)
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_palette returns concrete blocks for a style and lists styles otherwise', async () => {
  const { run, projectDir } = makeTools()
  try {
    const styles = await run('mc_palette', {})
    assert.equal(styles.ok, true)
    assert.ok(Array.isArray(styles.styles) && styles.styles.length > 0, 'styles are listed')

    const picked = await run('mc_palette', { style: styles.styles[0] })
    assert.equal(picked.ok, true)
    assert.ok(picked.main, 'a style resolves to a concrete main block')
    assert.ok(Array.isArray(picked.aux) && picked.aux.length > 0, 'a style resolves to aux blocks')
    assert.ok(Array.isArray(picked.accent) && picked.accent.length > 0, 'a style resolves to accent blocks')
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_export writes a .litematic that verifies', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [16, 12, 16] })
    await run('mc_build', { shape: 'box', block: 'minecraft:stone_bricks', box: [1, 1, 1, 8, 5, 8] })
    const out = await run('mc_export', { name: 'exported-house' })
    assert.equal(out.ok, true, 'export verifies')
    assert.equal(out.verify, 'OK')
    assert.ok(existsSync(out.file), 'the .litematic file exists')
    assert.ok(out.file.endsWith('.litematic'))
    assert.ok(out.file.startsWith(projectDir), 'export lands in the configured project')
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_screenshot renders a PNG without a browser', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [16, 12, 16] })
    await run('mc_build', { shape: 'box', block: 'minecraft:stone_bricks', box: [1, 1, 1, 8, 5, 8] })
    const shot = await run('mc_screenshot', { view: 'persp', scale: 4, name: 'shot-test' })
    assert.equal(shot.ok, true)
    assert.ok(existsSync(shot.file), 'the PNG exists')
    const head = readFileSync(shot.file).subarray(0, 8)
    assert.deepEqual([...head], [137, 80, 78, 71, 13, 10, 26, 10], 'the file is a PNG')
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('mc_clear removes everything above yMin and is undoable', async () => {
  const { run, projectDir } = makeTools()
  try {
    await run('mc_init', { size: [16, 12, 16] })
    await run('mc_build', { shape: 'box', block: 'minecraft:stone', box: [1, 1, 1, 6, 6, 6] })
    const cleared = await run('mc_clear', { yMin: 1 })
    assert.ok(cleared.changed > 0)

    const health = await run('mc_health', {})
    assert.equal(health.blocks, 16 * 16, 'only the y=0 ground remains')

    const undone = await run('mc_undo', {})
    assert.equal(undone.undone, 1)
    const restored = await run('mc_health', {})
    assert.ok(restored.blocks > health.blocks, 'the cleared blocks came back')
  } finally {
    rmSync(projectDir, { recursive: true, force: true })
  }
})
