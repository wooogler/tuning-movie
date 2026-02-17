import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3501,
    proxy: {
      '/monitor-api': {
        target: 'http://localhost:3500',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/monitor-api/, ''),
      },
    },
  },
});
