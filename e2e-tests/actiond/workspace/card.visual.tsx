import React from 'react'
import type {ComponentVisualModule} from '@rules-web-e2e/vrt/visual'
import {TestShell} from './shell'
export function Card() {
  const [saved, setSaved] = React.useState(false)
  return (
    <section
      style={{
        padding: 24,
        width: 320,
        background: '#f5f7fa',
      }}
    >
      <h1>Visual testing</h1>
      <p>Compare components in a real browser.</p>
      <button onClick={() => setSaved(true)}>{saved ? 'Saved' : 'Save'}</button>
    </section>
  )
}

const visualModule: ComponentVisualModule<React.ReactNode> = {
  id: 'Card',
  title: 'Card',
  renderShell: children => <TestShell>{children}</TestShell>,
  visuals: [
    {
      visualId: 'saved',
      name: 'Saved',
      render: () => <Card />,
      beforeCapture: async () => {
        document.querySelector('button')!.click()
        await new Promise(requestAnimationFrame)
      },
      getScreenshotElement: () => document.getElementById('card-root')!,
      vrt: {screenshotName: 'card-saved'},
    },
  ],
}
export default visualModule
