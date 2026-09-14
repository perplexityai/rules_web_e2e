import path from 'node:path'
import {consumeRemoteResult} from './remote-result.js'

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

try {
  if (process.argv.length > 2)
    throw new Error('Remote VRT selection is declared by the Bazel target; use separate targets for subsets')
  const runfiles = process.env.RUNFILES_DIR || required('JS_BINARY__RUNFILES')
  process.exitCode = consumeRemoteResult(
    path.join(runfiles, required('VRT_RESULT')),
    {
      artifacts: process.env.TEST_UNDECLARED_OUTPUTS_DIR,
      ...(process.env.VRT_APPLY_BASELINES === '1' ? {
        update: {
          workspace: required('BUILD_WORKSPACE_DIRECTORY'),
          baselineRelative: required('VRT_BASELINE_RELATIVE'),
        },
      } : {}),
    }
  )
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
