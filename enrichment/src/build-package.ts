import fs from 'node:fs/promises';
import path from 'node:path';
import { PATHS, ROOT } from './config.js';
import type { EnrichedEntry, EnrichedPlayer, EnrichedTeam } from './types.js';

/**
 * Convierte los artefactos del pipeline de enriquecimiento
 * (catalog-enriched.json + teams.json) en un "collection package" que el
 * frontend consume desde `public/collections/`. El package es agnóstico:
 * los datos ricos del jugador viajan en el campo opcional `meta`.
 */

const PACKAGE_OUT = path.resolve(
  ROOT,
  '..',
  'public',
  'collections',
  'worldcup-2026.json',
);
const MANIFEST = path.resolve(
  ROOT,
  '..',
  'public',
  'collections',
  'index.json',
);

// Tipos mínimos del package que espera el front (ver src/types/collection.ts).
interface PkgTeam {
  id: string;
  name: string;
  flag?: string;
  order?: number;
}
interface PkgSticker {
  id: string;
  code: string;
  name: string;
  teamId?: string;
  category: string;
  type: string;
  rarity: string;
  image?: string;
  order?: number;
  meta?: Record<string, unknown>;
}
interface Pkg {
  id: string;
  schema: number;
  name: string;
  description: string;
  version: string;
  language: string;
  teams: PkgTeam[];
  stickers: PkgSticker[];
}

const isShiny = (code: string): boolean => /\d+s$/i.test(code);

function rarityFor(type: string, shiny: boolean): string {
  if (shiny) return 'special';
  switch (type) {
    case 'team-emblem':
    case 'team-photo':
      return 'rare';
    case 'special':
      return 'special';
    default:
      return 'common';
  }
}

function isPlayer(e: EnrichedEntry): e is EnrichedPlayer {
  return e.type === 'player';
}

/** Construye el campo meta (bio) para una entrada de jugador. */
function playerMeta(p: EnrichedPlayer): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    fifaCode: p.fifaCode,
    countryCode: p.countryCode,
    flagEmoji: p.flagEmoji,
    flagSvgUrl: p.flagSvgUrl,
    nationality: p.nationality,
    position: p.position,
    club: p.club,
    birthDate: p.birthDate,
    birthPlace: p.birthPlace,
    age: p.age,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    wikidataId: p.wikidataId,
    wikipediaUrl: p.wikipediaUrl,
  };
  if (p.preferredFoot) meta.preferredFoot = p.preferredFoot;
  if (p.shirtNumber) meta.shirtNumber = p.shirtNumber;
  if (p.marketValueEur) meta.marketValueEur = p.marketValueEur;
  if (p.socials) meta.socials = p.socials;
  // Limpiar nulos para no inflar el JSON.
  for (const k of Object.keys(meta)) {
    if (meta[k] === null || meta[k] === undefined) delete meta[k];
  }
  return meta;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

async function main(): Promise<void> {
  const [catalog, teams] = await Promise.all([
    readJson<EnrichedEntry[]>(PATHS.catalogEnriched),
    readJson<EnrichedTeam[]>(PATHS.teams),
  ]);

  const pkgTeams: PkgTeam[] = teams.map((t, i) => ({
    id: t.fifaCode,
    name: t.name,
    flag: t.flagEmoji,
    order: i,
  }));

  const stickers: PkgSticker[] = catalog.map((e, i) => {
    const shiny = isShiny(e.code);
    const base: PkgSticker = {
      id: e.code,
      code: e.code,
      name: e.name,
      category: e.type,
      type: shiny ? 'shiny' : 'regular',
      rarity: rarityFor(e.type, shiny),
      order: i,
    };
    if ('fifaCode' in e && e.fifaCode) base.teamId = e.fifaCode;

    if (isPlayer(e)) {
      if (e.commonsImage) base.image = e.commonsImage;
      base.meta = playerMeta(e);
    } else if (
      (e.type === 'team-emblem' || e.type === 'team-photo') &&
      e.flagSvgUrl
    ) {
      base.image = e.flagSvgUrl;
      base.meta = {
        fifaCode: e.fifaCode,
        countryCode: e.countryCode,
        flagEmoji: e.flagEmoji,
        flagSvgUrl: e.flagSvgUrl,
      };
    }
    return base;
  });

  const pkg: Pkg = {
    id: 'worldcup-2026',
    schema: 1,
    name: 'FIFA World Cup 2026',
    description:
      'Catálogo Panini FIFA World Cup 2026 enriquecido (Wikidata + Wikipedia).',
    version: '2.0.0',
    language: 'es',
    teams: pkgTeams,
    stickers,
  };

  await fs.writeFile(PACKAGE_OUT, JSON.stringify(pkg, null, 2), 'utf8');

  // Actualizar entrada del manifest (version + description).
  const manifest = await readJson<{
    collections: Array<Record<string, unknown>>;
  }>(MANIFEST);
  const entry = manifest.collections.find((c) => c.id === 'worldcup-2026');
  if (entry) {
    entry.name = pkg.name;
    entry.description = pkg.description;
    entry.version = pkg.version;
    entry.language = pkg.language;
  } else {
    manifest.collections.unshift({
      id: pkg.id,
      file: 'worldcup-2026.json',
      name: pkg.name,
      description: pkg.description,
      version: pkg.version,
      language: pkg.language,
    });
  }
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

  const players = stickers.filter((s) => s.category === 'player').length;
  const withPhoto = stickers.filter(
    (s) => s.category === 'player' && s.image,
  ).length;
  console.log(`Package escrito: ${PACKAGE_OUT}`);
  console.log(`  stickers: ${stickers.length}, teams: ${pkgTeams.length}`);
  console.log(`  jugadores: ${players}, con foto: ${withPhoto}`);
}

main().catch((err) => {
  console.error('Error build-package:', err);
  process.exit(1);
});
