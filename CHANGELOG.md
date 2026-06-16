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
- **Pestaña "Partidos" en la sección Copa.** Timeline horizontal de todos
  los partidos del torneo, agrupados por día con sticky headers
  translúcidos. Al entrar a la pestaña se auto-scrollea a la sección del
  partido en vivo o al próximo partido, así que el usuario aterriza
  siempre sobre el contexto relevante. Cada fila muestra: stage/grupo,
  hora local, sede/ciudad, equipos con bandera, marcador editable
  (respetando el lock de kickoff y el escenario oficial), resultado FIFA
  oficial con penales, y verdict chip (Exacto/Signo/Errado/Pendiente).
  Past / live / next / future tienen pill de estado distinto (la "live"
  pulsa). Aparece un botón flotante "Ir a hoy" cuando el usuario se
  aleja del ancla. La nueva pieza se integra con el `SegmentedControl`
  existente entre "Llaves" y "Puntos" sin tocar el resto de las vistas.
  - `src/components/tournament/MatchesView.tsx` — vista nueva.
  - `src/components/ui/Icon.tsx` — íconos `event`, `schedule`, `place`,
    `timeline` (Material 24×24 paths).
  - `src/i18n/locales/{es,en}.json` — strings nuevos (`tournament.matches`,
    `matches.{summary,match,matches,jumpToToday,status.*}`).
  - `tests/e2e/tournament.spec.ts` — test E2E que verifica el agrupado
    por día, la presencia de un único ancla, y el botón "Jump to today".

### Changed (este PR — continuación)

- **Pestaña "Partidos": filtros, refresh, countdown y "Nuevo" highlight.**
  Se agregaron cuatro features sobre la timeline base:
  1. **Filtro por estado** (Todos / Jugados / En vivo / Pendientes) en una
     `SegmentedControl` M3 con indicator animado y contadores por chip.
     Las secciones sin matches visibles desaparecen; si el filtro deja
     la lista vacía, se muestra un empty state por filtro.
  2. **Botón de refresh manual** que llama
     `syncOfficialResultsFromRemote()` (expuesto desde
     `useOfficialResults` / `useTournament`). Muestra un spinner
     animado mientras corre y un banner de error si la red falla.
  3. **Countdown al próximo partido** ("En 2 d 4 h" / "En 4 h 15 min" /
     "En 23 min") bajo el pill "PRÓXIMO" y en el header. Se re-deriva
     cada 30 s para mantener la cuenta fresca sin re-render agresivo.
  4. **Highlight + badge "Nuevo"** sobre cualquier fila cuyo resultado
     FIFA oficial pasa de "SCHEDULED" → final dentro de la sesión. Se
     detecta por diff entre el snapshot previo y el actual de
     `officialResults`; el highlight dura 3.5 s con un pulse de 2.2 s
     en tertiary-container (M3).
  - `src/hooks/useOfficialResults.ts` — expone `refreshing` y `refresh`.
  - `src/hooks/useTournament.ts` — re-exporta ambos como
    `officialRefreshing` / `refreshOfficial`.
  - `src/index.css` — keyframes `match-new-result-pulse` y
    `refresh-spin`.
  - `src/i18n/locales/{es,en}.json` — strings nuevos:
    `matches.{refresh,refreshError,nextStartsIn,newResult,filterAria,
filter.*, filterEmpty.*}`.
  - `tests/e2e/tournament.spec.ts` — segundo test E2E que cubre los
    cuatro features.

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

### Added (PR2 — sync oficial desde API-Football)

- `enrichment/src/sync-official-results.ts` — script que llama a
  API-Football `/fixtures?league=1&season=2026`, mapea cada partido
  terminado (FT / AET / PEN) al `matchId` interno y lo emite a
  `public/official/worldcup-2026-results.json`. CLI: `pnpm sync-official`
  (con `--dry-run`). Mapea nombres de API-Football a FIFA codes vía una
  tabla; nombres no reconocidos se loguean y se skipean.
- `.github/workflows/sync-official-results.yml` — Action con cron en la
  ventana 16:00–05:00 UTC (= 13hs–02hs Arg), pensada para correr 1 vez por
  hora mientras hay partidos y consumir 1 sola request de las 100/día del
  free tier. Si la API responde vacío o error, sale sin commitear.
- El JSON resultante es read-only: el frontend lo descarga al abrir el
  fixture (PR3) y lo trata como `official_results`, separado de las
  `predictions` del usuario.

### Added (PR3 — separar predictions / official + bloqueo por kickoff)

- Migración Dexie v3: agrega tablas `predictions`, `knockoutPredictions` y
  `officialResults`. Copia los datos existentes de `matchResults` y
  `knockoutPicks` a las nuevas tablas; las viejas quedan definidas para
  back-compat de backups pero ya no las usa el app.
- `src/types/prediction.ts` — `StoredPrediction`, `StoredKnockoutPrediction`,
  `StoredOfficialResult`.
- `src/services/predictionService.ts` — CRUD paralelo a `scenarioService`
  que escribe a las tablas v3+ y aplica el lock: `setPrediction` rechaza
  escrituras con `PredictionLockedError` cuando `match.kickoff <= now`.
  El lock se evalúa contra el `kickoff` exacto (sin margen), según
  decisión del usuario.
- `src/services/officialResultsService.ts` + `src/hooks/useOfficialResults.ts`
  — descarga el JSON estático al primer mount del TournamentPage, valida
  con zod-in-style y guarda en IndexedDB. Re-fetch es idempotente (bulkPut
  por `matchId`).
- `src/utils/prediction.ts` — `isLockedForPrediction(match, now)` y
  `isPredictionCorrect(prediction, official)`. La segunda devuelve un
  veredicto `exact | sign | wrong | pending | official-missing` (el signo
  compara goles en regulation; los partidos con `status: 'PEN'` se evalúan
  sobre los penales, como manda FIFA).
- `useTournament` ahora lee de `predictions` / `knockoutPredictions` y
  expone `officialResults` + `officialSyncedAt`.
- `MatchScoreRow` y `KnockoutMatchRow`: el input de goles se deshabilita
  tras el kickoff y se muestra (a) el resultado oficial FIFA con su
  veredicto, o (b) un texto "Predicción cerrada" si el partido arrancó
  pero la Action aún no sincronizó.
- `i18n` (es/en): agregadas claves `tournament.locked`, `tournament.official`,
  `tournament.verdict.{exact,sign,wrong,pending}`.
- `public/official/worldcup-2026-results.json` — placeholder vacío. La
  Action lo sobreescribe con datos reales. Mientras tanto, el UI muestra
  sólo la predicción del usuario.
- Backup format bumpeado a v3: incluye `officialResults` por colección.
  El restore las persiste en la tabla `officialResults` y replica las
  predicciones a ambas tablas (legacy + v3) para back-compat de clientes
  viejos.
- 163/163 tests pasan; typecheck limpio; build OK (PWA pre-cachéa 25
  entries, +1 por el nuevo JSON).

### Added (PR4 — dashboard 'Mi predicción vs FIFA' con scoring)

- `src/services/scoringService.ts` — motor de scoring puro. Reglas: 3 pts
  por resultado exacto (regulation, o regulation+penales cuando
  `status === 'PEN'`), 1 pt por signo correcto en fase de grupos, 0 por
  errado. En knockout, los manuales (`StoredKnockoutPrediction`) suman 1
  pt extra cuando el equipo forzado avanza a la siguiente ronda.
  Devuelve `totalPoints`, `totalMaxAvailable` (3 × partidos con oficial
  cerrado), breakdown por veredicto, y `perMatch` para la lista detallada.
- `src/hooks/useScoring.ts` — lectura reactiva de `predictions` +
  `knockoutPredictions` del escenario activo, recomputa al cambiar.
  Expone porcentajes para la barra de progreso.
- `src/components/tournament/DashboardView.tsx` — nuevo tab "Puntos" en
  `TournamentPage` (entre Grupos y Llaves). Muestra:
  - Total (`{totalPoints} / {maxScore}`).
  - Barra de progreso apilada (exacto / signo / errado / pendiente).
  - Lista por partido con icono de veredicto y puntos.
- `TournamentPage` ahora tiene 3 tabs: Grupos, Llaves, Puntos.
- `i18n` (es/en): claves `tournament.dashboard`, `dashboard.{points,
scenario, matches, breakdown, breakdownAria, empty, progress,
verdict.*, stage.group}`.
- 11 tests nuevos para `scoringService` (motor + casos PEN + sign en
  grupos). Total: 174/174.
- Lint limpio, typecheck limpio, build OK.

### Fixed (post-PR3)

- `enrichment/src/sync-official-results.ts` — antes tragaba silenciosamente
  el caso `200 OK` con `errors.token` (auth/quotas). Ahora detecta el
  campo `errors` y falla con un mensaje claro, así la Action sale sin
  commitear cuando la API devuelve auth/quotas en vez de escribir un
  JSON vacío engañoso.
- Eliminé variables `yy/mm/dd` no usadas en `build-fixture.ts` y saqué
  un `import()` inline en `useTournament` que el lint bloqueaba en CI.

### Changed (PR5 — switch sync source: API-Football → openfootball)

- **Causa**: API-Football tier free no cubre la season 2026 del Mundial
  ("Free plans do not have access to this season"). El plan pago
  ($19/mes) sí cubre, pero openfootball es gratis, sin auth, sin rate
  limit, y la comunidad lo mantiene a partir de comunicados oficiales
  FIFA.
- `enrichment/src/sync-official-results.ts` reescrito: ahora descarga
  `https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`,
  mapea cada partido terminado al `matchId` interno con un join de dos
  niveles (strict date+order, fuzzy group+equipos sin importar orden)
  para tolerar las discrepancias entre el fixture estático de la app y
  el dataset, y emite el mismo shape que el frontend ya espera
  (`OfficialResultsPayload`).
- Mapeo de nombres openfootball → FIFA codes: cubre las 48 selecciones,
  incluyendo las variantes que openfootball usa distinto a Panini
  ("Bosnia & Herzegovina" vs "Bosnia and Herzegovina", "Turkey" vs
  "Türkiye", "DR Congo" vs "Congo DR", "Ivory Coast" vs "Côte d'Ivoire").
- Compose de `finishedAt` con offset local real (ej. "20:00 UTC-6" →
  "2026-06-11T20:00:00.000-06:00") en vez de UTC fijo, así la UI puede
  mostrar la hora local del estadio.
- `.github/workflows/sync-official-results.yml` — agrega
  `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` para silenciar el warning de
  Node 20 deprecation. El secret `API_FOOTBALL_KEY` se mantiene
  opcional por compat pero ya no se usa. La detección de errores en
  el step "Decide whether to commit" pasó de buscar `"errors":` en el
  JSON (genérico, matcheaba cualquier campo) a validar que el payload
  empiece con `{` y no con `Error`.

### Verification

- `pnpm install --frozen-lockfile` OK (con `onlyBuiltDependencies` en
  `pnpm-workspace.yaml`, no en `package.json`).
- `tsc --noEmit` en `enrichment/` limpio.
- `tsx src/sync-official-results.ts --dry-run` produce un JSON válido
  con los partidos que openfootball ya tiene cargados.
- 174/174 tests siguen pasando (no se tocaron tests de app).
- Lint + build OK.

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
