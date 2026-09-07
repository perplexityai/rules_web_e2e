import {
  GenericContainer,
  getContainerRuntimeClient,
  getReaper,
  LABEL_TESTCONTAINERS_SESSION_ID,
  StartedNetwork,
  Wait,
} from 'testcontainers'
import {fileURLToPath} from 'node:url'
import type {StartedTestContainer} from 'testcontainers'
import {randomUUID} from 'node:crypto'

export async function startBrowser(image: string, core: string) {
  const client = await getContainerRuntimeClient()
  const reaper = await getReaper(client)
  const name = `vrt-${randomUUID()}`
  const network = new StartedNetwork(
    client,
    name,
    await client.network.create({
      Name: name,
      Driver: 'bridge',
      Internal: true,
      Labels: {
        'org.testcontainers': 'true',
        [LABEL_TESTCONTAINERS_SESSION_ID]: reaper.sessionId,
      },
    })
  )
  const pending = new Set<string>()
  class BrowserContainer extends GenericContainer {
    constructor(image: string) {
      super(image)
      this.hostConfig.Init = true
      this.withLabels({'rules.web-e2e.invocation': name})
    }
    protected override async containerCreated(id: string) {
      pending.add(id)
    }
  }
  const owned: StartedTestContainer[] = []
  const stop = async () => {
    const failures: unknown[] = []
    for (const container of owned.splice(0).reverse()) {
      try {
        await container.stop()
        pending.delete(container.getId())
      } catch (error) {
        failures.push(error)
      }
    }
    // Testcontainers invokes containerCreated after copying files. Discover our
    // labeled resources too, so failed archive copies cannot leak containers.
    for (const container of await client.container.dockerode.listContainers({
      all: true,
      filters: {label: [`rules.web-e2e.invocation=${name}`]},
    }))
      pending.add(container.Id)
    for (const id of pending) {
      try {
        await client.container.getById(id).remove({force: true, v: true})
        pending.delete(id)
      } catch (error) {
        if ((error as {statusCode?: number}).statusCode !== 404)
          failures.push(error)
      }
    }
    try {
      await network.stop()
    } catch (error) {
      failures.push(error)
    }
    if (failures.length)
      throw new AggregateError(failures, 'Container cleanup failed')
  }
  try {
    const container = await new BrowserContainer(image)
      .withPlatform('linux/amd64')
      .withNetwork(network)
      .withSharedMemorySize(1024 * 1024 * 1024)
      .withEnvironment({PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright'})
      .withCopyDirectoriesToContainer([
        {source: core, target: '/opt/playwright-core'},
      ])
      .withCommand([
        'node',
        '/opt/playwright-core/cli.js',
        'run-server',
        '--host',
        '0.0.0.0',
        '--port',
        '3000',
      ])
      .withWaitStrategy(Wait.forLogMessage('Listening on'))
      .withStartupTimeout(120_000)
      .start()
    owned.push(container)
    const architecture = await container.exec([
      'node',
      '-p',
      'process.platform + "/" + process.arch',
    ])
    if (architecture.output.trim() !== 'linux/x64')
      throw new Error(`Unexpected browser platform: ${architecture.output}`)
    // Docker does not publish ports on internal-only networks. A fixed TCP relay
    // exposes the control socket without giving the browser an external route.
    class ControlRelay extends BrowserContainer {
      constructor() {
        super(image)
        this.withExposedPorts(3000)
        this.hostConfig.PortBindings = {
          '3000/tcp': [{HostIp: '127.0.0.1', HostPort: '0'}],
        }
      }
      protected override async containerCreated(id: string) {
        await super.containerCreated(id)
        await client.container.connectToNetwork(
          client.container.getById(id),
          client.network.getById(network.getId()),
          []
        )
      }
    }
    const relay = await new ControlRelay()
      .withPlatform('linux/amd64')
      .withEnvironment({
        VRT_BROWSER_HOST: container.getIpAddress(network.getName()),
      })
      .withCopyFilesToContainer([
        {
          source: fileURLToPath(new URL('./relay.js', import.meta.url)),
          target: '/opt/relay.js',
        },
      ])
      .withCommand(['node', '/opt/relay.js'])
      .withWaitStrategy(
        Wait.forAll([
          Wait.forListeningPorts(),
          Wait.forLogMessage('Control relay ready'),
        ])
      )
      .withStartupTimeout(30_000)
      .start()
    owned.push(relay)
    return {
      endpoint: `ws://${relay.getHost()}:${relay.getMappedPort(3000)}/`,
      stop,
    }
  } catch (error) {
    try {
      await stop()
    } catch (cleanup) {
      console.error(cleanup)
    }
    throw error
  }
}
