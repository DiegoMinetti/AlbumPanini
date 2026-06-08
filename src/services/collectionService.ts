import { db } from '@/db';
import type {
  CollectionStatus,
  StoredCollection,
  StoredSticker,
  StoredTeam,
} from '@/types/collection';
import type { StoredInventoryItem } from '@/types/inventory';
import { generateId, makeUid, splitUid } from '@/utils/ids';

/**
 * Collection lifecycle operations: list, rename, duplicate, archive and
 * delete. Multiple collections can coexist; all rows are namespaced by
 * `collectionId` so operations never bleed across collections.
 */

export async function listCollections(
  includeArchived = true
): Promise<StoredCollection[]> {
  const all = await db.collections.orderBy('updatedAt').reverse().toArray();
  return includeArchived ? all : all.filter((c) => c.status === 'active');
}

export async function getCollection(
  id: string
): Promise<StoredCollection | undefined> {
  return db.collections.get(id);
}

export async function getTeams(collectionId: string): Promise<StoredTeam[]> {
  return db.teams.where('collectionId').equals(collectionId).toArray();
}

export async function getStickers(
  collectionId: string
): Promise<StoredSticker[]> {
  return db.stickers.where('collectionId').equals(collectionId).toArray();
}

export async function renameCollection(
  id: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Collection name cannot be empty');
  await db.collections.update(id, { name: trimmed, updatedAt: Date.now() });
}

/** Toggle whether this collection counts region-specific "extra" stickers. */
export async function setCollectionIncludeExtras(
  id: string,
  includeExtras: boolean
): Promise<void> {
  await db.collections.update(id, { includeExtras, updatedAt: Date.now() });
}

export async function setCollectionStatus(
  id: string,
  status: CollectionStatus
): Promise<void> {
  await db.collections.update(id, { status, updatedAt: Date.now() });
}

export const archiveCollection = (id: string) =>
  setCollectionStatus(id, 'archived');
export const unarchiveCollection = (id: string) =>
  setCollectionStatus(id, 'active');

/**
 * Duplicate a collection, optionally including the user's inventory progress.
 * Returns the new collection id.
 */
export async function duplicateCollection(
  sourceId: string,
  options: { name?: string; includeInventory?: boolean } = {}
): Promise<string> {
  const source = await db.collections.get(sourceId);
  if (!source) throw new Error(`Collection "${sourceId}" not found`);

  const newId = generateId('col');
  const now = Date.now();

  const [teams, stickers, inventory] = await Promise.all([
    getTeams(sourceId),
    getStickers(sourceId),
    options.includeInventory
      ? db.inventory.where('collectionId').equals(sourceId).toArray()
      : Promise.resolve([] as StoredInventoryItem[]),
  ]);

  const newCollection: StoredCollection = {
    ...source,
    id: newId,
    name: options.name?.trim() || `${source.name} (copy)`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const newTeams: StoredTeam[] = teams.map((t) => {
    const [, localId] = splitUid(t.uid);
    return { ...t, uid: makeUid(newId, localId), collectionId: newId };
  });
  const newStickers: StoredSticker[] = stickers.map((s) => {
    const [, localId] = splitUid(s.uid);
    return { ...s, uid: makeUid(newId, localId), collectionId: newId };
  });
  const newInventory: StoredInventoryItem[] = inventory.map((i) => ({
    ...i,
    uid: makeUid(newId, i.stickerId),
    collectionId: newId,
    updatedAt: now,
  }));

  await db.transaction(
    'rw',
    [db.collections, db.teams, db.stickers, db.inventory],
    async () => {
      await db.collections.put(newCollection);
      await db.teams.bulkPut(newTeams);
      await db.stickers.bulkPut(newStickers);
      if (newInventory.length) await db.inventory.bulkPut(newInventory);
    }
  );

  return newId;
}

/** Permanently delete a collection and all of its rows. */
export async function deleteCollection(id: string): Promise<void> {
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
      await db.collections.delete(id);
      await db.teams.where('collectionId').equals(id).delete();
      await db.stickers.where('collectionId').equals(id).delete();
      await db.inventory.where('collectionId').equals(id).delete();
      await db.activity.where('collectionId').equals(id).delete();

      // Cascade tournament scenarios + their results/picks.
      const scenarioIds = (
        await db.scenarios.where('collectionId').equals(id).toArray()
      ).map((s) => s.id);
      await db.scenarios.where('collectionId').equals(id).delete();
      for (const sid of scenarioIds) {
        await db.matchResults.where('scenarioId').equals(sid).delete();
        await db.knockoutPicks.where('scenarioId').equals(sid).delete();
      }
    }
  );
}
