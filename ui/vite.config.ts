import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// core/ has no build step — it's consumed as raw TS source, same as this app's own
// src/, so the walking skeleton needs no backend and no package-publish step.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': path.resolve(dirname, '../core/src'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(dirname, '..')],
    },
  },
})
