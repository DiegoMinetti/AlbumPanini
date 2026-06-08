import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredTeam } from '@/types/collection';
import {
  type OwnershipFilter,
  type StickerFilter,
} from '@/services/filterService';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Icon } from '@/components/ui/Icon';

interface FilterBarProps {
  filter: StickerFilter;
  onChange: (next: StickerFilter) => void;
  teams: StoredTeam[];
  categories: string[];
  rarities: string[];
}

export function FilterBar({
  filter,
  onChange,
  teams,
  categories,
  rarities,
}: FilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const ownershipOptions: { value: OwnershipFilter; label: string }[] = [
    { value: 'all', label: t('stickers.filter.all') },
    { value: 'missing', label: t('stickers.filter.missing') },
    { value: 'owned', label: t('stickers.filter.owned') },
    { value: 'duplicates', label: t('stickers.filter.duplicates') },
  ];

  // Count of active dropdown filters so the toggle can show a badge.
  const activeCount =
    (filter.teamId ? 1 : 0) +
    (filter.category ? 1 : 0) +
    (filter.rarity ? 1 : 0);

  const clearAdvanced = () =>
    onChange({ ...filter, teamId: null, category: null, rarity: null });

  return (
    <div className="flex flex-col gap-3" data-testid="filter-bar">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            className="input pl-10"
            placeholder={t('common.search')}
            value={filter.search}
            onChange={(e) => onChange({ ...filter, search: e.target.value })}
            aria-label={t('common.search')}
          />
        </div>
        <button
          type="button"
          className="btn-secondary relative px-3"
          aria-expanded={open}
          aria-label={t('stickers.filters')}
          title={t('stickers.filters')}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="tune" size={20} />
          {activeCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      <SegmentedControl
        ariaLabel={t('stickers.filters')}
        options={ownershipOptions}
        value={filter.ownership}
        onChange={(ownership) => onChange({ ...filter, ownership })}
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
              <option value="">{t('stickers.category')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
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
              <option value="">{t('stickers.rarity')}</option>
              {rarities.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
          </div>

          {activeCount > 0 ? (
            <button
              type="button"
              className="btn-ghost self-end gap-1 px-3 text-xs"
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
