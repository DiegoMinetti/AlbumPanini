/**
 * Generate sample collection packages + manifest into public/collections.
 *
 * These are realistic, schema-valid sample data sets used to demo the app and
 * to drive tests. Regenerate with `npm run collections`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'collections');
mkdirSync(outDir, { recursive: true });

function writeJson(name, data) {
  writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${name}`);
}

// --- FIFA World Cup 2026 ----------------------------------------------------
const WC_TEAMS = [
  ['ARG', 'Argentina', '🇦🇷', '#75AADB', '#FFFFFF'],
  ['BRA', 'Brazil', '🇧🇷', '#009C3B', '#FFDF00'],
  ['FRA', 'France', '🇫🇷', '#0055A4', '#EF4135'],
  ['ENG', 'England', '🏴', '#FFFFFF', '#CF081F'],
  ['ESP', 'Spain', '🇪🇸', '#AA151B', '#F1BF00'],
  ['GER', 'Germany', '🇩🇪', '#000000', '#DD0000'],
  ['POR', 'Portugal', '🇵🇹', '#006600', '#FF0000'],
  ['NED', 'Netherlands', '🇳🇱', '#AE1C28', '#21468B'],
  ['BEL', 'Belgium', '🇧🇪', '#000000', '#FDDA24'],
  ['ITA', 'Italy', '🇮🇹', '#008C45', '#CD212A'],
  ['CRO', 'Croatia', '🇭🇷', '#FF0000', '#FFFFFF'],
  ['URU', 'Uruguay', '🇺🇾', '#0038A8', '#FCD116'],
  ['MEX', 'Mexico', '🇲🇽', '#006847', '#CE1126'],
  ['USA', 'United States', '🇺🇸', '#0A3161', '#B31942'],
  ['CAN', 'Canada', '🇨🇦', '#FF0000', '#FFFFFF'],
  ['JPN', 'Japan', '🇯🇵', '#BC002D', '#FFFFFF'],
  ['KOR', 'South Korea', '🇰🇷', '#003478', '#C60C30'],
  ['MAR', 'Morocco', '🇲🇦', '#C1272D', '#006233'],
  ['SEN', 'Senegal', '🇸🇳', '#00853F', '#FDEF42'],
  ['COL', 'Colombia', '🇨🇴', '#FCD116', '#003893'],
  ['JOR', 'Jordan', '🇯🇴', '#007A3D', '#CE1126'],
  ['AUS', 'Australia', '🇦🇺', '#00843D', '#FFCD00'],
];

function buildWorldCup() {
  const stickers = [];
  for (const [code, name] of WC_TEAMS) {
    // Team badge + 17 player slots = 18 per team.
    stickers.push({
      id: `${code}-BADGE`,
      code: `${code} 0`,
      name: `${name} Badge`,
      teamId: code,
      category: 'badge',
      type: 'foil',
      rarity: 'special',
    });
    for (let n = 1; n <= 17; n++) {
      stickers.push({
        id: `${code}-${n}`,
        code: `${code} ${n}`,
        name: `${name} Player ${n}`,
        teamId: code,
        category: 'player',
        type: 'regular',
        rarity: n <= 2 ? 'rare' : 'common',
      });
    }
  }
  return {
    id: 'worldcup-2026',
    schema: 1,
    name: 'FIFA World Cup 2026',
    description: 'Official-style sample album for the 2026 tournament.',
    version: '1.0.0',
    language: 'en',
    teams: WC_TEAMS.map(([id, name, flag, primaryColor, secondaryColor], i) => ({
      id,
      name,
      flag,
      primaryColor,
      secondaryColor,
      order: i,
    })),
    stickers,
  };
}

// --- Pokémon 151 (no teams) -------------------------------------------------
function buildPokemon() {
  const stickers = [];
  for (let n = 1; n <= 151; n++) {
    const code = `PKM ${n}`;
    const rarity =
      n % 50 === 0 ? 'legendary' : n % 10 === 0 ? 'rare' : 'common';
    stickers.push({
      id: `PKM-${n}`,
      code,
      name: `Pokémon #${n}`,
      category: 'creature',
      type: n % 7 === 0 ? 'shiny' : 'regular',
      rarity,
    });
  }
  return {
    id: 'pokemon-151',
    schema: 1,
    name: 'Pokémon 151',
    description: 'Classic 151 sample set (no teams).',
    version: '1.0.0',
    language: 'en',
    teams: [],
    stickers,
  };
}

// --- Tiny demo collection (used by e2e/tests) -------------------------------
function buildDemo() {
  return {
    id: 'demo-mini',
    schema: 1,
    name: 'Demo Mini',
    description: 'A tiny collection for quick testing.',
    version: '1.0.0',
    language: 'es',
    teams: [
      { id: 'ARG', name: 'Argentina', flag: '🇦🇷', primaryColor: '#75AADB' },
      { id: 'BRA', name: 'Brazil', flag: '🇧🇷', primaryColor: '#009C3B' },
    ],
    stickers: [
      { id: 'ARG-1', code: 'ARG 1', name: 'Argentina 1', teamId: 'ARG', category: 'player', type: 'regular', rarity: 'common' },
      { id: 'ARG-2', code: 'ARG 2', name: 'Argentina 2', teamId: 'ARG', category: 'player', type: 'regular', rarity: 'common' },
      { id: 'ARG-3', code: 'ARG 3', name: 'Argentina 3', teamId: 'ARG', category: 'player', type: 'regular', rarity: 'rare' },
      { id: 'BRA-1', code: 'BRA 1', name: 'Brazil 1', teamId: 'BRA', category: 'player', type: 'regular', rarity: 'common' },
      { id: 'BRA-12', code: 'BRA 12', name: 'Brazil 12', teamId: 'BRA', category: 'player', type: 'regular', rarity: 'common' },
    ],
  };
}

const collections = [
  { file: 'worldcup-2026.json', data: buildWorldCup() },
  { file: 'pokemon-151.json', data: buildPokemon() },
  { file: 'demo-mini.json', data: buildDemo() },
];

for (const { file, data } of collections) writeJson(file, data);

writeJson('index.json', {
  collections: collections.map(({ file, data }) => ({
    id: data.id,
    file,
    name: data.name,
    description: data.description,
    version: data.version,
    language: data.language,
  })),
});
