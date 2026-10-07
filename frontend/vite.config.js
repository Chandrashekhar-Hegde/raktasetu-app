import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolveSiteOriginFromEnv, siteOriginPlugin } from './vite.site-origin.js'

const siteOrigin = resolveSiteOriginFromEnv(process.env)

export default defineConfig({
  plugins: [
    siteOriginPlugin(siteOrigin),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      minify: false,
      includeAssets: ['drop-icon.svg', 'icon-192.png', 'icon-512.png', 'og-card-1200x630.jpg', 'push-handler.js'],
      manifest: {
        name: 'RaktaSetu',
        short_name: 'RaktaSetu',
        description: 'Coordinate compatible blood requests with willing donors and participating hospitals.',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['health', 'utilities'],
        display: 'standalone',
        background_color: '#F8EFEC',
        theme_color: '#7A1626',
        orientation: 'any',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['/push-handler.js'],
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  // Railway serves SPA at site root (unified with API). Local Vite still proxies /api.
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Function form: Vite 8 (Rolldown) no longer accepts the object form.
        manualChunks(id) {
          const pkg = id.match(/[\\/]node_modules[\\/](@[^\\/]+[\\/][^\\/]+|[^\\/]+)/)?.[1]
          if (!pkg) return undefined
          if (pkg === 'three') return 'three'
          if (['leaflet', 'react-leaflet', '@react-leaflet/core'].includes(pkg)) return 'leaflet'
          if (['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', 'axios'].includes(pkg)) return 'vendor'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: true,
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
  },
})
