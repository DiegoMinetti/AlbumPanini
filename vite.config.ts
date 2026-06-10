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
const rawBasePath = process.env.VITE_BASE_PATH ?? '/';
const basePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;

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
        // Unique PWA identifier (Chrome 96+). Prevents the "PWA is being
        // replaced" surprise when the user navigates to the app from
        // different entry points (e.g. QR vs. installed icon).
        id: basePath,
        name: 'Panini Collection Tracker',
        short_name: 'Panini',
        description: 'Offline-first sticker collection tracker.',
        lang: 'es',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: basePath,
        scope: basePath,
        // We don't have a native companion app — keep the PWA install path
        // explicit so the browser always offers it.
        prefer_related_applications: false,
        // Chrome 102+: when installed, links that fall inside `scope` open
        // directly in the PWA window instead of the browser tab. This is
        // what makes the QR / WhatsApp link land in Panini.
        // (iOS Safari ignores this field — there Universal Links would be
        // needed, which aren't available for pure PWAs.)
        handle_links: 'preferred',
        // Chrome 110+: when a second navigation to the app arrives while
        // it's already running, reuse the existing window instead of
        // spawning a duplicate. Pairs with `handle_links: 'preferred'`.
        launch_handler: {
          client_mode: 'auto',
        },
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
