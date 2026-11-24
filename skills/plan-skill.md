# MC 施工规划（入口 / 派单）

用户要建任何 Minecraft 建筑或场景时，**本 skill 是入口**：先选路线、再写设计书、再交给对应实现。

**规则权威：`references/build-rules.md`**（体量档位、13 原则、设计书八节、入口规则、四闸门）。本文件不复述规则。

## 第零步：选路线（先问一句）

| 路线 | 用什么 | 适合 |
|---|---|---|
| **A. litematic 蓝图** | `mc_build`（`code` + **`design` 必填**）→ 生成 `.litematic` | 复杂形体、需要精确控制、要导入 Litematica 投影 |
| **B. 在线施工** | `mc_*` 工具（`mc_init`/`mc_build` 原语/`mc_facade`/`mc_window`/`mc_entrance`） | 在 opusmc 里直接看、边看边改、要截图验收 |

两条路线**共用同一套规则与闸门**。走 A 时 `design` 必填；走 B 时同样要先交设计书文本给用户确认。

## 第一步：写设计书（两条路线都必做）

八节：判据 / 体量（**含档位声明**）/ 布局（标清半径原点）/ 预检算式（≥8 行带数字）/
画序（含停止边界）/ 风险 / 砍掉项 / 验收。模板 `references/design-doc-template.md`。

**体量按档位定**：小 <10k / 中型 10k~80k / 大型 ≥100k；默认中型 **20k~50k**。

## 第二步：给用户看方案

1. 一段话规格（题材/风格/年代/用途/使用者）
2. 一张 ASCII 布局图（标方位与分区）
3. 分步计划（路线 A：builder 结构；路线 B：七道工序）
4. 明确列出采用的默认值（体量档位、配色、风格），请用户确认

## 第三步：执行

**路线 A**：写 builder → 见 `build-litematic` skill（API 与闸门调用）。
**路线 B**：七道工序，别停在③。

| # | 工序 | 工具 |
|---|---|---|
| ① | 定画布 | `mc_init {size}` |
| ② | 定配色 | `mc_palette {style}`（60/30/10，别自己拼色） |
| ③ | 大体块 | `mc_build` box/wall/dome/gable_roof（此时难看是正常的） |
| ④ | 挖 | box + `block:"air"` 掏空、开门窗洞；`mc_clear {yMin}` 清场 |
| ⑤ | 表面 | `mc_facade` 壁柱腰线檐口（最关键）；`mc_region replace` 做色阶 |
| ⑥ | 细节 | `mc_window` 成排开窗（**别用 box 糊玻璃**）；`mc_entrance`；`mc_set_blocks` 补台阶栏杆灯 |
| ⑦ | 配景 | 树/路/水/花 |

## 第四步：验收（截图看不出的事必须机器查）

| 检查 | 判什么 |
|---|---|
| 可通行 | 门洞 ≥2 格净空、门槛高差 ≤1、门内侧不堵、前后贯通 |
| 装饰承托 | 灯笼/旗/藤/链/栏杆有没有支撑 |
| 体量档位 | 报出 `SCALE`，与设计书声明一致 |
| 细节可见 | 有能看清门窗檐口的观察手段（剖面/多视角/游戏内），别用低清鸟瞰自评 |

## 方块状态速查

```js
mc_build      { shape:"box", block:"oak_stairs[facing=east,half=bottom]", box:[...] }
mc_build      { shape:"box", block:"oak_stairs", state:{facing:"east",half:"bottom"}, box:[...] }
mc_set_blocks { blocks:[[x,y,z,"oak_stairs",{"facing":"east"}]] }
```
屋檐/坡度/檐口 → `_stairs`；窗台/栏杆压顶 → `_slab`；玻璃/围墙 → `glass_pane`/`*_wall`；
柱用 `_log`，横梁才用 `axis=x/z`；`mc_region` 的 copy/rotate/mirror 会连状态一起搬。

## 进阶

要复杂构件复用、循环阵列、贴面变异、自动体检 → 走路线 A 的 `mc_build_code`（即 `mc_build`），
在构建工程里写 Node 程序；详细 API 见 `build-litematic` skill。

## 铁律

- **不跳过第零、一步**：没选路线、没交设计书，不许开工
- **别停在③**：只做大体积一定是方盒子
- 方案要具体（方块名、格数、坐标范围），不要"建得好看点"
- 手法细节读 `superflat-beautify.md`；规则读 `references/build-rules.md`