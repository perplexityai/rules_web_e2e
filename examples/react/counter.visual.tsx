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
