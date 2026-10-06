import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

export interface RemoteJob {
  runner: string
  env: Record<string, string>
  args: string[]
  output: string
  mode: 'capture' | 'test'
}

/** Preserve child failure reports as build outputs for the local result consumer. */
export function runRemoteJob(job: RemoteJob, node: string, environment: NodeJS.ProcessEnv = {}) {
  if (job.mode !== 'capture') throw new Error('Only capture actions need a result wrapper')
  const timeoutMs = Number(job.env.VRT_TIMEOUT_MS)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Remote VRT job requires a positive VRT_TIMEOUT_MS')
  const runfiles = environment.RUNFILES_DIR || process.env.TEST_SRCDIR || process.env.RUNFILES_DIR
  if (!runfiles) throw new Error('Browser execution requires Bazel runfiles')
  const output = path.resolve(job.output)
  const artifacts = path.join(output, 'artifacts')
  fs.mkdirSync(artifacts, {recursive: true})
  const result = spawnSync(node, [
    path.resolve(job.runner), ...job.args, '--update',
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
      TEST_UNDECLARED_OUTPUTS_DIR: artifacts,
      VRT_CAPTURE_OUTPUT: path.join(artifacts, 'reference'),
    },
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error)
  // Return a successful build action even when tests fail, so Bazel downloads
  // their reports and screenshots. The update command checks this status before changing baselines.
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
    schemaVersion: 1,
    mode: job.mode,
    exitCode: result.status ?? 1,
  }))
}
