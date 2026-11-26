import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import {lookup} from 'mrmime'
import path from 'node:path'
import {createServer} from 'node:http'
import type {RunningServer} from './server-types.js'

export interface ServeDirectoryOptions {
  /** Serve the entry point for extensionless HTML navigations that match no file. */
  spa?: boolean
}

/** Serve only a built asset directory; never resolve source imports or compile code. */
export async function serveDirectory(
  directory: string,
  entryPoint = 'index.html',
  host = false,
  {spa = false}: ServeDirectoryOptions = {}
): Promise<RunningServer> {
  const root = await fs.realpath(directory)
  const resolve = async (relative: string) => {
    const requested = path.resolve(root, relative)
    if (!requested.startsWith(root + path.sep)) throw new Error('Path escapes asset directory')
    const file = await fs.realpath(requested)
    if (!host && !file.startsWith(root + path.sep)) throw new Error('Path escapes asset directory')
    return file
  }
  const entry = await resolve(entryPoint).catch(() => {
    throw new Error('Shell entry point must be a file within the asset directory')
  })
  if (!(await fs.stat(entry)).isFile())
    throw new Error(
      'Shell entry point must be a file within the asset directory'
    )
  const server = createServer((request, response) => {
    void (async () => {
      if (!['GET', 'HEAD'].includes(request.method || '')) {
        response.writeHead(405).end()
        return
      }
      try {
        const pathname = decodeURIComponent(
          new URL(request.url!, 'http://localhost').pathname
        )
        const relative = pathname === '/' ? entryPoint : pathname.slice(1)
        if (relative.includes('\0') || relative.includes('\\'))
          throw new Error('Invalid path')
        // Client-side routes have no file; missing assets and data requests still 404.
        const navigation = spa && !path.posix.extname(pathname) &&
          (request.headers.accept ?? '').includes('text/html')
        const found = await resolve(relative).then(
          async file => ((await fs.stat(file)).isFile() ? file : undefined),
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return undefined
            throw error
          }
        )
        const file = found ?? (navigation ? entry : undefined)
        if (!file) throw new Error('Not found')
        const type = lookup(file) || 'application/octet-stream'
        response.writeHead(200, {
          'content-type': type.startsWith('text/') ? `${type}; charset=utf-8` : type,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        if (request.method === 'HEAD') response.end()
        else await pipeline(createReadStream(file), response)
      } catch {
        if (response.headersSent) response.destroy()
        else response.writeHead(404).end('Not found')
      }
    })().catch(() => response.destroy())
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing server port')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close(error => (error ? reject(error) : resolve()))
      }),
  }
}
