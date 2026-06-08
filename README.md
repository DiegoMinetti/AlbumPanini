# Panini Collection Tracker

An **offline-first Progressive Web App** for managing sticker collections and
albums. No backend, no account, no login, no cloud — all your data stays on your
device in IndexedDB.

The app is **collection-driven**: it is not tied to any single album. Load any
collection from a JSON package (World Cup, Champions League, Pokémon, Formula 1,
…) and the whole UI adapts.

[![CI](https://github.com/DiegoMinetti/AlbumPanini/actions/workflows/ci.yml/badge.svg)](https://github.com/DiegoMinetti/AlbumPanini/actions/workflows/ci.yml)

## Features 

- 📦 **Multiple collections** — create, rename, duplicate, archive, delete.
  Several active collections at once.
- ✅ **Inventory** with owned / missing / duplicates and fast one-hand data entry.
- 🔍 **Filters & search** — ownership, team, category, rarity, free text.
- 📊 **Dashboard & statistics** — completion %, per-team & per-category progress,
  most/least common stickers, completed and near-complete teams, ownership
  heatmap (Recharts).
- 📷 **OCR scanning** — read printed codes like `ARG 1`, `BRA 12` with a local
  Tesseract.js worker (camera or uploaded image), fully offline.
- 📝 **Bulk import** — paste a list of codes to update inventory instantly.
- 🔁 **QR exchange** — generate a compressed QR of your duplicates & missing
  stickers; scan a friend's to compute what each can give and receive — offline,
  no server.
- 💾 **Backups** — export/import the entire app state as a gzip-compressed
  `.albumbackup` file, with versioning, validation and migration on restore.
- 🌗 **Light / dark / system themes**, persisted locally.
- 🌐 **i18n** — Spanish & English, ready for more languages.
- 📲 **Installable PWA** — service worker, manifest, icons, offline caching,
  background updates.

## Tech stack

React · TypeScript · Vite · Dexie (IndexedDB) · Zustand · React Router ·
TailwindCSS · i18next · React Hook Form · Zod · React Query · qrcode · jsQR ·
pako · Recharts · Tesseract.js · Vite PWA · Vitest · Testing Library · Playwright.

## Getting started

```bash
npm install
npm run dev          # start the dev server
```

Open the printed URL. On first run, go to **Collections** and install one of the
bundled sample collections (World Cup 2026, Pokémon 151, Demo Mini).

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | `tsc` no-emit |
| `npm run test` / `test:watch` | Vitest unit/component tests |
| `npm run test:coverage` | Coverage (thresholds enforced) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run icons` | Regenerate PWA PNG icons |
| `npm run collections` | Regenerate sample collection packages |

## Project structure

```
src/
  app/         # App root, router, providers
  pages/       # Route screens
  components/  # UI building blocks (layout, ui, stickers, stats, feedback)
  features/    # (reserved for larger feature bundles)
  hooks/       # Reactive data hooks (Dexie live queries, React Query)
  services/    # Domain logic: collections, inventory, stats, backup, qr, ocr
  db/          # Dexie database + migration framework
  stores/      # Zustand stores (settings, ui)
  types/       # Zod schemas + inferred TypeScript types
  utils/       # Pure helpers (codes, compression, format, files, haptics)
  i18n/        # i18next config + locale resources
  tests/       # Test setup + fixtures
public/
  collections/ # Collection JSON packages + index.json manifest
  icons/       # PWA icons
tests/e2e/     # Playwright specs
```

See [`docs/`](./docs) for deeper docs:

- [Architecture](./docs/ARCHITECTURE.md)
- [Authoring collections](./docs/COLLECTIONS.md)
- [Backups & migrations](./docs/BACKUP.md)

## Deployment (GitHub Pages)

This repository includes automatic deployment to GitHub Pages:

- CI runs first (`.github/workflows/ci.yml`).
- If CI succeeds on `main`, deployment runs (`.github/workflows/deploy.yml`).
- The workflow builds with the correct Pages base path and publishes `dist/`.

Setup is needed only once in GitHub:

1. Open **Settings → Pages**.
2. In **Build and deployment**, set **Source = GitHub Actions**.
3. Push to `main`.
4. Wait for **CI** and then **Deploy to GitHub Pages** to finish.
5. Open `https://diegominetti.github.io/AlbumPanini/`.

For full step-by-step instructions and troubleshooting, see
[GitHub Pages guide](./docs/GITHUB_PAGES.md).

## Privacy

100% local. The app never sends your data anywhere — there is no server. Exchange
and backups are file/QR based and stay under your control.

## License

[MIT](./LICENSE)
