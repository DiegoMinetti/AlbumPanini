import { CONFIG } from './config.js';
import type { Flag } from './types.js';

// Banderas generadas dinámicamente desde el countryCode.
// No se hardcodea ninguna URL por país.

// Subdivisiones sin alpha-2 propio: emoji con tag sequences + slug flagcdn.
const SUBDIVISIONS: Record<string, { emoji: string; slug: string }> = {
  'GB-ENG': { emoji: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', slug: 'gb-eng' },
  'GB-SCT': { emoji: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', slug: 'gb-sct' },
  'GB-WLS': { emoji: '🏴\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}', slug: 'gb-wls' },
};

/** Convierte un alpha-2 ("AR") en emoji de bandera con regional indicators. */
function alpha2ToEmoji(cc: string): string {
  const base = 0x1f1e6; // 🇦
  const A = 'A'.charCodeAt(0);
  return [...cc.toUpperCase()]
    .map((ch) => String.fromCodePoint(base + (ch.charCodeAt(0) - A)))
    .join('');
}

/** slug de flagcdn (minúscula). Acepta alpha-2 o subdivisión. */
function flagSlug(countryCode: string): string {
  const sub = SUBDIVISIONS[countryCode];
  if (sub) return sub.slug;
  return countryCode.toLowerCase();
}

/** Genera la bandera (emoji + SVG) para un countryCode. */
export function buildFlag(countryCode: string): Flag {
  const sub = SUBDIVISIONS[countryCode];
  const flagEmoji = sub ? sub.emoji : alpha2ToEmoji(countryCode);
  const flagSvgUrl = `${CONFIG.flagCdnBase}/${flagSlug(countryCode)}.svg`;
  return { countryCode, flagEmoji, flagSvgUrl };
}
