import { z } from 'zod';
import { collectionMetaSchema, stickerSchema, teamSchema } from './collection';
import { inventoryItemSchema } from './inventory';
import { settingsSchema } from './settings';

/**
 * Current backup format version. Bump whenever the on-disk backup shape
 * changes; `restoreService` migrates older versions up to this one.
 */
export const BACKUP_VERSION = 1;

/** File extension / magic used by the export feature. */
export const BACKUP_EXTENSION = '.albumbackup';
export const BACKUP_MAGIC = 'PANINI-BACKUP';

/** A self-contained snapshot of one collection (meta + teams + stickers). */
export const backupCollectionSchema = collectionMetaSchema.extend({
  status: z.enum(['active', 'archived']).default('active'),
  sourceId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  teams: z.array(teamSchema).default([]),
  stickers: z.array(stickerSchema).default([]),
  inventory: z.array(inventoryItemSchema).default([]),
});
export type BackupCollection = z.infer<typeof backupCollectionSchema>;

/**
 * The decompressed backup payload. The actual `.albumbackup` file is this
 * JSON, gzip-compressed with pako and wrapped with a small binary header.
 */
export const backupPayloadSchema = z.object({
  magic: z.literal(BACKUP_MAGIC),
  version: z.number().int().positive(),
  appVersion: z.string().default('unknown'),
  createdAt: z.number(),
  collections: z.array(backupCollectionSchema).default([]),
  settings: settingsSchema,
});
export type BackupPayload = z.infer<typeof backupPayloadSchema>;

export interface RestoreSummary {
  collections: number;
  teams: number;
  stickers: number;
  inventoryItems: number;
  migratedFrom?: number;
}
