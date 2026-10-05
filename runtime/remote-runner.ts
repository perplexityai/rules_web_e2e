import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {runRemoteJob, type RemoteJob} from './remote-job.js'

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as RemoteJob
const runfiles = job.mode === 'test' ? process.env.TEST_SRCDIR : process.env.RUNFILES_DIR
if (!runfiles) throw new Error('Browser execution requires Bazel runfiles')
job.runner = path.join(runfiles, job.runner)
if (job.mode === 'test') {
  const output = process.env.TEST_UNDECLARED_OUTPUTS_DIR
  if (!output) throw new Error('Browser tests must run through bazel test')
  job.output = output
  job.args.push(...process.argv.slice(3))
} else {
  if (!process.argv[3]) throw new Error('Browser capture requires a declared output directory')
  job.output = path.resolve(process.argv[3])
}
// The pinned worker supplies Bash and glibc but no /bin/sh. Reject ordinary
// host execution even when a caller overrides Bazel's spawn strategy.
if (process.env.VRT_EXECUTION !== 'local' && process.env.VRT_HOST_EXECUTION !== '1' && (fs.existsSync('/bin/sh') || !fs.existsSync('/bin/bash')))
  throw new Error("VRT requires actiond's pinned glibc/Bash runtime; select remote execution")
if (job.mode === 'test') {
  // Already running under the declared Node. Keep Bazel's PID, scratch and signals.
  Object.assign(process.env, job.env, {
    RUNFILES_DIR: runfiles,
    JS_BINARY__NODE_BINARY: process.execPath,
  })
  process.argv = [process.execPath, job.runner, ...job.args]
  await import(pathToFileURL(job.runner).href)
} else {
  runRemoteJob(job, process.execPath, {RUNFILES_DIR: runfiles})
}
