import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {mergeConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'
import {playwright} from '@vitest/browser-playwright'
import {visualConfig} from '@rules-web-e2e/vrt'

export default mergeConfig(
  visualConfig({
    provider: playwright,
    root: path.dirname(fileURLToPath(import.meta.url)),
  }),
  {plugins: [react()], test: {include: ['*.visual.test.tsx']}}
)
