import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  envDir: '../..',
  base: process.env.NODE_ENV === 'production' ? '/agent-monitor/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.AGENT_MONITOR_WEB_PORT || 3501),
    open: true,
    proxy: {
      '/monitor-api': {
        target: `http://127.0.0.1:${Number(process.env.AGENT_MONITOR_PORT || 3500)}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/monitor-api/, ''),
      },
    },
  },
});
