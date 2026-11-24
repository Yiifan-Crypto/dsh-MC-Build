'use strict';
// require_design.cjs — 「先思考后写」的硬闸门
//
// 观察 mcarch：它先花 735 秒写设计（84k 字），再写 5.9k 字程序；
// 反过来"边写边想"的代价是我们这边的 6~8 轮返工，而且结构级错误（桥接不上塔）
// 靠事后检测只看到"12,214 悬空"，看不出根因。
//
// 所以把"先出设计书"变成构建前必须通过的一步：
//   output/design/<builder名>.md  或  <builder名>_design.md
// 且必须包含这些小节（关键字匹配）：
//   判据 / 体量 / 布局 / 画序 或 施工顺序 / 预检 或 算式 / 风险 / 砍 / 验收
//
// 用法：
//   node scripts/require_design.cjs <builder.cjs> [--quiet]
// 退出码 0 = 通过，1 = 缺设计书或小节不全。

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = [
  { key: '判据', names: ['判据', '成功标准', '验收标准'] },
  { key: '体量', names: ['体量', '尺寸', '规模'] },
  { key: '布局', names: ['布局', '平面', '方位'] },
  { key: '画序', names: ['画序', '绘制顺序', '施工顺序', '施工步骤'] },
  { key: '预检', names: ['预检', '算式', '核算', '自检'] },
  { key: '风险', names: ['风险', '坑'] },
  { key: '砍', names: ['砍', '取舍', '不做', '范围'] },
  { key: '差异或基准', names: ['差异', '基准', '与已有不同', '不复用', '保留了什么', '改动范围'] },
  { key: '验收', names: ['验收', '交付'] },
];

function findDesign(builderPath) {
  const base = path.basename(builderPath, '.cjs').replace(/\.js$/, '');
  const dir = path.resolve('output', 'design');
  const candidates = [
    path.join(dir, base + '.md'),
    path.join(dir, base + '_design.md'),
    path.join(dir, base + '-design.md'),
    path.join(dir, base + '_设计.md'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function checkDesign(builderPath) {
  const file = findDesign(builderPath);
  if (!file) {
    return {
      ok: false,
      path: null,
      missingSections: REQUIRED_SECTIONS.map(s => s.key),
      reason: '没有设计书：先写 output/design/<builder名>.md（模板见 references/design-doc-template.md），再写程序。',
    };
  }
  const text = fs.readFileSync(file, 'utf8');
  const missing = [];
  for (const s of REQUIRED_SECTIONS) {
    if (!s.names.some(n => text.includes(n))) missing.push(s.key);
  }
  // 设计书必须真的"算了数字"：至少 8 行含数字
  const numericLines = text.split(/\r?\n/).filter(l => /\d/.test(l) && l.trim().length > 4).length;
  const numbersOk = numericLines >= 8;
  // 必须声明体量档位（小 <10k / 中型 10k~80k / 大型 >=100k；默认中型 20k~50k）
  let scaleOk = true;
  try {
    const S = require('./scale.cjs');
    const hasTier = /(小建筑|中型建筑|大型建筑|过渡带|小\s*<|中型|大型)/.test(text);
    const target = /(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(?:块|方块)?/.exec(text);
    scaleOk = hasTier;
    if (!scaleOk) missing.push('体量档位声明');
  } catch { /* 分档模块缺失不阻断 */ }
  return {
    ok: missing.length === 0 && numbersOk && scaleOk,
    path: file,
    missingSections: missing,
    numericLines,
    numbersOk,
    scaleOk,
    reason: missing.length ? `设计书缺少：${missing.join('、')}` : (numbersOk ? '' : `设计书里只有 ${numericLines} 行带数字，不像认真推算（要求 ≥8）`),
  };
}

function main() {
  const args = process.argv.slice(2);
  const builder = args.find(a => !a.startsWith('--'));
  if (!builder) { console.error('usage: node scripts/require_design.cjs <builder.cjs> [--quiet]'); process.exit(1); }
  const r = checkDesign(path.resolve(builder));
  if (!args.includes('--quiet')) {
    if (r.ok) {
      console.log(`DESIGN OK  ${path.relative(process.cwd(), r.path)}  （带数字的行 ${r.numericLines}）`);
    } else {
      console.error(`DESIGN BLOCK  ${r.reason}`);
      if (r.path) console.error(`  文件：${path.relative(process.cwd(), r.path)}`);
    }
  }
  process.exit(r.ok ? 0 : 1);
}

module.exports = { checkDesign, findDesign, REQUIRED_SECTIONS };
if (require.main === module) main();