# 参考文档索引

**规则只有一个来源：`build-rules.md`。** 其它文档要么是它的展开，要么是数据/手法/教训，不重复规则。

## 文档地图

| 文件 | 角色 | 何时读 |
|---|---|---|
| **`build-rules.md`** | **规则权威** | 每次建造前必读：体量档位、13 条原则速查、设计书八节、入口规则、四闸门、画序、交付定义 |
| `design-doc-template.md` | 设计书模板（九节） | 写设计书时照抄结构；缺节/缺算式/缺档位声明会被 `design=BLOCK` |
| `principles-explained.md` | 原则详解 | 想知道某条原则**为什么**这么定、我踩过什么反例时 |
| `experience-library.md` | 教训库 E-001~E-017 | 拿不准某个决定时。**只写教训，禁止记录可抄参数** |
| `research-notes.md` | 观察数据 | 想了解结论来源（mcarch 抓取、作品库统计、梯子数据）时。**不是规则** |
| `../superflat-beautify.md` | 手法库 | 立面 12 手法、60-30-10、断节/违和检测、QA 清单 |

## skill 分工

| skill | 只负责 |
|---|---|
| `mc-build-plan` | 入口：选路线（litematic / 在线 `mc_*`）→ 设计书 → 派单 |
| `mc-architecture-workflow` | 总控：流程顺序、卡闸门、返工判定、交付定义 |
| `build-litematic` | 技术手册：builder API、脚本、闸门怎么调 |
| `superflat-beautify` | 手法库 |

## 可执行实现（插件内 `scripts/`，自包含）

| 脚本 | 作用 |
|---|---|
| `scripts/litematic.cjs` | Arena / NBT / save / verify / preview / CLI（design + aesthetic + walkable + SCALE） |
| `scripts/build_kit.cjs` | `mat`/`matReport`（色值+材质→方块，报色差）、`teamPalette`（5 档色阶）、`revolve`（剖面旋转体）、`ring`、`frame`（放射局部坐标系）、`checkComplete` |
| `scripts/checks.cjs` | `walkableReport`（1×2 可通行）、`supportReport`（装饰承托）、`headroomReport`（净空分布）、`connectPass`、`runChecks` |
| `scripts/aesthetic.cjs` | `grade`：配色分组 / 悬空（接地+虚空模式）/ 比例（按最大连通体）/ 剪影 / 细节密度 |
| `scripts/scale.cjs` | 体量分档：小 <10k / 中型 10k~80k / 大型 ≥100k；默认中型 20k~50k |
| `scripts/require_design.cjs` | 设计书闸门：缺文件/节/档位声明/算式/**与基准建筑的关系** → `design=BLOCK` |
| `scripts/check_reuse.cjs` | P14 参数复用检查：新建模式报警（疑似抄旧参数）；`--base <原builder>` 为修改模式，重合视为要求并报告改动维度 |
| `scripts/verify_reachable.cjs` | 洪泛证明：门外能否真的走到室内 |
| `scripts/scenery.cjs` / `aesthetic_kit.cjs` / `city.cjs` | 地形桥塔广场遗迹 / 配色立面三件套 / 路网街区 |

## 标准顺序

```
build-rules（过速查）
  → design-doc-template（写设计书，带档位与算式）
  → 用户确认
  → 写 builder（build_kit 原语）
  → CLI：DESIGN → AESTHETIC → WALKABLE → SCALE
  → supportReport + headroomReport + verify_reachable
  → 有能看清细节的手段后才交付
  → 踩新坑 → 记进 experience-library（只记教训）
```

## 归档

旧版本 `.bak-*` 目录、`.bak` 文件、以及合并前的 `mcarch-study.md` / `mc-learning-summary.md` / `universal-principles.md` 已移入 `../_backups/`，不进 skill 加载路径。