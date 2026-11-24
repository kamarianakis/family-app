import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base must match the GitHub repo name for GitHub Pages
export default defineConfig({
  base: '/family-app/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Οικογένεια',
        short_name: 'Οικογένεια',
        description: 'Ψώνια, λογαριασμοί, πληρωμές, ημερολόγιο και chat',
        lang: 'el',
        theme_color: '#0f766e',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: '/family-app/',
        scope: '/family-app/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { navigateFallback: '/family-app/index.html', importScripts: ['push-sw.js'] }
    })
  ]
})
