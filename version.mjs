'use strict'
// Version check and in-place update for the plugin.
//
// This machine can reach GitHub only over git (curl/fetch to api.github.com and
// raw.githubusercontent.com fail outright), so the version source is the
// repository's semantic tags read with `git ls-remote --tags`. That costs one
// round trip and no download, and works for a public repository without a token.
//
// Update shells out to the profile's package manager. It is deliberately
// conservative: it never edits package.json by hand and never removes files it
// does not own — it asks pnpm to install the newer version, then tells the user
// to restart DSH, because the running process still holds the old code.

import { spawn } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url))

/** Public repository URL — no credentials required to read tags. */
export const REPO_URL = 'https://github.com/Yiifan-Crypto/dsh-MC-Build.git'

/** The same repository in pnpm's github: shorthand, for install specs. */
export const GH_SHORTHAND = 'github:Yiifan-Crypto/dsh-MC-Build'

/** How long a successful check stays fresh, in ms. */
const CACHE_TTL = 5 * 60 * 1000

let cache = { at: 0, latest: null, error: null, source: null }

/** Run a command, resolve with { code, stdout, stderr }. Never rejects. */
function run(cmd, args, opts = {}) {
  return new Promise((done) => {
    let child
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd || BUNDLE_DIR,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        shell: false,
      })
    } catch (e) {
      done({ code: -1, stdout: '', stderr: String(e && e.message || e) })
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* already gone */ }
      stderr += '\n[timed out]'
    }, opts.timeoutMs || 20000)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (e) => {
      clearTimeout(timer)
      done({ code: -1, stdout, stderr: stderr + String(e && e.message || e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

/** The version of the installed copy. */
export function currentVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(BUNDLE_DIR, 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** Compare two semver-ish strings. Returns >0 when a is newer than b. */
export function compareVersions(a, b) {
  const parse = (v) => String(v).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((n) => {
    const x = parseInt(n, 10)
    return Number.isFinite(x) ? x : 0
  })
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

/** Pick the highest semantic tag out of `git ls-remote --tags` output. */
export function highestTag(output) {
  const versions = []
  for (const line of String(output).split(/\r?\n/)) {
    const m = /refs\/tags\/(v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(line.trim())
    if (m) versions.push(m[1].replace(/^v/i, ''))
  }
  if (!versions.length) return null
  versions.sort(compareVersions)
  return versions[versions.length - 1]
}

/**
 * Ask GitHub for the newest released tag. Cached for CACHE_TTL so opening the
 * panel repeatedly doesn't shell out every time.
 *
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<{current: string, latest: string|null, hasUpdate: boolean,
 *   error: string|null, source: string, checkedAt: number}>}
 */
export async function checkVersion(opts = {}) {
  const current = currentVersion()
  const now = Date.now()
  if (!opts.force && cache.latest !== null && now - cache.at < CACHE_TTL) {
    return {
      current,
      latest: cache.latest,
      hasUpdate: compareVersions(cache.latest, current) > 0,
      error: null,
      source: 'cache',
      checkedAt: cache.at,
    }
  }

  const r = await run('git', ['ls-remote', '--tags', REPO_URL], { timeoutMs: 20000 })
  let latest = null
  let error = null
  if (r.code !== 0) {
    error = (r.stderr || 'git ls-remote failed').split('\n').slice(-3).join(' ').trim()
    if (/ENOENT|not recognized|not found/i.test(error)) {
      error = '找不到 git 命令，无法检查更新（需要把 git 加入 PATH）'
    }
  } else {
    latest = highestTag(r.stdout)
    if (latest === null) error = '仓库还没有发布标签，无法判断版本'
  }

  if (latest !== null) {
    cache = { at: now, latest, error: null, source: 'git' }
  }

  return {
    current,
    latest,
    hasUpdate: latest !== null && compareVersions(latest, current) > 0,
    error,
    source: 'git',
    checkedAt: now,
  }
}

/**
 * Locate the DSH profile that owns this installed copy: the nearest ancestor
 * directory that has a package.json listing us as a dependency. Returns null
 * when the bundle is not installed under a node_modules tree.
 */
export function findProfileDir() {
  let dir = BUNDLE_DIR
  for (let depth = 0; depth < 6; depth++) {
    const pkgFile = join(dir, 'package.json')
    if (existsSync(pkgFile)) {
      // Walk up until we find the directory that actually owns package.json
      // (pnpm nests the real package under .pnpm/...).
      try {
        const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
        if (pkg.name === 'dsh-opusmc-viewer' && pkg.dependencies === undefined) {
          // this is our own package.json — keep climbing
        } else if (pkg.dependencies) {
          return dir
        }
      } catch { /* unreadable manifest, keep climbing */ }
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Resolve the package manager to run the install with.
 *
 * DSH does not put its bundled pnpm on the child process PATH, so `spawn('pnpm')`
 * fails with ENOENT inside the DSH host. Look for the bundled binary first and
 * only fall back to PATH last.
 */
export function pnpmCommand() {
  if (process.env.DSH_RUNTIME_PNPM && existsSync(process.env.DSH_RUNTIME_PNPM)) {
    return { cmd: process.execPath, args: [process.env.DSH_RUNTIME_PNPM] }
  }
  const dshHome = process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
  const runtimes = join(dshHome, 'dsh-runtimes')
  try {
    for (const name of readdirSync(runtimes)) {
      const candidate = join(runtimes, name, 'dependencies', 'pnpm', 'bin', 'pnpm.cjs')
      if (existsSync(candidate)) return { cmd: process.execPath, args: [candidate] }
    }
  } catch {
    /* no runtimes directory: fall through */
  }
  return { cmd: 'pnpm', args: [] }
}

/**
 * Install the newest version into the owning profile.
 *
 * @param {{target?: string}} [opts]
 * @returns {Promise<{ok: boolean, from: string, to: string|null, log: string, error?: string}>}
 */
export async function updateToLatest(opts = {}) {
  const before = currentVersion()
  const info = await checkVersion({ force: true })
  if (info.latest === null) {
    return { ok: false, from: before, to: null, log: '', error: info.error || '无法获取最新版本' }
  }
  if (!info.hasUpdate) {
    return { ok: true, from: before, to: before, log: '', error: undefined }
  }

  const profile = findProfileDir()
  if (profile === null) {
    return {
      ok: false,
      from: before,
      to: info.latest,
      log: '',
      error: '找不到安装位置（插件可能是以 link 方式挂载的），请用 DSH 插件管理器更新',
    }
  }

  const { cmd, args } = pnpmCommand()
  // This package lives on GitHub, not in the npm registry, so the install spec
  // must be a git reference pinned to the release tag. `pkg@3.0.6` would be
  // resolved against npmjs and 404.
  const spec = GH_SHORTHAND + '#v' + info.latest
  const r = await run(cmd, [...args, 'add', spec], {
    cwd: profile,
    timeoutMs: 5 * 60 * 1000,
  })
  const log = [r.stdout, r.stderr].filter(Boolean).join('\n').trim()
  if (r.code !== 0) {
    return {
      ok: false,
      from: before,
      to: info.latest,
      log,
      error: log.split('\n').slice(-4).join(' ').trim() || `安装失败（退出码 ${r.code}）`,
    }
  }
  cache = { at: 0, latest: null, error: null, source: null }
  return { ok: true, from: before, to: info.latest, log }
}

export { run as runCommand, BUNDLE_DIR as pluginDir }