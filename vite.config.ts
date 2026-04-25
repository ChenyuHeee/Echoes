import { defineConfig } from 'vite'
import { resolve } from 'path'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const basePath = process.env.VITE_PUBLIC_BASE || (process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/')

export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          phaser: ['phaser'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true
  }
})
