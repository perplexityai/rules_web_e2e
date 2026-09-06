import React from 'react'
import ReactDOM from 'react-dom'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'

test('renders an interactive card', async () => {
  const root = document.createElement('div')
  document.body.append(root)
  function Card() {
    const [saved, setSaved] = React.useState(false)
    return (
      <section
        style={{
          padding: 24,
          fontFamily: 'sans-serif',
          width: 320,
          background: '#f5f7fa',
        }}
      >
        <h1>Visual testing</h1>
        <p>Compare components in a real browser.</p>
        <button onClick={() => setSaved(true)}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </section>
    )
  }
  try {
    ReactDOM.render(<Card />, root)
    await page.getByRole('button', {name: 'Save', exact: true}).click()
    await expect
      .element(page.getByRole('button', {name: 'Saved'}))
      .toBeVisible()
    await document.fonts.ready
    await expect(root).toMatchScreenshot('card-saved')
  } finally {
    ReactDOM.unmountComponentAtNode(root)
    root.remove()
  }
})
