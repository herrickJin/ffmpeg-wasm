import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 4000,
    host: true,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['@ffmpeg/ffmpeg', '@ffmpeg/core']
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg']
  }
})