import {spawn} from 'node:child_process'
import {once} from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

export default async function teardown() {
  const child = spawn(process.execPath, ['-e', `
    process.on('SIGTERM', () => {});
    setInterval(() => {}, 1000);
    process.send('ready');
  `], {stdio: ['ignore', 'inherit', 'inherit', 'ipc']})
  await once(child, 'message')
  fs.writeFileSync(path.join(process.env.VRT_OUTPUTS!, 'descendant.json'), JSON.stringify({
    pid: child.pid, scratch: process.env.TEST_TMPDIR,
  }))
  child.disconnect()
  child.unref()
  process.stdout.write('Co')
  await new Promise(resolve => setTimeout(resolve, 10))
  process.stdout.write('okie: private-lingering-cookie\nfinal useful output')
  process.stderr.write('Authorization: Bearer private-lingering-token\nfinal useful error')
}
