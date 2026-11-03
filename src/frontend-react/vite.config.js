import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The browser always calls /api/... on its own origin. In dev, Vite forwards that to the API
// container by name, on cheese-shop-demo-network; in production, nginx does (nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces, so the container's published port reaches it
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://api-service:9000' },
  },
})
