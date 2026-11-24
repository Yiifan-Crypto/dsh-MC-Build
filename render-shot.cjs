'use strict';
// One-shot, in-process renderer for an Arena model. No browser, no WebGL, no
// persistent process. Renders a PNG for the AI to inspect and iterate.
// Isometric projection adapted from build-litematic/scripts/iso_preview.cjs
// (already verified to produce good-looking previews).

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
// Colour table comes from the vendored build scripts shipped inside this
// bundle — never a machine-specific absolute path.
const { colorOf } = require(path.join(__dirname, 'scripts', 'litematic.cjs'));

const AIR = 'minecraft:air';
const WATER = 'minecraft:water';

function writePNG(file, w, h, rgba) {
  function crc(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcb = Buffer.alloc(4); crcb.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcb]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

function shade(c, f) { return c.map((v) => Math.max(0, Math.min(255, Math.round(v * f)))); }

function render(model, opts = {}) {
  const S = Math.max(2, Math.min(14, opts.scale || 7));
  let view = opts.view || 'persp';
  // cutaway: hide the roof above cutY so an enclosed interior is visible.
  const cutY = opts.cutY === undefined ? -1 : opts.cutY;
  if (view === 'cutaway') view = 'persp';
  const yaw = opts.yaw === undefined ? Math.PI / 4 : opts.yaw;
  const nameAtRaw = (x, y, z) => {
    if (x < 0 || z < 0 || y < 0 || x >= model.sx || z >= model.sz || y >= model.sy) return AIR;
    const i = model.get(x, y, z);
    return i ? model.palette[i].name : AIR;
  };
  // cutaway hides everything above cutY (roof) so the interior becomes visible.
  const nameAt = (x, y, z) => (cutY >= 0 && y > cutY) ? AIR : nameAtRaw(x, y, z);

  // Focus box: built blocks above the y=0 ground. Only this region is drawn so
  // a small build in a large world isn't dwarfed by the whole ground plane.
  let min = [Infinity, Infinity, Infinity], max = [-1, -1, -1];
  for (let z = 0; z < model.sz; z++) for (let x = 0; x < model.sx; x++) {
    for (let y = 1; y < model.sy; y++) {
      if (nameAt(x, y, z) !== AIR && nameAt(x, y, z) !== WATER) {
        if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
        if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
        if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
      }
    }
  }
  if (max[0] < 0) { const cx = (model.sx / 2) | 0, cz = (model.sz / 2) | 0; min = [cx - 6, 1, cz - 6]; max = [cx + 6, 4, cz + 6]; }
  const x0 = Math.max(0, min[0] - 1), x1 = Math.min(model.sx - 1, max[0] + 1);
  const z0 = Math.max(0, min[2] - 1), z1 = Math.min(model.sz - 1, max[2] + 1);
  const ys = Math.max(2, max[1] + 1);

  // For each column, find the top non-air block (including y=0 ground).
  const cols = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    let top = -1;
    for (let y = ys; y >= 0; y--) { const n = nameAt(x, y, z); if (n !== AIR && n !== WATER) { top = y; break; } }
    if (top >= 0) cols.push({ x, z, y: top, n: nameAt(x, top, z) });
  }

  const rgba = (w, h) => Buffer.alloc(w * h * 4);
  const sky = (buf, w, h) => {
    for (let py = 0; py < h; py++) { const t = py / h; const r = Math.round(132 + 58 * t), g = Math.round(182 + 42 * t), b = Math.round(235 + 12 * t); for (let px = 0; px < w; px++) { const o = (py * w + px) * 4; buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255; } }
  };
  let W, H, buf, fill, poly;

  if (view === 'top') {
    W = (x1 - x0 + 1) * S + 24; H = (z1 - z0 + 1) * S + 24;
    buf = rgba(W, H); sky(buf, W, H);
    fill = (px, py, w, h, col) => { for (let y = Math.max(0, py | 0); y < Math.min(H, py + h); y++) for (let x = Math.max(0, px | 0); x < Math.min(W, px + w); x++) { const o = (y * W + x) * 4; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = 255; } };
    for (const c of cols) fill(12 + (c.x - x0) * S, 12 + (c.z - z0) * S, S, S, shade(colorOf(c.n), 0.98));
    return { width: W, height: H, buf };
  }

  if (view === 'side') {
    W = (x1 - x0 + 1) * S + 24; H = (ys + 1) * S + 24;
    buf = rgba(W, H); sky(buf, W, H);
    fill = (px, py, w, h, col) => { for (let y = Math.max(0, py | 0); y < Math.min(H, py + h); y++) for (let x = Math.max(0, px | 0); x < Math.min(W, px + w); x++) { const o = (y * W + x) * 4; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = 255; } };
    for (let y = ys; y >= 0; y--) for (let x = x0; x <= x1; x++) {
      for (let z = z1; z >= z0; z--) { const n = nameAt(x, y, z); if (n !== AIR && n !== WATER) { fill(12 + (x - x0) * S, 12 + (ys - y) * S, S, S, shade(colorOf(n), 0.95)); break; } }
    }
    return { width: W, height: H, buf };
  }

  // Isometric — same projection as iso_preview.cjs (verified good). Work in
  // focus-local grid coords (0..n) so a small build centres in the frame.
  //   screenX = (rx - rz) * cos45 * S
  //   screenY = (rx + rz) * sin45/2 * S - y * S * 1.05
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const half = Math.PI / 4, ch = Math.cos(half), sh = Math.sin(half) / 2;
  const nx = x1 - x0 + 1, nz = z1 - z0 + 1;
  const ccx = (nx - 1) / 2, ccz = (nz - 1) / 2;
  const sample = (x, z) => {
    const dx = x - x0 - ccx, dz = z - z0 - ccz;
    return [ccx + dx * cos - dz * sin, ccz + dx * sin + dz * cos];
  };
  const span = nx + nz;
  W = Math.ceil(span * 0.707 * S) + 60;
  H = Math.ceil(span * 0.354 * S + (ys + 1) * S * 1.05) + 60;
  buf = rgba(W, H); sky(buf, W, H);
  const cx = W / 2, cy = Math.round((ys + 1) * S * 0.55) + 30;
  const project = (x, z, y) => {
    const [rx, rz] = sample(x, z);
    return [cx + (rx - rz) * ch * S, cy + (rx + rz) * sh * S - y * S * 1.05];
  };
  poly = (pts, col) => {
    const ys2 = pts.map((p) => p[1]); const ya = Math.max(0, Math.floor(Math.min(...ys2))), yb = Math.min(H - 1, Math.ceil(Math.max(...ys2)));
    for (let y = ya; y <= yb; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) { const a1 = pts[i], a2 = pts[(i + 1) % pts.length]; if ((a1[1] <= y && a2[1] > y) || (a2[1] <= y && a1[1] > y)) xs.push(a1[0] + (y - a1[1]) / (a2[1] - a1[1]) * (a2[0] - a1[0])); }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) { const xa = Math.max(0, Math.floor(xs[i])), xb = Math.min(W - 1, Math.ceil(xs[i + 1])); for (let x = xa; x <= xb; x++) { const o = (y * W + x) * 4; buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = 255; } }
    }
  };
  // Painter's order: far columns first, taller columns within a diagonal first.
  const stack = cols.slice().sort((a, b) => (a.x + a.z) - (b.x + b.z) || a.y - b.y);
  for (const c of stack) {
    const base = shade(colorOf(c.n), 0.95);
    const colH = (c.y + 1) * S * 1.1; // full extrusion down to ground, like iso_preview
    const [px, py] = project(c.x, c.z, c.y);
    poly([[px, py - S * 0.5], [px + S * Math.cos(half), py], [px, py + S * 0.5], [px - S * Math.cos(half), py]], base);
    poly([[px - S * Math.cos(half), py], [px, py + S * 0.5], [px, py + S * 0.5 + colH], [px - S * Math.cos(half), py + colH]], shade(base, 0.72));
    poly([[px, py + S * 0.5], [px + S * Math.cos(half), py], [px + S * Math.cos(half), py + colH], [px, py + S * 0.5 + colH]], shade(base, 0.85));
  }
  return { width: W, height: H, buf };
}

function renderToFile(model, opts, file) {
  const r = render(model, opts);
  writePNG(file, r.width, r.height, r.buf);
  return { width: r.width, height: r.height, file };
}

module.exports = { render, renderToFile, writePNG };
