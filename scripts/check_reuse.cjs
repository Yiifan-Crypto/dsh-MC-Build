'use strict';
// check_reuse.cjs — 「不复用历史参数」(P14) 的可执行检查
//
// 思路：把 builder 里的**数值指纹**抽出来（数字字面量 + size 元组 + 十六进制色值），
// 与其他既有 builder 比对重合度。
//   - 尺寸完全相同 + 数值重合度高  → 高度疑似"抄了上一栋的参数"
//   - 只重合少量常数（比如 0/1/2 这类）→ 正常
//
// 只报警不阻断（阻断由设计书的「差异」一节承担），交付时必须解释"为何相同"。
//
// 用法：
//   node scripts/check_reuse.cjs <builder.cjs> [--json]
// 退出码：0 = 无高相似；1 = 疑似复用（仅提示）

const fs = require('fs');
const path = require('path');

const IGNORE = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '100', '1000']);

function digitsOf(source) {
  // 去掉注释与字符串，避免把说明文字里的数字算进来
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const nums = new Set();
  const re = /\b\d+(?:\.\d+)?\b/g;
  let m;
  while ((m = re.exec(stripped))) {
    const v = m[0];
    if (IGNORE.has(v)) continue;
    nums.add(v);
  }
  // 十六进制色值单独记（它们最能体现"抄配色"）
  const hexes = new Set();
  const hre = /#([0-9a-fA-F]{6})\b/g;
  let h;
  while ((h = hre.exec(source))) hexes.add(h[1].toLowerCase());
  return { nums, hexes };
}

function sizeOf(source) {
  // 支持 size:[120,80,120] 与 size:[S, 80, S]（解析 const S = 120 这类简单常量）
  const consts = {};
  const cre = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+(?:\.\d+)?)\s*;/g;
  let cm;
  while ((cm = cre.exec(source))) consts[cm[1]] = cm[2];

  const m = /size\s*:\s*\[\s*([^,\]]+)\s*,\s*([^,\]]+)\s*,\s*([^,\]]+)\s*\]/.exec(source);
  if (!m) return null;
  const resolve = tok => {
    const s = String(tok).trim();
    if (/^\d+(?:\.\d+)?$/.test(s)) return s;
    if (consts[s] !== undefined) return consts[s];
    return null;
  };
  const a = resolve(m[1]), b = resolve(m[2]), c = resolve(m[3]);
  return (a && b && c) ? `${a}x${b}x${c}` : null;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
}

function listBuilders(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.cjs') && !f.startsWith('_'))
      .map(f => path.join(dir, f));
  } catch { return []; }
}

/**
 * @param {string} builderPath 被检查的 builder
 * @param {{dir?:string, base?:string}} opts base = 修改模式下的原建筑 builder
 */
function checkReuse(builderPath, opts = {}) {
  const target = path.resolve(builderPath);
  const src = fs.readFileSync(target, 'utf8');
  const t = digitsOf(src);
  const tSize = sizeOf(src);
  const dir = opts.dir || path.dirname(target);

  // 修改模式：与 --base 的重合是预期的，不报警，只报告"改了什么"
  if (opts.base) {
    const basePath = path.resolve(path.dirname(target), opts.base);
    let b;
    try { b = fs.readFileSync(basePath, 'utf8'); } catch {
      return { ok: false, mode: 'modify', builder: path.basename(target), error: `找不到基准 builder: ${opts.base}` };
    }
    const bd = digitsOf(b);
    const bSize = sizeOf(b);
    const numSim = jaccard(t.nums, bd.nums);
    const hexSim = jaccard(t.hexes, bd.hexes);
    // 修改模式下，尺寸/色值应尽量保持：变了要显式声明
    const sizeChanged = tSize && bSize && tSize !== bSize;
    const paletteChanged = hexSim < 0.9;
    return {
      ok: true,
      mode: 'modify',
      builder: path.basename(target),
      base: path.basename(basePath),
      size: tSize, baseSize: bSize,
      numericSimilarity: Math.round(numSim * 100) / 100,
      paletteSimilarity: Math.round(hexSim * 100) / 100,
      sizeChanged, paletteChanged,
      note: '修改模式：沿用基准参数是要求，不是抄袭',
    };
  }

  const rows = [];
  for (const other of listBuilders(dir)) {
    if (path.resolve(other) === target) continue;
    let o;
    try { o = fs.readFileSync(other, 'utf8'); } catch { continue; }
    const og = digitsOf(o);
    const oSize = sizeOf(o);
    const numSim = jaccard(t.nums, og.nums);
    const hexSim = jaccard(t.hexes, og.hexes);
    const sameSize = tSize && oSize && tSize === oSize;
    const suspicious = (sameSize && numSim >= 0.6) || hexSim >= 0.75;
    rows.push({
      other: path.basename(other),
      sameSize,
      size: oSize,
      numericSimilarity: Math.round(numSim * 100) / 100,
      paletteSimilarity: Math.round(hexSim * 100) / 100,
      suspicious,
    });
  }
  rows.sort((a, b) => Math.max(b.numericSimilarity, b.paletteSimilarity) - Math.max(a.numericSimilarity, a.paletteSimilarity));
  const flagged = rows.filter(r => r.suspicious);
  return {
    ok: flagged.length === 0,
    mode: 'new',
    builder: path.basename(target),
    size: tSize,
    numbers: t.nums.size,
    hexes: t.hexes.size,
    flagged,
    top: rows.slice(0, 3),
  };
}

function main() {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--') && a !== baseArg());
  function baseArg() { const i = args.indexOf('--base'); return i >= 0 ? args[i + 1] : undefined; }
  if (!target) { console.error('usage: node scripts/check_reuse.cjs <builder.cjs> [--base <原builder>] [--json]'); process.exit(1); }
  const base = baseArg();
  const r = checkReuse(target, { base });
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }

  if (r.mode === 'modify') {
    if (r.error) { console.error(`REUSE 修改模式无法比对：${r.error}`); process.exit(1); }
    console.log(`REUSE MODIFY  ${r.builder}  ← 基准 ${r.base}`);
    console.log(`  基准尺寸=${r.baseSize || '-'} 本件尺寸=${r.size || '-'}  参数重合=${r.numericSimilarity}  配色重合=${r.paletteSimilarity}`);
    if (r.sizeChanged) console.log('  [注意] 尺寸与基准不同——修改模式下应当保持，除非明确要求放大/缩小');
    if (r.paletteChanged) console.log('  [注意] 配色与基准差异较大——修改时应沿用原色阶');
    process.exit(0);
  }

  console.log(`REUSE ${r.ok ? 'OK' : 'SUSPECT'}  ${r.builder}  size=${r.size || '-'}  数值 ${r.numbers} 个 / 色值 ${r.hexes} 个`);
  for (const f of r.flagged) {
    console.error(`  [疑似复用历史参数] ${f.other}  同尺寸=${f.sameSize}  数值重合=${f.numericSimilarity}  配色重合=${f.paletteSimilarity}`);
  }
  if (!r.ok) console.error('  说明：新建件不许复用旧参数。若确实要沿用，请改用修改模式 --base <原builder> 并在设计书写明基准。');
  process.exit(r.ok ? 0 : 1);
}

module.exports = { checkReuse, digitsOf, sizeOf };
if (require.main === module) main();