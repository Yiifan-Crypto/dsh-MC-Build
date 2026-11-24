# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.10] - 2026-11-25

### Fixed

- **「更新」按钮仍然拿到 405，但这次跟方法判断无关。** 实测 DSH 的 webserver
  **只把 GET 转发给路由**：`POST /opusmc/api/update` 在到达插件之前就被上游
  回成 405，而且**响应体是空的**——正是这一点让它看起来像插件自己的拒绝。

  客户端改用 `GET /opusmc/api/update?confirm=1`。确认标记仍是准入条件
  （无 `confirm` 的请求一律 405），所以不会因为换成 GET 就被误触。

  实测：`GET ...?confirm=1` → `200 {"ok":true,"from":"3.0.10","to":"3.0.10"}`；
  `GET` 无 confirm → `405`。

## [3.0.9] - 2026-11-25

### Fixed

- **面板上的「更新」按钮返回 405。** DSH 的 webserver 转交给路由的 request 并不总是
  带 `method`，于是 `method !== 'POST'` 把真实的更新请求当成非法方法拒掉了。
  现在接受显式确认：`POST` 或 `?confirm=1` 均可，客户端两个都带。

  测试同时覆盖「无确认的 GET 必须被拒」与「无 method 但带 confirm 必须放行」。

## [3.0.8] - 2026-11-25

### Fixed

- **更新会删掉用户自己建的建筑。** 蓝图原本写在插件包内的 `output/litematic`，
  而 `pnpm add` / `pnpm update` 会重建整个包目录——一次更新就等于清空作品。
  实测升级 3.0.6 → 3.0.7 后面板里的蓝图从 32 个掉到 1 个。

  现在用户数据放在包外：`~/.dsh/opusmc/`（可用 `DSH_HOME` 重定向）。
  - 包内目录仍在扫描列表里，老安装的蓝图当场可见；
  - 首次加载时会把包内残留的蓝图**复制**（不覆盖）到持久目录，升级不再丢作品；
  - 截图与设计稿同样移到包外。

### Added

- 测试断言用户产物目录不得位于 `node_modules` 下，防止以后又把它挪回包里。

## [3.0.7] - 2026-11-25

### Fixed

- **3.0.6 的「更新」按钮装不上。** 它调用 `pnpm add dsh-opusmc-viewer@3.0.6`，而 pnpm
  会拿版本号去 **npm 官方 registry** 查——这个包只存在于 GitHub，于是直接
  `ERR_PNPM_FETCH_404`。安装规格改为 git 引用并钉到发布标签
  （`github:Yiifan-Crypto/dsh-MC-Build#v3.0.7`），实测能正常升级。

  这也解释了为什么更新必须走标签：`#tag` 是 git 层面的东西，不需要包进 npm。

## [3.0.6] - 2026-11-25

### Added

- **版本检查与面板内更新.** 建筑上帝视角面板的标题栏现在显示当前版本徽章：
  - 平时是一个低调的 `v3.0.6`，点它强制重新检查。
  - 发现新版本时变成高亮的 `↑ v3.0.7 可更新`，点一下直接安装，完成后提示重启 DSH。

  实现在 `version.mjs`，新增两个接口：`GET /opusmc/api/version`（带 5 分钟缓存，
  `?force=1` 跳过）与 `POST /opusmc/api/update`（拒绝 GET，避免误触）。

- 新增两个导出：`GET /opusmc/api/version` / `POST /opusmc/api/update`。

### Notes

- 版本源是**仓库的语义化 tag**，用 `git ls-remote --tags` 读取。这样做的原因是本机
  到 `api.github.com` / `raw.githubusercontent.com` 的 HTTP 全部不通，只有 git 协议可用；
  顺带好处是公开仓库无需 token、只花一次往返、不下载任何文件。
- 更新走 profile 自带的包管理器把新版本装进去，**不改 package.json、不删任何非自有的文件**。
  运行中的进程仍持有旧代码，所以装完必须重启 DSH 才生效——界面会明确提示这一点。

## [3.0.5] - 2026-11-25

### Fixed

- **`OPUSMC_BUILD_DIR` did not redirect the `mc_*` tools.** 3.0.4 pointed the
  tools at `resolveProjectDir()`, which requires `scripts/litematic.cjs` to be
  present — so pointing it at a plain output directory silently fell back to
  the bundle. The two knobs now mean what their names say:
  - `OPUSMC_BUILD_DIR` — where `.litematic` files live. The `mc_*` tools write
    there and the panel scans there, so exports stay visible without copying
    the toolchain.
  - `MC_BUILD_PROJECT_DIR` — a full build project (`scripts/` + `output/`), used
    by `mc_build_code`, which genuinely needs the CLI.

### Added

- Child-process tests asserting `mc_*` output follows `OPUSMC_BUILD_DIR` and
  stays inside the bundle when it is unset.

## [3.0.4] - 2026-11-25

### Fixed

- **`MC_BUILD_PROJECT_DIR` did not redirect the panel.** `mc_*` tools wrote to
  the configured project while `index.js` kept listing the bundle's own
  `output/litematic`, so a redirected project exported blueprints that never
  appeared in the 建筑上帝视角 panel. Both sides now resolve the project through
  the same `resolveProjectDir()`, and the panel additionally scans the
  configured project's `output/litematic`.

### Added

- `scripts/verify-install.mjs` — a self-check that mounts an installed copy
  against a minimal DSH host, serves its routes over real HTTP, builds, renders
  and exports a blueprint, and reports pass/fail for 15 checks. Run it to
  confirm an install is healthy:
  `node scripts/verify-install.mjs [plugin-dir]`.

### Changed

- `SAMPLES_DIR` moved into `paths.mjs` so every path lives in one place.

## [3.0.3] - 2026-11-25

### Added

- **A bundled sample blueprint** (`samples/sample-cottage.litematic`). A fresh
  install has no `output/` directory yet, so `listBuilds()` found nothing and
  the 建筑上帝视角 panel opened on an empty viewport reading "没有找到
  .litematic 建筑文件" — which reads as a broken plugin rather than an empty
  one. The sample is discovered alongside generated builds, flagged as a
  built-in demo in the dropdown (`示例`), and converts through the same payload
  path as any user build.

### Changed

- The empty-state message now explains what to do
  ("用 mc_* 工具建造后 mc_export，蓝图会出现在这里") instead of just stating
  that nothing was found.

## [3.0.2] - 2026-11-25

### Fixed

- **The 建筑上帝视角 panel never appeared after renaming the package.** `client.js`
  still registered its browser bundle under the retired id
  `@local/opusmc-viewer`, while `package.json` now says `dsh-opusmc-viewer`. DSH
  mounts client bundles by package name, so the host half loaded (routes and
  tools worked) but the client half was silently skipped — no button, no error
  anywhere. The module id now matches the package name.
- Added a regression test that fails if the client module id and the package
  name ever drift apart again.

## [3.0.1] - 2026-11-25

### Fixed

- `cordis.patch.yml` still inserted the plugin under its old private package
  name (`@local/opusmc-viewer`), which does not exist for anyone installing
  from GitHub. The inserted name now matches the published package
  (`dsh-opusmc-viewer`), so a fresh `github:` install enables the bundle
  correctly. The Cordis row id (`opusmc-viewer`) is unchanged.

## [3.0.0] - 2026-11-25

### Added

- **Self-contained distribution.** The build toolchain previously living in an
  external `build-litematic` project is now vendored into `scripts/`
  (`litematic.cjs`, `aesthetic.cjs`, `aesthetic_kit.cjs`, `require_design.cjs`,
  `scale.cjs`, `check_reuse.cjs`, `checks.cjs`, `verify_reachable.cjs`,
  `scenery.cjs`, `build_kit.cjs`). The plugin now runs from any install
  location with no external project required.
- `paths.mjs` — single source of path resolution. Everything resolves relative
  to the bundle; `MC_BUILD_PROJECT_DIR` and `OPUSMC_BUILD_DIR` can still
  redirect the build project and the `.litematic` output directory.
- `tests/` — `node:test` suite covering `.litematic` round-trips, the `mc_*`
  tool set (build / undo / region / export), the `design=BLOCK` gate, and the
  absence of hard-coded drive paths.
- `.github/workflows/ci.yml` — runs the test suite on `ubuntu-latest` and
  `windows-latest`.
- `NOTICE.md` and `viewer/NOTICE.md` — explicit third-party declaration for the
  bundled OpusMC engine.
- `README.md`, `CONTRIBUTING.md`, `LICENSE` (MIT), `.gitignore`, `.gitattributes`.

### Changed

- **Removed all hard-coded absolute paths.** The previous build project path
  (`D:/AI/工作区/建筑/build-litematic`) and the `root.startsWith('D:')` guard in
  `mcbuild.mjs` are gone. The build project defaults to the bundle itself.
- **Restructured the repository.** The plugin root is now the repository root:
  the former `bundle/` contents moved up one level, and the skills moved into
  `skills/`.
- Package renamed from the private `@local/opusmc-viewer` to the public
  `dsh-opusmc-viewer`. The Cordis plugin name (`opusmc-viewer`) and the
  `/opusmc` route are unchanged, so existing installs keep working.
- `mc_screenshot` scale range widened from 2–12 to 2–14, matching the tool
  description.
- `render-shot.cjs` now loads its colour table from the vendored
  `scripts/litematic.cjs` instead of an absolute path.

### Removed

- Backup and scratch files (`*.bak`, `_backups/`, stray empty files) from the
  tracked tree.

## [2.3.0]

- Prior release (pre-consolidation). Served the bundle from the external
  `build-litematic` project and required that project to exist on disk.
