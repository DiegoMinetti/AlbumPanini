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
  type OwnershipFilter,
  type StickerFilter,
} from '@/services/filterService';
import {
  incrementSticker,
  decrementSticker,
} from '@/services/inventoryService';
import { FilterBar } from '@/components/stickers/FilterBar';
import { FilterSheet } from '@/components/stickers/FilterSheet';
import { StickerGrid } from '@/components/stickers/StickerGrid';
import { StickerGroups } from '@/components/stickers/StickerGroups';
import { StickerDetailModal } from '@/components/stickers/StickerDetailModal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Fab } from '@/components/ui/Fab';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { BulkImportModal } from '@/components/stickers/BulkImportModal';
import { haptics } from '@/utils/haptics';
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
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

  /**
   * Conteo de figuritas por filtro de ownership (para los chips).
   * Se calcula sobre el set base (sin aplicar el filtro actual de ownership),
   * así el usuario ve siempre cuántas tiene/falta/repite en total.
   */
  const counts = useMemo<Partial<Record<OwnershipFilter, number>>>(() => {
    const all = filterStickers(baseStickers, inventory, {
      ...DEFAULT_FILTER,
      search: filter.search,
      teamId: filter.teamId,
      category: filter.category,
      rarity: filter.rarity,
    });
    return {
      all: all.length,
      owned: all.filter((s) => (inventory.get(s.id) ?? 0) > 0).length,
      missing: all.filter((s) => (inventory.get(s.id) ?? 0) === 0).length,
      duplicates: all.filter((s) => (inventory.get(s.id) ?? 0) > 1).length,
    };
  }, [
    baseStickers,
    inventory,
    filter.search,
    filter.teamId,
    filter.category,
    filter.rarity,
  ]);

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

  const inc = (id: string) => void incrementSticker(collectionId, id);
  const dec = (id: string) => void decrementSticker(collectionId, id);

  const toggleEdit = () => {
    haptics.selection();
    setEditMode(!editMode);
  };
  const toggleGrouped = () => {
    haptics.selection();
    setGrouped(!grouped);
  };

  return (
    <div className="flex flex-col gap-3">
      {/*
        Sticky top toolbar (M3 top app bar / search bar pattern).
        - `top-[var(--app-topbar-h,0px)]` lo posiciona inmediatamente debajo
          del TopBar (cuya altura publica esa CSS var con un ResizeObserver).
        - `-mx-4` cancela el `px-4` del <main> para que el fondo cubra todo
          el ancho; `px-4` interior restaura el padding.
        - `bg-surface/55` + `backdrop-blur-lg` da el efecto de transparencia
          que el usuario pidió (M3 translucent app bar sobre contenido).
      */}
      <header
        className="sticky top-[var(--app-topbar-h,0px)] z-30 -mx-4
          border-b border-outline-variant/40
          bg-surface/55 px-4 pb-2 pt-2 shadow-elev-1
          backdrop-blur-lg supports-[backdrop-filter]:bg-surface/45
          transition-[background-color,backdrop-filter] duration-motion-medium2 ease-emphasized"
        data-testid="stickers-toolbar"
      >
        <FilterBar
          filter={filter}
          onChange={setFilter}
          counts={counts}
          onOpenFilters={() => setFilterSheetOpen(true)}
          rightOfSearch={
            <div className="flex shrink-0 items-center gap-1">
              <div
                className="w-[68px] shrink-0"
                title={`${t('stickers.view')} · ${view === 'grid' ? t('stickers.grid') : t('stickers.list')}`}
              >
                <SegmentedControl
                  ariaLabel={t('stickers.view')}
                  options={[
                    {
                      value: 'grid',
                      label: <Icon name="grid_view" size={16} />,
                      ariaLabel: t('stickers.grid'),
                    },
                    {
                      value: 'list',
                      label: <Icon name="view_list" size={16} />,
                      ariaLabel: t('stickers.list'),
                    },
                  ]}
                  value={view}
                  onChange={setView}
                />
              </div>

              <button
                type="button"
                className={`has-state-layer relative grid h-9 w-9 shrink-0 place-items-center
                  overflow-hidden rounded-full transition-colors
                  duration-motion-short2 ease-standard
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    grouped
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                aria-pressed={grouped}
                aria-label={
                  grouped
                    ? t('stickers.groups.flat')
                    : t('stickers.groups.toggle')
                }
                title={
                  grouped
                    ? t('stickers.groups.flat')
                    : t('stickers.groups.toggle')
                }
                onClick={toggleGrouped}
              >
                <Icon name="layers" size={18} />
                <span aria-hidden className="state-layer" />
              </button>

              <button
                type="button"
                className={`has-state-layer relative grid h-9 w-9 shrink-0 place-items-center
                  overflow-hidden rounded-full transition-colors
                  duration-motion-short2 ease-standard
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    editMode
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-surface-container text-on-surface-variant'
                  }`}
                aria-pressed={editMode}
                aria-label={
                  editMode ? t('stickers.edit.lock') : t('stickers.edit.unlock')
                }
                title={
                  editMode ? t('stickers.edit.lock') : t('stickers.edit.unlock')
                }
                onClick={toggleEdit}
              >
                <Icon name={editMode ? 'lock_open' : 'lock'} size={18} />
                <span aria-hidden className="state-layer" />
              </button>
            </div>
          }
        />
      </header>

      {/*
        Acciones masivas de expand/collapse (sólo visibles en vista agrupada
        y cuando no hay búsqueda activa). No es sticky — desaparece al hacer
        scroll para reducir ruido visual.
      */}
      {grouped && !forceExpand ? (
        <div
          className="flex items-center gap-1.5"
          role="toolbar"
          aria-label={t('stickers.groups.toggle')}
        >
          <button
            type="button"
            className="has-state-layer group inline-flex h-8 items-center gap-1
              overflow-hidden rounded-full bg-surface-container px-3
              text-label-sm text-on-surface-variant
              transition-colors duration-motion-short2 ease-standard
              hover:bg-surface-container-high
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={expandAll}
            aria-label={t('stickers.groups.expandAll')}
          >
            <Icon name="unfold_more" size={14} />
            <span>{t('stickers.groups.expandAll')}</span>
            <span aria-hidden className="state-layer" />
          </button>
          <button
            type="button"
            className="has-state-layer group inline-flex h-8 items-center gap-1
              overflow-hidden rounded-full bg-surface-container px-3
              text-label-sm text-on-surface-variant
              transition-colors duration-motion-short2 ease-standard
              hover:bg-surface-container-high
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={collapseAll}
            aria-label={t('stickers.groups.collapseAll')}
          >
            <Icon name="unfold_less" size={14} />
            <span>{t('stickers.groups.collapseAll')}</span>
            <span aria-hidden className="state-layer" />
          </button>
        </div>
      ) : null}

      {/*
        Indicador sutil de filtros avanzados activos — aparece como chips
        removibles debajo del toolbar cuando hay algún filtro extra puesto
        (facilita ver y limpiar lo que se está aplicando).
      */}
      {hasAdvancedFilters(filter) ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filter.teamId ? (
            <ActiveFilterChip
              label={getTeamLabel(filter.teamId, teams)}
              onClear={() => setFilter({ ...filter, teamId: null })}
            />
          ) : null}
          {filter.category ? (
            <ActiveFilterChip
              label={t(`stickers.categoryOptions.${filter.category}`, {
                defaultValue: filter.category,
              })}
              onClear={() => setFilter({ ...filter, category: null })}
            />
          ) : null}
          {filter.rarity ? (
            <ActiveFilterChip
              label={t(`stickers.rarityOptions.${filter.rarity}`, {
                defaultValue: filter.rarity,
              })}
              onClear={() => setFilter({ ...filter, rarity: null })}
            />
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={
            <Icon name="search" size={36} className="text-on-surface-variant" />
          }
          title={t('stickers.noResults')}
          action={
            hasAdvancedFilters(filter) || filter.search ? (
              <button
                type="button"
                className="btn-tonal"
                onClick={() => setFilter(DEFAULT_FILTER)}
              >
                <Icon name="refresh" size={16} />
                {t('stickers.filtersPanel.clearAll')}
              </button>
            ) : undefined
          }
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
          onIncrement={inc}
          onDecrement={dec}
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
          onIncrement={inc}
          onDecrement={dec}
          onSelect={setSelected}
        />
      )}

      {/* FAB — acción primaria: importar. Solo cuando hay edición activa. */}
      {editMode ? (
        <Fab
          icon={<Icon name="playlist_add" size={24} />}
          label={t('bulk.import')}
          variant="primary"
          ariaLabel={t('bulk.title')}
          onClick={() => setBulkOpen(true)}
        />
      ) : null}

      <StickerDetailModal
        sticker={selected}
        quantity={selected ? (inventory.get(selected.id) ?? 0) : 0}
        onClose={() => setSelected(null)}
        onIncrement={inc}
        onDecrement={dec}
      />

      <BulkImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        collectionId={collectionId}
      />

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filter={filter}
        onChange={setFilter}
        teams={teams}
        categories={categories}
        rarities={rarities}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Helpers & sub-components (locales — no se usan fuera de esta vista)
 * ------------------------------------------------------------------ */

function hasAdvancedFilters(f: StickerFilter): boolean {
  return Boolean(f.teamId || f.category || f.rarity);
}

function getTeamLabel(
  teamId: string,
  teams: { id: string; name: string; flag?: string }[]
): string {
  const team = teams.find((x) => x.id === teamId);
  if (!team) return teamId;
  return team.flag ? `${team.flag} ${team.name}` : team.name;
}

interface ActiveFilterChipProps {
  label: string;
  onClear: () => void;
}

/**
 * M3 Input Chip: chip removible para mostrar un filtro avanzado activo.
 * Inspirado en el patrón M3 "Input Chip" (m3.material.io/components/chips).
 */
function ActiveFilterChip({ label, onClear }: ActiveFilterChipProps) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex h-7 items-center gap-1 rounded-full
        bg-secondary-container pl-2.5 pr-1 text-label-sm
        text-on-secondary-container"
    >
      <span className="max-w-[160px] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`${t('common.clear')} ${label}`}
        className="has-state-layer relative grid h-5 w-5 place-items-center
          overflow-hidden rounded-full text-on-secondary-container
          transition-colors hover:bg-secondary-container/70
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icon name="close" size={12} />
        <span aria-hidden className="state-layer" />
      </button>
    </span>
  );
}
