import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@capacitor/filesystem',
        replacement: path.resolve(__dirname, 'scripts/mocks/node-filesystem.ts')
      },
      // Ensure other imports resolve correctly if needed
      // But for now, fixing filesystem is the key
    ]
  },
  // Disable plugins that might interfere or are unnecessary for Node.js execution
  plugins: []
});
