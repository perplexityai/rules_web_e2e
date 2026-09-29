// Materialize the checked-in consumer without generating test or BUILD source.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const work = path.resolve(process.argv[2])
const repository = fileURLToPath(new URL('../../', import.meta.url))
const source = fileURLToPath(new URL('./workspace/', import.meta.url))
const destination = path.join(work, 'public')
const arch = process.env.ACTIOND_ARCH || 'x64'
if (!['x64', 'arm64'].includes(arch)) throw new Error('ACTIOND_ARCH must be x64 or arm64')
fs.mkdirSync(destination, {recursive: true})
for (const name of fs.readdirSync(source)) {
  if (name === 'node_modules' || name === 'MODULE.bazel.lock' || name === 'runtime.tar' ||
      name.startsWith('bazel-') || name.startsWith('__actiond') || name === '.web-e2e') continue
  fs.cpSync(path.join(source, name), path.join(destination, name), {recursive: true})
}
const module = path.join(destination, 'MODULE.bazel')
fs.writeFileSync(module, fs.readFileSync(module, 'utf8')
  .replace('path = "../../.."', `path = ${JSON.stringify(repository)}`))
const build = path.join(destination, 'BUILD.bazel')
fs.writeFileSync(build, fs.readFileSync(build, 'utf8')
  .replace('_TARGET_ARCH = "x64"', `_TARGET_ARCH = ${JSON.stringify(arch)}`))
fs.copyFileSync(path.join(work, 'runtime.tar'), path.join(destination, 'runtime.tar'))
