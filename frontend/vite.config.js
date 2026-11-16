import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    target: ['es2018', 'chrome70', 'edge79', 'firefox67', 'safari12'],
    cssTarget: ['chrome61', 'firefox60', 'safari11', 'edge16'],
    chunkSizeWarningLimit: 1500,
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

