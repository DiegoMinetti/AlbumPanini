import { useTranslation } from 'react-i18next';
import type { OwnershipFilter, StickerFilter } from '@/services/filterService';
import { haptics } from '@/utils/haptics';
import { Icon } from '@/components/ui/Icon';
import { FilterChips } from './FilterChips';
import { SearchBar } from './SearchBar';

interface FilterBarProps {
  filter: StickerFilter;
  onChange: (next: StickerFilter) => void;
  /** Conteos por ownership (opcional). */
  counts?: Partial<Record<OwnershipFilter, number>>;
  /** Abre el sheet con los filtros avanzados (equipo, categoría, rareza). */
  onOpenFilters: () => void;
  /** Slots opcionales para controles extra alineados a la derecha del search. */
  rightOfSearch?: React.ReactNode;
}

/**
 * FilterBar M3 — barra de filtros compacta y sticky de la vista de figuritas.
 *
 * Layout:
 *   Fila 1 — SearchBar (M3 docked) full-width + slot `rightOfSearch` (opcional)
 *            para controles extra (segmented de vista, toggles, etc.).
 *   Fila 2 — FilterChips (segmented de ownership) + icon-button "Filtros" al
 *            final, con badge indicando cuántos filtros avanzados hay activos.
 *
 * La barra es `position: sticky` desde el padre (StickersPage) — el componente
 * en sí no la hace sticky, sólo aporta el contenido.
 */
export function FilterBar({
  filter,
  onChange,
  counts,
  onOpenFilters,
  rightOfSearch,
}: FilterBarProps) {
  const { t } = useTranslation();

  // Cantidad de filtros avanzados activos (badge sobre el botón "Filtros").
  const extraActiveCount =
    (filter.teamId ? 1 : 0) +
    (filter.category ? 1 : 0) +
    (filter.rarity ? 1 : 0);

  return (
    <div className="flex flex-col gap-2" data-testid="filter-bar">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchBar
            value={filter.search}
            onChange={(v) => onChange({ ...filter, search: v })}
          />
        </div>
        {rightOfSearch}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <FilterChips
            value={filter.ownership}
            onChange={(ownership) => onChange({ ...filter, ownership })}
            counts={counts}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            onOpenFilters();
          }}
          aria-label={t('stickers.moreFilters')}
          title={t('stickers.moreFilters')}
          aria-haspopup="dialog"
          className={`has-state-layer relative grid h-9 w-9 shrink-0 place-items-center
            overflow-hidden rounded-full transition-colors
            duration-motion-short2 ease-standard
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              extraActiveCount > 0
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
        >
          <Icon name="tune" size={18} />
          {extraActiveCount > 0 ? (
            <span
              className="absolute right-1 top-1 grid h-4 min-w-[1rem] place-items-center
                rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-on-primary"
              aria-label={`${extraActiveCount} active`}
            >
              {extraActiveCount}
            </span>
          ) : null}
          <span aria-hidden className="state-layer" />
        </button>
      </div>
    </div>
  );
}
