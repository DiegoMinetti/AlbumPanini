import type { StoredSticker } from '@/types/collection';

/** The high-level ownership filters offered in the sticker browser. */
export type OwnershipFilter =
  | 'all'
  | 'missing'
  | 'owned'
  | 'duplicates';

export interface StickerFilter {
  ownership: OwnershipFilter;
  search: string;
  teamId: string | null;
  category: string | null;
  rarity: string | null;
}

export const DEFAULT_FILTER: StickerFilter = {
  ownership: 'all',
  search: '',
  teamId: null,
  category: null,
  rarity: null,
};

function matchesOwnership(quantity: number, filter: OwnershipFilter): boolean {
  switch (filter) {
    case 'owned':
      return quantity > 0;
    case 'missing':
      return quantity === 0;
    case 'duplicates':
      return quantity > 1;
    case 'all':
    default:
      return true;
  }
}

/**
 * Filter + search stickers against the current inventory. Pure and synchronous
 * so it can run inside a `useMemo` on every keystroke without hitting the DB.
 */
export function filterStickers(
  stickers: StoredSticker[],
  inventory: Map<string, number>,
  filter: StickerFilter
): StoredSticker[] {
  const search = filter.search.trim().toLowerCase();

  return stickers.filter((sticker) => {
    const qty = inventory.get(sticker.id) ?? 0;
    if (!matchesOwnership(qty, filter.ownership)) return false;
    if (filter.teamId && sticker.teamId !== filter.teamId) return false;
    if (filter.category && sticker.category !== filter.category) return false;
    if (filter.rarity && sticker.rarity !== filter.rarity) return false;
    if (search) {
      const haystack =
        `${sticker.code} ${sticker.name} ${sticker.teamId ?? ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/** Distinct, sorted list of categories present in a sticker set. */
export function distinctCategories(stickers: StoredSticker[]): string[] {
  return [...new Set(stickers.map((s) => s.category || 'default'))].sort();
}

/** Distinct, sorted list of rarities present in a sticker set. */
export function distinctRarities(stickers: StoredSticker[]): string[] {
  return [...new Set(stickers.map((s) => s.rarity || 'common'))].sort();
}
