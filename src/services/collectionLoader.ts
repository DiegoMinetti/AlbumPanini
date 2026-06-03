import {
  collectionManifestSchema,
  collectionPackageSchema,
  type CollectionManifestEntry,
  type CollectionPackage,
  type StoredCollection,
  type StoredSticker,
  type StoredTeam,
} from '@/types/collection';
import { db } from '@/db';
import { makeUid } from '@/utils/ids';
import { normalizeCode } from '@/utils/code';

/**
 * Collection loader.
 *
 * Collections are shipped as JSON packages under `public/collections/`. A
 * manifest (`index.json`) lists them so the app can discover packages at
 * runtime without any collection-specific code. Packages are validated with
 * Zod before being installed into IndexedDB.
 */

/** Resolve a path under the public collections folder, base-path aware. */
function collectionsUrl(file: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const cleaned = file.replace(/^\.?\//, '');
  return `${base}collections/${cleaned}`;
}

/** Fetch and validate the collections manifest. Returns [] if absent. */
export async function fetchManifest(
  signal?: AbortSignal
): Promise<CollectionManifestEntry[]> {
  const res = await fetch(collectionsUrl('index.json'), {
    signal,
    cache: 'no-cache',
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Failed to load collection manifest (${res.status})`);
  }
  const json = await res.json();
  const parsed = collectionManifestSchema.parse(json);
  return parsed.collections;
}

/** Fetch and validate a single collection package by its manifest entry. */
export async function fetchPackage(
  entry: Pick<CollectionManifestEntry, 'file'>,
  signal?: AbortSignal
): Promise<CollectionPackage> {
  const res = await fetch(collectionsUrl(entry.file), { signal });
  if (!res.ok) {
    throw new Error(`Failed to load collection "${entry.file}" (${res.status})`);
  }
  const json = await res.json();
  return collectionPackageSchema.parse(json);
}

/** Map a validated package into stored DB rows for a given collection id. */
export function packageToRows(
  pkg: CollectionPackage,
  collectionId: string,
  now = Date.now()
): {
  collection: StoredCollection;
  teams: StoredTeam[];
  stickers: StoredSticker[];
} {
  const collection: StoredCollection = {
    id: collectionId,
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    language: pkg.language,
    coverImage: pkg.coverImage,
    status: 'active',
    sourceId: pkg.id,
    createdAt: now,
    updatedAt: now,
  };

  const teams: StoredTeam[] = pkg.teams.map((team) => ({
    ...team,
    uid: makeUid(collectionId, team.id),
    collectionId,
  }));

  const stickers: StoredSticker[] = pkg.stickers.map((sticker) => ({
    ...sticker,
    uid: makeUid(collectionId, sticker.id),
    collectionId,
    normalizedCode: normalizeCode(sticker.code),
  }));

  return { collection, teams, stickers };
}

/**
 * Install a package into the database under `collectionId` (defaults to the
 * package id). Replaces any existing rows for that collection id. Inventory is
 * left untouched if it already exists, so re-installing/updating a package does
 * not wipe the user's progress.
 */
export async function installPackage(
  pkg: CollectionPackage,
  options: { collectionId?: string; resetInventory?: boolean } = {}
): Promise<StoredCollection> {
  const collectionId = options.collectionId ?? pkg.id;
  const { collection, teams, stickers } = packageToRows(pkg, collectionId);

  await db.transaction(
    'rw',
    [db.collections, db.teams, db.stickers, db.inventory],
    async () => {
      const existing = await db.collections.get(collectionId);
      if (existing) {
        collection.createdAt = existing.createdAt;
        collection.status = existing.status;
      }

      // Replace catalog rows (teams + stickers) for a clean re-sync.
      await db.teams.where('collectionId').equals(collectionId).delete();
      await db.stickers.where('collectionId').equals(collectionId).delete();

      await db.collections.put(collection);
      await db.teams.bulkPut(teams);
      await db.stickers.bulkPut(stickers);

      if (options.resetInventory) {
        await db.inventory.where('collectionId').equals(collectionId).delete();
      }
    }
  );

  return collection;
}

/** True if a collection with the given id already exists in the DB. */
export async function isInstalled(collectionId: string): Promise<boolean> {
  return (await db.collections.get(collectionId)) !== undefined;
}
