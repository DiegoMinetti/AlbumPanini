import { describe, it, expect } from 'vitest';
import {
  buildDuplicatesList,
  candidateCodes,
  parseFiguritasAppList,
} from './figuritasAppParser';

const SAMPLE = `Figuritas App - Lista
Usa Méx Can 26
Me faltan
FWC 🏆: 00, 1, 3
FWC 🌎: 7
FWC 📜: 10, 14
CZE 🇨🇿: 1, 3, 20
QAT 🇶🇦: 1, 20
SUI 🇨🇭: 2
BRA 🇧🇷: 10
HAI 🇭🇹: 7, 11
SCO 🏴󠁧󠁢󠁳󠁣󠁴󠁿: 14
USA 🇺🇸: 3, 15, 16, 19
AUS 🇦🇺: 1, 20
TUR 🇹🇷: 8, 9
CUW 🇨🇼: 2, 15
CIV 🇨🇮: 14
ECU 🇪🇨: 13, 14
JPN 🇯🇵: 1, 17
SWE 🇸🇪: 7
EGY 🇪🇬: 2, 16
NZL 🇳🇿: 4, 10
IRQ 🇮🇶: 20
NOR 🇳🇴: 4, 10, 12
ARG 🇦🇷: 18
AUT 🇦🇹: 3, 6, 9, 14, 15
JOR 🇯🇴: 10, 20
POR 🇵🇹: 1, 4, 6
COD 🇨🇩: 2, 11, 15, 19
UZB 🇺🇿: 9, 20
COL 🇨🇴: 2, 7, 12, 17
CRO 🇭🇷: 14, 17
GHA 🇬🇭: 8, 11, 12

Descarga la app
https://www.figuritas.app/es/descargar`;

describe('parseFiguritasAppList', () => {
  it('parses a realistic sample, ignoring banners and prose', () => {
    const out = parseFiguritasAppList(SAMPLE);
    expect(out.lines.length).toBeGreaterThan(20);
    expect(out.lines[0]).toEqual({
      prefix: 'FWC',
      emoji: '🏆',
      numbers: ['00', '1', '3'],
    });
    expect(out.lines[0].numbers).toHaveLength(3);
  });

  it('emits a flat entry list in source order', () => {
    const out = parseFiguritasAppList(SAMPLE);
    expect(out.entries.slice(0, 3)).toEqual([
      { prefix: 'FWC', number: '00' },
      { prefix: 'FWC', number: '1' },
      { prefix: 'FWC', number: '3' },
    ]);
  });

  it('uppercases the prefix', () => {
    const out = parseFiguritasAppList('arg 🇦🇷: 1, 2');
    expect(out.lines[0].prefix).toBe('ARG');
  });

  it('tolerates blank lines and surrounding prose', () => {
    const out = parseFiguritasAppList(
      `\n# header\n
USA 🇺🇸: 1, 2

// another comment
BRA 🇧🇷: 5\n`
    );
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].prefix).toBe('USA');
    expect(out.lines[1].prefix).toBe('BRA');
  });

  it('skips comment-only lines', () => {
    const out = parseFiguritasAppList('# only a comment\nUSA 🇺🇸: 1');
    expect(out.lines).toHaveLength(1);
  });

  it('skips lines that do not match the expected shape', () => {
    const out = parseFiguritasAppList(
      'just a line of text without colons\nUSA 🇺🇸: 1'
    );
    expect(out.lines).toHaveLength(1);
  });

  it('handles Scottish flag (regional indicators)', () => {
    const out = parseFiguritasAppList('SCO 🏴󠁧󠁢󠁳󠁣󠁴󠁿: 14');
    expect(out.lines[0].emoji).toContain('🏴');
    expect(out.lines[0].numbers).toEqual(['14']);
  });

  it('returns empty arrays for empty input', () => {
    expect(parseFiguritasAppList('')).toEqual({ lines: [], entries: [] });
  });

  it('accepts semicolons and pipes as number separators', () => {
    const out = parseFiguritasAppList('USA 🇺🇸: 1; 2 | 3');
    expect(out.lines[0].numbers).toEqual(['1', '2', '3']);
  });
});

describe('candidateCodes', () => {
  it('returns prefix + number, prefix + zero-padded number, and bare number', () => {
    const c = candidateCodes('USA', '1');
    expect(c).toContain('USA1');
    expect(c).toContain('1');
  });

  it('preserves leading zeros in number when the prefix would lose them', () => {
    const c = candidateCodes('FWC', '00');
    expect(c).toContain('FWC00');
    expect(c).toContain('FWC0');
    expect(c).toContain('00');
    expect(c).toContain('0');
  });

  it('deduplicates candidates', () => {
    const c = candidateCodes('ARG', '5');
    const set = new Set(c);
    expect(c.length).toBe(set.size);
  });
});

describe('buildDuplicatesList', () => {
  const teams = [
    { id: 'MEX', flag: '🇲🇽' },
    { id: 'USA', flag: '🇺🇸' },
    { id: 'ARG', flag: '🇦🇷' },
  ];

  it('emits one line per team prefix with sorted numbers', () => {
    const stickers = [
      { code: 'MEX1', teamId: 'MEX' },
      { code: 'MEX2', teamId: 'MEX' },
      { code: 'USA15', teamId: 'USA' },
      { code: 'USA3', teamId: 'USA' },
    ];
    const inventory = new Map([
      ['MEX1', 2],
      ['MEX2', 3],
      ['USA15', 2],
      ['USA3', 2],
    ]);
    const { groups, text } = buildDuplicatesList({
      stickers,
      teams,
      inventory,
    });
    expect(groups.map((g) => g.prefix)).toEqual(['MEX', 'USA']);
    expect(groups[0].numbers).toEqual(['1', '2']);
    expect(groups[1].numbers).toEqual(['3', '15']);
    expect(groups[0].emoji).toBe('🇲🇽');
    expect(groups[1].emoji).toBe('🇺🇸');
    expect(text).toBe('MEX 🇲🇽: 1, 2\nUSA 🇺🇸: 3, 15');
  });

  it('skips stickers with quantity <= 1', () => {
    const stickers = [
      { code: 'ARG1', teamId: 'ARG' },
      { code: 'ARG2', teamId: 'ARG' },
    ];
    const inventory = new Map([
      ['ARG1', 1],
      ['ARG2', 2],
    ]);
    const { groups, text } = buildDuplicatesList({
      stickers,
      teams,
      inventory,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].numbers).toEqual(['2']);
    expect(text).toBe('ARG 🇦🇷: 2');
  });

  it('uses the trophy emoji for the FWC group', () => {
    const stickers = [{ code: 'FWC1' }, { code: 'FWC3' }];
    const inventory = new Map([
      ['FWC1', 2],
      ['FWC3', 2],
    ]);
    const { groups, text } = buildDuplicatesList({
      stickers,
      teams,
      inventory,
    });
    expect(groups[0].prefix).toBe('FWC');
    expect(groups[0].emoji).toBe('🏆');
    expect(text).toBe('FWC 🏆: 1, 3');
  });

  it('handles a sticker with no alpha prefix (intro) without emoji', () => {
    const stickers = [{ code: '00' }];
    const inventory = new Map([['00', 2]]);
    const { groups, text } = buildDuplicatesList({
      stickers,
      teams,
      inventory,
    });
    expect(groups[0].prefix).toBe('INTRO');
    expect(groups[0].emoji).toBe('');
    expect(text).toBe('INTRO: 00');
  });

  it('preserves source order across mixed team/FWC groups', () => {
    const stickers = [
      { code: 'FWC1' },
      { code: 'MEX1', teamId: 'MEX' },
      { code: 'FWC3' },
      { code: 'USA1', teamId: 'USA' },
    ];
    const inventory = new Map([
      ['FWC1', 2],
      ['FWC3', 2],
      ['MEX1', 2],
      ['USA1', 2],
    ]);
    const { groups } = buildDuplicatesList({
      stickers,
      teams,
      inventory,
    });
    expect(groups.map((g) => g.prefix)).toEqual(['FWC', 'MEX', 'USA']);
  });

  it('returns empty groups when there are no duplicates', () => {
    const stickers = [
      { code: 'MEX1', teamId: 'MEX' },
      { code: 'USA1', teamId: 'USA' },
    ];
    const inventory = new Map([
      ['MEX1', 1],
      ['USA1', 0],
    ]);
    const { groups, text } = buildDuplicatesList({
      stickers,
      teams,
      inventory,
    });
    expect(groups).toEqual([]);
    expect(text).toBe('');
  });

  it('accepts a plain object as inventory', () => {
    const stickers = [{ code: 'ARG1', teamId: 'ARG' }];
    const { text } = buildDuplicatesList({
      stickers,
      teams,
      inventory: { ARG1: 2 },
    });
    expect(text).toBe('ARG 🇦🇷: 1');
  });
});
