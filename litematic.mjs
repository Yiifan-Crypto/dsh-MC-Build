'use strict'
// Minimal .litematic reader (Litematica's CONTIGUOUS bit packing, which crosses
// 64-bit word boundaries) plus the block-name hand-off for the viewer.
//
// The viewer's engine already ships ~1066 vanilla block keys, so the payload
// carries plain vanilla names and the browser resolves them against its own
// registry; this module only decides what to do when a name is unknown.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

/** Parse big-endian NBT (the subset .litematic uses). */
function parseNBT(buf) {
  let p = 0
  const u8 = () => buf.readUInt8(p++)
  const i16 = () => { const v = buf.readInt16BE(p); p += 2; return v }
  const i32 = () => { const v = buf.readInt32BE(p); p += 4; return v }
  const i64 = () => { const v = buf.readBigInt64BE(p); p += 8; return v }
  const str = () => { const n = i16(); const s = buf.toString('utf8', p, p + n); p += n; return s }
  function payload(t) {
    switch (t) {
      case 1: return u8()
      case 2: return i16()
      case 3: return i32()
      case 4: return i64()
      case 5: { const v = buf.readFloatBE(p); p += 4; return v }
      case 6: { const v = buf.readDoubleBE(p); p += 8; return v }
      case 7: { const n = i32(); p += n; return null }
      case 8: return str()
      case 9: { const et = u8(); const n = i32(); const a = []; for (let i = 0; i < n; i++) a.push(payload(et)); return a }
      case 10: { const o = {}; for (;;) { const tt = u8(); if (tt === 0) break; const name = str(); o[name] = payload(tt) } return o }
      case 11: { const n = i32(); const a = []; for (let i = 0; i < n; i++) a.push(i32()); return a }
      case 12: { const n = i32(); const a = []; for (let i = 0; i < n; i++) a.push(i64()); return a }
      default: throw new Error('bad nbt tag ' + t)
    }
  }
  const rt = u8(); str(); return payload(rt)
}

/** Read one region of a .litematic. */
function readLitematic(file) {
  const root = parseNBT(gunzipSync(readFileSync(file)))
  const regionName = Object.keys(root.Regions)[0]
  const r = root.Regions[regionName]
  const sx = r.Size.x, sy = r.Size.y, sz = r.Size.z
  const pal = r.BlockStatePalette
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, pal.length))))
  const longs = r.BlockStates
  const mask = (1n << BigInt(bits)) - 1n
  const indexAt = (x, y, z) => {
    const i = y * sx * sz + z * sx + x
    const start = i * bits
    const sw = Math.floor(start / 64), off = start % 64
    const ew = Math.floor((start + bits - 1) / 64)
    let val = BigInt.asUintN(64, longs[sw]) >> BigInt(off)
    if (ew !== sw) {
      const hb = off + bits - 64
      val |= (BigInt.asUintN(64, longs[ew]) & ((1n << BigInt(hb)) - 1n)) << BigInt(64 - off)
    }
    return Number(val & mask)
  }
  return { sx, sy, sz, palette: pal, indexAt, meta: root.Metadata || {} }
}

export { parseNBT, readLitematic }

/**
 * Vanilla name for the payload. The engine resolves most names directly, so
 * this only strips the namespace; the browser applies the last-resort fallback
 * for anything its registry lacks.
 */
export function blockKey(name) {
  const short = name.replace(/^minecraft:/, '')
  if (short === 'cave_air' || short === 'void_air') return 'air'
  return short
}