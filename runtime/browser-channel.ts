declare global {
  interface Window {
    __rulesWebE2eChannels?: boolean
  }
}

/** Bridge Vitest 4 control channels between its orchestrator and test iframe.
 * Browser execution can otherwise wait indefinitely before collecting tests.
 * Application BroadcastChannels retain their native implementation.
 */
export function installVitestBridge() {
  if (window.__rulesWebE2eChannels) return
  window.__rulesWebE2eChannels = true
  const NativeChannel = window.BroadcastChannel
  const channels = new Map<string, Set<Channel>>()
  const pending = new Map<string, unknown[]>()
  const key = '__rulesWebE2eVitestChannel'
  function deliver(name: string, data: unknown) {
    const receivers = [...(channels.get(name) || [])].filter(
      channel => channel.ready
    )
    if (!receivers.length) {
      const queue = pending.get(name) || []
      if (queue.length === 100) queue.shift()
      queue.push(data)
      pending.set(name, queue)
      return
    }
    for (const channel of receivers) {
      const event = new MessageEvent('message', {data})
      channel.dispatchEvent(event)
      channel.handler?.call(channel, event)
    }
  }
  class Channel extends EventTarget implements BroadcastChannel {
    readonly name: string
    ready: boolean
    handler: ((this: BroadcastChannel, event: MessageEvent) => unknown) | null
    onmessageerror:
      | ((this: BroadcastChannel, event: MessageEvent) => unknown)
      | null = null
    constructor(name: string) {
      super()
      this.name = name
      this.ready = false
      this.handler = null
      const set = channels.get(name) || new Set()
      set.add(this)
      channels.set(name, set)
    }
    flush() {
      this.ready = true
      const queue = pending.get(this.name) || []
      pending.delete(this.name)
      for (const data of queue) queueMicrotask(() => deliver(this.name, data))
    }
    get onmessage() {
      return this.handler
    }
    set onmessage(handler) {
      this.handler = handler
      if (handler) this.flush()
    }
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ) {
      super.addEventListener(type, listener, options)
      if (type === 'message' && listener) this.flush()
    }
    postMessage(data: unknown) {
      const payload = {[key]: true, channel: this.name, data}
      if (window.parent !== window)
        window.parent.postMessage(payload, location.origin)
      for (const frame of document.querySelectorAll<HTMLIFrameElement>(
        'iframe[data-vitest]'
      )) {
        frame.contentWindow?.postMessage(payload, location.origin)
      }
    }
    close() {
      const set = channels.get(this.name)
      set?.delete(this)
      if (!set?.size) {
        channels.delete(this.name)
        pending.delete(this.name)
      }
    }
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data?.[key]) return
    const trusted =
      event.source === window.parent ||
      [
        ...document.querySelectorAll<HTMLIFrameElement>('iframe[data-vitest]'),
      ].some(frame => frame.contentWindow === event.source)
    if (trusted) deliver(event.data.channel, event.data.data)
  })
  window.BroadcastChannel = class extends NativeChannel {
    constructor(name: string) {
      super(name)
      if (name.startsWith('vitest:')) {
        super.close()
        return new Channel(name)
      }
    }
  }
}
