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
      mode: process.env.VRT_RESULT_MODE === 'test' ? 'test' : 'compare',
      artifacts: process.env.TEST_UNDECLARED_OUTPUTS_DIR,
      ...(process.env.VRT_APPLY_BASELINES === '1' ? {
        update: {
          workspace: required('BUILD_WORKSPACE_DIRECTORY'),
          baselineRelative: required('VRT_BASELINE_RELATIVE'),
        },
      } : {}),
    }
  )
  if (process.exitCode)
    console.error(`Browser test failed (exit ${process.exitCode}); reports: ${process.env.TEST_UNDECLARED_OUTPUTS_DIR || path.join(result, 'artifacts')}`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
