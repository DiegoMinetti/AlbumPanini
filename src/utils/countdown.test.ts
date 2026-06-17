import { describe, expect, it } from 'vitest';
import { formatCountdown } from './countdown';

const now = 1_700_000_000_000; // arbitrary fixed instant

describe('formatCountdown', () => {
  describe('granularity rules', () => {
    it('returns seconds for under a minute', () => {
      expect(formatCountdown(now + 30_000, now)).toBe('30 s');
      expect(formatCountdown(now + 1_000, now)).toBe('1 s');
      expect(formatCountdown(now + 59_000, now)).toBe('59 s');
    });

    it('returns minutes for under an hour (the bug that motivated this PR)', () => {
      // 1779 s = 29 min 39 s. The previous implementation returned
      // "dentro de 1779 segundos" via Intl.RelativeTimeFormat.
      expect(formatCountdown(now + 1779_000, now)).toBe('29 min');
      expect(formatCountdown(now + 60_000, now)).toBe('1 min');
      expect(formatCountdown(now + 5 * 60_000, now)).toBe('5 min');
      expect(formatCountdown(now + 59 * 60_000, now)).toBe('59 min');
    });

    it('returns hours + minutes for under a day', () => {
      expect(formatCountdown(now + 60 * 60_000, now)).toBe('1 h');
      expect(formatCountdown(now + (60 * 60_000 + 15 * 60_000), now)).toBe(
        '1 h 15 min'
      );
      expect(formatCountdown(now + 4 * 60 * 60_000, now)).toBe('4 h');
      expect(formatCountdown(now + (4 * 60 * 60_000 + 30 * 60_000), now)).toBe(
        '4 h 30 min'
      );
      expect(formatCountdown(now + (23 * 60 * 60_000 + 59 * 60_000), now)).toBe(
        '23 h 59 min'
      );
    });

    it('returns days + hours for a day or more', () => {
      expect(formatCountdown(now + 24 * 60 * 60_000, now)).toBe('1 d');
      expect(
        formatCountdown(now + (24 * 60 * 60_000 + 4 * 60 * 60_000), now)
      ).toBe('1 d 4 h');
      expect(
        formatCountdown(
          now + (2 * 24 * 60 * 60_000 + 4 * 60 * 60_000 + 15 * 60_000),
          now
        )
      ).toBe('2 d 4 h');
    });

    it('suppresses the trailing zero unit', () => {
      // 3 d 0 h 0 min → "3 d" (no "0 h" noise)
      expect(formatCountdown(now + 3 * 24 * 60 * 60_000, now)).toBe('3 d');
      // 4 h 0 min → "4 h"
      expect(formatCountdown(now + 4 * 60 * 60_000, now)).toBe('4 h');
    });
  });

  describe('edge cases', () => {
    it('returns empty string when the kickoff has already passed', () => {
      expect(formatCountdown(now - 1, now)).toBe('');
      expect(formatCountdown(now - 60_000, now)).toBe('');
      expect(formatCountdown(now - 24 * 60 * 60_000, now)).toBe('');
    });

    it('returns empty string at exact kickoff (diff = 0)', () => {
      expect(formatCountdown(now, now)).toBe('');
    });

    it('handles negative diff (clock skew / race)', () => {
      expect(formatCountdown(now - 100, now)).toBe('');
    });
  });

  describe('purity / determinism', () => {
    it('does not depend on the wall clock — same inputs → same output', () => {
      const a = formatCountdown(now + 1779_000, now);
      const b = formatCountdown(now + 1779_000, now);
      expect(a).toBe(b);
      expect(a).toBe('29 min');
    });

    it('formats a realistic WC26 next-match countdown', () => {
      // 2026-06-22 ARG vs AUT is one of the next group fixtures; a user
      // opening the app 5 days and 3 hours before kickoff should see
      // "5 d 3 h" (no "0 min" suffix).
      const kickoff = Date.parse('2026-06-22T17:00:00.000Z');
      const fiveDaysThreeHoursBefore = kickoff - (5 * 24 + 3) * 60 * 60_000;
      expect(formatCountdown(kickoff, fiveDaysThreeHoursBefore)).toBe(
        '5 d 3 h'
      );
    });
  });
});
