import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 43123,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:43124',
        changeOrigin: true,
      },
    },
  },
})
