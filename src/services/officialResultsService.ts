import { db } from '@/db';
import type { StoredOfficialResult } from '@/types/prediction';

/**
 * FIFA-official results persistence + fetch.
 *
 * The GitHub Action (`.github/workflows/sync-official-results.yml`) commits a
 * `public/official/worldcup-2026-results.json` snapshot on every sync. The
 * frontend downloads that file on first use and persists it into the
 * `officialResults` IndexedDB table so subsequent reads are offline-friendly.
 *
 * Schema of the JSON: see {@link StoredOfficialResult}. Validated with a
 * minimal in-place shape check — we trust the producer (the Action) but
 * fail closed on garbage.
 */

const OFFICIAL_RESULTS_URL = `${import.meta.env.BASE_URL || '/'}official/worldcup-2026-results.json`;

interface RawPayload {
  source?: unknown;
  generatedAt?: unknown;
  matches?: unknown;
}

interface RawMatch {
  id?: unknown;
  homeGoals?: unknown;
  awayGoals?: unknown;
  homePens?: unknown;
  awayPens?: unknown;
  status?: unknown;
  finishedAt?: unknown;
  kickoff?: unknown;
  venue?: unknown;
  group?: unknown;
  stage?: unknown;
  apiFootballFixtureId?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function asOptNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Parse + validate the JSON file. Throws on shape mismatch. */
export function parseOfficialResultsPayload(
  raw: unknown,
  syncedAt: number
): StoredOfficialResult[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('official-results payload must be a JSON object');
  }
  const r = raw as RawPayload;
  // Accept both the original api-football source and the openfootball
  // source we switched to in PR5 (api-football free tier doesn't cover
  // the 2026 season). The shape is identical; only the producer name
  // changed.
  if (r.source !== 'api-football' && r.source !== 'openfootball') {
    throw new Error(`unexpected source: ${String(r.source)}`);
  }
  if (typeof r.generatedAt !== 'string') {
    throw new Error('generatedAt missing');
  }
  if (!Array.isArray(r.matches)) {
    throw new Error('matches must be an array');
  }
  return r.matches.map((m, i) => {
    const match = m as RawMatch;
    const id = asString(match.id);
    const status = asString(match.status);
    const kickoff = asString(match.kickoff);
    const apiFootballFixtureId = asNumber(match.apiFootballFixtureId);
    if (!id) throw new Error(`matches[${i}].id missing`);
    if (
      status !== 'FT' &&
      status !== 'AET' &&
      status !== 'PEN' &&
      status !== 'SCHEDULED'
    ) {
      throw new Error(`matches[${i}].status invalid: ${String(status)}`);
    }
    if (!kickoff) throw new Error(`matches[${i}].kickoff missing`);
    if (apiFootballFixtureId == null) {
      throw new Error(`matches[${i}].apiFootballFixtureId missing`);
    }
    const out: StoredOfficialResult = {
      matchId: id,
      status,
      kickoff,
      apiFootballFixtureId,
      syncedAt,
    };
    // homeGoals/awayGoals are only required for finished matches.
    if (status !== 'SCHEDULED') {
      const homeGoals = asNumber(match.homeGoals);
      const awayGoals = asNumber(match.awayGoals);
      if (homeGoals == null) throw new Error(`matches[${i}].homeGoals missing`);
      if (awayGoals == null) throw new Error(`matches[${i}].awayGoals missing`);
      out.homeGoals = homeGoals;
      out.awayGoals = awayGoals;
      const finishedAt = asString(match.finishedAt);
      if (finishedAt) out.finishedAt = finishedAt;
      else out.finishedAt = kickoff;
    }
    const hp = asOptNumber(match.homePens);
    const ap = asOptNumber(match.awayPens);
    if (hp != null) out.homePens = hp;
    if (ap != null) out.awayPens = ap;
    const venue = asString(match.venue);
    if (venue) out.venue = venue;
    const group = asString(match.group);
    if (group) out.group = group;
    const stage = asString(match.stage);
    if (stage) out.stage = stage;
    return out;
  });
}

/**
 * Download the official-results JSON, parse it, and upsert every row into
 * `db.officialResults`. Existing rows for the same matchId are overwritten
 * (status may upgrade from FT to AET to PEN during a match's lifecycle).
 *
 * Returns the number of rows persisted. Throws on network or parse failure —
 * callers (the hook) translate that into a "no oficial yet" UI state.
 */
export async function syncOfficialResultsFromRemote(): Promise<number> {
  const res = await fetch(OFFICIAL_RESULTS_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`official-results HTTP ${res.status}`);
  }
  const raw = (await res.json()) as unknown;
  const rows = parseOfficialResultsPayload(raw, Date.now());
  if (rows.length === 0) return 0;
  await db.officialResults.bulkPut(rows);
  return rows.length;
}

/** Last successful sync's `generatedAt` (ISO), read from the newest row. */
export async function readOfficialSyncedAt(): Promise<string | null> {
  const first = await db.officialResults.orderBy('finishedAt').last();
  // finishedAt varies; syncedAt is what we care about. Cheap max:
  const all = await db.officialResults.toArray();
  if (all.length === 0) return null;
  let max = all[0]!.syncedAt;
  for (const r of all) if (r.syncedAt > max) max = r.syncedAt;
  void first;
  return new Date(max).toISOString();
}

/** Read all official results as a Map<matchId, row>. */
export async function readOfficialResultsMap(): Promise<
  Map<string, StoredOfficialResult>
> {
  const rows = await db.officialResults.toArray();
  return new Map(rows.map((r) => [r.matchId, r]));
}
