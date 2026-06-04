import { describe, it, expect } from 'vitest';
import { formatPercent, clamp, formatRelativeTime } from './format';

describe('formatPercent', () => {
  it('formats ratios', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.333, 1)).toBe('33.3%');
  });
});

describe('clamp', () => {
  it('clamps into range', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('formatRelativeTime', () => {
  it('describes recent timestamps', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 1000 * 60 * 60, 'en', now)).toContain(
      'hour'
    );
    expect(formatRelativeTime(now - 1000 * 5, 'en', now)).toContain('second');
  });
});
