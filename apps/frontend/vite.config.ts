import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.FRONTEND_PORT || 5173),
    open: true,
    proxy: {
      '/movies': 'http://localhost:3000',
      '/theaters': 'http://localhost:3000',
      '/showings': 'http://localhost:3000',
      '/seats': 'http://localhost:3000',
      '/ticket-types': 'http://localhost:3000',
      '/bookings': 'http://localhost:3000',
      '/agent/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
})
