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
  CollectionManifestEntry,
  StoredCollection,
  StoredSticker,
  StoredTeam,
} from '@/types/collection';
import type { StoredInventoryItem } from '@/types/inventory';
import type {
  StoredKnockoutPick,
  StoredMatchResult,
  StoredScenario,
} from '@/types/scenario';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
} from '@/types/settings';
import { gunzipJson, gzipJson } from '@/utils/compression';
import { makeUid } from '@/utils/ids';
import { normalizeCode } from '@/utils/code';
import { fetchManifest, fetchPackage } from './collectionLoader';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

/** Build a full backup payload from the current database + supplied settings. */
export async function createBackupPayload(
  settings: Settings
): Promise<BackupPayload> {
  const [
    collections,
    teams,
    stickers,
    inventory,
    scenarios,
    matchResults,
    knockoutPicks,
  ] = await Promise.all([
    db.collections.toArray(),
    db.teams.toArray(),
    db.stickers.toArray(),
    db.inventory.toArray(),
    db.scenarios.toArray(),
    db.matchResults.toArray(),
    db.knockoutPicks.toArray(),
  ]);

  const teamsByCol = groupBy(teams, (t) => t.collectionId);
  const stickersByCol = groupBy(stickers, (s) => s.collectionId);
  const invByCol = groupBy(inventory, (i) => i.collectionId);
  const scenariosByCol = groupBy(scenarios, (s) => s.collectionId);
  const resultsByScenario = groupBy(matchResults, (r) => r.scenarioId);
  const picksByScenario = groupBy(knockoutPicks, (p) => p.scenarioId);

  const backupCollections: BackupCollection[] = collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    version: c.version,
    language: c.language,
    coverImage: c.coverImage,
    status: c.status,
    sourceId: c.sourceId,
    tournament: c.tournament,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    teams: (teamsByCol.get(c.id) ?? []).map(stripTeam),
    stickers: (stickersByCol.get(c.id) ?? []).map(stripSticker),
    inventory: (invByCol.get(c.id) ?? [])
      .filter((i) => i.quantity > 0)
      .map((i) => ({ stickerId: i.stickerId, quantity: i.quantity })),
    scenarios: (scenariosByCol.get(c.id) ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      isOfficial: s.isOfficial,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      results: (resultsByScenario.get(s.id) ?? []).map(stripMatchResult),
      picks: (picksByScenario.get(s.id) ?? []).map(stripKnockoutPick),
    })),
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
  const scenarios: StoredScenario[] = [];
  const matchResults: StoredMatchResult[] = [];
  const knockoutPicks: StoredKnockoutPick[] = [];

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
      tournament: c.tournament,
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
    for (const s of c.scenarios) {
      scenarios.push({
        id: s.id,
        collectionId: c.id,
        name: s.name,
        isOfficial: s.isOfficial,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      });
      for (const r of s.results) {
        matchResults.push({
          uid: makeUid(s.id, r.matchId),
          scenarioId: s.id,
          matchId: r.matchId,
          homeGoals: r.homeGoals,
          awayGoals: r.awayGoals,
          homePens: r.homePens,
          awayPens: r.awayPens,
          played: r.played,
          updatedAt: r.updatedAt,
        });
      }
      for (const p of s.picks) {
        knockoutPicks.push({
          uid: makeUid(s.id, p.slot),
          scenarioId: s.id,
          slot: p.slot,
          teamId: p.teamId,
          updatedAt: p.updatedAt,
        });
      }
    }
  }

  // Self-heal old backups: re-attach any missing tournament structure from the
  // bundled package before writing, so restoring a pre-tournament backup does
  // not leave the Copa view empty. Best-effort; never blocks the restore.
  await hydrateMissingTournaments(collections);

  await db.transaction(
    'rw',
    [
      db.collections,
      db.teams,
      db.stickers,
      db.inventory,
      db.activity,
      db.scenarios,
      db.matchResults,
      db.knockoutPicks,
    ],
    async () => {
      if (mode === 'replace') {
        await db.clearAllData();
      } else {
        // Merge: clear only the collections being restored, then re-add.
        // Teams/stickers/inventory are always fully present in a backup, so we
        // replace them wholesale. Scenarios are additive: we only touch the
        // ones the backup actually carries (by scenario id), leaving any
        // existing tournament data untouched when the backup has none.
        for (const c of collections) {
          await db.teams.where('collectionId').equals(c.id).delete();
          await db.stickers.where('collectionId').equals(c.id).delete();
          await db.inventory.where('collectionId').equals(c.id).delete();
        }
        for (const s of scenarios) {
          await db.matchResults.where('scenarioId').equals(s.id).delete();
          await db.knockoutPicks.where('scenarioId').equals(s.id).delete();
        }
      }
      await db.collections.bulkPut(collections);
      await db.teams.bulkPut(teams);
      await db.stickers.bulkPut(stickers);
      await db.inventory.bulkPut(inventory);
      await db.scenarios.bulkPut(scenarios);
      await db.matchResults.bulkPut(matchResults);
      await db.knockoutPicks.bulkPut(knockoutPicks);
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
      scenarios: scenarios.length,
      migratedFrom: options.migratedFrom,
    },
    settings,
  };
}

// --- helpers ----------------------------------------------------------------

/**
 * Repair collections restored from an old backup that predates the exported
 * `tournament` structure. For each collection still missing its tournament, we
 * look up the matching bundled package (by `sourceId`, falling back to `id`)
 * and copy its tournament across. This is best-effort: if the manifest/package
 * can't be fetched (offline, removed package, or a user-made collection with no
 * source), the collection is left as-is and the restore proceeds.
 */
async function hydrateMissingTournaments(
  collections: StoredCollection[]
): Promise<void> {
  const needsHydration = collections.filter((c) => !c.tournament);
  if (needsHydration.length === 0) return;

  let manifest: CollectionManifestEntry[];
  try {
    manifest = await fetchManifest();
  } catch {
    return;
  }

  for (const c of needsHydration) {
    const packageId = c.sourceId ?? c.id;
    const entry = manifest.find((m) => m.id === packageId);
    if (!entry) continue;
    try {
      const pkg = await fetchPackage(entry);
      if (pkg.tournament) c.tournament = pkg.tournament;
    } catch {
      // Leave this collection without a tournament; don't abort the restore.
    }
  }
}

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

function stripMatchResult(r: StoredMatchResult) {
  const { uid: _uid, scenarioId: _sid, ...result } = r;
  return result;
}

function stripKnockoutPick(p: StoredKnockoutPick) {
  const { uid: _uid, scenarioId: _sid, ...pick } = p;
  return pick;
}
