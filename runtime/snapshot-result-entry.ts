import fs from 'node:fs'
import {consumeRemoteResult} from './remote-result.js'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {baselineDestination, withBaselineUpdate} from './baselines.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

try {
  if (process.argv.length > 2)
    throw new Error('Snapshot selection is a build input; use --@rules_web_e2e//:snapshot_filter or target args')
  const runfiles = process.env.RUNFILES_DIR || required('JS_BINARY__RUNFILES')
  const result = path.join(runfiles, required('VRT_RESULT'))
  const workspace = fs.realpathSync(required('BUILD_WORKSPACE_DIRECTORY'))
  const write = () => {
    const writer = spawnSync(path.join(runfiles, required('VRT_SNAPSHOT_WRITER')), [], {
      cwd: path.join(runfiles, '_main'), stdio: 'inherit',
      env: {...process.env, BUILD_WORKSPACE_DIRECTORY: workspace},
    })
    if (writer.error) throw writer.error
    if (writer.status !== 0) throw new Error(`Snapshot writer failed: ${writer.status}`)
  }
  if (process.env.VRT_BASELINE_RELATIVE) {
    process.exitCode = consumeRemoteResult(result, {update: {
      workspace, baselineRelative: process.env.VRT_BASELINE_RELATIVE, write,
    }})
    if (process.exitCode) console.error(`Browser capture failed; reports: ${path.join(result, 'artifacts')}`)
  } else {
    const before = JSON.parse(fs.readFileSync(path.join(result, 'baseline-before.json'), 'utf8')) as {workspace: string; hashes: Record<string, string>}
    if (before.workspace !== '_main') throw new Error('Snapshot updates require a target in the invoking workspace')
    withBaselineUpdate(baselineDestination(workspace, required('VRT_SNAPSHOT_RELATIVE')), before.hashes, write, true)
  }
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
