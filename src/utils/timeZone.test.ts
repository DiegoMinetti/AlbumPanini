import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  COMMON_TIME_ZONES,
  DEFAULT_TIME_ZONE,
  dayKeyInZone,
  formatDayInZone,
  formatLongDateInZone,
  formatOffsetLabel,
  formatTimeInZone,
  formatWeekdayInZone,
  safeTimeZone,
  todayKeyInZone,
} from './timeZone';

afterEach(() => {
  vi.useRealTimers();
});

describe('safeTimeZone', () => {
  it('returns the input when it is a valid IANA zone', () => {
    expect(safeTimeZone('America/Buenos_Aires')).toBe('America/Buenos_Aires');
    expect(safeTimeZone('UTC')).toBe('UTC');
  });

  it('falls back to the default for nullish or invalid input', () => {
    expect(safeTimeZone(null)).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone('Not/A_Real_Zone')).toBe(DEFAULT_TIME_ZONE);
    expect(safeTimeZone('')).toBe(DEFAULT_TIME_ZONE);
  });
});

describe('dayKeyInZone', () => {
  it('returns YYYY-MM-DD for a noon UTC instant in Buenos Aires', () => {
    // 2026-06-16T15:00:00Z → 12:00 ART on 2026-06-16 → "2026-06-16"
    const ms = Date.UTC(2026, 5, 16, 15, 0, 0);
    expect(dayKeyInZone(ms, 'America/Buenos_Aires')).toBe('2026-06-16');
  });

  it('rolls the day forward at the zone midnight boundary', () => {
    // 2026-06-16T02:30:00Z → 23:30 ART on 2026-06-15 → "2026-06-15"
    const late = Date.UTC(2026, 5, 16, 2, 30, 0);
    expect(dayKeyInZone(late, 'America/Buenos_Aires')).toBe('2026-06-15');

    // 2026-06-16T03:30:00Z → 00:30 ART on 2026-06-16 → "2026-06-16"
    const early = Date.UTC(2026, 5, 16, 3, 30, 0);
    expect(dayKeyInZone(early, 'America/Buenos_Aires')).toBe('2026-06-16');
  });

  it('respects a different zone for the same instant', () => {
    // 2026-06-16T15:00:00Z → 11:00 EDT (UTC−4) on 2026-06-16
    const ms = Date.UTC(2026, 5, 16, 15, 0, 0);
    expect(dayKeyInZone(ms, 'America/New_York')).toBe('2026-06-16');

    // 2026-06-16T02:00:00Z → 22:00 EDT on 2026-06-15 (one day earlier in NY)
    const late = Date.UTC(2026, 5, 16, 2, 0, 0);
    expect(dayKeyInZone(late, 'America/New_York')).toBe('2026-06-15');
  });
});

describe('todayKeyInZone', () => {
  it('matches dayKeyInZone(now)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 5, 16, 18, 0, 0)); // 15:00 ART
    expect(todayKeyInZone('America/Buenos_Aires')).toBe('2026-06-16');
    // 18:00 UTC is 14:00 EDT — same day in NY
    expect(todayKeyInZone('America/New_York')).toBe('2026-06-16');
  });
});

describe('formatTimeInZone', () => {
  it('formats HH:mm in the requested zone', () => {
    const ms = Date.UTC(2026, 5, 16, 18, 0, 0); // 15:00 ART / 14:00 EDT
    expect(formatTimeInZone(ms, 'es', 'America/Buenos_Aires')).toBe('15:00');
    expect(formatTimeInZone(ms, 'en', 'America/New_York')).toBe('14:00');
    expect(formatTimeInZone(ms, 'es', 'UTC')).toBe('18:00');
  });
});

describe('formatLongDateInZone / formatWeekdayInZone / formatDayInZone', () => {
  const ms = Date.UTC(2026, 5, 16, 18, 0, 0); // 2026-06-16

  it('long date includes weekday + day + month in Spanish', () => {
    const out = formatLongDateInZone(ms, 'es', 'America/Buenos_Aires');
    expect(out.toLowerCase()).toContain('martes');
    expect(out).toContain('16');
    expect(out.toLowerCase()).toContain('junio');
  });

  it('short weekday is 2-3 letters', () => {
    const w = formatWeekdayInZone(ms, 'es', 'America/Buenos_Aires');
    expect(w.toLowerCase()).toBe('mar');
  });

  it('day is just the number', () => {
    expect(formatDayInZone(ms, 'es', 'America/Buenos_Aires')).toBe('16');
  });
});

describe('formatOffsetLabel', () => {
  it('produces a UTC-prefixed offset with the right sign', () => {
    // North hemisphere summer: Buenos Aires is UTC−3 (no DST).
    const label = formatOffsetLabel('America/Buenos_Aires');
    expect(label.startsWith('UTC')).toBe(true);
    expect(label).toMatch(/UTC[−+]3/);
  });

  it('handles half-hour offsets when present', () => {
    // India is UTC+5:30 year-round.
    const label = formatOffsetLabel('Asia/Kolkata');
    expect(label.startsWith('UTC')).toBe(true);
    expect(label).toMatch(/UTC\+5:30/);
  });
});

describe('COMMON_TIME_ZONES', () => {
  it('includes Buenos Aires as the default for the primary user', () => {
    expect(COMMON_TIME_ZONES.some((z) => z.id === DEFAULT_TIME_ZONE)).toBe(
      true
    );
  });

  it('every entry is a valid IANA zone and round-trips through safeTimeZone', () => {
    for (const { id } of COMMON_TIME_ZONES) {
      expect(safeTimeZone(id)).toBe(id);
    }
  });
});
