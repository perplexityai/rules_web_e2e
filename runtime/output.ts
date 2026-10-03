import {createInterface} from 'node:readline'
import type {Readable, Writable} from 'node:stream'

// Buffer complete lines so credentials split across chunks never reach Bazel logs.
export function forwardOutput(source: Readable, destination: Writable): void {
  const lines = createInterface({input: source, crlfDelay: Infinity})
  lines.on('line', line => {
    const plain = line.replace(/\x1b\[[0-9;]*m/g, '')
    if (/(?:cookie|authorization)["']?\s*:|(?:__Secure-next-auth\.session-token|CF_Authorization)=/i.test(plain)) {
      destination.write('[redacted sensitive HTTP header]\n')
      return
    }
    destination.write(line + '\n')
  })
}
