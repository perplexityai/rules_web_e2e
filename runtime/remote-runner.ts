// The initial Node is invoked through the caller's ELF loader. Relaunch with a
// relocated Node so /proc/self/exe and child processes resolve the executable.
import fs from 'node:fs'
import {bootstrapRuntime} from './relocation.js'
import {runRemoteJob, type RemoteJob} from './remote-job.js'

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as RemoteJob & {
  runtime: Parameters<typeof bootstrapRuntime>[0]
}
const runtime = bootstrapRuntime(job.runtime)
runRemoteJob(job, runtime.node, {LD_LIBRARY_PATH: runtime.libraryPath})
