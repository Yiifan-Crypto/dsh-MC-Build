
# Build Minecraft .litematic — aesthetic scene generator

Turn a building/scene request into a loadable Litematica `.litematic` (Minecraft
Java, data version 3700 / 1.20.4) that actually looks good. No Python, no game
access: write a small Node builder against the bundled canvas + scenery library,
generate, validate, inspect previews. One build per run.

The visual quality comes from a fixed phase methodology, not from scattering
blocks. Follow the phases in order; do not skip to detail before massing.

## Object-type routing

Classify the request first, then run only the phases it needs:

| Type | Examples | Phases |
|------|----------|--------|
| Enclosed building | house, castle, arena, farm, interior | 1 → 2-B → 3 → 4 |
| Open structure | arch bridge, tower, plaza, ruins, gate | 1 → 2-O → 3 |
| Scene / landscape | hills, river, forest, valley, mixed vista | 1 → 2-N → 3 → 5 |
| Mixed | bridge-in-valley, tower-on-cliff, ruin plaza | 1 → 2-N + 2-O → 3 → 5 |

## Workflow

1. **Phase 1 — massing & silhouette (always first).** Decide footprint/height and
   the big shapes using ONE placeholder block per mass. Enclosed: main mass +
   subordinate mass, roof overhang ≥1 and stepped (never a flat slab). Open: a
   readable skeleton (span, piers, taper). Nature: heightfield only. Plan
   foreground / mid / background. **Output this massing plan to the user and get
   confirmation before writing build code** (see prompt templates in
   `skills/superflat-beautify.md`).
2. **Write the design doc FIRST (enforced).** Before any builder code, put a design
   document at `output/design/<builder>.md` using `references/design-doc-template.md`.
   The CLI refuses to build without it (`design=BLOCK`): it must carry the criteria,
   the volume table, the layout with **explicit radius origins**, the pre-check
   arithmetic (≥8 numeric lines), the draw-order table with stop boundaries, the risk
   table, what you chose to cut, and the acceptance list.

3. **Write the builder** `mybuild.cjs` exporting `{ name, desc, size:[sx,sy,sz], entries?, build(a) }`.
   Use the canvas API + the phase helpers below. Enclosed → `room/hollowBox/gableRoof/door`;
   open → `scenery.archBridge/tower/plaza/ruins`; nature → `scenery.terrain/river/water/scatterTrees`.
   See `scripts/example-house.cjs` (basic enclosed), `scripts/aesthetic_villa.cjs`
   (enclosed + 60/30/10 palette + playability), `scripts/example-scene.cjs` (mixed).
3. **Generate + preview:** `node scripts/litematic.cjs run mybuild.cjs --out out.litematic`.
   Prints `OK/FAIL size blocks palette bits leaks` and writes `out_preview.png`
   (top-down) + `out_side.png` (front elevation).
4. **Phase checks.** Require printed `OK`. Enclosed builds also require `leaks=0`
   and the Phase-4 playability rules. Open/nature: verify the Phase-2 hard rules
   and Phase-3 palette held. Scene/mixed: run Phase 5 on `out_side.png` +
   `scenery.compositionReport(a)` (skyline peaks, height variance, solid ratio).
   For any build with decor/windows, run the blind checks (`checks.runChecks`) and
   require `ok` (0 floating, 0 bad windows, 0 state issues).

   **Body scale is graded by the CLI and must be reported with the delivery:**
   `小建筑 <10k / 中型 10k~80k / 大型 ≥100k`（80k~100k 过渡带须明确归类）; the default
   target is **中型 20k~50k**. A medium build outside 20k~50k prints an extra warning —
   go bigger deliberately (升到大型 ≥100k) rather than drifting.
5. **Manual-tweak pass** (makes it look built, not generated): break 2–3 straight
   terrain edges, let vegetation "invade" structure/terrain boundaries, keep the
   background low-contrast/low-saturation. Re-run and re-inspect.
6. **Deliver:** put `.litematic` in `.minecraft/schematics/`, load via Litematica
   (`M`), paste in creative or use the survival printer.

## Large builds: level tower + stability loop

For a city / building group, do NOT ask for the whole thing at once. Decompose into
a level tower (L0 city → L1 district → L2 street → L3 road/house → L4 components →
L5 decor subtypes), plus a cross axis (function/form/material/traffic/decoration),
and state the combination relations (house↔street setback, window array rules).
Validate BOTTOM-UP: per level, sample → review → redo as NEW sample → keep → batch
~10 varied samples (size/direction/layout) to prove stability → fold into skill.
Build TOP-DOWN when actually constructing: layout/traffic/massing first, then detail.
Full method: `references/research-notes.md`. City helpers: `scripts/city.cjs`.

## Safe build order + blind checks

Correctness must not depend on AI visual inspection. Within a building: body
structure+material FIRST → doors + mark circulation FORBIDDEN → windows (faces only,
exactly 2 exposed faces) + mark FORBIDDEN → interior/exterior decor against the FINAL
geometry → attached small decor (lantern/torch/pot) LAST on top of prior decor.
Use `checks.decorSet` (never overwrites structure, never enters forbidden, never
floats) and finish with `checks.runChecks` (require `ok`). The CLI `run` auto-applies
`connectPass` so fences/walls/panes connect in game. Failure-mode→check table and
root causes: `references/research-notes.md`.

## Phase hard rules (summary — full detail in skills/superflat-beautify.md)

- **2-B enclosed:** layer foundation→floor→walls→openings→roof→detail; light every
  interior (anti-spawn); coherent 3–6 block palette.
- **2-O open:** arch = semicircle Ø7–9, keystone proud 1, deck 3–4 above water,
  piers+cutwaters if span>20, fence+trapdoor railing, mossy/stone alternation.
  Tower = taper 1 per 4–6 height, ring bands, cornice +1, windows more+smaller upward.
  Plaza = central anchor, soft boundary (colonnade/flowerbeds/steps, not a wall),
  2–3 paving mixes in different laying directions. Ruins = one collapse direction,
  rhythmic high-low-mid-high残 walls, 1–2 intact readable parts, vines top+ground.
- **2-N nature:** 7-block rule (no organic straight run >~7, jitter 1–3 every 4–7);
  no pure 45° slopes; asymmetry (no symmetric cones / circular lakes / rect water);
  scale hills 30–50, mountains 80–150; double-layer base ≥2 under every surface;
  never one material (4–8 hue-convergent variants); water = irregular banks +
  sand/gravel/clay bed + slab/stair shore + stepped falls; vegetation = 2–3 tree
  types, randomized spacing/height, layered recursive canopy (not leaf spheres),
  trunk forks 2–4, trees off the mountain foot.
- **3 palette / 4 playability / 5 composition:** governed by
  `references/build-rules.md` (P4, P6, P8 and the
  four gates). Do not restate them here — read the rules doc. Technically: palette is
  checked by `aesthetic.cjs`, playability by `checks.walkableReport`, composition by
  `scenery.compositionReport`.

## Canvas API (require scripts/litematic.cjs)

```js
const { Arena, save, verifyFile, preview, previewSide, hollowBox, room, gableRoof, door } = require('./scripts/litematic.cjs');
const a = new Arena(name, desc, sx, sy, sz);
a.set(x,y,z,'minecraft:stone', {props});      // single block
a.box(x1,y1,z1,x2,y2,z2,name,props);          // solid fill
a.mbox(...); a.mset(...);                     // 4-way mirrored (symmetric builds/arenas)
a.disc(cx,cz,r,y,name); a.ring(cx,cz,r,y,name);
hollowBox(a,x1,y1,z1,x2,y2,z2,name);          // walls only
room(a,x1,z1,x2,z2,y0,h,{floor,wall,roof});   // floor+walls+flat roof
gableRoof(a,x1,z1,x2,z2,y,name);              // stepped gable, ridge along x
door(a,x,y,z,facing,'minecraft:oak_door');    // clears 1x2 opening + fits door
save(a,file); preview(a,png); previewSide(a,png); verifyFile(file);
```

Coordinates: y=0 bottom; stay within `[0,sx) [0,sy) [0,sz)`. Palette[0]=air auto.

## Scenery API (require scripts/scenery.cjs) — implements the hard rules

```js
const S = require('./scripts/scenery.cjs');
const { H, heightAt } = S.terrain(a, {seed,base,amp,scale,ridge,ridgeStart,warp,alpine});
S.river(H, a, {level, mid, amp, width, seed});   // winding carve (7-block rule)
S.water(a, H, {level, seed});                    // mixed bed + water + sand shore
S.scatterTrees(a, H, {seed,count,level,maxZ,minDist,types});
S.tree(a,x,z,gy,'oak'|'spruce'|'birch',rand);    // layered canopy, forks 2-4
S.archBridge(a, {x,z1,z2,waterY,deckY});         // keystone, cutwaters, railing
S.tower(a, {x,z,baseY,height,baseR,taperEvery}); // taper, bands, cornice, windows
S.plaza(a, {x1,z1,x2,z2,y,seed});                // anchor + soft boundary + paving
S.ruins(a, {x1,x2,z,y,dir,seed});                // collapse rhythm + intact + vines
S.compositionReport(a);                          // {skyline,peaks,meanHeight,...}
```

`terrain` already enforces double-layer base + hue-converged surface mix +
asymmetry (domain warp) + alpine tops; `river/water` enforce irregular banks and
mixed bed; `scatterTrees` keeps trees off water and off the mountain foot.
When carving/flattening, CLEAR blocks above the new surface (see example-scene)
or leftover terrain buries water/plazas.

## City API (require scripts/city.cjs) — road-first growth + hue unity

```js
const C = require('./scripts/city.cjs');
const { road } = C.growRoads(sx, sz, {seed, steps, width, branch}); // roads first, random turns+branches
const plots = C.plotsAlongRoad(road, sx, sz, {w, d, gap, seed});    // houses along roads, front faces road
const pal = C.districtPalette(i);   // one hue-converged family per district {wall,roof,trim,floor}
```

## ★ Aesthetic gate (require scripts/aesthetic.cjs + aesthetic_kit.cjs) — 必用

Rules in superflat-beautify §7.5/§16/§18 are now EXECUTABLE. The CLI `run` calls
`aesthetic.grade(a)` automatically after every build: it prints one `AESTHETIC
grade(score) palette=… structure=… detail=… issues=N` line and BLOCKS delivery
(exit 1) when any P0 issue is present. A `... FAIL ... aesthetic=BLOCK` result
means the build is rejected — fix the reported issue and regenerate. Pass
`--no-aesthetic` only for debugging.

**Three positive primitives that make a good build the default:**

```js
const K = require('./scripts/aesthetic_kit.cjs');
const pal = K.palettePick('warm_wood');   // 60/30/10 palette: {main,aux,accent,groups}
// styles: warm_wood / modern / japanese / chinese / castle / fairy
// use pal.main for walls, pal.aux for roof/pillars, pal.accent for lamps/flowers
K.windowFourStep(a, {x,y,z,axis:'z',w:3,h:2});  // 清洞+边框+玻璃+窗台+眉线 四步一次到位
K.entranceKit(a, {x,y,z,facing:'north'});        // 台阶+两侧灯+雨棚 入口三件套
K.facadeKit(a, {x1,y1,z1,x2,y2,z2});             // 四角壁柱+腰线+檐口环 立面深度
```

**Diagnostic API (call from your builder to self-check before CLI):**

```js
const A = require('./scripts/aesthetic.cjs');
const g = A.grade(a);
// g.issues -> [{code, severity:'P0'|'P1'|'P2', msg, sample?}]
// codes: COLOR_OVERLOAD / TOO_MANY_GROUPS (配色脏)
//        FLOATING / PROPORTION_FLAT|TALL / SILHOUETTE_FLAT / MATERIAL_HARD_CUT (比例/断裂)
//        NO_WINDOWS / NO_TRIM / NO_LIGHT / DETAIL_SPARSE (细节少)
// g.palette.subjectGroups -> [{group,count,pct}]  实测配色占比
// palette trace groups (<3%, e.g. a few window glass blocks) are ignored by design.
```

**Hard rule:** never deliver a build whose CLI line shows `aesthetic=BLOCK`.
For P0: COLOR_OVERLOAD → switch to one `palettePick` style; FLOATING → anchor the
block to the structure (flood-fill from ground); PROPORTION → adjust massing.

## Checks API (require scripts/checks.cjs) — blind-builder guarantees

```js
const K = require('./scripts/checks.cjs');
K.connectPass(a);                       // fill fence/wall/pane connection states (auto in CLI run)
const base = a.grid.slice();            // structure snapshot AFTER structure is final
const forbidden = K.makeMask(a); K.markRect(a, forbidden, x1,y1,z1, x2,y2,z2);
K.decorSet(a, base, forbidden, x,y,z, name, props); // no overwrite / no forbidden / no float
const r = K.runChecks(a, {decor, windows, forbidden, entries}); // {connected,stateIssues,floating,badWindows,walk,ok}
```

## Walkability — the gate that catches "the door doesn't work"

A player is **1 block wide, 2 blocks tall**. Block states being complete does not
mean a player can pass. Export `entries` from the builder so the validator knows
where players are supposed to walk in; the CLI checks them automatically and
prints `walkable=PASS|BLOCK`.

```js
module.exports = {
  name: 'my_build', size: [w, h, d],
  // y = the block the player STANDS ON + 1 (i.e. the feet cell), facing = way out
  entries: [ { x: 12, y: 5, z: 12, facing: 'north' } ],
  build(a) { ... },
};
```

Checked strictly (blocking):

| code | meaning |
|---|---|
| `DOOR_NO_HEADROOM` | the door's own cell + the one above are not both passable |
| `DOOR_BLOCKED` | the cell just inside the door is occupied (floor/furniture jammed in the doorway) |
| `DOOR_BURIED` | threshold sits ≥2 above outside ground with no step |
| `DOOR_FLOATING` | no floor under the door |
| `ENTRY_NO_HEADROOM` / `ENTRY_NO_FLOOR` / `ENTRY_APPROACH_BLOCKED` | a declared entry fails headroom, support, or outside approach |

Advisory only (`warnings`, non-blocking): `PORTAL_TOO_LOW` — geometry that looks
like a 1-block-tall opening; often a window or arrow slit, so it never blocks
unless the point is also declared in `entries`.

**A building does not need a `_door` block.** Barns, sheds, ruins and gateways
should usually use an open notch in the wall (2 tall) instead — declare that notch
in `entries` and it is validated the same way.

Use `K.walkableReport(a, {entries})` directly to self-check before the CLI.

## Stairs — `facing` means the ASCEND direction (not "which way the model looks")

A stair's `facing` is **the direction the player walks upward**, i.e. the side the
raised half is on. Get it backwards and the run reads as a staircase you must
*descend* to climb — every gate still passes, because no gate checks orientation.

```js
// run rises toward +z  → facing south
a.set(x, y, z, 'minecraft:stone_brick_stairs', { facing: 'south', half: 'bottom', shape: 'straight' });
// run rises toward −z  → facing north
// run rises toward +x  → facing east
// run rises toward −x  → facing west
```

Rules of thumb:

- **Ground truth, not memory**: `facing` points at the raised half. The client jar
  proves it — `assets/minecraft/models/block/stairs.json` has the raised half at
  `[8,8,0]→[16,16,16]` (east), and `blockstates/*_stairs.json` maps east=0°,
  south=90°, north=270°, west=180°. So facing = the **ascend** side.
- The y-increasing axis of the run picks the `facing` — nothing else does.
- Eave tips / upturned corners / bridge ramps ("outer end low, inner end high"):
  point `facing` **inward** (the ascend direction), not outward.
- **Low end faces the entrance.** A run whose top step sits against the doorway
  reads as "reversed stairs" even with correct facing — the player meets the
  stair mass head-on.
- **One stair block per step**, solid full blocks underneath. Stacking a second
  stair at the same height (`set(y, z-1)`) makes double ledges and floating half
  blocks.
- A floor opening must span the upper run where `tread + 2` would hit the slab.

```js
K.stairFacingReport(a);                      // opposite-side mass → likely reversed
K.stairRunReport(a, { entries });            // duplicate column / high end near entry
```

The CLI prints `STAIR …` lines automatically (`--no-stair` disables). Both checks
are **heuristics** — eave tips have no "next step" to compare against, and the
renderer draws stairs as full cubes, so **no preview image proves orientation**.
Confirm by walking the stair in game or reading an orthographic section.

## Build kit — colour/material design layer (from studying mcarch.cn)

`scripts/build_kit.cjs` lets a builder describe **what it wants** instead of a block id,
and gives the primitives that make round/radial forms cheap. Prefer it for anything
colour-coded, radial, or curvy.

```js
const B = require('./scripts/build_kit.cjs');

// 1) colour + material word -> real block (nearest inside that material family)
B.mat('#9a948c', '石');        // families: 石 抹灰 木 原木 土 冰 金属 灯 布 混凝土 玻璃 砖 宝石
B.mat('#cf4b41', '布', ['red_wool']);   // optional allow-list to pin the exact block

// 2) one hue -> 5-tone team palette (wall / deep / roof / glass / tone)
const p = B.teamPalette('#4a7fd6');     // { wall, deep, roof, glass, tone }

// 3) lathe: profile table [[layerY, radius, block], ...]
B.revolve(a, { cx, cz, profile: [[6,17.7,'minecraft:andesite'], [5,17.1,null]] });
B.ring(a, { cx, cy, cz, r: 17.5, hole: 16.4, name: p.wall });

// 4) radial local frame: at(a,b) = world coords, a points toward the centre
const f = B.frame(3, { count: 8, cx: 20, cz: 20, radius: 33 });
const [x, z] = f.at(-9, 0);            // entrance-facing point
```

**Rules for how to use these primitives live in
`references/build-rules.md`** (P3 profile tables,
P4 five-tone palettes, P5 draw order, P8 palette limits, P1 volume tiers). This file only
documents the APIs. Background: `references/research-notes.md`.

## Critical format facts

- `BlockStates` packing is CONTIGUOUS and CROSSES 64-bit word boundaries
  (pre-1.16). Vanilla per-word padded packing => scrambled blocks in game.
- Index order `y*(sx*sz)+z*sx+x`; palette[0]=air; gzip the big-endian NBT.
- Placement validity: persistent leaves, checkerboard cactus, soul_fire on
  soul_soil, contained water/lava, hanging blocks need support.
- Full spec + gotchas: `skills/skill.md（见 Critical format facts 一节）`. Read before editing
  packing or adding unusual block states.

## Resources

- `scripts/litematic.cjs` — NBT writer/reader, Arena canvas, helpers, save/verify/preview/previewSide, CLI (`run`, `verify`; auto connectPass).
- `scripts/scenery.cjs` — aesthetic primitives (terrain/river/water/trees/bridge/tower/plaza/ruins/composition).
- `scripts/city.cjs` — road-first growth layout, plots along roads, district palettes.
- `scripts/checks.cjs` — checks: connectPass/stateReport/decorSet/attachment/window/runChecks plus **walkableReport / supportReport / headroomReport**.
- `scripts/example-house.cjs` — enclosed worked example (oak house).
- `scripts/aesthetic_villa.cjs` — enclosed aesthetic example (60/30/10 + playability).
- `scripts/example-scene.cjs` — mixed worked example (river valley + bridge + tower + plaza + ruins).
- `scripts/example-town.cjs` — city worked example (growth roads + plots + safe order + blind checks).
- `skills/superflat-beautify.md` — full Phase 1–5 rules, per-type structure logic, prompt templates, manual-tweak checklist.
- `references/research-notes.md` — 观察数据、失败模式、推导过程（非规则）。
- `references/build-rules.md` — **规则权威**（体量档位 / 13 原则 / 设计书 / 入口 / 四闸门 / 画序）。
- `references/principles-explained.md` — 每条原则的原因与反例。
- `references/experience-library.md` — 教训库（只写教训，禁止记录可抄参数）。
- `references/design-doc-template.md` — 设计书九节模板。
- NBT 格式细节：见本文件 `Critical format facts` 一节（bit-packing / index order / block gotchas）。