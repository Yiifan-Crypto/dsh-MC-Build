# 在 opusmc 网页版 MC 里实现 MC-Architect 风格施工工具

日期：2026-11-17
状态：修订版（已合并独立 builder 审查 + 用户决定），待批准

## 意图与为什么

用户要的不是"离线生成 .litematic 再预览"，而是让 AI **直接在 opusmc 网页版 MC 世界里实时施工**：边施工边看、截图验收、操作旁观相机旋转视角、改造已有建筑，最后导出 `.litematic`。能力对标 MC Architect MCP，但载体是浏览器里的 OpusMC 引擎，不安装真实 MC 1.21.11 客户端。

旧的"三份 skill + mc_build 离线蓝图生成"范式移除。

## 用户已定（本轮确认）

- 工具名沿用 MC Architect MCP 风格：`mc_*` 前缀。
- 施工在**超平坦世界**进行（地面层固定，建筑从 y=1 起；锁定 gen1，y 从 0 起算）。
- **面板关闭时 AI 也要能施工**，引擎必须常驻后台。

## 目标

- AI 对 opusmc 世界实时读写方块，面板打开即见最新结果。
- 参数化施工原语：box / wall / pillar / gable_roof / circle / arc_wall / dome / spiral_stairs。
- 区域编辑：fill / replace / copy / rotate / mirror；世界扫描：统计 / 高度图 / 包围盒。
- 旁观相机：定位 / 旋转 / 移动 / 复位 / 预设视角，保留用户手动视角。
- 无 HUD 截图落盘并返回路径；操作历史可撤销。
- 导出真实 `.litematic` 到 `output/litematic/`。
- 保留 opusmc 上帝视角面板；保留读取既有 `.litematic` 预览的能力（兼容旧产物与导出后的回看）。

## 非目标

- 不做真实 MC 客户端 / Fabric mod / bridge 接入。
- 不做红石模拟、实体、存档格式。
- blockstate 保真以引擎可映射为限：方块种类必须正确，少见的状态属性（朝向/半砖等）尽最大努力映射，无法映射时退回默认状态并在导出报告里说明。

## 架构（三层）

### 1. 浏览器层

`viewer.js` 注入 `window.__mcArchitect` 桥对象：

- **写方块**：走引擎现成的 `world.setBlock(x,y,z,id,meta,flags)`（`world.js:1265-1290`）——它已经自动维护 `sectionCount`、`markBlock` 标脏、relight 与邻域通知。批量施工时传 `flags=2`（跳过逐方块重光，避免开销）；**命令收尾必须对受影响的 chunk 做一次 `world.initLight(ch)` 补光**（flags=2 跳过了 `relight`，不做会让新方块区域光照错乱），然后 `game.flushMesh()`（`game.js:2149-2159`，只 mesh 玩家附近脏区块）实时显示。**不**用底层 `ch.setB`（漏 sectionCount）+ recount + 逐方块 finishChunk 那条又重又易错的路。
- **相机**：真源是 `cam` 对象（`viewer.js:45`），每帧 `tickCam → applyCamera` 覆盖 `game.player`；因此 `mc_camera` 必须改 `cam` 或调 `__opusmcViewer.setView/topView/resetView/getCamera/setCamera`（`viewer.js:415-443`），**不直接改 player**。
- **截图**：必须复用引擎已验证的 Photo 取帧法（`extras.js:438-447`）：先 `ui.hideHud = true; ui.screen = null; game.render(1, performance.now())` 同步重画一帧，再 `drawImage(game.canvas, …)` 到 2D canvas 后 `toDataURL()`，画完恢复 hideHud。**不**加引擎附带的署名条/二维码（那是展示功能）。直接对 WebGL canvas 取图会因 `preserveDrawingBuffer:false` 得到黑图。
- **超平坦冷启动**：`viewer.js:331-337` 现在无 `.litematic` 就 fail 退出。新增"施工模式"启动路径：无 `build` 参数时跳过 `api/builds` 失败分支，直接 `setupWorld(gen1)` + 超平坦地面 generator + `Player` + `game.state='play'`；有 `build` 参数或显式预览时仍走原 `placeBuild`。
- **命令队列与同步返回（关键）**：AI 工具的 `execute(args)` 必须**同步等结果**（仿 `mcbuild.mjs:83-126` 的 async execute），所以 Host 用"长轮询 + 结果表"把异步 iframe 包装成同步：工具把命令写入表（分配 `id`）→ `await` 一个 Promise（带超时，如 30s）→ iframe 300ms 轮询 `GET /cmd/poll?worker=…` 取命令、执行、`POST /cmd/result{id,…}` → Host resolve 对应 Promise。结果表里保留 `pending/done` 状态，超时返回明确错误。`fetch` 不受 rAF 停摆影响，但**施工依赖 rAF 驱动的 updateChunks/flushMesh**（`game.js:646,696`），若 iframe 隐藏导致 rAF 停摆，纯 `setBlock` 写数据仍成功、但画面不刷新——所以保活 spike 决定到底是"数据实时写入"还是"画面也实时"。

### 2. 后台常驻 iframe（架构生死点，先 spike）

不能用 `display:none`：隐藏页面 rAF 停摆，WebGL 上下文可能被回收，打开面板时白屏。方案：

- iframe 始终挂载，用**离屏但仍在合成层中**的方式隐藏：`position:fixed; left:-10000px; top:0;` 保持接近视口尺寸、`pointer-events:none; opacity:0`（具体以 spike 结果为准）。
- 面板打开时把同一 iframe 移回面板内，不重建引擎、不丢世界和视角。
- 保活：若检测到 rAF 停摆，后台 `setInterval` 调 `game.render(1, performance.now())` 维持画面与上下文；监听 `webglcontextlost` 并重建。
- 若 spike 证明离屏 iframe 仍会被停摆/回收，则退而求其次：保持一个极小的可见 iframe（1px 透明角落）作为常驻引擎，面板显示时再放大。

### 3. Host 层（`bundle/index.js`）

新增 POST 路由，含 `request.text()/json()` body 解析（现有 `handle()` 是纯 GET）：

- `POST /opusmc/api/cmd/put` — AI 工具写入命令
- `GET  /opusmc/api/cmd/poll` — iframe 拉取
- `POST /opusmc/api/cmd/result` — iframe 回传（含 base64 截图）
- `POST /opusmc/api/export` — 世界数据回传，Host 用 `litematic.cjs` 的通用 `encodeNBT` 重拼 Region/BlockStatePalette/BlockStates 落盘

截图落 `output/screenshot/`，`.litematic` 落 `output/litematic/`（面板自动识别）。

### 4. Agent 工具层

`tools.register` 注册，名字沿用 `mc_*`：

| 工具 | 作用 |
|---|---|
| `mc_health` | 引擎就绪、世界尺寸、方块数 |
| `mc_scan` | 区域统计 / 高度图 / 包围盒 |
| `mc_build` | 参数化施工（8 种原语） |
| `mc_set_blocks` | 按坐标批量设方块 |
| `mc_region` | fill / replace / copy / rotate / mirror |
| `mc_camera` | 旁观相机定位/旋转/移动/复位/预设 |
| `mc_screenshot` | 无 HUD 截图，落盘返回路径 |
| `mc_undo` | 撤销上一步（撤销栈存在浏览器层 `window.__mcArchitect`，iframe 重建会丢失；批量施工按"反向操作"记录，不整世界快照，避免内存爆炸） |
| `mc_clear` | 清空到超平坦地面 |
| `mc_export` | 导出 `.litematic` |

## 删除项

- `bundle/index.js`：移除 `SKILLS`、`mountSkill()` 注册、旧 `mc_build` 注册。
- bundle 内 `skill.md` / `superflat-beautify.md` / `workflow-skill.md` 及 meta：从 `package.json` 的 `files` 与注册逻辑移除（不注册即可，文件可留作归档）。
- 保留 `litematic.mjs` 与 viewer 的 `.litematic` **读取/预览**路径。

## 实现前必须做的 4 个 spike（按序）

1. **常驻 iframe 生死**：离屏 iframe 加载 viewer，计数 rAF vs setInterval 隐藏 30 秒；监听 contextlost；隐藏期间 setB 改方块，显示后看是否刷新。决定 iframe 隐藏方式与保活策略。
2. **截图**：对比 WebGL canvas `toDataURL()`（预期黑屏）与 Photo 模式（预期有图），落定 `mc_screenshot` 实现。
3. **写方块正确性**：`world.setBlock(...,flags=2)` 批量施工 + `flushMesh()` 后截图，确认新方块显示、旧网格不残留、光照未坏；与逐方块 finishChunk 方案对比性能。
4. **命令管道**：同源 iframe 300ms 轮询 + POST body（含大 base64）回传，验证顺序、id 对应、隐藏/显示时均可用。

## 风险与约束

- 施工坐标以 opusmc gen1 世界为准（y 从 0 起），必须锁定 gen1，不然 MIN_Y=-64 会错位。
- 导出时 id/meta → `minecraft:xxx` 名字反查用 `BLOCKS[i].key` + `vanillaState` 尽力映射；blockstate 属性不保证完全保真，在导出报告中标注。`encodeNBT`（litematic.cjs:12-36）只是通用 NBT 编码器，不是现成的 .litematic saver；Host 侧需按 save()（litematic.cjs:101-139）重新拼 Region/Palette/BlockStates。
- 隐藏常驻 iframe 持续占 WebGL2/内存；spike 后确定保活成本，必要时提供"暂停引擎"开关。
