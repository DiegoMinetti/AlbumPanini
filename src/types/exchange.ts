import { z } from 'zod';

/**
 * QR exchange payload.
 *
 * To keep QR codes scannable, the payload uses short keys and only carries the
 * minimum needed: collection id + version, the list of sticker ids the user has
 * spare (duplicates) and the list they still need (missing). It is gzipped with
 * pako and base64url-encoded before being rendered as a QR code.
 */
export const EXCHANGE_VERSION = 1;

export const exchangePayloadSchema = z.object({
  /** Payload format version. */
  v: z.number().int().positive(),
  /** Collection id. Both users must share the same collection to trade. */
  c: z.string().min(1),
  /** Collection version (informational / mismatch warning). */
  cv: z.string().default(''),
  /** Optional short display name of the owner. */
  n: z.string().optional(),
  /** Sticker ids the user has spare (duplicates), to give away. */
  d: z.array(z.string()).default([]),
  /** Sticker ids the user is missing, wants to receive. */
  m: z.array(z.string()).default([]),
});
export type ExchangePayload = z.infer<typeof exchangePayloadSchema>;

/** Result of matching my inventory against another user's exchange payload. */
export interface ExchangeMatch {
  /** Same collection? */
  sameCollection: boolean;
  /** Version mismatch warning between the two collections. */
  versionMismatch: boolean;
  /** Stickers I can give them (my duplicates ∩ their missing). */
  iCanGive: string[];
  /** Stickers I can receive (their duplicates ∩ my missing). */
  iCanReceive: string[];
  /** Mutually beneficial count (min of give/receive) — the "best" trade size. */
  mutualCount: number;
}
