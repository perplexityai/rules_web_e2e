import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import path from 'node:path'
import type {ServerAdapter} from '@rules-web-e2e/vrt/server'

const start: ServerAdapter = async ({inputs, host}) => {
  const tool = path.join(inputs, '_main/package-tool.sh')
  assert.equal(fs.readFileSync(tool, 'utf8').split('\n')[0], '#!/bin/bash')
  assert.equal(execFileSync(tool, {encoding: 'utf8'}), 'caller executable reached')
  const root = path.join(inputs, '_main/npm-fixture')
  const entry = fs.realpathSync(path.join(root, '.store/app/node_modules/app/index.js'))
  const require = createRequire(entry)
  // Packaging is observable: retain the caller's link and module identity.
  assert.equal(fs.readlinkSync(path.join(path.dirname(entry), 'linked.js')), 'index.js')
  assert.equal(fs.readlinkSync(path.join(path.dirname(entry), '../middle')),
    '../../middle/node_modules/middle')
  assert.equal(fs.lstatSync(path.join(root, 'optional-platform')).isSymbolicLink(), true)
  assert.equal(fs.existsSync(path.join(root, 'optional-platform')), false)
  if (process.env.REQUIRE_MISSING_PACKAGE === '1') require('required-but-undeclared-package')
  const text = require('./index.js') + ' / ' + require(path.join(root, 'alias.cjs'))
  const server = createServer((_, response) => {
    response.setHeader('content-type', 'text/html')
    response.end('<h1>' + text + '</h1>')
  })
  await new Promise<void>(resolve => server.listen(0, host, resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing server address')
  return {url: `http://${host}:${address.port}`, close: () => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()))}
}
export default start
