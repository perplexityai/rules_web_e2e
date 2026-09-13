// Test-only Docker boundary: real containers, with registry operations denied.
import http from 'node:http'
import {once} from 'node:events'

export async function dockerProxy() {
  const daemon = process.env.DOCKER_HOST
  const url = daemon && !daemon.startsWith('unix:')
    ? new URL(daemon.replace(/^tcp:/, 'http:')) : undefined
  if (url && url.protocol !== 'http:') throw new Error('Test proxy requires TCP or Unix Docker')
  const upstream = url
    ? {hostname: url.hostname, port: url.port}
    : {socketPath: daemon?.replace(/^unix:\/\//, '') || '/var/run/docker.sock'}
  const state = {
    forbidden: 0,
    reapers: new Set<string>(),
    missingImages: new Set<string>(),
    unverifiableContainers: new Set<string>(),
    containers: [] as {id: string; image: string}[],
    networks: [] as string[],
  }
  const api = (route: string, method = 'GET', body?: unknown): Promise<any> => new Promise((resolve, reject) => {
    const request = http.request({...upstream, path: route, method, headers: {'Content-Type': 'application/json'}}, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        if (response.statusCode! >= 400) reject(new Error(`Docker ${response.statusCode}: ${text}`))
        else resolve(text ? JSON.parse(text) : undefined)
      })
    })
    request.on('error', reject)
    request.end(body === undefined ? undefined : JSON.stringify(body))
  })
  const server = http.createServer(async (request, response) => {
    const route = request.url!
    const pathname = decodeURIComponent(route.split('?')[0].replace(/^\/v[\d.]+/, ''))
    if (/^\/(images\/create|auth)$/.test(pathname)) {
      state.forbidden++
      response.writeHead(403).end('Registry access forbidden')
      return
    }
    const image = pathname.match(/^\/images\/(.+)\/json$/)?.[1]
    const container = pathname.match(/^\/containers\/(.+)\/json$/)?.[1]
    if (image && state.missingImages.has(image)) {
      response.writeHead(404, {'Content-Type': 'application/json'}).end(JSON.stringify({message: 'No such image'}))
      return
    }
    if (container && state.unverifiableContainers.has(container)) {
      response.writeHead(500).end('Image identity unavailable')
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = Buffer.concat(chunks)
    const forward = http.request({...upstream, path: route, method: request.method, headers: request.headers}, result => {
      response.on('close', () => { result.destroy(); forward.destroy() })
      const inspectResponse = pathname === '/containers/json' || pathname === '/containers/create' || pathname === '/networks/create'
      if (!inspectResponse) {
        response.writeHead(result.statusCode!, result.headers)
        result.pipe(response)
        return
      }
      const parts: Buffer[] = []
      result.on('data', part => parts.push(part))
      result.on('end', () => {
        let payload = JSON.parse(Buffer.concat(parts).toString())
        if (result.statusCode! < 300) {
          if (pathname === '/containers/json')
            payload = payload.filter((item: any) => item.Labels?.['org.testcontainers.ryuk'] !== 'true' || state.reapers.has(item.Id))
          if (pathname === '/containers/create') state.containers.push({id: payload.Id, image: JSON.parse(body.toString()).Image})
          if (pathname === '/networks/create') state.networks.push(payload.Id)
        }
        response.writeHead(result.statusCode!, {'Content-Type': 'application/json'})
        response.end(JSON.stringify(payload))
      })
    })
    forward.on('error', error => response.destroy(error))
    forward.end(body)
  })
  server.on('upgrade', (request, socket, head) => {
    const forward = http.request({...upstream, path: request.url, method: request.method, headers: request.headers})
    forward.on('upgrade', (response, remote, remoteHead) => {
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
        Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n\r\n')
      if (head.length) remote.write(head)
      if (remoteHead.length) socket.write(remoteHead)
      socket.pipe(remote).pipe(socket)
      socket.on('error', () => remote.destroy())
      remote.on('error', () => socket.destroy())
      socket.on('close', () => remote.destroy())
      remote.on('close', () => socket.destroy())
    })
    forward.on('error', () => socket.destroy())
    forward.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing proxy address')
  return {
    ...state, api, host: `tcp://127.0.0.1:${address.port}`,
    // Keep the counter live rather than copying its initial value.
    get forbidden() { return state.forbidden },
    close() { server.closeAllConnections(); server.close() },
  }
}

/** A different image running the real Ryuk binary, with its own cleanup lifetime. */
export async function alternateReaper(proxy: Awaited<ReturnType<typeof dockerProxy>>, original: string) {
  const info = await proxy.api(`/containers/${original}/json`)
  const image: string = (await proxy.api(`/commit?container=${original}&pause=false&changes=${encodeURIComponent('LABEL rules.web-e2e.test-alternate=true')}`, 'POST')).Id
  const id: string = (await proxy.api('/containers/create', 'POST', {
    Image: image,
    Env: [...info.Config.Env.filter((entry: string) => !entry.startsWith('RYUK_CONNECTION_TIMEOUT=')), 'RYUK_CONNECTION_TIMEOUT=300s'],
    Labels: {'org.testcontainers.ryuk': 'true', 'org.testcontainers.session-id': 'preload-alternate'},
    HostConfig: {Binds: info.HostConfig.Binds, PortBindings: {'8080/tcp': [{HostIp: '127.0.0.1', HostPort: '0'}]}},
  })).Id
  await proxy.api(`/containers/${id}/start`, 'POST')
  return {id, image}
}
