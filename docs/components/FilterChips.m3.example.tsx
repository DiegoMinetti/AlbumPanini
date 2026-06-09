import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/Icon';
import type { OwnershipFilter } from '@/services/filterService';

interface FilterChipsProps {
  value: OwnershipFilter;
  onChange: (value: OwnershipFilter) => void;
  /** Conteos por filtro (mostrados como "Owned (412)"). */
  counts?: Partial<Record<OwnershipFilter, number>>;
  /** Abre el sheet con filtros adicionales (team, category, rarity). */
  onOpenMore?: () => void;
  /** Cantidad de filtros "extra" activos (badge en "More"). */
  extraActiveCount?: number;
}

const ORDER: OwnershipFilter[] = ['all', 'owned', 'missing', 'duplicates'];

/**
 * FilterChips (M3) — fila horizontal de chips de ownership + "More filters".
 * Reemplaza a FilterBar con `<select>` para los 4 estados principales.
 */
export function FilterChips({
  value,
  onChange,
  counts,
  onOpenMore,
  extraActiveCount = 0,
}: FilterChipsProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 py-2"
      role="tablist"
      aria-label={t('stickers.filters')}
    >
      {ORDER.map((filter) => (
        <FilterChip
          key={filter}
          active={value === filter}
          label={t(`stickers.filter.${filter}`)}
          count={counts?.[filter]}
          onClick={() => onChange(filter)}
        />
      ))}

      {onOpenMore && (
        <FilterChip
          active={extraActiveCount > 0}
          label={t('stickers.filters')}
          icon={<Icon name="tune" size={16} />}
          trailingBadge={extraActiveCount > 0 ? extraActiveCount : undefined}
          onClick={onOpenMore}
        />
      )}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  trailingBadge?: number;
  onClick: () => void;
}

export function FilterChip({
  active,
  label,
  icon,
  count,
  trailingBadge,
  onClick,
}: FilterChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'group relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg px-3',
        'text-label-lg transition-all duration-motion-short3 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'bg-secondary-container text-on-secondary-container shadow-elev-1'
          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
      ].join(' ')}
    >
      {active ? <Icon name="check" size={16} /> : icon}
      <span>{label}</span>
      {count !== undefined && (
        <span className="opacity-70 tabular-nums">({count})</span>
      )}
      {trailingBadge !== undefined && (
        <span className="ml-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-primary px-1.5 text-label-sm text-on-primary">
          {trailingBadge}
        </span>
      )}
      <span aria-hidden className="state-layer" />
    </button>
  );
}
