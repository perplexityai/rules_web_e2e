// Fault injection only: freeze the actual runner after its browser wrote evidence.
// The runner's own setTimeout/finally can no longer fire; its parent must reap it.
import fs from 'node:fs'
import path from 'node:path'
const output = process.env.TEST_UNDECLARED_OUTPUTS_DIR!
// Do not preload the fault into the server or Playwright descendants.
delete process.env.NODE_OPTIONS
setInterval(() => {
  if (!fs.existsSync(path.join(output, 'deadline-ready.png'))) return
  fs.writeFileSync(path.join(output, 'runner-stalled'), 'event loop blocked\n')
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}, 20)
