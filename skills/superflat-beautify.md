# 超平坦建筑美化与一致性规范 v1.2（复检修订版）

> **定位**：适用于"已有生成方案产物"的后处理规范，聚焦两件事——**让建筑好看（美化）** + **在超平坦上零违和、零断裂（一致性）**。
> 输入 = 一栋已建好的建筑或一片建筑群（超平坦场景）；输出 = 具体的美化改造动作与一致性检查结论。
> 与"生成规范"分工：生成规范管"从零造出来"，**本文档只管"变好看 + 不出错"**。
> **目标版本**：Minecraft Java 1.20+（含 cherry_leaves）。超平坦坐标约定：默认 Classic Flat 草方块格坐标 SURFACE_Y=-61（顶面高度 -60），建筑首格 BASE_Y=-60，详见 §12.0。
> 所有规则量化（数值 / 方块 ID / 坐标关系 / 检测函数），禁止"适当""一些""好看"等模糊词；无输出格式、无指令示例。
> **v1.1 修订**：修正虚构方块 ID、超平坦地基厚度前提、检测算法可计算性，统一全部冲突数值。
> **v1.2 修订**：独立复检后修正——补全材质分组表并统一色相口径、修正 Y 基准术语（区分格坐标/顶面高度）、
> 修正 stone_brick_slab 等残留 ID、补全检测算法未定义函数（dist/TYPE/subject_groups/灯位参考系）、
> 修正灯距/半径/单调递减等自相矛盾项、修正 clock/banner/晾衣等不可执行表述。目标版本调整为 1.20+。

---

## 目录

**第一部分 · 美化**
- [1. 美化诊断：先找病因](#1-美化诊断先找病因)
- [2. 美化优先级（防止返工）](#2-美化优先级防止返工)
- [3. 轮廓与比例美化](#3-轮廓与比例美化)
- [4. 立面深度美化（核心 · 12 手法）](#4-立面深度美化核心--12-手法)
- [5. 屋顶美化](#5-屋顶美化)
- [6. 门窗美化](#6-门窗美化)
- [7. 配色美化](#7-配色美化)
- [8. 细节与配件美化](#8-细节与配件美化)
- [9. 光影美化](#9-光影美化)
- [10. 环境融合美化](#10-环境融合美化)
- [11. 八大风格美化速查](#11-八大风格美化速查)

**第二部分 · 超平坦零违和零断裂**
- [12. 超平坦基础参数与判定原则](#12-超平坦基础参数与判定原则)
- [13. 零违和：全局一致性（五项统一）](#13-零违和全局一致性五项统一)
- [14. 零断裂：结构连续性（九线连通）](#14-零断裂结构连续性九线连通)
- [15. 超平坦特有陷阱与体块融合](#15-超平坦特有陷阱与体块融合)
- [16. 断节与违和检测算法](#16-断节与违和检测算法)
- [17. 修复手法库](#17-修复手法库)
- [18. 统一 QA 清单（含零容忍项）](#18-统一-qa-清单含零容忍项)

- [一句话总纲](#一句话总纲)

---

## 第一部分 · 美化

## 1. 美化诊断：先找病因

> 不要一上来就加细节。先按下表定位"为什么不好看"，按病因开方。本文档全部按**超平坦场景**取值。

| 编号 | 病因 | 量化判定 | 对应药方 |
|---|---|---|---|
| B1 | 平墙 | 单材质连续 **>5×5** 格无凹凸/换材 | §4 破平墙 12 手法 |
| B2 | 轮廓呆板 | 剪影为单一矩形，天际线无高低变化 | §3.1 + §3.3 |
| B3 | 比例失衡 | 宽:檐高 超出 1.2:1~1.6:1；层高=2 | §3.2 |
| B4 | 裸窗 | 玻璃直接贴墙，无框无窗台 | §6.1 |
| B5 | 屋顶薄片 | 超平坦下屋檐外挑 **<2 格**，或末端无收边 | §5.1 |
| B6 | 配色脏 | 主色分组 >2，或地面与墙无明度差（材质分组相同） | §7.1 + §7.4 |
| B7 | 入口寒酸 | 门无两侧灯、无台阶、无雨棚 | §8.1 |
| B8 | 孤立感 | 建筑周围 5 格内无任何植被/路径/地形过渡 | §10 |

**诊断输出**：列出命中的病因编号，例如 `命中 B1/B3/B5`，后续只处理命中项。

---

## 2. 美化优先级（防止返工）

```
P0  比例与轮廓（§3）      ← 改这里会推翻下面的，必须最先做
 P1  配色重置（§7）        ← 定色后再动材质，避免反复换色
  P2  立面深度（§4）        ← 加壁柱/腰线/破平墙
   P3  屋顶（§5）+ 门窗（§6）
    P4  细节配件（§8）+ 光影（§9）
     P5  环境融合（§10）    ← 最后做，否则会被前面的施工踩坏
```
规则：**高优先级未通过对应 QA，禁止进入下一级**。QA 条目的 P 级归属见 §18 分组标注；不允许一边加细节一边改比例。

---

## 3. 轮廓与比例美化

### 3.1 剪影测试
```
把建筑所有方块涂成纯黑，在纯白背景下从四个正方向观察：
- 通过：剪影有 ≥3 段高度变化（主体 / 屋顶 / 附属体块）
- 失败：剪影是一个矩形 → 执行 §3.2 / §3.3
```

### 3.2 比例修正表
| 现状 | 修正动作 |
|---|---|
| 宽:檐高 < 1.2:1（太高太瘦） | 屋顶加 1 层外挑檐，或横向加 1 个附属体块（宽 +3~5） |
| 宽:檐高 > 1.6:1（太扁） | 加 1 层楼（层高 3）或抬高基座 1~2 格 |
| 层高 = 2 格 | 抬到 3 格（第一层可 4）；同步上移门窗和屋顶 |
| 进深 < 宽 × 0.7 | 后墙外扩 2~3 格，避免"纸片房" |
| 主体单一盒子 | 叠加一个偏移体块：[w-3,d-3] 高2，偏移 [+2,0]，形成错落 |

### 3.3 天际线丰富化
```
沿建筑轮廓，每 4~5 格水平距离必须出现 1 个"高出主体"的垂直元素：
  候选：烟囱(2×2高至屋顶+2) / 塔楼(3×3高+3) / 山墙三角 / 旗杆 / 屋脊装饰
规则：至少 2 个不同高度的垂直元素，禁止全部等高。
```

---

## 4. 立面深度美化（核心 · 12 手法）

> 平墙是"廉价感"头号来源。目标：**每面墙 ≥3 个不同深度层**。

### 4.1 深度层标准
| 层 | 凸出墙面 | 实现 | 常用方块 |
|---|---|---|---|
| L0 基准墙 | 0 | 主墙 | `birch_planks` |
| L1 壁柱/框架 | 0（替换）或 +1（外贴） | 整列替换或向外贴 1 格 | `oak_log` / `dark_oak_log` |
| L2 腰线/窗台 | +0.5（slab）或 +1（方块） | slab / 外挑方块 | `stone_brick_slab` |
| L3 屋檐/悬挑 | +2（超平坦） | stair / slab | `dark_oak_stairs` |

### 4.2 破平墙 12 手法（配方卡）

> 每张卡 = 一种可直接套用的改造。按需组合，单面墙用 2~3 种即可。

**① 壁柱 Pilaster**
```
做法：在墙两端 x=ox 与 x=ox+w-1，以及每 3 格处，整列替换为 accent 方块
      四角必须设置 accent 壁柱，并贯通 BASE_Y 至檐口
尺寸：宽1 × 贯通高度（从基座到檐口）
方块：oak_log / stone_bricks / dark_oak_log
凸出：+0（替换）或 +1（向外贴1格）
效果：把一整面墙切成若干"开间"，立刻有节奏感
```

**② 腰线 Cornice**
```
做法：在墙底 y=y0 与檐下 y=y0+floorH-1 各铺一圈 slab，向外挑
尺寸：厚0.5格，沿墙全长；一圈必须闭合，转角用 stair 45° 对接
方块：stone_brick_slab / dark_oak_slab
凸出：+0.5（slab 占半格）
效果：水平分割线，让立面分三段
```

**③ 材质条纹 Vertical Band**
```
做法：把墙面每隔 3~4 格的一整列换成对比材质
方块：主墙 birch_planks → 条纹 oak_planks / stone_bricks
凸出：0（纯材质变化），可与①叠加
效果：不增加体积也能破平，适合现代风
```

**④ 内凹壁龛 Niche**
```
做法：在墙面挖入 1 格深、2 格宽的凹槽
尺寸：2宽 × 2高 × 1深
方块：内壁用深色（deepslate），底部放花盆/雕像
效果：阴影制造深度，放装饰品的绝佳位置
```

**⑤ 半砖浮雕 Relief**
```
做法：在墙面贴 slab / stair 拼出几何纹样（菱形/斜十字/竖条）
方块：stone_brick_slab / dark_oak_slab
凸出：+0.5
效果：低成本高细节，中世纪/城堡常用
```

**⑥ 木框架 Tudor Grid**
```
做法：白墙打底后，用 dark_oak_log 画横竖网格，节点加斜撑(stair)
尺寸：横梁 y0 与 y0+2 各一圈；竖梁每 2 格一根
方块：white_concrete + dark_oak_log + dark_oak_stairs
效果：半木结构标志性外观
```

**⑦ 砖石纹理 Mix**
```
做法：主墙中按固定 pattern 嵌入 5%~10% 的异色方块（不用随机函数）
方块：stone_bricks 墙中嵌 andesite / cobblestone
效果：模拟风化与年代感
```

**⑧ 藤蔓覆盖 Vine**
```
做法与方块行为区分：
  - vine：附着在固体方块侧面，会自然向下蔓延，可"从檐口垂到地面"
  - glow_lichen：可贴在方块任意表面（含顶/底/侧），但厚度 1/16 格且不会自然垂挂；
    若要做垂下效果，需沿墙面每一格下方都有附着方块
方块：vine（垂挂）/ glow_lichen（贴面发光）
效果：柔化硬边，增加自然气息（童话/古风/废墟必用）
```

**⑨ 拱形元素 Arch**
```
做法：窗/门/装饰洞的上方用 stair 倒排成半圆拱
      倒置楼梯直接对准支撑块的上半格放置即可（facing 由点击面与玩家站位决定，无需相邻楼梯引导）；不可凭空悬放
尺寸：宽 3~5，拱高 1~2
方块：stone_brick_stairs / dark_oak_stairs
效果：打破全是直角的呆板
```

**⑩ 二楼悬挑 Overhang**
```
做法：二楼整层向外挑 1 格，底部用 stair 托底做斜撑
方块：oak_stairs（托底）+ 主体墙
凸出：+1
效果：中世纪/童话的经典立体感
```

**⑪ 转角倒角 Chamfer**
```
做法：把 90° 直角换成"视觉近似 45°"的倒角，用两块 stair 对角拼接
      注意：Java 版楼梯无真正 45° 几何斜面，仅为视觉近似
方块：与墙同色的 stair
效果：童话/圆润风格必需
```

**⑫ 壁灯柱 Wall Sconce**
```
做法：每 3~4 格在墙上外挑 1 格放 iron_bars 托，灯笼置于铁栏杆【顶面】
      （lantern 只能放在实体方块的顶面或底面，不能贴侧面）
方块：iron_bars + lantern
凸出：+1
效果：既是深度元素又是光源（兼顾§9）
```

**组合方案示例（before → after）**
```
改造前：一面 9×4 的 birch_planks 平墙（B1）
改造后：
  - 两端 + 中间 3 根 oak_log 壁柱（手法①，四角贯通）
  - 底部 stone_brick_slab 腰线一圈闭合（手法②）
  - 两扇 2×2 带框窗，窗距 3（§6.1）
  - 窗下各放一个 flower_pot 花箱（§8.2）
→ 深度层达到 L0/L1/L2/L3 共 4 层，B1 消除
```

---

## 5. 屋顶美化

### 5.1 屋顶三改
```
改一 · 外挑：屋檐向外挑出 2 格（本文档为超平坦场景，统一取 2 格）
        施工：屋顶最外圈 stair 比墙外扩 2 格，末端用 slab 收边
        外挑需有下方梁/托支撑，避免视觉悬空
改二 · 材质对比：屋顶与墙使用不同【材质分组】（分组定义见 §7.5），禁止同组
        浅色木质墙(birch) → 深顶(dark_oak_stairs / blackstone_stairs)
        红墙(red_concrete) → 金顶(yellow_concrete / gold_block 完整方块)
改三 · 收边：屋脊用 stair 两两对接 或 slab 叠一层；檐口末端一圈 slab
        禁止：薄薄一层 stair 悬空、屋脊是平直面
```

### 5.2 加分细节（选 1~2 项，二选一避免冲突）
```
翘角：四角沿对角线逐格抬高，末端 2~3 格各 +1（中式/日式）
天窗：屋顶开 2×2 洞，用 glass 整格填充 + 边框；斜向造型用楼梯围出轮廓（glass 本身不能斜嵌）
烟囱（二选一）：
  (a) 真实烟雾：2×2 柱至屋顶+2，顶端放 campfire，上方留空让粒子自然上升
  (b) 静态造型：用 gray_wool→light_gray_wool→white_wool 逐层渐淡做"烟"，不放 campfire
  禁止同时用 (a) 和 (b)——2 层以上羊毛会完全挡住营火烟雾
屋脊装饰：每 3 格放一个 stair/slab 凸起，形成锯齿剪影
```

---

## 6. 门窗美化

### 6.1 窗户四步法（缺一不可）
```
1) 清洞：CLEAR 目标区域 → air
   尺寸：宽 2~4，高 2；窗台 = 地面 +1（现代风落地窗例外：窗台 = 地面 +0，宽 3~4）
   首层层高 4 时窗高可取 2~3，其余层高 3 时窗高 2
2) 边框：四周 1 格宽 dark_oak_planks / deepslate
3) 玻璃：内部 glass_pane（禁用整块 glass）
4) 窗台：底部外挑 1 格 slab；眉线用【上半砖】或用贴墙上半格放置的倒置 stair
        （不可凭空悬放倒置楼梯）
```

### 6.2 窗墙比（按风格）
| 风格 | 窗墙比 | 窗宽 |
|---|---|---|
| 住宅 / 小屋 | 0.20~0.30 | 2~3 |
| 现代 | 0.40~0.60 | 3~4（落地，窗台=地面+0） |
| 城堡 / 古风 | 0.05~0.10 | 1~2 |

### 6.3 门窗加分项
```
窗格分隔：窗内加 1 根竖向 iron_bars，做成格子窗
花箱：窗台外放 flower_pot + 花，或 stair 做木花箱
门廊：门上方外挑 2 格雨棚（stair 坡顶），两侧于 fence 顶面放 lantern（高=门顶+1）
门楣：门正上方 1 格放标识方块（陶瓦/旗帜/花盆）
窗型变化：同一栋楼用 2 种窗宽交替，比全统一更耐看
```

---

## 7. 配色美化

### 7.1 60 / 30 / 10 法则
```
主色 main   60%  → 墙面
辅助 accent 30%  → 屋顶 / 柱 / 基座
点缀 detail 10%  → 灯 / 花 / 旗 / 彩色玻璃
硬约束（术语定义见 §7.5）：主色分组 ≤2，点缀分组 ≤1；检测按 §7.5 的材质分组计算
```

### 7.2 明度阶梯
```
从下到上：基座深 → 主体中 → 屋顶深（或主体浅→屋顶深）
地面与墙必须使用不同材质分组（§7.5）：如浅色木墙配深石材地面
禁止：白混凝土建筑放 smooth_stone 地面上（同属浅色分组，明度差=0）
```

### 7.3 纹理对比
```
同一面墙上，"平滑材质"与"粗糙材质"搭配使用：
  平滑：white_concrete / smooth_stone / glass
  粗糙：cobblestone / mossy_stone_bricks / oak_log（不存在 raw_wood 方块）
规则：主墙用一种质感，accent 用另一种质感，避免全平滑或全粗糙
```

### 7.4 现成调色板（6 套）
| 名称 | 主色 60% | 辅助 30% | 点缀 10% |
|---|---|---|---|
| 温馨木屋 | `birch_planks` | `dark_oak_log` + `stone_bricks` | `lantern` + `oak_leaves` |
| 现代极简 | `white_concrete` | `blackstone` | `light_blue_stained_glass` + `sea_lantern` |
| 日式和风 | `white_concrete` | `dark_oak_log` + `blackstone_stairs` | `cherry_leaves` + **lantern 置于 stone_bricks 底座（石灯笼造型）** |
| 中式古风 | `red_concrete` | `gold_block` + `yellow_concrete`（屋顶用完整方块） | `white_concrete` + `lantern` |
| 中世纪城堡 | `stone_bricks` | `deepslate_bricks` | `red_banner` + `campfire` |
| 童话魔法 | `pink_concrete` | `birch_log` + `mossy_stone_bricks` | `glowstone` + `vine` |

### 7.5 术语定义与材质分组（检测算法的计算基础）

> Minecraft 方块没有"明度档/色相数"这类游戏内属性。为让检测可执行，本文把所有**主观色彩判断**统一映射为**可枚举的材质分组标签**。所有检测函数（§16）与 QA（§18）只依据本表计算。

```
分组定义（group = 方块所属材质分组，唯一归属；SHADE = 深浅，供 §14.5/§16.1 判定）：
  G_WOOD_LIGHT 浅木 [SHADE=浅]: birch_planks, oak_planks, oak_log, stripped_oak_log, birch_log, oak_stairs
  G_WOOD_DARK  深木 [SHADE=深]: dark_oak_planks, dark_oak_log, dark_oak_stairs, dark_oak_slab
  G_STONE_LIGHT 浅石[SHADE=浅]: white_concrete, smooth_stone, stone, stone_bricks, stone_brick_slab,
                                stone_brick_stairs, cobblestone, gravel, sand, sandstone
  G_STONE_MID   中石[SHADE=浅]: andesite
  G_STONE_DARK  深石[SHADE=深]: deepslate, deepslate_bricks, blackstone, blackstone_stairs,
                                cracked_stone_bricks, mossy_stone_bricks
  G_METAL      金属 [SHADE=深]: gold_block, copper_block, oxidized_copper, cut_copper, iron_block,
                                iron_bars, cauldron, daylight_detector
  G_RED        红系 [SHADE=深]: red_concrete, red_terracotta
  G_PINK       粉系 [SHADE=浅]: pink_concrete, cherry_leaves
  G_YELLOW     黄系 [SHADE=浅]: yellow_concrete, yellow_terracotta
  G_GLASS      玻璃 [SHADE=浅]: glass, glass_pane, light_blue_stained_glass
  G_WOOL       羊毛 [SHADE=中性]: white_wool, light_gray_wool, gray_wool, black_wool, carpet
  G_UTILITY    功能 [SHADE=中性]: lantern, sea_lantern, glowstone, campfire, flower_pot,
                                red_banner, item_frame, clock, ladder, bookshelf, barrel, composter, fence
  G_PLANT      植被 [SHADE=中性]: oak_leaves, vine, glow_lichen, grass_block, dirt

【色相计数口径】COLOR/QA 只统计【建筑主体分组】：即 G_WOOD_*/G_STONE_*/G_METAL/G_RED/G_PINK/G_YELLOW/G_GLASS。
  G_UTILITY（灯/旗/功能件）、G_WOOL（烟/地毯）、G_PLANT（植被/地面）一律不计入色相数——
  这样 §7.4 的 6 套调色板均满足"主体分组 ≤3"（温馨木屋=浅木+深木+浅石 共3；日式=浅石+深木+中石 共3；
  中式=红+金属+黄 共3；城堡式=浅石+深石 共2；童话=粉+浅木+深石 共3；现代=浅石+深石+玻璃 共3）。
主色(main) = 建筑主体分组中面积占比 ≥10% 者，最多 2 个；点缀(accent) = 占比 <10% 的主体分组或中性点缀，最多 1 个。
明度差判定：仅对有 SHADE 的建筑主体分组比较——浅 vs 深 = 明度差 ≥1 档，同深浅 = 0 档；
            中性组（G_UTILITY/G_WOOL/G_PLANT）在材质硬切检测（§16.1 第3步）中直接跳过，不判 FAIL。
色相数判定 = 出现的【建筑主体分组】数量（不含 G_UTILITY/G_WOOL/G_PLANT）。
```

---

## 8. 细节与配件美化

### 8.1 入口三件套（第一印象）
```
1) 门居中：x = ox + floor(w/2)
2) 两侧 lantern：门两侧各放 1 格高 fence，lantern 置于 fence【顶面】，高度=门顶+1
3) 门前三级台阶：从门口向外下方铺设，最外一级与地面齐平，宽 3
   （若门口已在地面，则改用 slab 向上收边，不得让台阶沉入地面）
加分：门廊雨棚、门垫（地毯）、门侧花盆
```

### 8.2 墙面小物件（填充空白）
```
每 3×3 格墙面至少 1 处细节，从下表选：
  flower_pot / 悬吊 ladder / item_frame（内可放 clock）/ red_banner（<color>_banner 任一色）
  bookshelf（贴墙）/ barrel / composter（花盆替代）/ 藤蔓
  注：clock 是物品不是方块，须放入 item_frame；banner 须写具体颜色如 red_banner
规则：细节方块种类 ≤5 种，超过判"杂乱"
```

### 8.3 生活气息（让建筑"有人住"）
```
- 桌上放书 +花盆，床边放箱子
- 晾衣：先放 1 格实体支撑块，其顶面铺 carpet（carpet 只能放实体方块顶面，不能悬挂在 fence 间）
- 烟囱冒烟：按 §5.2 二选一（真实 campfire 粒子 或 静态 wool 渐层），不可混用
- 门口散落：1~2 个 barrel / 木堆（log 横放）
```

### 8.4 屋顶细节
```
风向标（fence + banner）/ 天线（iron_bars 高3）/ 水箱（cauldron）/ 太阳能板（daylight_detector）
```

---

## 9. 光影美化

### 9.1 光源色温分区
```
居住区暖光：lantern / glowstone / campfire
庭院水景冷光：sea_lantern / glow_lichen
规则：同一区域只用一种色温，冷暖分区而非混用
```

### 9.2 隐藏光源（高级感的关键）
```
把 sea_lantern / glowstone 藏在 slab 下、地毯下、树叶中
只透光不见光源 → 避免"灯泡贴在墙上"
```

### 9.3 灯位
```
沿路每 8 格一盏（允许 7~9，标准差 ≤1）：post=stone_bricks 高3，lantern 置于柱【顶面】
建筑四角：lantern @ 墙顶 +2（置于柱/半砖顶面）
门前：两侧各一盏（§8.1）
```

### 9.4 明度检查
```
切到夜晚绕建筑一圈：入口必须是最亮的区域
阴影落点：屋檐阴影应落在墙上（验证外挑是否有效）
```

---

## 10. 环境融合美化

### 10.1 建筑接地（消除"漂浮/切割"感）
```
- 基座外扩 1 圈 slab（过渡）
- 墙脚散放 3~5 块 cobblestone / andesite
- 墙脚种草 / 藤蔓，让建筑"长在"地面里
- 禁止：建筑直接贴草皮无台基（超平坦尤其明显，见 §12.0）
```

### 10.2 植被三层
```
远景：高树 5~8 格，距建筑 ≥6
中景：灌木 2 格，距建筑 3~6
前景：花草按固定 pattern 散播（不用随机函数），密度 20/100㎡
禁遮挡：门窗正前方 3 格内不放树/灌木
```

### 10.3 道路与水体
```
道路：从门口出发，宽 3，gravel / stone_bricks
      边缘 slab 收边，每 4 格微偏移 ±1（避免笔直）
水体（前提见 §12.0，默认超平坦太薄无法挖水，须自定义加厚地层）：
  - 先挖凹槽，槽底铺 sand/gravel（受重力方块只放槽底，会沉到水底形成浅滩）
  - 注水后水面低于岸边 1 格
  - 岸边第一格用 stone_bricks/andesite 做垂直收边（不受重力，不会沉）
  - 禁止水直接贴 grass_block（"方块直切水"）
```

### 10.4 构图（前中背景）
```
前景：小路 + 花坛 + 长椅
中景：建筑主体 + 1~2 棵树
背景：地形起伏 / 树林 / 远景山脊（超平坦用人工土丘补）
规则：三个层次缺一层则画面"空"；相邻层次间高度渐变，无突变断面
```

---

## 11. 八大风格美化速查

> 每种风格列出**最该加强的 3 个美化点**，精力有限时优先做这三项。全部按超平坦取值（屋檐外挑 2 格）。

| 风格 | 美化重点 1 | 美化重点 2 | 美化重点 3 |
|---|---|---|---|
| 新手小屋 | 窗框+窗台四步 | 屋檐外挑2格+深色顶 | 门前台阶+两侧灯 |
| 中世纪半木 | 木框架斜撑网格 | 二楼悬挑+烟囱 | 藤蔓+花箱 |
| 现代别墅 | 错层体块剪影 | 大面积落地玻璃+黑框 | 隐藏灯带+平顶露台 |
| 日式和风 | 檐角上翘 | 木格推拉门+缘侧 | 枯山水+石灯笼造型 |
| 中式古风 | 飞檐翘角+斗拱 | 三级台基+红柱阵列 | 对称中轴+宫灯 |
| 城堡 | 雉堞+圆塔剪影 | 拱形城门 | 护城河+旗帜 |
| 蒸汽朋克 | 铜氧化渐变墙 | 管道+齿轮装置 | 暖黄灯+蒸汽烟囱 |
| 童话魔法 | 圆润倒角(视觉近似) | 巨型蘑菇+彩色屋顶 | 萤石群+藤蔓花环 |

---

## 第二部分 · 超平坦零违和零断裂

## 12. 超平坦基础参数与判定原则

### 12.0 超平坦地层前提（必读，否则水体/下沉规则不可执行）
```
目标版本：Java 1.20+（含 §7.4 的 cherry_leaves）。
【坐标约定】方块用"格坐标 Y"定位；某方块的"顶面高度" = 格坐标 Y + 1（站立面）。
默认 Classic Flat preset：minecraft:bedrock(1) + minecraft:dirt(2) + minecraft:grass_block(1)，自下而上：
  bedrock 格 Y=-64；dirt 格 Y=-63、-62；grass_block 格 Y=-61（其顶面高度 = -60）。
  → 记为 SURFACE_Y = -61（草方块的格坐标）；地表顶面站立高度 = -60。
  从地表向下挖：第 1 格见 dirt(-62)、第 2 格见 dirt(-63)、第 3 格见 bedrock(-64)，
  仅 4 格厚，无法挖出有深度的水体/下沉区域。

【强制前提】本文 §10.3、§14.3、§14.8 涉及"水体 / 下沉 / 挡墙"时，必须满足其一：
  (a) 使用自定义 preset 加厚地层，例如：
      minecraft:bedrock,16*minecraft:dirt,minecraft:grass_block;minecraft:plains
      （bedrock 格 -64，dirt 格 -63..-48，grass_block 格 -47，顶面高度 -46；
        从地表到基岩共 17 格可挖，SURFACE_Y=-47）
  (b) 在默认地层上人工堆土加厚后再开挖。

所有垂直坐标以 grass_block 的【格坐标 Y】为基准，记为 SURFACE_Y（默认 -61 / 加厚 -47）；
建筑第一格 BASE_Y = SURFACE_Y + 1（默认 -60 / 加厚 -46），即地表顶面之上的站立格。
全文"BASE_Y 统一"即指此值全场相同。
```

### 12.1 概念定义与判定原则
```
违和 (Dissonance) = 相邻或同框元素在【风格 / 配色 / 材质分组 / 高度 / 细节密度】上不一致
                    导致视觉"跳""脏""拼凑"
断节 (Discontinuity) = 本应连续的元素在【结构 / 地形 / 路径 / 材质 / 光照 / 水体】上出现
                    中断、悬空、硬切、缺口，导致视觉"断""漏""贴图错误感"

判定原则:
- 违和看"横向比较"：A 与 B 放一起协不协调
- 断裂看"纵向/路径追踪"：顺着一条线走过去断没断
- 两者都以"玩家第一眼能否察觉突兀"为准；能察觉即 FAIL，不设宽容档
- 所有色彩/材质判断一律依据 §7.5 的材质分组表计算，不使用主观的"明度档数/色相数"
```

---

## 13. 零违和：全局一致性（五项统一）

> 超平坦没有自然地形的"杂乱"来掩盖不一致，任何风格混搭都会被放大。

```
风格一致性（最高优先级）
  STYLE-1: 整个场景只允许 1 个主风格模块（见§11）
  STYLE-2: 附属建筑沿用主风格的【屋顶形制 + 柱式 + 窗型】三要素
  STYLE-3: 禁止跨风格拼凑，典型违规：
           ✗ 中式飞檐 + 现代落地玻璃
           ✗ 半木白墙 + 金色斗拱
           ✗ 童话圆角 + 城堡雉堞
  检测: 全场风格特征标签集合大小必须 = 1（风格标签由 §11 的 8 种风格定义）

配色一致性
  COLOR-1: 全场共用一套 60/30/10 调色板（§7.4），单栋不得自创配色
  COLOR-2: 同系列材质优先（如全场 stone_bricks 系：stone_bricks / cracked_stone_bricks / mossy_stone_bricks）
  COLOR-3: 建筑主体分组中，主色分组数 ≤2、点缀分组数 ≤1、主体分组总数 ≤3（按 §7.5 口径）
  检测: 主色分组 >2 或主体分组总数 >3 即 FAIL；
        G_UTILITY/G_WOOL/G_PLANT（灯/旗/烟/植被/地面）不计入，中性点缀不判失败

材质质感一致性
  TEX-1: 同一立面的质感统一（平滑 / 粗糙二选一，accent 用另一种做对比）
  TEX-2: 禁止平滑组与粗糙组在 1 格内无过渡硬切
         ✗ smooth_stone（平滑）直接贴 cobblestone（粗糙）
         ✓ 用 slab/stair 渐变，或插 1 格中间明度方块（具体手法见 §14.5）

高度与体量协调
  MASS-1: 相邻建筑檐口高度差 <= 1 层（3 格），超出用过渡体块衔接
  MASS-2: 全场体块宽度在 [w_min, w_max] 区间内，极值比 <= 2:1
  MASS-3: 超平坦上禁止单栋孤立超高塔，除非有 2 个中间高度体块过渡

细节密度一致性
  DENS-1: 全场 detail_level 相同（同一生成参数）
  DENS-2: std(相邻装饰间距) <= 0.3 × mean(相邻装饰间距)
          禁止一栋挂满藤蔓花箱、隔壁一栋光秃秃
```

---

## 14. 零断裂：结构连续性（九线连通）

### 14.1 地基连续（超平坦头号断节源）
```
BASE-1: 所有建筑共用同一个 BASE_Y（=SURFACE_Y+1，见§12.0），禁止各自抬高不同层数
BASE-2: 建筑底面每一列在 BASE_Y 处必须有方块，无悬空、无沉入
BASE-3: 台基外沿必须与地面有过渡：
        ✓ 台基外扩 1 圈 slab（半格过渡）
        ✓ 台基与草地间散放 3~5 块 cobblestone
        ✗ 台基垂直切面直接接草皮（视觉"切进地面"）
BASE-4: 超平坦地表全为 grass_block，占地内不得残留其他方块断带
```

### 14.2 结构件连续（墙 / 柱 / 腰线 / 檐）
```
STRUCT-1: 壁柱从 BASE_Y 贯通到檐口，中间不得中断（"断柱"）
STRUCT-2: 腰线一圈闭合，四个转角必须相接：
          ✓ 转角用 stair 45° 对接 或 放同色 corner 方块
          ✗ 两条腰线在角上错开 1 格（"断节"）
STRUCT-3: 屋檐外挑一圈闭合，无缺口；转角 stair 朝向连续旋转
STRUCT-4: 墙体材质变更处必须在转角或壁柱处，不得在墙中段硬切
STRUCT-5: 门窗洞口上下左右必须有完整边框，无"半截框"
STRUCT-6: 台基一圈闭合（BASE 环），无缺口
补充：环路上每个 stair 的 facing 必须沿路径方向连续旋转，坐标闭合不等于视觉闭合
```

### 14.3 地形与台地连续（前提见 §12.0）
```
TERRA-1: 人工土丘之间若相邻，交界处高度差 <= 2 格，超出用台阶衔接
TERRA-2: 土丘表层 100% 为 hill_cap(grass_block)，无 dirt 裸露断面
TERRA-3: 台地用阶梯逐级过渡（每级高 2 格、宽 2 格），禁止垂直墙直接从地面拔起
TERRA-4: 下沉区域边缘必须有挡墙(retaining=stone_bricks)收口，无"悬空草皮"
```

### 14.4 道路连续
```
PATH-1: 路径从起点到终点必须连通，无断点、无突然消失
PATH-2: 路宽全程一致（宽 3），变化处用 1 格宽渐变段过渡
PATH-3: 路径转弯处必须填充转角方块，禁止 45° 斜切留空
PATH-4: 两条路交汇处铺 3×3 小广场作为节点，避免"丁字断头"
PATH-5: 路面材质全程一致（同一分组），换材处用 slab 过渡 1 格
```

### 14.5 材质过渡连续
```
TRANS-1: 两种不同分组的交界处，必须满足以下之一：
         (a) 同深浅（按§7.5）→ 可直接相邻
         (b) 插 1 格中间明度方块（如 white_concrete 浅 → stone 中 → deepslate 深）
         (c) 用 A_slab / A_stairs 做 1 格渐变
TRANS-2: 3 格宽过渡带内按 2:1 比例混合 A/B，形成自然渐变
检测: 扫描所有相邻方块对 (b1,b2)，若 group 不同且深浅不同且无过渡方块 → FAIL
```

### 14.6 植被连续
```
VEG-1: 植被密度空间渐变，禁止"一半密林一半空地"的突变边界
VEG-2: 相邻树干间距在 [5,8] 格，无两树重叠、无 >8 格空档
VEG-3: 树高渐变（相邻树高差 <= 2 格），避免高低断崖
VEG-4: 植被与建筑过渡：墙脚 1~2 格放灌木/藤蔓，不直接"草地撞墙"
```

### 14.7 光照连续
```
LIGHT-1: 沿路每 8 格一盏（允许 7~9，std<=1），间距标准差 <= 1 格
LIGHT-2: 禁止出现连续 2 个灯位空缺（"一段亮一段暗"）
LIGHT-3: 同一区域色温统一（暖区全 lantern/glowstone/campfire，冷区全 sea_lantern/glow_lichen）
LIGHT-4: 夜间检查：入口为全局最亮点；相邻两灯中点地面光级 >=7（无暗斑断层）
         （注：每盏灯是局部亮度峰值，故不要求"单调递减"，只要求无过暗区间）
```

### 14.8 水体连续（前提见 §12.0：默认超平坦太薄，须加厚地层）
```
WATER-1: 水面在单一高度，禁止相邻水面出现 1 格落差而无瀑布/台阶过渡
WATER-2: 岸边必须有 >=1 格不沉过渡材质（stone_bricks/andesite）收边；
         sand/gravel 只能放槽底（受重力会沉底），禁止水直接贴 grass_block
WATER-3: 水路连通：池塘/河流之间用水道相连，避免"孤立水坑"
WATER-4: 池底必须为连续实体方块，无可见虚空（流动水可位于空气上方形成瀑布，但水池底部不得空缺）
```

### 14.9 天际线连续（超平坦专属）
```
SKY-1: 远景环带半径 r ∈ [45,120]，角度间隔 <= 8°，无缺口
       （半径取大值以覆盖默认模拟距离 160 格内的视野，避免仍看到"一张纸"）
SKY-2: 相邻山脊高度差 <= 2 格，形成连绵起伏，禁止孤立单峰
SKY-3: 环带内侧树带间距 6 格，与山脊无缝衔接
SKY-4: 禁止"平地尽头突然一面墙"——所有边界必须有高度渐变收尾
```

---

## 15. 超平坦特有陷阱与体块融合

### 15.1 八个特有陷阱

| 陷阱 | 表现 | 对应规则 |
|---|---|---|
| T1 无限平面 | 视野尽头是"一张纸"，无任何收束 | §14.9 SKY-1~4 |
| T2 漂浮感 | 建筑像"摆"在地面上，无接地过渡 | §14.1 BASE-3 |
| T3 体块拼凑 | 多个盒子硬拼，接缝裸露 | §15.2 体块融合 |
| T4 地面材质突变 | 一路 gravel 突然变 grass，无过渡 | §14.5 TRANS |
| T5 孤立元素 | 单棵树/单座塔突兀地立在空旷平地 | §14.6 VEG-2、§13 MASS-3 |
| T6 高度断层 | 台基与地面垂直切开 | §14.1 BASE-3、§14.3 TERRA-3 |
| T7 光照孤岛 | 一段路有灯一段没灯 | §14.7 |
| T8 条纹地面 | 超平坦默认图层在远处形成规则条纹 | §14.9 SKY-1~4（人工山脊/树带打破） |

### 15.2 体块融合（消除拼凑感）
```
MASS-FUSE-1: 相邻体块必须共享 >=1 格宽的接触面，禁止只贴一个角
MASS-FUSE-2: 接触面两侧高度差 <=1 层；超出用 stair 过渡
MASS-FUSE-3: 每个体块独立做屋顶收边，禁止裸露的断面（"断头墙"）
MASS-FUSE-4: 体块颜色按主辅关系分配，不得两个体块用两个主色分组
检测: 沿每个体块外轮廓走一圈，遇到的"裸露剖面"数量必须 = 0
```

---

## 16. 断节与违和检测算法

> AI 按以下顺序扫描，两个函数都返回空列表才通过。所有色彩/材质判断依据 §7.5 分组表，概念可计算。
>
> **实现状态（v2.2 起）：§7.5/§16/§18 已落地为可执行代码 `scripts/aesthetic.cjs`。**
> CLI `litematic.cjs run` 生成后自动调用 `aesthetic.grade(a)`，其 `paletteAudit()` 对应 §16.2 的
> COLOR_OVERLOAD、`structureAudit()` 的洪泛 FLOATING / 比例 / 材质硬切对应 §16.1，
> `detailAudit()` 对应 §8。任一 P0 命中即 `aesthetic=BLOCK`（exit 1）阻断交付。
> 正向原语见 `scripts/aesthetic_kit.cjs`（palettePick/windowFourStep/entranceKit/facadeKit）。
> 注：实现中占比 <3% 的 trace 分组（如少量窗户玻璃）不计入配色超标，≤3 个显著主色组合格
> （对应 §7.4「温馨木屋=浅木+深木+浅石 共3组」基准）。

### 16.0 场景数据接口（算法依赖的变量定义）
```
scene.buildings : 建筑列表，每项含 .footprint(占地坐标集合)、.eave_y(檐口Y)、
                  .palette(所用调色板id)、.detail_level(细节等级)、.style_tag(风格标签)
scene.paths     : 道路列表，每项含 .start / .end 坐标
scene.lamps     : 沿路灯位坐标列表（按路径顺序；仅含沿路灯，不含门前灯/四角灯）
scene.expected_lamp_slots : 沿路径按 8 格间隔推导出的理想灯位坐标列表（用于判定空缺）
scene.backdrop  : 远景环带，含 .points[(角度°,半径r,高度h)] 与 .trees(树位列表)
scene.mounds    : 人工土丘列表，含 .height
scene.water     : 水体方块集合
scene.surface_blocks : 全场可见表面方块集合（材质硬切扫描对象）
scene.style_tags: 全场风格标签集合
adjacent(b)     : 返回与建筑 b 相邻（共享面）的建筑列表
GROUP(block)    : 返回该方块所属分组名字符串，取值为 §7.5 定义的 G_* 之一（如 "G_PLANT"）
TYPE(block)     : 返回方块类型 id 字符串（如 "grass_block"）
SHADE(group)    : 返回"浅"/"深"/"中性"（中性不参与明度差计算）

辅助函数（均为标准几何/集合运算，此处明确签名）：
  SOLID(x,y,z)                   : 坐标处是否为实心方块
  neighbors(block)               : 返回六邻接方块
  pos(block)                     : 返回方块坐标
  dist(a,b)                      : 两坐标的欧氏距离（此处按沿路径的相邻灯位直线距离计）
  CONNECTED(a,b)                 : 两点在路面格集合上是否四邻接连通
  CLOSED_LOOP(ring)              : 环路边格是否首尾闭合
  FACING_CONTINUOUS(ring)        : 环路上 stair 的 facing 是否沿路径连续旋转
  HAS_TRANSITION(b1,b2)          : 两块之间是否存在 §14.5 的过渡方块
  adjacent_pairs(list)           : 返回列表中所有相邻（共享面/共享边）元素对
  SHARES_FACE(a,b)               : 两体块是否共享 >=1 格宽的接触面
  consecutive_empty_slot(expected,lamps,n): 以理想灯位 expected 为参考，实际 lamps 中是否存在连续 n 个空缺
  std(xs) / mean(xs)             : 序列标准差 / 均值
  area_of_group(scene,group)     : 某分组的可见格数
  visible_area(scene)            : 全部建筑主体方块可见格总数（用于算占比）
  subject_groups(scene)          : 全场出现的【建筑主体分组】集合（§7.5：不含 G_UTILITY/G_WOOL/G_PLANT）
  main_groups(scene,threshold=0.10): subject_groups 中面积占比 >=threshold 者（主色判定，§7.5）
```

### 16.1 断节检测
```
SCAN_DISCONTINUITY(scene):
  breaks = []
  BASE_Y = SURFACE_Y + 1                                  # §12.0

  # 1. 地基扫描
  for building in scene.buildings:
    for (x,z) in building.footprint:
      if not SOLID(x, BASE_Y, z):
        breaks += ("BASE_HOLE", x, BASE_Y, z)              # §14.1 BASE-2

  # 2. 结构闭合扫描（腰线/屋檐/台基三圈闭合）              # §14.2 STRUCT-2/3/6
  for ring in [cornice_ring, eave_ring, foundation_ring]:
    if not CLOSED_LOOP(ring) or not FACING_CONTINUOUS(ring):
      breaks += ("RING_BREAK", ring.id)

  # 3. 材质硬切扫描（只查共享面的相邻方块，用分组+深浅，可计算）  # §14.5
  for b1 in scene.surface_blocks:
    for b2 in neighbors(b1):                               # 仅六邻接（共享面），不含对角
      g1, g2 = GROUP(b1), GROUP(b2)
      if SHADE(g1) == "中性" or SHADE(g2) == "中性": continue   # 中性组跳过
      if g1 != g2 and SHADE(g1) != SHADE(g2) and not HAS_TRANSITION(b1, b2):
        breaks += ("MATERIAL_HARD_CUT", pos(b1), pos(b2))

  # 4. 道路连通扫描                                        # §14.4 PATH-1
  for path in scene.paths:
    if not CONNECTED(path.start, path.end):
      breaks += ("PATH_BREAK", path.start, path.end)

  # 5. 光照连续扫描（仅沿路灯位；允许区间 7~9 含端点）       # §14.7 LIGHT-1/2
  gaps = [dist(scene.lamps[i], scene.lamps[i-1]) for i in 1..len(scene.lamps)-1]
  if gaps and (max(gaps) > 9 or min(gaps) < 7 or std(gaps) > 1):
    breaks += ("LIGHT_GAP", scene.lamps, gaps)            # max>9/min<7 才失败，7 与 9 本身合格
  if consecutive_empty_slot(scene.expected_lamp_slots, scene.lamps, n=2):
    breaks += ("LIGHT_GAP", scene.lamps)                  # 连续 2 个理想灯位无实际灯

  # 6. 水体过渡扫描                                        # §14.8 WATER-2
  SHORE_OK = {"stone_bricks", "andesite", "stone", "gravel", "sand"}  # 不沉收边 / 槽底材质
  for water_block in scene.water:
    for nb in neighbors(water_block):
      if TYPE(nb) in SHORE_OK or TYPE(nb) == "water": continue
      # 岸边第一格必须是实体不沉材质；草/空气/未登记方块视为缺收边
      breaks += ("WATER_HARD_EDGE", pos(water_block), TYPE(nb))

  # 7. 天际线闭合扫描（含半径与高度差）                     # §14.9 SKY-1/2
  pts = scene.backdrop.points
  if max(p.angle_gap for p in pts) > 8:
    breaks += ("SKYLINE_GAP", "angle", max(p.angle_gap for p in pts))
  if not all(45 <= p.r <= 120 for p in pts):
    breaks += ("SKYLINE_GAP", "radius", [p.r for p in pts])
  for (a, b) in adjacent_pairs(pts):
    if abs(a.h - b.h) > 2:
      breaks += ("SKYLINE_GAP", "height", a, b)

  return breaks   # 必须为空列表
```

### 16.2 违和检测
```
SCAN_DISSONANCE(scene):
  issues = []

  if len(set(scene.style_tags)) > 1:                       # §13 STYLE-1
    issues += ("STYLE_MIX", scene.style_tags)

  if len({b.palette for b in scene.buildings}) > 1:        # §13 COLOR-1
    issues += ("PALETTE_SPLIT", {b.palette for b in scene.buildings})

  mains = main_groups(scene, threshold=0.10)              # 主色=面积占比>=10%的建筑主体分组（§7.5）
  subjects = subject_groups(scene)                        # 建筑主体分组总数
  if len(mains) > 2 or len(subjects) > 3:
    issues += ("COLOR_OVERLOAD", mains)                   # 中性组/植被不计入

  if len({b.detail_level for b in scene.buildings}) > 1:   # §13 DENS-1
    issues += ("DENSITY_MISMATCH", {b.detail_level for b in scene.buildings})

  # 相邻建筑檐口高度差（语义=相邻，非全场极值）             # §13 MASS-1
  for b in scene.buildings:
    for nb in adjacent(b):
      if abs(b.eave_y - nb.eave_y) > 3:
        issues += ("HEIGHT_JUMP", b, nb)

  for adjacency in adjacent_pairs(scene.buildings):
    if not SHARES_FACE(adjacency.a, adjacency.b):          # §15.2 MASS-FUSE-1
      issues += ("CORNER_TOUCH", adjacency)

  return issues   # 必须为空列表
```

---

## 17. 修复手法库

> 检测出违和 / 断节后，按编号选修复动作，禁止"凭感觉加方块"。

| 检测结果 | 修复动作 |
|---|---|
| `BASE_HOLE` | 在坐标补 stone_bricks 至 BASE_Y，确保每列实心 |
| `RING_BREAK` | 缺口处补同材质方块；转角用 stair 45° 对接并修正 facing 使朝向连续 |
| `MATERIAL_HARD_CUT` | 交界插 1 格中间分组方块，或用 slab/stairs 做渐变 |
| `PATH_BREAK` | 断点补路面材质；若终点缺失则延伸到边界并做收头广场 |
| `LIGHT_GAP` | 空缺位置补灯柱（post=stone_bricks h3, lantern 置于顶面） |
| `WATER_HARD_EDGE` | 水与草之间用 stone_bricks/andesite 做垂直收边；sand/gravel 只放槽底 |
| `SKYLINE_GAP` | 按具体原因补山脊（角度缺口补一座 / 半径越界则调整 / 高度差大则补过渡丘），高度取相邻均值 ±1 |
| `STYLE_MIX` | 删除异风格特征，按主风格三要素（屋顶/柱/窗）统一重建 |
| `PALETTE_SPLIT` | 全场重置为同一套 60/30/10 调色板（选出现次数最多的那套） |
| `COLOR_OVERLOAD` | 移除占比 <10% 的非中性分组，使主色分组 ≤2、总分组 ≤3（按§7.5） |
| `DENSITY_MISMATCH` | 按主 detail_level 补齐稀疏建筑的装饰 |
| `HEIGHT_JUMP` | 在相邻建筑间加过渡体块（高度取两者中间）或降低较高者檐口 1 层 |
| `CORNER_TOUCH` | 移动体块使接触面 >=1 格宽，或在缝隙插入连接廊 |

> 美化类 QA 失败（平墙 B1、配色脏 B6、入口寒酸 B7 等）不在检测错误码内，按 §1 诊断表对应的药方小节整改。

---

## 18. 统一 QA 清单（含零容忍项）

> 全部为 true 才合格；标注【零容忍】的项失败必须整体重建，不得局部修补。
> **本清单是 §13~§14 全部规则中的关键/可机器检测子集**，标 P 级的条目与 §2 施工优先级对应；未列入 QA 的规则仍须满足，仅作人工目检。

### A. 美化质量（P0~P5，对应 §1~§11）
```yaml
[P0] 轮廓比例:
  - 剪影有 >=3 段高度变化
  - 宽:檐高在 1.2:1~1.6:1
  - 层高 >=3（首层可4）；层高=2 判 P0 失败（§1 B3）
  - 每 4~5 格有 >=1 个高出主体的垂直元素（§3.3）
[P1] 配色:
  - 主色分组 <=2、点缀分组 <=1，总分组 <=3（§7.5）
  - 地面与墙分属不同深浅分组（§7.2）
[P2] 立面:
  - 每面墙深度层 >=3
  - 单材质平墙 <=5×5（>5×5 判 B1 病）
  （四角 accent 柱贯通属零断裂要求，见 C 段 STRUCT-1）
[P3] 屋顶门窗:
  - 屋檐外挑 >=2（超平坦统一值，§5.1）
  - 屋顶与墙分属不同材质分组（§7.5）
  - 每扇窗=清洞+边框+glass_pane+窗台+眉线；落地窗窗台=地面+0（§6.1）
[P4] 细节光影:
  - 细节方块种类 <=5
  - 入口三件套齐全（§8.1）
  - 夜晚入口为最亮区域；无裸露灯泡（§9.2）
[P5] 环境:
  - 门窗前 3 格无遮挡
  - 水体有 >=1 格不沉材质收边（§10.3、§14.8 WATER-2）
  - 前/中/背景三层齐全（§10.4）
```

### B. 零违和（横向一致性，§13）
```yaml
  - 【零容忍】全场风格标签集合大小 = 1
  - 【零容忍】全场调色板统一；主色分组 <=2、点缀分组 <=1（§7.5）
  - 相邻建筑檐口高度差 <=1层（3格，§13 MASS-1）
  - 全场 detail_level 一致
  - 附属建筑沿用主风格屋顶/柱式/窗型三要素（§13 STYLE-2）
  - 体块接触面 >=1格宽，无裸露断面（§15.2）
  - 同系列材质优先；平滑/粗糙质感同一立面统一（§13 COLOR-2/TEX-1）
```

### C. 零断裂（纵向连续性，§14）
```yaml
  - 【零容忍】BASE_Y 全建筑统一（=SURFACE_Y+1），无悬空无沉入
  - 【零容忍】腰线/屋檐/台基三圈全闭合，stair facing 连续（§14.2）
  - 【零容忍】道路连通，无断点
  - 材质硬切处 100% 有过渡（按分组+深浅，§14.5）
  - 灯距 7~9 格且 std<=1，无连续空缺
  - 水体边缘 100% 有 >=1 格不沉材质收边（§14.8）
  - 天际线环带闭合：角度间隔 <=8°、半径 45~120、相邻高差 <=2 格（§14.9）
  - 土丘表层 100% 为 grass_block，相邻土丘高差 <=2 格（§14.3 TERRA-1/2）
  - 植被密度渐变，树干间距 5~8 格（§14.6）
  - 壁柱贯通、门窗边框完整、墙体材质只在转角/壁柱处变更（§14.2 STRUCT-1/4/5）
```

### D. 检测函数
```yaml
  - SCAN_DISCONTINUITY() 返回空列表
  - SCAN_DISSONANCE() 返回空列表
```

```
FAIL_ACTION:
  - 【零容忍】项或 P0/P1 失败必须整体重建；
  - 其余一致性类按 §17 修复手法局部修补；
  - 美化类（B1~B8）按 §1 诊断表对应药方小节整改；
  - 修完重跑 §16 检测，直至两个函数均返回空列表。
```

---

## 一句话总纲

> **美观 = 轮廓有变化（§3）+ 立面有深度（§4，12 手法）+ 配色有克制（§7，按§7.5分组计算）+ 环境有融合（§10）**；
> **不出错 = 零违和（风格/配色/材质分组/高度/细节密度五项全场统一，横向比不出差异）+ 零断裂（地基/结构/地形/道路/材质/植被/光照/水体/天际线九线连通，纵向追不断点）**；
> **超平坦前提 = 默认地层仅 4 格厚，涉及水体/下沉必须自定义 preset 加厚（§12.0）**。
> 超平坦没有自然地形遮丑，所以每一处"跳"和"断"都必须靠规则消除，两个检测函数返回空列表才算完成。
