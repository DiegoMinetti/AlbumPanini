import type { Transaction } from 'dexie';

/**
 * Migration framework.
 *
 * Each entry describes one Dexie schema version: the `stores` definition for
 * that version and an optional `upgrade` callback that transforms existing data
 * when moving up to it. Adding a new schema version is as simple as appending a
 * new entry — never edit an already-released entry, since users may be on it.
 *
 * `applyMigrations` (in database.ts) registers every entry with Dexie and wraps
 * each upgrade so it also appends to the persisted DB version history.
 */
export interface DbMigration {
  version: number;
  description: string;
  /**
   * Dexie store definitions for this version. A value of `null` deletes a table.
   * Only changed tables need to be listed in later versions, but listing all is
   * clearer; Dexie merges across versions.
   */
  stores: Record<string, string | null>;
  /** Optional data transform applied when upgrading to this version. */
  upgrade?: (tx: Transaction) => Promise<void> | void;
}

export const migrations: DbMigration[] = [
  {
    version: 1,
    description: 'Initial schema: collections, teams, stickers, inventory.',
    stores: {
      collections: 'id, status, updatedAt, sourceId',
      teams: 'uid, collectionId',
      stickers:
        'uid, collectionId, normalizedCode, teamId, category, rarity, type',
      inventory: 'uid, collectionId, stickerId, updatedAt',
      activity: '++id, collectionId, timestamp, kind',
      meta: 'key',
    },
  },
  {
    version: 2,
    description:
      'Add tournament scenarios: scenarios, matchResults, knockoutPicks.',
    stores: {
      scenarios: 'id, collectionId, isOfficial, updatedAt',
      matchResults: 'uid, scenarioId, matchId',
      knockoutPicks: 'uid, scenarioId, slot',
    },
  },
  {
    version: 3,
    description:
      'Separate user predictions from official results. Add `predictions` ' +
      'and `officialResults` tables. Migrate existing matchResults + ' +
      'knockoutPicks rows into `predictions` (same shape, new home). The ' +
      'legacy tables stay defined for back-compat reads but the app no ' +
      'longer writes to them.',
    stores: {
      predictions: 'uid, scenarioId, matchId',
      knockoutPredictions: 'uid, scenarioId, slot',
      officialResults: 'matchId, finishedAt',
    },
    upgrade: async (tx) => {
      // Move every row from the legacy per-scenario tables to the new
      // `predictions` table. The shape is identical so a bulkPut is enough.
      // We keep the legacy rows in place; the app simply stops reading them.
      const oldResults = await tx.table('matchResults').toArray();
      const oldPicks = await tx.table('knockoutPicks').toArray();
      if (oldResults.length) {
        await tx.table('predictions').bulkPut(oldResults);
      }
      if (oldPicks.length) {
        await tx.table('knockoutPredictions').bulkPut(oldPicks);
      }
    },
  },
  {
    version: 4,
    description:
      'Add `appVersions` table to track app/build metadata per launch. ' +
      'Lets the app show "updated to vX" toasts and surface the build ' +
      'SHA in settings. Each row is one app launch with a new build; ' +
      'the most recent row is the current install.',
    stores: {
      appVersions: '++id, version, installedAt',
    },
  },
  // ---------------------------------------------------------------------------
  // FUTURE MIGRATIONS — append below. Never edit an already-released entry.
  // ---------------------------------------------------------------------------
];

/** The latest schema version (highest registered migration). */
export const LATEST_DB_VERSION = migrations.reduce(
  (max, m) => Math.max(max, m.version),
  0
);
