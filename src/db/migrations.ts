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
  // ---------------------------------------------------------------------------
  // FUTURE MIGRATIONS — append below. Example template (do not uncomment until
  // there is a real change to make):
  //
  // {
  //   version: 2,
  //   description: 'Add wishlist flag to inventory.',
  //   stores: {
  //     inventory: 'uid, collectionId, stickerId, updatedAt, wishlist',
  //   },
  //   upgrade: async (tx) => {
  //     await tx.table('inventory').toCollection().modify((item) => {
  //       item.wishlist = false;
  //     });
  //   },
  // },
  // ---------------------------------------------------------------------------
];

/** The latest schema version (highest registered migration). */
export const LATEST_DB_VERSION = migrations.reduce(
  (max, m) => Math.max(max, m.version),
  0
);
