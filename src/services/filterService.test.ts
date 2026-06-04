import { describe, it, expect } from 'vitest';
import {
  filterStickers,
  distinctCategories,
  distinctRarities,
  DEFAULT_FILTER,
} from './filterService';
import { sticker } from '@/tests/helpers';

const stickers = [
  sticker({
    id: 'ARG-1',
    code: 'ARG 1',
    name: 'Messi',
    teamId: 'ARG',
    category: 'player',
    rarity: 'rare',
  }),
  sticker({
    id: 'ARG-2',
    code: 'ARG 2',
    name: 'Dibu',
    teamId: 'ARG',
    category: 'badge',
    rarity: 'common',
  }),
  sticker({
    id: 'BRA-1',
    code: 'BRA 1',
    name: 'Neymar',
    teamId: 'BRA',
    category: 'player',
    rarity: 'common',
  }),
];
const inv = new Map([
  ['ARG-1', 2],
  ['ARG-2', 0],
  ['BRA-1', 1],
]);

describe('filterStickers ownership', () => {
  it('all returns everything', () => {
    expect(filterStickers(stickers, inv, DEFAULT_FILTER)).toHaveLength(3);
  });
  it('owned', () => {
    const r = filterStickers(stickers, inv, {
      ...DEFAULT_FILTER,
      ownership: 'owned',
    });
    expect(r.map((s) => s.id)).toEqual(['ARG-1', 'BRA-1']);
  });
  it('missing', () => {
    const r = filterStickers(stickers, inv, {
      ...DEFAULT_FILTER,
      ownership: 'missing',
    });
    expect(r.map((s) => s.id)).toEqual(['ARG-2']);
  });
  it('duplicates', () => {
    const r = filterStickers(stickers, inv, {
      ...DEFAULT_FILTER,
      ownership: 'duplicates',
    });
    expect(r.map((s) => s.id)).toEqual(['ARG-1']);
  });
});

describe('filterStickers facets', () => {
  it('filters by team', () => {
    const r = filterStickers(stickers, inv, {
      ...DEFAULT_FILTER,
      teamId: 'BRA',
    });
    expect(r).toHaveLength(1);
  });
  it('filters by category and rarity', () => {
    const r = filterStickers(stickers, inv, {
      ...DEFAULT_FILTER,
      category: 'player',
      rarity: 'rare',
    });
    expect(r.map((s) => s.id)).toEqual(['ARG-1']);
  });
  it('searches by name and code', () => {
    expect(
      filterStickers(stickers, inv, { ...DEFAULT_FILTER, search: 'messi' })
    ).toHaveLength(1);
    expect(
      filterStickers(stickers, inv, { ...DEFAULT_FILTER, search: 'bra 1' })
    ).toHaveLength(1);
  });
});

describe('distinct helpers', () => {
  it('lists categories and rarities', () => {
    expect(distinctCategories(stickers)).toEqual(['badge', 'player']);
    expect(distinctRarities(stickers)).toEqual(['common', 'rare']);
  });
});
