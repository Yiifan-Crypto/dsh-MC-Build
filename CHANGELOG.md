# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
