import {pathToFileURL} from 'node:url'
import {serveDirectory} from './static-server.js'
import type {ServerAdapter, ServerContext} from './server-types.js'

const context: ServerContext = {
  root: process.cwd(),
  inputs: process.env.VRT_INPUTS!,
  cache: process.env.VRT_CACHE!,
  host: '127.0.0.1',
}
const server = process.env.VRT_SHELL
  ? await serveDirectory(process.env.VRT_SHELL, process.env.VRT_SHELL_ENTRY)
  : await (async () => {
      const {default: start} = (await import(
        pathToFileURL(process.env.VRT_CUSTOM_SERVER!).href
      )) as {default: ServerAdapter}
      return start(context)
    })()

try {
  const url = new URL(server.url)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== context.host ||
    !url.port ||
    url.username ||
    url.password
  )
    throw new Error(
      'Server adapter must return an HTTP URL on 127.0.0.1 with an explicit port'
    )
  process.send?.({url: url.href})
} catch (error) {
  await server.close()
  throw error
}
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    if (stopping) return
    stopping = true
    void Promise.resolve(server.close()).then(() => process.exit())
  })
