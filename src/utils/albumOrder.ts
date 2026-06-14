/**
 * Album order — the canonical ordering of stickers, groups, and teams
 * within a collection.
 *
 * Goal: every list of stickers in the UI (stickers page, exchange page,
 * dashboard, etc.) should sort exactly the way the physical album does.
 * That way, when the user finds sticker #7 of Argentina in the album,
 * the same figurita shows up in the same position on screen.
 *
 * ## Order rules
 *
 * 1. **Special groups** (synthetic, not real teams) come first in this
 *    fixed order: `FWC`, then `INTRO`. (FWC = FIFA World Cup stickers
 *    such as the trophy/host page. INTRO = stickers with no team
 *    prefix, like the Panini logo `00`.)
 *
 * 2. **Real teams** follow, in the order they appear in the `teams`
 *    array of the collection package JSON. The package author decides
 *    the album's team order; we don't infer it from the tournament
 *    fixture (groups A..L) because not every collection has a
 *    tournament block, and a flat album-style order is what the user
 *    expects.
 *
 * 3. **Within a group** (FWC, INTRO, or a team), stickers sort by their
 *    `order` field. Sticker `00` is `order: 0`, the first player card
 *    is `order: 1`, etc. We fall back to a numeric extraction from the
 *    code when `order` is missing.
 *
 * ## How to use
 *
 * - `albumPrefixOrder(teams)` returns the ordered list of prefixes
 *   (e.g. `["FWC", "INTRO", "MEX", "RSA", "KOR", ...]`). Use this to
 *   sort a `Map<prefix, ...>` or an array of groups.
 *
 * - `albumGroupSort(prefixes, teams)` is a comparator suitable for
 *   `Array.prototype.sort` when the array contains prefixes or objects
 *   with a `.prefix` field.
 *
 * - `albumStickerSort(stickers, teams)` is a comparator for an array of
 *   stickers, sorting by group (per the album) and then by `order`.
 */

import type { StoredSticker, StoredTeam } from '@/types/collection';

/**
 * Synthetic, non-team group keys that always come first, in this order.
 * Anything not in this list is treated as a real team.
 */
const SPECIAL_PREFIXES = ['FWC', 'INTRO'] as const;
type SpecialPrefix = (typeof SPECIAL_PREFIXES)[number];

/** True if the prefix is a synthetic (non-team) group. */
export function isSpecialPrefix(prefix: string): prefix is SpecialPrefix {
  return (SPECIAL_PREFIXES as readonly string[]).includes(prefix.toUpperCase());
}

/**
 * Return the canonical prefix order for a collection, given the team's
 * array from the package.
 *
 * Example output for World Cup 2026:
 *   ["FWC", "INTRO", "MEX", "RSA", "KOR", "CZE", "CAN", ...]
 */
export function albumPrefixOrder(teams: StoredTeam[]): string[] {
  const order: string[] = [];
  // 1. Special prefixes first.
  for (const p of SPECIAL_PREFIXES) order.push(p);
  // 2. Real teams, in the order they appear in the JSON.
  for (const t of teams) {
    const id = t.id.toUpperCase();
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

/**
 * Comparator that sorts objects with a `.prefix` field by the album order
 * of their prefix. Unknown prefixes (not in the album at all) sort to
 * the end, preserving the order they were first seen.
 */
export function albumGroupSort<T extends { prefix: string }>(
  groups: T[],
  teams: StoredTeam[]
): T[] {
  const prefixOrder = albumPrefixOrder(teams);
  const prefixIndex = new Map<string, number>();
  prefixOrder.forEach((p, i) => prefixIndex.set(p, i));
  return [...groups].sort((a, b) => {
    const ai = prefixIndex.get(a.prefix.toUpperCase());
    const bi = prefixIndex.get(b.prefix.toUpperCase());
    // Known prefixes: sort by album order.
    if (ai !== undefined && bi !== undefined) return ai - bi;
    // Unknown prefix: keep relative order (stable sort), push to end.
    if (ai === undefined && bi === undefined) return 0;
    return ai === undefined ? 1 : -1;
  });
}

/**
 * Comparator that sorts stickers by (group in album order, then by `order`).
 * Use for any flat list of stickers that should mirror the album layout.
 */
export function albumStickerSort(
  stickers: StoredSticker[],
  teams: StoredTeam[]
): StoredSticker[] {
  const prefixOrder = albumPrefixOrder(teams);
  const prefixIndex = new Map<string, number>();
  prefixOrder.forEach((p, i) => prefixIndex.set(p, i));

  const orderOf = (s: StoredSticker): number => {
    if (s.order !== undefined) return s.order;
    // Fallback: pull a number off the end of the code.
    const m = s.code.match(/(\d+)$/);
    return m ? Number.parseInt(m[1], 10) : 0;
  };

  const prefixOf = (s: StoredSticker): string => {
    if (s.teamId) return s.teamId.toUpperCase();
    // Synthetic groups by code prefix.
    const m = s.code.match(/^([A-Za-z]+)/);
    const upper = m ? m[1].toUpperCase() : '';
    if (upper === 'FWC' || upper === 'WFC') return 'FWC';
    if (upper === '' || upper === '00' || upper === 'INTRO') return 'INTRO';
    return upper;
  };

  return [...stickers].sort((a, b) => {
    const pa = prefixOf(a);
    const pb = prefixOf(b);
    const ai = prefixIndex.get(pa);
    const bi = prefixIndex.get(pb);
    if (ai !== undefined && bi !== undefined && ai !== bi) return ai - bi;
    if (ai === undefined && bi === undefined) {
      // Both unknown — fall through to numeric compare.
    } else if (ai === undefined) return 1;
    else if (bi === undefined) return -1;
    return orderOf(a) - orderOf(b);
  });
}

/**
 * Sort the entries of a `prefix -> numbers[]` map (or any object with
 * the same shape) into the album order, then sort each entry's numbers
 * by the sticker's `order` field. Useful for `buildOwnList` outputs.
 */
export function sortGroupsByAlbum<
  G extends {
    prefix: string;
    numbers: number[];
    orderOfNumber?: (n: number) => number;
  },
>(groups: G[], teams: StoredTeam[]): G[] {
  return albumGroupSort(groups, teams).map((g) => {
    if (typeof g.orderOfNumber === 'function') {
      const sorted = [...g.numbers].sort(
        (a, b) => g.orderOfNumber!(a) - g.orderOfNumber!(b)
      );
      return { ...g, numbers: sorted };
    }
    return g;
  });
}

/**
 * Sort a list of stickers by `order` (album position). Use this anywhere
 * the source order matters — Dexie doesn't preserve insertion order on
 * fetch, so we have to sort explicitly.
 */
export function sortStickersByAlbumOrder(
  stickers: StoredSticker[]
): StoredSticker[] {
  return [...stickers].sort((a, b) => {
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    return oa - ob;
  });
}
