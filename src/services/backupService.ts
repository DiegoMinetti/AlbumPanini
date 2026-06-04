import { db } from '@/db';
import {
  BACKUP_EXTENSION,
  BACKUP_MAGIC,
  BACKUP_VERSION,
  backupPayloadSchema,
  type BackupCollection,
  type BackupPayload,
  type RestoreSummary,
} from '@/types/backup';
import type {
  StoredCollection,
  StoredSticker,
  StoredTeam,
} from '@/types/collection';
import type { StoredInventoryItem } from '@/types/inventory';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
} from '@/types/settings';
import { gunzipJson, gzipJson } from '@/utils/compression';
import { makeUid } from '@/utils/ids';
import { normalizeCode } from '@/utils/code';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

/** Build a full backup payload from the current database + supplied settings. */
export async function createBackupPayload(
  settings: Settings
): Promise<BackupPayload> {
  const [collections, teams, stickers, inventory] = await Promise.all([
    db.collections.toArray(),
    db.teams.toArray(),
    db.stickers.toArray(),
    db.inventory.toArray(),
  ]);

  const teamsByCol = groupBy(teams, (t) => t.collectionId);
  const stickersByCol = groupBy(stickers, (s) => s.collectionId);
  const invByCol = groupBy(inventory, (i) => i.collectionId);

  const backupCollections: BackupCollection[] = collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    version: c.version,
    language: c.language,
    coverImage: c.coverImage,
    status: c.status,
    sourceId: c.sourceId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    teams: (teamsByCol.get(c.id) ?? []).map(stripTeam),
    stickers: (stickersByCol.get(c.id) ?? []).map(stripSticker),
    inventory: (invByCol.get(c.id) ?? [])
      .filter((i) => i.quantity > 0)
      .map((i) => ({ stickerId: i.stickerId, quantity: i.quantity })),
  }));

  return {
    magic: BACKUP_MAGIC,
    version: BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: Date.now(),
    collections: backupCollections,
    settings,
  };
}

/** Export the whole app state as a gzip-compressed `.albumbackup` Blob. */
export async function exportBackup(settings: Settings): Promise<Blob> {
  const payload = await createBackupPayload(settings);
  const bytes = gzipJson(payload);
  // Copy into a fresh ArrayBuffer-backed view so the Blob part type is exact.
  return new Blob([new Uint8Array(bytes)], { type: 'application/gzip' });
}

/** A sensible default filename for the exported backup. */
export function backupFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `panini-${stamp}${BACKUP_EXTENSION}`;
}

/**
 * Migrate a raw (parsed-but-unvalidated) backup object up to the current
 * version. Each future bump adds a step here. Throws on unknown/newer formats.
 */
export function migrateBackup(raw: unknown): {
  payload: BackupPayload;
  migratedFrom?: number;
} {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid backup file: not an object');
  }
  const record = raw as Record<string, unknown>;
  if (record.magic !== BACKUP_MAGIC) {
    throw new Error('Invalid backup file: bad signature');
  }
  const version = typeof record.version === 'number' ? record.version : 0;
  if (version > BACKUP_VERSION) {
    throw new Error(
      `Backup version ${version} is newer than supported (${BACKUP_VERSION}). Update the app.`
    );
  }

  // Reassigned by stepwise migrations as new versions are added.
  // eslint-disable-next-line prefer-const
  let working = record;
  const migratedFrom = version < BACKUP_VERSION ? version : undefined;

  // Stepwise migrations would go here, e.g.:
  // if (version < 2) working = migrateV1toV2(working);

  const payload = backupPayloadSchema.parse(working);
  return { payload, migratedFrom };
}

/** Parse + validate + migrate a `.albumbackup` file's bytes. */
export function parseBackupFile(bytes: Uint8Array): {
  payload: BackupPayload;
  migratedFrom?: number;
} {
  let raw: unknown;
  try {
    raw = gunzipJson(bytes);
  } catch {
    throw new Error('Could not read backup file (corrupt or wrong format).');
  }
  return migrateBackup(raw);
}

/**
 * Restore a backup into the database.
 *
 * - `mode: 'replace'` wipes existing collections first (full restore).
 * - `mode: 'merge'` upserts collections, replacing those with matching ids.
 *
 * Returns a summary and the settings contained in the backup so the caller can
 * apply them to the settings store.
 */
export async function restoreBackup(
  payload: BackupPayload,
  options: { mode?: 'replace' | 'merge'; migratedFrom?: number } = {}
): Promise<{ summary: RestoreSummary; settings: Settings }> {
  const mode = options.mode ?? 'replace';

  const collections: StoredCollection[] = [];
  const teams: StoredTeam[] = [];
  const stickers: StoredSticker[] = [];
  const inventory: StoredInventoryItem[] = [];

  for (const c of payload.collections) {
    collections.push({
      id: c.id,
      name: c.name,
      description: c.description,
      version: c.version,
      language: c.language,
      coverImage: c.coverImage,
      status: c.status,
      sourceId: c.sourceId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
    for (const t of c.teams) {
      teams.push({ ...t, uid: makeUid(c.id, t.id), collectionId: c.id });
    }
    for (const s of c.stickers) {
      stickers.push({
        ...s,
        uid: makeUid(c.id, s.id),
        collectionId: c.id,
        normalizedCode: normalizeCode(s.code),
      });
    }
    for (const i of c.inventory) {
      inventory.push({
        uid: makeUid(c.id, i.stickerId),
        collectionId: c.id,
        stickerId: i.stickerId,
        quantity: i.quantity,
        updatedAt: c.updatedAt,
      });
    }
  }

  await db.transaction(
    'rw',
    [db.collections, db.teams, db.stickers, db.inventory, db.activity],
    async () => {
      if (mode === 'replace') {
        await db.clearAllData();
      } else {
        // Merge: clear only the collections being restored, then re-add.
        for (const c of collections) {
          await db.teams.where('collectionId').equals(c.id).delete();
          await db.stickers.where('collectionId').equals(c.id).delete();
          await db.inventory.where('collectionId').equals(c.id).delete();
        }
      }
      await db.collections.bulkPut(collections);
      await db.teams.bulkPut(teams);
      await db.stickers.bulkPut(stickers);
      await db.inventory.bulkPut(inventory);
    }
  );

  const settings = settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    ...payload.settings,
  });

  return {
    summary: {
      collections: collections.length,
      teams: teams.length,
      stickers: stickers.length,
      inventoryItems: inventory.length,
      migratedFrom: options.migratedFrom,
    },
    settings,
  };
}

// --- helpers ----------------------------------------------------------------

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function stripTeam(t: StoredTeam) {
  const { uid: _uid, collectionId: _cid, ...team } = t;
  return team;
}

function stripSticker(s: StoredSticker) {
  const { uid: _uid, collectionId: _cid, normalizedCode: _nc, ...sticker } = s;
  return sticker;
}
