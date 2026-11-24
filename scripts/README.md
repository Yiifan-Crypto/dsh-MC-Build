# scripts/ — vendored build scripts

This directory holds the **self-contained copy** of the build toolchain that the
plugin's `mc_*` tools and `mc_build_code` run against. It was vendored from the
original `build-litematic` project so that this plugin is self-contained and can
be installed anywhere without an external project on disk.

**No logic was changed during the vendoring** — only the location moved.

## Contents

| File | Role |
|---|---|
| `litematic.cjs` | Core `.litematic` writer/reader: `Arena` canvas, NBT, `save`, `verifyFile`, `preview`, `previewSide`, plus the `run` / `verify` CLI with the DESIGN + AESTHETIC + WALKABLE + SCALE gates |
| `aesthetic.cjs` | `grade`: colour grouping / floating blocks / proportions / silhouette / detail density |
| `aesthetic_kit.cjs` | `palettePick` (60/30/10), `windowFourStep`, `entranceKit`, `facadeKit` — the "positive primitives" that make a build look good by default |
| `require_design.cjs` | Design-document gate: missing file / section / tier declaration / arithmetic → `design=BLOCK` |
| `scale.cjs` | Volume tiers: small <10k / medium 10k~80k / large ≥100k; default medium 20k~50k |
| `check_reuse.cjs` | P14 parameter-reuse check (new builds must not copy old parameters; `--base <builder>` for modifications) |
| `checks.cjs` | `walkableReport`, `supportReport`, `headroomReport`, `connectPass`, `stairFacingReport`, `stairRunReport` |
| `verify_reachable.cjs` | Flood-fill proof that the interior is reachable from outside |
| `scenery.cjs` | Terrain / river / water / tree / canopy / scatterTrees / archBridge / tower / plaza / ruins |
| `city.cjs` | Road-first city growth: seed a road, extend with turns/branches, place house plots along roads with per-district hue unity |
| `build_kit.cjs` | `mat` / `matReport` (colour+material → block, reports colour delta), `teamPalette` (five-tone scales), `revolve` (profile lathe), `ring`, `frame` (radial local frames), `checkComplete` |

### Example builders

Small, self-contained builders that double as readable references for the
`Arena` API and the aesthetic kit:

| File | Shows |
|---|---|
| `example-house.cjs` | A basic enclosed house (`hollowBox` + `gableRoof` + `door`) |
| `example-scene.cjs` | Scenery composition using `scenery.cjs` |
| `example-town.cjs` | Road-first town using `city.cjs` + `checks.cjs` |
| `aesthetic_villa.cjs` | Enclosed aesthetic example (60/30/10 + playability) |

Run any of them with the CLI:

```bash
node scripts/litematic.cjs run scripts/example-house.cjs --out example-house.litematic
```

(Add `--design <path.md>` when a design document is required by the gate.)

## Keeping it in sync

`aesthetic.cjs` and `checks.cjs` are the rule-bearing scripts. If you change the
aesthetic or walkability rules, change them **here** (this copy is what the
published plugin actually runs) and note the change in `CHANGELOG.md`.

`references/build-rules.md` remains the single authoritative statement of the
rules; these scripts are their executable implementation.
