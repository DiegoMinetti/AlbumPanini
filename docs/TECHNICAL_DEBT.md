# Technical Debt & Observations

> Issues activos, inconsistencias detectadas, y oportunidades de mejora.
> Cada item tiene: severidad, archivos relevantes, descripción, impacto y
> sugerencia. **Ordenado por severidad descendente.**

## Índice

- [🔴 Crítico](#-crítico)
- [🟠 Alto](#-alto)
- [🟡 Medio](#-medio)
- [🟢 Bajo / Cosmético](#-bajo--cosmético)
- [📐 Decisiones de diseño (ADRs candidatos)](#-decisiones-de-diseño-adrs-candidatos)
- [🔍 Observaciones de procesos](#-observaciones-de-procesos)

---

## 🔴 Crítico

### TD-001: Mismatch entre test y código en `ExchangePage` QR
- **Severidad:** Crítica (test verde-mentira)
- **Archivos:**
  - `src/pages/ExchangePage.tsx` (sección "My QR" comentada)
  - `tests/e2e/settings-backup-exchange.spec.ts` (busca `data-testid="exchange-qr"`)
- **Descripción:** El test E2E `settings-backup-exchange.spec.ts` valida la
  generación de un exchange QR seleccionando `[data-testid="exchange-qr"]`,
  pero el código de esa sección está **comentado** en `ExchangePage.tsx`.
- **Impacto:** Si el test pasa, o bien (a) la sección ya fue restaurada y
  el código que vi está desactualizado, o (b) el test está fallando
  silenciosamente o fue skipeado. Cualquiera de las dos es mala.
- **Acción:** Decidir el producto:
  - **Opción A (recomendada):** reactivar la sección "My QR". El
    `qrService.generateExchangeQr` ya existe y está testeado. ~2h de
    trabajo, ver [`ROADMAP.md` § 1.1](./ROADMAP.md#11-qr-exchange-bidireccional-completo-p1).
  - **Opción B:** ajustar el test para validar la sección que sí está
    activa (portapapeles / paste de figuritas.app).
- **Tracking:** [ROADMAP § 0.1](./ROADMAP.md#0-higiene-inmediata-antes-de-cualquier-feature)

### TD-002: `defaultCollectionSeeded` corre en cada launch
- **Severidad:** Crítica (race condition potencial)
- **Archivos:**
  - `src/app/App.tsx` (llama `seedDefaultCollection` en mount)
  - `src/stores/settingsStore.ts` (flag `defaultCollectionSeeded`)
  - `src/services/collectionLoader.ts` (idempotente por `isInstalled`)
- **Descripción:** `App.tsx` chequea `defaultCollectionSeeded` y si es
  `false`, llama a `seedDefaultCollection`. `seedDefaultCollection` es
  idempotente (chequea `isInstalled`), pero hay una ventana de tiempo
  entre el check y la instalación donde un usuario podría:
  1. Tener la app en background.
  2. Borrar WC2026 desde Collections.
  3. Volver a la app → `defaultCollectionSeeded` ya era `true` (de
     antes) → no se reinstala. ✓ OK
  4. Pero si se borra IndexedDB (modo privado, etc), el flag persiste
     en `localStorage` y la app queda sin WC2026.
- **Impacto:** Edge case pero visible. El usuario queda sin datos
  huérfanos.
- **Acción:** Cambiar el flujo a:
  ```ts
  // Pseudo
  if (!isInstalled('worldcup-2026')) {
    seedDefaultCollection();
  }
  markDefaultCollectionSeeded();
  ```
  Es decir, **el flag es un acelerador, no la fuente de verdad**. La
  fuente de verdad es `isInstalled(id)`.
- **Costo:** S. **Riesgo:** bajo.

---

## 🟠 Alto

### TD-003: `ExchangePage.tsx` es un archivo de 34 KB
- **Severidad:** Alta (mantenibilidad)
- **Archivo:** `src/pages/ExchangePage.tsx`
- **Descripción:** 34 KB / ~1000 líneas. Un solo componente maneja
  paste, compare, scan, QR generation, y confirm. Es el componente
  más grande de la app.
- **Impacto:** Difícil de testear unitariamente (no hay test de
  componente). Los futuros cambios van a tener merge conflicts
  constantes.
- **Acción:** Refactorizar en sub-componentes:
  - `DuplicateShareStep` (paso 1)
  - `PartnerListStep` (paso 2)
  - `QrScanStep` (paso 3)
  - `MatchResultsPanel` (común)
  - `useExchangeFlow` (hook con state machine)
- **Costo:** M. **Riesgo:** bajo.

### TD-004: `BackupPage.tsx` es un archivo de 23 KB
- **Severidad:** Alta (mantenibilidad)
- **Archivo:** `src/pages/BackupPage.tsx`
- **Descripción:** 23 KB. Mezcla export, import, sync, y dialog de
  receive.
- **Acción:** Refactor similar a TD-003.
- **Costo:** M. **Riesgo:** bajo.

### TD-005: `syncService.ts` es un archivo de 20 KB
- **Severidad:** Alta (mantenibilidad)
- **Archivo:** `src/services/syncService.ts`
- **Descripción:** El servicio más grande. Tiene 5 responsabilidades:
  encode/decode, chunking, URL building, session management, apply.
- **Acción:** Separar en:
  - `syncCodec.ts` (encode/decode/chunk)
  - `syncSession.ts` (record/assemble/clear)
  - `syncApply.ts` (applySyncPayload + variants)
- **Costo:** M. **Riesgo:** bajo.

### TD-006: `useCollectionData` recalcula todo en cada cambio
- **Severidad:** Alta (performance marginal)
- **Archivo:** `src/hooks/useCollectionData.ts`
- **Descripción:** `useMemo` calcula `statistics` con `computeStatistics`
  en cada cambio de stickers O inventory. Para WC2026 son ~10ms, pero
  es un anti-pattern.
- **Acción:** Ver [ROADMAP § 3.3](./ROADMAP.md#33-memoizar-estadísticas-con-selectores-finos-p2).
- **Costo:** S.

### TD-007: `StickersPage.tsx` es 17 KB
- **Severidad:** Alta (mantenibilidad)
- **Archivo:** `src/pages/StickersPage.tsx`
- **Acción:** Mismo refactor que TD-003/TD-004. Extraer
  `useStickerViewState` (filters, groupBy, edit mode, expand).
- **Costo:** M.

### TD-008: `reservationStore` implementado pero no usado
- **Severidad:** Alta (código muerto, confusión)
- **Archivos:** `src/stores/reservationStore.ts` (definido) — no aparece
  como import en ninguna página.
- **Descripción:** Store completo, con tipos, tests-ready. Pero ninguna
  página lo consume. Es un "feature" a medias.
- **Acción:** Decidir:
  - **Opción A (recomendada):** implementarlo. Ver
    [ROADMAP § 1.2](./ROADMAP.md#12-reservas-de-figuritas-reservationstore-ya-implementado-p1).
  - **Opción B:** borrarlo. Menos código que mantener.
- **Costo:** M (si A) / S (si B).

---

## 🟡 Medio

### TD-009: `react-hook-form` + `@hookform/resolvers` declaradas sin uso
- **Severidad:** Media
- **Archivos:** `package.json`
- **Descripción:** Las dependencias están en `package.json` pero no vi
  imports en el código revisado. Probable uso parcial o remanente.
- **Acción:** Verificar con `grep -r "react-hook-form" src/`. Si está
  vacío, remover. Si hay uso, documentar.
- **Costo:** S.

### TD-010: `panini-2026.json` huérfano en `public/collections/`
- **Severidad:** Media (limpieza)
- **Archivo:** `public/collections/panini-2026.json`
- **Descripción:** ~596 B, no aparece en `index.json`, parece iteración
  previa del script `generate-collections.mjs`.
- **Acción:** Borrar.
- **Costo:** S.

### TD-011: `scripts/generate-collections.mjs` no tiene script npm
- **Severidad:** Media (DX)
- **Archivos:** `package.json`, `scripts/generate-collections.mjs`
- **Descripción:** Existe el script pero no hay `npm run collections` (sólo
  `npm run icons`). Inconsistencia.
- **Acción:** Agregar `"collections": "node scripts/generate-collections.mjs"`.
- **Costo:** S.

### TD-012: `ExchangePage` mantiene el input de "Mi QR" comentado
- **Severidad:** Media
- **Archivo:** `src/pages/ExchangePage.tsx`
- **Descripción:** Aparte de TD-001, el código comentado ocupa líneas y
  crea ruido. Si la decisión es NO reactivar (TD-001 Opción B),
  eliminar el código comentado. Si SÍ reactivar, descomentar y
  refactorizar.
- **Acción:** Resolver TD-001 primero.
- **Costo:** S.

### TD-013: Sin observabilidad de errores
- **Severidad:** Media (operaciones)
- **Descripción:** Si OCR falla, si un restore falla, si un sync
  descarrila, no hay forma de saber. El usuario sólo ve un toast de
  error genérico.
- **Acción:** Ver [ROADMAP § 8.2](./ROADMAP.md#82-sentry--error-tracking-p1).
  Sentry con `sendDefaultPii: false`.
- **Costo:** S.

### TD-014: `pwaDetection` vive en `src/components/feedback/`
- **Severidad:** Media (organización)
- **Archivos:** `src/components/feedback/pwaDetection.ts`
- **Descripción:** Es código puro (helpers), no un componente. Vive
  junto a `PwaInstallPrompt.tsx` por la separación que exige
  `react-refresh` (un archivo no-componente junto a un componente
  rompe HMR).
- **Acción:** Mover a `src/utils/pwaDetection.ts` y agregar un
  `pwaDetection.test.ts`. El bundle de Vite va a tree-shakear igual.
- **Costo:** S.

### TD-015: `CollectionHeatmap` no tiene test
- **Severidad:** Media
- **Archivo:** `src/components/stats/CollectionHeatmap.tsx`
- **Descripción:** 42 líneas, sin test, **pero está incluida en el
  include del coverage de Vitest**. Coverage cuenta esto como "no
  testeado".
- **Acción:** Agregar un test mínimo (renderiza con 0 stickers, renderiza
  con stickers con qty 0/1/2+).
- **Costo:** S.

### TD-016: `Vitest` excluye `ocrService.ts` y `utils/file.ts` del coverage
- **Severidad:** Media (coverage gap)
- **Archivos:** `vitest.config.ts`
- **Descripción:** Son los dos módulos browser-heavy. Se asume que
  E2E los cubre, pero la realidad es que `ScanPage` no tiene E2E.
- **Acción:** Agregar specs E2E para `ScanPage` con imagen de fixture.
  O agregar tests unitarios de `file.ts` con jsdom.
- **Costo:** M.

### TD-017: Tests de componentes están dispersos
- **Severidad:** Media (organización)
- **Descripción:** Algunos tests viven junto al componente
  (`StickerCard.test.tsx`), otros en un nivel raro. No es problema
  mayor, pero romper la convención de "tests van junto al source" o
  "tests van en `__tests__/`" genera fricción.
- **Acción:** Documentar la convención en `docs/ARCHITECTURE.md` o
  `CONTRIBUTING.md` (si se crea).
- **Costo:** S.

---

## 🟢 Bajo / Cosmético

### TD-018: El coverage include lista explícitamente 5 componentes
- **Severidad:** Baja
- **Archivo:** `vitest.config.ts`
- **Descripción:** En lugar de `src/components/**`, se listan 5
  componentes puntuales. Cualquier componente nuevo no se cuenta.
- **Acción:** Cambiar a `src/components/**` con exclude de
  `src/components/**/index.ts` y `**/*.test.*`. Mantener
  `ocrService.ts` y `utils/file.ts` excluidos.
- **Costo:** S.

### TD-019: Falta `.env.example` documentado
- **Severidad:** Baja
- **Archivo:** `.env.example`
- **Descripción:** Existe pero no lo leí. Verificar que documente
  `VITE_BASE_PATH` y `VITE_APP_VERSION`.
- **Acción:** Auditar.
- **Costo:** S.

### TD-020: `StickerCard.tsx` no tiene test
- **Severidad:** Baja
- **Archivo:** `src/components/stickers/StickerCard.tsx`
- **Descripción:** El componente más usado de la app no tiene test.
  `QuantityStepper` (su subcomponente) sí.
- **Acción:** Agregar test mínimo.
- **Costo:** S.

### TD-021: `BulkImportModal` y `FilterSheet` no tienen test de componente
- **Severidad:** Baja
- **Acción:** Agregar.
- **Costo:** S.

### TD-022: `index.html` tiene un script inline
- **Severidad:** Baja (mantenibilidad)
- **Archivo:** `index.html`
- **Descripción:** El pre-paint script para evitar flash de tema está
  inline. Es la mejor práctica, pero complica la lectura del HTML.
- **Acción:** Documentar inline con un comment bien visible.
- **Costo:** S.

### TD-023: Falta un script de "doctor"
- **Severidad:** Baja
- **Descripción:** Un comando `npm run doctor` que valide: (a) deps
  instaladas, (b) port 5173 libre, (c) Playwright browsers instalados,
  (d) `coverage/` no es stale. Útil en onboarding.
- **Acción:** Crear `scripts/doctor.mjs`.
- **Costo:** S.

---

## 📐 Decisiones de diseño (ADRs candidatos)

Candidatos para [`docs/adr/`](./adr/) cuando se cree ese directorio.

### ADR-001: Por qué `local-first` con Dexie y no SQLite via WASM
- **Contexto:** Un db embebido en WASM (sql.js, absurd-sql) tendría
  mejor performance para queries complejos.
- **Decisión:** Dexie + IndexedDB. Trade-off: API más simple, reactivo
  con `useLiveQuery`, sin 5MB de bundle.
- **Consecuencias:** Índices limitados, queries complejos son scans.
  Para los volúmenes de la app (cientos de stickers) es OK.

### ADR-002: Por qué `createHashRouter` y no `createBrowserRouter`
- **Contexto:** La app se deploya a GitHub Pages.
- **Decisión:** Hash router. Las URLs son `/#/stickers` en lugar de
  `/stickers`.
- **Consecuencias:** SEO peor (Google indexa el `#` raro), pero el
  proyecto es 100% client-side y no necesita SEO. Funciona offline
  sin server rewrite.

### ADR-003: Por qué Zustand y no Redux/Context+useReducer
- **Contexto:** Estado global chico (settings, ui, scenario,
  reservation). 4 stores.
- **Decisión:** Zustand con `persist` + `safeStorage`.
- **Consecuencias:** Bundle chico, sin boilerplate, sintaxis concisa.
  La opción "Context + useReducer" habría requerido escribir un
  storage layer + reducer + actions a mano para cada store.

### ADR-004: Por qué Zod en runtime y no solo tipos TS
- **Contexto:** Hay input externo en TODA frontera: collection
  packages (JSON), backup file, exchange payload, sync payload,
  settings re-hidratado.
- **Decisión:** Zod como single source of truth, TS inferido.
- **Consecuencias:** Bundle +50KB. Pero: si el `.albumbackup` viene
  corrupto, lo detectamos antes de tocar la DB. Vale la pena.

### ADR-005: Por qué `vite-plugin-pwa` y no Workbox directo
- **Contexto:** Necesidad de SW + manifest + Workbox caching strategies.
- **Decisión:** Plugin oficial de Vite.
- **Consecuencias:** Menos boilerplate, integración con `import.meta.env`,
  autoUpdate built-in. Trade-off: menos control fino sobre la config
  del SW (que se mitiga con `workbox: { ... }` config).

### ADR-006: Por qué sin backend / sync cloud
- **Contexto:** El proyecto podría haber tenido un backend opcional
  para sync.
- **Decisión:** 100% local. Sync via QR device-to-device. Backup via
  archivo `.albumbackup`.
- **Consecuencias:** Privacy es el selling point. No hay vendor
  lock-in. No hay costo de infra. Costo: la sync entre devices es
  manual (QR scan).

### ADR-007: Por qué `uid = "${collectionId}::${localId}"` y no un row por colección
- **Contexto:** Las tablas `teams`, `stickers`, `inventory`,
  `matchResults`, `knockoutPicks` conviven con múltiples
  colecciones.
- **Decisión:** PK namespaced con `::` separator.
- **Consecuencias:** Queries como `WHERE collectionId = X` requieren
  un índice dedicado (que está). Permite duplicate de colección sin
  colisión.

---

## 🔍 Observaciones de procesos

### OBS-001: El repo no tiene `.harness/`
- **Descripción:** El bootstrap check detectó que el proyecto no tiene
  un equipo de agentes configurado. Para un proyecto activo como este
  (con backlog de features), tener un equipo `.harness/reins/` acelera
  el desarrollo.
- **Acción:** Considerar correr `init-harness` skill (puede ser
  fuera de sesión para no contaminar contexto). No es urgente.

### OBS-002: El `enrichment/` no tiene CI propio
- **Descripción:** El subproyecto `enrichment/` (pipeline de datos
  Wikidata) no se valida en CI. Si rompe, no nos enteramos.
- **Acción:** Agregar un job opcional en `ci.yml` (o un workflow
  separado) que corra `cd enrichment && pnpm install && pnpm run
  build-fixture` (al menos el fixture es chico).
- **Costo:** S.

### OBS-003: No hay `.editorconfig` (sí hay `.prettierrc.json`)
- **Severidad:** Baja
- **Acción:** Agregar `.editorconfig` con defaults sensatos
  (indent 2 spaces, LF line endings, final newline).
- **Costo:** S.

### OBS-004: Hay cambios sin commit en `main`
- **Descripción:** Detecté 3 archivos modificados en el checkout de
  `main` (`en.json`, `es.json`, `ExchangePage.tsx`) cuando hice el
  mapeo. No eran míos.
- **Acción:** Verificar el estado del working tree. Si son cambios
  intencionales, commitearlos. Si son accidentales, `git restore`.
- **Costo:** S.

### OBS-005: El coverage de Vitest corre en cada PR pero no se publica
- **Descripción:** El job de CI sube `coverage/` como artifact, pero
  no hay badge en el README.
- **Acción:** Agregar badge de coverage en `README.md` (Codecov o
  similar).
- **Costo:** S.

### OBS-006: `getTopbarHeightVar` no es testable por estar acoplado al DOM
- **Severidad:** Baja
- **Descripción:** El helper publica la altura del topbar en una CSS
  var. No lo cubren los tests porque es side-effect puro del DOM.
- **Acción:** Si se vuelve crítico, refactor a un hook `useTopbarHeightVar`.
  Hoy no es prioridad.

---

## Convenciones

- Cada item tiene un ID `TD-XXX` o `OBS-XXX`.
- Severidad usa los mismos emojis que el roadmap (🔴🟠🟡🟢).
- Cada item linkea al archivo relevante y (cuando aplica) a la sección
  del roadmap que lo resuelve.
- Si un item se descarta, mantener en el archivo con `~~tachado~~` y la
  razón del descarte, no borrar (historia).
