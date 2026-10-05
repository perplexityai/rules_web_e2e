import {parseArgs} from 'node:util'
import {workerInputs} from './inputs.js'
import {main as runMain} from '../tools/files.js'
import {preflight, supervise} from './supervisor.js'

export async function cli(argv = process.argv.slice(2)) {
  // Options following the operation belong to the child command.
  const operations = ['doctor', 'build', 'test', 'run', 'exec']
  const options = Object.fromEntries(
    ['source-repository', 'worker-runfile', 'manifest-runfile', 'bazel', 'port', 'log-dir', 'startup-timeout', 'memory-mib', 'cas-image-size-mib']
      .map(name => [name, {type: 'string' as const}]))
  const operationToken = parseArgs({args: argv, options, tokens: true, strict: false, allowPositionals: true})
    .tokens.find(token => token.kind === 'positional')
  const help = argv.findIndex(arg => arg === '--help' || arg === '-h')
  if (help >= 0 && (!operationToken || help < operationToken.index)) {
    console.log('Usage: runner [--bazel PATH] [--port PORT] [--log-dir DIR] [--startup-timeout SECONDS] [--memory-mib MIB] [--cas-image-size-mib MIB] doctor|build|test|run|exec [arguments...]')
    return 0
  }
  if (!operationToken || !operations.includes(operationToken.value)) throw new Error('Supply doctor, build, test, run, or exec')
  const index = operationToken.index
  const {values} = parseArgs({args: argv.slice(0, index), options})
  const {worker, manifest} = workerInputs(values['worker-runfile']!, values['manifest-runfile']!, values['source-repository']!)
  if (process.env.BUILD_WORKSPACE_DIRECTORY) process.chdir(process.env.BUILD_WORKSPACE_DIRECTORY)
  preflight(worker, manifest.sha256)
  const operation = argv[index]
  if (operation === 'doctor') {
    console.log(`Linux amd64 devices and actiond ${manifest.version} checksum verified; run a browser test to validate VM startup`)
    return 0
  }
  const port = Number(values.port || 8980), timeout = Number(values['startup-timeout'] || 90)
  const memory = Number(values['memory-mib'] || 6144), cas = Number(values['cas-image-size-mib'] || 4096)
  if (!Number.isInteger(port) || port < 1 || port > 65535 || ![timeout, memory, cas].every(n => Number.isFinite(n) && n > 0))
    throw new Error('port must be 1..65535, startup timeout, guest memory, and CAS image size must be positive')
  const args = argv.slice(index + 1)
  if (args[0] === '--') args.shift()
  if (!args.length) throw new Error('Supply explicit targets or an exec command')
  return supervise(worker, config => operation === 'exec' ? args :
    [values.bazel || 'bazel', '--noblock_for_lock', `--bazelrc=${config}`, operation, '--config=web-e2e', ...args],
  values['log-dir'] || '.web-e2e/logs', port, timeout, memory, cas)
}
runMain(import.meta.url, async () => { process.exitCode = await cli() })
