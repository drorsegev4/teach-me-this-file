import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Same PORT as the API server: from .env locally, default 3001.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.PORT || 3001;
  return {
    plugins: [react(), tailwindcss()],
    root: 'client',
    build: { outDir: '../dist', emptyOutDir: true },
    server: { host: '127.0.0.1', port: 5173, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
  };
});
