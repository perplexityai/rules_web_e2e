import {execFileSync, type ChildProcess} from 'node:child_process'

// Host-only process suites can launch Electron/browser children in new groups.
function processTable() {
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat='], {
    encoding: 'utf8', timeout: 1000, maxBuffer: 8 * 1024 * 1024,
  }).trim().split('\n').map(line => {
    const [pid, parent, group, state] = line.trim().split(/\s+/)
    return {pid: Number(pid), parent: Number(parent), group: Number(group), state}
  })
}

/** Drain output after exit, but do not let descendants keep the runner alive. */
export function manageChild(child: ChildProcess, descendants = false) {
  const groups = new Set<number>()
  if (child.pid) groups.add(child.pid)
  let cleanupError: unknown
  let stopping = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const signal = (name: NodeJS.Signals) => {
    for (const group of groups) {
      try {
        process.kill(-group, name)
      } catch {}
    }
  }
  const stop = () => {
    if (stopping) return
    stopping = true
    if (descendants && child.pid && child.exitCode === null && child.signalCode === null) {
      // Snapshot before signaling the leader: exiting parents reparent children.
      try {
        const rows = processTable()
        const owned = new Set([child.pid])
        for (let changed = true; changed;) {
          changed = false
          for (const row of rows) {
            if (owned.has(row.parent) && !owned.has(row.pid)) {
              owned.add(row.pid)
              changed = true
            }
          }
        }
        for (const row of rows)
          if (owned.has(row.pid) && owned.has(row.group)) groups.add(row.group)
      } catch (error) {
        cleanupError = error
      }
    }
    // The process group can outlive its leader.
    signal('SIGTERM')
    timer = setTimeout(() => {
      signal('SIGKILL')
      // Allow EOF to flush partial lines before abandoning escaped descendants.
      timer = setTimeout(() => {
        child.stdout?.destroy()
        child.stderr?.destroy()
      }, 1000)
    }, 3000)
  }
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('exit', stop)
    child.once('error', reject)
    child.once('close', code => {
      stopping = true
      clearTimeout(timer)
      signal('SIGKILL')
      if (!descendants) {
        resolve(code)
        return
      }
      // SIGKILL delivery is asynchronous; do not delete profiles still in use.
      const waitForExit = async () => {
        const deadline = Date.now() + 3000
        while (processTable().some(row => groups.has(row.group) && !row.state.startsWith('Z'))) {
          if (Date.now() >= deadline) throw new Error('Browser process groups did not exit after SIGKILL')
          await new Promise(done => setTimeout(done, 50))
        }
        if (cleanupError) throw cleanupError
        return code
      }
      void waitForExit().then(resolve, reject)
    })
  })
  // Fixture-server startup errors are also handled by the caller.
  void closed.catch(() => {})
  return {closed, stop}
}
