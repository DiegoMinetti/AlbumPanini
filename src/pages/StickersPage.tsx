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
import { Icon } from '@/components/ui/Icon';
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
  const editMode = useSettingsStore((s) => s.editMode);
  const setEditMode = useSettingsStore((s) => s.setEditMode);

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
  const teamColorsById = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.id,
          {
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor,
          },
        ])
      ),
    [teams]
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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={`px-3 ${editMode ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={editMode}
            aria-label={
              editMode ? t('stickers.edit.lock') : t('stickers.edit.unlock')
            }
            title={
              editMode ? t('stickers.edit.lock') : t('stickers.edit.unlock')
            }
            onClick={() => setEditMode(!editMode)}
          >
            <Icon name={editMode ? 'lock_open' : 'lock'} size={20} />
          </button>
          <button
            type="button"
            className="btn-secondary px-3"
            disabled={!editMode}
            aria-label={t('bulk.title')}
            title={editMode ? t('bulk.title') : t('stickers.edit.readonly')}
            onClick={() => {
              if (!editMode) return;
              setBulkOpen(true);
            }}
          >
            <Icon name="playlist_add" size={20} />
          </button>
          <button
            type="button"
            className={`px-3 ${grouped ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={grouped}
            aria-label={
              grouped ? t('stickers.groups.flat') : t('stickers.groups.toggle')
            }
            title={
              grouped ? t('stickers.groups.flat') : t('stickers.groups.toggle')
            }
            onClick={() => setGrouped(!grouped)}
          >
            <Icon name="layers" size={20} />
          </button>
          <div className="w-[5.5rem]">
            <SegmentedControl
              ariaLabel={t('stickers.view')}
              options={[
                {
                  value: 'grid',
                  label: <Icon name="grid_view" size={20} />,
                  ariaLabel: t('stickers.grid'),
                },
                {
                  value: 'list',
                  label: <Icon name="view_list" size={20} />,
                  ariaLabel: t('stickers.list'),
                },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
        </div>
      </div>

      {grouped && !forceExpand ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn-secondary gap-1 px-3 text-xs"
            onClick={expandAll}
          >
            <Icon name="unfold_more" size={16} />
            {t('stickers.groups.expandAll')}
          </button>
          <button
            type="button"
            className="btn-secondary gap-1 px-3 text-xs"
            onClick={collapseAll}
          >
            <Icon name="unfold_less" size={16} />
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
        <EmptyState
          icon={<Icon name="search" size={36} className="text-slate-400" />}
          title={t('stickers.noResults')}
        />
      ) : grouped ? (
        <StickerGroups
          sections={sections}
          inventory={inventory}
          teamColorsById={teamColorsById}
          view={view}
          showImages={showImages}
          editable={editMode}
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
          teamColorsById={teamColorsById}
          view={view}
          showImages={showImages}
          editable={editMode}
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
