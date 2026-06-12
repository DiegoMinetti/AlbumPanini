import { db } from '@/db';
import type { StoredSticker } from '@/types/collection';
import { normalizeCode } from '@/utils/code';
import {
  candidateCodes,
  parseFiguritasAppList,
  type ParsedLine,
} from './figuritasAppParser';

/**
 * Result of matching a parsed figuritas.app list against the user's inventory.
 *
 * The matching pipeline is:
 *   1. Parse the pasted text into (prefix, number) entries.
 *   2. For each entry, derive candidate sticker codes (e.g. "USA"+"15" → "USA15"
 *      with fallbacks) and look them up in the collection's `stickers` table
 *      (by normalized code).
 *   3. For every resolved sticker, look up the user's inventory to classify it
 *      into one of: `iCanGive` (the user owns a duplicate), `iNeed` (the user
 *      is missing it) or `iOwn` (the user already has the one copy).
 *   4. Aggregate per-prefix in `byLine` so the UI can render a familiar
 *      team-by-team breakdown similar to the source list.
 */

export interface FiguritasAppStickerMatch {
  /** Resolved sticker id (the DB primary key within the collection). */
  stickerId: string;
  /** Original parsed line prefix (e.g. "USA", "FWC"). */
  prefix: string;
  /** Original number as written in the source (with leading zeros). */
  number: string;
  /** Canonical printed code we resolved to (e.g. "USA15"). */
  code: string;
  /** Human/team display label, e.g. "USA" or "FWC". */
  displayPrefix: string;
  /** Decorative emoji cluster from the source line (🇺🇸, 🏆, …). */
  emoji: string;
  /**
   * Quantity the user currently has:
   *  - 0   → missing
   *  - 1   → owned (cannot trade)
   *  - > 1 → the user has at least one duplicate to give away
   */
  quantity: number;
  /** Convenience: `quantity > 1`. */
  canGive: boolean;
  /** Convenience: `quantity === 0`. */
  isMissing: boolean;
}

export interface FiguritasAppLineMatch {
  prefix: string;
  emoji: string;
  /** Stickers from this line the user has duplicates of. */
  iCanGive: FiguritasAppStickerMatch[];
  /** Stickers from this line the user is missing. */
  iNeed: FiguritasAppStickerMatch[];
  /** Stickers from this line the user owns exactly one of. */
  iOwn: FiguritasAppStickerMatch[];
  /** Stickers from this line the parser couldn't resolve to a known sticker. */
  unresolved: { number: string; candidates: string[] }[];
}

export interface FiguritasAppMatchResult {
  /** Original parsed lines (preserves source order and emoji). */
  lines: ParsedLine[];
  /** Per-line breakdown, in source order. */
  byLine: FiguritasAppLineMatch[];
  /** Flat list of every sticker the user can give the other person. */
  iCanGive: FiguritasAppStickerMatch[];
  /** Flat list of every sticker the other person can give the user. */
  iNeed: FiguritasAppStickerMatch[];
  /** Sticker codes we couldn't resolve to a known sticker in this collection. */
  unresolved: { prefix: string; number: string; candidates: string[] }[];
}

/**
 * Run the full pipeline against a parsed `figuritas.app` text blob.
 *
 * Returns an empty-ish result when the input is empty, when the collection
 * has no stickers, or when nothing parsed cleanly. Never throws — errors are
 * surfaced via the `unresolved` field so the UI can keep working.
 */
export async function matchFiguritasAppList(
  collectionId: string,
  text: string
): Promise<FiguritasAppMatchResult> {
  const parsed = parseFiguritasAppList(text);

  const [stickers, inventory] = await Promise.all([
    db.stickers.where('collectionId').equals(collectionId).toArray(),
    db.inventory.where('collectionId').equals(collectionId).toArray(),
  ]);

  // Code → sticker index. Pre-built so lookups in the hot loop are O(1).
  const stickerByCode = new Map<string, StoredSticker>();
  for (const s of stickers) stickerByCode.set(s.normalizedCode, s);

  const qty = new Map(inventory.map((i) => [i.stickerId, i.quantity]));

  // Aggregate per-line buckets in source order.
  const byLine: FiguritasAppLineMatch[] = parsed.lines.map((line) => ({
    prefix: line.prefix,
    emoji: line.emoji,
    iCanGive: [],
    iNeed: [],
    iOwn: [],
    unresolved: [],
  }));

  const allGive: FiguritasAppStickerMatch[] = [];
  const allNeed: FiguritasAppStickerMatch[] = [];
  const allUnresolved: FiguritasAppMatchResult['unresolved'] = [];

  parsed.entries.forEach((entry, idx) => {
    // Resolve which source line this entry belongs to. The parser flattens
    // every line's numbers into a single list, so we re-derive the line index
    // from the cumulative count per line.
    const lineIndex = findLineIndex(parsed, idx);
    const target = byLine[lineIndex];
    const emoji = parsed.lines[lineIndex].emoji;
    const prefix = parsed.lines[lineIndex].prefix;

    const candidates = candidateCodes(prefix, entry.number);
    const sticker = candidates
      .map((c) => stickerByCode.get(normalizeCode(c)))
      .find((s): s is StoredSticker => Boolean(s));

    if (!sticker) {
      target.unresolved.push({ number: entry.number, candidates });
      allUnresolved.push({
        prefix,
        number: entry.number,
        candidates,
      });
      return;
    }

    const quantity = qty.get(sticker.id) ?? 0;
    const match: FiguritasAppStickerMatch = {
      stickerId: sticker.id,
      prefix,
      number: entry.number,
      code: sticker.code,
      displayPrefix: prefix,
      emoji,
      quantity,
      canGive: quantity > 1,
      isMissing: quantity === 0,
    };

    if (quantity > 1) {
      target.iCanGive.push(match);
      allGive.push(match);
    } else if (quantity === 0) {
      target.iNeed.push(match);
      allNeed.push(match);
    } else {
      target.iOwn.push(match);
    }
  });

  return {
    lines: parsed.lines,
    byLine,
    iCanGive: allGive,
    iNeed: allNeed,
    unresolved: allUnresolved,
  };
}

/**
 * Resolve the source-line index for a flat entry index. We re-derive this each
 * call instead of stashing the index in the parser to keep the data model
 * minimal.
 */
function findLineIndex(
  parsed: { lines: { numbers: string[] }[] },
  entryIdx: number
): number {
  let acc = 0;
  for (let i = 0; i < parsed.lines.length; i++) {
    const len = parsed.lines[i].numbers.length;
    if (entryIdx < acc + len) return i;
    acc += len;
  }
  return Math.max(0, parsed.lines.length - 1);
}
