import { describe, it, expect } from 'vitest';
import {
  filterStickers,
  distinctCategories,
  distinctRarities,
  groupStickers,
  groupStickersByTournament,
  ownedInGroup,
  sectionTotals,
  sectionKeys,
  DEFAULT_FILTER,
  INTRO_GROUP,
  WFC_GROUP,
  SPECIAL_GROUP,
} from './filterService';
import { sticker, team } from '@/tests/helpers';

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

describe('groupStickers', () => {
  const teams = [
    team({ id: 'MEX', name: 'México', flag: '🇲🇽', order: 1 }),
    team({ id: 'CAN', name: 'Canadá', flag: '🇨🇦', order: 2 }),
  ];
  const set = [
    sticker({ id: 'p00', code: '00', name: 'Panini', order: 0 }),
    sticker({ id: 'mex2', code: 'MEX2', teamId: 'MEX', order: 10 }),
    sticker({ id: 'mex1', code: 'MEX1', teamId: 'MEX', order: 9 }),
    sticker({ id: 'can9', code: 'CAN9', order: 97 }), // team-less, prefix → CAN
    sticker({ id: 'fwc1', code: 'FWC1', order: 1 }),
    sticker({ id: 'x', code: 'X1', order: 500 }), // no team, no match
  ];

  it('orders sections by album order and labels synthetic groups', () => {
    const g = groupStickers(set, teams);
    expect(g.map((x) => x.key)).toEqual([
      INTRO_GROUP,
      WFC_GROUP,
      'MEX',
      'CAN',
      SPECIAL_GROUP,
    ]);
    expect(g[2].label).toBe('México');
    expect(g[2].flag).toBe('🇲🇽');
  });

  it('assigns team-less codes to a country by prefix', () => {
    const can = groupStickers(set, teams).find((x) => x.key === 'CAN');
    expect(can?.stickers.map((s) => s.id)).toEqual(['can9']);
  });

  it('sorts members within a group by album order', () => {
    const mex = groupStickers(set, teams).find((x) => x.key === 'MEX');
    expect(mex?.stickers.map((s) => s.id)).toEqual(['mex1', 'mex2']);
  });

  it('ownedInGroup counts stickers with quantity > 0', () => {
    const mex = groupStickers(set, teams).find((x) => x.key === 'MEX')!;
    const inventory = new Map([
      ['mex1', 3],
      ['mex2', 0],
    ]);
    expect(ownedInGroup(mex, inventory)).toBe(1);
  });
});

describe('groupStickersByTournament', () => {
  const teams = [
    team({ id: 'MEX', name: 'México', flag: '🇲🇽', order: 1 }),
    team({ id: 'CAN', name: 'Canadá', flag: '🇨🇦', order: 2 }),
    team({ id: 'BRA', name: 'Brasil', flag: '🇧🇷', order: 3 }),
  ];
  const set = [
    sticker({ id: 'p00', code: '00', name: 'Panini', order: 0 }),
    sticker({ id: 'mex1', code: 'MEX1', teamId: 'MEX', order: 10 }),
    sticker({ id: 'can1', code: 'CAN1', teamId: 'CAN', order: 20 }),
    sticker({ id: 'bra1', code: 'BRA1', teamId: 'BRA', order: 30 }),
  ];
  const tgroups = [
    { id: 'A', teamIds: ['MEX', 'CAN'] },
    { id: 'B', teamIds: ['BRA'] },
  ];

  it('nests countries under tournament-group sections in album order', () => {
    const sections = groupStickersByTournament(set, teams, tgroups);
    // Intro leaf first (order 0), then Group A (10), then Group B (30).
    expect(sections.map((s) => s.key)).toEqual([
      INTRO_GROUP,
      'tgroup-A',
      'tgroup-B',
    ]);
    const groupA = sections.find((s) => s.key === 'tgroup-A')!;
    expect(groupA.label).toBe('A');
    expect(groupA.countries.map((c) => c.key)).toEqual(['MEX', 'CAN']);
    expect(groupA.stickers).toHaveLength(0);
  });

  it('sectionTotals aggregates owned/total across nested countries', () => {
    const sections = groupStickersByTournament(set, teams, tgroups);
    const groupA = sections.find((s) => s.key === 'tgroup-A')!;
    const inventory = new Map([['mex1', 2]]); // can1 unowned
    expect(sectionTotals(groupA, inventory)).toEqual({ owned: 1, total: 2 });
  });

  it('sectionKeys lists section and nested country keys', () => {
    const sections = groupStickersByTournament(set, teams, tgroups);
    expect(sectionKeys(sections)).toEqual([
      INTRO_GROUP,
      'tgroup-A',
      'MEX',
      'CAN',
      'tgroup-B',
      'BRA',
    ]);
  });

  it('falls back to flat leaf country sections without a tournament', () => {
    const sections = groupStickersByTournament(set, teams, []);
    expect(sections.map((s) => s.key)).toEqual([
      INTRO_GROUP,
      'MEX',
      'CAN',
      'BRA',
    ]);
    // Leaf sections carry stickers directly, no nesting.
    const mex = sections.find((s) => s.key === 'MEX')!;
    expect(mex.countries).toHaveLength(0);
    expect(mex.stickers.map((s) => s.id)).toEqual(['mex1']);
  });
});
