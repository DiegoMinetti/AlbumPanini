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
        // JSON files are intentionally excluded from the precache list.
        // Anything under /collections/ (per-collection manifests) or
        // /official/ (FIFA results snapshots) changes frequently — once per
        // app deploy for collections, every ~30 min during match hours for
        // results — and the app already fetches them with explicit cache
        // control. Baking them into the precache meant users saw stale
        // snapshots (e.g. zero FT matches) until the SW itself updated, which
        // is exactly the bug the Partidos tab hit on the deployed build.
        //
        // The runtime caching rules below now own these URLs and use
        // NetworkFirst with a 5 s timeout so offline users still get the last
        // good copy from the runtime cache.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,wasm}'],
        // Tesseract language data and large wasm can exceed the default limit.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${basePath}index.html`,
        runtimeCaching: [
          {
            // Official results JSON from the openfootball sync workflow.
            // NetworkFirst with a short timeout: live users always see the
            // freshest snapshot (~30 min cadence during the World Cup), and
            // offline users still get the last good copy.
            urlPattern: ({ url }) => url.pathname.includes('/official/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'official-results-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Collection JSON packages (teams, stickers, tournament).
            // NetworkFirst so version-bumps are picked up on next launch
            // without waiting for the SW to update. The 30-day expiry is a
            // safety net — the app's own re-sync logic (PR1) is what
            // actually decides when to upgrade.
            urlPattern: ({ url }) => url.pathname.includes('/collections/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'collections-cache',
              networkTimeoutSeconds: 5,
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
        },
      },
    },
  },
});
