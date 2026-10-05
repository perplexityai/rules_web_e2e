import fs from 'node:fs'
import path from 'node:path'
import {applyBaselineUpdate, baselineDestination} from './baselines.js'

export interface RemoteVrtResult {
  schemaVersion: 1
  mode: 'capture'
  exitCode: number
}

/** Consume downloaded action outputs without executing consumer code locally. */
export function consumeRemoteResult(
  directory: string,
  options: {
    update?: {workspace: string; baselineRelative: string}
  } = {}
) {
  const result = JSON.parse(
    fs.readFileSync(path.join(directory, 'result.json'), 'utf8')
  ) as RemoteVrtResult
  if (
    result.schemaVersion !== 1 ||
    result.mode !== 'capture' ||
    !Number.isInteger(result.exitCode) ||
    result.exitCode < 0 || result.exitCode > 255
  ) throw new Error('Invalid remote VRT result')

  if (result.exitCode !== 0) return result.exitCode
  if (options.update) {
    const destination = baselineDestination(
      options.update.workspace, options.update.baselineRelative
    )
    const before = JSON.parse(
      fs.readFileSync(path.join(directory, 'baseline-before.json'), 'utf8')
    ) as Record<string, string>
    applyBaselineUpdate(path.join(directory, 'baselines'), destination, before)
  }
  return 0
}
