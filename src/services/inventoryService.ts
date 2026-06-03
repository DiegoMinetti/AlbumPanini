import { db } from '@/db';
import type {
  ActivityEntry,
  ActivityKind,
  StoredInventoryItem,
} from '@/types/inventory';
import { makeUid } from '@/utils/ids';
import { normalizeCode } from '@/utils/code';

/**
 * Inventory operations. All quantities are clamped to >= 0. Every mutation
 * records an activity entry so the dashboard can show a recent-activity feed.
 */

export async function getInventory(
  collectionId: string
): Promise<StoredInventoryItem[]> {
  return db.inventory.where('collectionId').equals(collectionId).toArray();
}

/** Map of stickerId -> quantity for fast lookup in stats/UI. */
export async function getInventoryMap(
  collectionId: string
): Promise<Map<string, number>> {
  const items = await getInventory(collectionId);
  return new Map(items.map((i) => [i.stickerId, i.quantity]));
}

async function logActivity(
  entry: Omit<ActivityEntry, 'id' | 'timestamp'>
): Promise<void> {
  const record: ActivityEntry = { ...entry, timestamp: Date.now() };
  await db.activity.add(record);
  // Cap the activity log so it does not grow unbounded.
  const count = await db.activity
    .where('collectionId')
    .equals(entry.collectionId)
    .count();
  const CAP = 200;
  if (count > CAP) {
    const overflow = count - CAP;
    const oldest = await db.activity
      .where('collectionId')
      .equals(entry.collectionId)
      .sortBy('timestamp');
    const idsToDelete = oldest
      .slice(0, overflow)
      .map((a) => a.id)
      .filter((id): id is number => id !== undefined);
    if (idsToDelete.length) await db.activity.bulkDelete(idsToDelete);
  }
}

/** Set an absolute quantity for a sticker. */
export async function setQuantity(
  collectionId: string,
  stickerId: string,
  quantity: number,
  kind: ActivityKind = 'set'
): Promise<number> {
  const qty = Math.max(0, Math.floor(quantity));
  const uid = makeUid(collectionId, stickerId);
  const now = Date.now();
  const prev = await db.inventory.get(uid);
  const delta = qty - (prev?.quantity ?? 0);

  const item: StoredInventoryItem = {
    uid,
    collectionId,
    stickerId,
    quantity: qty,
    updatedAt: now,
  };
  await db.inventory.put(item);
  await logActivity({ collectionId, kind, stickerId, count: 1, delta });
  return qty;
}

/** Apply a relative change (+1 / -1 / etc), clamped at 0. */
export async function adjustQuantity(
  collectionId: string,
  stickerId: string,
  delta: number
): Promise<number> {
  const uid = makeUid(collectionId, stickerId);
  const prev = await db.inventory.get(uid);
  const next = Math.max(0, (prev?.quantity ?? 0) + delta);
  return setQuantity(
    collectionId,
    stickerId,
    next,
    delta >= 0 ? 'add' : 'remove'
  );
}

export const incrementSticker = (collectionId: string, stickerId: string) =>
  adjustQuantity(collectionId, stickerId, 1);

export const decrementSticker = (collectionId: string, stickerId: string) =>
  adjustQuantity(collectionId, stickerId, -1);

export interface BulkApplyReport {
  /** stickerId -> number of copies added. */
  matched: Record<string, number>;
  /** Input codes that did not resolve to any sticker. */
  unmatched: string[];
  matchedCount: number;
  addedCopies: number;
}

/**
 * Resolve a list of printed codes to stickers and add one copy per occurrence.
 * Powers both bulk import (pasted list) and OCR results.
 */
export async function addByCodes(
  collectionId: string,
  codes: string[],
  kind: ActivityKind = 'bulk-import'
): Promise<BulkApplyReport> {
  const stickers = await db.stickers
    .where('collectionId')
    .equals(collectionId)
    .toArray();
  const byNormalized = new Map(stickers.map((s) => [s.normalizedCode, s.id]));

  const matched: Record<string, number> = {};
  const unmatched: string[] = [];

  for (const raw of codes) {
    const id = byNormalized.get(normalizeCode(raw));
    if (id) {
      matched[id] = (matched[id] ?? 0) + 1;
    } else if (raw.trim()) {
      unmatched.push(raw.trim());
    }
  }

  const stickerIds = Object.keys(matched);
  const now = Date.now();

  if (stickerIds.length) {
    await db.transaction('rw', db.inventory, async () => {
      const uids = stickerIds.map((sid) => makeUid(collectionId, sid));
      const existing = await db.inventory.bulkGet(uids);
      const rows: StoredInventoryItem[] = stickerIds.map((sid, idx) => {
        const prevQty = existing[idx]?.quantity ?? 0;
        return {
          uid: uids[idx],
          collectionId,
          stickerId: sid,
          quantity: prevQty + matched[sid],
          updatedAt: now,
        };
      });
      await db.inventory.bulkPut(rows);
    });
  }

  const addedCopies = Object.values(matched).reduce((a, b) => a + b, 0);
  if (addedCopies > 0) {
    await logActivity({
      collectionId,
      kind,
      count: stickerIds.length,
      delta: addedCopies,
    });
  }

  return {
    matched,
    unmatched,
    matchedCount: stickerIds.length,
    addedCopies,
  };
}

/** Reset all inventory quantities for a collection to zero. */
export async function resetInventory(collectionId: string): Promise<void> {
  await db.inventory.where('collectionId').equals(collectionId).delete();
  await logActivity({ collectionId, kind: 'reset', count: 0 });
}

export async function getRecentActivity(
  collectionId: string,
  limit = 20
): Promise<ActivityEntry[]> {
  const all = await db.activity
    .where('collectionId')
    .equals(collectionId)
    .sortBy('timestamp');
  return all.reverse().slice(0, limit);
}
