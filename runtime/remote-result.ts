import fs from 'node:fs'
import path from 'node:path'
import {baselineDestination, validateBaselines, withBaselineUpdate} from './baselines.js'

export interface RemoteVrtResult {
  schemaVersion: 1
  mode: 'capture'
  exitCode: number
}

/** Consume downloaded action outputs without executing consumer code locally. */
export function consumeRemoteResult(
  directory: string,
  options: {
    update?: {workspace: string; baselineRelative: string; write: () => void}
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
    ) as {workspace: string; hashes: Record<string, string>}
    if (before.workspace !== '_main') throw new Error('Snapshot updates require a target in the invoking workspace')
    validateBaselines(path.join(directory, 'baselines'), true)
    validateBaselines(destination)
    withBaselineUpdate(destination, before.hashes, options.update.write)
  }
  return 0
}
