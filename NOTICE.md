# NOTICE — Third-Party Components

This repository bundles a third-party component that is **not** covered by the
project's MIT LICENSE.

## OpusMC viewer engine (`viewer/`)

| | |
|---|---|
| Component | OpusMC god-view viewer engine |
| Build | bilibili build, v49058 |
| Location | [`viewer/`](viewer/) |
| Upstream license | **none provided / not stated by upstream** |
| How it is used | Served unchanged over the plugin's `/opusmc` webserver route and loaded in an iframe by the 建筑上帝视角 panel. It renders the generated `.litematic` build. |

### Terms of inclusion

- The engine is included **as-is**, unmodified, for the sole purpose of letting
  the plugin preview generated builds inside the DSH client.
- It is distributed here **without any license or warranty of any kind** from
  the upstream author. No permission to redistribute, modify, or use it for any
  other purpose is granted or implied by this repository.
- **The MIT LICENSE in this repository covers only the plugin's own code**
  (`index.js`, `client.js`, `paths.mjs`, `mctools.mjs`, `mcbuild.mjs`,
  `litematic.mjs`, `render-shot.cjs`, `scripts/`, `skills/`, `references/`,
  `docs/`, `locale/`). It does **not** cover `viewer/`.
- If you redistribute this repository, you do so with the `viewer/` directory
  included as-is and under the responsibility of the redistributor. If you do
  not have the right to redistribute the engine, remove the `viewer/` directory
  before redistributing — the plugin's host-side code will still function, but
  the 建筑上帝视角 panel will have no engine to load.

### What to do if you are the upstream author

If you own the OpusMC engine and do not want it redistributed here, open an
issue or contact the repository owner and it will be removed (or replaced with
a pointer to an official distribution) promptly.
