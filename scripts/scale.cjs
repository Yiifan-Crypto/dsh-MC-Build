'use strict';
// scale.cjs — 建筑体量分档（用户定义的唯一口径）
//
//   小建筑   blocks < 10,000
//   中型建筑 10,000 ≤ blocks < 80,000
//   大型建筑 blocks ≥ 100,000
//   过渡带   80,000 ≤ blocks < 100,000（口径未定义，需明确归到中型或大型）
//
// 默认生成目标是**中型建筑，20,000 ~ 50,000 方块**。
//
// 用法：
//   const S = require('./scale.cjs');
//   S.classify(30648)  -> { tier:'medium', label:'中型建筑', inDefaultBand:true, ... }
//   S.describe(30648)  -> '中型建筑 30,648 方块（目标区间 20k~50k ✓）'

const TIERS = {
  small:  { label: '小建筑',   min: 0,       max: 10000 },
  medium: { label: '中型建筑', min: 10000,   max: 80000 },
  gap:    { label: '过渡带',   min: 80000,   max: 100000 },
  large:  { label: '大型建筑', min: 100000,  max: Infinity },
};

const DEFAULT_BAND = { min: 20000, max: 50000, tier: 'medium' };

/**
 * 判定方块数所属档位。
 * @param {number} blocks 非空气方块数
 * @returns {{tier:string,label:string,min:number,max:number|null,inDefaultBand:boolean,blocks:number}}
 */
function classify(blocks) {
  const n = Number(blocks) || 0;
  let tier = 'large';
  for (const [k, t] of Object.entries(TIERS)) {
    if (n >= t.min && n < t.max) { tier = k; break; }
  }
  const t = TIERS[tier];
  return {
    tier,
    label: t.label,
    min: t.min,
    max: t.max === Infinity ? null : t.max,
    blocks: n,
    inDefaultBand: n >= DEFAULT_BAND.min && n <= DEFAULT_BAND.max,
  };
}

/** 一句话描述，用于 CLI 输出。 */
function describe(blocks) {
  const r = classify(blocks);
  const band = r.tier === 'medium'
    ? (r.inDefaultBand ? `目标区间 20k~50k ✓` : `超出默认区间 20k~50k ✗`)
    : (r.tier === 'gap' ? `口径未定义，请明确归到中型或大型` : `非默认档位`);
  return `${r.label} ${r.blocks.toLocaleString()} 方块（${band}）`;
}

/** 给某个档位推荐的方块数目标。 */
function targetFor(tier = 'medium') {
  if (tier === 'small') return { min: 1000, max: 10000 };
  if (tier === 'large') return { min: 100000, max: 200000 };
  if (tier === 'gap') return { min: 80000, max: 100000 };
  return { ...DEFAULT_BAND };
}

module.exports = { TIERS, DEFAULT_BAND, classify, describe, targetFor };