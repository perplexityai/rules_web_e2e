/** Framework-neutral version of the consumer visual-module convention. */
export interface ComponentVisualVrtOptions {
  screenshotName?: string
  viewport?: {width: number; height: number}
  deviceScaleFactor?: number
  documentLanguage?: string
  theme?: 'light' | 'dark'
}
export interface ComponentVisual<Node = unknown> {
  visualId: string
  name: string
  render: (props?: Record<string, unknown>) => Node
  beforeCapture?: () => void | Promise<void>
  getScreenshotElement?: () => Element | Promise<Element>
  vrt?: ComponentVisualVrtOptions | false
}
export interface ComponentVisualModule<Node = unknown> {
  id: string
  title: string
  renderShell?: (children: Node) => Node
  visuals: readonly ComponentVisual<Node>[]
}
export interface VisualCapture extends ComponentVisualVrtOptions {
  id: string
  name: string
  screenshotName: string
}
export interface VisualGallery {
  captures: VisualCapture[]
  mount(params: {story: string; props?: Record<string, unknown>}): Promise<void>
  prepareCapture(): Promise<void>
  unmount(): void | Promise<void>
}
declare global {
  interface Window {
    rulesVisuals: VisualGallery
  }
}
const kebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

export function visualCaptures<Node>(
  modules: readonly ComponentVisualModule<Node>[]
): VisualCapture[] {
  const ids = new Set<string>()
  const names = new Set<string>()
  return modules.flatMap(module =>
    module.visuals.flatMap(visual => {
      const id = `${module.id}/${visual.visualId}`
      if (ids.has(id)) throw new Error(`Duplicate visual id: ${id}`)
      ids.add(id)
      if (visual.vrt === false) return []
      const options = visual.vrt ?? {}
      const screenshotName =
        options.screenshotName ??
        `${kebab(module.id.split('/').at(-1)!)}-${kebab(visual.visualId)}`
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(screenshotName) ||
        screenshotName.includes('..')
      )
        throw new Error(`Invalid screenshot name: ${screenshotName}`)
      const filename = screenshotName.endsWith('.png')
        ? screenshotName
        : `${screenshotName}.png`
      if (names.has(filename))
        throw new Error(`Duplicate screenshot name: ${filename}`)
      names.add(filename)
      if (
        options.deviceScaleFactor !== undefined &&
        (!Number.isInteger(options.deviceScaleFactor) ||
          options.deviceScaleFactor <= 0)
      )
        throw new Error(`Invalid device scale factor: ${id}`)
      if (
        options.viewport &&
        (!Number.isInteger(options.viewport.width) ||
          !Number.isInteger(options.viewport.height) ||
          options.viewport.width <= 0 ||
          options.viewport.height <= 0)
      )
        throw new Error(`Invalid viewport: ${id}`)
      return [
        {
          ...options,
          id,
          name: `${module.title} / ${visual.name}`,
          screenshotName: filename,
        },
      ]
    })
  )
}

/** Install on the consumer gallery page; rendering and providers remain consumer-owned. */
export function installVisualGallery<Node>(
  modules: readonly ComponentVisualModule<Node>[],
  renderer: {
    render(node: Node): void | Promise<void>
    unmount(): void | Promise<void>
  }
): void {
  let current: ComponentVisual<Node> | undefined
  const gallery: VisualGallery = {
    captures: visualCaptures(modules),
    async mount({story, props}) {
      const module = modules.find(module =>
        module.visuals.some(
          visual => `${module.id}/${visual.visualId}` === story
        )
      )
      const visual = module?.visuals.find(
        visual => `${module.id}/${visual.visualId}` === story
      )
      if (!module || !visual) throw new Error(`Unknown visual: ${story}`)
      current = visual
      const node = visual.render(props)
      await renderer.render(
        module.renderShell ? module.renderShell(node) : node
      )
    },
    async prepareCapture() {
      if (!current) throw new Error('No mounted visual')
      await current.beforeCapture?.()
      await document.fonts.ready
      document
        .querySelectorAll('[data-rules-visual-capture]')
        .forEach(element =>
          element.removeAttribute('data-rules-visual-capture')
        )
      const element = current.getScreenshotElement
        ? await current.getScreenshotElement()
        : document.getElementById('root')
      if (!element || !element.isConnected)
        throw new Error('Visual screenshot element is not attached')
      element.setAttribute('data-rules-visual-capture', '')
    },
    async unmount() {
      current = undefined
      await renderer.unmount()
    },
  }
  Object.assign(window, {
    rulesVisuals: gallery,
    mount: gallery.mount,
    unmount: gallery.unmount,
  })
}

/** Validate browser-provided metadata before it becomes test names or output paths. */
export function validateCaptures(
  value: unknown
): asserts value is VisualCapture[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error('No VRT-enabled visuals were registered')
  const ids = new Set<string>()
  const files = new Set<string>()
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      !item.id ||
      typeof item.name !== 'string' ||
      !item.name ||
      typeof item.screenshotName !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.png$/.test(item.screenshotName) ||
      item.screenshotName.includes('..')
    )
      throw new Error('Invalid visual capture metadata')
    if (ids.has(item.id) || files.has(item.screenshotName))
      throw new Error('Duplicate visual capture metadata')
    ids.add(item.id)
    files.add(item.screenshotName)
    if (
      item.viewport &&
      (!Number.isInteger(item.viewport.width) ||
        item.viewport.width <= 0 ||
        !Number.isInteger(item.viewport.height) ||
        item.viewport.height <= 0)
    )
      throw new Error('Invalid visual viewport')
    if (
      item.deviceScaleFactor !== undefined &&
      (!Number.isInteger(item.deviceScaleFactor) || item.deviceScaleFactor <= 0)
    )
      throw new Error('Invalid visual device scale factor')
    if (
      item.theme !== undefined &&
      item.theme !== 'light' &&
      item.theme !== 'dark'
    )
      throw new Error('Invalid visual theme')
    if (
      item.documentLanguage !== undefined &&
      typeof item.documentLanguage !== 'string'
    )
      throw new Error('Invalid visual language')
  }
}
