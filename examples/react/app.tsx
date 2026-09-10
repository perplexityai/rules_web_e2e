import {flushSync} from 'react-dom'
import {createRoot} from 'react-dom/client'
import {installVisualGallery} from '@rules-web-e2e/vrt/visual'
import {Card} from './card.visual'
import visualModule from './card.visual'
import {TestShell} from './shell'

const root = createRoot(document.getElementById('card-root')!)
root.render(
  <TestShell>
    <Card />
  </TestShell>
)
installVisualGallery([visualModule], {
  render: node => flushSync(() => root.render(node)),
  unmount: () => root.unmount(),
})
