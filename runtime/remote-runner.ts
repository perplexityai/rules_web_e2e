import fs from 'node:fs'
import path from 'node:path'
import {browserRuntime, type BrowserRuntime} from './browser-runtime.js'
import {runRemoteJob, type RemoteJob} from './remote-job.js'

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as RemoteJob & {
  runtime: BrowserRuntime & {path: string}
}
if (job.mode === 'test') {
  const runfiles = process.env.TEST_SRCDIR
  const output = process.env.TEST_UNDECLARED_OUTPUTS_DIR
  if (!runfiles || !output) throw new Error('Browser tests must run through bazel test')
  job.runner = path.join(runfiles, job.runner)
  job.runtime.path = path.join(runfiles, job.runtime.path)
  job.output = output
  job.args.push(...process.argv.slice(3))
}
// The pinned worker supplies Bash and glibc but no /bin/sh. Reject ordinary
// host execution even when a caller overrides Bazel's spawn strategy.
if (process.env.VRT_HOST_EXECUTION !== '1' && (fs.existsSync('/bin/sh') || !fs.existsSync('/bin/bash')))
  throw new Error("VRT requires actiond's pinned glibc/Bash runtime; select remote execution")
const runtime = browserRuntime(path.dirname(job.runtime.path), {
  ...job.runtime, root: path.basename(job.runtime.path),
}, process.env.VRT_HOST_EXECUTION === '1')
runRemoteJob(job, runtime.node, runtime.env)
