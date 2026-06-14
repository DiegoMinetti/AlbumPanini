import { describe, it, expect } from 'vitest';
import {
  albumPrefixOrder,
  albumGroupSort,
  albumStickerSort,
  isSpecialPrefix,
} from './albumOrder';
import type { StoredSticker, StoredTeam } from '@/types/collection';

const wcTeams: StoredTeam[] = [
  { uid: 'wc::MEX', id: 'MEX', collectionId: 'wc', name: 'Mexico' },
  { uid: 'wc::RSA', id: 'RSA', collectionId: 'wc', name: 'South Africa' },
  { uid: 'wc::KOR', id: 'KOR', collectionId: 'wc', name: 'Korea' },
  { uid: 'wc::CZE', id: 'CZE', collectionId: 'wc', name: 'Czechia' },
];

const wcStickers: StoredSticker[] = [
  {
    uid: 'wc::KOR-1',
    id: 'KOR-1',
    collectionId: 'wc',
    code: 'KOR1',
    teamId: 'KOR',
    order: 1,
  },
  {
    uid: 'wc::MEX-1',
    id: 'MEX-1',
    collectionId: 'wc',
    code: 'MEX1',
    teamId: 'MEX',
    order: 1,
  },
  { uid: 'wc::FWC-1', id: 'FWC-1', collectionId: 'wc', code: 'FWC1', order: 1 },
  {
    uid: 'wc::CZE-1',
    id: 'CZE-1',
    collectionId: 'wc',
    code: 'CZE1',
    teamId: 'CZE',
    order: 1,
  },
  {
    uid: 'wc::MEX-2',
    id: 'MEX-2',
    collectionId: 'wc',
    code: 'MEX2',
    teamId: 'MEX',
    order: 2,
  },
  { uid: 'wc::FWC-2', id: 'FWC-2', collectionId: 'wc', code: 'FWC2', order: 2 },
  { uid: 'wc::00', id: '00', collectionId: 'wc', code: '00', order: 0 },
];

describe('isSpecialPrefix', () => {
  it('matches FWC and INTRO (case-insensitive)', () => {
    expect(isSpecialPrefix('FWC')).toBe(true);
    expect(isSpecialPrefix('fwc')).toBe(true);
    expect(isSpecialPrefix('INTRO')).toBe(true);
    expect(isSpecialPrefix('intro')).toBe(true);
  });
  it('does not match regular team codes', () => {
    expect(isSpecialPrefix('MEX')).toBe(false);
    expect(isSpecialPrefix('USA')).toBe(false);
  });
});

describe('albumPrefixOrder', () => {
  it('returns special prefixes first, then teams in array order', () => {
    expect(albumPrefixOrder(wcTeams)).toEqual([
      'FWC',
      'INTRO',
      'MEX',
      'RSA',
      'KOR',
      'CZE',
    ]);
  });

  it('returns just the special prefixes when there are no teams', () => {
    expect(albumPrefixOrder([])).toEqual(['FWC', 'INTRO']);
  });

  it('deduplicates team ids that appear twice', () => {
    expect(
      albumPrefixOrder([
        { uid: 'a::MEX', id: 'MEX', collectionId: 'a', name: 'Mexico' },
        { uid: 'b::MEX', id: 'MEX', collectionId: 'b', name: 'Mexico dup' },
      ])
    ).toEqual(['FWC', 'INTRO', 'MEX']);
  });
});

describe('albumGroupSort', () => {
  it('sorts groups by album order, with unknown prefixes pushed to the end', () => {
    const groups = [
      { prefix: 'KOR', numbers: [1] },
      { prefix: 'UNKNOWN', numbers: [9] },
      { prefix: 'MEX', numbers: [1] },
      { prefix: 'FWC', numbers: [1] },
    ];
    const out = albumGroupSort(groups, wcTeams);
    expect(out.map((g) => g.prefix)).toEqual(['FWC', 'MEX', 'KOR', 'UNKNOWN']);
  });

  it('does not mutate the input array', () => {
    const groups = [
      { prefix: 'KOR', numbers: [1] },
      { prefix: 'MEX', numbers: [1] },
    ];
    const before = groups.map((g) => g.prefix);
    albumGroupSort(groups, wcTeams);
    expect(groups.map((g) => g.prefix)).toEqual(before);
  });
});

describe('albumStickerSort', () => {
  it('sorts by group album order (FWC → INTRO → countries), then by sticker order', () => {
    const out = albumStickerSort(wcStickers, wcTeams);
    expect(out.map((s) => s.id)).toEqual([
      'FWC-1', // FWC (order 1)
      'FWC-2', // FWC (order 2)
      '00', // INTRO (order 0)
      'MEX-1', // MEX (order 1)
      'MEX-2', // MEX (order 2)
      'KOR-1', // KOR (order 1)
      'CZE-1', // CZE (order 1)
    ]);
  });

  it('falls back to numeric suffix when `order` is missing', () => {
    const noOrder: StoredSticker[] = [
      {
        uid: 'a::KOR-9',
        id: 'KOR-9',
        collectionId: 'a',
        code: 'KOR9',
        teamId: 'KOR',
      },
      {
        uid: 'a::KOR-1',
        id: 'KOR-1',
        collectionId: 'a',
        code: 'KOR1',
        teamId: 'KOR',
      },
      {
        uid: 'a::KOR-3',
        id: 'KOR-3',
        collectionId: 'a',
        code: 'KOR3',
        teamId: 'KOR',
      },
    ];
    const out = albumStickerSort(noOrder, wcTeams);
    expect(out.map((s) => s.id)).toEqual(['KOR-1', 'KOR-3', 'KOR-9']);
  });

  it('does not mutate the input array', () => {
    const before = wcStickers.map((s) => s.id);
    albumStickerSort(wcStickers, wcTeams);
    expect(wcStickers.map((s) => s.id)).toEqual(before);
  });
});
