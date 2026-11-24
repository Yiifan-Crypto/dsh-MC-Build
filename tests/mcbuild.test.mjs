import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLE_DIR, DESIGN_DIR } from '../paths.mjs'
import { createMcBuildTool, findProject } from '../mcbuild.mjs'

const quiet = { log() {}, warn() {}, error() {} }

// A minimal builder that passes every gate (design + aesthetic + walkable).
// It is intentionally simple: a single-room house with a subject-group floor,
// a stone shell, a plank ceiling, a gable roof and one door.
const BUILDER_CODE = `
const { hollowBox, gableRoof, door } = require('./scripts/litematic.cjs');
module.exports = {
  name: 'gate-house',
  desc: 'design gate test',
  size: [16, 9, 16],
  build(a) {
    a.box(1, 0, 1, 14, 0, 14, 'minecraft:stone_bricks');
    hollowBox(a, 1, 1, 1, 14, 6, 14, 'minecraft:stone_bricks');
    a.box(1, 7, 1, 14, 7, 14, 'minecraft:oak_planks');
    gableRoof(a, 1, 1, 14, 14, 8, 'minecraft:deepslate_tiles');
    door(a, 8, 1, 14, 'south', 'minecraft:oak_door');
  },
};
`

// A design document that satisfies every required section, the >=8 numeric
// lines rule and the volume-tier declaration.
const DESIGN_DOC = `# 闸门测试小屋设计书

## 判据
成功标准：可进入、无悬空、配色不超过 3 组，体量落在小建筑档位。

## 体量
目标约 900 块，属于小建筑档位（<10k），尺寸 16×9×16。

## 布局
平面为 16×16 的矩形，入口朝南，室内 12×12，墙体厚度 1 格。

## 画序
施工顺序：地面 → 墙体 → 楼板 → 屋顶 → 门窗，共 5 步。

## 预检
算式：墙体周长 16*4=64，墙高 6，墙体 64*6=384 块；屋顶 16*16=256 块；楼板 16*16=256 块。
合计约 896 块，小于 10000，落在小建筑档位。
净空：室内净高 5 格，满足 1×2 的通行要求。
宽高比：16/9≈1.78，在 1.5~3 的合理区间内。

## 风险
风险：屋顶坡度太陡产生悬空；门窗位置遮挡通行动线。

## 砍
砍掉：多层结构与内部楼梯，本版只做单层小屋。

## 差异或基准
与已有不同：不复用历史参数，配色按 60/30/10 重新选取。

## 验收
验收：可通行、无悬空、截图检查立面，交付 .litematic 蓝图。
`

function cleanupDesignArtifacts() {
  try {
    for (const f of readdirSync(DESIGN_DIR)) {
      if (f.startsWith('.mcbuild-')) rmSync(join(DESIGN_DIR, f), { force: true })
    }
  } catch {
    /* the design dir may not exist yet */
  }
}

test('findProject resolves to the bundle when nothing else is configured', async () => {
  const project = await findProject()
  assert.equal(project, BUNDLE_DIR)
})

test('mc_build_code refuses to run without a design document', async () => {
  const tool = createMcBuildTool(quiet)
  const result = await tool.execute({ code: BUILDER_CODE })
  assert.equal(result.ok, false)
  assert.match(result.error, /design/i)
  assert.ok(Array.isArray(result.required_sections), 'the missing sections are reported')
})

test('mc_build_code refuses empty code', async () => {
  const tool = createMcBuildTool(quiet)
  const result = await tool.execute({ code: '   ', design: DESIGN_DOC })
  assert.equal(result.ok, false)
  assert.match(result.error, /code/i)
})

test('mc_build_code produces a verified .litematic when the design is supplied', async () => {
  const tool = createMcBuildTool(quiet)
  try {
    const result = await tool.execute({ code: BUILDER_CODE, design: DESIGN_DOC, name: 'gate-house' })
    assert.equal(result.ok, true, `build failed: ${result.error || ''}\n${result.stderr || ''}`)
    assert.equal(result.name, 'gate-house')
    assert.ok(existsSync(result.file), 'the .litematic file exists')
    assert.ok(result.file.endsWith('.litematic'))
  } finally {
    cleanupDesignArtifacts()
  }
})

test('mc_build_code rejects an invalid output name', async () => {
  const tool = createMcBuildTool(quiet)
  const result = await tool.execute({ code: BUILDER_CODE, design: DESIGN_DOC, name: 'bad name!' })
  assert.equal(result.ok, false)
  assert.match(result.error, /name/i)
})
