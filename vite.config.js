import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/data/**', '**/.venv/**', '**/__pycache__/**', '**/tests/output/**'],
    },
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/.venv/**'],
    },
    proxy: {
      '/api': {
        target:
          'http://127.0.0.1:' + (process.env.SKILLPROOF_API_PORT || '8000'),
        timeout: 180000,
        proxyTimeout: 180000,
      },
    },
  },
})
