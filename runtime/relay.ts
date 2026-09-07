import net from 'node:net'

// Only forward the Playwright control socket; never act as an HTTP/SOCKS proxy.
net
  .createServer(client => {
    const upstream = net.connect(3000, process.env.VRT_BROWSER_HOST!)
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
    client.on('close', () => upstream.destroy())
    upstream.on('close', () => client.destroy())
    client.pipe(upstream).pipe(client)
  })
  .listen(3000, '0.0.0.0', () => console.log('Control relay ready'))
