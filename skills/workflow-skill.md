# MC建筑工坊 · 总控流程

**规则不在本文件，在 `references/build-rules.md`（唯一权威）。**
本文件只规定：按什么顺序做、卡在哪几道闸门、什么情况返工。

## 分工

| skill | 角色 |
|---|---|
| `mc-build-plan` | 入口 / 派单：选路线（在线 `mc_*` 还是 litematic builder）+ 第零步设计书 |
| **本 skill** | 总控：流程顺序、闸门、返工判定、交付定义 |
| `build-litematic` | 技术手册：builder API、脚本、闸门怎么调 |
| `superflat-beautify` | 手法库：立面12手法 / 60-30-10 / 断节检测 |
| `references/build-rules.md` | **规则权威**：体量档位、13 原则、设计书、入口、闸门、画序 |

## 强制流程

```
① 写设计书（八节 + 算式 + 档位）→ 用户确认 ─┐
                                          ↓
② 建造（builder 或 mc_* 工序）→ design / aesthetic / walkable ──不过→ 修
                                          ↓ 过
③ 诊断 → ④ 分级美化 → ⑤ 一致性检测 → ⑥ QA
                                          ↓ 全绿
⑦ 交付（.litematic + 预览 + SCALE 档位）
```

## 三道构建期闸门（CLI 自动跑）

```
DESIGN OK           设计书齐全且带算式
AESTHETIC A(90)     配色/悬空/比例(按最大连通体)/剪影/细节
WALKABLE blocking=0 门洞净空/门内侧/门槛高差/入口接近
SCALE 中型建筑 ...   体量档位自报
```

任一 `=BLOCK` → 内部返工，禁止交付。

## 返工规则

| 失败类型 | 处理 |
|---|---|
| 零容忍项 / P0 / P1 配色或比例 | **整体重建**，不做局部修补 |
| 一致性类（断节、违和） | 按 `superflat-beautify` 修复手法局部修补 → 重跑检测 |
| 可通行/支撑 | 补台阶、掏空门内侧、加承托柱 → 重跑 |
| 体量不在声明档位 | 调体量或改档位声明，二者必须一致 |

## 交付定义

四闸门全过 + `verify_reachable` 目标点全 `REACHABLE` + `supportReport=0` + 报出 `SCALE` 档位。
未通过的不交付给用户，也不说"已完成"。

## 环境事实

- `mc_build` 工具：`code` + **`design`（必填）** → 写 `output/design/` → 跑 CLI → 产物落 `output/`
- 构建工程：插件内 `scripts/`（自包含，无需外部工程）
- 关键脚本：`litematic.cjs`（CLI）/ `build_kit.cjs`（材料解析·5档色阶·剖面旋转·局部坐标系）/ `checks.cjs`（walkable·support·headroom）/ `aesthetic.cjs`（grade）/ `require_design.cjs` / `scale.cjs` / `verify_reachable.cjs`
- 超平坦：蓝图内 SURFACE_Y=0、BASE_Y=1；y=0 是地面，sy 从 0 起算，≤256

## 读什么

| 何时 | 读 |
|---|---|
| 每次建造前 | `references/build-rules.md`（规则）+ `references/design-doc-template.md`（模板） |
| 想知道为什么这么定 | `references/principles-explained.md`（逐条原因与反例） |
| 拿不准某个决定 | `references/experience-library.md`（教训库） |
| 想了解观察来源 | `references/research-notes.md`（mcarch 研究 + 数据） |
| 手法细节 | `superflat-beautify.md` |

> 注意：本插件注册 skill 时**不挂 resources**，这些文档要用绝对路径直接读
> （前缀 ``）。