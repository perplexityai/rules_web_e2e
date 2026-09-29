import path from 'node:path'
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {build} from 'vite'
import config from './vite.config.js'

const root = fs.realpathSync(fileURLToPath(new URL('.', import.meta.url)))
await build({
  ...config,
  root,
  resolve: {
    ...config.resolve,
    preserveSymlinks: true,
    alias: ['react', 'react-dom'].map(name => ({
      find: name,
      replacement: fs.realpathSync(path.join(root, 'node_modules', name)),
    })),
  },
  configFile: false,
  envDir: false,
  css: {postcss: {}},
  build: {
    outDir: path.resolve(process.argv[2]),
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      input: [path.join(root, 'index.html'), path.join(root, 'gallery.html')],
    },
  },
})
