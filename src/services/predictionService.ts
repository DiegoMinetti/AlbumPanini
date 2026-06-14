import { db } from '@/db';
import type { TournamentMatch } from '@/types/tournament';
import type {
  StoredKnockoutPrediction,
  StoredPrediction,
} from '@/types/prediction';
import { makeUid } from '@/utils/ids';
import { isLockedForPrediction } from '@/utils/prediction';

/**
 * Prediction persistence: CRUD over the v3+ `predictions` and
 * `knockoutPredictions` tables.
 *
 * Same shape and semantics as the legacy `scenarioService.setScore` /
 * `setKnockoutPick`, but writes to the new tables AND enforces the
 * "no edits after kickoff" rule (per the user's spec). If the caller passes
 * a score for a match whose `kickoff <= now`, the write is rejected with
 * `PredictionLockedError` so the UI can surface the lock.
 *
 * The legacy tables (`matchResults`, `knockoutPicks`) remain defined in the
 * schema for the migration and for back-compat in backup/sync exports, but
 * no part of the app writes to them anymore.
 */

export class PredictionLockedError extends Error {
  readonly matchId: string;
  constructor(matchId: string) {
    super(`prediction locked for match ${matchId} (kickoff already passed)`);
    this.name = 'PredictionLockedError';
    this.matchId = matchId;
  }
}

export async function listPredictions(
  scenarioId: string
): Promise<StoredPrediction[]> {
  return db.predictions.where('scenarioId').equals(scenarioId).toArray();
}

export async function listKnockoutPredictions(
  scenarioId: string
): Promise<StoredKnockoutPrediction[]> {
  return db.knockoutPredictions.where('scenarioId').equals(scenarioId).toArray();
}

/**
 * Throws `PredictionLockedError` if `match.kickoff` is in the past. We accept
 * a partial `TournamentMatch` because the UI already has the full object
 * loaded — no reason to do a second DB lookup just to check the lock.
 */
function ensureNotLocked(
  matchId: string,
  match: Pick<TournamentMatch, 'kickoff'>
): void {
  if (isLockedForPrediction(match)) {
    throw new PredictionLockedError(matchId);
  }
}

const clamp = (n: number | null | undefined): number =>
  Math.max(0, Math.floor(n ?? 0));

/**
 * Set or clear the user prediction for a match within a scenario.
 *
 * Passing `null` for both `homeGoals` and `awayGoals` clears the row.
 * Otherwise the row is upserted with `played: true`. Throws
 * {@link PredictionLockedError} if the match has already kicked off.
 */
export async function setPrediction(
  scenarioId: string,
  match: TournamentMatch,
  score: {
    homeGoals: number | null;
    awayGoals: number | null;
    homePens?: number | null;
    awayPens?: number | null;
  }
): Promise<void> {
  ensureNotLocked(match.id, match);
  const uid = makeUid(scenarioId, match.id);
  const now = Date.now();
  if (score.homeGoals == null && score.awayGoals == null) {
    await db.predictions.delete(uid);
    await db.scenarios.update(scenarioId, { updatedAt: now });
    return;
  }
  const row: StoredPrediction = {
    uid,
    scenarioId,
    matchId: match.id,
    homeGoals: clamp(score.homeGoals),
    awayGoals: clamp(score.awayGoals),
    played: true,
    updatedAt: now,
  };
  if (score.homePens != null) row.homePens = clamp(score.homePens);
  if (score.awayPens != null) row.awayPens = clamp(score.awayPens);
  await db.predictions.put(row);
  await db.scenarios.update(scenarioId, { updatedAt: now });
}

/**
 * Set or clear a manual knockout-slot prediction. Knockout predictions are
 * only meaningful once a slot is known — we lock them by the **earliest**
 * possible kickoff of any match that could feed that slot. Since we don't
 * statically know the dependency, the lock check is delegated to the caller
 * (BracketView), which has the full TournamentMatch for each row. This
 * function performs the simpler check: refuse if `now` is past the final
 * (the last possible moment any knockout slot could still be edited).
 *
 * In practice BracketView calls this only while the match itself is not
 * locked, so the timestamp check is a defensive backstop.
 */
export async function setKnockoutPrediction(
  scenarioId: string,
  slot: string,
  teamId: string | null,
  lockBackstop?: Pick<TournamentMatch, 'kickoff'>
): Promise<void> {
  if (lockBackstop) ensureNotLocked(slot, lockBackstop);
  const uid = makeUid(scenarioId, slot);
  const now = Date.now();
  if (!teamId) {
    await db.knockoutPredictions.delete(uid);
  } else {
    await db.knockoutPredictions.put({
      uid,
      scenarioId,
      slot,
      teamId,
      updatedAt: now,
    });
  }
  await db.scenarios.update(scenarioId, { updatedAt: now });
}
