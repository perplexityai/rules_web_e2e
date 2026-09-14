// Loaded only in VRT subprocesses. Playwright requests shell:true for webServer;
// Node otherwise hardcodes /bin/sh even when a declared Bash is on PATH.
const childProcess = require('node:child_process')
const {syncBuiltinESMExports} = require('node:module')
const spawn = childProcess.spawn
childProcess.spawn = function (command, args, options) {
  if (!Array.isArray(args)) {
    options = options ?? args
    args = []
  }
  if (options?.shell === true) {
    if (!process.env.VRT_BASH) throw new Error('VRT subprocess shell is not configured')
    options = {...options, shell: process.env.VRT_BASH}
  }
  return spawn.call(this, command, args, options)
}
syncBuiltinESMExports()
