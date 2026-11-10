import fs from 'node:fs'
import path from 'node:path'

const BIN = /\/bazel-out\/[^/]+\/bin\//

/**
 * Node resolves modules through realpaths. Runfiles point into the host
 * execroot, so a realpath can reach outputs another action left there even when
 * this test never declared them. Map a resolved build output back to its
 * runfiles location; return that location when the test does not declare it.
 */
export function undeclaredInput(file: string, inputs: string, workspace: string): string | undefined {
  if (file === inputs || file.startsWith(inputs + path.sep)) return undefined
  const match = BIN.exec(file)
  if (!match) return undefined
  const relative = file.slice(match.index + match[0].length)
  const [first, repository, ...rest] = relative.split('/')
  const runfile = first === 'external' && repository
    ? path.join(inputs, repository, ...rest)
    : path.join(inputs, workspace, relative)
  return fs.existsSync(runfile) ? undefined : runfile
}

export function undeclaredInputError(specifier: string, parent: string | undefined, file: string, runfile: string) {
  const error = new Error(
    `Cannot use '${specifier}'${parent ? ` imported from ${parent}` : ''}: it resolved to ${file}, ` +
    `but this test does not declare it (expected ${runfile}). ` +
    'Add the package or file to the test deps or data; undeclared outputs pass or fail depending on ' +
    'what other actions left in the execroot.'
  ) as NodeJS.ErrnoException
  error.code = 'ERR_MODULE_NOT_FOUND'
  return error
}
