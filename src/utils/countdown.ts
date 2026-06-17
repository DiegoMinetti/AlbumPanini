import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

/**
 * Format the time-until-kickoff for the next match. Picks a granularity that
 * matches the magnitude so the user doesn't have to parse "in 7320m":
 *
 *   diff < 0                 → "" (already started / finished)
 *   diff < 1 min             → "30 s"
 *   diff < 1 h  && ≥ 1 min   → "23 min"
 *   diff < 1 d  && ≥ 1 h     → "4 h 15 min"   (hours suppressed if 0)
 *   diff ≥ 1 d               → "2 d 4 h"      (hours suppressed if 0)
 *
 * Returns only the time portion — no "En"/"in" prefix. The caller wraps it
 * with a localized prefix via i18n (see `matches.nextStartsIn`), so the same
 * formatter works for every locale without needing a translation table for
 * every unit word.
 *
 * The previous implementation used `Intl.RelativeTimeFormat` for the
 * sub-1-hour branch and `rtf.format(1779, 'second')` produced "dentro de
 * 1779 segundos" for `es-AR` — a useless wall of digits. dayjs gives us
 * the duration math in two lines and we own the format string.
 */
export function formatCountdown(kickoffMs: number, now: number): string {
  const diff = kickoffMs - now;
  if (diff <= 0) return '';

  const d = dayjs.duration(diff);
  const days = Math.floor(d.asDays());
  const hours = d.hours();
  const minutes = d.minutes();
  const seconds = d.seconds();

  if (days >= 1) {
    return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  }
  if (hours >= 1) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  if (minutes >= 1) {
    return `${minutes} min`;
  }
  return `${seconds} s`;
}
