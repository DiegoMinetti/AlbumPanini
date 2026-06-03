import { z } from 'zod';

/**
 * Inventory tracks how many copies of each sticker the user owns.
 *
 * `quantity === 0` → missing, `quantity === 1` → owned, `quantity > 1` →
 * owned + (quantity - 1) duplicates available for exchange.
 */
export const inventoryItemSchema = z.object({
  stickerId: z.string().min(1),
  quantity: z.number().int().min(0),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

/** Inventory row as stored, namespaced to a collection. */
export interface StoredInventoryItem extends InventoryItem {
  /** `${collectionId}::${stickerId}` — primary key. */
  uid: string;
  collectionId: string;
  updatedAt: number;
}

/** A single change applied to inventory, used for the activity feed. */
export const activityKindSchema = z.enum([
  'add',
  'remove',
  'set',
  'bulk-import',
  'qr-import',
  'ocr-add',
  'reset',
]);
export type ActivityKind = z.infer<typeof activityKindSchema>;

export interface ActivityEntry {
  id?: number; // auto-increment
  collectionId: string;
  kind: ActivityKind;
  /** Optional sticker involved (single-sticker actions). */
  stickerId?: string;
  /** Number of stickers affected (bulk actions). */
  count: number;
  /** Net quantity delta where meaningful. */
  delta?: number;
  timestamp: number;
}
