'use strict'
// Central path resolution for the MC Building Studio bundle.
//
// Every path resolves relative to this file, so the plugin works from any
// checkout or install location — no hard-coded drive letters, no dependence
// on a specific machine's directory layout. Environment variables can still
// point the build project somewhere else when desired.
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This bundle's own directory. */
export const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url))

/** Vendored build scripts (litematic.cjs, aesthetic.cjs, ...). */
export const SCRIPTS_DIR = join(BUNDLE_DIR, 'scripts')

/** Bundled third-party OpusMC viewer engine. */
export const VIEWER_DIR = join(BUNDLE_DIR, 'viewer')

/** Build output root (git-ignored). */
export const OUTPUT_DIR = join(BUNDLE_DIR, 'output')
export const LITEMATIC_DIR = join(OUTPUT_DIR, 'litematic')
export const SHOT_DIR = join(OUTPUT_DIR, 'screenshot')
export const DESIGN_DIR = join(OUTPUT_DIR, 'design')

/** Bundled sample blueprints — a fresh install has no output/ yet. */
export const SAMPLES_DIR = join(BUNDLE_DIR, 'samples')

/** Env vars that can redirect the build project away from the bundle. */
export const ENV_PROJECT_DIR = 'MC_BUILD_PROJECT_DIR'
export const ENV_LITEMATIC_DIR = 'OPUSMC_BUILD_DIR'

/**
 * Resolve the build project — the directory holding `scripts/litematic.cjs`
 * (and, by default, an `output/` tree). Order: explicit argument, then the
 * env override, then this bundle itself.
 *
 * @param {string} [preferred] explicit project directory
 * @returns {string|null} absolute project root, or null when nothing qualifies
 */
export function resolveProjectDir(preferred) {
  const candidates = [
    preferred,
    process.env[ENV_PROJECT_DIR],
    process.env[ENV_LITEMATIC_DIR],
    BUNDLE_DIR,
  ].filter((v) => typeof v === 'string' && v.trim().length > 0)

  for (const dir of candidates) {
    const root = isAbsolute(dir) ? resolve(dir) : resolve(BUNDLE_DIR, dir)
    // Reject path traversal; accept any real location that ships the CLI.
    if (root.split(/[\\/]/).some((seg) => seg === '..')) continue
    try {
      if (existsSync(join(root, 'scripts', 'litematic.cjs'))) return root
    } catch {
      /* an unreadable path is simply not a candidate */
    }
  }
  return null
}
