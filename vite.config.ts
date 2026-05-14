import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/photo-splat-gallery/',
  server: {
    port: 4010,
    host: true, // Allow LAN access
    // https: true // Handled by basicSsl plugin
    proxy: {
      '/api': {
        target: 'http://localhost:4011',
        changeOrigin: true,
        secure: false,
      }
    },
    watch: {
      ignored: ['**/.venv/**', '**/node_modules/**']
    },
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  },
  preview: {
    host: true,
    port: 4012,
    proxy: {
      '/api': {
        target: 'http://localhost:4011',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
