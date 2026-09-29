// actiond 0.0.7 supplies /bin/bash, but not /bin/sh. Adapt Node's implicit
// shell choice for Playwright webServer without rewriting caller executables.
import childProcess from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'

const spawn = childProcess.spawn
childProcess.spawn = ((command: string, args: string[] | childProcess.SpawnOptions,
  options?: childProcess.SpawnOptions) => {
  if (!Array.isArray(args)) {
    options = options ?? args
    args = []
  }
  if (options?.shell === true) options = {...options, shell: '/bin/bash'}
  return spawn(command, args, options ?? {})
}) as typeof spawn
syncBuiltinESMExports()
