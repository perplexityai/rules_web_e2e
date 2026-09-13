// Runs inside the Linux execution action. Result consumption stays local.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as {
  runfiles: Record<string, string>
  runner: string
  env: Record<string, string>
  args: string[]
  output: string
  capture: boolean
}
const output = path.resolve(job.output)
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-action-'))
const artifacts = path.join(output, 'artifacts')
fs.mkdirSync(artifacts, {recursive: true})
const escape = (value: string) => value.replaceAll('\\', '\\b').replaceAll(' ', '\\s').replaceAll('\n', '\\n')
const manifest = path.join(temp, 'MANIFEST')
fs.writeFileSync(manifest, Object.entries(job.runfiles).map(([name, source]) =>
  ` ${escape(name)} ${escape(path.resolve(source))}\n`
).join(''))
const result = spawnSync(process.execPath, [
  path.resolve(job.runner), ...job.args, ...(job.capture ? ['--update'] : []),
], {
  env: {
    ...process.env,
    ...job.env,
    RUNFILES_DIR: temp,
    RUNFILES_MANIFEST_FILE: manifest,
    JS_BINARY__NODE_BINARY: process.execPath,
    TEST_TMPDIR: temp,
    TEST_UNDECLARED_OUTPUTS_DIR: artifacts,
    VRT_CAPTURE_OUTPUT: job.capture ? path.join(output, 'baselines') : '',
  },
  stdio: 'inherit',
})
if (result.error) console.error(result.error)
// Return a successful build action even when tests fail, so Bazel downloads
// their reports and screenshots. The local test wrapper returns this status.
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
  schemaVersion: 1,
  mode: job.capture ? 'capture' : 'compare',
  exitCode: result.status ?? 1,
}))
fs.rmSync(temp, {recursive: true, force: true})
