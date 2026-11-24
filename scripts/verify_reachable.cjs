'use strict';
// verify_reachable.cjs — 可通行性洪泛验证（最硬的证明）
//
// 用法：
//   node scripts/verify_reachable.cjs <builder.cjs> <起点 x,y,z> <目标1 x,y,z> [目标2 ...]
//   例：node scripts/verify_reachable.cjs riverside_manor.cjs 12,4,10 13,6,15 7,5,27
//
// 原理：玩家站立条件 = 脚下实心 + 身体两格（y, y+1）可通行。
// 从门外起点做 BFS（允许 1 格上下台阶），检查目标点是否在可达集合里。
// 这比检查「门方块状态」强得多：它能证明人真的走得进去。
const path = require('path');
const { Arena } = require('./litematic.cjs');
const C = require('./checks.cjs');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('usage: node scripts/verify_reachable.cjs <builder.cjs> <start x,y,z> <target x,y,z> [...]');
  process.exit(1);
}

const builderPath = path.resolve(args[0].startsWith('.') || args[0].includes('/') || args[0].includes('\\')
  ? args[0] : path.join(__dirname, args[0]));
const b = require(builderPath);
const a = new Arena(b.name, b.desc, b.size[0], b.size[1], b.size[2]);
b.build(a);
C.connectPass(a);

const pass  = (x, y, z) => C.isPassable(C.nameOf(a, x, y, z));
const solid = (x, y, z) => C.isSolid(C.nameOf(a, x, y, z));
const stand = (x, y, z) => solid(x, y - 1, z) && pass(x, y, z) && pass(x, y + 1, z);
const key = (x, y, z) => `${x},${y},${z}`;
const parse = s => s.split(',').map(Number);

function flood(start) {
  if (!stand(...start)) return { set: new Set(), valid: false };
  const seen = new Set([key(...start)]);
  const q = [start];
  while (q.length) {
    const [x, y, z] = q.shift();
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      for (const dy of [0, 1, -1]) {          // 允许上下 1 格（台阶）
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (!stand(nx, ny, nz)) continue;
        const k = key(nx, ny, nz);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny, nz]);
      }
    }
  }
  return { set: seen, valid: true };
}

const start = parse(args[1]);
const { set, valid } = flood(start);
if (!valid) {
  console.error(`起点 ${args[1]} 不可站立（脚下无地面或头顶被堵）——检查外部地形`);
  process.exit(1);
}

let allOk = true;
console.log(`起点 ${args[1]} 可达站立点: ${set.size}`);
for (const t of args.slice(2)) {
  const p = parse(t);
  const reachable = set.has(key(...p));
  const st = stand(...p);
  if (!reachable || !st) allOk = false;
  console.log(`  ${reachable ? 'REACHABLE' : 'UNREACHABLE'}  ${t}  stand=${st}`);
}
process.exit(allOk ? 0 : 1);