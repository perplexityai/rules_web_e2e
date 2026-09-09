import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type * as Vite from 'vite'
import type {ServerAdapter} from './server-types.js'

const start: ServerAdapter = async ({inputs, cache, host}) => {
  const vite = (await import(
    pathToFileURL(path.join(process.env.VRT_VITE!, 'dist/node/index.js')).href
  )) as typeof Vite
  const server = await vite.createServer({
    configFile: process.env.VRT_SERVER_CONFIG!,
    envDir: false,
    cacheDir: cache,
    css: {postcss: {}},
    server: {host, port: 0, open: false, fs: {strict: true, allow: [inputs]}},
  })
  try {
    await server.listen()
    return {url: server.resolvedUrls!.local[0], close: () => server.close()}
  } catch (error) {
    await server.close()
    throw error
  }
}
export default start
