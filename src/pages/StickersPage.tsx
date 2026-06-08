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
  isExtraSticker,
  sortByAlbumOrder,
  type StickerFilter,
} from '@/services/filterService';
import {
  incrementSticker,
  decrementSticker,
} from '@/services/inventoryService';
import { FilterBar } from '@/components/stickers/FilterBar';
import { StickerGrid } from '@/components/stickers/StickerGrid';
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
  const includeExtras = useSettingsStore((s) => s.includeExtras);
  const setIncludeExtras = useSettingsStore((s) => s.setIncludeExtras);

  const [filter, setFilter] = useState<StickerFilter>(DEFAULT_FILTER);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<StoredSticker | null>(null);

  // Album-ordered base set: optionally drop region-specific "extra" variants.
  const baseStickers = useMemo(() => {
    const visible = includeExtras
      ? stickers
      : stickers.filter((s) => !isExtraSticker(s));
    return sortByAlbumOrder(visible);
  }, [stickers, includeExtras]);

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

  if (loadingActive) return <Spinner />;
  if (!active) return <NoActiveCollection />;

  const collectionId = active.id;

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

      <FilterBar
        filter={filter}
        onChange={setFilter}
        teams={teams}
        categories={categories}
        rarities={rarities}
        includeExtras={includeExtras}
        onIncludeExtrasChange={setIncludeExtras}
      />

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title={t('stickers.noResults')} />
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
