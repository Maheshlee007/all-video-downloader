import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        panel: resolve('index.html'),
        offscreen: resolve('offscreen.html'),
        background: resolve('src/extension/background.ts'),
      },
      output: { entryFileNames: '[name].js' },
    },
  },
});
