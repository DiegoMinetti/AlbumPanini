/** Format a 0..1 ratio as a whole-number percentage string. */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Relative-time formatter (e.g. "2h ago"), locale-aware, with a now fallback. */
export function formatRelativeTime(
  timestamp: number,
  locale = 'en',
  now = Date.now()
): string {
  const diffMs = timestamp - now;
  const diffSec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];

  let value = diffSec;
  for (const division of divisions) {
    if (Math.abs(value) < division.amount) {
      return rtf.format(Math.round(value), division.unit);
    }
    value /= division.amount;
  }
  return rtf.format(Math.round(value), 'year');
}
