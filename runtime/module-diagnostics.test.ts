import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {test} from 'node:test'
import {describeMissingModules, MissingModules} from './module-diagnostics.js'

// A package link whose store tree exists but is empty, beside populated runfiles:
// the execroot state seen when Bazel-built tests fail with "Cannot find package".
function fixture(root: string) {
  const bin = path.join(root, 'execroot', '_main', 'bazel-out', 'k8-fastbuild', 'bin')
  const store = path.join(bin, 'node_modules', '.aspect_rules_js', '@scope+pkg@1.0.0', 'node_modules', '@scope', 'pkg')
  fs.mkdirSync(store, {recursive: true})
  fs.mkdirSync(path.join(bin, 'node_modules', '@scope'))
  fs.symlinkSync('../.aspect_rules_js/@scope+pkg@1.0.0/node_modules/@scope/pkg', path.join(bin, 'node_modules', '@scope', 'pkg'))
  fs.mkdirSync(path.join(bin, 'tests'))
  const spec = path.join(bin, 'tests', 'a.spec.js')
  fs.writeFileSync(spec, '')

  const runfiles = path.join(root, 'runfiles', '_main')
  const staged = path.join(runfiles, 'node_modules', '@scope', 'pkg')
  fs.mkdirSync(staged, {recursive: true})
  fs.writeFileSync(path.join(staged, 'package.json'), '{}')
  fs.symlinkSync(path.join(store, 'index.js'), path.join(staged, 'index.js'))
  return {link: path.join(bin, 'node_modules', '@scope', 'pkg'), spec, runfiles}
}

function withFixture(check: (paths: ReturnType<typeof fixture>) => void) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'module-diagnostics-')))
  try {
    check(fixture(root))
  } finally {
    fs.rmSync(root, {recursive: true, force: true})
  }
}

test('reports an empty linked store tree beside its runfiles counterpart', () => {
  withFixture(({link, spec, runfiles}) => {
    const missing = new MissingModules()
    missing.observe(`\x1b[31mError: Cannot find package '${link}/index.js' imported from ${spec}\x1b[39m`)
    const [resolved, staged] = describeMissingModules(missing.roots, runfiles).split(/\n(?=runfiles )/)
    assert.match(resolved, /resolved .*node_modules\/@scope\/pkg: symlink -> \.\.\/\.aspect_rules_js\/@scope\+pkg@1\.0\.0/)
    assert.match(resolved, /entries \(0\)/)
    assert.match(resolved, /package\.json: ENOENT/)
    assert.match(staged, /^runfiles .*runfiles\/_main\/node_modules\/@scope\/pkg: directory/)
    assert.match(staged, /entries \(2\): index\.js, package\.json/)
    assert.match(staged, /package\.json: file \(2 bytes\)/)
  })
})

test('locates bare specifiers from ESM and CommonJS errors', () => {
  withFixture(({link, spec}) => {
    const esm = new MissingModules()
    esm.observe(`Error: Cannot find package '@scope/pkg' imported from ${spec}`)
    assert.deepEqual([...esm.roots], [link])

    const cjs = new MissingModules()
    for (const line of [`Error: Cannot find module '@scope/pkg/lib'`, 'Require stack:', `- ${spec}`, '- /elsewhere/cli.js'])
      cjs.observe(line)
    assert.deepEqual([...cjs.roots], [link])

    const relative = new MissingModules()
    for (const line of [`Error: Cannot find module './local'`, 'Require stack:', `- ${spec}`])
      relative.observe(line)
    assert.deepEqual([...relative.roots], [])
  })
})
