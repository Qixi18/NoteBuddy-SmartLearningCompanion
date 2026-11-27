import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: '/',
    server: {
      port: 5173,
      strictPort: true,
      // Windows 上编辑器/工具常用"写临时文件再原子替换"，chokidar 会因 EBUSY
      // 直接崩掉整个 dev server；忽略这些临时产物，只监听真实源码。
      watch: { ignored: ['**/*.tmpdir/**', '**/*.tmp', '**/.git/**'] },
      proxy: {
        '/api': { target: env.SMART_LEARNING_API_TARGET || 'http://127.0.0.1:8765', changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
    },
  };
});
