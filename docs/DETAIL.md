# MC建筑工坊 · 先思考，再建造

一套**先把几何算清楚、再写代码**的 Minecraft 建筑工作流。设计书不过不生成，闸门不过不交付，
体量按档位自报。附 `mc_*` 在线施工工具、`.litematic` 蓝图生成、以及右下角的**建筑上帝视角**预览面板。

> 规则只有一个来源：[`references/build-rules.md`](references/build-rules.md)。
> 各 skill 只写自己那部分做法，不重复规则。

## 两条路线

| 路线 | 用什么 | 适合 |
|---|---|---|
| **A · 蓝图** | `mc_build`（`code` + **`design` 必填**）→ 产出 `.litematic` | 复杂形体、精确控制、导入 Litematica 投影 |
| **B · 在线** | `mc_*` 九件套在内存模型里直接施工 | 边看边改、要截图验收、快速试形 |

两条路线共用同一套规则与闸门。

## 先思考后写：设计书是一道闸门

写代码之前必须先交设计书，八节缺一不可：

```
判据 · 体量（含档位声明）· 布局（标清半径原点）· 预检算式（≥8 行带数字）
画序（含停止边界）· 风险 · 砍掉项 · 与基准建筑的关系 · 验收
```

`require_design` 校验不过 → **`design=BLOCK`，直接不生成**。
为什么这么硬：边写边想的代价是 6~8 轮返工，而结构级错误（桥接不上塔）事后只报
"12,214 悬空"，看不出根因。**纸面上算错的方案，在代码里只会更贵。**

## 四道硬闸门 + 三个自报

| 闸门 | 判什么 | 不过 |
|---|---|---|
| `design` | 设计书齐全、带算式、带档位声明 | 不生成 |
| `aesthetic` | 配色分组 / 悬空（接地与虚空两种口径）/ 比例（按最大连通体）/ 剪影 / 细节密度 | `aesthetic=BLOCK` |
| `walkable` | 门洞 ≥2 格净空、门内侧不堵、门槛高差 ≤1、入口接近 | `walkable=BLOCK` |
| 一致性 | 断节 / 违和 两个扫描函数必须为空 | 返工 |

另有三条**自报**（报告，不阻断）：`supportReport`（装饰承托）、`headroomReport`（净空分布）、
`verify_reachable`（洪泛证明门外真的走得到室内）。构建还会自报 `SCALE` 档位。

## 体量档位（唯一口径）

| 档位 | 方块数 |
|---|---|
| 小建筑 | < 10,000 |
| **中型建筑** | 10,000 ~ 80,000 |
| 大型建筑 | ≥ 100,000 |
| 过渡带 | 80,000 ~ 100,000（须明确归到中型或大型） |

**默认生成 = 中型，20,000 ~ 50,000 方块。** CLI 会打印
`SCALE 中型建筑 30,648 方块（目标区间 20k~50k ✓）`；中型超区间会额外警告。

## 14 条风格无关原则（速览）

```
P1  体量先行：先定档位再定细节
P2  竖向要有锚：≥3 段高差、竖锚≥2 根
P3  形体参数生成：剖面表旋转，壳厚 ≥ 相邻半径差
P4  颜色按角色分档：wall/deep/roof/glass/tone 五档
P5  接缝靠画序：后画覆盖先画，被覆盖件算停止边界
P6  入口是空间：1×2 玩家必须走得过去
P7  装饰要有承托
P8  配色有上限：主体分组 ≤4，多色标识用不计入统计的材质
P9  先算后写
P10 会砍：元素先估成本
P11 分段输出 + 完整性守卫
P12 机器分 ≠ 好看：要有能看清细节的验收手段
P13 版本化
P14 新建禁抄旧参数（只复用经验）；改建筑必须沿用原参数（--base）
```

逐条原因与反例见 [`references/principles-explained.md`](references/principles-explained.md)。

## build_kit 原语

| API | 作用 |
|---|---|
| `mat(color, material)` / `matReport` | 色值+材质 → 真实方块，报告色差与是否跨族 |
| `teamPalette(hex)` | 由 1 个主色派生 5 档色阶 |
| `revolve(profile)` | 剖面表旋转体（倒锥 / 穹顶 / 圆台 / 飞檐） |
| `frame(i, …)` | 放射布局的局部坐标系，`at(a,b)` 直出世界坐标 |
| `checkComplete(mod)` | 输出完整性守卫（对抗程序截断） |

## `mc_*` 工具（9 个）

| 工具 | 作用 |
|---|---|
| `mc_health` | 引擎就绪、世界尺寸、方块数、可撤销步数 |
| `mc_scan` | 区域统计 / 高度图 / 包围盒 |
| `mc_build` | 参数化施工：box / wall / pillar / circle / arc_wall / dome / gable_roof / spiral_stairs |
| `mc_set_blocks` | 按坐标批量设方块 |
| `mc_region` | fill / replace / copy / rotate / mirror（连方块状态一起搬） |
| `mc_undo` | 增量撤销，可传 `steps` 一次多步 |
| `mc_screenshot` | 一次性等距/俯视/正视渲染 → `output/screenshot/*.png` |
| `mc_clear` | 清空到只有 y=0 地面的超平坦初始态 |
| `mc_export` | 导出 `.litematic` → `output/litematic/`，面板自动识别 |

## 上帝视角面板

导出后右下角「建筑上帝视角」自动加载并保留视角。查看 / 旋转 / 缩放全部在面板里做，
**不要**调 `mc_camera`。`mc_screenshot` 只用于 AI 自己看图迭代，最终呈现以面板为准。

## 标准流程

```
build-rules 过速查 → 写设计书（档位+算式）→ 用户确认
  → 路线 A 写 builder / 路线 B 走七道工序
  → DESIGN → AESTHETIC → WALKABLE → SCALE → REUSE
  → supportReport + headroomReport + verify_reachable
  → 有能看清细节的手段后才交付
```

## 文档地图

| 文档 | 内容 |
|---|---|
| `references/build-rules.md` | **规则权威**：档位 / 14 原则 / 设计书 / 入口 / 四闸门 / 画序 / 交付定义 |
| `references/design-doc-template.md` | 设计书九节模板 |
| `references/principles-explained.md` | 每条原则的原因与反例 |
| `references/experience-library.md` | 17 条教训（只写教训，禁止记录可抄参数） |
| `references/research-notes.md` | 观察数据与推导（非规则） |
| `references/INDEX.md` | 文档索引与脚本清单 |
| `superflat-beautify.md` | 手法库：立面 12 手法 / 60-30-10 / 断节检测 |

## 架构

- `mctools.mjs`：共享内存 `Arena`，9 个 `mc_*` 工具带完整 JSON-Schema
- `mcbuild.mjs`：`mc_build` 把代码写到工程根执行，产物进 `output/`；**无设计书直接拒绝**
- `render-shot.cjs`：一次性等距渲染，拍完即释放
- `client.js`：面板打开才加载预览，关闭即卸载；每 2.5s 扫描目录自动刷新
- `index.js`：注册 4 个 skill（plan / workflow / build-litematic / superflat-beautify），工具按 mtime 热加载

## 已知取舍

- `mc_screenshot` 是等距方块渲染（非游戏内光影），能看布局与配色，**看不出门窗框、檐口细节**——
  所以 P12 要求另找能看清细节的验收手段，别用低清鸟瞰图自评。
- blockstate 状态属性（朝向/半砖等）不保证完全保真，方块种类正确。
- 插件注册 skill 时**不挂 resources**，`references/` 文档需要用绝对路径直接读。