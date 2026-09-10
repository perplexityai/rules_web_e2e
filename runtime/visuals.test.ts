import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  visualCaptures,
  validateCaptures,
  type ComponentVisualModule,
} from './visuals.js'

const module: ComponentVisualModule = {
  id: 'components/CodeBlock',
  title: 'Code',
  visuals: [
    {visualId: 'longText', name: 'Long text', render: () => null},
    {
      visualId: 'interactive',
      name: 'Interaction only',
      render: () => null,
      vrt: false,
    },
    {
      visualId: 'dark',
      name: 'Dark',
      render: () => null,
      vrt: {screenshotName: 'code-dark', theme: 'dark', deviceScaleFactor: 2},
    },
  ],
}
test('visual modules enable capture by default and respect opt-outs and overrides', () => {
  const captures = visualCaptures([module])
  assert.deepEqual(
    captures.map(({id, screenshotName}) => ({id, screenshotName})),
    [
      {
        id: 'components/CodeBlock/longText',
        screenshotName: 'code-block-long-text.png',
      },
      {id: 'components/CodeBlock/dark', screenshotName: 'code-dark.png'},
    ]
  )
  validateCaptures(captures)
})
test('duplicate identities and unsafe screenshot destinations fail before capture', () => {
  assert.throws(() => visualCaptures([module, module]), /Duplicate/)
  const capture = visualCaptures([module])[0]
  for (const value of [
    [],
    [capture, capture],
    [{...capture, screenshotName: '../escape.png'}],
    [{...capture, deviceScaleFactor: 1.5}],
    [{...capture, viewport: {width: 0, height: 100}}],
  ])
    assert.throws(() => validateCaptures(value))
})
