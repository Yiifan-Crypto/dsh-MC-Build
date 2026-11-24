import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCRIPTS_DIR } from '../paths.mjs'

const require = createRequire(import.meta.url)
const { Arena, save, readLitematic, verifyFile, DATA_VERSION } = require(join(SCRIPTS_DIR, 'litematic.cjs'))

function tmp() {
  return mkdtempSync(join(tmpdir(), 'opusmc-litematic-'))
}

test('Arena -> save -> readLitematic round-trips dimensions and blocks', () => {
  const dir = tmp()
  try {
    const a = new Arena('roundtrip', 'test', 8, 6, 7)
    a.box(0, 0, 0, 7, 0, 6, 'minecraft:grass_block')
    a.box(1, 1, 1, 6, 4, 5, 'minecraft:stone_bricks')
    a.set(3, 2, 3, 'minecraft:oak_stairs', { facing: 'east', half: 'bottom' })

    const file = join(dir, 'roundtrip.litematic')
    const info = save(a, file)
    assert.equal(info.blocks > 0, true, 'save reports a non-zero block count')

    const back = readLitematic(file)
    assert.deepEqual([back.sx, back.sy, back.sz], [8, 6, 7])
    assert.equal(back.pal.length, a.palette.length, 'the palette survives the round-trip')

    // nameAt returns the block name at a cell; it must match the source model.
    let mismatches = 0
    for (let y = 0; y < back.sy; y++) {
      for (let z = 0; z < back.sz; z++) {
        for (let x = 0; x < back.sx; x++) {
          const srcId = a.get(x, y, z)
          const srcName = srcId ? a.palette[srcId].name : 'minecraft:air'
          if (back.nameAt(x, y, z) !== srcName) mismatches++
        }
      }
    }
    assert.equal(mismatches, 0, 'every cell round-trips to the same block')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('verifyFile accepts a written blueprint and rejects a truncated one', () => {
  const dir = tmp()
  try {
    const a = new Arena('verify', 'test', 6, 4, 6)
    a.box(1, 1, 1, 4, 3, 4, 'minecraft:diorite')
    const file = join(dir, 'verify.litematic')
    save(a, file)

    const ok = verifyFile(file)
    assert.equal(ok.ok, true, 'a complete blueprint verifies')
    assert.deepEqual(ok.size, [6, 4, 6])

    // Corrupt the payload: verification must not report success on bad input.
    const bad = join(dir, 'bad.litematic')
    const buf = require('node:fs').readFileSync(file)
    require('node:fs').writeFileSync(bad, buf.subarray(0, Math.floor(buf.length / 2)))
    assert.throws(() => verifyFile(bad), 'a truncated blueprint is rejected, not accepted')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('DATA_VERSION matches the Minecraft version the writer targets', () => {
  // 1.20.4 -> 3700. Guard against an accidental bump that would break
  // Litematica's ability to read the output.
  assert.equal(DATA_VERSION, 3700)
})
