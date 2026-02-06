import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/movies': 'http://localhost:3000',
      '/theaters': 'http://localhost:3000',
      '/showings': 'http://localhost:3000',
      '/seats': 'http://localhost:3000',
      '/ticket-types': 'http://localhost:3000',
      '/bookings': 'http://localhost:3000',
    },
  },
})
