import { z } from 'zod';
import { settingsSchema } from './settings';

/**
 * QR sync payload.
 *
 * Designed to fit a typical user's "device-to-device" sync in a small number
 * of QR codes. We only carry the data that drifts between devices:
 *  - Which collections are installed (and their versions).
 *  - Inventory (which stickers, in which quantity, per collection).
 *  - Tournament scenarios + their results + knockout picks.
 *  - User settings.
 *
 * Sticker/team metadata is *not* included: both devices are expected to
 * install the same collection package (see `collections/index.json`), so
 * re-syncing that data would be redundant and expensive.
 *
 * Keys are intentionally short (`v`, `c`, `i`, `q`, `s`...) to minimize the
 * encoded size — every byte counts when it has to fit in a QR code.
 */
export const SYNC_VERSION = 1;

/** Compact inventory entry: [stickerId, quantity]. */
const syncInventoryEntrySchema = z.tuple([
  z.string().min(1),
  z.number().int().nonnegative(),
]);

/** Compact match result tuple:
 * [matchId, homeGoals, awayGoals, homePens?, awayPens?, played].
 * Storing tuples keeps the JSON significantly smaller than objects.
 */
const syncResultEntrySchema = z.tuple([
  z.string().min(1),
  z.number().int(),
  z.number().int(),
  z.number().int().optional(),
  z.number().int().optional(),
  z.boolean(),
]);

/** Compact knockout pick tuple: [slot, teamId]. */
const syncPickEntrySchema = z.tuple([z.string().min(1), z.string().min(1)]);

/** Per-collection sync block. */
export const syncCollectionSchema = z.object({
  /** Collection id. */
  i: z.string().min(1),
  /** Collection package version. Informational / mismatch warning. */
  v: z.string().default(''),
  /** Inventory entries (stickerId, quantity) — only non-zero quantities. */
  q: z.array(syncInventoryEntrySchema).default([]),
  /** Scenarios (custom + official tournament simulations). */
  s: z
    .array(
      z.object({
        /** Scenario id. */
        i: z.string().min(1),
        /** Scenario display name. */
        n: z.string().default(''),
        /** Whether this is the official scenario seeded by the app. */
        o: z.boolean().default(false),
        /** Match results. */
        r: z.array(syncResultEntrySchema).default([]),
        /** Knockout picks. */
        p: z.array(syncPickEntrySchema).default([]),
      })
    )
    .default([]),
});
export type SyncCollection = z.infer<typeof syncCollectionSchema>;

/** Top-level sync payload. */
export const syncPayloadSchema = z.object({
  /** Format version. Bump on incompatible changes. */
  v: z.number().int().positive(),
  /** When the payload was generated (epoch ms). */
  t: z.number().int().nonnegative(),
  /** App version that produced the payload. */
  a: z.string().default('unknown'),
  /** Per-collection sync blocks. */
  c: z.array(syncCollectionSchema).default([]),
  /** User settings (theme, language, haptics, etc.). */
  st: settingsSchema.optional(),
});
export type SyncPayload = z.infer<typeof syncPayloadSchema>;

/**
 * A multi-chunk QR sync descriptor. We split the encoded payload into N
 * chunks when the full data won't fit in a single QR code, and the
 * receiver assembles them back by sharing the same `sid` (session id).
 */
export const SYNC_CHUNK_MAGIC = 'PSNC'; // Panini SyNC

export interface SyncChunk {
  /** Session id, shared by every chunk of the same sync. */
  sid: string;
  /** 1-based index of this chunk. */
  idx: number;
  /** Total chunks in this session. */
  total: number;
  /** The raw chunk payload (URL-safe base64). */
  data: string;
}

export interface SyncSessionInfo {
  sid: string;
  total: number;
  /** Chunk index → data, accumulated as the user scans each QR. */
  chunks: Map<number, string>;
  receivedAt: number;
}

/** Max bytes we trust a single QR to carry reliably. */
export const SYNC_CHUNK_MAX_BYTES = 1800; // safe under L error correction
