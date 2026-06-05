import fs from 'node:fs/promises';
import { PATHS } from './config.js';
import { loadRawCatalog, classifyAll, distinctTeams } from './catalog.js';
import type {
  EnrichedPlayer,
  EnrichmentReport,
  AmbiguousMatch,
  EnrichmentError,
} from './types.js';

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Un jugador cuenta como enriquecido si resolvió wikidata o fecha de nacimiento. */
function isEnriched(p: EnrichedPlayer): boolean {
  return Boolean(p.wikidataId) || Boolean(p.birthDate);
}

/** Genera enrichment-report.json a partir de los artefactos ya producidos. */
export async function generateReport(): Promise<EnrichmentReport> {
  const { stickers } = await loadRawCatalog();
  const classified = classifyAll(stickers);
  const playersDetected = classified.filter((s) => s.type === 'player').length;
  const teamsDetected = distinctTeams(stickers).length;

  const players = await readJson<EnrichedPlayer[]>(PATHS.players, []);
  const ambiguous = await readJson<AmbiguousMatch[]>(
    PATHS.report.replace('enrichment-report', 'ambiguous-matches'),
    [],
  );
  const errors = await readJson<EnrichmentError[]>(
    PATHS.report.replace('enrichment-report', 'enrichment-errors'),
    [],
  );

  const playersEnriched = players.filter(isEnriched).length;
  const playersMissing = playersDetected - playersEnriched;
  const successRate =
    playersDetected > 0
      ? Math.round((playersEnriched / playersDetected) * 10000) / 100
      : 0;

  const report: EnrichmentReport = {
    totalStickers: stickers.length,
    playersDetected,
    playersEnriched,
    playersMissing,
    successRate,
    teamsDetected,
    ambiguousMatches: ambiguous.length,
    errors: errors.length,
    generatedAt: new Date().toISOString(),
  };

  await fs.mkdir(PATHS.generatedDir, { recursive: true });
  await fs.writeFile(PATHS.report, JSON.stringify(report, null, 2), 'utf8');
  return report;
}
