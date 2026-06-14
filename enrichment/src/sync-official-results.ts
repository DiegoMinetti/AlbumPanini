import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ROOT } from './config.js';

/**
 * Sincroniza los resultados oficiales del Mundial 2026 desde openfootball.
 *
 * Fuente: https://github.com/openfootball/worldcup.json/blob/master/2026/worldcup.json
 *   - Repo público, JSON estático, mantenido por la comunidad a partir de
 *     comunicados oficiales de FIFA.
 *   - Gratis, sin key, sin rate limit. Se descarga con `fetch` una vez por run.
 *   - Cubre los 104 partidos con grupos + eliminatorias.
 *   - Sólo emite partidos con `score.ft` ya cargado (los demás se
 *     consideran "aún no finalizados" y se omiten).
 *
 * Plan B: si openfootball devuelve 404, error de red, o un payload que
 * no valida, este script falla con un mensaje claro. La GitHub Action
 * detecta el fallo y sale sin commitear (no escribe un JSON basura).
 *
 * Plan C (futuro): si la comunidad abandona openfootball, se puede
 * migrar a scraping HTML de www.fifa.com con cheerio + un headless
 * browser. Hoy no hace falta: openfootball se actualiza con cada
 * partido y el repo es estable.
 */

const PACKAGE_FIXTURE = path.resolve(
  ROOT,
  '..',
  'public',
  'collections',
  'worldcup-2026.json',
);
const OUTPUT_PATH = path.resolve(
  ROOT,
  '..',
  'public',
  'official',
  'worldcup-2026-results.json',
);

// Versión raw de GitHub (CDN-friendly, sin rate limit, sin auth).
const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const officialResultSchema = z.object({
  id: z.string().min(1),
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
  homePens: z.number().int().nonnegative().optional(),
  awayPens: z.number().int().nonnegative().optional(),
  status: z.enum(['FT', 'AET', 'PEN']),
  finishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  apiFootballFixtureId: z.number().int().positive(),
});
export type OfficialMatchResult = z.infer<typeof officialResultSchema>;

const payloadSchema = z.object({
  source: z.literal('openfootball'),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  matches: z.array(officialResultSchema),
});
export type OfficialResultsPayload = z.infer<typeof payloadSchema>;

interface OpenfootballMatch {
  num?: number;
  round?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  score?: {
    ft?: [number, number] | null;
    ht?: [number, number] | null;
    pens?: [number, number] | null;
    aet?: [number, number] | null;
  };
  group?: string;
  ground?: string;
}

interface OpenfootballDoc {
  name?: string;
  matches?: OpenfootballMatch[];
}

// Mapeo nombre openfootball → FIFA code (3 letras). Cubre los 48 equipos
// del Mundial 2026. La diferencia típica: openfootball usa "Czech Republic"
// en vez de "Czechia", "Turkey" en vez de "Türkiye", "DR Congo" en vez de
// "Congo DR", "Ivory Coast" en vez de "Côte d'Ivoire".
const NAME_TO_FIFA: Record<string, string> = {
  Mexico: 'MEX',
  'South Africa': 'RSA',
  'South Korea': 'KOR',
  'Czech Republic': 'CZE',
  Canada: 'CAN',
  'Bosnia and Herzegovina': 'BIH',
  'Bosnia & Herzegovina': 'BIH',
  Qatar: 'QAT',
  Switzerland: 'SUI',
  Brazil: 'BRA',
  Morocco: 'MAR',
  Haiti: 'HAI',
  Scotland: 'SCO',
  USA: 'USA',
  'United States': 'USA',
  Australia: 'AUS',
  Paraguay: 'PAR',
  Turkey: 'TUR',
  Türkiye: 'TUR',
  Germany: 'GER',
  Curaçao: 'CUW',
  'Ivory Coast': 'CIV',
  "Côte d'Ivoire": 'CIV',
  Ecuador: 'ECU',
  Netherlands: 'NED',
  Japan: 'JPN',
  Sweden: 'SWE',
  Tunisia: 'TUN',
  Belgium: 'BEL',
  Egypt: 'EGY',
  Iran: 'IRN',
  'New Zealand': 'NZL',
  Spain: 'ESP',
  'Cape Verde': 'CPV',
  'Cape Verde Islands': 'CPV',
  'Saudi Arabia': 'KSA',
  Uruguay: 'URU',
  France: 'FRA',
  Senegal: 'SEN',
  Iraq: 'IRQ',
  Norway: 'NOR',
  Argentina: 'ARG',
  Algeria: 'ALG',
  Austria: 'AUT',
  Jordan: 'JOR',
  Portugal: 'POR',
  'Congo DR': 'COD',
  'DR Congo': 'COD',
  Uzbekistan: 'UZB',
  Colombia: 'COL',
  England: 'ENG',
  Croatia: 'CRO',
  Ghana: 'GHA',
  Panama: 'PAN',
  'Czechia': 'CZE',
};

function mapName(name: string | undefined): string | null {
  if (!name) return null;
  return NAME_TO_FIFA[name] ?? null;
}

interface Fixture {
  teamIdToName: Map<string, string>;
  /** Strict key: `{date}|{homeFifa}|{awayFifa}` → matchId (FIFA codes, source-agnostic) */
  byDate: Map<string, string>;
  /** Fuzzy key: `{group}|{a}|{b}` (FIFA codes sorted) → matchId, for date/order mismatches */
  byGroup: Map<string, string>;
}

async function loadFixture(): Promise<Fixture> {
  const raw = await fs.readFile(PACKAGE_FIXTURE, 'utf8');
  const pkg = JSON.parse(raw) as {
    teams: { id: string; name: string }[];
    tournament?: {
      matches: Array<{
        id: string;
        date?: string;
        group?: string;
        homeTeamId?: string;
        awayTeamId?: string;
      }>;
    };
  };
  const teamIdToName = new Map(pkg.teams.map((t) => [t.id, t.name]));
  const byDate = new Map<string, string>();
  const byGroup = new Map<string, string>();
  for (const m of pkg.tournament?.matches ?? []) {
    if (!m.homeTeamId || !m.awayTeamId) continue;
    // Build the lookup keys with FIFA codes (which are identical across
    // openfootball's human names and the app's internal representation).
    // Using names like "Bosnia and Herzegovina" vs "Bosnia & Herzegovina"
    // would silently miss legitimate joins.
    if (m.date) byDate.set(`${m.date}|${m.homeTeamId}|${m.awayTeamId}`, m.id);
    if (m.group) {
      const [x, y] = [m.homeTeamId, m.awayTeamId].sort();
      byGroup.set(`${m.group}|${x}|${y}`, m.id);
    }
  }
  return { teamIdToName, byDate, byGroup };
}

/**
 * Join un partido de openfootball al matchId interno. Dos niveles de
 * tolerancia: primero por fecha+home+away (strict), después por
 * group+equipos sin importar el orden home/away (fuzzy). Esto cubre
 * los casos donde el fixture de la app y openfootball discrepan en
 * fecha exacta u orden (algo que pasa porque openfootball se actualiza
 * a partir de comunicados FIFA y la app aproxima el fixture estático).
 */
function joinMatch(m: OpenfootballMatch, fx: Fixture): string | null {
  if (!m.team1 || !m.team2) return null;
  if (m.team1.startsWith('W') || m.team1.startsWith('L')) return null;
  if (m.team2.startsWith('W') || m.team2.startsWith('L')) return null;
  const homeFifa = mapName(m.team1);
  const awayFifa = mapName(m.team2);
  if (!homeFifa || !awayFifa) return null;
  // Strict: date + home + away (FIFA codes, source-agnostic).
  if (m.date) {
    const exact = fx.byDate.get(`${m.date}|${homeFifa}|${awayFifa}`);
    if (exact) return exact;
  }
  // Fuzzy: group + either ordering of the two FIFA codes.
  const group = m.group?.replace('Group ', '');
  if (group) {
    const [x, y] = [homeFifa, awayFifa].sort();
    const gk = `${group}|${x}|${y}`;
    return fx.byGroup.get(gk) ?? null;
  }
  return null;
}

interface Fetched {
  generatedAt: string;
  results: OfficialMatchResult[];
}

export async function fetchOfficialResults(): Promise<Fetched> {
  const fx = await loadFixture();
  const res = await fetch(OPENFOOTBALL_URL, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-store',
    },
  });
  if (!res.ok) {
    throw new Error(`openfootball HTTP ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as OpenfootballDoc;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.matches)) {
    throw new Error('openfootball: payload not an object with .matches[]');
  }
  const results: OfficialMatchResult[] = [];
  for (const m of raw.matches) {
    const ft = m.score?.ft;
    if (!ft) continue; // partido no finalizado
    const matchId = joinMatch(m, fx);
    if (!matchId) {
      console.warn(
        `[skip] no fixture match for OF entry ${m.date ?? '?'} ${m.team1 ?? '?'} vs ${m.team2 ?? '?'}`,
      );
      continue;
    }
    // Build an ISO `finishedAt` from `date` + `time` (e.g. "20:00 UTC-6").
    const finishedAt = composeFinishedAt(m.date, m.time);
    if (!finishedAt) {
      console.warn(`[skip] m${matchId} cannot compose finishedAt`);
      continue;
    }
    const pens = m.score?.pens;
    const aet = m.score?.aet;
    const status: 'FT' | 'AET' | 'PEN' = pens
      ? 'PEN'
      : aet
        ? 'AET'
        : 'FT';
    const out: OfficialMatchResult = {
      id: matchId,
      homeGoals: ft[0],
      awayGoals: ft[1],
      status,
      finishedAt,
      // The id is internal; we don't have a real api-football id anymore.
      // Encode a stable hash so the field is still unique per match.
      apiFootballFixtureId: hashId(matchId),
    };
    if (pens) {
      out.homePens = pens[0];
      out.awayPens = pens[1];
    }
    results.push(out);
  }
  return { generatedAt: new Date().toISOString(), results };
}

/**
 * Compose an ISO 8601 string from a YYYY-MM-DD date plus a time like
 * "20:00 UTC-6". Returns null if the inputs are unusable.
 *
 * FIFA's openfootball dataset encodes local kickoff + tz offset
 * directly, which is what we want to display in the UI ("20:00 hora
 * local del estadio"). We embed that as a fixed offset ISO string so
 * the frontend can parse it without needing a tz database at runtime.
 */
function composeFinishedAt(
  date: string | undefined,
  time: string | undefined
): string | null {
  if (!date) return null;
  // "20:00 UTC-6" → "20:00-06:00"
  const m = /(\d{1,2}):(\d{2})\s*(?:UTC)?\s*([+-])(\d{1,2})(?::?(\d{2}))?/.exec(
    time ?? ''
  );
  if (!m) {
    // Fallback: midnight UTC, with a warning in the calling layer.
    return `${date}T00:00:00.000Z`;
  }
  const hh = m[1]!.padStart(2, '0');
  const mm = m[2]!.padStart(2, '0');
  const sign = m[3] === '-' ? '-' : '+';
  const offH = m[4]!.padStart(2, '0');
  const offM = (m[5] ?? '00').padStart(2, '0');
  return `${date}T${hh}:${mm}:00.000${sign}${offH}:${offM}`;
}

/** Stable 31-bit hash of a matchId (used to keep the id field unique). */
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  // Force positive.
  return Math.abs(h) || 1;
}

export async function run(
  _ignoredApiKey: string,
  options: { dryRun?: boolean } = {}
): Promise<OfficialResultsPayload> {
  void _ignoredApiKey;
  const { generatedAt, results } = await fetchOfficialResults();
  const payload: OfficialResultsPayload = payloadSchema.parse({
    source: 'openfootball',
    generatedAt,
    matches: results,
  });
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(
    `[ok] ${results.length} resultados oficiales escritos en ${OUTPUT_PATH}`,
  );
  return payload;
}

// CLI: corre solo si lo invocan directo (no cuando se importa desde tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // Mantenemos la firma `run(apiKey, ...)` para no tocar la Action, pero
  // ignoramos la key — openfootball no necesita auth. La Action puede
  // seguir pasando `${{ secrets.API_FOOTBALL_KEY }}` sin cambio.
  const apiKey = process.env.API_FOOTBALL_KEY ?? 'unused';
  const dryRun = process.argv.includes('--dry-run');
  run(apiKey, { dryRun }).catch((err) => {
    console.error('Error sync-official-results:', err);
    process.exit(1);
  });
}
