import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Em desenvolvimento (npm run dev) as chamadas vão para o Flask na porta 5000.
const flask = 'http://127.0.0.1:5000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1000, outDir: '../public', emptyOutDir: true },
  server: {
    proxy: { '/api': flask, '/media': flask, '/thumb': flask, '/avatar': flask },
  },
})
