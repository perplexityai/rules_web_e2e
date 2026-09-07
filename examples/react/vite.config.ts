import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: process.env.VRT_CACHE,
  plugins: [react()],
})
