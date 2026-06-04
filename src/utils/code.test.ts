import { describe, it, expect } from 'vitest';
import { normalizeCode, parseCode, extractCodes } from './code';

describe('normalizeCode', () => {
  it('uppercases and strips separators', () => {
    expect(normalizeCode('arg 1')).toBe('ARG1');
    expect(normalizeCode('bra-12')).toBe('BRA12');
    expect(normalizeCode('JOR_14')).toBe('JOR14');
  });

  it('strips leading zeros in the numeric part', () => {
    expect(normalizeCode('ARG01')).toBe('ARG1');
    expect(normalizeCode('ARG 007')).toBe('ARG7');
  });
});

describe('parseCode', () => {
  it('splits prefix and number', () => {
    expect(parseCode('ARG 12')).toEqual({
      prefix: 'ARG',
      number: 12,
      normalized: 'ARG12',
    });
  });

  it('returns null parts for non-conforming codes', () => {
    const r = parseCode('???');
    expect(r.prefix).toBeNull();
    expect(r.number).toBeNull();
  });
});

describe('extractCodes', () => {
  it('extracts line-separated codes', () => {
    expect(extractCodes('ARG1\nARG2\nBRA12')).toEqual([
      'ARG1',
      'ARG2',
      'BRA12',
    ]);
  });

  it('extracts space-separated codes within a line', () => {
    expect(extractCodes('ARG1 BRA2 JOR14')).toEqual(['ARG1', 'BRA2', 'JOR14']);
  });

  it('keeps "ARG 1" style single-space codes intact', () => {
    expect(extractCodes('ARG 1\nBRA 12')).toEqual(['ARG 1', 'BRA 12']);
  });

  it('handles commas and semicolons', () => {
    expect(extractCodes('ARG1, ARG2; BRA12')).toEqual([
      'ARG1',
      'ARG2',
      'BRA12',
    ]);
  });
});
