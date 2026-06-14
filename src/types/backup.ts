import { z } from 'zod';
import { collectionMetaSchema, stickerSchema, teamSchema } from './collection';
import { tournamentSchema } from './tournament';
import { inventoryItemSchema } from './inventory';
import { settingsSchema } from './settings';

/**
 * Current backup format version. Bump whenever the on-disk backup shape
 * changes; `restoreService` migrates older versions up to this one.
 */
export const BACKUP_VERSION = 3;

/** File extension / magic used by the export feature. */
export const BACKUP_EXTENSION = '.albumbackup';
export const BACKUP_MAGIC = 'PANINI-BACKUP';

/** A match result inside a backed-up scenario (uid/scenarioId reconstructed). */
export const backupMatchResultSchema = z.object({
  matchId: z.string(),
  homeGoals: z.number(),
  awayGoals: z.number(),
  homePens: z.number().optional(),
  awayPens: z.number().optional(),
  played: z.boolean(),
  updatedAt: z.number(),
});

/** A knockout pick inside a backed-up scenario (uid/scenarioId reconstructed). */
export const backupKnockoutPickSchema = z.object({
  slot: z.string(),
  teamId: z.string(),
  updatedAt: z.number(),
});

/** FIFA-official finished result carried in the backup (v3+). */
export const backupOfficialResultSchema = z.object({
  matchId: z.string(),
  homeGoals: z.number(),
  awayGoals: z.number(),
  homePens: z.number().optional(),
  awayPens: z.number().optional(),
  status: z.enum(['FT', 'AET', 'PEN']),
  finishedAt: z.string(),
  apiFootballFixtureId: z.number(),
  syncedAt: z.number(),
});

/** A backed-up tournament scenario with its results + picks. */
export const backupScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  isOfficial: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
  results: z.array(backupMatchResultSchema).default([]),
  picks: z.array(backupKnockoutPickSchema).default([]),
});
export type BackupScenario = z.infer<typeof backupScenarioSchema>;

/** A self-contained snapshot of one collection (meta + teams + stickers). */
export const backupCollectionSchema = collectionMetaSchema.extend({
  status: z.enum(['active', 'archived']).default('active'),
  sourceId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  teams: z.array(teamSchema).default([]),
  stickers: z.array(stickerSchema).default([]),
  inventory: z.array(inventoryItemSchema).default([]),
  scenarios: z.array(backupScenarioSchema).default([]),
  /**
   * Static tournament structure (groups + bracket). Optional because backups
   * written before this field existed omit it; the restore self-heals those by
   * re-hydrating from the bundled package. See `restoreBackup`.
   */
  tournament: tournamentSchema.optional(),
  /**
   * v3+: FIFA-official finished results that the user had locally cached.
   * Optional so older backups (pre-v3) remain readable.
   */
  officialResults: z.array(backupOfficialResultSchema).default([]),
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
  scenarios: number;
  migratedFrom?: number;
}
