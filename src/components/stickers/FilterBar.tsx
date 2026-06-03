import { useTranslation } from 'react-i18next';
import type { StoredTeam } from '@/types/collection';
import {
  type OwnershipFilter,
  type StickerFilter,
} from '@/services/filterService';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

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

  const ownershipOptions: { value: OwnershipFilter; label: string }[] = [
    { value: 'all', label: t('stickers.filter.all') },
    { value: 'missing', label: t('stickers.filter.missing') },
    { value: 'owned', label: t('stickers.filter.owned') },
    { value: 'duplicates', label: t('stickers.filter.duplicates') },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="filter-bar">
      <input
        type="search"
        className="input"
        placeholder={t('common.search')}
        value={filter.search}
        onChange={(e) => onChange({ ...filter, search: e.target.value })}
        aria-label={t('common.search')}
      />

      <SegmentedControl
        ariaLabel={t('stickers.filters')}
        options={ownershipOptions}
        value={filter.ownership}
        onChange={(ownership) => onChange({ ...filter, ownership })}
      />

      <div className="grid grid-cols-3 gap-2">
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
    </div>
  );
}
