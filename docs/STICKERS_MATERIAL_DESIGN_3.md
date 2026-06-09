# Mejoras UX/UI · Sección de Figuritas

> Propuesta de rediseño visual y de interacción para la sección de **Figuritas** (`/stickers`),
> alineada con **Material Design 3 (M3)** de Google, sin romper la base actual
> (React 18 + TypeScript + TailwindCSS 3.4 + Zustand + IndexedDB).

---

## 0. Resumen ejecutivo

La sección de figuritas es el **núcleo funcional** de la app: el usuario pasa la mayor
parte del tiempo identificando figuritas, marcándolas como "tengo", filtrando y
haciendo cambios. Hoy tiene un look correcto pero plano: bordes sutiles, paleta
única de azul (`brand-*`), sin elevación semántica, sin estados de capa, sin
jerarquía tipográfica M3 y con controles (segmentos, stepper, filtros) que
podrían aprovechar los patrones canónicos de M3.

**Objetivos del rediseño:**

1. Adoptar un **sistema de tokens M3** (color/typography/elevation/motion) sobre
   el Tailwind existente, **sin reescribirlo** — se *extiende*.
2. Mejorar la **jerarquía visual** de las figuritas con elevación, esquinas y
   estados claros (owned / missing / duplicate / locked).
3. Aplicar los **componentes canónicos de M3** donde aporten valor: chips de
   filtro, FAB, segmented button con indicator, stepper con state layer,
   bottom sheet estándar, snackbar.
4. Reforzar la **accesibilidad** (contraste, focus visible, touch targets ≥ 48dp,
   labels ARIA) y el feedback háptico.
5. Mantener **cero impacto en la lógica de negocio** (`filterService`,
   `inventoryService`, hooks y Dexie): los cambios son puramente de presentación
   y tokens.

---

## 1. Auditoría del estado actual

| Aspecto | Estado actual | Gap respecto a M3 |
|---|---|---|
| **Color** | Paleta única `brand` (blue 50-900) + acentos sueltos (`emerald`, `amber`, `red`) | No hay roles semánticos (`primary`, `on-primary`, `surface`, `on-surface`, `surface-container`, `outline`, `error`...). El tema oscuro se "invierte" manualmente con `dark:`. |
| **Tipografía** | `font-bold` / `font-semibold` con clases `text-xs/sm/lg/2xl/3xl` ad-hoc | No hay escala *display/headline/title/body/label* ni roles tipográficos M3. |
| **Elevación** | `shadow-sm` para cards, `shadow-xl` para modal | No hay niveles 0/1/2/3/4/5. Cards con borde (`border-slate-200`) en vez de `surface-container`. |
| **Forma** | `rounded-xl` (12px) y `rounded-2xl` (16px) | M3 usa *extra-small 4 · small 8 · medium 12 · large 16 · extra-large 28 · full 999*. |
| **Botones** | `btn-primary` plano con gradiente, `btn-ghost` texto+icono | Faltan variantes *filled / tonal / outlined / text / icon-only* y state layer. |
| **Filtros** | `FilterBar` con selects nativos (`<select>`) | M3 *FilterChip* con icono de check, elevación tonal y clearable. |
| **Segmentos** | `SegmentedControl` con contenedor gris + botones con `shadow-sm` | M3 *SegmentedButton* con indicator animado y *state layer*. |
| **Stepper** | `QuantityStepper` con `+` / `−` en pill gris | M3 *Numeric stepper* con state layer, ripple, animaciones de morph. |
| **Cards** | Sticker como `<div>` con border gris y un ring de color por estado | M3 *Card variants* (elevated / filled / outlined) y *state layer* en tap. |
| **Acciones primarias** | Botón "Importar" en header | M3 usa un **FAB** (*Floating Action Button*) para la acción principal. |
| **Modal detalle** | `StickerDetailModal` con bottom-sheet custom | M3 *Modal bottom sheet* estándar con drag handle, snap points y scrim. |
| **Vibración háptica** | Implementada en `utils/haptics` | M3 *Haptic feedback* por tipo: selection, light impact, success, warning. |
| **Motion** | `animate-fade-in` / `animate-slide-up` ad-hoc | Faltan curvas M3 (*standard*, *emphasized*, *decelerate*, *accelerate*) y duraciones (short1-4, medium1-4, long1-4). |
| **A11y** | `aria-label` en iconos, `role="tablist"`, `role="progressbar"` | Falta `:focus-visible` ring unificado y touch targets garantizados ≥ 48dp. |

**Conclusión:** la base es sana (buenas prácticas de semántica, i18n, separación
de capas). Lo que falta es **formalizar un sistema de diseño M3** y aplicar sus
componentes canónicos en la sección de figuritas.

---

## 2. Sistema de tokens M3 (extensión de Tailwind)

M3 separa los tokens en **color roles**, **typography roles**, **elevation
levels**, **shape scale** y **motion**. La estrategia propuesta es *extender* el
`tailwind.config.ts` actual con estas familias, conservando `brand-*` como
*origen* del color primario y derivando el resto.

### 2.1. Color roles (M3)

Inspirado en M3, generamos **roles de color** light/dark a partir de la paleta
existente. El `primary` queda `brand-600` (la identidad Panini se mantiene);
los demás roles se construyen con tonos *neutral* y *secondary* (acento verde
para owned) y *tertiary* (acento ámbar para duplicates).

> Se incluye un patch completo en [`design-tokens.example.ts`](./design-tokens.example.ts)
> listo para aplicar.

```ts
// tailwind.config.ts (extracto)
theme: {
  extend: {
    colors: {
      // Roles semánticos M3 (light) — generados a partir de brand/emerald/amber
      primary:         'var(--md-sys-color-primary)',
      'on-primary':    'var(--md-sys-color-on-primary)',
      'primary-container':     'var(--md-sys-color-primary-container)',
      'on-primary-container':   'var(--md-sys-color-on-primary-container)',

      secondary:       'var(--md-sys-color-secondary)',
      'on-secondary':  'var(--md-sys-color-on-secondary)',
      'secondary-container':   'var(--md-sys-color-secondary-container)',
      'on-secondary-container': 'var(--md-sys-color-on-secondary-container)',

      tertiary:        'var(--md-sys-color-tertiary)',
      'on-tertiary':   'var(--md-sys-color-on-tertiary)',
      'tertiary-container':   'var(--md-sys-color-tertiary-container)',
      'on-tertiary-container': 'var(--md-sys-color-on-tertiary-container)',

      error:           'var(--md-sys-color-error)',
      'on-error':      'var(--md-sys-color-on-error)',
      'error-container':       'var(--md-sys-color-error-container)',
      'on-error-container':    'var(--md-sys-color-on-error-container)',

      surface:                'var(--md-sys-color-surface)',
      'on-surface':           'var(--md-sys-color-on-surface)',
      'surface-variant':      'var(--md-sys-color-surface-variant)',
      'on-surface-variant':   'var(--md-sys-color-on-surface-variant)',
      'surface-container-lowest': 'var(--md-sys-color-surface-container-lowest)',
      'surface-container-low':    'var(--md-sys-color-surface-container-low)',
      'surface-container':        'var(--md-sys-color-surface-container)',
      'surface-container-high':   'var(--md-sys-color-surface-container-high)',
      'surface-container-highest':'var(--md-sys-color-surface-container-highest)',

      outline:                'var(--md-sys-color-outline)',
      'outline-variant':      'var(--md-sys-color-outline-variant)',

      // Estados de figurita (semánticos) — se mapean a roles M3
      'sticker-owned':        'var(--md-sys-color-tertiary)',
      'sticker-duplicate':    'var(--md-sys-color-tertiary-container)',
      'sticker-missing':      'var(--md-sys-color-on-surface-variant)',
      'sticker-locked':       'var(--md-sys-color-outline-variant)',
    },
    borderRadius: {
      'xs':   '4px',
      'sm':   '8px',
      'md':   '12px',
      'lg':   '16px',
      'xl':   '28px',
      'full': '9999px',
    },
    boxShadow: {
      'elev-1': '0 1px 2px 0 rgba(0,0,0,.06), 0 1px 3px 1px rgba(0,0,0,.10)',
      'elev-2': '0 1px 2px 0 rgba(0,0,0,.06), 0 2px 6px 2px rgba(0,0,0,.12)',
      'elev-3': '0 1px 3px 0 rgba(0,0,0,.08), 0 4px 8px 3px rgba(0,0,0,.12)',
      'elev-4': '0 2px 3px 0 rgba(0,0,0,.08), 0 6px 10px 4px rgba(0,0,0,.14)',
      'elev-5': '0 4px 4px 0 rgba(0,0,0,.08), 0 8px 12px 6px rgba(0,0,0,.16)',
    },
    transitionTimingFunction: {
      'standard':   'cubic-bezier(0.2, 0, 0, 1)',
      'emphasized': 'cubic-bezier(0.2, 0, 0, 1)',
      'decelerate': 'cubic-bezier(0, 0, 0, 1)',
      'accelerate': 'cubic-bezier(0.3, 0, 1, 1)',
    },
  },
},
```

Las **CSS custom properties** se definen en `src/index.css` (ver
[`design-tokens.example.ts`](./design-tokens.example.ts) sección "CSS custom
properties"). El bloque light replica el actual con paleta M3; el dark
re-asigna los roles usando los tonos de `brand-*` invertidos.

### 2.2. Typography roles

M3 define 5 roles: **Display, Headline, Title, Body, Label** × tamaños
(L/M/S). Proponemos un set compacto para mobile-first:

```ts
// Nuevas utilidades .text-display-lg/md/sm, .text-headline-*, .text-title-*, .text-body-*, .text-label-*
// Ver snippets en design-tokens.example.ts
```

| Rol | Uso en stickers |
|---|---|
| `title-lg` | Título de página, "Figuritas" |
| `title-md` | Nombres de figurita en cards (legible, truncado a 2 líneas) |
| `title-sm` | Headers de sección agrupada (país) |
| `body-md` | Detalle de figurita (modal) |
| `body-sm` | Metadata: código, rareza, categoría |
| `label-lg` | Botones, FAB |
| `label-md` | Chips, badges |

### 2.3. Elevation

5 niveles ya mapeados (`elev-1` … `elev-5`). Regla de uso:

- `elev-0` (sin sombra) — `surface` (fondo)
- `elev-1` — `surface-container-low` (cards en reposo)
- `elev-2` — `surface-container` (cards en hover/press)
- `elev-3` — `surface-container-high` (filter chips activos, app bar)
- `elev-4` — `surface-container-highest` (FAB, dialogs)
- `elev-5` — modal bottom sheet expandido

### 2.4. Motion

| Token | Duración | Uso |
|---|---|---|
| `motion-short2` | 150ms | Ripple, state layer fade |
| `motion-short3` | 200ms | Hover, focus |
| `motion-medium2` | 300ms | Card press, indicator de segment |
| `motion-medium3` | 400ms | Bottom sheet slide |
| `motion-long2` | 500ms | Page transitions |

Curvas: `standard` por defecto, `emphasized` para transiciones de sheet/indicator,
`decelerate` para entradas, `accelerate` para salidas.

---

## 3. Mejoras por componente (sección Figuritas)

A continuación, las recomendaciones concretas. Para cada componente indico:
**estado actual → cambio propuesto → justificación M3 → snippet**.

### 3.1. `StickersPage` — layout y jerarquía

**Actual:** header sticky, `FilterBar`, `StickerGrid` con grid de 2/3/4/5 cols.

**Propuesto:**

- **Header M3 *Center-aligned top app bar*** (medium): título, subtítulo con
  nombre de colección y un slot de acciones a la derecha (filtro, búsqueda).
- **Buscar** como *Search bar* M3 (icono lupa + texto + clear), persistente.
- **Vista de búsqueda expandible** (`expand on focus`) que reemplaza al
  FilterBar mientras se tipea y muestra *resultados en tiempo real*.
- **FAB extendido** ("Importar") anclado abajo a la derecha, *above bottom nav*.
- **Sticky summary chip** flotante con conteo "Tengo X · Faltan Y".

> Justificación: el patrón *search → filter → results* + FAB es la recomendación
> canónica M3 para flujos de catálogo (ver "Lists" en m3.material.io).

```tsx
// StickersPage.tsx — esqueleto propuesto
<>
  <TopBar title={t('stickers.title')} subtitle={active?.name} />
  <SearchBar value={q} onChange={setQ} onClear={() => setQ('')} />
  <FilterChips
    ownership={ownership}
    onChange={setOwnership}
    onOpenSheet={() => setSheetOpen(true)}
  />
  <StickerGrid stickers={filtered} ... />
  <FloatingCount owned={n} missing={m} duplicates={d} />
  <Fab
    icon={<Icon name="upload" />}
    label={t('bulk.import')}
    onClick={() => setBulkOpen(true)}
  />
  <FilterSheet open={sheetOpen} onClose={...} />
</>
```

### 3.2. `FilterBar` → *FilterChips + FilterSheet*

**Actual:** selects HTML nativos en una fila horizontal.

**Propuesto:**

- **FilterChip horizontales** para los 4 ownerships (*All / Owned / Missing /
  Duplicates*). Chip activo: `secondary-container` con check a la izquierda.
  Conteo entre paréntesis (ej: *Owned (412)*).
- **Botón "More filters"** (chip con icono `tune`) que abre un **modal bottom
  sheet** M3 con los filtros restantes (team, category, rarity).
- Filtros activos se muestran como chips removibles arriba del grid.

```tsx
// FilterChips.m3.example.tsx (extracto)
<button
  type="button"
  className={[
    'inline-flex items-center gap-1.5 h-9 px-3 rounded-full',
    'text-label-lg transition-all duration-motion-short3 ease-standard',
    active
      ? 'bg-secondary-container text-on-secondary-container shadow-elev-1'
      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  ].join(' ')}
  role="tab"
  aria-selected={active}
>
  {active ? <Icon name="check" size={16} /> : null}
  <span>{label}</span>
  {count !== undefined ? (
    <span className="opacity-70 tabular-nums">({count})</span>
  ) : null}
</button>
```

> Justificación: las FilterChips son el patrón M3 para "filter & sort" en
> listas; son más rápidas de operar con una mano y muestran mejor la
> *affordance* que un `<select>`.

### 3.3. `SegmentedControl` → *SegmentedButton* con indicator

**Actual:** contenedor gris con botones, `shadow-sm` en el activo.

**Propuesto:**

- **Indicator M3** (slider) que se anima entre segmentos (transform + width).
- **State layer** (overlay `currentColor` al 8%/12%) en hover/press.
- **Iconos** opcionales a la izquierda de la label.
- Mantener `role="tablist"` y `aria-selected`.

```tsx
<SegmentedButton
  value={value}
  options={[
    { value: 'grid', icon: <Icon name="grid" />, label: t('stickers.grid') },
    { value: 'list', icon: <Icon name="list" />, label: t('stickers.list') },
  ]}
  onChange={setValue}
/>
```

> Justificación: M3 *Segmented button* estándar usa *icon + label*, el
> indicator se desliza con `transform` en lugar de aparecer un fondo sólido.

### 3.4. `StickerCard` — el corazón de la pantalla

**Actual:** `<div>` con `border` y un *ring* de color por estado. Sin
elevación. Imagen opcional con `bg-gradient-to-br`. Botones +/- siempre
visibles (si `editable`).

**Propuesto (M3 *Elevated Card*):**

- **Fondo:** `surface-container-low` con `shadow-elev-1` (en reposo).
- **Hover/press:** `surface-container` con `shadow-elev-2` + state layer.
- **Borde:** *ninguno* (M3 elevated card no lleva border; la elevación es
  suficiente). Variante *outlined* opcional para "missing" (con
  `outline-variant` punteado).
- **Esquinas:** `rounded-md` (12px) en M3 elevated.
- **Imagen:**
  - Tapa 60% del alto con `aspect-ratio: 3/4` (formato sticker).
  - Fallback M3: avatar con inicial sobre `primary-container`.
  - En loading: shimmer.
  - Borde superior coloreado según `rarity` (insignia 3dp).
- **Badge de cantidad:**
  - Owned (qty 1) → *Filled tonal* verde con tick.
  - Owned (qty > 1) → *Filled* verde con "+N" (tertiary container).
  - Missing → *Outlined* gris.
  - Duplicates > 1 → *Tonal* ámbar con "×N".
- **Botones de cantidad:**
  - Aparece al mantener presionada la card (long-press 250ms) **o** si
    `editMode=true`. En reposo: solo el badge.
  - Stepper M3 dentro de la card (ver §3.5).
- **Rarity:** chip pequeño en la esquina superior derecha, color por rareza
  (5 colores fijos derivados de la rareza).
- **Long-press** abre el detalle (Material *context menu*).

```tsx
<button
  className={[
    'group relative flex flex-col overflow-hidden rounded-md',
    'bg-surface-container-low shadow-elev-1',
    'hover:shadow-elev-2 active:shadow-elev-1',
    'transition-all duration-motion-medium2 ease-standard',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    state === 'missing' && 'opacity-80',
  ].join(' ')}
>
  <div className="relative aspect-[3/4] bg-surface-container-high">
    <StickerImage ... />
    <RarityBadge rarity={sticker.rarity} className="absolute top-2 right-2" />
    <QuantityBadge qty={qty} className="absolute top-2 left-2" />
  </div>
  <div className="flex flex-col gap-0.5 p-3 text-left">
    <span className="text-label-md text-on-surface-variant tabular-nums">
      {sticker.code}
    </span>
    <span className="text-title-sm text-on-surface line-clamp-2">
      {sticker.name}
    </span>
  </div>
  {/* state layer para hover/press */}
  <span
    aria-hidden
    className="pointer-events-none absolute inset-0 rounded-md bg-current opacity-0 group-hover:opacity-[0.08] group-active:opacity-[0.12] transition-opacity"
  />
</button>
```

> Justificación: la card deja de ser un "rectángulo con borde" para convertirse
> en un *contenedor con elevación real* (M3 elevated card). El **state layer**
> es la firma visual de M3: indica al usuario que el elemento es interactivo
> sin necesidad de outline pesado.

### 3.5. `QuantityStepper` → *Numeric stepper* M3

**Actual:** dos botones redondos en un contenedor pill, con un número en el
medio.

**Propuesto:**

- **Tres variantes:** *compact* (icon only, en cards), *inline* (con
  label), *modal* (con field outline).
- **State layer** en cada botón.
- **Haptic feedback** (selection click en iOS, effectClick en Android)
  en cada cambio de unidad. Long-press para auto-incrementar (cada 200ms
  con haptic tick).
- **Mínimo/máximo:** 0 y un máximo configurable (e.g. 99). En el máximo,
  *snackbar* "Llegaste al máximo".
- **Animación:** el número cambia con un *flip* sutil (no salta).

```tsx
<QuantityStepper
  value={qty}
  onChange={setQty}
  min={0}
  max={99}
  variant="compact"   // ó 'inline', 'modal'
  longPressAcceleration
/>
```

### 3.6. `StickerDetailModal` → *Modal bottom sheet* M3

**Actual:** `Modal` genérico, sin drag handle, sin snap points.

**Propuesto:**

- **Drag handle** arriba (24×4dp `outline-variant`).
- **Snap points**: 0.5 / 0.9 / full-height.
- **Scrim** con `surface` al 32% (no negro).
- **Header sticky** con avatar circular (imagen o inicial) + título + acción
  de cierre (`X`).
- **Cuerpo scrollable** con secciones *list* M3 (mínimo 56dp cada item):
  - *Datos* (código, rareza, categoría, equipo)
  - *Inventario* (cantidad con stepper grande)
  - *Acciones* (Marcar owned, Marcar missing, Abrir Wikipedia, Compartir)
- **Footer fijo** con dos botones M3: *Outlined* (secondary) y *Filled* (primary).

> Justificación: el modal es el patrón M3 de "vista ampliada" en apps de
> catálogo (ver Gmail / Photos). El drag handle y los snap points son
> esperados por usuarios iOS y Android.

### 3.7. `StickerGroups` → *Expandable sections* con jerarquía M3

**Actual:** `<details>` o un acordeón custom con banderitas emoji.

**Propuesto:**

- **Sección** con *header list item* M3 (56dp, leading icon/flag, headline
  pequeño, supporting text con `X/Y`).
- **Progress bar lineal** (4dp) debajo del título en `outline-variant`,
  rellena en `primary`.
- **Trailing chevron** rotando 90° con `motion-medium2`.
- **Contador de owned** a la derecha como *badge* tonal.
- Al expandir: *elevation transition* del header (de `elev-0` a `elev-1`).
- Soporte para **grouped (M3) o flat (legacy)** vía `stickerGrouped` (ya en
  settings — sólo mejoramos la apariencia).

### 3.8. `BulkImportModal` — atajo desde el FAB

**Actual:** se abre desde un botón en el header de la página.

**Propuesto:** pasar la acción primaria al **FAB**. Dentro del modal:

- **Text field outlined** con placeholder multi-línea.
- **Counter chip** en vivo: "Reconocidos 12 / 18".
- **Lista virtual de no reconocidos** con opción de ignorar/copiar al
  portapapeles.
- **Filled button** "Importar" deshabilitado hasta que haya al menos 1 match.

### 3.9. `EmptyState` y feedback

- **Empty state M3:** ilustración simple (ilustración Panini-friendly:
  silueta de sticker con signo `+`), *headline small* + *body medium* +
  *filled button* "Importar figuritas" (abre bulk import).
- **Toasts/Snackbars:** usar el componente `Snackbar` de M3 con acción
  (ej. "Deshacer") en lugar del toast genérico. El proyecto ya tiene
  `ToastViewport` — sólo cambiar estilos.

---

## 4. Detalles visuales de alto impacto

### 4.1. Color por rareza

Mapeo sugerido (derivado del `rarity` actual del tipo `StoredSticker`):

| Rareza | Token (light) | Token (dark) | Uso |
|---|---|---|---|
| `common` | `outline-variant` | `outline` | Borde, sin chip |
| `uncommon` | `tertiary` (verde) | `tertiary` | Chip tonal |
| `rare` | `primary` (azul) | `primary` | Chip tonal |
| `epic` | `secondary` (verde Panini) | `secondary` | Chip filled |
| `legendary` | gradiente dorado (custom) | gradiente dorado | Chip con shimmer |
| `special` | `error` | `error` | Chip tonal con icono |

### 4.2. Rarity shimmer

Animación opcional para `legendary`: keyframe `shimmer` que desplaza un
gradiente diagonal a lo largo del chip (3s, infinite, easing ease-in-out).
Respetar `prefers-reduced-motion` → versión sin animación.

### 4.3. Indicador de "lock" / read-only

Cuando `editMode=false`:
- Stepper reemplazado por un *badge* con icono `lock`.
- Snackbar único al intentar modificar: "Modo consulta: activación en
  *Ajustes → Editar*". (Ya existe `stickers.edit.readonly` en i18n.)
- Atajo rápido en el header: chip "Read-only" clickable que abre settings.

### 4.4. Drag-to-reorder en lista

Añadir gesture de **drag** en vista lista para reordenar prioridades
personales (e.g. "próximas a buscar"). Esto requiere nuevo modelo
(`priority?: number` en inventario) — opcional, fase 2.

### 4.5. Bulk action con long-press

Long-press sobre una figurita → entra en *selection mode* (M3
*Multi-select pattern*): app bar se reemplaza por *contextual app bar* con
conteo y acciones ("Marcar owned", "Marcar missing", "Eliminar", "Compartir
QR de selección"). Máximo 50 seleccionadas para mantener performance.

### 4.6. Skeleton loading

Reemplazar `<Spinner />` en `StickersPage` por **skeleton grid** con 6 cards
M3 placeholder: rectángulo gris con shimmer (`elev-1` + `surface-container`).
Resuelve el flash actual y se siente más rápido (M3 *perceived performance*).

### 4.7. Haptics

Reforzar el `utils/haptics.ts` con los eventos M3:

| Evento | Función |
|---|---|
| Selección de chip / segmento | `hapticSelection()` |
| Tap en FAB | `hapticLight()` |
| Stepper +/− | `hapticTick()` (suave) |
| Límite alcanzado (max) | `hapticWarning()` |
| Importación exitosa | `hapticSuccess()` |
| Error | `hapticError()` |

### 4.8. Focus visible

Definir un anillo global en `index.css`:

```css
*:focus-visible {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Complementar con `focus-visible:ring-2 ring-primary` en componentes
interactivos (chips, botones, cards, stepper).

---

## 5. Accesibilidad

| Ítem | Mejora |
|---|---|
| **Touch targets** | Garantizar ≥ 48×48dp en chips, stepper, FAB, icon buttons (revisar `min-h-tap`). |
| **Contraste** | Validar tokens con WCAG AA (4.5:1 body, 3:1 large). En particular `on-surface-variant` sobre `surface-container-low` en dark mode. |
| **Roles ARIA** | `role="listbox"` en el grid de stickers, `aria-setsize` / `aria-posinset`. `aria-label` dinámico en FAB ("Importar figuritas · hay 12 detectadas"). |
| **Reduced motion** | `motion-safe:animate-fade-in` y `motion-safe:animate-slide-up`; el shimmer de rareza legendaria se desactiva. |
| **Lectores de pantalla** | Anunciar cambios de cantidad: `<span className="sr-only">` con "Cantidad: {{qty}}, {{owned\|missing\|duplicate}}". |
| **Keyboard** | Grid navegable con flechas (pattern *Roving tabindex*); `Home`/`End` saltan al primero/último; `Enter` abre detalle. |

---

## 6. Roadmap de implementación

Dividido en sprints pequeños, **aditivos** (no rompen tests ni APIs públicas).
Todos los cambios están pensados para preservar los tests actuales de
`StickerCard.test.tsx` (los props `sticker`, `quantity`, `view`, `showImage`,
`editable`, `onIncrement`, `onDecrement` se mantienen; se agregan algunos
opcionales como `state` y `rarityColor`).

### Sprint 1 — *Tokens y base* (1–2 días)
- [ ] Extender `tailwind.config.ts` con la paleta M3 (roles, surfaces, outline).
- [ ] Definir CSS custom properties en `src/index.css`.
- [ ] Crear `src/styles/motion.css` con duraciones/curvas.
- [ ] Crear `src/styles/elevation.css` (alternativa: utilities en Tailwind).
- [ ] **No tocar** ningún componente todavía. Validar con `npm run build`.

### Sprint 2 — *Componentes UI primitivos* (2–3 días)
- [ ] Crear `<Button variant="filled|tonal|outlined|text" />`.
- [ ] Crear `<Chip variant="assist|filter|input|suggestion" />`.
- [ ] Crear `<IconButton />` con state layer.
- [ ] Crear `<SegmentedButton />` con indicator animado.
- [ ] Crear `<Fab variant="primary|secondary|tertiary|extended" />`.
- [ ] Tests unitarios para cada uno.

### Sprint 3 — *StickerCard refactor* (1–2 días)
- [ ] Reescribir `StickerCard` con M3 elevated card.
- [ ] Badges de cantidad tonal/filled según estado.
- [ ] RarityBadge con mapping de colores.
- [ ] Skeleton + shimmer para image loading.
- [ ] Mantener la API existente; los tests siguen pasando.

### Sprint 4 — *StickersPage & filtros* (2 días)
- [ ] Sustituir `FilterBar` por `FilterChips` + `FilterSheet`.
- [ ] Sustituir `SegmentedControl` por `SegmentedButton`.
- [ ] Añadir `SearchBar` con expand-on-focus.
- [ ] Añadir FAB "Importar" y mover BulkImportModal al FAB.
- [ ] Sticky count chip.

### Sprint 5 — *Modales, sheets y feedback* (1–2 días)
- [ ] Refactor `StickerDetailModal` con drag handle, snap points, footer M3.
- [ ] Refactor `BulkImportModal` con text field outlined y counter.
- [ ] Mejorar `EmptyState` con ilustración y CTA.
- [ ] Mejorar toasts a `Snackbar` con acción.

### Sprint 6 — *Polish & a11y* (1–2 días)
- [ ] Focus visible global.
- [ ] Haptics completos (selection, tick, success, warning, error).
- [ ] Reduced-motion: revisar todas las animaciones.
- [ ] Contraste WCAG AA verificado con herramienta (e.g. axe).
- [ ] Keyboard navigation en grid.
- [ ] E2E test del flujo: buscar → filtrar → marcar owned → ver en dashboard.

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambiar tokens rompe el dark mode actual | El dark mode se mantiene; los nuevos roles ya tienen su contraparte dark. Smoke-test todas las páginas con Playwright. |
| Tests existentes de `StickerCard` se rompen | API del componente no cambia; sólo estilos. La suite de tests seguirá pasando. |
| Performance del shimmer/shadow en devices viejos | Usar `will-change: transform` en indicator; limitar shimmer a `legendary`; `prefers-reduced-motion: reduce` desactiva. |
| Reordenar bulk action cambia el flujo del usuario | A/B opcional. Mantener el botón de header como atajo (secondary action). |
| Riesgo de over-design (demasiado M3 pierde calidez) | Mantener acentos cálidos en rareza legendaria y en el FAB primario. La identidad Panini no se reemplaza, se *armoniza*. |

---

## 8. Métricas de éxito

| Métrica | Antes | Objetivo |
|---|---|---|
| Time to mark "tengo" (1 figurita, mobile) | medir con Playwright | −20% |
| Errores de tap (stepper, FAB) | n/a | < 2% |
| Contraste WCAG AA | validar | 100% |
| Bounce en `/stickers` (sin auth, mock) | medir | −10% |
| Tests pasando | 100% | 100% (sin regresiones) |
| LCP en `/stickers` (mobile) | medir | ≤ 2.5s |

---

## 9. Referencias y archivos

- `tailwind.config.ts` (propuesta de extensión): [`design-tokens.example.ts`](./design-tokens.example.ts)
- `src/index.css` (CSS custom properties): ver bloque "CSS variables" en el
  archivo de tokens.
- Componentes refactorizados (ejemplos listos para adaptar):
  - [`StickerCard.m3.example.tsx`](./components/StickerCard.m3.example.tsx)
  - [`FilterChips.m3.example.tsx`](./components/FilterChips.m3.example.tsx)
  - [`Fab.m3.example.tsx`](./components/Fab.m3.example.tsx)
  - [`QuantityStepper.m3.example.tsx`](./components/QuantityStepper.m3.example.tsx)
  - [`SegmentedButton.m3.example.tsx`](./components/SegmentedButton.m3.example.tsx)
  - [`SearchBar.m3.example.tsx`](./components/SearchBar.m3.example.tsx)

Cada `.example.tsx` mantiene la firma del componente original (cuando existe)
y agrega props opcionales. Se puede copiar tal cual a `src/components/` y
empezar a usar.

---

## 10. Próximo paso sugerido

Empezar por el **Sprint 1** (tokens + base) ya que no toca componentes y
desbloquea todo lo demás. Después el **Sprint 3** (`StickerCard`) que es la
pieza con mayor impacto visual y la más visible para el usuario.
