import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

export interface RemoteJob {
  runner: string
  env: Record<string, string>
  args: string[]
  output: string
  mode: 'capture' | 'compare' | 'test'
}

/** Preserve child failure reports as build outputs for the local result consumer. */
export function runRemoteJob(job: RemoteJob, node: string, environment: NodeJS.ProcessEnv = {}) {
  const timeoutMs = Number(job.env.VRT_TIMEOUT_MS)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Remote VRT job requires a positive VRT_TIMEOUT_MS')
  const runfiles = environment.RUNFILES_DIR || process.env.TEST_SRCDIR || process.env.RUNFILES_DIR
  if (!runfiles) throw new Error('Browser execution requires Bazel runfiles')
  const output = path.resolve(job.output)
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-action-'))
  const artifacts = job.mode === 'test' ? output : path.join(output, 'artifacts')
  fs.mkdirSync(artifacts, {recursive: true})
  const result = spawnSync(node, [
    path.resolve(job.runner), ...job.args, ...(job.mode === 'capture' ? ['--update'] : []),
  ], {
    // Galleries can run discovery and comparison separately. Bound both phases
    // even if the runner's own timeout cannot reap a stuck child.
    timeout: timeoutMs * 2 + Math.max(1000, Math.ceil(timeoutMs / 10)),
    killSignal: 'SIGKILL',
    env: {
      ...process.env,
      ...job.env,
      ...environment,
      RUNFILES_DIR: runfiles,
      RUNFILES_MANIFEST_FILE: '',
      JS_BINARY__NODE_BINARY: node,
      TEST_TMPDIR: temp,
      TEST_UNDECLARED_OUTPUTS_DIR: artifacts,
      VRT_CAPTURE_OUTPUT: job.mode === 'capture' ? path.join(output, 'baselines') : '',
    },
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error)
  if (job.mode === 'test') {
    const junit = path.join(artifacts, 'junit.xml')
    if (process.env.XML_OUTPUT_FILE && fs.existsSync(junit))
      fs.copyFileSync(junit, process.env.XML_OUTPUT_FILE)
    fs.rmSync(temp, {recursive: true, force: true})
    process.exitCode = result.status ?? 1
    return
  }
  // Return a successful build action even when tests fail, so Bazel downloads
  // their reports and screenshots. The local test wrapper returns this status.
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
    schemaVersion: 1,
    mode: job.mode,
    exitCode: result.status ?? 1,
  }))
  fs.rmSync(temp, {recursive: true, force: true})
}
