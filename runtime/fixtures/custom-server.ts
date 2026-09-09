import {createServer} from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type {ServerAdapter} from '../server-types.js'

const start: ServerAdapter = async ({root, host}) => {
  const server = createServer((_, response) => response.end('custom fixture'))
  await new Promise<void>(resolve => server.listen(0, host, resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing port')
  return {
    url:
      process.env.INVALID_SERVER_URL ||
      `http://${host}:${address.port}/fixture/`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close(error => {
          fs.writeFileSync(path.join(root, 'closed'), 'yes')
          if (error) reject(error)
          else resolve()
        })
      ),
  }
}
export default start
