/**
 * Sync oficial de resultados del Mundial 2026 desde API-Football.
 *
 * Pensado para correr dentro de la GitHub Action
 * `.github/workflows/sync-official-results.yml`. La Action commitea el JSON
 * resultante a `public/official/worldcup-2026-results.json`, y el frontend lo
 * descarga al abrir el fixture (ver PR3).
 *
 * Rate limit del tier free de API-Football: 100 req/día. La Action distribuye
 * los runs entre 13hs Arg (cuando arranca el primer partido del día) y 02hs
 * Arg del día siguiente (cuando termina el último), con la frecuencia ajustada
 * para no superar ese presupuesto. Ver `.github/workflows/sync-official-results.yml`
 * para la lógica de crons por día.
 *
 * Mapeo de IDs:
 *  - El endpoint `/fixtures?league=1&season=2026&round=…` no está disponible
 *    para el Mundial 2026 hasta que FIFA asigne IDs de API-Football. Usamos
 *    `/fixtures?league=1&season=2026` (sin round) y matcheamos por
 *    `(homeTeamId, awayTeamId, date)`.
 *  - La season-key de API-Football para el Mundial 2026 es "2026".
 *  - El league-id es 1 (World Cup).
 *
 * Salida (`OfficialResultsPayload`):
 *  {
 *    source: "api-football",
 *    generatedAt: "2026-06-13T…Z",
 *    matches: [
 *      { id: "m12", homeGoals: 2, awayGoals: 1, status: "FT", … }
 *    ]
 *  }
 *  Solo emitimos partidos que ya terminaron (`status.short === "FT"` o
 *  `"AET"` o `"PEN"`). El resto se omite para mantener el JSON chico y la
 *  lógica de "oficial" estricta.
 *
 * Ejecución:
 *  tsx src/sync-official-results.ts            # usa API_FOOTBALL_KEY del env
 *  tsx src/sync-official-results.ts --dry-run  # imprime el JSON a stdout
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ROOT } from './config.js';

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

const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';

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
  source: z.literal('api-football'),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  matches: z.array(officialResultSchema),
});
export type OfficialResultsPayload = z.infer<typeof payloadSchema>;

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed: number | null };
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
  score: { penalty: { home: number | null; away: number | null } };
}

const TEAM_NAME_MAP: Record<string, string> = {
  // API-Football a veces normaliza nombres distintos al FIFA code. Mapeamos
  // por nombre aproximado; si no matchea, lo logueamos y seguimos.
  Mexico: 'MEX',
  'South Africa': 'RSA',
  'South Korea': 'KOR',
  'Korea Republic': 'KOR',
  Czechia: 'CZE',
  Canada: 'CAN',
  'Bosnia and Herzegovina': 'BIH',
  Qatar: 'QAT',
  Switzerland: 'SUI',
  Brazil: 'BRA',
  Morocco: 'MAR',
  Haiti: 'HAI',
  Scotland: 'SCO',
  USA: 'USA',
  'United States': 'USA',
  Paraguay: 'PAR',
  Australia: 'AUS',
  'Türkiye': 'TUR',
  Turkey: 'TUR',
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
};

function mapTeamName(name: string): string | null {
  return TEAM_NAME_MAP[name] ?? null;
}

interface Fetched {
  generatedAt: string;
  results: OfficialMatchResult[];
}

async function fetchWorldCupFixtures(apiKey: string): Promise<ApiFootballFixture[]> {
  const out: ApiFootballFixture[] = [];
  // Paginamos /fixtures con league=1 (World Cup) y season=2026.
  // API-Football free limita a 100 req/día — esta única llamada nos trae los
  // ~104 partidos en un solo request, sin gastar más cuota.
  const url = new URL(`${API_FOOTBALL_BASE}/fixtures`);
  url.searchParams.set('league', '1');
  url.searchParams.set('season', '2026');
  const res = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`API-Football /fixtures → ${res.status} ${res.statusText}`);
  }
  // API-Football returns 200 even on auth/quota failures, with an `errors`
  // object and an empty `response`. We treat that as a hard error so the
  // caller can decide to skip the commit instead of writing a misleading
  // empty JSON.
  const json = (await res.json()) as {
    response?: ApiFootballFixture[];
    errors?: Record<string, string>;
  };
  if (json.errors && Object.keys(json.errors).length > 0) {
    const first = Object.values(json.errors)[0];
    throw new Error(`API-Football /fixtures errors: ${first ?? 'unknown'}`);
  }
  if (Array.isArray(json.response)) out.push(...json.response);
  return out;
}

function buildKeyIndex(pkgTeams: { id: string; name: string }[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const t of pkgTeams) idx.set(t.id, t.name);
  // Invertimos para lookup por nombre.
  const byName = new Map<string, string>();
  for (const t of pkgTeams) byName.set(t.name.toLowerCase(), t.id);
  void idx;
  return byName;
}

async function loadFixture(): Promise<{
  teamNameToId: Map<string, string>;
  matchKeys: Map<string, string>;
}> {
  const raw = await fs.readFile(PACKAGE_FIXTURE, 'utf8');
  const pkg = JSON.parse(raw) as {
    teams: { id: string; name: string }[];
    tournament?: {
      matches: Array<{
        id: string;
        date?: string;
        homeTeamId?: string;
        awayTeamId?: string;
      }>;
    };
  };
  const teamNameToId = buildKeyIndex(pkg.teams);
  const matchKeys = new Map<string, string>();
  for (const m of pkg.tournament?.matches ?? []) {
    if (!m.date || !m.homeTeamId || !m.awayTeamId) continue;
    const key = `${m.date}|${m.homeTeamId}|${m.awayTeamId}`;
    matchKeys.set(key, m.id);
  }
  return { teamNameToId, matchKeys };
}

export async function fetchOfficialResults(
  apiKey: string
): Promise<Fetched> {
  const { teamNameToId, matchKeys } = await loadFixture();
  const fixtures = await fetchWorldCupFixtures(apiKey);
  const results: OfficialMatchResult[] = [];
  for (const f of fixtures) {
    const status = f.fixture.status.short;
    if (status !== 'FT' && status !== 'AET' && status !== 'PEN') continue;
    const hg = f.goals.home;
    const ag = f.goals.away;
    if (hg == null || ag == null) continue;
    const homeId = mapTeamName(f.teams.home.name);
    const awayId = mapTeamName(f.teams.away.name);
    if (!homeId || !awayId) {
      console.warn(
        `[skip] m${f.fixture.id}: nombres no mapeados (${f.teams.home.name} / ${f.teams.away.name})`,
      );
      continue;
    }
    if (!teamNameToId.has(homeId) || !teamNameToId.has(awayId)) {
      console.warn(`[skip] m${f.fixture.id}: fifa-code fuera del paquete (${homeId} / ${awayId})`);
      continue;
    }
    // date viene en UTC ISO sin offset. La clave del matchKey está guardada
    // como YYYY-MM-DD (la que emite build-fixture) — extraemos la parte de
    // fecha del ISO y matcheamos.
    const datePart = f.fixture.date.slice(0, 10);
    const key = `${datePart}|${homeId}|${awayId}`;
    const matchId = matchKeys.get(key);
    if (!matchId) {
      console.warn(
        `[skip] m${f.fixture.id}: sin matchKey (${key}). ¿fecha/equipos no coinciden con el fixture?`,
      );
      continue;
    }
    const out: OfficialMatchResult = {
      id: matchId,
      homeGoals: hg,
      awayGoals: ag,
      status,
      finishedAt: f.fixture.date,
      apiFootballFixtureId: f.fixture.id,
    };
    const hp = f.score.penalty.home;
    const ap = f.score.penalty.away;
    if (hp != null && ap != null) {
      out.homePens = hp;
      out.awayPens = ap;
    }
    results.push(out);
  }
  return { generatedAt: new Date().toISOString(), results };
}

export async function run(apiKey: string, options: { dryRun?: boolean } = {}): Promise<OfficialResultsPayload> {
  const { generatedAt, results } = await fetchOfficialResults(apiKey);
  const payload: OfficialResultsPayload = payloadSchema.parse({
    source: 'api-football',
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
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.error('Falta API_FOOTBALL_KEY en el entorno.');
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');
  run(apiKey, { dryRun }).catch((err) => {
    console.error('Error sync-official-results:', err);
    process.exit(1);
  });
}
