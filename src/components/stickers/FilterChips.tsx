import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';
import type { OwnershipFilter } from '@/services/filterService';
import { haptics } from '@/utils/haptics';

interface FilterChipsProps {
  value: OwnershipFilter;
  onChange: (next: OwnershipFilter) => void;
  counts?: Partial<Record<OwnershipFilter, number>>;
}

const ORDER: OwnershipFilter[] = ['all', 'owned', 'missing', 'duplicates'];

/**
 * Fila horizontal de FilterChips (M3) para los 4 estados de ownership.
 * Reemplaza al SegmentedControl del FilterBar: mejor affordance en touch,
 * muestra el conteo, y permite añadir/quitar más chips en el futuro.
 */
export function FilterChips({ value, onChange, counts }: FilterChipsProps) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('stickers.filters')}
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {ORDER.map((filter) => {
        const active = value === filter;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) haptics.selection();
              onChange(filter);
            }}
            className={[
              'group relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden',
              'rounded-lg px-3 text-sm font-medium',
              'transition-all duration-motion-short3 ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'bg-secondary-container text-on-secondary-container shadow-elev-1'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
            ].join(' ')}
          >
            {active ? <Icon name="check" size={16} /> : null}
            <span>{t(`stickers.filter.${filter}`)}</span>
            {counts?.[filter] !== undefined ? (
              <span className="opacity-70 tabular-nums">
                ({counts[filter]})
              </span>
            ) : null}
            <span aria-hidden className="state-layer" />
          </button>
        );
      })}
    </div>
  );
}
