import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Raíz del proyecto enrichment (un nivel arriba de src/). */
export const ROOT = path.resolve(__dirname, '..');

export const PATHS = {
  root: ROOT,
  rawCatalog: path.join(
    ROOT,
    'data',
    'raw',
    'panini-wc-2026-catalog.json',
  ),
  cacheDir: path.join(ROOT, 'data', 'cache'),
  cachePlayers: path.join(ROOT, 'data', 'cache', 'players'),
  cacheTeams: path.join(ROOT, 'data', 'cache', 'teams'),
  cacheWikidata: path.join(ROOT, 'data', 'cache', 'wikidata'),
  generatedDir: path.join(ROOT, 'data', 'generated'),
  checkpointsDir: path.join(ROOT, 'data', 'checkpoints'),
  catalogEnriched: path.join(ROOT, 'data', 'generated', 'catalog-enriched.json'),
  players: path.join(ROOT, 'data', 'generated', 'players.json'),
  teams: path.join(ROOT, 'data', 'generated', 'teams.json'),
  report: path.join(ROOT, 'data', 'generated', 'enrichment-report.json'),
  checkpoint: path.join(ROOT, 'data', 'checkpoints', 'progress.json'),
} as const;

export const CONFIG = {
  /** Concurrencia máxima de llamadas a fuentes externas (rate limiting). */
  concurrency: 4,
  /** Cada cuántos jugadores se guarda un checkpoint. */
  checkpointEvery: 25,
  /** Reintentos por request con backoff exponencial. */
  maxRetries: 3,
  retryBaseMs: 800,
  /** Timeout por request (ms). */
  requestTimeoutMs: 20_000,
  /** User-Agent exigido por las APIs de Wikimedia. */
  userAgent:
    'PaniniWC2026-Enrichment/1.0 (https://github.com/danieltartaro/sticker-swap; contacto via repo)',
  wikidataSparqlEndpoint: 'https://query.wikidata.org/sparql',
  wikidataApiEndpoint: 'https://www.wikidata.org/w/api.php',
  /** Base de URLs SVG de banderas (no hardcodear por país). */
  flagCdnBase: 'https://flagcdn.com',
  /** Fecha de referencia para el cálculo de edad (hoy del torneo). */
  ageReferenceDate: '2026-06-03',
} as const;
