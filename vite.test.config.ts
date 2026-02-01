/// <reference types="vitest" />
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@capacitor/filesystem': path.resolve(__dirname, './scripts/mocks/node-filesystem.ts'),
      '@capacitor/core': path.resolve(__dirname, './scripts/mocks/capacitor-core.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
