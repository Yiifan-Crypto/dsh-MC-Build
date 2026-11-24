'use strict';
// Worked example: a MIXED scene (Phase 1 -> 2-N + 2-O -> 3 -> 5).
// Foreground: gate tower + plaza + ruined wall. Mid: winding river + arch bridge.
// Background: low-contrast ridge hills. Demonstrates the aesthetic hard rules.
const S = require('./scenery.cjs');

module.exports = {
  name: 'river_valley_scene',
  desc: 'Mixed aesthetic scene: arch bridge over a winding river, gate tower, plaza, ruins, ridge background.',
  size: [96, 64, 96],
  build(a) {
    const level = 8;
    // Phase 2-N: asymmetric terrain + background ridge (double base + mixed surface)
    const { H, heightAt } = S.terrain(a, { seed: 7, base: 7, amp: 9, scale: 0.04, ridge: 34, ridgeStart: 0.62, warp: 12, alpine: 30 });
    const rv = S.river(H, a, { level, mid: a.sz * 0.48, amp: 7, width: 4, seed: 5 });
    S.water(a, H, { level, seed: 5 });

    // flatten a foreground pad so the plaza sits level (clear anything above it)
    const padY = 10;
    for (let x = 38; x <= 58; x++) for (let z = 28; z <= 42; z++) { for (let y = padY + 1; y < a.sy; y++) a.set(x, y, z, 'minecraft:air'); H[z * a.sx + x] = padY; }
    a.box(38, 0, 28, 58, padY, 42, 'minecraft:grass_block');

    // vegetation first (natural ground), structures overwrite afterwards
    const n = S.scatterTrees(a, H, { seed: 42, count: 46, level, maxZ: a.sz * 0.6, minDist: 5 });

    // Phase 2-O: plaza with fountain anchor (foreground)
    S.plaza(a, { x1: 40, z1: 30, x2: 56, z2: 40, y: padY, seed: 3 });

    // Phase 2-O: arch bridge across the river (mid)
    const zc = rv.center(48);
    S.archBridge(a, { x: 48, z1: Math.floor(zc) - 7, z2: Math.ceil(zc) + 7, waterY: level, deckY: level + 4 });

    // Phase 2-O: tapering gate tower (foreground)
    S.tower(a, { x: 28, z: 22, baseY: heightAt(28, 22), height: 22, baseR: 4, taperEvery: 5 });

    // Phase 2-O: ruined wall, consistent collapse toward +x (foreground)
    S.ruins(a, { x1: 60, x2: 80, z: 26, y: heightAt(70, 26), dir: 1, seed: 9 });

    // Phase 5: composition check
    const c = S.compositionReport(a);
    console.log(`[scene] trees=${n} skyline peaks=${c.peaks} meanH=${c.meanHeight} varH=${c.heightVariance} solid=${c.solidRatio}`);
  },
};