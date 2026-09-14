import fs from 'node:fs'
import path from 'node:path'
import {baselineDestination, updateBaselines} from './baselines.js'

export interface RemoteVrtResult {
  schemaVersion: 1
  mode: 'compare' | 'capture' | 'test'
  exitCode: number
}

function copyArtifacts(source: string, destination: string) {
  const stat = fs.lstatSync(source)
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, {recursive: true})
    for (const name of fs.readdirSync(source))
      copyArtifacts(path.join(source, name), path.join(destination, name))
  } else if (stat.isFile()) {
    fs.copyFileSync(source, destination)
  } else {
    throw new Error('Remote VRT artifacts must contain only regular files and directories')
  }
}

/** Consume downloaded action outputs without executing consumer code locally. */
export function consumeRemoteResult(
  directory: string,
  options: {
    mode?: 'compare' | 'test'
    artifacts?: string
    update?: {workspace: string; baselineRelative: string}
  } = {}
) {
  const result = JSON.parse(
    fs.readFileSync(path.join(directory, 'result.json'), 'utf8')
  ) as RemoteVrtResult
  if (
    result.schemaVersion !== 1 ||
    result.mode !== (options.update ? 'capture' : options.mode ?? 'compare') ||
    !Number.isInteger(result.exitCode) ||
    result.exitCode < 0 || result.exitCode > 255
  ) throw new Error('Invalid remote VRT result')

  if (options.artifacts)
    copyArtifacts(path.join(directory, 'artifacts'), options.artifacts)
  if (result.exitCode !== 0) return result.exitCode
  if (options.update) {
    const destination = baselineDestination(
      options.update.workspace, options.update.baselineRelative
    )
    updateBaselines(path.join(directory, 'baselines'), destination)
  }
  return 0
}
