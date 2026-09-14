// The initial Node is invoked through the caller's ELF loader. Relaunch with a
// relocated Node so /proc/self/exe and child processes resolve the executable.
import fs from 'node:fs'
import path from 'node:path'
import {bootstrapRuntime} from './relocation.js'
import {runRemoteJob, type RemoteJob} from './remote-job.js'

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as RemoteJob & {
  runtime: Parameters<typeof bootstrapRuntime>[0]
}
if (job.mode === 'test') {
  const runfiles = process.env.TEST_SRCDIR
  const output = process.env.TEST_UNDECLARED_OUTPUTS_DIR
  if (!runfiles || !output) throw new Error('Browser tests must run through bazel test')
  job.runfiles = Object.fromEntries(Object.entries(job.runfiles).map(([name, file]) => [name, path.join(runfiles, file)]))
  job.runner = path.join(runfiles, job.runner)
  job.runtime.path = path.join(runfiles, job.runtime.path)
  job.output = output
  job.args.push(...process.argv.slice(3))
}
const runtime = bootstrapRuntime(job.runtime, job.mode === 'test')
runRemoteJob(job, runtime.node, {LD_LIBRARY_PATH: runtime.libraryPath})
