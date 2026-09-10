import fs from 'node:fs/promises'
import path from 'node:path'
import {createServer} from 'node:http'
import type {RunningServer} from './server-types.js'

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
}

/** Serve only a built asset directory; never resolve source imports or compile code. */
export async function serveDirectory(
  directory: string,
  entryPoint = 'index.html'
): Promise<RunningServer> {
  const root = await fs.realpath(directory)
  const inside = (file: string) => file.startsWith(root + path.sep)
  const entry = await fs.realpath(path.resolve(root, entryPoint))
  if (!inside(entry) || !(await fs.stat(entry)).isFile())
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
        const file = await fs.realpath(path.resolve(root, relative))
        if (!inside(file) || !(await fs.stat(file)).isFile())
          throw new Error('Not a file')
        response.writeHead(200, {
          'content-type':
            contentTypes[path.extname(file)] || 'application/octet-stream',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        response.end(
          request.method === 'HEAD' ? undefined : await fs.readFile(file)
        )
      } catch {
        response.writeHead(404).end('Not found')
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
