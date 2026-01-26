import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mockFsMiddleware } from './mock-fs-middleware'
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockFsMiddleware()],
  resolve: {
    alias: process.env.NODE_ENV === 'development' ? [
      {
        find: '@capacitor/filesystem',
        replacement: path.resolve(__dirname, 'src/mocks/capacitor-filesystem.ts')
      },
      {
        find: '@capacitor/core',
        replacement: path.resolve(__dirname, 'src/mocks/capacitor-core.ts')
      }
    ] : []
  }
})
