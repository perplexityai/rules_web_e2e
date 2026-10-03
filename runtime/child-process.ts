import type {ChildProcess} from 'node:child_process'

/** Drain output after exit, but do not let descendants keep the runner alive. */
export function manageChild(child: ChildProcess) {
  let stopping = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const signal = (name: NodeJS.Signals) => {
    if (child.pid) {
      try {
        process.kill(-child.pid, name)
      } catch {}
    }
  }
  const stop = () => {
    if (stopping) return
    stopping = true
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
      resolve(code)
    })
  })
  // Fixture-server startup errors are also handled by the caller.
  void closed.catch(() => {})
  return {closed, stop}
}
