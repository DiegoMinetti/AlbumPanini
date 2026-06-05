import fs from 'node:fs/promises';
import pLimit from 'p-limit';
import { CONFIG, PATHS } from './config.js';
import {
  loadRawCatalog,
  classifyAll,
  distinctTeams,
  type ClassifiedSticker,
} from './catalog.js';
import { lookupCountry } from './reference/countries.js';
import { buildFlag } from './flags.js';
import { normalizeName, normalizePosition, calculateAge } from './normalize.js';
import { JsonCache } from './cache.js';
import { loadCheckpoint, saveCheckpoint, clearCheckpoint } from './checkpoint.js';
import { enrichedPlayerSchema } from './schemas.js';
import {
  searchEntityIds,
  fetchCandidatesDetails,
  fetchPersonDetails,
} from './sources/wikidata.js';
import { fetchWikipediaSummary, looksLikeFootballer } from './sources/wikipedia.js';
import { selectMatch } from './matching.js';
import type {
  EnrichedEntry,
  EnrichedPlayer,
  EnrichedTeam,
  AmbiguousMatch,
  EnrichmentError,
  WikidataPerson,
} from './types.js';

// Resolución cacheada de un jugador (clave: team::nombreNormalizado).
interface PlayerResolution {
  name: string;
  team: string;
  wikidataId: string | null;
  wikipediaUrl: string | null;
  person: WikidataPerson | null;
  ambiguous: boolean;
  source: 'wikidata' | 'wikipedia' | 'none';
}

const playerCache = new JsonCache<PlayerResolution>(PATHS.cachePlayers);

export interface EnrichRunOptions {
  /** Reanudar desde el último checkpoint. */
  resume?: boolean;
  /** Enriquecer un único jugador (por nombre) y no escribir artefactos. */
  singlePlayer?: string;
  log?: (msg: string) => void;
}

interface RunState {
  players: EnrichedPlayer[];
  ambiguous: AmbiguousMatch[];
  errors: EnrichmentError[];
}

/** Construye la lista de selecciones enriquecidas (sin red). */
export function buildTeams(stickers: ClassifiedSticker[]): EnrichedTeam[] {
  const teams = distinctTeams(stickers);
  const out: EnrichedTeam[] = [];
  for (const team of teams) {
    const c = lookupCountry(team);
    if (!c) continue;
    const flag = buildFlag(c.countryCode);
    out.push({
      name: c.team,
      fifaCode: c.fifaCode,
      countryCode: c.countryCode,
      flagEmoji: flag.flagEmoji,
      flagSvgUrl: flag.flagSvgUrl,
      confederation: c.confederation,
      group: null, // los grupos del sorteo no están en la fuente; se deja null
    });
  }
  return out;
}

/** Resuelve un jugador contra Wikidata (+ Wikipedia fallback), con cache. */
export async function resolvePlayer(
  name: string,
  team: string,
  state: RunState,
  log: (m: string) => void,
): Promise<PlayerResolution> {
  const key = `${team}::${normalizeName(name)}`;
  const cached = await playerCache.get(key);
  if (cached) return cached;

  let resolution: PlayerResolution = {
    name,
    team,
    wikidataId: null,
    wikipediaUrl: null,
    person: null,
    ambiguous: false,
    source: 'none',
  };

  try {
    // 1. Wikidata: buscar candidatos y desambiguar usando la selección.
    const hits = await searchEntityIds(name);
    const candidates = await fetchCandidatesDetails(hits.map((h) => h.id));
    const { match, ambiguous, scored } = selectMatch(name, team, candidates);

    if (ambiguous) {
      state.ambiguous.push({
        code: '',
        name,
        team,
        candidates: scored.slice(0, 3).map((s) => ({
          wikidataId: s.candidate.wikidataId,
          label: s.candidate.label,
          reason: s.reason,
        })),
      });
      log(`  ⚠ ambiguo: ${name} (${team})`);
    } else if (match) {
      const person = await fetchPersonDetails(match.wikidataId);
      resolution = {
        name,
        team,
        wikidataId: match.wikidataId,
        wikipediaUrl: person.wikipediaUrl ?? null,
        person,
        ambiguous: false,
        source: 'wikidata',
      };
    }

    // 2. Wikipedia: SOLO fallback si Wikidata no resolvió lo esencial.
    const needsFallback =
      !resolution.wikipediaUrl ||
      !resolution.person ||
      !resolution.person.birthDate;
    if (needsFallback && !ambiguous) {
      const summary = await fetchWikipediaSummary(name);
      if (summary && looksLikeFootballer(summary)) {
        resolution.wikipediaUrl ??= summary.pageUrl ?? null;
        if (resolution.person && summary.thumbnailUrl) {
          resolution.person.commonsImage ??= summary.thumbnailUrl;
        }
        if (resolution.source === 'none') resolution.source = 'wikipedia';
      }
    }
  } catch (err) {
    state.errors.push({
      code: '',
      name,
      team,
      stage: 'resolve',
      message: String(err),
    });
    log(`  ✗ error: ${name} (${team}): ${String(err)}`);
  }

  await playerCache.set(key, resolution);
  return resolution;
}

/** Ensambla un EnrichedPlayer a partir de la resolución y los datos de país. */
function buildPlayer(
  sticker: ClassifiedSticker,
  res: PlayerResolution,
): EnrichedPlayer | null {
  const c = lookupCountry(sticker.team);
  if (!c) return null;
  const flag = buildFlag(c.countryCode);
  const p = res.person;

  const birthDate = p?.birthDate ?? null;
  const age = birthDate
    ? calculateAge(birthDate, CONFIG.ageReferenceDate)
    : null;

  const player: EnrichedPlayer = {
    code: sticker.code,
    type: 'player',
    name: sticker.name,
    team: sticker.team,
    countryCode: c.countryCode,
    fifaCode: c.fifaCode,
    flagEmoji: flag.flagEmoji,
    flagSvgUrl: flag.flagSvgUrl,
    wikidataId: res.wikidataId,
    wikipediaUrl: res.wikipediaUrl,
    birthDate,
    birthPlace: p?.birthPlace ?? null,
    age,
    heightCm: p?.heightCm ?? null,
    weightKg: p?.weightKg ?? null,
    position: normalizePosition(p?.position),
    club: p?.club ?? null,
    nationality: p?.nationality ?? c.team,
  };

  // Extras opcionales (solo si existen).
  if (p?.preferredFoot) {
    const f = p.preferredFoot.toLowerCase();
    player.preferredFoot = f.includes('both')
      ? 'Both'
      : f.includes('left')
        ? 'Left'
        : 'Right';
  }
  if (p?.shirtNumber) player.shirtNumber = p.shirtNumber;
  if (p?.marketValueEur) player.marketValueEur = p.marketValueEur;
  if (p?.commonsImage) player.commonsImage = p.commonsImage;
  if (p?.birthCoordinates) player.birthCoordinates = p.birthCoordinates;
  if (p?.socials) player.socials = p.socials;

  // Validación zod: descartar registros corruptos.
  const parsed = enrichedPlayerSchema.safeParse(player);
  if (!parsed.success) return null;
  return parsed.data as EnrichedPlayer;
}

/** Construye una entrada no-jugador para el catálogo enriquecido. */
function buildNonPlayer(sticker: ClassifiedSticker): EnrichedEntry {
  const c = lookupCountry(sticker.team);
  if (c && (sticker.type === 'team-emblem' || sticker.type === 'team-photo')) {
    const flag = buildFlag(c.countryCode);
    return {
      code: sticker.code,
      type: sticker.type,
      name: sticker.name,
      team: sticker.team,
      countryCode: c.countryCode,
      fifaCode: c.fifaCode,
      flagEmoji: flag.flagEmoji,
      flagSvgUrl: flag.flagSvgUrl,
    };
  }
  return {
    code: sticker.code,
    type: 'special',
    name: sticker.name,
    team: sticker.team,
  };
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(PATHS.generatedDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

/** Corre el pipeline completo de enriquecimiento. */
export async function runEnrich(opts: EnrichRunOptions = {}): Promise<RunState> {
  const log = opts.log ?? (() => {});
  const { stickers, invalid } = await loadRawCatalog();
  const classified = classifyAll(stickers);
  const state: RunState = { players: [], ambiguous: [], errors: [] };
  for (const inv of invalid) {
    state.errors.push({
      code: '',
      name: '',
      team: '',
      stage: 'load',
      message: inv.error,
    });
  }

  // Modo single-player: resolver y mostrar, sin tocar artefactos.
  if (opts.singlePlayer) {
    const target = normalizeName(opts.singlePlayer);
    const hit = classified.find(
      (s) => s.type === 'player' && normalizeName(s.name) === target,
    );
    if (!hit) {
      log(`No se encontró jugador "${opts.singlePlayer}" en el catálogo.`);
      return state;
    }
    log(`Resolviendo ${hit.name} (${hit.team})...`);
    const res = await resolvePlayer(hit.name, hit.team, state, log);
    const built = buildPlayer(hit, res);
    log(JSON.stringify(built ?? { error: 'no enriquecido' }, null, 2));
    if (built) state.players.push(built);
    return state;
  }

  const playerStickers = classified.filter((s) => s.type === 'player');
  const nonPlayers = classified.filter((s) => s.type !== 'player');

  // Reanudación: saltar códigos ya procesados.
  const done = new Set<string>();
  if (opts.resume) {
    const cp = await loadCheckpoint();
    if (cp) {
      cp.processedCodes.forEach((c) => done.add(c));
      log(`Reanudando: ${cp.processed}/${cp.total} ya procesados.`);
    }
  } else {
    await clearCheckpoint();
  }

  // Equipos (sin red): se generan siempre.
  const teams = buildTeams(classified);

  const limit = pLimit(CONFIG.concurrency);
  const total = playerStickers.length;
  const processedCodes: string[] = [...done];
  let processed = done.size;

  const tasks = playerStickers
    .filter((s) => !done.has(s.code))
    .map((sticker) =>
      limit(async () => {
        const res = await resolvePlayer(sticker.name, sticker.team, state, log);
        const built = buildPlayer(sticker, res);
        if (built) {
          state.players.push(built);
        } else {
          state.errors.push({
            code: sticker.code,
            name: sticker.name,
            team: sticker.team,
            stage: 'build',
            message: 'no enriquecido o inválido',
          });
        }
        processed++;
        processedCodes.push(sticker.code);

        if (processed % CONFIG.checkpointEvery === 0) {
          await saveCheckpoint({
            processed,
            remaining: total - processed,
            total,
            processedCodes: [...processedCodes],
            updatedAt: new Date().toISOString(),
          });
          log(`  checkpoint: ${processed}/${total}`);
        }
      }),
    );

  await Promise.all(tasks);

  // Artefactos finales.
  const enrichedByCode = new Map(state.players.map((p) => [p.code, p]));
  const catalogEnriched: EnrichedEntry[] = classified.map((s) =>
    s.type === 'player'
      ? (enrichedByCode.get(s.code) ?? buildNonPlayer(s))
      : buildNonPlayer(s),
  );

  await writeJson(PATHS.teams, teams);
  await writeJson(PATHS.players, state.players);
  await writeJson(PATHS.catalogEnriched, catalogEnriched);
  await writeJson(
    PATHS.report.replace('enrichment-report', 'ambiguous-matches'),
    state.ambiguous,
  );
  await writeJson(
    PATHS.report.replace('enrichment-report', 'enrichment-errors'),
    state.errors,
  );

  // Checkpoint final + limpieza.
  await saveCheckpoint({
    processed: total,
    remaining: 0,
    total,
    processedCodes,
    updatedAt: new Date().toISOString(),
  });

  log(`Listo: ${state.players.length}/${total} jugadores enriquecidos.`);
  log(`No-jugadores: ${nonPlayers.length}, equipos: ${teams.length}.`);
  return state;
}
