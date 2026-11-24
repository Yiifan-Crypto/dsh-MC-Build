# 设计：让 opusmc-viewer 插件的建筑真正"按规则变好看"

日期：2026-11-17
改造对象：`@local/opusmc-viewer` v2.1.0 + 构建工程 `D:/建筑/build-litematic`

## 意图与 why

用户反馈：mcarch.cn 生成的建筑比本插件好看。调研发现本插件已有非常完整的美学规则
（superflat-beautify.md 919 行、P0~P5 美化、SCAN_DISCONTINUITY/SCAN_DISSONANCE 两个检测、
§7.5 材质分组表），但建筑的最终观感仍不稳定。

用户明确改造目标（已确认）：**强化插件审美能力**，重点解决 **配色脏乱 / 比例失调·悬空断裂 / 细节太少**。

## 根因诊断

1. **规则是纸面文字，不是可执行代码。** §16 的两个 SCAN 函数依赖 `SOLID()/GROUP()/neighbors()/
   area_of_group()` 等，规范里只给了函数签名，从未实现。AI 无法在生成时真正运行它们。
2. **CLI 只验格式，不验美。** `litematic.cjs run` 只保证 NBT 合法 + `leaks=0`，一个彩虹配色、
   悬空屋顶、光秃墙面的建筑照样打印 `OK` 交付。
3. **没有审美评分闭环。** 没有量化的"配几色/几分组/悬空几块/立面几层/细节几种"反馈给 AI，
   AI 写完 builder 得不到可行动的返工指令。

## 目标 / 非目标 / 反目标

- 目标：让规则变成**生成后自动运行的可执行校验**，不达标 FAIL 并报出具体问题与坐标，
  AI 据此返工；同时提供正向的建造原语让"好看"更容易一次写对。
- 非目标：不重写 litematic 格式引擎；不换 1066 方块引擎；不改上帝视角面板。
- 反目标（要避免）：只加提示词让 AI"注意配色"——不可验证，等于没改。

## 方案（已选：B 可执行校验库）

| 方案 | 取舍 | 结论 |
|---|---|---|
| A 只加提示词 | 治标，不可验证 | 否 |
| **B 可执行校验库 + 接入 CLI + 建原语** | 规则真正生效、可验证、可回归 | **采用** |
| C 全重写生成器 | 风险大，引擎要全适配 | 否 |

## 具体改动

### 1. 新建 `scripts/aesthetic.cjs`（核心）
把 superflat-beautify §7.5 / §16 / §18 从伪代码落成真代码，输入 Arena：

- `groupOf(blockName)` — 方块名 → §7.5 材质分组（G_WOOD_LIGHT ... G_PLANT），含 `_stairs/_slab/_wall` 后缀归一
- `paletteAudit(a)` — 主体分组数、主色分组数、点缀分组数、色相数；超标列出具体分组与占比
  （解决"配色脏乱"）
- `structureAudit(a)` — 
  - 悬空块：非功能/植被类方块若六邻接无支撑且在 y>最低实体层 → FLOATING
  - 比例：`宽:檐高` 越界、层高=2、剪影高度段数<3 → PROPORTION
  - 材质硬切：相邻共享面两组深浅都不同且非中性 → MATERIAL_HARD_CUT
  （解决"比例失调/悬空断裂"）
- `detailAudit(a)` — 立面深度层、门窗四步（框/窗台/眉线）、细节种类统计；不足列缺口
  （解决"细节太少"）
- `grade(a)` — 汇总 A/B/C/D 评分 + 问题清单（code/严重度/坐标/修复建议）

### 2. 接入 CLI（`litematic.cjs run`）
生成后自动跑 `grade()`：
- 输出 `AESTHETIC grade=<A~D> ...` 一行摘要
- P0 级问题（悬空/配色超标/比例失衡）→ 打印 FAIL 明细并 `process.exit(1)`，阻断交付
- 保留 `--no-aesthetic` 逃生开关（调试用）

### 3. 强化建造原语（`scripts/scenery.cjs` 增补）
- `palettePick(style)` — 按 §7.4 返回一套现成 60/30/10 调色板对象（直接拿对颜色）
- `detailKit` — 窗框四步、入口三件套、墙角壁柱/腰线等带材质的装饰函数（一次调用出细节）

### 4. 更新 skill 文档
- `build-litematic` 的 skill.md / references：加入 `aesthetic.grade()` 用法与"FAIL 必返工"
- `superflat-beautify.md`：在 §16 标注"已实现于 scripts/aesthetic.cjs"
- `workflow-skill.md`：② 阶段加入审美评分闸门

## 验证
- 写一个故意难看的测试 builder（彩虹墙+悬空块），确认 CLI FAIL 并报出具体问题
- 写一个合格 builder，确认 grade 达标、CLI OK
- 回归现有 example-house / aesthetic_villa，确认不破坏既有产物
