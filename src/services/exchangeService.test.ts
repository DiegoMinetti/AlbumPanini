import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/db';
import {
  parseExchangeText,
  buildExchangeText,
  buildOwnList,
  resolveExchangeText,
} from './exchangeService';

/**
 * Realistic external-format paste from the Figuritas-style app, used
 * throughout this file. The "Me faltan" section lists what the friend
 * needs; the "Repetidas" section lists what the friend has duplicates
 * of. A few stickers are picked from the user's own inventory so the
 * resolver has something to classify.
 */
const FRIEND_TEXT = `Me faltan
FWC 🏆: 4
FWC 📜: 14, 17, 18, 19
MEX 🇲🇽: 14
KOR 🇰🇷: 1, 16, 20
CZE 🇨🇿: 10, 16, 20

Repetidas
RSA 🇿🇦: 5, 13
KOR 🇰🇷: 3, 5
CZE 🇨🇿: 4, 5, 13, 17
CAN 🇨🇦: 5
BIH 🇧🇦: 16

Descarga la app
https://www.figuritas.app/es/descargar`;

describe('parseExchangeText', () => {
  it('detects external format and splits into friendWants / friendHasExtra', () => {
    const out = parseExchangeText(FRIEND_TEXT);
    expect(out.source).toBe('external');
    expect(out.error).toBeNull();
    // friendWants = codes under "Me faltan"
    expect(out.friendWants).toContain('FWC4');
    expect(out.friendWants).toContain('FWC14');
    expect(out.friendWants).toContain('MEX14');
    expect(out.friendWants).toContain('KOR1');
    expect(out.friendWants).toContain('KOR16');
    expect(out.friendWants).toContain('CZE10');
    // friendHasExtra = codes under "Repetidas"
    expect(out.friendHasExtra).toContain('RSA5');
    expect(out.friendHasExtra).toContain('RSA13');
    expect(out.friendHasExtra).toContain('KOR3');
    expect(out.friendHasExtra).toContain('CZE4');
    expect(out.friendHasExtra).toContain('CAN5');
    expect(out.friendHasExtra).toContain('BIH16');
  });

  it('does NOT mix the two sections together', () => {
    const out = parseExchangeText(FRIEND_TEXT);
    // "FWC4" appears in friendWants (Me faltan), not in friendHasExtra
    expect(out.friendHasExtra).not.toContain('FWC4');
    // "RSA5" appears in friendHasExtra (Repetidas), not in friendWants
    expect(out.friendWants).not.toContain('RSA5');
  });

  it('recognizes section headers case-insensitively and in multiple languages', () => {
    const cases = [
      { header: 'Me faltan', kind: 'wants' as const },
      { header: 'me faltan', kind: 'wants' as const },
      { header: 'ME FALTAN', kind: 'wants' as const },
      { header: 'Repetidas', kind: 'extras' as const },
      { header: 'Faltan', kind: 'wants' as const },
      { header: 'Missing', kind: 'wants' as const },
      { header: 'Duplicates', kind: 'extras' as const },
      { header: 'Faltam', kind: 'wants' as const },
    ];
    for (const c of cases) {
      const text = `${c.header}\nARG 🇦🇷: 1`;
      const out = parseExchangeText(text);
      if (c.kind === 'wants') {
        expect(out.friendWants, c.header).toContain('ARG1');
        expect(out.friendHasExtra, c.header).not.toContain('ARG1');
      } else {
        expect(out.friendHasExtra, c.header).toContain('ARG1');
        expect(out.friendWants, c.header).not.toContain('ARG1');
      }
    }
  });

  it('returns a no-headers error when external text has no section markers', () => {
    const out = parseExchangeText('ARG 🇦🇷: 1\nBRA 🇧🇷: 5');
    expect(out.source).toBe('external');
    expect(out.error).toBe('no-headers');
    expect(out.friendWants).toEqual([]);
    expect(out.friendHasExtra).toEqual([]);
  });

  it('treats lines before the first header as unresolved', () => {
    const out = parseExchangeText('ARG 🇦🇷: 1\n\nMe faltan\nBRA 🇧🇷: 5');
    expect(out.friendWants).toEqual(['BRA5']);
    expect(out.unresolved).toEqual([{ prefix: 'ARG', number: '1' }]);
  });

  it('strips the trailing app banner URL from the parsed lines', () => {
    const out = parseExchangeText(FRIEND_TEXT);
    expect(
      out.lines.every((l) => !l.prefix.toLowerCase().includes('http'))
    ).toBe(true);
  });

  it('returns an empty result on empty / whitespace input', () => {
    const out = parseExchangeText('   \n\n   ');
    expect(out.friendWants).toEqual([]);
    expect(out.friendHasExtra).toEqual([]);
    expect(out.error).toBeNull();
  });
});

describe('buildExchangeText', () => {
  it('emits 2 labelled blocks separated by a blank line, plus a header line and the deep link', () => {
    const text = buildExchangeText({
      labels: {
        openInApp: 'Abrí en la app',
        headingDuplicates: 'Tengo repetidas',
        headingMissing: 'Me faltan',
        headerTitle: 'World Cup 2026 · Panini Tracker',
      },
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'FWC', emoji: '🏆', numbers: ['4'] }],
      missing: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['14'] }],
    });
    // Header line at the top.
    expect(text.startsWith('World Cup 2026 · Panini Tracker\n\n')).toBe(true);
    // Both section headers present and labelled.
    expect(text).toContain('Tengo repetidas\nFWC 🏆: 4');
    expect(text).toContain('Me faltan\nMEX 🇲🇽: 14');
    // Blank line between the two sections.
    expect(text).toMatch(/FWC 🏆: 4\n\nMe faltan\nMEX 🇲🇽: 14/);
    // Open-in-app line + at least one deep link.
    expect(text).toContain('Abrí en la app');
    expect(text).toContain('https://diegominetti.github.io/AlbumPanini/');
  });

  it('omits the duplicates block when the user has no duplicates', () => {
    const text = buildExchangeText({
      labels: {
        openInApp: 'Abrí en la app',
        headingDuplicates: 'Tengo repetidas',
        headingMissing: 'Me faltan',
      },
      collectionId: 'worldcup-2026',
      duplicates: [],
      missing: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['14'] }],
    });
    // No "Tengo repetidas" header if the duplicates block is empty.
    expect(text).not.toContain('Tengo repetidas');
    expect(text).toContain('Me faltan\nMEX 🇲🇽: 14');
  });

  it('omits the missing block when the user is not missing anything', () => {
    const text = buildExchangeText({
      labels: {
        openInApp: 'Abrí en la app',
        headingDuplicates: 'Tengo repetidas',
        headingMissing: 'Me faltan',
      },
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'FWC', emoji: '🏆', numbers: ['4'] }],
      missing: [],
    });
    expect(text).not.toContain('Me faltan');
    expect(text).toContain('Tengo repetidas\nFWC 🏆: 4');
  });

  it('produces a parseable round-trip for its own output', () => {
    const text = buildExchangeText({
      labels: {
        openInApp: 'Abrí en la app',
        headingDuplicates: 'Tengo repetidas',
        headingMissing: 'Me faltan',
      },
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'FWC', emoji: '🏆', numbers: ['4', '7'] }],
      missing: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['14'] }],
    });
    const parsed = parseExchangeText(text);
    expect(parsed.source).toBe('own');
    expect(parsed.collectionId).toBe('worldcup-2026');
    expect(parsed.friendHasExtra).toContain('FWC4');
    expect(parsed.friendHasExtra).toContain('FWC7');
    expect(parsed.friendWants).toContain('MEX14');
  });
});

describe('buildOwnList', () => {
  const teams = [
    { id: 'MEX', flag: '🇲🇽' },
    { id: 'USA', flag: '🇺🇸' },
    { id: 'ARG', flag: '🇦🇷' },
  ];

  it('groups duplicates and missing by prefix', () => {
    const stickers = [
      { id: 'mex-1', code: 'MEX1', teamId: 'MEX' },
      { id: 'mex-2', code: 'MEX2', teamId: 'MEX' },
      { id: 'usa-15', code: 'USA15', teamId: 'USA' },
      { id: 'usa-3', code: 'USA3', teamId: 'USA' },
      { id: 'arg-1', code: 'ARG1', teamId: 'ARG' },
    ];
    const inventory = new Map([
      ['mex-1', 2],
      ['mex-2', 1],
      ['usa-15', 2],
      ['usa-3', 0],
      ['arg-1', 0],
    ]);
    const out = buildOwnList({ stickers, teams, inventory });
    expect(out.duplicates.map((g) => g.prefix)).toEqual(['MEX', 'USA']);
    // MEX1 has qty=2 → 2 chips. USA15 has qty=2 → 2 chips.
    expect(out.duplicates[0].numbers).toEqual(['1', '1']);
    expect(out.duplicates[1].numbers).toEqual(['15', '15']);
    expect(out.missing.map((g) => g.prefix)).toEqual(['USA', 'ARG']);
    expect(out.missing[0].numbers).toEqual(['3']);
  });
});

describe('resolveExchangeText (DB-backed)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.collections.add({
      id: 'worldcup-2026',
      name: 'World Cup 2026',
      status: 'active',
      version: '1.0.0',
      language: 'es',
      sourceId: 'wc-2026',
      createdAt: 0,
      updatedAt: 0,
    });
    await db.teams.bulkAdd([
      { uid: 'worldcup-2026::USA', id: 'USA', collectionId: 'worldcup-2026', name: 'USA', flag: '🇺🇸' },
      { uid: 'worldcup-2026::MEX', id: 'MEX', collectionId: 'worldcup-2026', name: 'Mexico', flag: '🇲🇽' },
    ]);
    await db.stickers.bulkAdd([
      {
        uid: 'worldcup-2026::MEX-1',
        id: 'MEX-1',
        collectionId: 'worldcup-2026',
        code: 'MEX1',
        name: 'Mexico 1',
        teamId: 'MEX',
        order: 1,
        normalizedCode: 'MEX1',
      },
      {
        uid: 'worldcup-2026::USA-15',
        id: 'USA-15',
        collectionId: 'worldcup-2026',
        code: 'USA15',
        name: 'USA 15',
        teamId: 'USA',
        order: 15,
        normalizedCode: 'USA15',
      },
    ]);
  });

  it('classifies friendWants ∩ my duplicates into iCanGive', async () => {
    // I have 2 copies of MEX1. The friend wants MEX1. I have 0 of USA15
    // so the friend's extra USA15 is iNeed.
    await db.inventory.bulkAdd([
      { uid: 'wc::MEX-1', collectionId: 'worldcup-2026', stickerId: 'MEX-1', quantity: 2, updatedAt: 0 },
    ]);
    const text = 'Me faltan\nMEX 🇲🇽: 1\n\nRepetidas\nUSA 🇺🇸: 15';
    const out = await resolveExchangeText('worldcup-2026', text);
    expect(out.iCanGive.map((s) => s.code)).toEqual(['MEX1']);
    expect(out.iNeed.map((s) => s.code)).toEqual(['USA15']);
    expect(out.friendExtras).toEqual([]);
  });

  it('classifies friendHasExtra ∩ my missing into iNeed', async () => {
    // Same setup as the previous test — just the focus assertion changes.
    await db.inventory.bulkAdd([
      { uid: 'wc::MEX-1', collectionId: 'worldcup-2026', stickerId: 'MEX-1', quantity: 2, updatedAt: 0 },
    ]);
    const text = 'Me faltan\nMEX 🇲🇽: 1\n\nRepetidas\nUSA 🇺🇸: 15';
    const out = await resolveExchangeText('worldcup-2026', text);
    expect(out.iNeed.map((s) => s.code)).toEqual(['USA15']);
  });

  it('surfaces all my duplicates in myExtras, even those never mentioned', async () => {
    // I have duplicates of MEX1 AND USA15. The friend only mentioned
    // wanting MEX1. USA15 should still show up in myExtras.
    await db.inventory.bulkAdd([
      { uid: 'wc::MEX-1', collectionId: 'worldcup-2026', stickerId: 'MEX-1', quantity: 2, updatedAt: 0 },
      { uid: 'wc::USA-15', collectionId: 'worldcup-2026', stickerId: 'USA-15', quantity: 3, updatedAt: 0 },
    ]);
    const text = 'Me faltan\nMEX 🇲🇽: 1';
    const out = await resolveExchangeText('worldcup-2026', text);
    expect(out.iCanGive.map((s) => s.code)).toEqual(['MEX1']);
    expect(out.myExtras.map((s) => s.code)).toEqual(['USA15']);
  });

  it('surfaces friendExtras for friend duplicates I already own', async () => {
    // I have 1 copy of USA15. Friend has USA15 as duplicate.
    await db.inventory.bulkAdd([
      { uid: 'wc::USA-15', collectionId: 'worldcup-2026', stickerId: 'USA-15', quantity: 1, updatedAt: 0 },
    ]);
    const text = 'Me faltan\nMEX 🇲🇽: 1\n\nRepetidas\nUSA 🇺🇸: 15';
    const out = await resolveExchangeText('worldcup-2026', text);
    expect(out.iCanGive).toEqual([]); // MEX1 in my missing (qty=0 default), so I can't give
    expect(out.iNeed).toEqual([]); // I already own USA15, not missing
    expect(out.friendExtras.map((s) => s.code)).toEqual(['USA15']);
  });

  it('orders resolved stickers by the album order of their teams', async () => {
    await db.collections.add({
      id: 'wc-mini',
      name: 'WC Mini',
      status: 'active',
      version: '1.0.0',
      language: 'es',
      sourceId: 'wc-mini',
      createdAt: 0,
      updatedAt: 0,
    });
    await db.teams.bulkAdd([
      { uid: 'wc-mini::KOR', id: 'KOR', collectionId: 'wc-mini', name: 'Korea', flag: '🇰🇷' },
      { uid: 'wc-mini::CZE', id: 'CZE', collectionId: 'wc-mini', name: 'Czechia', flag: '🇨🇿' },
    ]);
    await db.stickers.bulkAdd([
      { uid: 'wc-mini::KOR-1', id: 'KOR-1', collectionId: 'wc-mini', code: 'KOR1', name: 'Korea 1', teamId: 'KOR', order: 1, normalizedCode: 'KOR1' },
      { uid: 'wc-mini::KOR-2', id: 'KOR-2', collectionId: 'wc-mini', code: 'KOR2', name: 'Korea 2', teamId: 'KOR', order: 2, normalizedCode: 'KOR2' },
      { uid: 'wc-mini::CZE-1', id: 'CZE-1', collectionId: 'wc-mini', code: 'CZE1', name: 'Czechia 1', teamId: 'CZE', order: 3, normalizedCode: 'CZE1' },
    ]);
    // I have KOR1 and KOR2 as duplicates; the friend has them as
    // extras. That puts KOR1 + KOR2 in iNeed (because I lack them) —
    // wait, the friend has them as extras means I CAN ask for them
    // if I lack them. KOR1/KOR2 default qty=0 → iNeed.
    // The friend has CZE1 as extra. I have CZE1 default qty=0 →
    // also iNeed. Expected iNeed sorted by album: KOR1, KOR2, CZE1.
    const text = 'Repetidas\nKOR 🇰🇷: 1, 2\nCZE 🇨🇿: 1';
    const out = await resolveExchangeText('wc-mini', text);
    expect(out.iNeed.map((s) => s.code)).toEqual(['KOR1', 'KOR2', 'CZE1']);
  });

  it('classifies against the full realistic friend text correctly', async () => {
    // Seed a rich collection so the resolver has something to classify.
    await db.delete();
    await db.open();
    await db.collections.add({
      id: 'worldcup-2026',
      name: 'World Cup 2026',
      status: 'active',
      version: '1.0.0',
      language: 'es',
      sourceId: 'wc-2026',
      createdAt: 0,
      updatedAt: 0,
    });
    // The friend's "Repetidas" has KOR3, KOR5 and RSA5, RSA13.
    // I have 2 of MEX14 (so the friend's "Me faltan" MEX14 → iCanGive)
    // I have 0 of KOR3 (so the friend's KOR3 → iNeed)
    // I have 1 of RSA5 (so the friend's RSA5 → friendExtras, redundant)
    // I have 0 of RSA13 (so the friend's RSA13 → iNeed)
    await db.stickers.bulkAdd([
      { uid: 'wc::MEX-14', id: 'MEX-14', collectionId: 'worldcup-2026', code: 'MEX14', name: 'Mexico 14', teamId: 'MEX', order: 14, normalizedCode: 'MEX14' },
      { uid: 'wc::KOR-3', id: 'KOR-3', collectionId: 'worldcup-2026', code: 'KOR3', name: 'Korea 3', teamId: 'KOR', order: 3, normalizedCode: 'KOR3' },
      { uid: 'wc::RSA-5', id: 'RSA-5', collectionId: 'worldcup-2026', code: 'RSA5', name: 'RSA 5', teamId: 'RSA', order: 5, normalizedCode: 'RSA5' },
      { uid: 'wc::RSA-13', id: 'RSA-13', collectionId: 'worldcup-2026', code: 'RSA13', name: 'RSA 13', teamId: 'RSA', order: 13, normalizedCode: 'RSA13' },
    ]);
    await db.inventory.bulkAdd([
      { uid: 'inv::MEX-14', collectionId: 'worldcup-2026', stickerId: 'MEX-14', quantity: 2, updatedAt: 0 },
      { uid: 'inv::KOR-3', collectionId: 'worldcup-2026', stickerId: 'KOR-3', quantity: 0, updatedAt: 0 },
      { uid: 'inv::RSA-5', collectionId: 'worldcup-2026', stickerId: 'RSA-5', quantity: 1, updatedAt: 0 },
      { uid: 'inv::RSA-13', collectionId: 'worldcup-2026', stickerId: 'RSA-13', quantity: 0, updatedAt: 0 },
    ]);
    const out = await resolveExchangeText('worldcup-2026', FRIEND_TEXT);
    // iCanGive: MEX14 (I have 2, friend wants it)
    expect(out.iCanGive.map((s) => s.code)).toContain('MEX14');
    // iNeed: KOR3, RSA13 (I have 0, friend has them as extras)
    expect(out.iNeed.map((s) => s.code)).toContain('KOR3');
    expect(out.iNeed.map((s) => s.code)).toContain('RSA13');
    // friendExtras: RSA5 (friend has it as extra, I already have 1)
    expect(out.friendExtras.map((s) => s.code)).toContain('RSA5');
  });
});
