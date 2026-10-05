import path from 'node:path'
import {consumeRemoteResult} from './remote-result.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

try {
  if (process.argv.length > 2)
    throw new Error('Remote browser selection is declared by the Bazel target; use separate targets for subsets')
  const runfiles = process.env.RUNFILES_DIR || required('JS_BINARY__RUNFILES')
  const result = path.join(runfiles, required('VRT_RESULT'))
  process.exitCode = consumeRemoteResult(
    result,
    {
      update: {
        workspace: required('BUILD_WORKSPACE_DIRECTORY'),
        baselineRelative: required('VRT_BASELINE_RELATIVE'),
      },
    }
  )
  if (process.exitCode)
    console.error(`Browser capture failed (exit ${process.exitCode}); reports: ${path.join(result, 'artifacts')}`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
