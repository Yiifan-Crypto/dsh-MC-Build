'use strict'
// mc_build: run a builder script's source and write the resulting .litematic
// into the viewer's output directory. The panel watches that directory, so the
// result appears in the god-view viewer automatically.

import { writeFile, readFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolveProjectDir } from './paths.mjs'

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/

/** Resolve the builder project (scripts/ + output/) that `code` will run against. */
async function findProject(preferred) {
  const root = resolveProjectDir(preferred)
  if (root === null) return null
  // The bundle ships its own output/ tree. A redirected project may not have
  // one yet, so make sure it exists before the CLI tries to write into it.
  await mkdir(join(root, 'output'), { recursive: true }).catch(() => {})
  return root
}

/** Write the builder source to a private script and run it with the project's CLI. */
function runBuilder(project, scriptFile, outName, timeoutMs = 120000) {
  const cli = join(project, 'scripts', 'litematic.cjs')
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, 'run', scriptFile, '--out', outName], {
      cwd: project,
      windowsHide: true,
      env: process.env,
    })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => { child.kill(); stderr += '\n[timed out]'; }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (e) => { clearTimeout(timer); done({ ok: false, error: String(e && e.message || e) }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

export function createMcBuildTool(logger = console) {
  return {
    name: 'mc_build',
    description:
      'Run a Minecraft build script and turn it into a .litematic that appears in the god-view panel. ' +
      'Write the FULL CommonJS builder source as `code`, exporting {name,desc,size:[sx,sy,sz],build(a)}. ' +
      'The scripts/litematic.cjs module is available as ./scripts/litematic.cjs (Arena, box, set, hollowBox, gableRoof, door, save) and ./scripts/scenery.cjs is available too (terrain, river, water, scatterTrees, archBridge, tower, plaza, ruins). ' +
      'IMPORTANT — aesthetics: use ./scripts/aesthetic_kit.cjs palettePick(style)/windowFourStep/entranceKit/facadeKit to get correct 60/30/10 palette and detail in one shot. After every build the CLI runs an automatic aesthetic gate (./scripts/aesthetic.cjs); P0 issues (rainbow palette, floating blocks, bad proportions) make the build FAIL with aesthetic=BLOCK — fix and regenerate. ' +
      'The file is written in your chosen build project and run there; the output goes to output/, where the viewer picks it up.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Full CommonJS builder source, e.g. const {Arena}=require("./scripts/litematic.cjs"); module.exports={name:"castle",size:[48,32,48],build(a){...}};',
        },
        name: { type: 'string', description: 'Optional output id (letters, digits, _ or -). Defaults to the builder\'s own name.' },
        projectDir: { type: 'string', description: 'Optional build project directory containing scripts/litematic.cjs and output/.' },
        design: {
          type: 'string',
          description: 'REQUIRED. Design document (markdown): 判据 / 体量 / 布局(标清半径原点) / 预检算式(>=8 行带数字) / 画序(含停止边界) / 风险 / 砍掉项 / 验收。模板见 references/design-doc-template.md。缺它 -> design=BLOCK，不生成。',
        },
        timeoutMs: { type: 'integer', description: 'Execution timeout in milliseconds (default 120000).' },
      },
      required: ['code', 'design'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args) => {
      const code = typeof args.code === 'string' ? args.code : ''
      if (!code.trim()) return { ok: false, error: 'code 不能为空' }
      const project = await findProject(args.projectDir)
      if (project === null) return { ok: false, error: '找不到构建工程（需要 scripts/litematic.cjs 和 output/ 目录）' }

      let outputName = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : ''
      if (outputName && !NAME_RE.test(outputName)) return { ok: false, error: 'name 只能包含字母、数字、下划线和连字符（1-64 位）' }
      if (!outputName) {
        const m = /name\s*:\s*[`'\"]([^`'\"]+)[`'\"]/.exec(code)
        const candidate = m ? m[1] : 'mcbuild-' + randomBytes(3).toString('hex')
        outputName = NAME_RE.test(candidate) ? candidate : 'mcbuild-' + randomBytes(3).toString('hex')
      }
      if (!outputName.endsWith('.litematic')) outputName += '.litematic'

      const hash = createHash('sha1').update(code).digest('hex').slice(0, 12)
      // `require('./scripts/litematic.cjs')` in agent-authored code resolves
      // relative to the script file, so the temp builder must sit at the
      // project root, next to scripts/ and output/.
      const scriptFile = join(project, '.mcbuild-' + hash + '.cjs')

      // 「先思考后写」：设计书必须先落盘，否则 CLI 会以 design=BLOCK 拒绝生成。
      const design = typeof args.design === 'string' ? args.design : ''
      if (!design.trim()) {
        return {
          ok: false,
          error: 'design 不能为空：先写设计书再写程序（模板 bundle/references/design-doc-template.md）。',
          required_sections: ['判据', '体量', '布局', '画序', '预检算式', '风险', '砍掉项', '验收'],
          hint: '设计书要带算式（半径越界 / 层重叠 / 净空 / 门槛高差 / 宽高比），至少 8 行含数字。',
        }
      }
      const designDir = join(project, 'output', 'design')
      await mkdir(designDir, { recursive: true })
      const designFile = join(designDir, '.mcbuild-' + hash + '.md')
      await writeFile(designFile, design, 'utf8')

      await writeFile(scriptFile, code, 'utf8')

      const timeout = Math.min(Math.max(Number(args.timeoutMs || 120000) || 120000, 1000), 600000)
      const result = await runBuilder(project, scriptFile, outputName, timeout)
      await rm(scriptFile, { force: true }).catch(() => {})

      const outPath = join(project, 'output', 'litematic', outputName)
      const exists = existsSync(outPath)
      if (!result.ok) {
        return { ok: false, error: '构建脚本执行失败', code: result.code, stdout: result.stdout, stderr: result.stderr }
      }
      if (!exists) {
        return { ok: false, error: '脚本看似成功，但输出文件不存在', stdout: result.stdout, stderr: result.stderr, expected: outPath }
      }
      // Read back through the CLI so build data is verified before reporting success.
      return {
        ok: true,
        name: outputName.replace(/\.litematic$/, ''),
        file: outPath,
        stdout: result.stdout,
        stderr: result.stderr || undefined,
        hint: '蓝图已写入 output/litematic，上帝视角面板会自动刷新并保留视角。',
      }
    },
  }
}

export { runBuilder, findProject }
