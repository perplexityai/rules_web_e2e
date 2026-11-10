import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import {undeclaredInput} from './declared-inputs.js'

// A host execroot holding two packages, but runfiles that declare only one:
// another action materialized the undeclared package.
function fixture(root: string) {
  const bin = path.join(root, 'execroot', '_main', 'bazel-out', 'k8-fastbuild', 'bin')
  const runfiles = path.join(bin, 'suite', 'test.runfiles')
  const write = (file: string, content = '') => {
    fs.mkdirSync(path.dirname(file), {recursive: true})
    fs.writeFileSync(file, content)
  }
  const store = (name: string) => path.join(bin, 'node_modules', '.aspect_rules_js', `${name}@1.0.0`, 'node_modules', name)
  for (const name of ['declared', 'undeclared']) {
    write(path.join(store(name), 'package.json'), JSON.stringify({name, type: 'module', exports: './index.js'}))
    write(path.join(store(name), 'index.js'), `export default '${name}'`)
    fs.symlinkSync(`.aspect_rules_js/${name}@1.0.0/node_modules/${name}`, path.join(bin, 'node_modules', name))
  }
  for (const file of ['package.json', 'index.js'])
    write(path.join(runfiles, '_main', 'node_modules', '.aspect_rules_js', 'declared@1.0.0', 'node_modules', 'declared', file))
  write(path.join(bin, 'suite', 'package.json'), '{"type":"module"}')
  write(path.join(runfiles, '_main', 'suite', 'package.json'))
  const spec = (name: string) => {
    const file = path.join(bin, 'suite', `${name}.spec.js`)
    write(file, `import value from '${name}'\nconsole.log(value)\n`)
    write(path.join(runfiles, '_main', 'suite', `${name}.spec.js`))
    return file
  }
  return {bin, runfiles, store, spec}
}

function withFixture(check: (paths: ReturnType<typeof fixture>) => void) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'declared-inputs-')))
  try {
    check(fixture(root))
  } finally {
    fs.rmSync(root, {recursive: true, force: true})
  }
}

test('maps resolved build outputs to their runfiles', () => {
  withFixture(({bin, runfiles, store}) => {
    assert.equal(undeclaredInput(path.join(store('declared'), 'index.js'), runfiles, '_main'), undefined)
    assert.equal(
      undeclaredInput(path.join(store('undeclared'), 'index.js'), runfiles, '_main'),
      path.join(runfiles, '_main', 'node_modules', '.aspect_rules_js', 'undeclared@1.0.0', 'node_modules', 'undeclared', 'index.js')
    )
    assert.equal(
      undeclaredInput(path.join(bin, 'external', 'repo+', 'lib', 'a.js'), runfiles, '_main'),
      path.join(runfiles, 'repo+', 'lib', 'a.js')
    )
    assert.equal(undeclaredInput(path.join(runfiles, '_main', 'missing.js'), runfiles, '_main'), undefined)
    assert.equal(undeclaredInput('/usr/lib/node/a.js', runfiles, '_main'), undefined)
  })
})

test('rejects imports the test does not declare, whatever the execroot holds', () => {
  withFixture(({runfiles, spec}) => {
    const hook = fileURLToPath(new URL('./declared-inputs-hook.js', import.meta.url))
    const run = (file: string) => spawnSync(process.execPath, [`--import=${hook}`, file], {
      encoding: 'utf8',
      env: {...process.env, NODE_OPTIONS: '', VRT_INPUTS: runfiles, TEST_WORKSPACE: '_main'},
    })
    const declared = run(spec('declared'))
    assert.equal(declared.status, 0, declared.stderr)
    assert.equal(declared.stdout.trim(), 'declared')

    const undeclared = run(spec('undeclared'))
    assert.notEqual(undeclared.status, 0)
    assert.match(undeclared.stderr, /Cannot use 'undeclared' imported from .*undeclared\.spec\.js: .*does not declare it/)
  })
})
