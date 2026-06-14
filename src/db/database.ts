import Dexie, { type Table } from 'dexie';
import type {
  StoredCollection,
  StoredSticker,
  StoredTeam,
} from '@/types/collection';
import type { ActivityEntry, StoredInventoryItem } from '@/types/inventory';
import type {
  StoredKnockoutPick,
  StoredMatchResult,
  StoredScenario,
} from '@/types/scenario';
import type {
  StoredKnockoutPrediction,
  StoredOfficialResult,
  StoredPrediction,
} from '@/types/prediction';
import { LATEST_DB_VERSION, migrations } from './migrations';

/** A key/value record in the `meta` table. */
export interface MetaRecord<T = unknown> {
  key: string;
  value: T;
}

export interface DbVersionHistoryEntry {
  version: number;
  appliedAt: number;
  description: string;
}

export const META_KEYS = {
  dbVersionHistory: 'dbVersionHistory',
  installedAt: 'installedAt',
} as const;

/**
 * The application database. A thin typed wrapper around Dexie that registers
 * every schema version from the migration registry and records a persistent
 * version history so we always know how a given user's DB evolved.
 */
export class PaniniDatabase extends Dexie {
  collections!: Table<StoredCollection, string>;
  teams!: Table<StoredTeam, string>;
  stickers!: Table<StoredSticker, string>;
  inventory!: Table<StoredInventoryItem, string>;
  activity!: Table<ActivityEntry, number>;
  meta!: Table<MetaRecord, string>;
  scenarios!: Table<StoredScenario, string>;
  // Legacy (pre-v3) per-scenario results. Kept defined so the migration in
  // src/db/migrations.ts can read from them and so any leftover back-compat
  // code (e.g. backup exports) can still serialize them. The app no longer
  // reads or writes to these tables — use `predictions` instead.
  matchResults!: Table<StoredMatchResult, string>;
  knockoutPicks!: Table<StoredKnockoutPick, string>;
  // v3+: per-scenario user predictions (mutable up to match kickoff).
  predictions!: Table<StoredPrediction, string>;
  knockoutPredictions!: Table<StoredKnockoutPrediction, string>;
  // v3+: FIFA-official results, synced from API-Football. Read-only.
  officialResults!: Table<StoredOfficialResult, string>;

  constructor(name = 'panini-db') {
    super(name);
    this.registerMigrations();

    // Fresh database: seed install metadata + initial version history.
    this.on('populate', async () => {
      const now = Date.now();
      await this.meta.bulkPut([
        { key: META_KEYS.installedAt, value: now },
        {
          key: META_KEYS.dbVersionHistory,
          value: migrations.map<DbVersionHistoryEntry>((m) => ({
            version: m.version,
            appliedAt: now,
            description: m.description,
          })),
        },
      ]);
    });
  }

  private registerMigrations(): void {
    for (const migration of migrations) {
      const versioned = this.version(migration.version).stores(
        migration.stores
      );
      versioned.upgrade(async (tx) => {
        if (migration.upgrade) {
          await migration.upgrade(tx);
        }
        // Append to the persisted version history during the same transaction.
        const metaTable = tx.table<MetaRecord<DbVersionHistoryEntry[]>>('meta');
        const existing = await metaTable.get(META_KEYS.dbVersionHistory);
        const history = existing?.value ?? [];
        if (!history.some((h) => h.version === migration.version)) {
          history.push({
            version: migration.version,
            appliedAt: Date.now(),
            description: migration.description,
          });
        }
        await metaTable.put({
          key: META_KEYS.dbVersionHistory,
          value: history,
        });
      });
    }
  }

  /** Read the recorded schema version history. */
  async getVersionHistory(): Promise<DbVersionHistoryEntry[]> {
    const record = await this.meta.get(META_KEYS.dbVersionHistory);
    return (record?.value as DbVersionHistoryEntry[] | undefined) ?? [];
  }

  /** Wipe all collection data (keeps meta). Used by "reset" / full restore. */
  async clearAllData(): Promise<void> {
    await this.transaction(
      'rw',
      [
        this.collections,
        this.teams,
        this.stickers,
        this.inventory,
        this.activity,
        this.scenarios,
        this.matchResults,
        this.knockoutPicks,
        this.predictions,
        this.knockoutPredictions,
        this.officialResults,
      ],
      async () => {
        await Promise.all([
          this.collections.clear(),
          this.teams.clear(),
          this.stickers.clear(),
          this.inventory.clear(),
          this.activity.clear(),
          this.scenarios.clear(),
          this.matchResults.clear(),
          this.knockoutPicks.clear(),
          this.predictions.clear(),
          this.knockoutPredictions.clear(),
          this.officialResults.clear(),
        ]);
      }
    );
  }
}

/** Singleton database instance used throughout the app. */
export const db = new PaniniDatabase();

export { LATEST_DB_VERSION };
