import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/db';
import {
  parseExchangeText,
  buildExchangeText,
  buildOwnList,
  resolveExchangeText,
} from './exchangeService';

const SAMPLE_EXTERNAL = `Figuritas App - Lista
Usa Méx Can 26
Me faltan
FWC 🏆: 00, 1, 3
FWC 🌎: 7
CZE 🇨🇿: 1, 3, 20
USA 🇺🇸: 3, 15, 16, 19

Repetidas
RSA 🇿🇦: 5, 13
KOR 🇰🇷: 3, 5

Descarga la app
https://www.figuritas.app/es/descargar`;

describe('parseExchangeText', () => {
  it('detects external format (no own deep-link present)', () => {
    const out = parseExchangeText(SAMPLE_EXTERNAL);
    expect(out.source).toBe('external');
    expect(out.collectionId).toBeNull();
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it('external format keeps the original lines', () => {
    const out = parseExchangeText(SAMPLE_EXTERNAL);
    expect(out.lines[0].prefix).toBe('FWC');
    expect(out.lines[0].numbers).toContain('00');
  });

  it('detects our own format when an albumpanini.app URL is present', async () => {
    // Build a valid SAMPLE_OWN with a real payload so the deep link is decodable.
    const labels = {
      header: 'Panini Tracker',
      duplicatesTitle: 'Repetidas',
      missingTitle: 'Faltan',
      openInApp: 'Abrí en la app',
    };
    const text = buildExchangeText({
      labels,
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'FWC', emoji: '🏆', numbers: ['4'] }],
      missing: [],
    });
    const out = parseExchangeText(text);
    expect(out.source).toBe('own');
    expect(out.collectionId).toBe('worldcup-2026');
  });

  it('returns an empty result on empty / whitespace input', () => {
    const out = parseExchangeText('   \n\n   ');
    expect(out.lines).toEqual([]);
    expect(out.duplicates).toEqual([]);
    expect(out.missing).toEqual([]);
  });

  it('tolerates semicolons and pipes as number separators', () => {
    const out = parseExchangeText('USA 🇺🇸: 1; 2 | 3');
    expect(out.lines[0].numbers).toEqual(['1', '2', '3']);
  });

  it('handles regional indicator flags (Scotland)', () => {
    const out = parseExchangeText('SCO 🏴󠁧󠁢󠁳󠁣󠁴󠁿: 14');
    expect(out.lines[0].emoji).toContain('🏴');
    expect(out.lines[0].numbers).toEqual(['14']);
  });

  it('ignores comment lines and prose', () => {
    const out = parseExchangeText(
      '# header\nUSA 🇺🇸: 1, 2\n\n// another comment\nBRA 🇧🇷: 5'
    );
    expect(out.lines).toHaveLength(2);
  });
});

describe('buildExchangeText', () => {
  const labels = {
    header: 'Panini Tracker',
    duplicatesTitle: 'Repetidas',
    missingTitle: 'Faltan',
    openInApp: 'Abrí en la app',
  };

  it('emits the deep-link URL and the human-readable lines', () => {
    const text = buildExchangeText({
      labels,
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'FWC', emoji: '🏆', numbers: ['4'] }],
      missing: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['14'] }],
    });
    expect(text).toContain('Panini Tracker');
    expect(text).toContain('Repetidas');
    expect(text).toContain('FWC 🏆: 4');
    expect(text).toContain('Faltan');
    expect(text).toContain('MEX 🇲🇽: 14');
    expect(text).toContain('Abrí en la app');
    expect(text).toContain('https://albumpanini.app/exchange');
  });

  it('omits empty sections cleanly', () => {
    const text = buildExchangeText({
      labels,
      collectionId: 'worldcup-2026',
      duplicates: [],
      missing: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['14'] }],
    });
    expect(text).not.toContain('Repetidas');
    expect(text).toContain('Faltan');
  });

  it('produces a parseable round-trip for its own output', () => {
    const text = buildExchangeText({
      labels,
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'FWC', emoji: '🏆', numbers: ['4', '7'] }],
      missing: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['14'] }],
    });
    const parsed = parseExchangeText(text);
    expect(parsed.source).toBe('own');
    expect(parsed.collectionId).toBe('worldcup-2026');
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
    expect(out.duplicates[0].numbers).toEqual(['1']);
    expect(out.duplicates[1].numbers).toEqual(['15']);
    expect(out.missing.map((g) => g.prefix)).toEqual(['USA', 'ARG']);
    expect(out.missing[0].numbers).toEqual(['3']);
  });

  it('puts FWC stickers in the FWC group with the trophy emoji', () => {
    const stickers = [
      { id: 'fwc-1', code: 'FWC1' },
      { id: 'fwc-3', code: 'FWC3' },
    ];
    const inventory = new Map([
      ['fwc-1', 2],
      ['fwc-3', 0],
    ]);
    const out = buildOwnList({ stickers, teams, inventory });
    expect(out.duplicates[0].prefix).toBe('FWC');
    expect(out.duplicates[0].emoji).toBe('🏆');
    expect(out.missing[0].prefix).toBe('FWC');
  });

  it('returns empty arrays when nothing is duplicated or missing', () => {
    const stickers = [
      { id: 'mex-1', code: 'MEX1', teamId: 'MEX' },
    ];
    const inventory = new Map([['mex-1', 1]]);
    const out = buildOwnList({ stickers, teams, inventory });
    expect(out.duplicates).toEqual([]);
    expect(out.missing).toEqual([]);
  });
});

describe('resolveExchangeText (DB-backed)', () => {
  beforeEach(async () => {
    // Wipe the test DB between cases.
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

  it('resolves external lines into local sticker ids', async () => {
    const text = 'MEX 🇲🇽: 1, 2\nUSA 🇺🇸: 15';
    const out = await resolveExchangeText('worldcup-2026', text);
    expect(out.missing.length).toBe(2);
    expect(out.missing.map((s) => s.code).sort()).toEqual(['MEX1', 'USA15']);
    expect(out.unresolved.length).toBe(1); // MEX 2
  });

  it('resolves our own format directly from the deep link', async () => {
    const labels = {
      header: 'Panini Tracker',
      duplicatesTitle: 'Repetidas',
      missingTitle: 'Faltan',
      openInApp: 'Abrí en la app',
    };
    const text = buildExchangeText({
      labels,
      collectionId: 'worldcup-2026',
      duplicates: [{ prefix: 'MEX', emoji: '🇲🇽', numbers: ['1'] }],
      missing: [{ prefix: 'USA', emoji: '🇺🇸', numbers: ['15'] }],
    });
    const out = await resolveExchangeText('worldcup-2026', text);
    // Both stickers are seeded in beforeEach, so both should resolve.
    expect(out.duplicates.length).toBe(1);
    expect(out.duplicates[0].code).toBe('MEX1');
    expect(out.missing.length).toBe(1);
    expect(out.missing[0].code).toBe('USA15');
  });
});
