# Architecture

## Principles

- **Offline-first, local-only.** No backend, no auth. All state lives in
  IndexedDB (via Dexie) and a small slice of preferences in `localStorage`.
- **Collection-driven.** No code is specific to any album. Collections are JSON
  packages discovered at runtime from `public/collections/index.json`.
- **Schemas as the source of truth.** Zod schemas in `src/types` define the data
  model; TypeScript types are inferred from them and the same schemas validate
  collection packages and restored backups at runtime.

## Layers

```
UI (pages/components)
      │  hooks (reactive)
      ▼
services (domain logic, pure where possible)
      │
      ▼
db (Dexie) ── stores (Zustand: settings, ui)
```

- **`db/`** — `PaniniDatabase` registers every schema version from the migration
  registry and records a persistent version history. Tables: `collections`,
  `teams`, `stickers`, `inventory`, `activity`, `meta`. Rows are namespaced per
  collection with `uid = "<collectionId>::<localId>"` so multiple (and
  duplicated) collections coexist without collisions.
- **`services/`** — all business logic. Pure modules (`statsService`,
  `filterService`, code/compression utils) are unit-tested directly; DB-touching
  services (`inventoryService`, `collectionService`, `backupService`,
  `qrService`) are tested against `fake-indexeddb`.
- **`hooks/`** — bridge DB ↔ UI. `useCollectionData` uses
  `dexie-react-hooks`' `useLiveQuery` for reactive stickers/teams/inventory and
  memoizes derived statistics. `useManifest` uses React Query for the package
  manifest.
- **`stores/`** — `settingsStore` (persisted, theme applied before first paint
  via an inline script in `index.html`) and `uiStore` (transient toasts).

## Data flow example (add a sticker)

1. `StickerCard` calls `incrementSticker(collectionId, stickerId)`.
2. `inventoryService` writes the new quantity and appends an `activity` row.
3. `useLiveQuery` notices the change and re-renders the grid, dashboard and
   statistics — all derived state recomputes automatically.

## Routing & PWA

Hash routing (`createHashRouter`) guarantees deep links work on GitHub Pages and
offline without server rewrites. The Vite PWA plugin generates the service
worker (precache + runtime caching for collections, images and Tesseract data)
and the web app manifest.

## Testing strategy

- **Unit/component (Vitest + Testing Library):** logic and reusable components.
  Coverage thresholds are enforced (`vitest.config.ts`).
- **E2E (Playwright):** full user journeys (install, inventory, bulk import,
  backup export, exchange QR, theme/language) against a production preview build.
