import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { useCollectionData } from '@/hooks/useCollectionData';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_FILTER,
  distinctCategories,
  distinctRarities,
  filterStickers,
  groupStickersByTournament,
  sectionKeys,
  sortByAlbumOrder,
  type StickerFilter,
} from '@/services/filterService';
import {
  incrementSticker,
  decrementSticker,
} from '@/services/inventoryService';
import { FilterBar } from '@/components/stickers/FilterBar';
import { StickerGrid } from '@/components/stickers/StickerGrid';
import { StickerGroups } from '@/components/stickers/StickerGroups';
import { StickerDetailModal } from '@/components/stickers/StickerDetailModal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { BulkImportModal } from '@/components/stickers/BulkImportModal';
import type { StoredSticker } from '@/types/collection';

export function StickersPage() {
  const { t } = useTranslation();
  const { active, loading: loadingActive } = useActiveCollection();
  const { stickers, teams, inventory, loading } = useCollectionData(
    active?.id ?? null
  );
  const view = useSettingsStore((s) => s.stickerView);
  const setView = useSettingsStore((s) => s.setStickerView);
  const showImages = useSettingsStore((s) => s.showImages);
  const grouped = useSettingsStore((s) => s.stickerGrouped);
  const setGrouped = useSettingsStore((s) => s.setStickerGrouped);

  const [filter, setFilter] = useState<StickerFilter>(DEFAULT_FILTER);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<StoredSticker | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Album-ordered base set. Region-specific "extra" variants are already
  // filtered by useCollectionData based on the collection's includeExtras flag.
  const baseStickers = useMemo(() => sortByAlbumOrder(stickers), [stickers]);

  const categories = useMemo(
    () => distinctCategories(baseStickers),
    [baseStickers]
  );
  const rarities = useMemo(
    () => distinctRarities(baseStickers),
    [baseStickers]
  );
  const filtered = useMemo(
    () => filterStickers(baseStickers, inventory, filter),
    [baseStickers, inventory, filter]
  );
  const sections = useMemo(
    () =>
      grouped
        ? groupStickersByTournament(
            filtered,
            teams,
            active?.tournament?.groups ?? []
          )
        : [],
    [grouped, filtered, teams, active?.tournament?.groups]
  );
  // While searching, force every section open so matches are never hidden.
  const forceExpand = filter.search.trim().length > 0;

  if (loadingActive) return <Spinner />;
  if (!active) return <NoActiveCollection />;

  const collectionId = active.id;

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const collapseAll = () => setCollapsed(new Set(sectionKeys(sections)));
  const expandAll = () => setCollapsed(new Set());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {t('stickers.count', { count: filtered.length })}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setBulkOpen(true)}
          >
            {t('bulk.title')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
          >
            {grouped ? t('stickers.groups.flat') : t('stickers.groups.toggle')}
          </button>
          <div className="w-28">
            <SegmentedControl
              ariaLabel={t('stickers.view')}
              options={[
                { value: 'grid', label: t('stickers.grid') },
                { value: 'list', label: t('stickers.list') },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
        </div>
      </div>

      {grouped && !forceExpand ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={expandAll}
          >
            {t('stickers.groups.expandAll')}
          </button>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={collapseAll}
          >
            {t('stickers.groups.collapseAll')}
          </button>
        </div>
      ) : null}

      <FilterBar
        filter={filter}
        onChange={setFilter}
        teams={teams}
        categories={categories}
        rarities={rarities}
      />

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title={t('stickers.noResults')} />
      ) : grouped ? (
        <StickerGroups
          sections={sections}
          inventory={inventory}
          view={view}
          showImages={showImages}
          collapsed={collapsed}
          onToggle={toggleGroup}
          forceExpand={forceExpand}
          onIncrement={(id) => void incrementSticker(collectionId, id)}
          onDecrement={(id) => void decrementSticker(collectionId, id)}
          onSelect={setSelected}
        />
      ) : (
        <StickerGrid
          stickers={filtered}
          inventory={inventory}
          view={view}
          showImages={showImages}
          onIncrement={(id) => void incrementSticker(collectionId, id)}
          onDecrement={(id) => void decrementSticker(collectionId, id)}
          onSelect={setSelected}
        />
      )}

      <StickerDetailModal
        sticker={selected}
        quantity={selected ? (inventory.get(selected.id) ?? 0) : 0}
        onClose={() => setSelected(null)}
      />

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        collectionId={collectionId}
      />
    </div>
  );
}
