import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

export interface RemoteJob {
  runfiles: Record<string, string>
  runner: string
  env: Record<string, string>
  args: string[]
  output: string
  mode: 'capture' | 'compare' | 'test'
}

/** Preserve child failure reports as build outputs for the local result consumer. */
export function runRemoteJob(job: RemoteJob, node: string, environment: NodeJS.ProcessEnv = {}) {
  const output = path.resolve(job.output)
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vrt-action-'))
  const artifacts = path.join(output, 'artifacts')
  fs.mkdirSync(artifacts, {recursive: true})
  const escape = (value: string) => value.replaceAll('\\', '\\b').replaceAll(' ', '\\s').replaceAll('\n', '\\n')
  const manifest = path.join(temp, 'MANIFEST')
  fs.writeFileSync(manifest, Object.entries(job.runfiles).map(([name, source]) =>
    ` ${escape(name)} ${escape(path.resolve(source))}\n`
  ).join(''))
  const result = spawnSync(node, [
    path.resolve(job.runner), ...job.args, ...(job.mode === 'capture' ? ['--update'] : []),
  ], {
    env: {
      ...process.env,
      ...job.env,
      ...environment,
      RUNFILES_DIR: temp,
      RUNFILES_MANIFEST_FILE: manifest,
      JS_BINARY__NODE_BINARY: node,
      TEST_TMPDIR: temp,
      TEST_UNDECLARED_OUTPUTS_DIR: artifacts,
      VRT_CAPTURE_OUTPUT: job.mode === 'capture' ? path.join(output, 'baselines') : '',
    },
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error)
  // Return a successful build action even when tests fail, so Bazel downloads
  // their reports and screenshots. The local test wrapper returns this status.
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
    schemaVersion: 1,
    mode: job.mode,
    exitCode: result.status ?? 1,
  }))
  fs.rmSync(temp, {recursive: true, force: true})
}
