import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync, type SpawnSyncOptionsWithStringEncoding} from 'node:child_process'
import {fileURLToPath} from 'node:url'

export const repository = fileURLToPath(new URL('../', import.meta.url))
export const fixture = path.join(repository, 'e2e-tests/workspace')
export const bazel = process.env.ACTIOND_BAZEL || process.env.BAZEL || 'bazelisk'
export const text = (file: string) => fs.readFileSync(file, 'utf8')
export const json = (file: string) => JSON.parse(text(file))
export const nonempty = (file: string) => assert(fs.statSync(file).size > 0, `Empty artifact: ${file}`)

export function run(command: string[], options: Omit<SpawnSyncOptionsWithStringEncoding, 'encoding'> & {fail?: boolean} = {}) {
  const {fail = false, ...spawnOptions} = options
  const result = spawnSync(command[0], command.slice(1), {
    encoding: 'utf8', stdio: 'inherit', timeout: 600_000, killSignal: 'SIGKILL', ...spawnOptions,
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null, `${command.join(' ')} killed by ${result.signal}`)
  if (fail) assert.notEqual(result.status, 0, `Expected failure: ${command.join(' ')}`)
  else assert.equal(result.status, 0, `Command failed: ${command.join(' ')}\n${result.stderr || ''}`)
  return fail ? (result.stdout || '') + (result.stderr || '') : result.stdout || ''
}

export function files(directory: string): string[] {
  return fs.readdirSync(directory).flatMap(name => {
    const file = path.join(directory, name)
    return fs.statSync(file).isDirectory() ? files(file) : [file]
  })
}

export function copyConsumer(destination: string, source = fixture) {
  fs.cpSync(source, destination, {recursive: true, filter: file => {
    const name = path.basename(file)
    return !['node_modules', 'MODULE.bazel.lock', 'runtime.tar', '.web-e2e'].includes(name) &&
      !name.startsWith('bazel-') && !name.startsWith('__actiond')
  }})
  const module = path.join(destination, 'MODULE.bazel')
  const original = text(module)
  assert.equal(original.split('path = "../.."').length, 2, 'Expected one checkout override')
  fs.writeFileSync(module, original.replace('path = "../.."', `path = ${JSON.stringify(repository)}`))
}

export function consumerTest(test: (work: string, consumer: string, command: string[]) => void,
  artifacts = process.env.E2E_TEST_ARTIFACTS) {
  // Keep /tmp spelling short for the Chromium socket-path regression.
  const work = fs.mkdtempSync('/tmp/e2e-')
  const consumer = path.join(work, 'consumer')
  const command = [bazel, `--output_base=${work}/bazel`]
  try {
    copyConsumer(consumer)
    test(work, consumer, command)
  } finally {
    try {
      if (artifacts && fs.existsSync(`${consumer}/bazel-testlogs`))
        fs.cpSync(`${consumer}/bazel-testlogs`, artifacts, {recursive: true, dereference: true})
    } finally {
      spawnSync(command[0], [...command.slice(1), 'shutdown'], {cwd: consumer, timeout: 60_000, killSignal: 'SIGKILL'})
      // Bazel creates read-only output directories. Do not follow runfile symlinks.
      const writable = (directory: string) => {
        fs.chmodSync(directory, fs.statSync(directory).mode | 0o700)
        for (const name of fs.readdirSync(directory)) {
          const child = path.join(directory, name)
          if (fs.lstatSync(child).isDirectory()) writable(child)
        }
      }
      writable(work)
      fs.rmSync(work, {recursive: true, force: true})
    }
  }
}

export function outputFiles(directory: string): {name: string, read: () => Buffer}[] {
  const archive = path.join(directory, 'outputs.zip')
  if (!fs.existsSync(archive)) return files(directory).map(name => ({name, read: () => fs.readFileSync(name)}))
  return run(['unzip', '-Z1', archive], {stdio: 'pipe'}).trim().split('\n')
    .filter(name => !name.endsWith('/')).map(name => ({name, read: () => {
      const result = spawnSync('unzip', ['-p', archive, name], {maxBuffer: 32 * 1024 * 1024})
      assert.ifError(result.error)
      assert.equal(result.status, 0)
      return result.stdout
    }}))
}
