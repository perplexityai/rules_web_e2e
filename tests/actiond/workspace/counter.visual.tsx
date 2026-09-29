import type {ComponentVisualModule} from '@rules-web-e2e/vrt/visual'
import type {ReactNode} from 'react'
import {TestShell} from './shell'
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
  renderShell: children => <TestShell>{children}</TestShell>,
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
export default visualModule
