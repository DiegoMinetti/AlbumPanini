import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { StoredSticker, StoredTeam } from '@/types/collection';
import { computeStatistics } from '@/services/statsService';
import { isExtraSticker } from '@/services/filterService';
import type { FullStatistics } from '@/types/stats';

export interface CollectionData {
  stickers: StoredSticker[];
  teams: StoredTeam[];
  inventory: Map<string, number>;
  statistics: FullStatistics;
  loading: boolean;
}

const EMPTY_STATS: FullStatistics = {
  overview: {
    total: 0,
    owned: 0,
    missing: 0,
    duplicates: 0,
    distinctDuplicates: 0,
    completion: 0,
  },
  teams: [],
  categories: [],
  mostRepeated: [],
  leastCommon: [],
  completedTeams: [],
  nearCompleteTeams: [],
};

/**
 * Live, reactive view of a collection's stickers, teams and inventory, plus
 * derived statistics. Recomputes automatically whenever the underlying DB rows
 * change (dexie-react-hooks) and memoizes the stats derivation.
 */
export function useCollectionData(collectionId: string | null): CollectionData {
  // Per-collection "include extras" toggle: when off, region-specific extra
  // variants are dropped at the source so every consumer (dashboard, stats,
  // exchange, tournament, sticker browser) reflects the same base-set counts.
  const includeExtras = useLiveQuery<boolean>(
    async () =>
      collectionId
        ? ((await db.collections.get(collectionId))?.includeExtras ?? false)
        : false,
    [collectionId]
  );
  const allStickers = useLiveQuery<StoredSticker[]>(
    async () =>
      collectionId
        ? db.stickers.where('collectionId').equals(collectionId).toArray()
        : [],
    [collectionId]
  );
  const stickers = useMemo(() => {
    if (!allStickers) return allStickers;
    return includeExtras
      ? allStickers
      : allStickers.filter((s) => !isExtraSticker(s));
  }, [allStickers, includeExtras]);
  const teams = useLiveQuery<StoredTeam[]>(
    async () =>
      collectionId
        ? db.teams.where('collectionId').equals(collectionId).toArray()
        : [],
    [collectionId]
  );
  const inventoryRows = useLiveQuery(
    async () =>
      collectionId
        ? db.inventory.where('collectionId').equals(collectionId).toArray()
        : [],
    [collectionId]
  );

  const inventory = useMemo(
    () => new Map((inventoryRows ?? []).map((i) => [i.stickerId, i.quantity])),
    [inventoryRows]
  );

  const statistics = useMemo(() => {
    if (!stickers || !teams) return EMPTY_STATS;
    return computeStatistics(stickers, teams, inventory);
  }, [stickers, teams, inventory]);

  return {
    stickers: stickers ?? [],
    teams: teams ?? [],
    inventory,
    statistics,
    loading:
      stickers === undefined ||
      teams === undefined ||
      inventoryRows === undefined,
  };
}
