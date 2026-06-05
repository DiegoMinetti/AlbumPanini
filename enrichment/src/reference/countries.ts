import type { CountryRef } from '../types.js';

// Datos estáticos de referencia para las 48 selecciones presentes en el
// catálogo Panini WC 2026. countryCode = ISO 3166-1 alpha-2 (o subdivisión
// GB-ENG / GB-SCT para Inglaterra y Escocia, que no tienen alpha-2 propio).
// fifaCode = código FIFA oficial de 3 letras.
//
// La bandera (emoji + SVG) NO se hardcodea acá: se deriva del countryCode
// en flags.ts. Acá solo vive el dato país→código→confederación.

export const COUNTRIES: CountryRef[] = [
  { team: 'Algeria', countryCode: 'DZ', fifaCode: 'ALG', confederation: 'CAF' },
  { team: 'Argentina', countryCode: 'AR', fifaCode: 'ARG', confederation: 'CONMEBOL' },
  { team: 'Australia', countryCode: 'AU', fifaCode: 'AUS', confederation: 'AFC' },
  { team: 'Austria', countryCode: 'AT', fifaCode: 'AUT', confederation: 'UEFA' },
  { team: 'Belgium', countryCode: 'BE', fifaCode: 'BEL', confederation: 'UEFA' },
  { team: 'Bosnia and Herzegovina', countryCode: 'BA', fifaCode: 'BIH', confederation: 'UEFA' },
  { team: 'Brazil', countryCode: 'BR', fifaCode: 'BRA', confederation: 'CONMEBOL' },
  { team: 'Canada', countryCode: 'CA', fifaCode: 'CAN', confederation: 'CONCACAF' },
  { team: 'Cape Verde', countryCode: 'CV', fifaCode: 'CPV', confederation: 'CAF' },
  { team: 'Colombia', countryCode: 'CO', fifaCode: 'COL', confederation: 'CONMEBOL' },
  { team: 'Congo DR', countryCode: 'CD', fifaCode: 'COD', confederation: 'CAF' },
  { team: 'Croatia', countryCode: 'HR', fifaCode: 'CRO', confederation: 'UEFA' },
  { team: 'Curaçao', countryCode: 'CW', fifaCode: 'CUW', confederation: 'CONCACAF' },
  { team: 'Czechia', countryCode: 'CZ', fifaCode: 'CZE', confederation: 'UEFA' },
  { team: 'Ecuador', countryCode: 'EC', fifaCode: 'ECU', confederation: 'CONMEBOL' },
  { team: 'Egypt', countryCode: 'EG', fifaCode: 'EGY', confederation: 'CAF' },
  { team: 'England', countryCode: 'GB-ENG', fifaCode: 'ENG', confederation: 'UEFA' },
  { team: 'France', countryCode: 'FR', fifaCode: 'FRA', confederation: 'UEFA' },
  { team: 'Germany', countryCode: 'DE', fifaCode: 'GER', confederation: 'UEFA' },
  { team: 'Ghana', countryCode: 'GH', fifaCode: 'GHA', confederation: 'CAF' },
  { team: 'Haiti', countryCode: 'HT', fifaCode: 'HAI', confederation: 'CONCACAF' },
  { team: 'Iran', countryCode: 'IR', fifaCode: 'IRN', confederation: 'AFC' },
  { team: 'Iraq', countryCode: 'IQ', fifaCode: 'IRQ', confederation: 'AFC' },
  { team: 'Ivory Coast', countryCode: 'CI', fifaCode: 'CIV', confederation: 'CAF' },
  { team: 'Japan', countryCode: 'JP', fifaCode: 'JPN', confederation: 'AFC' },
  { team: 'Jordan', countryCode: 'JO', fifaCode: 'JOR', confederation: 'AFC' },
  { team: 'Mexico', countryCode: 'MX', fifaCode: 'MEX', confederation: 'CONCACAF' },
  { team: 'Morocco', countryCode: 'MA', fifaCode: 'MAR', confederation: 'CAF' },
  { team: 'Netherlands', countryCode: 'NL', fifaCode: 'NED', confederation: 'UEFA' },
  { team: 'New Zealand', countryCode: 'NZ', fifaCode: 'NZL', confederation: 'OFC' },
  { team: 'Norway', countryCode: 'NO', fifaCode: 'NOR', confederation: 'UEFA' },
  { team: 'Panama', countryCode: 'PA', fifaCode: 'PAN', confederation: 'CONCACAF' },
  { team: 'Paraguay', countryCode: 'PY', fifaCode: 'PAR', confederation: 'CONMEBOL' },
  { team: 'Portugal', countryCode: 'PT', fifaCode: 'POR', confederation: 'UEFA' },
  { team: 'Qatar', countryCode: 'QA', fifaCode: 'QAT', confederation: 'AFC' },
  { team: 'Saudi Arabia', countryCode: 'SA', fifaCode: 'KSA', confederation: 'AFC' },
  { team: 'Scotland', countryCode: 'GB-SCT', fifaCode: 'SCO', confederation: 'UEFA' },
  { team: 'Senegal', countryCode: 'SN', fifaCode: 'SEN', confederation: 'CAF' },
  { team: 'South Africa', countryCode: 'ZA', fifaCode: 'RSA', confederation: 'CAF' },
  { team: 'South Korea', countryCode: 'KR', fifaCode: 'KOR', confederation: 'AFC' },
  { team: 'Spain', countryCode: 'ES', fifaCode: 'ESP', confederation: 'UEFA' },
  { team: 'Sweden', countryCode: 'SE', fifaCode: 'SWE', confederation: 'UEFA' },
  { team: 'Switzerland', countryCode: 'CH', fifaCode: 'SUI', confederation: 'UEFA' },
  { team: 'Tunisia', countryCode: 'TN', fifaCode: 'TUN', confederation: 'CAF' },
  { team: 'Türkiye', countryCode: 'TR', fifaCode: 'TUR', confederation: 'UEFA' },
  { team: 'Uruguay', countryCode: 'UY', fifaCode: 'URU', confederation: 'CONMEBOL' },
  { team: 'USA', countryCode: 'US', fifaCode: 'USA', confederation: 'CONCACAF' },
  { team: 'Uzbekistan', countryCode: 'UZ', fifaCode: 'UZB', confederation: 'AFC' },
];

/** Bloques de "team" del catálogo que NO son selecciones nacionales. */
export const NON_TEAM_BLOCKS = new Set<string>([
  'We Are Panini',
  'FIFA World Cup 2026',
  'FIFA World Cup History',
  'Host Countries and Cities',
]);

const byTeam = new Map<string, CountryRef>(
  COUNTRIES.map((c) => [c.team, c]),
);

/** Devuelve la referencia de país para un nombre de selección, o undefined. */
export function lookupCountry(team: string): CountryRef | undefined {
  return byTeam.get(team);
}
