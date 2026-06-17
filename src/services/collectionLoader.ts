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
  const rawBase = import.meta.env.BASE_URL ?? '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
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
    throw new Error(
      `Failed to load collection "${entry.file}" (${res.status})`
    );
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
    tournament: pkg.tournament,
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

/**
 * Id of the collection auto-installed on first launch so the app opens with a
 * usable album instead of an empty onboarding screen.
 */
export const DEFAULT_COLLECTION_ID = 'worldcup-2026';

/**
 * Install the default collection (FIFA World Cup 2026) if it is not already
 * present. Returns the installed collection, or null if it was already there or
 * the manifest does not list it. Throws on network/parse failure so the caller
 * can retry on the next launch.
 */
export async function seedDefaultCollection(
  signal?: AbortSignal
): Promise<StoredCollection | null> {
  if (await isInstalled(DEFAULT_COLLECTION_ID)) return null;
  const manifest = await fetchManifest(signal);
  const entry = manifest.find((e) => e.id === DEFAULT_COLLECTION_ID);
  if (!entry) return null;
  const pkg = await fetchPackage(entry, signal);
  return installPackage(pkg);
}

/**
 * Compare two dotted-version strings (e.g. "1.2.3" vs "1.10.0") numerically.
 * Returns negative when `a < b`, 0 when equal, positive when `a > b`. Non-numeric
 * segments fall back to 0 so a malformed version never causes a destructive
 * downgrade — the more permissive behavior is to treat it as "no change".
 * Pre-release suffixes (`-rc.1`, `-beta.2`, …) are stripped before comparison
 * because the project doesn't use pre-release tags and ignoring them keeps
 * "1.0.0" and "1.0.0-rc.1" treated as the same version.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/-[A-Za-z].*$/, '')
      .split(/[.\-+]/)
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const aParts = parse(a);
  const bParts = parse(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Idempotent sync of the default collection with the latest manifest version.
 *
 *  - Not installed yet → no-op. First-time install is the job of
 *    {@link seedDefaultCollection} and is gated by the `defaultCollectionSeeded`
 *    settings flag. Splitting the two keeps this function side-effect-free
 *    for users / tests that have explicitly opted out of the WC26 auto-seed.
 *  - Installed at a *newer* version than the manifest → no-op (never downgrade).
 *  - Installed at the same version → no-op.
 *  - Installed at an *older* version than the manifest → re-install the catalog
 *    (collection row + teams + stickers + tournament). Inventory, scenarios,
 *    predictions, official results and other user-owned rows are left
 *    untouched, so existing users keep their progress.
 *
 * Safe to call on every app launch. Returns a summary describing what
 * happened, or null if there was nothing to do. Throws on network/parse
 * failure so the caller can surface / retry.
 */
export async function syncDefaultCollection(
  signal?: AbortSignal
): Promise<{ collection: StoredCollection; updated: boolean } | null> {
  const manifest = await fetchManifest(signal);
  const entry = manifest.find((e) => e.id === DEFAULT_COLLECTION_ID);
  if (!entry) return null;

  const existing = await db.collections.get(DEFAULT_COLLECTION_ID);
  // No prior install: leave the first-time install to seedDefaultCollection.
  // Doing it here would clobber setups that opted out of the auto-seed via
  // `defaultCollectionSeeded: true` (notably the E2E suite, where each
  // scenario installs only the collection it actually exercises and would
  // otherwise be polluted by the 980 WC26 stickers).
  if (!existing) return null;

  if (compareSemver(entry.version, existing.version) <= 0) {
    return null;
  }

  const pkg = await fetchPackage(entry, signal);
  const updated = await installPackage(pkg);
  return { collection: updated, updated: true };
}
