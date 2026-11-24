# Contributing to dsh-opusmc-viewer

Thanks for wanting to improve MC建筑工坊. This plugin is deliberately
**self-contained and rule-driven** — please keep those two properties intact.

## Ground rules

1. **`references/build-rules.md` is the single source of truth.** Don't add a
   rule somewhere else and leave it out of the authoritative doc. If you change
   a rule, change it there and update the skill(s) that reference it.
2. **Don't fork the rules into the skills.** Each skill writes only its own
   procedure and points back at `build-rules.md`. Duplicated rules rot.
3. **Keep the plugin self-contained.** New build-side helpers belong in
   `scripts/`, not in an external project on disk. No hard-coded drive letters
   or machine-specific absolute paths — resolve everything relative to
   [`paths.mjs`](paths.mjs).
4. **The four gates are not optional.** `design`, `aesthetic`, `walkable` and
   consistency must all pass before a build is delivered. Don't add a flag that
   lets a build skip a gate to "get it done".

## Making a change

1. Fork and branch from `main`.
2. Make the change. If you touch `scripts/aesthetic.cjs` or `scripts/checks.cjs`,
   update `references/build-rules.md` in the same commit.
3. Add or update a test under `tests/` — `npm test` must pass.
4. Update `CHANGELOG.md` under an `Unreleased` heading.
5. Open a pull request describing **what changed and why**, and whether it
   changes any rule (so reviewers know to re-check the gates).

## Running the tests

```bash
npm test
```

Requires Node.js ≥ 20.11. No external dependencies.

## Vendored scripts

`scripts/` is a vendored copy of the build toolchain. Changes to the toolchain
should land here (this is what the published plugin runs). If you maintain a
separate upstream project, note in the commit that the two should be kept in
sync, and describe the delta in `CHANGELOG.md`.

## Third-party components

`viewer/` is a third-party engine and is **out of scope for code changes**.
If you need a different viewer, do it behind the `/opusmc` route without
modifying the bundled engine, and update `NOTICE.md`.

## Commit messages

Use a short imperative summary, e.g.:

```
paths: resolve build project relative to the bundle
```

Prefixes that help reviewers: `paths`, `tools`, `skills`, `rules`, `tests`,
`docs`, `viewer`, `ci`.
