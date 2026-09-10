import {flushSync} from 'react-dom'
import {createRoot, type Root} from 'react-dom/client'
import {Counter, Broken} from './counter.visual'
import {TestShell} from './shell'

declare global {
  interface Window {
    mount(params: {story: string; props?: {title?: string}}): void
    unmount(): void
  }
}

// The consumer owns this registry, its imports, providers, and CSS.
const stories = {'Counter/Default': Counter, 'Counter/Broken': Broken}
let root: Root | undefined
let renderError: unknown
window.mount = ({story, props}) => {
  if (!Object.hasOwn(stories, story)) throw new Error(`Unknown story: ${story}`)
  const Story = stories[story as keyof typeof stories]
  renderError = undefined
  root ??= createRoot(document.getElementById('root')!, {
    onUncaughtError(error) {
      renderError = error
    },
  })
  flushSync(() =>
    root!.render(
      <TestShell>
        <Story {...props} />
      </TestShell>
    )
  )
  if (renderError) throw renderError
}
window.unmount = () => {
  root?.unmount()
  root = undefined
}
