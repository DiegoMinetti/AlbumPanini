import { db } from '@/db';
import type {
  StoredKnockoutPick,
  StoredMatchResult,
  StoredScenario,
} from '@/types/scenario';
import { generateId, makeUid } from '@/utils/ids';

/**
 * Scenario persistence: CRUD over scenarios plus their match results and
 * knockout picks. A scenario layers user results on top of a collection's
 * static tournament structure; switching scenarios swaps the whole state.
 *
 * Invariant: every collection that has a tournament gets exactly one official
 * scenario, auto-created on first access (see `ensureOfficialScenario`).
 */

const OFFICIAL_NAME = 'Oficial';

export async function listScenarios(
  collectionId: string
): Promise<StoredScenario[]> {
  const rows = await db.scenarios
    .where('collectionId')
    .equals(collectionId)
    .toArray();
  // Official first, then by creation order.
  return rows.sort((a, b) => {
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

export async function getScenario(
  id: string
): Promise<StoredScenario | undefined> {
  return db.scenarios.get(id);
}

/** Ensure the official scenario exists, creating it if needed. Returns it. */
export async function ensureOfficialScenario(
  collectionId: string
): Promise<StoredScenario> {
  const existing = (await listScenarios(collectionId)).find(
    (s) => s.isOfficial
  );
  if (existing) return existing;
  const now = Date.now();
  const scenario: StoredScenario = {
    id: makeUid(collectionId, 'official'),
    collectionId,
    name: OFFICIAL_NAME,
    isOfficial: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.scenarios.put(scenario);
  return scenario;
}

/** Create a new (custom) scenario, optionally copying another's results. */
export async function createScenario(
  collectionId: string,
  name: string,
  copyFromId?: string
): Promise<StoredScenario> {
  const now = Date.now();
  const scenario: StoredScenario = {
    id: generateId('scn'),
    collectionId,
    name: name.trim() || 'Simulación',
    isOfficial: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.scenarios.put(scenario);
  if (copyFromId) await copyScenarioData(copyFromId, scenario.id);
  return scenario;
}

async function copyScenarioData(fromId: string, toId: string): Promise<void> {
  const now = Date.now();
  const [results, picks] = await Promise.all([
    db.matchResults.where('scenarioId').equals(fromId).toArray(),
    db.knockoutPicks.where('scenarioId').equals(fromId).toArray(),
  ]);
  const newResults: StoredMatchResult[] = results.map((r) => ({
    ...r,
    uid: makeUid(toId, r.matchId),
    scenarioId: toId,
    updatedAt: now,
  }));
  const newPicks: StoredKnockoutPick[] = picks.map((p) => ({
    ...p,
    uid: makeUid(toId, p.slot),
    scenarioId: toId,
    updatedAt: now,
  }));
  if (newResults.length) await db.matchResults.bulkPut(newResults);
  if (newPicks.length) await db.knockoutPicks.bulkPut(newPicks);
}

export async function renameScenario(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Scenario name cannot be empty');
  await db.scenarios.update(id, { name: trimmed, updatedAt: Date.now() });
}

/** Delete a scenario and its data. The official scenario cannot be deleted. */
export async function deleteScenario(id: string): Promise<void> {
  const scenario = await db.scenarios.get(id);
  if (!scenario) return;
  if (scenario.isOfficial) {
    throw new Error('The official scenario cannot be deleted');
  }
  await db.transaction(
    'rw',
    [db.scenarios, db.matchResults, db.knockoutPicks],
    async () => {
      await db.scenarios.delete(id);
      await db.matchResults.where('scenarioId').equals(id).delete();
      await db.knockoutPicks.where('scenarioId').equals(id).delete();
    }
  );
}

export async function getResults(
  scenarioId: string
): Promise<StoredMatchResult[]> {
  return db.matchResults.where('scenarioId').equals(scenarioId).toArray();
}

export async function getPicks(
  scenarioId: string
): Promise<StoredKnockoutPick[]> {
  return db.knockoutPicks.where('scenarioId').equals(scenarioId).toArray();
}

/**
 * Set (or clear) a match score. Passing `null` for both goals clears the
 * result. Negative goals are clamped to 0.
 */
export async function setScore(
  scenarioId: string,
  matchId: string,
  score: {
    homeGoals: number | null;
    awayGoals: number | null;
    homePens?: number | null;
    awayPens?: number | null;
  }
): Promise<void> {
  const uid = makeUid(scenarioId, matchId);
  const now = Date.now();
  if (score.homeGoals == null && score.awayGoals == null) {
    await db.matchResults.delete(uid);
    await db.scenarios.update(scenarioId, { updatedAt: now });
    return;
  }
  const clamp = (n: number | null | undefined): number =>
    Math.max(0, Math.floor(n ?? 0));
  const row: StoredMatchResult = {
    uid,
    scenarioId,
    matchId,
    homeGoals: clamp(score.homeGoals),
    awayGoals: clamp(score.awayGoals),
    played: true,
    updatedAt: now,
  };
  if (score.homePens != null) row.homePens = clamp(score.homePens);
  if (score.awayPens != null) row.awayPens = clamp(score.awayPens);
  await db.matchResults.put(row);
  await db.scenarios.update(scenarioId, { updatedAt: now });
}

/** Manually assign (or clear) which team fills a knockout slot. */
export async function setKnockoutPick(
  scenarioId: string,
  slot: string,
  teamId: string | null
): Promise<void> {
  const uid = makeUid(scenarioId, slot);
  const now = Date.now();
  if (!teamId) {
    await db.knockoutPicks.delete(uid);
  } else {
    await db.knockoutPicks.put({
      uid,
      scenarioId,
      slot,
      teamId,
      updatedAt: now,
    });
  }
  await db.scenarios.update(scenarioId, { updatedAt: now });
}
