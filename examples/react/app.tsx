import React from 'react'
import {createRoot} from 'react-dom/client'
import {TestShell} from './shell'

function Card() {
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

createRoot(document.getElementById('card-root')!).render(
  <TestShell>
    <Card />
  </TestShell>
)
