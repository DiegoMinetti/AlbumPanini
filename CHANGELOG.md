# Changelog

Todos los cambios notables del proyecto se documentan acá. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/), y este proyecto
adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **TL;DR para releases:** agregar una nueva sección arriba (después del
> header) con el número de versión + fecha, mover items de "Unreleased"
> a la sección de la versión, dejar "Unreleased" vacío hasta el próximo
> ciclo.

## Cómo está organizado

- **Added** — features nuevas.
- **Changed** — cambios en funcionalidad existente.
- **Deprecated** — features que se van a remover.
- **Removed** — features removidas.
- **Fixed** — bugfixes.
- **Security** — fixes de seguridad.

---

## [Unreleased]

### Planned (ver [ROADMAP.md](./ROADMAP.md))
- Reactivar sección "My QR" en `ExchangePage` (TD-001).
- Wirear `reservationStore` a la UI (TD-008).
- Sentry para error tracking (TD-013).
- E2E para `ScanPage` con fixture (TD-016).

### Added (este PR)
- `docs/CODEBASE.md` — mapa detallado del codebase, archivo por archivo.
- `docs/ROADMAP.md` — backlog priorizado con P0-P3.
- `docs/TECHNICAL_DEBT.md` — issues activos, severidad, y ADRs
  candidatos.
- `CHANGELOG.md` — este archivo.

### Changed (PR1 — fixture oficial FIFA)
- `enrichment/src/build-fixture.ts` — fechas de la fase de grupos
  reemplazadas por las oficiales FIFA (sorteo 5-dic-2025): A 11/18/24 jun,
  B 12/18/24, C 13/19/24, D 12/19/25, E-F 14/20/25, G-H 15/21/26, I 16/22/26,
  J 16/22/27, K-L 17/23/27 jun. Eliminatorias 28 jun – 19 jul.
- `enrichment/src/build-fixture.ts` — cada partido de grupo ahora trae
  `kickoff` (ISO-8601 UTC) y `kickoffTz` (IANA tz de la sede, no DST-hardcoded).
  Franjas FIFA reales: 12:00 / 15:00 / 18:00 / 21:00 hora local del estadio.
- `enrichment/src/build-fixture.ts` — agregada `tz` a `HOST_CITIES` para que
  la GitHub Action (PR2) pueda regenerar `kickoff` con offset real.
- `public/collections/worldcup-2026.json` — `tournament.matches` regenerado
  con las fechas/kickoffs oficiales. Estructura, IDs y orden de equipos
  inalterados → no rompe `tournamentService` ni el bracket UI.

---

## [1.0.0] — 2026-06-13

Baseline. La app está en `main` y deployada a GitHub Pages. Esta es la
primera versión con CHANGELOG formal; los items abajo son los más
representativos del estado actual (no exhaustivos — para el detalle
completo, ver `git log`).

### Added — Core
- **Offline-first PWA.** Service worker auto-update, manifest con 3
  iconos, runtime caching (collections SWR, images CacheFirst, tesseract
  CacheFirst).
- **IndexedDB schema (v2).** Tablas `collections`, `teams`, `stickers`,
  `inventory`, `activity`, `meta`, `scenarios`, `matchResults`,
  `knockoutPicks`. Patrón de `uid = "${collectionId}::${localId}"` para
  namespacing cross-collection.
- **Collection-driven.** Paquetes JSON con `index.json` manifest,
  validados por Zod. Bundled: World Cup 2026 (22 teams, 396 stickers),
  Pokémon 151, demo-mini.
- **M3 design system.** Tokens de color (`--md-sys-color-*`), type
  scale, elevation, motion, shape, touch target `44px`. Sin icon font
  — `Icon.tsx` con paths SVG inline.
- **i18n.** Español (default) y English, con detector pero override por
  setting persistido en `panini-settings`. Sin flash de tema
  incorrecto (pre-paint script en `index.html`).
- **Theme persistence.** Light / dark / system, aplicado antes del
  primer render.

### Added — Inventory
- **CRUD de figuritas** con `QuantityStepper` (+ long-press acceleration,
  180ms, haptic).
- **Bulk import** con paste de códigos, parser tolerante
  (`ARG 1` / `arg-1` / `ARG01` → `ARG1`).
- **OCR scanning** con Tesseract.js en Web Worker, char whitelist
  `[A-Za-z0-9 ]`. Cámara o upload.
- **Filtros & búsqueda.** Ownership (all / missing / owned / duplicates),
  team, category, rarity, free text. Chips removibles, sheet de
  filtros avanzados con `SegmentedControl` M3.
- **Vista grid / list / grouped** (tournament groups A..L) con
  expand/collapse.

### Added — Statistics
- **Dashboard** con completion global, top teams, recent activity (12),
  pie chart owned/missing, bar chart equipos y categorías, most
  repeated, heatmap, completed vs near-complete teams.
- **Statistics page** dedicada, mismo set de charts sin activity ni
  headline.
- `CollectionHeatmap` (slate → emerald → amber → red por qty).

### Added — Exchange & Sync
- **QR exchange** con `figuritas.app` text format. 3 pasos: copy my
  duplicates → paste partner list → scan QR. `computeMatch` con
  `iCanGive` / `iCanReceive` / `mutualCount` / `versionMismatch`.
- **Backup file `.albumbackup`** con gzip, magic `PANINI-BACKUP`,
  `BACKUP_VERSION=2`, stepwise migrations. Merge / Replace restore.
- **Self-healing restore** que re-descarga packages faltantes del
  manifest.
- **Sync device-to-device** por QR chunked (`SYNC_CHUNK_MAX_BYTES=1800`),
  payload compacto (tuplas, no objetos), TTL 10 min.

### Added — Tournament (World Cup style)
- **Tournament schema** en collection package (groups A..L, matches con
  stages: group / r32 / r16 / qf / sf / third / final).
- **Scenarios** (oficial + simulaciones). El oficial está protegido
  (no se puede borrar). Switcher en `ScenarioBar`.
- **Group standings** con tiebreakers FIFA (pts → GD → GF →
  head-to-head → teamId), best-third ranking.
- **Bracket resolver** recursivo, memoizado, con guards de ciclo. Slots
  `"1A"`, `"T3"`, `"W73"`, `"L101"`.
- **Score editing** con `MatchScoreRow` (goles + penalties para
  knockout).
- **Knockout picks** con override manual (`KnockoutMatchRow`).

### Added — DX & Tooling
- **TypeScript estricto** con path alias `@/*` → `src/*`.
- **ESLint 9 flat** + Prettier 3.
- **Vitest 2** + Testing Library + jsdom + `fake-indexeddb` con
  coverage thresholds (80/80/75/80).
- **Playwright 1.49** con projects Chromium y mobile-chrome (Pixel 7).
- **GitHub Actions CI** (Node 24): format, lint, typecheck, tests +
  coverage, build, E2E. **Deploy** a GitHub Pages con
  `VITE_BASE_PATH` automático + `404.html` fallback para SPA.
- **Subproyecto `enrichment/`** (pnpm) — pipeline offline con
  Wikidata + Wikipedia para generar `worldcup-2026.json` con datos
  reales.

### Added — UI Components (M3)
- `AppLayout`, `TopBar` (center-aligned, frosted glass), `BottomNav`
  (con indicator flotante animado), `NavigationRail`.
- `Modal` (variant sheet/dialog, drag handle), `ConfirmDialog`,
  `PromptModal`, `Fab` (primary/tonal/surface, bottom-end/center,
  extended).
- `SegmentedControl`, `StatCard`, `ProgressBar`, `EmptyState`,
  `Spinner`, `ToastViewport` (Snackbar M3 inverse-surface).
- `PwaInstallPrompt` (Chrome/Android `beforeinstallprompt` + iOS Safari
  modal), `PwaUpdatePrompt` (`useRegisterSW`).
- `StickerCard`, `QuantityStepper`, `StickerGrid`, `StickerGroups`,
  `StickerDetailModal`, `BulkImportModal`, `FilterBar`, `FilterSheet`,
  `FilterChips`, `SearchBar`.
- `CollectionHeatmap`.

### Changed
- `vite-plugin-pwa` con `autoUpdate`.
- Manual chunks en Vite: `react`, `charts`, `ocr`, `qr` (aíslan
  pesos pesados).
- Migración de GitHub Actions a Node.js 24.

### Fixed (más relevantes)
- `defaultCollectionSeeded` corregido para evitar re-seeding (TD-002
  parcialmente).
- `dismissTransientUi` para limpiar UI overlapping antes de
  interacciones (FAB / modals).
- z-index del FAB ajustado (`z-30 bottom-24` vs toasts en `z-50
  bottom-20`).
- Force expand al search en `StickerGroups`.
- `404.html` fallback para GitHub Pages SPA.
- Base path con trailing slash enforced.

### Known issues (ver [TECHNICAL_DEBT.md](./TECHNICAL_DEBT.md))
- **TD-001** mismatch entre `data-testid="exchange-qr"` (test) y la
  sección "My QR" comentada en `ExchangePage.tsx`.
- **TD-002** `defaultCollectionSeeded` corre en cada launch (race
  condition edge case).
- **TD-003/004/005/007** varios archivos > 17 KB candidatos a refactor.
- **TD-008** `reservationStore` implementado pero no consumido.
- **TD-013** cero observabilidad (Sentry pendiente).
- **TD-016** `ocrService` y `utils/file.ts` excluidos del coverage sin
  E2E que los cubra.

---

## Cómo versionar

1. Rompiste la API / DB schema? → **MAJOR** (X.0.0).
2. Agregaste feature backwards-compatible? → **MINOR** (0.X.0).
3. Bugfix backwards-compatible? → **PATCH** (0.0.X).

**Reglas del proyecto:**
- MAJOR bump si: `BACKUP_VERSION` cambia, o schema DB cambia (nueva
  entry en `src/db/migrations.ts`).
- MINOR bump si: nueva página, nuevo servicio, nuevo componente UI
  reusable.
- PATCH bump si: bugfix, refactor sin cambio de comportamiento, mejora
  de performance.

El deploy workflow setea `VITE_APP_VERSION=${GITHUB_SHA}`. El CHANGELOG
es la fuente humana de la verdad; el SHA es la fuente de auditoría.
