import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';

/**
 * Genera la estructura del torneo (grupos, fixture y llaves) del Mundial 2026
 * y la inyecta como bloque `tournament` dentro de `worldcup-2026.json`.
 *
 * Los grupos se derivan del orden Panini de los equipos (order 0-47, chunks de
 * 4 = grupos A-L; el orden codifica el sorteo). El fixture de grupos es el
 * round-robin estándar; las llaves son un bracket interno consistente del nuevo
 * formato de 48 equipos (32 clasificados → 16vos → octavos → 4tos → semis →
 * 3er puesto → final).
 *
 * NOTA DE DATOS: las fechas caen dentro de la ventana real del torneo
 * (11-jun a 19-jul 2026) y las sedes son estadios reales anfitriones, pero la
 * asignación exacta de sede/fecha por partido y la combinación oficial de
 * "mejores terceros" del bracket son aproximadas — se pueden afinar acá sin
 * tocar el frontend.
 */

const PACKAGE = path.resolve(
  ROOT,
  '..',
  'public',
  'collections',
  'worldcup-2026.json',
);

const GROUP_IDS = 'ABCDEFGHIJKL'.split('');

/** Estadios anfitriones reales (ciudad → estadio). */
const HOST_CITIES: Array<{ city: string; venue: string }> = [
  { city: 'Ciudad de México', venue: 'Estadio Azteca' },
  { city: 'Guadalajara', venue: 'Estadio Akron' },
  { city: 'Monterrey', venue: 'Estadio BBVA' },
  { city: 'Toronto', venue: 'BMO Field' },
  { city: 'Vancouver', venue: 'BC Place' },
  { city: 'Los Ángeles', venue: 'SoFi Stadium' },
  { city: 'San Francisco', venue: "Levi's Stadium" },
  { city: 'Seattle', venue: 'Lumen Field' },
  { city: 'Kansas City', venue: 'Arrowhead Stadium' },
  { city: 'Dallas', venue: 'AT&T Stadium' },
  { city: 'Houston', venue: 'NRG Stadium' },
  { city: 'Atlanta', venue: 'Mercedes-Benz Stadium' },
  { city: 'Miami', venue: 'Hard Rock Stadium' },
  { city: 'Filadelfia', venue: 'Lincoln Financial Field' },
  { city: 'Nueva York/Nueva Jersey', venue: 'MetLife Stadium' },
  { city: 'Boston', venue: 'Gillette Stadium' },
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
  venue?: string;
  city?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeSlot?: string;
  awaySlot?: string;
}

const iso = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

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

function venueFor(matchNumber: number): { venue: string; city: string } {
  const host = HOST_CITIES[(matchNumber - 1) % HOST_CITIES.length];
  return { venue: host.venue, city: host.city };
}

function buildGroupMatches(
  groups: Array<{ id: string; teamIds: string[] }>,
): Match[] {
  const matches: Match[] = [];
  let n = 1;
  // Fecha base por jornada (ventana real de la fase de grupos).
  const mdStart = [11, 18, 24]; // junio
  groups.forEach((group, gi) => {
    ROUND_ROBIN.forEach((pairs, md) => {
      const day = Math.min(mdStart[md] + (gi % (md === 2 ? 4 : 6)), 27);
      pairs.forEach(([a, b]) => {
        const v = venueFor(n);
        matches.push({
          id: `m${n}`,
          matchNumber: n,
          stage: 'group',
          group: group.id,
          date: iso(2026, 6, day),
          homeTeamId: group.teamIds[a],
          awayTeamId: group.teamIds[b],
          ...v,
        });
        n += 1;
      });
    });
  });
  return matches;
}

/** Bracket del formato de 48 equipos. Slots simbólicos resueltos en runtime. */
function buildKnockoutMatches(): Match[] {
  // 16vos (R32): 12 ganadores (1X), 12 segundos (2X), 8 mejores terceros (T1-8).
  const r32: Array<[string, string]> = [
    ['1A', 'T1'],
    ['1B', 'T2'],
    ['1C', 'T3'],
    ['1D', 'T4'],
    ['1E', 'T5'],
    ['1F', 'T6'],
    ['1G', 'T7'],
    ['1H', 'T8'],
    ['2A', '2B'],
    ['2C', '2D'],
    ['2E', '2F'],
    ['2G', '2H'],
    ['1I', '2J'],
    ['1J', '2I'],
    ['1K', '2L'],
    ['1L', '2K'],
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
    matches.push({
      id: `m${n}`,
      matchNumber: n,
      stage,
      date,
      homeSlot: home,
      awaySlot: away,
      ...v,
    });
  };

  // R32: M73-88 (28 jun - 3 jul).
  r32.forEach(([h, a], i) => {
    const day = 28 + Math.floor(i / 3); // 28 jun .. 3 jul (junio tiene 30)
    const date = day <= 30 ? iso(2026, 6, day) : iso(2026, 7, day - 30);
    add(73 + i, 'r32', h, a, date);
  });

  // R16: M89-96 (4-7 jul). Empareja ganadores consecutivos de R32.
  for (let i = 0; i < 8; i += 1) {
    add(89 + i, 'r16', `W${73 + i * 2}`, `W${74 + i * 2}`, iso(2026, 7, 4 + Math.floor(i / 2)));
  }
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
