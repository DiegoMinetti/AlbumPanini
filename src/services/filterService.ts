import type { StoredSticker, Team } from '@/types/collection';

/** The high-level ownership filters offered in the sticker browser. */
export type OwnershipFilter = 'all' | 'missing' | 'owned' | 'duplicates';

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

/**
 * "Extra" stickers are foil/parallel variants that ship only in some country
 * editions (e.g. shiny player parallels). They are NOT part of the standard
 * 980-sticker base set, so by default they are hidden — toggling them on lets
 * collectors of those editions track them too.
 */
export function isExtraSticker(sticker: StoredSticker): boolean {
  return sticker.type === 'shiny';
}

/** Stickers in official album order (the `order` field encodes album layout). */
export function sortByAlbumOrder(stickers: StoredSticker[]): StoredSticker[] {
  return [...stickers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Distinct, sorted list of categories present in a sticker set. */
export function distinctCategories(stickers: StoredSticker[]): string[] {
  return [...new Set(stickers.map((s) => s.category || 'default'))].sort();
}

/** Distinct, sorted list of rarities present in a sticker set. */
export function distinctRarities(stickers: StoredSticker[]): string[] {
  return [...new Set(stickers.map((s) => s.rarity || 'common'))].sort();
}

/** Synthetic group keys for stickers that don't belong to any team. */
export const INTRO_GROUP = '__intro__';
export const WFC_GROUP = '__wfc__';
export const SPECIAL_GROUP = '__special__';

/** A collapsible section of the sticker browser (one country or special set). */
export interface StickerGroup {
  /** Stable key: a team id, or one of the synthetic `*_GROUP` constants. */
  key: string;
  /** Team name, or `null` for synthetic groups (UI supplies a localized label). */
  label: string | null;
  /** Team flag (emoji / asset path), when the group is a country. */
  flag?: string;
  stickers: StoredSticker[];
  /** Album order of the first member, used to order the sections. */
  order: number;
}

const ALPHA_PREFIX = /^[A-Za-z]+/;

/**
 * Bucket album-ordered stickers into collapsible sections:
 *  - one section per country (team), and
 *  - synthetic sections for the opening "00", the FIFA World Cup ("WFC") cards,
 *    and any remaining team-less specials.
 *
 * A sticker is assigned to a country by its `teamId`, or — for team-less cards
 * whose code carries a country prefix (e.g. "CAN9") — by matching that prefix
 * to a team id. Sections are returned in album order (by first member).
 */
export function groupStickers(
  stickers: StoredSticker[],
  teams: Team[]
): StickerGroup[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const buckets = new Map<string, StoredSticker[]>();

  for (const sticker of stickers) {
    let key: string | null =
      sticker.teamId && teamById.has(sticker.teamId) ? sticker.teamId : null;
    if (!key) {
      const prefix = (
        sticker.code.match(ALPHA_PREFIX)?.[0] ?? ''
      ).toUpperCase();
      if (teamById.has(prefix)) key = prefix;
    }
    if (!key) {
      if (sticker.code === '00') key = INTRO_GROUP;
      else if (/^(FWC|WFC)/i.test(sticker.code)) key = WFC_GROUP;
      else key = SPECIAL_GROUP;
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.push(sticker);
    else buckets.set(key, [sticker]);
  }

  const groups: StickerGroup[] = [];
  for (const [key, members] of buckets) {
    const ordered = sortByAlbumOrder(members);
    const team = teamById.get(key);
    groups.push({
      key,
      label: team?.name ?? null,
      flag: team?.flag,
      stickers: ordered,
      order: ordered[0]?.order ?? 0,
    });
  }

  return groups.sort((a, b) => a.order - b.order);
}

/** Owned (quantity > 0) sticker count within a group, for header progress. */
export function ownedInGroup(
  group: StickerGroup,
  inventory: Map<string, number>
): number {
  return group.stickers.reduce(
    (n, s) => n + ((inventory.get(s.id) ?? 0) > 0 ? 1 : 0),
    0
  );
}

/** Prefix marking a tournament-group section key, e.g. "tgroup-A". */
export const TGROUP_KEY_PREFIX = 'tgroup-';

/**
 * A top-level section of the grouped browser. Either a tournament group
 * (A..L) holding nested country sub-groups (`countries`), or a leaf section
 * for team-less specials / teams outside the tournament (`stickers`).
 */
export interface StickerSection {
  /** Stable key: `tgroup-<id>` for tournament groups, else a team id / `*_GROUP`. */
  key: string;
  /** Tournament group id ("A".."L"); team name for leaf team sections; `null` → UI localizes. */
  label: string | null;
  /** Flag emoji for leaf team sections. */
  flag?: string;
  /** Album order of the first member, used to order the sections. */
  order: number;
  /** Nested country sub-groups (tournament-group sections); empty for leaf sections. */
  countries: StickerGroup[];
  /** Direct stickers (leaf sections); empty for tournament-group sections. */
  stickers: StoredSticker[];
}

/** Minimal shape of a tournament group needed to nest countries. */
export interface TeamGrouping {
  id: string;
  teamIds: string[];
}

/**
 * Two-level grouping that mirrors the physical album: tournament groups
 * (A..L) as top sections, each holding its countries, and synthetic leaf
 * sections (intro "00", FIFA World Cup, specials) for team-less cards. When
 * no tournament structure is supplied, every country becomes its own leaf
 * section — i.e. the flat country grouping.
 */
export function groupStickersByTournament(
  stickers: StoredSticker[],
  teams: Team[],
  tournamentGroups: TeamGrouping[] = []
): StickerSection[] {
  const countryGroups = groupStickers(stickers, teams);
  const groupOfTeam = new Map<string, string>();
  for (const g of tournamentGroups)
    for (const id of g.teamIds) groupOfTeam.set(id, g.id);

  const byKey = new Map<string, StickerSection>();
  const ensure = (key: string, label: string | null): StickerSection => {
    let section = byKey.get(key);
    if (!section) {
      section = {
        key,
        label,
        order: Number.POSITIVE_INFINITY,
        countries: [],
        stickers: [],
      };
      byKey.set(key, section);
    }
    return section;
  };

  for (const group of countryGroups) {
    const tgroup = groupOfTeam.get(group.key);
    if (tgroup) {
      const section = ensure(`${TGROUP_KEY_PREFIX}${tgroup}`, tgroup);
      section.countries.push(group);
      section.order = Math.min(section.order, group.order);
    } else {
      const section = ensure(group.key, group.label);
      section.flag = group.flag;
      section.stickers.push(...group.stickers);
      section.order = Math.min(section.order, group.order);
    }
  }

  for (const section of byKey.values())
    section.countries.sort((a, b) => a.order - b.order);

  return [...byKey.values()].sort((a, b) => a.order - b.order);
}

/** Owned / total sticker counts for a section header (nests countries). */
export function sectionTotals(
  section: StickerSection,
  inventory: Map<string, number>
): { owned: number; total: number } {
  let total = section.stickers.length;
  let owned = section.stickers.reduce(
    (n, s) => n + ((inventory.get(s.id) ?? 0) > 0 ? 1 : 0),
    0
  );
  for (const country of section.countries) {
    total += country.stickers.length;
    owned += ownedInGroup(country, inventory);
  }
  return { owned, total };
}

/** Every collapse key (sections + nested countries), for bulk expand/collapse. */
export function sectionKeys(sections: StickerSection[]): string[] {
  const keys: string[] = [];
  for (const section of sections) {
    keys.push(section.key);
    for (const country of section.countries) keys.push(country.key);
  }
  return keys;
}
