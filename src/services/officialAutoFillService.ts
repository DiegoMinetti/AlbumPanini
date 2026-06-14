import { db } from '@/db';
import type { StoredOfficialResult, StoredPrediction } from '@/types/prediction';

/**
 * Auto-fill the official scenario with FIFA results.
 *
 * Whenever the official-results table is updated (via the openfootball
 * sync), we propagate every finished result to **every** scenario that
 * has `isOfficial: true`. Custom (user-owned) scenarios are left alone
 * — the user types their own predictions there.
 *
 * For each match where the official is `FT` / `AET` / `PEN`, we upsert
 * a `predictions` row on the official scenario. SCHEDULED rows are
 * ignored: we never pre-fill a prediction for a match that hasn't
 * happened, even on the official scenario, because there's nothing to
 * predict yet.
 *
 * Idempotent: re-running for the same official result is a no-op
 * (Dexie's `bulkPut` is upsert).
 *
 * The official scenario exists per collection; the WC26 collection
 * creates one via `ensureOfficialScenario` on first mount. Other
 * collections without a tournament block never call this (no official
 * scenario is created), so the write loop is cheap.
 */
export async function autoFillOfficialScenarios(
  rows: StoredOfficialResult[]
): Promise<{ scenariosTouched: number; predictionsWritten: number }> {
  // Only finished matches are auto-filled. SCHEDULED entries carry no
  // goals, so writing them as predictions would show up in the UI as
  // "0-0" before kickoff — exactly what we don't want.
  const finished = rows.filter(
    (r) =>
      r.status !== 'SCHEDULED' &&
      r.homeGoals != null &&
      r.awayGoals != null
  );
  if (finished.length === 0) {
    return { scenariosTouched: 0, predictionsWritten: 0 };
  }

  const scenarios = (await db.scenarios.toArray()).filter(
    (s) => s.isOfficial
  );
  if (scenarios.length === 0) {
    return { scenariosTouched: 0, predictionsWritten: 0 };
  }

  const now = Date.now();
  const writes: StoredPrediction[] = [];
  for (const s of scenarios) {
    for (const o of finished) {
      writes.push({
        uid: `${s.id}::${o.matchId}`,
        scenarioId: s.id,
        matchId: o.matchId,
        homeGoals: o.homeGoals!,
        awayGoals: o.awayGoals!,
        ...(o.homePens != null ? { homePens: o.homePens } : {}),
        ...(o.awayPens != null ? { awayPens: o.awayPens } : {}),
        played: true,
        updatedAt: now,
      });
    }
  }

  await db.predictions.bulkPut(writes);
  return {
    scenariosTouched: scenarios.length,
    predictionsWritten: writes.length,
  };
}

/**
 * Inverse: when the user creates a new scenario with `copyFromId`, we
 * want the official scenario to be a clean slate (just the FIFA
 * results, no user typing). This helper is the public entry point
 * exposed for the ScenarioBar to trigger an auto-fill on demand
 * (e.g. after the user creates a new collection, or hits a
 * "Sync official results now" button).
 */
export async function autoFillAllOfficialScenarios(): Promise<{
  scenariosTouched: number;
  predictionsWritten: number;
}> {
  const rows = await db.officialResults.toArray();
  return autoFillOfficialScenarios(rows);
}
