import { describe, it, expect } from 'vitest';
import {
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
    // First three entries should be FWC/00, FWC/1, FWC/3.
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
