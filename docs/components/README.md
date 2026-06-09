# Componentes M3 · Stickers (referencia)

> **⚠️ Esta carpeta es documentación, no código de la app.**
> Los archivos `*.m3.example.tsx` son **snippets de referencia** listos para
> copiarse a `src/components/` cuando se implemente la propuesta descrita en
> [`../STICKERS_MATERIAL_DESIGN_3.md`](../STICKERS_MATERIAL_DESIGN_3.md).

## Por qué viven en `docs/`

- No deben compilarse ni ser parte del bundle (los imports `@/...` apuntan a
  `src/` y se resuelven sólo cuando se copian a su ubicación real).
- Permiten versionar la propuesta en Git sin afectar `npm run build` ni
  `tsc`/`vitest`.
- El `.example.tsx` final es deliberado: indica que es código a **adaptar**,
  no a importar directamente.

## Cómo aplicar cada uno

1. **Tokens** (obligatorio, Sprint 1): copiar el bloque de
   `design-tokens.example.ts` → `tailwind.config.ts` + `src/index.css`.
2. **StickerCard** (mayor impacto visual): copiar
   `StickerCard.m3.example.tsx` → `src/components/stickers/StickerCard.tsx`
   y revisar que la API siga siendo compatible con
   `StickerCard.test.tsx` (todos los props originales se conservan).
3. **FilterChips**: `src/components/stickers/FilterChips.tsx`. Pensado para
   reemplazar a `FilterBar.tsx` (mantener el viejo para rollback).
4. **Fab**: `src/components/ui/Fab.tsx`. Nuevo. Usar en `StickersPage` para
   la acción "Importar".
5. **QuantityStepper**: reemplazar `src/components/stickers/QuantityStepper.tsx`.
6. **SegmentedButton**: reemplazar el `SegmentedControl` actual.
7. **SearchBar**: nuevo, en `src/components/stickers/SearchBar.tsx`.

## Convenciones aplicadas

- **State layer M3**: el `<span className="state-layer" />` depende del CSS
  que viene en `design-tokens.example.ts → cssVariables`. Sin esos estilos,
  la card no muestra el feedback visual de hover/press.
- **Tipografía M3**: las clases `text-title-sm`, `text-label-md`, etc.
  provienen de `design-tokens.example.ts → typographyUtilities`.
- **Tokens de color**: las clases `bg-surface-container-low`,
  `bg-secondary-container`, `text-on-tertiary-container`, etc. requieren la
  extensión de `tailwind.config.ts` propuesta.
- **Imports `hapticTick` / `hapticWarning`**: existen en `src/utils/haptics.ts`.
  Si no están, ver §4.7 del documento principal.

## Tests

Los tests existentes (Vitest + Playwright) deberían seguir pasando porque:

- La API pública de los componentes refactorizados **no cambia** (mismos
  props, mismos eventos).
- Los cambios son puramente de presentación.

Si algún test falla, probablemente sea por un cambio de texto en
`aria-label` o por la adición de un `<span>` extra; ajustar en
consecuencia.
