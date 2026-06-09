import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OwnershipFilter } from '@/services/filterService';
import { haptics } from '@/utils/haptics';

interface FilterChipsProps {
  value: OwnershipFilter;
  onChange: (next: OwnershipFilter) => void;
  counts?: Partial<Record<OwnershipFilter, number>>;
}

const ORDER: OwnershipFilter[] = ['all', 'owned', 'missing', 'duplicates'];

/**
 * FilterChips M3 — selector segmentado compacto de ownership
 * (Todas / Tengo / Faltan / Repetidas).
 *
 * M3 SegmentedButton: un único indicator (`bg-secondary-container`) que se
 * desliza entre los 4 segmentos. Los botones son transparentes — la
 * selección la lleva el indicator, no el botón. Cada botón tiene su
 * propio state layer M3 al hover/press.
 *
 * El botón para abrir los filtros avanzados (icono "tune" con badge) se
 * renderiza como icono aparte desde `FilterBar`, no como chip, para que
 * la fila de ownership quede visualmente limpia.
 */
export function FilterChips({ value, onChange, counts }: FilterChipsProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number }>({
    x: 0,
    w: 0,
  });

  // Recalcular posición/tamaño del indicator al montar y al cambiar la selección.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      `[data-chip-value="${value}"]`
    );
    if (!active) return;
    const rootRect = root.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    setIndicator({ x: aRect.left - rootRect.left, w: aRect.width });
  }, [value]);

  const handleChange = (next: OwnershipFilter) => {
    if (next !== value) haptics.selection();
    onChange(next);
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={t('stickers.filters')}
      className="relative inline-flex w-full items-center gap-1 overflow-x-auto
        rounded-lg bg-surface-container p-1"
    >
      <span
        aria-hidden
        className="segmented-indicator"
        style={{
          transform: `translateX(${indicator.x}px)`,
          width: `${indicator.w}px`,
        }}
      />
      {ORDER.map((filter) => {
        const active = value === filter;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            data-chip-value={filter}
            aria-selected={active}
            onClick={() => handleChange(filter)}
            className={[
              'group relative z-10 flex min-h-[36px] shrink-0 items-center justify-center gap-1',
              'overflow-hidden rounded-md px-2.5 text-label-md whitespace-nowrap',
              'transition-colors duration-motion-short3 ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'text-on-secondary-container'
                : 'text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            <span>{t(`stickers.filter.${filter}`)}</span>
            {counts?.[filter] !== undefined ? (
              <span className="opacity-70 tabular-nums">({counts[filter]})</span>
            ) : null}
            <span aria-hidden className="state-layer" />
          </button>
        );
      })}
    </div>
  );
}
