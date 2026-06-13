# Codebase Map

> Mapa detallado del repo. Una visión por archivo de qué hace, qué exporta, y
> quién lo consume. Complementa a [`ARCHITECTURE.md`](./ARCHITECTURE.md) (que
> describe la filosofía y los patrones) con el detalle concreto que necesitás
> para navegar el código.

## Índice

- [1. Visión general](#1-visión-general)
- [2. Stack técnico](#2-stack-técnico)
- [3. `src/app/` — Bootstrap](#3-srcapp--bootstrap)
- [4. `src/db/` — IndexedDB y migraciones](#4-srcdb--indexeddb-y-migraciones)
- [5. `src/services/` — Lógica de negocio](#5-srcservices--lógica-de-negocio)
- [6. `src/hooks/` — Capa React reactiva](#6-srchooks--capa-react-reactiva)
- [7. `src/stores/` — Estado global (Zustand)](#7-srcstores--estado-global-zustand)
- [8. `src/types/` — Schemas Zod (single source of truth)](#8-srctypes--schemas-zod-single-source-of-truth)
- [9. `src/utils/` — Helpers puros](#9-srcutils--helpers-puros)
- [10. `src/pages/` — Pantallas / rutas](#10-srcpages--pantallas--rutas)
- [11. `src/components/` — Inventario UI](#11-srccomponents--inventario-ui)
- [12. `src/i18n/` — Internacionalización](#12-src18n--internacionalización)
- [13. `src/tests/` — Setup y helpers de test](#13-srctests--setup-y-helpers-de-test)
- [14. `public/collections/` — Paquetes de catálogo](#14-publiccollections--paquetes-de-catálogo)
- [15. `scripts/` — Generadores offline](#15-scripts--generadores-offline)
- [16. `.github/workflows/` — CI/CD](#16-githubworkflows--cicd)
- [17. Configs de build](#17-configs-de-build)
- [18. `enrichment/` — Pipeline de datos](#18-enrichment--pipeline-de-datos)
- [19. `tests/e2e/` — Specs Playwright](#19-teste2e--specs-playwright)
- [20. Patrones transversales](#20-patrones-transversales)
- [21. Glosario de dependencias](#21-glosario-de-dependencias)

---

## 1. Visión general

| Concepto | Implementación |
| --- | --- |
| Lenguaje | TypeScript 5.7 estricto, `type: module` |
| UI | React 18 + React Router 6 (hash routing) + Tailwind 3 (tokens M3) |
| Persistencia local | IndexedDB vía Dexie 4 + `dexie-react-hooks` |
| Estado cliente | Zustand 5 con middleware `persist` (localStorage) |
| Data fetching servidor | TanStack Query 5 (sólo para el `manifest`) |
| Validación runtime | Zod 3 en **todas** las entidades |
| OCR | Tesseract.js 5 en Web Worker (cacheado en SW) |
| QR | `qrcode` (encode) + `jsqr` (decode) + `pako` (gzip) + base64url |
| Charts | Recharts 2 (pie + bar) |
| Haptics | `navigator.vibrate` envuelto |
| PWA | `vite-plugin-pwa` (Workbox) con `registerType: 'autoUpdate'` |
| Tests | Vitest 2 + Testing Library + jsdom + `fake-indexeddb` + Playwright 1.49 |

AlbumPanini es una **PWA offline-first** para gestionar colecciones de
figuritas. No hay backend, no hay login, no hay cloud. La identidad del
usuario es el dispositivo.

---

## 2. Stack técnico

Resumen rápido de los archivos de configuración raíz:

- **`package.json`** — Dependencias y scripts (`dev`, `build`, `test`,
  `test:coverage`, `test:e2e`, `lint`, `format`, `typecheck`, `icons`,
  `collections`).
- **`tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json`** — Tres
  proyectos TS (app, node scripts, build config). Path alias `@/*` → `src/*`.
- **`vite.config.ts`** — Alias `@`, base path configurable vía
  `VITE_BASE_PATH`, plugin PWA con Workbox (cache de collections SWR, images
  CacheFirst, tesseract CacheFirst), manual chunks para `react`, `charts`,
  `ocr`, `qr`.
- **`vitest.config.ts`** — Hereda config de Vite, env `jsdom`, coverage con
  thresholds `lines 80% / functions 80% / branches 75% / statements 80%`.
  Excluye `ocrService.ts` y `utils/file.ts` (cubiertos por E2E).
- **`tailwind.config.ts`** — Tema M3 con CSS vars (`--md-sys-color-*`),
  type scale, elevations, motion, shape, touch target `44px`.
- **`eslint.config.js`** — Flat config con TypeScript-ESLint, React Hooks,
  Prettier.
- **`playwright.config.ts`** — Proyectos `chromium` y `mobile-chrome (Pixel
  7)`, retries 2 en CI, webServer hace build con `VITE_BASE_PATH=/` y sirve
  con `vite preview --port 4173`.

---

## 3. `src/app/` — Bootstrap

Punto de entrada. Conecta providers y define el árbol de rutas.

### `App.tsx`
- **Responsabilidad:** Shell. Monta `QueryClientProvider` + `RouterProvider`
  + `ToastViewport` + `PwaInstallPrompt` + `PwaUpdatePrompt`.
- **Side effects de primer launch:** cuenta el app launch
  (`registerAppLaunch`) y dispara `seedDefaultCollection` para instalar
  World Cup 2026 si no existe (gateado por `defaultCollectionSeeded`).
- **Consumido por:** `src/main.tsx`.

### `router.tsx`
- **Responsabilidad:** árbol de rutas con `createHashRouter` (funciona en
  GitHub Pages sin server rewrite).
- **Rutas:** `/` (Dashboard), `/stickers`, `/tournament`, `/stats`,
  `/exchange`, `/scan`, `/collections`, `/backup`, `/settings`,
  `/donations`, `*` (NotFound).
- **Layout único:** `AppLayout` envuelve todas las rutas con `<Outlet />`.

### `queryClient.ts`
- **Responsabilidad:** singleton de TanStack Query.
- **Config:** `staleTime: 5 min`, `gcTime: 30 min`, `refetchOnWindowFocus:
  false`.

### `main.tsx`
- **Responsabilidad:** entry real. `createRoot` + `StrictMode`. Side-effect
  imports: `index.css`, `i18n`.

---

## 4. `src/db/` — IndexedDB y migraciones

### `database.ts`
- **Responsabilidad:** clase `PaniniDatabase extends Dexie` con 8 tablas
  tipadas. En `populate` siembra `meta` con `installedAt` +
  `dbVersionHistory`.
- **Métodos:** `clearAllData()` (borra todo, usado por `restore` en modo
  `replace`), `getVersionHistory()` (lee historial persistido).
- **Tablas:**

  | Tabla | PK | Índices |
  | --- | --- | --- |
  | `collections` | `id` | `status, updatedAt, sourceId` |
  | `teams` | `uid` | `collectionId` |
  | `stickers` | `uid` | `collectionId, normalizedCode, teamId, category, rarity, type` |
  | `inventory` | `uid` | `collectionId, stickerId, updatedAt` |
  | `activity` | `++id` | `collectionId, timestamp, kind` |
  | `meta` | `key` | — |
  | `scenarios` | `id` | `collectionId, isOfficial, updatedAt` |
  | `matchResults` | `uid` | `scenarioId, matchId` |
  | `knockoutPicks` | `uid` | `scenarioId, slot` |

### `migrations.ts`
- **Responsabilidad:** registro `DbMigration[]`. Versión actual **2**:
  - **v1:** collections / teams / stickers / inventory / activity / meta.
  - **v2:** agrega scenarios / matchResults / knockoutPicks.
- `LATEST_DB_VERSION` se calcula del array.
- **Regla:** nunca editar una entrada ya publicada, siempre **append**.

### `index.ts`
- Barrel que re-exporta `database` y tipos.

### Patrón `uid`
- Las filas de `teams`, `stickers`, `inventory`, `matchResults`,
  `knockoutPicks` usan como PK un string
  `${collectionId}::${localId}` (constante `UID_SEP = '::'` en
  `utils/ids.ts`).
- Esto namespacia por colección y permite múltiples colecciones coexistentes
  con los mismos `id` locales. También permite duplicar colecciones sin
  colisiones (la duplicación re-mapea uids al nuevo `collectionId`).
- Helpers: `makeUid(cid, localId)`, `splitUid(uid)`, `generateId(prefix)`.

### `database.test.ts`
- Tests del schema contra `fake-indexeddb`.

---

## 5. `src/services/` — Lógica de negocio

Corazón de la app. Funciones puras donde es posible (testables directo),
servicios con DB testados contra `fake-indexeddb`.

### `collectionService.ts`
CRUD de colecciones. Operaciones atómicas con transacciones Dexie.

| Export | Notas |
| --- | --- |
| `listCollections(includeArchived?)` | Ordena por `updatedAt` desc. |
| `getCollection(id)` | |
| `getTeams(cid)` / `getStickers(cid)` | |
| `renameCollection(id, name)` | Valida no-vacío. |
| `setCollectionIncludeExtras(id, boolean)` | Toggle de variantes foil. |
| `setCollectionStatus(id, 'active'\|'archived')` | |
| `duplicateCollection(srcId, {name?, includeInventory?})` | Re-mapea uids al nuevo id. |
| `deleteCollection(id)` | Cascada manual a teams/stickers/inventory/activity/scenarios/matchResults/knockoutPicks. |

**Consumido por:** `CollectionsPage`, `SettingsPage` (indirecto), tests.

### `collectionLoader.ts`
Carga dinámica de paquetes JSON desde `public/collections/`, valida con Zod,
instala en la DB.

| Export | Notas |
| --- | --- |
| `fetchManifest(signal?)` | Devuelve `CollectionManifestEntry[]`; 404 → `[]`. |
| `fetchPackage(entry, signal?)` | Devuelve `CollectionPackage`. |
| `packageToRows(pkg, cid, now?)` | Puro. Devuelve `{ collection, teams, stickers }`. |
| `installPackage(pkg, {collectionId?, resetInventory?})` | Crea/actualiza, preserva inventory. |
| `isInstalled(cid)` | |
| `seedDefaultCollection(signal?)` | Instala `worldcup-2026` si no está. |
| `DEFAULT_COLLECTION_ID` | `'worldcup-2026'`. |

**Consumido por:** `App.tsx`, `CollectionsPage`, `useManifest`.

### `inventoryService.ts`
Operaciones de inventario + activity log (cap a 200 entradas por colección).

| Export | Notas |
| --- | --- |
| `getInventory(cid)` | |
| `getInventoryMap(cid)` | Devuelve `Map<stickerId, qty>`. |
| `setQuantity(cid, sid, qty, kind?)` | Clamp ≥ 0. |
| `adjustQuantity(cid, sid, delta)` | Delta +1 / -1. |
| `incrementSticker` / `decrementSticker` | Wrappers. |
| `addByCodes(cid, codes[], kind?)` | Bulk import / OCR. Devuelve `BulkApplyReport`. |
| `resetInventory(cid)` | |
| `getRecentActivity(cid, limit?)` | |

`ActivityEntry` kinds: `'add' \| 'remove' \| 'set' \| 'bulk-import' \|
'qr-import' \| 'ocr-add' \| 'reset'`.

**Consumido por:** `BulkImportModal`, `StickersPage`, `ScanPage`,
`ExchangePage`, `SettingsPage`, `useRecentActivity`.

### `statsService.ts`
Funciones puras sobre `(stickers, teams, inventory)`. Sin DB, sin React →
memoizables.

| Export | Devuelve |
| --- | --- |
| `computeOverview(stickers, inventory)` | `CollectionStats` |
| `computeTeamStats(stickers, teams, inventory)` | `TeamStats[]` (ordenado desc por completion) |
| `computeCategoryStats(stickers, inventory)` | `CategoryStats[]` |
| `computeMostRepeated(stickers, inventory, limit?)` | `RepeatedSticker[]` (qty > 1) |
| `computeLeastCommon(stickers, inventory, limit?)` | `RepeatedSticker[]` (qty === 1) |
| `computeStatistics(stickers, teams, inventory, opts?)` | `FullStatistics` (agregador) |

**Consumido por:** `useCollectionData`, `DashboardPage`, `StatisticsPage`.

### `filterService.ts`
Filtrado + agrupación del sticker browser. Puro.

| Export | Notas |
| --- | --- |
| `OwnershipFilter` | `'all' \| 'missing' \| 'owned' \| 'duplicates'`. |
| `StickerFilter` | `{ ownership, search, teamId, category, rarity }`. |
| `DEFAULT_FILTER` | |
| `filterStickers(stickers, inventory, filter)` | Puro, sync. |
| `isExtraSticker(sticker)` | `type === 'shiny'`. |
| `sortByAlbumOrder(stickers)` | Por campo `order`. |
| `distinctCategories(stickers)` / `distinctRarities(stickers)` | |
| `INTRO_GROUP` / `WFC_GROUP` / `SPECIAL_GROUP` | `'__intro__' \| '__wfc__' \| '__special__'`. |
| `groupStickers(stickers, teams)` | Un nivel. |
| `TGROUP_KEY_PREFIX` | `'tgroup-'`. |
| `groupStickersByTournament(stickers, teams, groups?)` | Dos niveles: groups A..L → countries. |
| `ownedInGroup(group, inventory)` | |
| `sectionTotals(section, inventory)` | `{ owned, total }`. |
| `sectionKeys(sections)` | Para expand/collapse-all. |

**Consumido por:** `StickersPage`, `StickerGroups`.

### `ocrService.ts`
OCR local con Tesseract.js. Worker lazy singleton, char whitelist
`[A-Za-z0-9 ]`.

| Export | Notas |
| --- | --- |
| `recognizeCodes(image)` | Devuelve `{ text, confidence, codes, normalizedCodes }`. |
| `terminateOcr()` | Libera worker. |

**Consumido por:** `ScanPage`.

### `qrService.ts`
Intercambio de figuritas vía QR. Compacta inventory a gzipped base64url.

| Export | Notas |
| --- | --- |
| `buildOwnPosition(cid)` | |
| `positionToPayload(position, name?)` | |
| `encodeExchange(payload)` / `decodeExchange(text)` | Zod-validado. |
| `generateExchangeQr(payload, {size?})` | Devuelve PNG data URL. |
| `computeMatch(mine, theirs)` | Devuelve `ExchangeMatch` con `iCanGive`, `iCanReceive`, `mutualCount`, `versionMismatch`. |
| `scanQrFromImageData(image: ImageData)` | |

**Consumido por:** `ExchangePage`.

### `backupService.ts`
Backup completo de la app en archivo `.albumbackup` (gzip + JSON).

| Export | Notas |
| --- | --- |
| `createBackupPayload(settings)` | |
| `exportBackup(settings)` | Devuelve `Blob`. |
| `backupFilename(date?)` | `panini-YYYY-MM-DD-HH-MM-SS.albumbackup`. |
| `migrateBackup(raw)` | Escalonado. |
| `parseBackupFile(bytes)` | |
| `restoreBackup(payload, {mode?, migratedFrom?})` | `mode: 'replace' \| 'merge'`. |
| `BACKUP_VERSION` | `2`. |
| `BACKUP_EXTENSION` | `.albumbackup`. |
| `BACKUP_MAGIC` | `PANINI-BACKUP`. |

**Self-healing:** `restoreBackup` llama a `hydrateMissingTournaments` que
re-descarga el package del manifest para colecciones con `tournament`
faltante.

**Consumido por:** `BackupPage`.

### `scenarioService.ts`
CRUD de scenarios (oficial + simulaciones) y sus results/picks.

| Export | Notas |
| --- | --- |
| `listScenarios(cid)` | Oficial primero. |
| `getScenario(id)` | |
| `ensureOfficialScenario(cid)` | Idempotente. |
| `createScenario(cid, name, copyFromId?)` | Default name 'Simulación'. |
| `renameScenario(id, name)` | |
| `deleteScenario(id)` | Rechaza borrar el oficial. |
| `getResults(scenarioId)` / `getPicks(scenarioId)` | |
| `setScore(scenarioId, matchId, {homeGoals, awayGoals, homePens?, awayPens?})` | `null/null` → borra. |
| `setKnockoutPick(scenarioId, slot, teamId \| null)` | |

**Consumido por:** `useTournament`, `ScenarioBar`, `MatchScoreRow`,
`KnockoutMatchRow`.

### `tournamentService.ts`
Lógica de torneo **pura** (sin DB). Group standings con tiebreakers FIFA,
best-third ranking, bracket resolver recursivo.

| Export | Notas |
| --- | --- |
| `computeGroupStandings(group, matches, results)` | Tiebreakers: pts → GD → GF → head-to-head → teamId. |
| `computeAllStandings(groups, matches, results, bestThirdsCount)` | `{ byGroup, bestThirds }`. |
| `winnerOf(home, away, result)` | Con penalties. |
| `BracketResolver` | `{ resolveSlot, resolveMatch }`. |
| `createBracketResolver(matches, standings, results, picks)` | Memoizado, con guards de ciclo. |

**Slots soportados:** `"1A"` (rank group), `"T3"` (best third idx 3),
`"W73"` (winner match 73), `"L101"` (loser).

**Consumido por:** `useTournament`, `GroupsView`, `BracketView`.

### `figuritasAppParser.ts` + `figuritasAppMatcher.ts`
Parser y matcher para el formato de texto `figuritas.app` (líneas
`PREFIX <emoji>: n,n,n`).

**Parser exports:**
- `parseFiguritasAppList(input)` → `{ lines, entries: {prefix, number}[] }`.
- `candidateCodes(prefix, number)` → `string[]` (ej. `USA15`, `USA015`,
  `15`, `015`).
- `buildDuplicatesList({stickers, teams, inventory, wfcEmoji?})` → `{ groups,
  text }` (inverso: genera el texto para compartir).

**Matcher exports:**
- `matchFiguritasAppList(cid, text)` → `FiguritasAppMatchResult` con
  `iCanGive`, `iNeed`, `iOwn`, `unresolved`, `byLine`.

**Consumido por:** `ExchangePage` (parse + match + buildDuplicates para
copiar al portapapeles).

### `syncService.ts`
Sync device-to-device por QR (deep-link). Payload compacto (tuplas, no
objetos).

| Export | Notas |
| --- | --- |
| `buildSyncPayload(settings)` | Omite sticker/team meta. |
| `encodeSync(payload)` / `decodeSync(text)` | gzip + base64url + Zod. |
| `chunkSync(encoded)` | `SYNC_CHUNK_MAX_BYTES=1800`. |
| `resolveSyncBaseUrl()` | `'${origin}${BASE_URL}#/backup'`. |
| `buildSyncUrl({sid, idx, total, data})` | Query params en el hash. |
| `renderSyncQr(text, {size?, dark?, light?})` | |
| `parseSyncUrl(url)` / `readSyncFromLocation()` | |
| `recordSyncChunk(link)` | Acumula chunks (TTL 10 min). |
| `clearSyncSession()` / `assembleSyncChunks(session)` | |
| `applySyncPayload(payload, {mode?, ignoreSettings?})` | `mode: merge\|replace`. |
| `applySyncPayloadWithSettings(payload, applySettings, opts?)` | |

**Consumido por:** `BackupPage`.

### `index.ts`
Barrel: re-exports como namespaces
(`export * as collectionService from './collectionService'`).

---

## 6. `src/hooks/` — Capa React reactiva

| Hook | Qué hace |
| --- | --- |
| `useCollections()` | `useLiveQuery` sobre `db.collections.orderBy('updatedAt').reverse()`. |
| `useCollection(id)` | `useLiveQuery` para una colección puntual. |
| `useCollectionData(cid)` | Agrega stickers + teams + inventory + `computeStatistics`. Filtra extras foil si `includeExtras === false`. Devuelve `{ stickers, teams, inventory: Map, statistics: FullStatistics, loading }`. |
| `useActiveCollection()` | Resuelve activa desde `settingsStore` con self-healing (si el id guardado ya no existe → fallback a la más reciente active). Devuelve `{ collections, active, activeId, setActive, loading }`. |
| `useManifest()` | `useQuery` con `staleTime: 1h`, `retry: 1` para `fetchManifest`. |
| `useRecentActivity(cid, limit=20)` | `useLiveQuery` sobre `db.activity` ordenado por timestamp desc. |
| `useTournament(cid)` | Carga `collection.tournament`, scenarios (auto-ensure official), results, picks → calcula `standings` y `resolver`. Devuelve `{ tournament, scenarios, activeScenarioId, activeScenario, results: Map, picks: Map, standings, resolver, loading }`. |

**Patrón:** la mayoría usa `dexie-react-hooks/useLiveQuery` para reactividad
directa sobre la DB. `useManifest` es la excepción (usa TanStack Query
porque es fetch HTTP).

---

## 7. `src/stores/` — Estado global (Zustand)

Todos usan `create(persist(...))` con un **`safeStorage`** propio que combina
`localStorage` + un `Map` en memoria (fallback para SSR, jsdom, modo
privado).

### `settingsStore.ts`
- **Storage key:** `panini-settings`, version `1`.
- **State:** `Settings` (Zod) + acciones `setTheme`, `setLanguage`,
  `toggleHaptics`, `setStickerView`, `setActiveCollection`, `setShowImages`,
  `setStickerGrouped`, `setEditMode`, `registerAppLaunch`,
  `markDonationLinkOpened`, `markDefaultCollectionSeeded`, `applySettings`.
- **Helpers exportados:** `resolveDark(theme)` (true si dark o
  system+prefers-color-scheme:dark), `applyThemeSideEffects(settings)`
  (aplica `class="dark"`, `lang`, haptics).
- En `onRehydrateStorage` reaplica los side-effects → no hay flash.
- `index.html` tiene un **pre-paint script inline** que lee el mismo
  storage y aplica `class="dark"` antes del primer render.

### `uiStore.ts`
- **Toasts:** `{ id, kind: 'success'|'error'|'info'|'warning', message,
  duration }`. Auto-dismiss con `setTimeout`.
- **API imperativa:** `toast.success/error/info/warning(msg)` (sin hook).

### `scenarioStore.ts`
- `activeByCollection: Record<collectionId, scenarioId>`. Acciones:
  `setActiveScenario`, `getActiveScenario`.

### `reservationStore.ts`
- **Reservas de figuritas** para un partner comercial. Modelo:
  `Reservation { collectionId, stickerId, partner, count, code,
  displayPrefix, emoji, createdAt }` con key compuesta.
- Acciones: `addReservation` (acumula count si ya existe para el mismo
  partner), `removeReservation`, `clearForCollection`, `clearAll`.
- Helpers: `totalReservedFor(reservations, cid, sid)`, `isReserved(...)`.
- **Estado:** implementado, no consumido actualmente. Reservado para un
  flow futuro de "marcar figurita para María" persistente cross-session.

---

## 8. `src/types/` — Schemas Zod (single source of truth)

Patrón: Zod define el schema en runtime, los TypeScript types se infieren
con `z.infer<>`. Esto es lo que hace que un package de
`public/collections/` inválido falle limpio con `parse()`.

| Archivo | Schemas / tipos clave |
| --- | --- |
| `collection.ts` | `hexColorSchema`, `KNOWN_RARITIES`, `teamSchema`, `stickerSchema`, `collectionMetaSchema`, `collectionPackageSchema`, `collectionManifestEntrySchema`, `collectionManifestSchema`, `CollectionStatus`, interfaces `StoredCollection`, `StoredTeam`, `StoredSticker`. |
| `inventory.ts` | `inventoryItemSchema`, `StoredInventoryItem`, `activityKindSchema`, `ActivityEntry`. |
| `settings.ts` | `themeModeSchema`, `languageSchema` (`es`\|`en`), `stickerViewSchema`, `settingsSchema`, `Settings`, `DEFAULT_SETTINGS`. |
| `backup.ts` | `BACKUP_VERSION=2`, `BACKUP_EXTENSION`, `BACKUP_MAGIC`, `backupMatchResultSchema`, `backupKnockoutPickSchema`, `backupScenarioSchema`, `backupCollectionSchema`, `backupPayloadSchema`, `BackupPayload`, `RestoreSummary`. |
| `exchange.ts` | `EXCHANGE_VERSION=1`, `exchangePayloadSchema` (claves cortas `v/c/cv/n/d/m`), `ExchangePayload`, `ExchangeMatch`. |
| `sync.ts` | `SYNC_VERSION=1`, `SYNC_CHUNK_MAX_BYTES=1800`, `SYNC_CHUNK_MAGIC='PSNC'`, `syncCollectionSchema`, `syncPayloadSchema`, `SyncChunk`, `SyncSessionInfo`. |
| `tournament.ts` | `GROUP_IDS` (A..L), `groupSchema`, `MATCH_STAGES` (`group`, `r32`, `r16`, `qf`, `sf`, `third`, `final`), `matchStageSchema`, `tournamentMatchSchema`, `tournamentSchema`, tipos `TournamentGroup`, `TournamentMatch`, `Tournament`. |
| `scenario.ts` | `StoredScenario`, `StoredMatchResult` (con `homePens`/`awayPens`), `StoredKnockoutPick`. |
| `stats.ts` | `CollectionStats`, `TeamStats`, `RepeatedSticker`, `CategoryStats`, `FullStatistics` (todos derivan, no se persisten). |

---

## 9. `src/utils/` — Helpers puros

| Archivo | Exports principales |
| --- | --- |
| `ids.ts` | `UID_SEP`, `makeUid(cid, localId)`, `splitUid(uid)`, `generateId(prefix='col')` (usa `crypto.randomUUID` con fallback). |
| `code.ts` | `normalizeCode(raw)`, `parseCode(raw)`, `extractCodes(input)` — normalizan "ARG 1" / "arg-1" / "ARG01" a "ARG1". |
| `compression.ts` | `gzipJson`, `gunzipJson`, `bytesToBase64Url`, `base64UrlToBytes`, `encodeCompact`, `decodeCompact` (gzip + base64url). |
| `file.ts` | `downloadBlob(blob, filename)`, `readFileAsBytes(file)`, `readFileAsText(file)`, `imageToImageData(source, maxDim=1024)`, `loadImageFromBlob(blob)`. |
| `format.ts` | `formatPercent`, `clamp`, `formatRelativeTime(timestamp, locale='en', now?)`. |
| `haptics.ts` | `setHapticsEnabled(boolean)` + objeto `haptics { light, tick, medium, success, warning, error, selection }`. |

---

## 10. `src/pages/` — Pantallas / rutas

| Página | Ruta | Qué hace | Servicios/hooks clave |
| --- | --- | --- | --- |
| `DashboardPage.tsx` | `/` | Vista resumen: completion global, stats cards, top 6 equipos, recent activity (12), pie chart owned/missing, bar chart equipos top 12, bar chart categorías, most repeated, completed vs near-complete teams, heatmap. | `useActiveCollection`, `useCollectionData`, `useRecentActivity`, recharts. |
| `StickersPage.tsx` | `/stickers` | Sticker browser principal. Filtros (search + ownership + team + category + rarity), vista grid/list, vista grouped (tournament groups A..L), edit mode toggle, lock/unlock, expand/collapse all, FAB → `BulkImportModal`, detail modal, chips removibles. | `useActiveCollection`, `useCollectionData`, `filterService`, `inventoryService`, `haptics`. |
| `TournamentPage.tsx` | `/tournament` | Tab Groups / Bracket. Renderiza `ScenarioBar` + `GroupsView` o `BracketView`. | `useActiveCollection`, `useCollectionData`, `useTournament`. |
| `StatisticsPage.tsx` | `/stats` | Mismo set de charts que Dashboard pero sin actividad ni headline, dedicado a la foto numérica. | `useActiveCollection`, `useCollectionData`. |
| `ExchangePage.tsx` | `/exchange` | Flujo de 3 pasos: 1) Copy my duplicates al portapapeles (`buildDuplicatesList`), 2) Paste partner list (`matchFiguritasAppList`) + compare column con chips tap-to-select, 3) Scan QR (input texto + upload imagen → `scanQrFromImageData` → `decodeExchange` → `computeMatch`). Confirmar trade aplica `adjustQuantity` ±1. La sección "My QR" está deshabilitada (código comentado). | `useActiveCollection`, `useCollectionData`, `qrService`, `figuritasAppParser`, `figuritasAppMatcher`, `inventoryService`. |
| `ScanPage.tsx` | `/scan` | Cámara (`getUserMedia({video: {facingMode: 'environment'}})`) + upload de imagen → Tesseract (`recognizeCodes`) → muestra códigos detectados → `addByCodes` con kind `'ocr-add'`. Libera cámara y worker OCR en unmount. | `useActiveCollection`, `ocrService`, `inventoryService`, `haptics`. |
| `CollectionsPage.tsx` | `/collections` | Lista de colecciones active/archived + catálogo `available` (del manifest). Acciones: select, rename, duplicate, archive/unarchive, delete, toggle `includeExtras`. | `useCollections`, `useManifest`, `useSettingsStore`, `collectionService`, `collectionLoader`. |
| `BackupPage.tsx` | `/backup` | Tres secciones: Export (`.albumbackup`), Import (mode merge/replace + file picker), Sync device-to-device (genera QR chunked, copia URL, recibe scan → `SyncReceiveDialog`). Detecta `?sync=…` en el hash. | `useSettingsStore`, `backupService`, `syncService`, `useSearchParams`. |
| `SettingsPage.tsx` | `/settings` | Toggles theme/language/haptics/showImages (SegmentedControl M3 + Switch custom), link a Collections/Donations, botón `Reset Inventory` (ConfirmDialog), about con APP_VERSION + LATEST_DB_VERSION + history colapsable. | `useSettingsStore`, `useActiveCollection`, `useLiveQuery`, `LATEST_DB_VERSION`. |
| `DonationsPage.tsx` | `/donations` | Datos Mercado Pago hardcoded (alias, CVU, nombre) con botones copy-to-clipboard. | `toast`. |
| `NotFoundPage.tsx` | `*` | EmptyState "404" con link a `/`. | — |

---

## 11. `src/components/` — Inventario UI

### `layout/` (4)
- **`AppLayout.tsx`** — Shell con TopBar, `<main>`, BottomNav (móvil),
  NavigationRail (≥md). Padding bottom 64px+safe-area en móvil, padding-left
  100px en desktop para el rail.
- **`TopBar.tsx`** — M3 CenterAlignedTopAppBar (64dp) con título dinámico,
  subtítulo = active collection, links a backup/settings. Frosted glass con
  surface-tint al scrollear. `useTopbarHeightVar` publica la altura real en
  `--app-topbar-h`.
- **`BottomNav.tsx`** — M3 NavigationBar 80dp inferior, indicator flotante
  M3 (pill que se desliza con transform/width), blink aleatorio en
  `/donations`. Items: Dashboard, Stickers, Tournament, Exchange,
  Donations.
- **`NavigationRail.tsx`** — M3 NavigationRail vertical para ≥md (mismos 5
  items, indicator vertical).

### `ui/` (7 + 3 tests)
- **`Icon.tsx`** — Set M3 inline SVG (`IconName` union). Path data embebido,
  sin icon font. Tam: 12–24px.
- **`Modal.tsx`** — M3 dialog/sheet polimórfico con variant `'sheet'`
  (default) o `'dialog'`. Drag handle, footer, subtitle opcional, close
  icon.
- **`ConfirmDialog.tsx`** — Wrapper sobre Modal con `danger` flag.
- **`PromptModal.tsx`** — Input con optional checkbox (usado en duplicate
  con `includeProgress`).
- **`Fab.tsx`** — M3 FAB con variant `primary/tonal/surface`, position
  `bottom-end/bottom-center`, extended (icon+label) o solo icon. Haptic en
  click.
- **`ProgressBar.tsx`** — M3 Linear Progress Indicator (4dp). Unit test.
- **`SegmentedControl.tsx`** — M3 segmented button con indicator animado.
  Genérico `<T extends string>`. Haptic en change. Unit test.
- **`StatCard.tsx`** — M3 stat card con accent `success/warning/danger`.
  Unit test.

### `stickers/` (10 + 2 tests)
- **`StickerCard.tsx`** — Tarjeta M3 con código, nombre, colores del team,
  fallback image, quantity stepper. Memo.
- **`QuantityStepper.tsx`** — + / − con long-press acceleration (180ms),
  haptic. Unit test.
- **`StickerGrid.tsx`** — Vista flat (grid o list, configurable).
- **`StickerGroups.tsx`** — Vista agrupada por tournament (A..L), renderiza
  collapsible sections.
- **`StickerDetailModal.tsx`** — Detalle de una figurita (open desde card
  click).
- **`BulkImportModal.tsx`** — M3 bottom sheet para pegar códigos. Llama
  `addByCodes`.
- **`FilterBar.tsx`**, **`FilterSheet.tsx`**, **`FilterChips.tsx`** —
  Search + tabs de ownership + filtros avanzados en sheet.
- **`SearchBar.tsx`** — Input M3 de búsqueda.

### `stats/`
- **`CollectionHeatmap.tsx`** — Heatmap compacto (1 celda por sticker, color
  por qty: slate → emerald → amber → red). 42 líneas, sin test.

### `feedback/` (5 + 1 helper)
- **`ToastViewport.tsx`** — M3 Snackbar high-emphasis (inverse-surface). Lee
  de `useUiStore`.
- **`PwaInstallPrompt.tsx`** — M3 Snackbar. Detecta `beforeinstallprompt`
  (Chrome/Android) → botón "Instalar" → `prompt()`. iOS Safari → modal con
  instrucciones paso a paso. sessionStorage para no repetir.
- **`PwaUpdatePrompt.tsx`** — Usa `useRegisterSW` (virtual:pwa-register).
  Banner con "Reload" + "Dismiss".
- **`EmptyState.tsx`** — M3 empty state (icon + title + description +
  action). Usadísimo.
- **`Spinner.tsx`** — Spinner simple con border-t-brand-600.
- **`pwaDetection.ts`** (helper puro) — `isStandaloneDisplay()`,
  `isIosSafari()`, type `BeforeInstallPromptEvent`.

### `collections/`
- **`NoActiveCollection.tsx`** — EmptyState con CTA a `/collections`. Se
  renderiza cuando no hay `active`.

### `backup/`
- **`SyncReceiveDialog.tsx`** — Modal que se abre cuando llega un sync QR.
  Muestra counts (collections/items/scenarios/settings), warning de missing
  collections, SegmentedControl merge/replace, apply/cancel.

### `tournament/` (7)
- **`ScenarioBar.tsx`** — Switcher + new scenario + delete (oficial
  protegido). PromptModal + ConfirmDialog.
- **`GroupsView.tsx`** — Render de los 12 grupos con standings + fixtures
  inline editable.
- **`GroupCard.tsx`**, **`GroupStandingsTable.tsx`** — Piezas de
  GroupsView.
- **`BracketView.tsx`** — Render del bracket r32 → final + third.
- **`MatchScoreRow.tsx`** — Input numérico de goles, llama `setScore`.
- **`KnockoutMatchRow.tsx`** — Render de un match con slots resueltos,
  override con `setKnockoutPick`.

---

## 12. `src/i18n/` — Internacionalización

```
src/i18n/
  index.ts          ← setup de i18next
  locales/
    en.json
    es.json
```

**Setup:**
- `SUPPORTED_LANGUAGES = ['es', 'en']`.
- `lng` se inicializa desde `useSettingsStore.getState().language` (no desde
  el detector) para que el setting persistido gane.
- `fallbackLng: 'es'`, `detection.caches: []` (caches vacío evita que
  i18next escriba su propia key, ya tenemos la nuestra en `settingsStore`).
- `useSettingsStore.subscribe` mantiene `i18n.changeLanguage` sincronizado
  cuando el usuario cambia el idioma en SettingsPage.

**Patrón en componentes:** `const { t } = useTranslation();` +
`t('stickers.categoryOptions.${category}', { defaultValue: category })`.

---

## 13. `src/tests/` — Setup y helpers de test

- **`setup.ts`** — Setup global de Vitest. Importa `@testing-library/jest-dom`
  y `fake-indexeddb/auto`. Configura matchers custom si los hay.
- **`helpers.ts`** — Helpers para tests unitarios/componentes (crear
  fixtures de colecciones/stickers, wrap con providers).

---

## 14. `public/collections/` — Paquetes de catálogo

| Archivo | Descripción |
| --- | --- |
| `index.json` | Manifest con 3 entries: `worldcup-2026` (es, v2.0.0), `pokemon-151` (en, v1.0.0), `demo-mini` (es, v1.0.0). |
| `worldcup-2026.json` | 22 selecciones, 18 stickers c/u (badge + 17 players) = 396 stickers + estructura tournament. ~860 KB. |
| `pokemon-151.json` | 151 criaturas (sin teams), una cada 7° es shiny, legendarias cada 50°. ~26 KB. |
| `demo-mini.json` | 5 stickers en 2 teams (ARG×3, BRA×2), usado en e2e. ~1.4 KB. |
| `panini-2026.json` | ~596 B. **Huérfano** — no aparece en el manifest, parece iteración previa. |

`index.json` shape:
```json
{ "collections": [{ "id", "file", "name", "description", "version", "language" }] }
```

---

## 15. `scripts/` — Generadores offline

| Script | Qué hace |
| --- | --- |
| `generate-collections.mjs` | Genera los 3 paquetes JSON + `index.json` en `public/collections/`. Datos sintéticos hardcodeados (22 equipos WC2026, 151 Pokémon, demo). **No tiene script npm** — se corre a mano. |
| `generate-icons.mjs` | Genera PNGs PWA con encoder PNG propio (sin dependencias de imagen): zlib + raw RGBA → `icon-192/512`, `icon-maskable-512`, `apple-touch-icon`. Script npm: `npm run icons`. |

---

## 16. `.github/workflows/` — CI/CD

| Workflow | Qué hace |
| --- | --- |
| `ci.yml` | 2 jobs en `ubuntu-latest` con Node 24: (1) `quality`: format:check + lint + typecheck + `test:coverage` (uploads `coverage/`) + build; (2) `e2e`: `npx playwright install --with-deps chromium` + `npm run test:e2e` (uploads `playwright-report/`). Corre en `push`/`PR` a `main` con `cancel-in-progress: true`. |
| `deploy.yml` | Dispara tras `workflow_run` exitoso del CI (o manual `workflow_dispatch`). Build con `VITE_BASE_PATH` desde `actions/configure-pages` (fallback `/<repo>/`) y `VITE_APP_VERSION=${GITHUB_SHA}`. `cp dist/index.html dist/404.html` para fallback SPA. Sube artifact a GitHub Pages. Concurrency `pages` con cancel. |

---

## 17. Configs de build

### `vite.config.ts`
- **Path alias** `@` → `src/`.
- **`base`** desde `process.env.VITE_BASE_PATH` (default `/`).
- **Plugins:** `@vitejs/plugin-react` + `VitePWA`.
  - `registerType: 'autoUpdate'`, `injectRegister: 'auto'`.
  - Manifest: `id = basePath`, `name 'Panini Collection Tracker'`, theme
    `#0f172a`, `display: standalone`, `start_url: basePath`, `handle_links:
    'preferred'`, `launch_handler.client_mode: 'auto'`, 3 iconos.
  - **Workbox:** `globPatterns: '**/*.{js,css,html,svg,png,ico,woff,woff2,json,wasm}'`,
    `maximumFileSizeToCacheInBytes: 8MB`, `navigateFallback: ${basePath}index.html`.
  - **Runtime caching:**
    - `/collections/*` → `StaleWhileRevalidate` (`collections-cache`, 64
      entries, 30 días).
    - Images → `CacheFirst` (`images-cache`, 512 entries, 90 días).
    - `tessdata` / `tesseract` → `CacheFirst` (`tesseract-cache`, 16 entries,
      365 días, `cacheableResponse: { statuses: [0, 200] }` para opaques del
      CDN).
- **Build:** `target: 'es2022'`, `sourcemap: true`, **manualChunks**:
  `react`, `charts`, `ocr`, `qr` (aíslan pesos pesados).

### `vitest.config.ts`
- `mergeConfig(viteConfig, ...)` → hereda alias.
- `environment: 'jsdom'`, `environmentOptions.jsdom.url: 'http://localhost/'`.
- `setupFiles: './src/tests/setup.ts'`.
- `include: 'src/**/*.{test,spec}.{ts,tsx}'`, `exclude: ['tests/e2e/**']`.
- **Coverage:** provider `v8`, reporter `[text, json-summary, html, lcov]`.
- **Thresholds:** lines 80%, functions 80%, branches 75%, statements 80%.

### `tailwind.config.ts`
- `content: ['./index.html', './src/**/*.{ts,tsx}']`, `darkMode: 'class'`.
- **Colores M3** mapeados a `var(--md-sys-color-*)` (definidos en
  `src/index.css`): `primary`, `on-primary`, `primary-container`,
  `on-primary-container`, `secondary(Container)`, `tertiary(Container)`,
  `error(Container)`, `surface*` (5 niveles de container),
  `outline(-variant)`, `inverse-surface/on`, alias semánticos
  `sticker-owned/duplicate/missing`.
- Paleta `brand` (50-900) mantenida para retrocompatibilidad.
- `fontFamily.sans`: Inter con fallback system.
- **Spacing custom:** `safe-top/bottom/left/right` (env safe-area),
  `nav-bar/nav-rail: 80px`, `top-bar: 64px`.
- `minHeight/minWidth.tap: 44px` (M3 touch target).
- Border radii M3: `xs: 4, sm: 8, md: 12, lg: 16, xl: 28`.
- `boxShadow.elev-1..5` (M3 elevation).
- `transitionTimingFunction` y `transitionDuration.motion-short1..long4` (M3
  motion tokens).
- `fontSize` con la **type scale M3 completa** (display-lg → label-sm).
- Keyframes/animations: `fade-in`, `slide-up`, `scale-in`, `shimmer`.

---

## 18. `enrichment/` — Pipeline de datos

**Subproyecto aparte** (no se incluye en el bundle de la app principal).
Pipeline offline para enriquecer el catálogo de World Cup 2026 con datos de
Wikidata + Wikipedia.

- **`package.json`:** `panini-wc-2026-enrichment`, `pnpm@11.5.1`, Node ≥22.
  Deps: `p-limit`, `zod`. DevDeps: `tsx`, `typescript`.
- **Scripts npm:**
  - `enrich` → `tsx src/cli.ts enrich`
  - `report` → `tsx src/cli.ts report`
  - `build-package` → `tsx src/build-package.ts` (genera
    `public/collections/worldcup-2026.json`)
  - `build-fixture` → `tsx src/build-fixture.ts` (genera el demo mini)
- **Estructura `src/`:** `cli.ts`, `enrich.ts`, `matching.ts`,
  `normalize.ts`, `catalog.ts`, `types.ts`, `schemas.ts`, `config.ts`,
  `flags.ts`, `cache.ts`, `checkpoint.ts`, `report.ts`,
  `build-package.ts`, `build-fixture.ts`, `sources/`, `reference/`.
- **Estructura `data/`:** `cache/`, `checkpoints/`, `generated/`, `raw/`.

**Uso:** `cd enrichment && pnpm install && pnpm run enrich && pnpm run
build-package`. El output va a `public/collections/worldcup-2026.json`.

---

## 19. `tests/e2e/` — Specs Playwright

**`playwright.config.ts`:** testDir `./tests/e2e`, projects `[chromium,
mobile-chrome (Pixel 7)]`, `fullyParallel`, `retries: 2 en CI`, `timeout:
30s`, `expect: 5s`, `webServer` hace build con `VITE_BASE_PATH=/` y sirve
con `vite preview --port 4173`.

**Helpers** (`tests/e2e/helpers.ts`):
- `primeSettings(page)` — `page.addInitScript` que escribe `panini-settings`
  con `defaultCollectionSeeded: true` para que `App.tsx` **no** auto-instale
  el WC2026 (980 stickers contaminarían los counts).
- `goto(page, hash='/')` — Navega a `/#${hash}` y espera al banner.
- `installDemo(page)` / `installByName(page, name)` — Navega a
  `/collections`, click "Install", espera "Selected", llama
  `dismissTransientUi`.
- `dismissTransientUi(page)` — Cierra el toast de PWA offline-ready y el de
  install (ambos `z-50 bottom-20` que pueden superponerse al FAB en `z-30
  bottom-24`).

| Spec | Cubre |
| --- | --- |
| `collections.spec.ts` | Install demo + ver `0/5` en dashboard, rename via PromptModal, duplicate (verifica `collection-row` count = 2). |
| `inventory.spec.ts` | +/− en StickerCard (atributo `data-quantity`), filter chips (Owned → 1, Missing → 4), bulk import (paste `ARG 1\nARG 1\nBRA 12\nZZZ 9` → ARG-1 queda con qty 2). |
| `stickers-groups.spec.ts` | Group toggle (5 stickers flat → 5 con secciones; colapsar Argentina → 2), searching fuerza `forceExpand` (siempre 3 ARG visibles). |
| `tournament.spec.ts` | Instala WC2026, ve "Group A".."Group L", setea score 2-0, verifica 3 puntos en la tabla, switch a "Bracket" ve "Round of 32" + "Final". |
| `settings-backup-exchange.spec.ts` | Dark theme, cambio de idioma a Español (heading "Ajustes"), export `.albumbackup` filename match, generar exchange QR (`data-testid="exchange-qr"`). |

⚠️ `ExchangePage.tsx` define `data-testid="exchange-qr"` pero está
**comentado** en el JSX actual (la sección "My QR" está deshabilitada). El
test pasa sólo si se restaura esa sección. Ver
[`TECHNICAL_DEBT.md`](./TECHNICAL_DEBT.md).

---

## 20. Patrones transversales

### Internacionalización
- `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
- Settings persistido en `panini-settings` (no en la key de i18next) → fuente
  única de verdad.
- 2 locales: `es` (default), `en`. Resources como `import` estático desde
  `locales/*.json`.
- `index.html` tiene `<html lang="es">`; `applyThemeSideEffects` lo
  actualiza en runtime.
- Sincronización bidireccional via `useSettingsStore.subscribe`.

### Theme persistence (no flash)
- Pre-paint script inline en `index.html` lee `panini-settings` y aplica
  `class="dark"` antes del primer render.
- `settingsStore.onRehydrateStorage` reaplica los side-effects tras hidratar
  desde localStorage.
- `applyThemeSideEffects` también aplica `lang` y haptics.

### Routing
- `createHashRouter` (no `BrowserRouter`) para que la app funcione en GitHub
  Pages sin 404 en deep-links.
- `AppLayout` es el único layout (`/` con `element: <AppLayout />` +
  `children`).
- 10 rutas + 404.

### State management
- **Zustand** como store global (4 stores: settings, ui, scenario,
  reservation). Todos con `persist` + storage resiliente.
- **Dexie `useLiveQuery`** para estado derivado de la DB local (es la
  "fuente de verdad" de los datos del usuario).
- **TanStack Query** únicamente para el `fetchManifest` (única llamada
  HTTP).

### Data fetching
- **Local-first:** toda la data de usuario vive en IndexedDB (Dexie).
- **HTTP:** sólo el manifest y los packages de colección (con cache PWA
  Workbox). Sin backend.

### Validación
- Zod en **toda** frontera de input externo:
  - Packages JSON (`collectionPackageSchema`).
  - Manifest (`collectionManifestSchema`).
  - Backup file (`backupPayloadSchema`).
  - Exchange payload (`exchangePayloadSchema`).
  - Sync payload (`syncPayloadSchema`).
  - Settings (`settingsSchema`).
- Types TS siempre inferidos con `z.infer<>` → no pueden drift.

### Patrón de UID namespaced
- `${collectionId}::${localId}` para PKs cross-collection (teams, stickers,
  inventory, matchResults, knockoutPicks).
- Helpers `makeUid` / `splitUid` en `utils/ids.ts`.
- Permite duplicate de colecciones + re-import sin colisiones.

### Pre-paint theme
- Script inline en `<head>` (no en main bundle) → evita flash de tema
  incorrecto.

### M3 design system
- Tokens de color en `index.css` (CSS vars `--md-sys-color-*`), consumidos
  por Tailwind.
- Type scale, elevation, motion, shape, state layers — todos definidos como
  utilities.

### PWA
- `vite-plugin-pwa` con `autoUpdate`.
- Service worker cachea: assets estáticos + collection JSON (SWR) + images
  (CacheFirst) + tesseract CDN (CacheFirst con statuses [0, 200]).
- `navigateFallback` → `index.html` para SPA routing en offline.

---

## 21. Glosario de dependencias

### Runtime
| Dependencia | Razón inferida |
| --- | --- |
| `react` 18 + `react-dom` | UI. |
| `react-router-dom` 6 | Hash router, `useNavigate`, `useSearchParams`, `useLocation`, `NavLink`. |
| `@tanstack/react-query` 5 | Único uso real: `useManifest` (cachea el manifest HTTP). |
| `dexie` 4 + `dexie-react-hooks` | IndexedDB tipado + reactividad con `useLiveQuery`. |
| `zustand` 5 | 4 stores globales con `persist` middleware. |
| `i18next` + `i18next-browser-languagedetector` + `react-i18next` | I18n con detección pero override por settings. |
| `zod` 3 | Single source of truth para tipos + validación runtime. |
| `pako` | Gzip para backup/sync/exchange payloads. |
| `jsqr` | Decodificar QR desde `ImageData` (video frame). |
| `qrcode` | Render QR como PNG data URL. |
| `tesseract.js` | OCR offline en Web Worker, con char whitelist. |
| `recharts` | Pie + Bar charts en dashboard y statistics. |
| `react-hook-form` + `@hookform/resolvers` | **Declaradas, sin uso activo detectado** — posible remanente. Ver [`TECHNICAL_DEBT.md`](./TECHNICAL_DEBT.md). |
| `vite-plugin-pwa` | PWA/Workbox generation. |

### Dev
| Dependencia | Razón |
| --- | --- |
| `vitest` + `@vitest/coverage-v8` + `jsdom` + `fake-indexeddb` + `@testing-library/{react,dom,user-event,jest-dom}` | Testing stack unitario/componente. |
| `@playwright/test` | E2E. |
| `eslint` 9 flat + `@typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` + `eslint-config-prettier` | Linting. |
| `prettier` 3 | Formatting. |
| `tailwindcss` 3 + `postcss` + `autoprefixer` | Estilos. |
