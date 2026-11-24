# MC建筑工坊 · dsh-opusmc-viewer

一套**先思考、再建造**的 Minecraft 建筑工作流，作为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai) 插件运行。

核心规矩只有一条：**写构建代码之前必须先交设计书**（八节，含体量档位声明与至少 8 行带数字的算式）。
设计书不通过 → `design=BLOCK`，不生成；四道闸门（`design` / `aesthetic` / `walkable` / 一致性）
任何一道不过 → **内部返工，不交付、不宣称完成**。

体量按档位自报：**小 <10k / 中型 10k~80k / 大型 ≥100k**，默认目标中型 **20k~50k**。

本插件**自包含**：构建脚本、规则库、技能、预览引擎全部随包分发，clone 下来无需额外配置即可使用。

---

## 它提供什么

### 两条建造路线

| 路线 | 工具 | 适合 |
|---|---|---|
| **A · 蓝图** | `mc_build_code`（`code` + **`design` 必填**）→ 产出 `.litematic` | 复杂形体、精确控制、导入 Litematica 投影 |
| **B · 在线施工** | `mc_*` 九件套，在内存模型里直接施工 | 边看边改、要截图验收、快速试形 |

两条路线共用同一套规则与闸门。

### `mc_*` 在线施工工具

| 工具 | 作用 |
|---|---|
| `mc_health` | 检查模型就绪、世界尺寸、方块数、可撤销步数 |
| `mc_init` | 重置画布尺寸并重铺 y=0 超平坦草地 |
| `mc_build` | 参数化施工：`box` / `pillar` / `wall` / `circle` / `arc_wall` / `dome` / `gable_roof` / `spiral_stairs`，支持方块状态（`oak_stairs[facing=east]`） |
| `mc_set_blocks` | 按坐标批量设置方块（可带状态对象） |
| `mc_region` | 区域编辑：`fill` / `replace` / `copy` / `rotate` / `mirror`，搬运时连方块状态一起转 |
| `mc_undo` | 撤销上一次施工操作（增量回滚，不做整世界快照） |
| `mc_clear` | 清空 y≥yMin 的方块（可撤销） |
| `mc_palette` | 取一套 60/30/10 配色的具体方块名 |
| `mc_window` | 四层窗一次成型：挖空 + 木框 + 玻璃 + 窗台半砖 + 眉檐楼梯 |
| `mc_entrance` | 入口三件套：台阶 + 壁灯 + 门楣雨棚 |
| `mc_facade` | 立面进深：四角壁柱 + 半高腰线 + 顶部出挑檐口 |
| `mc_screenshot` | 一次性渲染等距/俯视/正视 PNG，供 AI 看图迭代 |
| `mc_export` | 导出 `.litematic`，右下角面板自动显示 |
| `mc_build_code` | 写一段完整构建程序直接产出 `.litematic`（进阶，精度最高） |

### 四道闸门

1. **DESIGN** — 设计书八节齐全、含档位声明与 ≥8 行算式，否则 `design=BLOCK`。
2. **AESTHETIC** — 配色分组 / 悬空 / 比例 / 剪影 / 细节密度，P0 问题直接 `BLOCK`。
3. **WALKABLE** — 1×2 可通行、装饰承托、净空分布。
4. **一致性** — 超平坦上的断节与违和检测（见 `superflat-beautify` 技能）。

### 建筑上帝视角面板

右下角悬浮按钮打开面板：下拉选择蓝图（按时间倒序 + 今天/昨天/近 7 天分组 + 搜索），
透视 / 俯视 / 正视切换，蓝图重建后自动重载并保留视角。

---

## 安装

### 方式一：本地 link（推荐开发时使用）

在 DSH profile 的 `package.json` 里加依赖：

```json
{
  "dependencies": {
    "dsh-opusmc-viewer": "link:D:/path/to/dsh-MC-Build"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-opusmc-viewer"]
    }
  }
}
```

### 方式二：从 GitHub 安装

```json
{
  "dependencies": {
    "dsh-opusmc-viewer": "github:Yiifan-Crypto/dsh-MC-Build"
  }
}
```

装好后重启 DSH，右下角会出现「建筑上帝视角」按钮。

### 环境变量（可选，均有默认值）

| 变量 | 作用 | 默认 |
|---|---|---|
| `MC_BUILD_PROJECT_DIR` | 指定构建工程目录（需含 `scripts/litematic.cjs`） | 插件自身目录 |
| `OPUSMC_BUILD_DIR` | 指定 `.litematic` 输出目录 | 插件自身 `output/litematic` |

**正常安装不需要设置任何环境变量。**

---

## 快速开始

```
1. 加载 mc-build-plan 技能 → 选路线（A 蓝图 / B 在线）
2. 按 references/design-doc-template.md 写设计书（八节 + 档位 + 算式）
3. 交用户确认
4. 路线 A：调 mc_build_code（code + design）→ 产出 .litematic
   路线 B：mc_init → mc_build / mc_window / mc_entrance / mc_facade → mc_screenshot 验收 → mc_export
5. 过四道闸门，未通过则内部返工
6. 右下角面板查看成品
```

规则的唯一权威来源是 [`references/build-rules.md`](references/build-rules.md)。
各技能只写自己那部分做法，不重复规则。

---

## 目录结构

```
.
├── index.js            Host 侧：/opusmc 路由、蓝图→payload、注册技能与工具
├── client.js           Client 侧：建筑上帝视角 React 面板
├── paths.mjs           统一路径解析（相对插件自身，环境变量可覆盖）
├── mctools.mjs         mc_* 在线施工工具
├── mcbuild.mjs         mc_build_code：跑 builder 程序产出 .litematic
├── litematic.mjs       极简 .litematic 读取（CONTIGUOUS 位打包）
├── render-shot.cjs     一次性等距渲染 PNG
├── scripts/            vendored 构建脚本（见 scripts/README.md）
├── skills/             4 个技能（md + meta）
├── references/         规则库：build-rules.md 为唯一权威
├── locale/             中英文元数据
├── docs/               面向用户的详细说明
├── viewer/             第三方 OpusMC 引擎（见 NOTICE.md）
├── tests/              node:test 测试
└── output/             构建产物（git 忽略）
```

---

## 测试

```bash
npm test
```

使用 Node 内置测试运行器（`node --test`），无外部依赖。覆盖：

- `.litematic` 写出 → 回读 → `verifyFile` 的往返一致性
- `mc_*` 工具的建造 / 撤销 / 区域编辑 / 导出端到端
- `mc_build_code` 的 `design=BLOCK` 闸门
- 路径解析不含硬编码盘符
- client 模块 id 与包名一致（不一致会导致面板静默消失）
- `/opusmc` 路由、示例蓝图与蓝图转换

### 安装自检

装完后想确认这个安装是好的，不用先怀疑插件：

```bash
node scripts/verify-install.mjs            # 检查本包
node scripts/verify-install.mjs <插件目录>  # 检查另一个安装位置
```

它会挂载一个最小 DSH 宿主、用真实 HTTP 提供 `/opusmc` 路由、
建造一栋房子并导出蓝图，逐项报告 15 个检查点的通过情况。

## 第三方声明

`viewer/` 目录包含第三方 OpusMC 引擎，**不在本仓库 MIT 许可范围内**。
详见 [`NOTICE.md`](NOTICE.md)。

## License

插件自身代码：[MIT](LICENSE) © Yiifan-Crypto
