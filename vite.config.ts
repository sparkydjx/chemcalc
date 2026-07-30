import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Set BASE_PATH=/chemcalc/ when deploying to GitHub Pages (project site)
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'ChemCalc',
        short_name: 'ChemCalc',
        description: 'Oilfield chemistry & line calculators — dosage, displacement, velocity, and more.',
        theme_color: '#0d7377',
        background_color: '#f5f7f8',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
