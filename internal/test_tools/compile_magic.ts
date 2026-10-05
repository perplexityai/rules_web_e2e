import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {main} from '../../tools/files.js'

main(import.meta.url, () => {
  const [compiler, output, ...sources] = process.argv.slice(2).map(p => path.resolve(p))
  const work = fs.mkdtempSync(path.join(path.dirname(output), 'magic-'))
  try {
    fs.writeFileSync(path.join(work, 'magic'), Buffer.concat(sources.map(p => fs.readFileSync(p))))
    execFileSync(compiler, ['-C', '-m', 'magic'], {cwd: work, stdio: 'pipe'})
    fs.renameSync(path.join(work, 'magic.mgc'), output)
  } finally { fs.rmSync(work, {recursive: true, force: true}) }
})
