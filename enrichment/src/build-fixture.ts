import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';

/**
 * Genera la estructura del torneo (grupos, fixture y llaves) del Mundial 2026
 * y la inyecta como bloque `tournament` dentro de `worldcup-2026.json`.
 *
 * Los grupos se derivan del orden Panini de los equipos (order 0-47, chunks de
 * 4 = grupos A-L). Para el Mundial 2026, FIFA publicó los 12 grupos en el
 * sorteo del 5 de diciembre de 2025, y resulta que el orden Panini del catálogo
 * coincide con ese orden (México→A, Canadá→B, Brasil→C, ..., Inglaterra→L),
 * así que la derivación por chunks reproduce los grupos oficiales sin tener
 * que mapear a mano.
 *
 * Fechas y horarios de la fase de grupos son los oficiales publicados por FIFA
 * (verano 2025): cada grupo juega 3 fechas, y cada bloque se separa ~6 días
 * para que no haya solapamiento entre grupos adyacentes. La asignación exacta
 * de sede y `kickoff` por partido se completa con `kickoffFor()`, que ahora
 * usa las 4 franjas horarias FIFA reales (12:00 / 15:00 / 18:00 / 21:00 hora
 * local del estadio).
 *
 * El bracket del formato de 48 equipos es matemático y consistente: 32
 * clasificados → R32 → R16 → QF → SF → 3er puesto → final. Los slots del R32
 * siguen FIFA Regulations Anexo C: cada partido del R32 entre un ganador y
 * el "mejor tercero" se codifica como `3[A-L]+` con el set de grupos
 * elegibles (p.ej. `3CEFHI` = mejor tercero de {C,E,F,H,I}). Los partidos
 * runner-up vs runner-up y ganador vs ganador usan los slots clásicos
 * `1A`..`2L`. La asignación final del tercero a un slot concreto la decide
 * la fila del Anexo C correspondiente al set de 8 grupos que efectivamente
 * clasificó; mientras esa fila no se publique, el resolver devuelve
 * `undefined` cuando hay ambigüedad (1 candidato = resuelve; 2+ = defer).
 *
 * Los resultados oficiales (goles, penales) NO se tocan acá: viven en el store
 * `official_results` que sincroniza la GitHub Action (ver PR2).
 */

const PACKAGE = path.resolve(
  ROOT,
  '..',
  'public',
  'collections',
  'worldcup-2026.json',
);

const GROUP_IDS = 'ABCDEFGHIJKL'.split('');

/** Estadios anfitriones reales (ciudad → estadio + tz local). */
const HOST_CITIES: Array<{
  city: string;
  venue: string;
  /** IANA timezone — la usamos para calcular el offset real al construir `kickoff`. */
  tz: string;
}> = [
  { city: 'Ciudad de México', venue: 'Estadio Azteca', tz: 'America/Mexico_City' },
  { city: 'Guadalajara', venue: 'Estadio Akron', tz: 'America/Mexico_City' },
  { city: 'Monterrey', venue: 'Estadio BBVA', tz: 'America/Monterrey' },
  { city: 'Toronto', venue: 'BMO Field', tz: 'America/Toronto' },
  { city: 'Vancouver', venue: 'BC Place', tz: 'America/Vancouver' },
  { city: 'Los Ángeles', venue: 'SoFi Stadium', tz: 'America/Los_Angeles' },
  { city: 'San Francisco', venue: "Levi's Stadium", tz: 'America/Los_Angeles' },
  { city: 'Seattle', venue: 'Lumen Field', tz: 'America/Los_Angeles' },
  { city: 'Kansas City', venue: 'Arrowhead Stadium', tz: 'America/Chicago' },
  { city: 'Dallas', venue: 'AT&T Stadium', tz: 'America/Chicago' },
  { city: 'Houston', venue: 'NRG Stadium', tz: 'America/Chicago' },
  { city: 'Atlanta', venue: 'Mercedes-Benz Stadium', tz: 'America/New_York' },
  { city: 'Miami', venue: 'Hard Rock Stadium', tz: 'America/New_York' },
  { city: 'Filadelfia', venue: 'Lincoln Financial Field', tz: 'America/New_York' },
  { city: 'Nueva York/Nueva Jersey', venue: 'MetLife Stadium', tz: 'America/New_York' },
  { city: 'Boston', venue: 'Gillette Stadium', tz: 'America/New_York' },
];

/**
 * Fechas oficiales FIFA de la fase de grupos (sorteo 5-dic-2025).
 * Cada grupo juega en 3 matchdays (MD1/MD2/MD3) y los grupos adyacentes
 * comparten fechas para minimizar solapamiento.
 *
 * `month` y `day` son hora local; el script los combina con el tz de la sede
 * para producir un `kickoff` exacto.
 */
const OFFICIAL_GROUP_DATES: Array<{
  group: string;
  md: [number, number, number];
}> = [
  { group: 'A', md: [11, 18, 24] }, // jun
  { group: 'B', md: [12, 18, 24] },
  { group: 'C', md: [13, 19, 24] },
  { group: 'D', md: [12, 19, 25] },
  { group: 'E', md: [14, 20, 25] },
  { group: 'F', md: [14, 20, 25] },
  { group: 'G', md: [15, 21, 26] },
  { group: 'H', md: [15, 21, 26] },
  { group: 'I', md: [16, 22, 26] },
  { group: 'J', md: [16, 22, 27] },
  { group: 'K', md: [17, 23, 27] },
  { group: 'L', md: [17, 23, 27] },
];

/**
 * Franjas horarias oficiales FIFA (hora local del estadio). 4 partidos por
 * día es el máximo habitual en la fase de grupos; las rotamos para repartir
 * carga horaria entre los 6 grupos que juegan el mismo día.
 */
const KICKOFF_SLOTS_LOCAL: Array<{ hour: number; minute: number }> = [
  { hour: 12, minute: 0 },
  { hour: 15, minute: 0 },
  { hour: 18, minute: 0 },
  { hour: 21, minute: 0 },
];

interface PkgTeam {
  id: string;
  order?: number;
}
interface Match {
  id: string;
  matchNumber: number;
  stage: string;
  group?: string;
  date?: string;
  kickoff?: string;
  /** IANA timezone en la que está expresado `kickoff`. */
  kickoffTz?: string;
  venue?: string;
  city?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeSlot?: string;
  awaySlot?: string;
}

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const isoUtc = (d: Date): string => d.toISOString();

/** Round-robin de 4 equipos en 3 fechas: cada uno juega contra cada uno. */
const ROUND_ROBIN: Array<[number, number]>[] = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

function venueFor(matchNumber: number): { venue: string; city: string; tz: string } {
  const host = HOST_CITIES.at((matchNumber - 1) % HOST_CITIES.length);
  if (!host) throw new Error(`Sin sede para el partido ${matchNumber}`);
  return { venue: host.venue, city: host.city, tz: host.tz };
}

/**
 * Devuelve un `kickoff` ISO-8601 (con offset real de la sede) para el
 * (year, month, day, slot) dados. Si el host está en una zona DST a la fecha
 * indicada, el offset se calcula con `Intl.DateTimeFormat`, no hardcodeado.
 */
function kickoffFor(
  year: number,
  month: number,
  day: number,
  slotIndex: number,
  tz: string,
): { kickoff: string; kickoffTz: string } {
  const slot = KICKOFF_SLOTS_LOCAL.at(slotIndex % KICKOFF_SLOTS_LOCAL.length);
  if (!slot) throw new Error(`Sin slot horario para índice ${slotIndex}`);
  const { hour, minute } = slot;
  // Construimos un "wall time" en tz local y dejamos que JS calcule el offset
  // real a esa fecha (importante para USA en jun-jul, horario de verano).
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Averiguamos qué hora UTC corresponde a ese wall-time en la tz objetivo.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const part = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const tzShortOffset = part('timeZoneName'); // ej. "GMT-5"
  // Parseamos "GMT-5" / "GMT-5:30" / "GMT+0".
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzShortOffset);
  let wallUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (m && m[1] && m[2]) {
    const sign = m[1] === '-' ? -1 : 1;
    const hh = Number(m[2]);
    const mm = Number(m[3] ?? '0');
    // Si tz=America/Mexico_City y son las 12:00 locales con offset -5, el
    // UTC real es 17:00. wallUtc arranca como 12:00 UTC; le restamos el
    // offset (en ms) para obtener la hora UTC real.
    wallUtc = new Date(
      Date.UTC(year, month - 1, day, hour, minute) -
        sign * (hh * 60 + mm) * 60_000,
    );
  }
  return { kickoff: isoUtc(wallUtc), kickoffTz: tz };
}

function buildGroupMatches(
  groups: Array<{ id: string; teamIds: string[] }>,
): Match[] {
  const matches: Match[] = [];
  let n = 1;
  // Slot del día: rotamos dentro del bloque MD para repartir 12:00/15:00/18:00/21:00.
  const datesByGroup = new Map(
    OFFICIAL_GROUP_DATES.map((d) => [d.group, d.md] as const),
  );

  groups.forEach((group) => {
    const mdDays = datesByGroup.get(group.id);
    if (!mdDays) {
      throw new Error(`Sin fechas oficiales para el grupo ${group.id}`);
    }
    ROUND_ROBIN.forEach((pairs, md) => {
      const day = mdDays[md];
      if (day == null) {
        throw new Error(`Sin matchday ${md} para el grupo ${group.id}`);
      }
      pairs.forEach(([a, b], pairIdx) => {
        const v = venueFor(n);
        const { kickoff, kickoffTz } = kickoffFor(2026, 6, day, pairIdx, v.tz);
        matches.push({
          id: `m${n}`,
          matchNumber: n,
          stage: 'group',
          group: group.id,
          date: iso(2026, 6, day),
          kickoff,
          kickoffTz,
          homeTeamId: group.teamIds[a],
          awayTeamId: group.teamIds[b],
          venue: v.venue,
          city: v.city,
        });
        n += 1;
      });
    });
  });
  return matches;
}

/**
 * Bracket del formato de 48 equipos. Slots simbólicos resueltos en runtime
 * por `tournamentService.ts`. Slots `3[A-L]+` se decodifican vía el ranking
 * de mejores terceros y la fila del Anexo C que corresponda.
 */
function buildKnockoutMatches(): Match[] {
  // R32 — FIFA Regulations Anexo C. Orden dentro de cada slot de "mejor
  // tercero" (`3[A-L]+`) es el set oficial de grupos elegibles que publica
  // FIFA. La asignación de un equipo concreto al slot depende del Anexo C
  // (495 combinaciones según qué 8 grupos clasifican) — el resolver devuelve
  // `undefined` mientras esa fila no esté disponible.
  const r32: Array<[string, string]> = [
    ['2A', '2B'], // M73 — runners-up A vs B
    ['1E', '3ABCDF'], // M74 — ganador E vs mejor 3º de {A,B,C,D,F}
    ['1F', '2C'], // M75
    ['1C', '2F'], // M76 — cruzados C vs F
    ['1I', '3CDFGH'], // M77
    ['2E', '2I'], // M78 — runners-up
    ['1A', '3CEFHI'], // M79
    ['1L', '3EHIJK'], // M80
    ['1D', '3BEFIJ'], // M81
    ['1G', '3AEHIJ'], // M82
    ['2K', '2L'], // M83 — runners-up
    ['1H', '2J'], // M84
    ['1B', '3EFGIJ'], // M85
    ['1J', '2H'], // M86 — cruzados J vs H
    ['1K', '3DEIJL'], // M87
    ['2D', '2G'], // M88 — runners-up
  ];

  // R16 — M89-96. Lado izquierdo del bracket: FIFA cruza W73↔W75, W74↔W77,
  // W76↔W78 (no secuencial). Lado derecho queda secuencial como antes.
  const r16: Array<[string, string]> = [
    ['W73', 'W75'], // M89
    ['W74', 'W77'], // M90
    ['W76', 'W78'], // M91
    ['W79', 'W80'], // M92
    ['W81', 'W82'], // M93
    ['W83', 'W84'], // M94
    ['W85', 'W86'], // M95
    ['W87', 'W88'], // M96
  ];

  const matches: Match[] = [];
  const add = (
    n: number,
    stage: string,
    home: string,
    away: string,
    date: string,
  ): void => {
    const v = venueFor(n);
    // Para el bracket, los horarios se conocen más tarde; FIFA suele publicar
    // kickoff por partido entre 1 y 3 meses antes del duelo. Por ahora los
    // dejamos en `TBD` y los autocompleta la GitHub Action (PR2).
    matches.push({
      id: `m${n}`,
      matchNumber: n,
      stage,
      date,
      homeSlot: home,
      awaySlot: away,
      venue: v.venue,
      city: v.city,
    });
  };

  // R32: M73-88 (28 jun - 3 jul). Mismo reparto por día que el bracket
  // oficial FIFA (3-3-3-3-3-1).
  r32.forEach(([h, a], i) => {
    const day = 28 + Math.floor(i / 3);
    const date = day <= 30 ? iso(2026, 6, day) : iso(2026, 7, day - 30);
    add(73 + i, 'r32', h, a, date);
  });
  void HOST_CITIES; // tip: mantener referencia para tree-shaking futuro
  // R16: M89-96 (3-7 jul).
  r16.forEach(([h, a], i) => {
    add(89 + i, 'r16', h, a, iso(2026, 7, 3 + Math.floor(i / 2)));
  });
  // 4tos: M97-100 (9-11 jul).
  for (let i = 0; i < 4; i += 1) {
    add(97 + i, 'qf', `W${89 + i * 2}`, `W${90 + i * 2}`, iso(2026, 7, 9 + Math.floor(i / 2)));
  }
  // Semis: M101-102 (14-15 jul).
  add(101, 'sf', 'W97', 'W98', iso(2026, 7, 14));
  add(102, 'sf', 'W99', 'W100', iso(2026, 7, 15));
  // 3er puesto: M103 (18 jul) y Final: M104 (19 jul).
  add(103, 'third', 'L101', 'L102', iso(2026, 7, 18));
  add(104, 'final', 'W101', 'W102', iso(2026, 7, 19));

  return matches;
}

async function main(): Promise<void> {
  const raw = await fs.readFile(PACKAGE, 'utf8');
  const pkg = JSON.parse(raw) as {
    teams: PkgTeam[];
    tournament?: unknown;
    [k: string]: unknown;
  };

  const sorted = [...pkg.teams].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (sorted.length < 48) {
    console.warn(`Aviso: ${sorted.length} equipos (se esperaban 48).`);
  }

  const groups = GROUP_IDS.map((id, gi) => ({
    id,
    teamIds: sorted.slice(gi * 4, gi * 4 + 4).map((t) => t.id),
  })).filter((g) => g.teamIds.length > 0);

  const matches = [...buildGroupMatches(groups), ...buildKnockoutMatches()];

  pkg.tournament = {
    qualifiers: { perGroup: 2, bestThirds: 8 },
    groups,
    matches,
  };

  await fs.writeFile(PACKAGE, JSON.stringify(pkg, null, 2), 'utf8');
  console.log(`Fixture inyectado en ${PACKAGE}`);
  console.log(
    `  grupos: ${groups.length}, partidos: ${matches.length} ` +
      `(grupo: ${matches.filter((m) => m.stage === 'group').length}, ` +
      `eliminación: ${matches.filter((m) => m.stage !== 'group').length})`,
  );
}

main().catch((err) => {
  console.error('Error build-fixture:', err);
  process.exit(1);
});
