import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    host: true, // listen on 0.0.0.0 so external devices can connect
    proxy: {
      '/ws': {
        target: 'http://localhost:1234',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
    allowedHosts: true,
  },
})
