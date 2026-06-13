# Roadmap

> Backlog priorizado del proyecto. Las features se ordenan por **valor para
> el usuario final × costo de implementación**. Lo más cerca de "esta
> quincena" está arriba; lo más lejano (o sin validar) abajo.

## Leyenda de prioridad

- 🔴 **P0** — Bloqueante o crítico para el producto. Resolver ya.
- 🟠 **P1** — Alto valor, próximos sprints.
- 🟡 **P2** — Deseable, depende de feedback de usuarios.
- 🟢 **P3** — Ideas para explorar, sin fecha.

## Leyenda de estado

`💡 idea` → `📐 diseño` → `👷 en curso` → `🧪 en QA` → `✅ shipped` →
`❌ descartado`.

---

## 0. Higiene inmediata (antes de cualquier feature)

| # | Item | Prioridad | Estado | Notas |
| --- | --- | --- | --- | --- |
| 0.1 | Resolver mismatch test/código de `data-testid="exchange-qr"` en `ExchangePage.tsx` (sección "My QR" comentada) | 🔴 P0 | 💡 idea | El test `settings-backup-exchange.spec.ts` busca ese testid pero el código está comentado. Decidir: o reactivar la sección o ajustar el test. |
| 0.2 | Eliminar `public/collections/panini-2026.json` (huérfano, no aparece en `index.json`) | 🟠 P1 | 💡 idea | Parece iteración previa. Limpiar el árbol. |
| 0.3 | Agregar `npm run collections` para `scripts/generate-collections.mjs` (no está en `package.json`) | 🟡 P2 | 💡 idea | Simetría con `npm run icons`. |
| 0.4 | Auditar uso de `react-hook-form` + `@hookform/resolvers` (declaradas, sin uso activo) | 🟡 P2 | 💡 idea | Si no se usan, removerlas. Si se usan en algún modal chico, documentar. |

---

## 1. Features de producto

### 1.1 QR exchange bidireccional completo 🟠 P1

**Hoy:** `ExchangePage` permite 1) copiar mi lista de duplicates al
portapapeles (formato `figuritas.app`), 2) pegar/pegar la lista de un
amigo y comparar, 3) scanear QR de un amigo. Pero la sección "My QR" está
deshabilitada (comentada).

**Por qué importa:** un amigo necesita poder generar SU QR para que yo lo
escanee. Hoy dependemos de copiar/pegar listas de texto, que es feo.

**Tareas:**
- [ ] Reactivar la sección "My QR" en `ExchangePage.tsx` (usar
      `qrService.generateExchangeQr`).
- [ ] Resolver el test `settings-backup-exchange.spec.ts` para validar
      la sección.
- [ ] Considerar variante "generate both QR + text" (ofrecer fallback).
- [ ] Asegurar que el QR quepa en pantalla móvil sin scroll horizontal.

**Costo:** S (1-2 días). **Riesgo:** bajo.

### 1.2 Reservas de figuritas (reservationStore ya implementado) 🟠 P1

**Hoy:** `reservationStore` está implementado y testeable, pero
**nadie lo consume**. La intención es: "María me debe estas figuritas" o
"yo le debo estas a María", persistente cross-session.

**Por qué importa:** El usuario quiere saber qué figuritas separar
físicamente para un trade sin perderlas del inventario (sigue siendo
"owned", pero marcadas como apartadas). Es el caso real de uso: "vi a
Juancito en el recreo y le voy a dar 3 figus que me faltan a mí".

**Tareas:**
- [ ] Wirear el store a `StickerCard` (long-press → modal de reserva).
- [ ] UI en `StickerDetailModal` con lista de partners y counts.
- [ ] Vista "Reservas" en el dashboard (cuántas figus tengo apartadas
      para cada amigo).
- [ ] Validación: una reserva NUNCA puede superar `quantity` actual
      (mostrar warning si el usuario intenta reservar más de lo que
      tiene).
- [ ] Tests: store + componente.

**Costo:** M (3-5 días). **Riesgo:** bajo (la lógica ya existe).

### 1.3 Sync device-to-device con feedback visual mejorado 🟠 P1

**Hoy:** `syncService` permite generar un QR chunked, copiar URL, escanear
y aplicar. Funciona, pero la UX es críptica (el usuario tiene que abrir
otra pestaña con la URL).

**Por qué importa:** Si resolvemos 1.1, sync y exchange comparten
infraestructura visual.

**Tareas:**
- [ ] Mostrar progreso de chunks (`i/total`) en el QR generador.
- [ ] Animación de "scanning…" mientras se reciben chunks.
- [ ] Resume desde la última chunk si se cierra la pestaña (TTL 10 min
      ya implementado).
- [ ] Confirm visual antes de aplicar (preview de qué va a cambiar).
- [ ] Manejar el caso "ya estás en la última versión" (no-op bonito).

**Costo:** M (3-5 días). **Riesgo:** medio (puede haber edge cases de
recepción de chunks).

### 1.4 Autodetección de colección por prefijo de código 🟡 P2

**Hoy:** los códigos se parsean con `code.ts` que extrae prefijo + número,
pero el "prefijo" es heurístico (mayúsculas hasta el primer dígito). No
hay asociación explícita con `teamId`.

**Por qué importa:** Poder preguntar "¿de qué equipo es esta figu?" y
que la app lo sepa automáticamente cuando el código es inequívoco.

**Tareas:**
- [ ] Mapear `code prefix` → `teamId` en el `CollectionPackage`.
- [ ] Si el código es ambiguo (ej. `USA15` puede ser team USA), usar el
      teamId de la primera match.
- [ ] UI: en `StickerDetailModal`, mostrar la asociación "code →
      team" como info adicional.

**Costo:** S. **Riesgo:** bajo.

### 1.5 Multi-cuenta (perfiles locales) 🟢 P3

**Hoy:** una instalación = un usuario. La "active collection" es
compartida.

**Por qué importa:** Una familia que comparte tablet quiere separar
"colección de María" de "colección de Juan".

**Tareas:**
- [ ] Perfil en `settingsStore` con `name` + `color`.
- [ ] Filtrar inventory y activity por perfil activo.
- [ ] Backup selectivo por perfil.
- [ ] Switch de perfil con PIN opcional (sin auth real, sólo gating
      local).

**Costo:** L (1-2 semanas). **Riesgo:** medio-alto (toca muchos
servicios, la DB necesita `profileId` en cada row).

**Nota:** Si se implementa, hay que migrar la DB a v3 con `profileId` en
todas las tablas.

### 1.6 Exportar/importar un solo collection (no todo el estado) 🟡 P2

**Hoy:** `backupService` exporta todo o nada. Un usuario con 5
colecciones quiere compartir UNA colección con un amigo.

**Por qué importa:** trade cross-collection (yo tengo WC, mi amigo
tiene Pokémon, podemos compartir lo que nos falta mutuamente).

**Tareas:**
- [ ] Nuevo endpoint en `backupService`: `exportCollection(id)`.
- [ ] Nuevo import: `importCollection(payload)` (merge con validación
      de Zod).
- [ ] UI en `CollectionsPage` → "Export" / "Import".
- [ ] Compatibilidad con `.albumbackup` v2 (campo opcional
      `singleCollection`).

**Costo:** S. **Riesgo:** bajo.

### 1.7 Catálogo público de colecciones 🟢 P3

**Hoy:** el manifest está hardcodeado en `public/collections/index.json`.
Agregar una colección requiere PR al repo.

**Por qué importa:** Cualquiera podría compartir su álbum Panini de
fútbol de barrio sin tener que forkear el repo.

**Tareas:**
- [ ] UI en `/collections` con un campo "Add collection by URL".
- [ ] Validación del package con `collectionPackageSchema` antes de
      instalar.
- [ ] Storage del URL original en la tabla `collections` (campo
      `sourceId` ya existe).
- [ ] Whitelist o warning si es de un origen no verificado.

**Costo:** M. **Riesgo:** medio (seguridad, validación de Zod
estricta).

---

## 2. Mejoras de UX

### 2.1 Onboarding first-launch con preview 🟠 P1

**Hoy:** `App.tsx` auto-instala WC2026 silenciosamente. El usuario ve la
app llena de stickers que no tiene.

**Por qué importa:** un primer launch con 0 stickers da una mejor
impresión. El usuario elige explícitamente qué colección instalar.

**Tareas:**
- [ ] `App.tsx` ya no llama `seedDefaultCollection` automáticamente;
      sólo si el usuario acepta.
- [ ] Nuevo paso en onboarding: "Welcome" → "Pick a collection to
      start" → "Installed!".
- [ ] Colecciones destacadas: WC2026, Pokémon 151, demo-mini.
- [ ] Opción "skip, start empty" para usuarios avanzados.

**Costo:** S. **Riesgo:** bajo.

### 2.2 Confirmar trades con preview de impacto 🟡 P2

**Hoy:** "Confirm trade" aplica los cambios inmediatamente. No hay
preview.

**Por qué importa:** antes de aceptar un trade, el usuario quiere ver
"después de esto: 12/30 owned, 18 missing, +3 duplicates".

**Tareas:**
- [ ] Calcular `previewStatistics` en `ExchangePage` antes de confirmar.
- [ ] Mostrar diff: "Owned: 10 → 12", "Missing: 20 → 18", etc.
- [ ] Si el trade rompe completion (raro pero posible), warning.

**Costo:** S. **Riesgo:** bajo.

### 2.3 Filtros guardados / recientes 🟢 P3

**Hoy:** los filtros se resetean al cambiar de colección.

**Tareas:**
- [ ] Persistir último filtro por colección en `settingsStore`.
- [ ] "Filtros recientes" dropdown en `FilterSheet`.
- [ ] Posibilidad de guardar filtros con nombre (ej. "Solo shinies",
      "Solo Argentina owned").

**Costo:** M. **Riesgo:** bajo.

### 2.4 Bulk reset por equipo / categoría 🟢 P3

**Hoy:** `resetInventory(cid)` borra TODO.

**Tareas:**
- [ ] `resetInventoryForTeam(cid, teamId)` y `resetInventoryForCategory(cid, category)`.
- [ ] UI en `SettingsPage` con confirm.

**Costo:** S. **Riesgo:** bajo.

---

## 3. Performance

### 3.1 Virtualización de la grilla de stickers 🟠 P1

**Hoy:** WC2026 tiene 396 stickers, Pokémon 151. La grilla renderiza
todos. Performance es OK con 396, pero empieza a pegar en Pokémon +
shinies (~200 con foil type).

**Tareas:**
- [ ] Adoptar `@tanstack/react-virtual` (o similar).
- [ ] Virtualizar `StickerGrid` con altura fija de item.
- [ ] Mantener sticky headers en `StickerGroups` (más tricky, requiere
      virtualización por sección).

**Costo:** M. **Riesgo:** bajo.

### 3.2 Migrar el OCR a streaming (no esperar a la foto completa) 🟡 P2

**Hoy:** el usuario toma foto → upload → Tesseract procesa toda la
imagen → resultado. Si la foto es grande, tarda.

**Tareas:**
- [ ] Procesar la imagen por chunks (split en 3-4 sub-imágenes).
- [ ] Mostrar progreso por chunk.
- [ ] Permitir cancelar.

**Costo:** M. **Riesgo:** medio.

### 3.3 Memoizar estadísticas con selectores finos 🟡 P2

**Hoy:** `useCollectionData` recalcula TODO cuando CUALQUIER cosa cambia
en la colección. Para WC2026 con 22 equipos, eso es ~10ms. No es
crítico, pero suma.

**Tareas:**
- [ ] Dividir `useCollectionData` en selectores más finos
      (`useStickers`, `useInventory`, `useStatistics`).
- [ ] Recalcular stats sólo cuando cambia inventory, no stickers.

**Costo:** S. **Riesgo:** bajo.

### 3.4 Code-split de páginas 🟢 P3

**Hoy:** todo el bundle (excepto `react`, `charts`, `ocr`, `qr`) está en
un chunk. Las páginas se importan eagerly a través del router.

**Tareas:**
- [ ] `lazy: () => import('./StickersPage')` en `router.tsx`.
- [ ] Validar que los `manualChunks` de Vite sigan haciendo sentido.

**Costo:** S. **Riesgo:** bajo.

---

## 4. Calidad / Tooling

### 4.1 Tests para las páginas restantes 🟠 P1

**Hoy:** specs E2E cubren 5 flujos. Páginas sin tests: `ExchangePage`,
`ScanPage`, `TournamentPage` (tiene uno parcial), `DonationsPage`.

**Tareas:**
- [ ] E2E para `ExchangePage` (paste list + compare + trade).
- [ ] E2E para `ScanPage` con imagen de fixture.
- [ ] E2E para `DonationsPage` copy-to-clipboard.
- [ ] Cobertura de componentes: `StickerGroups`, `StickerDetailModal`,
      `BulkImportModal`.

**Costo:** M. **Riesgo:** bajo.

### 4.2 Storybook para componentes UI 🟡 P2

**Tareas:**
- [ ] Setup mínimo de Storybook 8 con Vite.
- [ ] Stories para `ui/`, `stickers/`, `layout/`, `feedback/`.
- [ ] Chromatic o visual regression en CI.

**Costo:** M. **Riesgo:** bajo.

### 4.3 Migrar `react-hook-form` (si se usa) a la API actual 🟡 P2

**Hoy:** las dependencias están declaradas, sin uso activo visible.

**Tareas:**
- [ ] Decidir: ¿se queda o se va?
- [ ] Si se queda, usarlo en `BulkImportModal`, `PromptModal`, `SyncReceiveDialog`.
- [ ] Si se va, remover.

**Costo:** S. **Riesgo:** bajo.

### 4.4 Visual regression tests 🟢 P3

**Hoy:** Playwright E2E valida comportamiento, no pixels.

**Tareas:**
- [ ] Agregar `@playwright/test` + screenshots en specs clave.
- [ ] Threshold de diferencia (píxeles).

**Costo:** M. **Riesgo:** bajo.

### 4.5 Lint de TODOs en CI 🟢 P3

**Tareas:**
- [ ] `eslint-plugin-no-warning-comments` o custom rule.
- [ ] Fail CI si hay `FIXME` o `XXX` en src/.

**Costo:** S. **Riesgo:** bajo.

---

## 5. Accesibilidad (A11y)

### 5.1 Auditoría completa con axe 🟠 P1

**Hoy:** hay aria-labels puntuales, pero no auditoría sistemática.

**Tareas:**
- [ ] `@axe-core/playwright` en specs E2E.
- [ ] Resolver issues encontrados.
- [ ] Documentar en `docs/A11Y.md`.

**Costo:** M. **Riesgo:** bajo.

### 5.2 Navegación por teclado en el bracket 🟡 P2

**Hoy:** `BracketView` es mouse-only.

**Tareas:**
- [ ] `roving tabindex` en slots.
- [ ] `aria-live` para anunciar el resultado del match.

**Costo:** S. **Riesgo:** bajo.

### 5.3 Soporte de `prefers-reduced-motion` 🟡 P2

**Hoy:** las animaciones M3 corren siempre.

**Tareas:**
- [ ] Variantes en `tailwind.config.ts` o CSS.
- [ ] Respetar el setting del sistema operativo.

**Costo:** S. **Riesgo:** bajo.

---

## 6. Internacionalización

### 6.1 Agregar portugués (pt-BR) 🟡 P2

**Hoy:** `es`, `en`. Brasil es un mercado natural (figus de Copa
también).

**Tareas:**
- [ ] Traducir `locales/pt-BR.json`.
- [ ] Agregar a `SUPPORTED_LANGUAGES`.
- [ ] Validar encodings de fechas/números.

**Costo:** S. **Riesgo:** bajo.

### 6.2 i18n de las categorías, equipos y rareza 🟡 P2

**Hoy:** el manifest tiene `language` (idioma del package), pero las
categorías (`player`, `shiny`, etc.) no se traducen.

**Tareas:**
- [ ] Catálogo de traducciones en `locales/*.json` para categorías y
      rarezas conocidas.
- [ ] Usar `t('categories.player')` con fallback al string original.

**Costo:** S. **Riesgo:** bajo.

---

## 7. Distribuido y marketing

### 7.1 Página de "About" pública con instrucciones 🟡 P2

**Hoy:** `README.md` explica, pero es dev-facing.

**Tareas:**
- [ ] `/about` o markdown en la app.
- [ ] Video corto GIF de uso.
- [ ] Links a descarga / PWA install.

**Costo:** S. **Riesgo:** bajo.

### 7.2 Compartir el `.albumbackup` por Web Share API 🟡 P2

**Hoy:** download tradicional del archivo.

**Tareas:**
- [ ] Detectar `navigator.share` con `files`.
- [ ] Fallback a download.

**Costo:** S. **Riesgo:** bajo.

---

## 8. Plataforma y operaciones

### 8.1 Auto-update del service worker con toast de confirmación 🟠 P1

**Hoy:** `PwaUpdatePrompt` existe, hay que validar que el flujo de
"Reload" funcione bien y que el toast sea visible.

**Tareas:**
- [ ] Probar el flujo end-to-end en Chrome DevTools.
- [ ] Validar que el toast no se pierda detrás del FAB.
- [ ] Test e2e del update flow.

**Costo:** S. **Riesgo:** bajo.

### 8.2 Sentry / error tracking 🟠 P1

**Hoy:** cero observabilidad. Si un usuario tiene un error en OCR, no
sabemos.

**Tareas:**
- [ ] `@sentry/react` con `sendDefaultPii: false` (no PII, no
      tracking).
- [ ] Reportar errores no-fatales (OCR, sync, restore).
- [ ] Filtros: no enviar backup payloads a Sentry.

**Costo:** S. **Riesgo:** bajo (es opt-in vía DSN).

### 8.3 Bundle analysis en CI 🟢 P3

**Tareas:**
- [ ] `rollup-plugin-visualizer` en build.
- [ ] Comentar el output en PRs.

**Costo:** S. **Riesgo:** bajo.

---

## 9. Descarboxidados (decisiones tomadas)

- ❌ Backend con auth — el proyecto es local-first por diseño. No se
      va a hacer.
- ❌ Sincronización en la nube — la privacy es el selling point.
- ❌ Soporte IE11 / browsers viejos — el target es modern + PWA.
- ❌ Tests E2E en Safari/WebKit — flakiness alta, costo alto. Sólo
      Chromium + mobile-chrome por ahora.

---

## Cómo agregar un item al roadmap

1. Crear branch `feature/<nombre>`.
2. Agregar la fila en la sección correspondiente.
3. Ponerle prioridad (P0-P3) y estado (💡 idea → ✅ shipped).
4. Si requiere diseño previo, linkear un ADR en `docs/adr/`.
5. PR con title "roadmap: add <feature>".
