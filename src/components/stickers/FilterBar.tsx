import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredTeam } from '@/types/collection';
import {
  type OwnershipFilter,
  type StickerFilter,
} from '@/services/filterService';
import { Icon } from '@/components/ui/Icon';
import { FilterChips } from './FilterChips';
import { SearchBar } from './SearchBar';

interface FilterBarProps {
  filter: StickerFilter;
  onChange: (next: StickerFilter) => void;
  teams: StoredTeam[];
  categories: string[];
  rarities: string[];
  /** Optional per-filter counts for the chip badges. */
  counts?: Partial<Record<OwnershipFilter, number>>;
}

export function FilterBar({
  filter,
  onChange,
  teams,
  categories,
  rarities,
  counts,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // Count of active dropdown filters so the toggle can show a badge.
  const activeCount =
    (filter.teamId ? 1 : 0) +
    (filter.category ? 1 : 0) +
    (filter.rarity ? 1 : 0);

  const clearAdvanced = () =>
    onChange({ ...filter, teamId: null, category: null, rarity: null });

  /**
   * Translate a category/rarity raw value (e.g. "player", "rare") to the
   * localized label. Falls back to the raw value so that custom collection
   * categories not covered by the canonical set still render something
   * sensible instead of an empty string.
   */
  const translateValue = (prefix: 'categoryOptions' | 'rarityOptions', value: string) =>
    t(`stickers.${prefix}.${value}`, { defaultValue: value });

  return (
    <div className="flex flex-col gap-3" data-testid="filter-bar">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchBar
            value={filter.search}
            onChange={(v) => onChange({ ...filter, search: v })}
          />
        </div>
        <button
          type="button"
          className="has-state-layer relative grid h-12 w-12 shrink-0 place-items-center
            overflow-hidden rounded-full bg-surface-container text-on-surface
            transition-colors duration-motion-short2 ease-standard
            hover:bg-surface-container-high
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-expanded={open}
          aria-label={t('stickers.filters')}
          title={t('stickers.filters')}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="tune" size={20} />
          {activeCount > 0 ? (
            <span
              className="absolute right-1 top-1 grid h-5 min-w-[1.25rem] place-items-center
                rounded-full bg-primary px-1 text-[11px] font-bold text-on-primary"
              aria-label={`${activeCount} active`}
            >
              {activeCount}
            </span>
          ) : null}
          <span aria-hidden className="state-layer" />
        </button>
      </div>

      <FilterChips
        value={filter.ownership}
        onChange={(ownership) => onChange({ ...filter, ownership })}
        counts={counts}
      />

      {open ? (
        <div className="flex animate-slide-up flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className="input"
              aria-label={t('stickers.team')}
              value={filter.teamId ?? ''}
              onChange={(e) =>
                onChange({ ...filter, teamId: e.target.value || null })
              }
            >
              <option value="">{t('stickers.team')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.flag ? `${team.flag} ` : ''}
                  {team.name}
                </option>
              ))}
            </select>

            <select
              className="input"
              aria-label={t('stickers.category')}
              value={filter.category ?? ''}
              onChange={(e) =>
                onChange({ ...filter, category: e.target.value || null })
              }
            >
              <option value="">{t('stickers.categoryAll')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {translateValue('categoryOptions', cat)}
                </option>
              ))}
            </select>

            <select
              className="input"
              aria-label={t('stickers.rarity')}
              value={filter.rarity ?? ''}
              onChange={(e) =>
                onChange({ ...filter, rarity: e.target.value || null })
              }
            >
              <option value="">{t('stickers.rarityAll')}</option>
              {rarities.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {translateValue('rarityOptions', rarity)}
                </option>
              ))}
            </select>
          </div>

          {activeCount > 0 ? (
            <button
              type="button"
              className="btn-ghost gap-1 self-end px-3 text-xs"
              onClick={clearAdvanced}
            >
              <Icon name="close" size={16} />
              {t('common.clear')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
