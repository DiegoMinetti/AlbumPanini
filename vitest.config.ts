import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      // A concrete origin so localStorage works (about:blank is opaque).
      environmentOptions: { jsdom: { url: 'http://localhost/' } },
      setupFiles: ['./src/tests/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'html', 'lcov'],
        reportsDirectory: './coverage',
        // Unit/component coverage targets the logic + reusable components.
        // Pages, charts, OCR/camera and PWA glue are covered by Playwright E2E.
        include: [
          'src/services/**/*.ts',
          'src/utils/**/*.ts',
          'src/stores/**/*.ts',
          'src/db/**/*.ts',
          'src/components/ui/ProgressBar.tsx',
          'src/components/ui/StatCard.tsx',
          'src/components/ui/SegmentedControl.tsx',
          'src/components/stickers/QuantityStepper.tsx',
          'src/components/stickers/StickerCard.tsx',
        ],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/**/*.spec.{ts,tsx}',
          'src/tests/**',
          'src/**/index.ts',
          // Browser/DOM-heavy modules exercised by Playwright E2E instead.
          'src/services/ocrService.ts',
          'src/utils/file.ts',
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/**/*.d.ts',
          'src/i18n/locales/**',
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
      },
    },
  })
);
