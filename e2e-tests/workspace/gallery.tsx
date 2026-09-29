import type {ComponentVisualModule} from '@rules-web-e2e/vrt/visual'
import type {ReactNode} from 'react'
import {useState, type ReactElement} from 'react'

export function Counter({title = 'Counter'}: {title?: string}): ReactElement {
  const [count, setCount] = useState(0)
  return (
    <section>
      <h1>{title}</h1>
      <button onClick={() => setCount(value => value + 1)}>Increment</button>
      <output aria-label="Count">{count}</output>
    </section>
  )
}

export function Broken(): never {
  throw new Error('Story render failed')
}

const visualModule: ComponentVisualModule<ReactNode> = {
  id: 'Counter',
  title: 'Counter',
  renderShell: children => <div lang="en" dir="ltr" style={{fontFamily: 'sans-serif'}}>{children}</div>,
  visuals: [
    {
      visualId: 'Default',
      name: 'Default',
      render: props => <Counter title={props?.title as string | undefined} />,
      vrt: false,
    },
    {visualId: 'Broken', name: 'Broken', render: () => <Broken />, vrt: false},
    {
      visualId: 'incremented',
      name: 'Incremented',
      render: () => <Counter />,
      beforeCapture: async () => {
        document.querySelector('button')!.click()
        await new Promise(requestAnimationFrame)
      },
      vrt: {screenshotName: 'counter'},
    },
  ],
}

import {flushSync} from 'react-dom'
import {createRoot, type Root} from 'react-dom/client'
import {installVisualGallery} from '@rules-web-e2e/vrt/visual'

let root: Root | undefined
let renderError: unknown
installVisualGallery([visualModule], {
  render(node) {
    renderError = undefined
    root ??= createRoot(document.getElementById('root')!, {
      onUncaughtError(error) {
        renderError = error
      },
    })
    flushSync(() => root!.render(node))
    if (renderError) throw renderError
  },
  unmount() {
    root?.unmount()
    root = undefined
  },
})
