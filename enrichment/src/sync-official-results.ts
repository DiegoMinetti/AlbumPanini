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
 *   - Emite TODOS los partidos. Para los que ya se jugaron trae los goles
 *     finales (`status: 'FT' | 'AET' | 'PEN'`); para los pendientes solo
 *     lleva metadatos (`status: 'SCHEDULED'`, sin goles).
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
  homeGoals: z.number().int().nonnegative().optional(),
  awayGoals: z.number().int().nonnegative().optional(),
  homePens: z.number().int().nonnegative().optional(),
  awayPens: z.number().int().nonnegative().optional(),
  // 'SCHEDULED' = partido pendiente (no tiene goles). 'FT'/'AET'/'PEN' = finalizado.
  status: z.enum(['FT', 'AET', 'PEN', 'SCHEDULED']),
  /** ISO 8601 with offset (ej. "2026-06-11T13:00:00.000-06:00"). */
  kickoff: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  /** Optional: solo presente en partidos ya finalizados. */
  finishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/).optional(),
  /** Estadio. openfootball incluye "city (suburb)" o solo city; dejamos el string crudo. */
  venue: z.string().optional(),
  /** Group letter (A..L) for group-stage matches; absent for knockout. */
  group: z.string().optional(),
  /** Stage: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final'. */
  stage: z.string().optional(),
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
  // Filter slot placeholders that openfootball uses for knockout games:
  //   "W99" (winner of m99), "L101" (loser of m101),
  //   "1A"/"2B" (group winner/runner-up),
  //   "3A/B/C/D/F" (best third place across a set of groups).
  // The fixture in our app only knows about group-stage teams and
  // symbolic slots ("1A", "2B", "T3", "W73", "L101") — it doesn't
  // materialise "3A/B/C/D/F" into a concrete team until the standings
  // are computed. So we skip these entries: only group games with
  // two real team names make it through.
  if (!isRealTeamName(m.team1) || !isRealTeamName(m.team2)) return null;
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

/**
 * True when the given string is a concrete team name (not a slot
 * placeholder). Used to filter openfootball entries for knockout
 * games — those use symbolic placeholders that the fixture's static
 * join index can't match.
 */
function isRealTeamName(s: string): boolean {
  if (s.startsWith('W') || s.startsWith('L')) return false;
  if (/^[123][A-L]$/.test(s)) return false; // "1A", "2B", "3A"
  if (s.includes('/')) return false; // "3A/B/C/D/F" sets
  if (s.includes('T') && /T\d/.test(s)) return false; // "T3" best-third
  return true;
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
    const matchId = joinMatch(m, fx);
    if (!matchId) {
      console.warn(
        `[skip] no fixture match for OF entry ${m.date ?? '?'} ${m.team1 ?? '?'} vs ${m.team2 ?? '?'}`,
      );
      continue;
    }
    // Build an ISO kickoff string from `date` + `time` (e.g. "20:00 UTC-6").
    const kickoff = composeFinishedAt(m.date, m.time);
    if (!kickoff) {
      console.warn(`[skip] m${matchId} cannot compose kickoff`);
      continue;
    }
    const ft = m.score?.ft;
    const pens = m.score?.pens;
    const aet = m.score?.aet;
    const finished = !!(ft && (pens || aet || ft[0] !== ft[1] || true));
    // Match status: 'SCHEDULED' if no final score, otherwise FT/AET/PEN.
    const status: 'FT' | 'AET' | 'PEN' | 'SCHEDULED' = !ft
      ? 'SCHEDULED'
      : pens
        ? 'PEN'
        : aet
          ? 'AET'
          : 'FT';
    const out: OfficialMatchResult = {
      id: matchId,
      status,
      kickoff,
      apiFootballFixtureId: hashId(matchId),
    };
    if (ft) {
      out.homeGoals = ft[0];
      out.awayGoals = ft[1];
      out.finishedAt = kickoff; // for finished games, the local kickoff is also the finished-at
    }
    if (pens && ft) {
      out.homePens = pens[0];
      out.awayPens = pens[1];
    }
    if (m.ground) out.venue = m.ground;
    if (m.group) {
      const g = m.group.replace('Group ', '').trim();
      if (g) out.group = g;
    }
    if (m.round) {
      const stage = roundToStage(m.round);
      if (stage) out.stage = stage;
    }
    results.push(out);
    void finished;
  }
  return { generatedAt: new Date().toISOString(), results };
}

/**
 * Map openfootball round names to our canonical stage values used in
 * `tournamentService.MATCH_STAGES`. The fixture is the source of truth
 * for "which slot is which", but we carry the stage here too for UIs
 * that want to render the schedule without rehydrating the full
 * fixture (e.g. a future "next matches" widget).
 */
function roundToStage(round: string): string | undefined {
  const r = round.toLowerCase();
  if (r.includes('matchday')) return 'group';
  if (r.includes('round of 32') || r.includes('16') || r.includes('r32')) return 'r32';
  if (r.includes('round of 16') || r.includes('octavos') || r.includes('r16')) return 'r16';
  if (r.includes('quarter') || r.includes('cuartos') || r.includes('qf')) return 'qf';
  if (r.includes('semi') || r.includes('sf')) return 'sf';
  if (r.includes('third') || r.includes('3rd')) return 'third';
  if (r.includes('final')) return 'final';
  return undefined;
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
