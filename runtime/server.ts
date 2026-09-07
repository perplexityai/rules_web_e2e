import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type * as Vite from 'vite'

const vite = (await import(
  pathToFileURL(path.join(process.env.VRT_VITE!, 'dist/node/index.js')).href
)) as typeof Vite
const server = await vite.createServer({
  configFile: process.env.VRT_SERVER_CONFIG!,
  envDir: false,
  cacheDir: process.env.VRT_CACHE!,
  css: {postcss: {}},
  server: {
    host: '127.0.0.1',
    port: 0,
    open: false,
    fs: {strict: true, allow: [process.env.VRT_INPUTS!]},
  },
})
await server.listen()
process.send?.({url: server.resolvedUrls!.local[0]})
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit())
  })
