/**
 * Timezone-aware date formatting helpers.
 *
 * The app groups matches by day and formats kickoff wall times using a
 * user-configurable IANA timezone (`Settings.timeZone`). Wrapping the standard
 * `Intl.DateTimeFormat` in these helpers keeps the rest of the codebase from
 * having to thread the timezone through every formatter call and makes the
 * day-boundary math (which `Date#getDate()` does NOT honour when the runtime
 * is in a different zone than the one we want to display) testable.
 *
 * The default zone is `America/Buenos_Aires` because that is the primary
 * user's locale; everything else is configurable from Settings.
 */

/** IANA zone used when the configured one is missing or invalid. */
export const DEFAULT_TIME_ZONE = 'America/Buenos_Aires';

/**
 * Curated list of zones that show up in the Settings picker. Ordered by
 * frequency of relevance for a WC26 viewer in the Americas. Users can still
 * type any IANA zone they want.
 */
export interface TimeZoneChoice {
  /** IANA zone id (the value persisted in settings). */
  id: string;
  /** Human label, usually the city + a short offset. */
  label: string;
}

export const COMMON_TIME_ZONES: TimeZoneChoice[] = [
  { id: 'America/Buenos_Aires', label: 'Buenos Aires (UTC−3)' },
  { id: 'America/Sao_Paulo', label: 'São Paulo (UTC−3)' },
  { id: 'America/New_York', label: 'New York (UTC−4/−5)' },
  { id: 'America/Chicago', label: 'Chicago (UTC−5/−6)' },
  { id: 'America/Denver', label: 'Denver (UTC−6/−7)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (UTC−7/−8)' },
  { id: 'America/Mexico_City', label: 'Ciudad de México (UTC−6)' },
  { id: 'America/Bogota', label: 'Bogotá (UTC−5)' },
  { id: 'Europe/Madrid', label: 'Madrid (UTC+1/+2)' },
  { id: 'Europe/London', label: 'London (UTC+0/+1)' },
  { id: 'UTC', label: 'UTC' },
];

/** Validate an IANA zone without throwing — returns the input or the default. */
export function safeTimeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    // The cheapest cross-platform probe: format an arbitrary date in the zone.
    // If `timeZone` is invalid the spec says the call throws RangeError.
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * Calendar-day key (YYYY-MM-DD) of a moment in the requested zone. Two kickoffs
 * on either side of midnight UTC land in different buckets if midnight falls
 * between them in the chosen zone — that is the whole point.
 */
export function dayKeyInZone(ms: number, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA formats as YYYY-MM-DD, so the first match is the answer.
  return fmt.format(new Date(ms));
}

/** Today (YYYY-MM-DD) in the configured zone, derived from `Date.now()`. */
export function todayKeyInZone(timeZone: string): string {
  return dayKeyInZone(Date.now(), timeZone);
}

/** "HH:mm" in 24h format. */
export function formatTimeInZone(
  ms: number,
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));
}

/** "lunes, 16 de junio" — long weekday + day + month, lowercased by caller. */
export function formatLongDateInZone(
  ms: number,
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(ms));
}

/** "lun" / "Mon" — short weekday. */
export function formatWeekdayInZone(
  ms: number,
  locale: string,
  timeZone: string,
  width: 'short' | 'narrow' = 'short'
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: width,
  }).format(new Date(ms));
}

/** "16" — day-of-month. */
export function formatDayInZone(
  ms: number,
  locale: string,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
  }).format(new Date(ms));
}

/**
 * Short, stable offset label like "UTC−3" or "UTC+5:30". Useful in the Settings
 * picker so the user can see at a glance whether a zone is currently ahead
 * or behind their own.
 */
export function formatOffsetLabel(
  timeZone: string,
  now: number = Date.now()
): string {
  // Force the format with timeZoneName so we get the GMT offset string.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(new Date(now));
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  // "GMT-3" → "UTC−3", "GMT+05:30" → "UTC+5:30"
  return tzPart.replace(/^GMT/, 'UTC').replace(/-/g, '−');
}
