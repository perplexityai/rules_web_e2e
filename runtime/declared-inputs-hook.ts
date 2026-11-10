// Loaded with --import into Playwright processes so test and config modules
// can only resolve outputs the test declares.
import module from 'node:module'
import {fileURLToPath} from 'node:url'
import {undeclaredInput, undeclaredInputError} from './declared-inputs.js'

const inputs = process.env.VRT_INPUTS
const workspace = process.env.TEST_WORKSPACE
const hooks = (module as unknown as {registerHooks?: (hooks: object) => void}).registerHooks
if (inputs && workspace && hooks) {
  hooks({
    resolve(specifier: string, context: {parentURL?: string}, nextResolve: (specifier: string, context: object) => {url: string}) {
      const resolved = nextResolve(specifier, context)
      if (resolved.url.startsWith('file:')) {
        const file = fileURLToPath(resolved.url)
        const runfile = undeclaredInput(file, inputs, workspace)
        if (runfile) throw undeclaredInputError(specifier, context.parentURL, file, runfile)
      }
      return resolved
    },
  })
}
