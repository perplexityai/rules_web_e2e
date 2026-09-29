import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import path from 'node:path'
import type {ServerAdapter} from '@rules-web-e2e/vrt/server'

const start: ServerAdapter = async ({inputs, host}) => {
  const root = path.join(inputs, '_main/npm-fixture')
  const require = createRequire(path.join(root, '.store/app/node_modules/app/index.js'))
  // The server cannot become ready unless both staged Node lookups succeed.
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
