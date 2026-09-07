import React from 'react'
import ReactDOM from 'react-dom'

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
      <button onClick={() => setSaved(true)}>{saved ? 'Saved' : 'Save'}</button>
    </section>
  )
}

ReactDOM.render(<Card />, document.getElementById('card-root'))
