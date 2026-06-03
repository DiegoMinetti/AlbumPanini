import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Base path resolution.
 *
 * On GitHub Pages the app is served from https://username.github.io/<repo>/,
 * so the build needs `base = '/<repo>/'`. Locally and on custom domains the
 * base is `'/'`. The repo name is injected by the deploy workflow through the
 * `VITE_BASE_PATH` env var; otherwise we fall back to root.
 */
const basePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Panini Collection Tracker',
        short_name: 'Panini',
        description: 'Offline-first sticker collection tracker.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: basePath,
        scope: basePath,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,json,wasm}'],
        // Tesseract language data and large wasm can exceed the default limit.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${basePath}index.html`,
        runtimeCaching: [
          {
            // Collection JSON packages are loaded at runtime.
            urlPattern: ({ url }) => url.pathname.includes('/collections/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'collections-cache',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Optional image assets (flags, player images).
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 512, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
          {
            // Tesseract CDN core + language files (cached for offline OCR).
            urlPattern: ({ url }) =>
              url.href.includes('tessdata') || url.href.includes('tesseract'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-cache',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          ocr: ['tesseract.js'],
          qr: ['qrcode', 'jsqr'],
        },
      },
    },
  },
});
