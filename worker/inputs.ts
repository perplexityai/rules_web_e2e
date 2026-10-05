import fs from 'node:fs'
import {runfiles} from '@bazel/runfiles'

export function workerInputs(workerRunfile: string, manifestRunfile: string, sourceRepository: string) {
  return {
    worker: fs.realpathSync(runfiles.resolve(workerRunfile, sourceRepository)),
    manifest: JSON.parse(fs.readFileSync(runfiles.resolve(manifestRunfile, sourceRepository), 'utf8')),
  }
}
