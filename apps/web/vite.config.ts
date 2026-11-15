import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.SMART_LEARNING_API_TARGET ?? 'http://127.0.0.1:8765';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../backend/app/web/dist', emptyOutDir: true },
  server: { host: '127.0.0.1', proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
});
