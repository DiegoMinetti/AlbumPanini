import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { Tournament } from '@/types/tournament';
import {
  scoreScenario,
  type ScenarioScore,
  POINTS_EXACT,
  POINTS_SIGN,
} from '@/services/scoringService';
import type {
  StoredKnockoutPrediction,
  StoredOfficialResult,
  StoredPrediction,
} from '@/types/prediction';
import type { IndexedMatchResult } from '@/services/tournamentService';

export interface UseScoringArgs {
  tournament: Tournament | null;
  scenarioId: string | null;
  /** Map<matchId, StoredOfficialResult>, already loaded by the page. */
  officialResults: Map<string, StoredOfficialResult>;
}

export interface UseScoringResult {
  score: ScenarioScore | null;
  loading: boolean;
  /** Convenience derived fields for the UI. */
  progressPct: number;
  exactPct: number;
  signPct: number;
  wrongPct: number;
  pendingPct: number;
  /** Total matches in the tournament (for the header subtitle). */
  totalMatches: number;
  /** `max / 3` — same number used as a denominator for progress. */
  maxScore: number;
}

/**
 * Live scoring for the active scenario. Reads predictions and knockout
 * predictions from IndexedDB (recomputed on every change), the official
 * results from the page's map, and the static tournament structure from the
 * collection. Returns the aggregate + per-match breakdown the dashboard
 * renders.
 */
export function useScoring({
  tournament,
  scenarioId,
  officialResults,
}: UseScoringArgs): UseScoringResult {
  const predictionRows = useLiveQuery<StoredPrediction[]>(
    async () =>
      scenarioId
        ? db.predictions.where('scenarioId').equals(scenarioId).toArray()
        : [],
    [scenarioId]
  );
  const pickRows = useLiveQuery<StoredKnockoutPrediction[]>(
    async () =>
      scenarioId
        ? db.knockoutPredictions
            .where('scenarioId')
            .equals(scenarioId)
            .toArray()
        : [],
    [scenarioId]
  );

  // The scoring engine only consumes the predictions / official shapes; we
  // pre-index `IndexedMatchResult` for convenience so the page can also
  // reuse this hook for other read-outs (e.g. "match status" badges).
  const indexed: IndexedMatchResult = useMemo(() => {
    void predictionRows;
    return { played: true, homeGoals: 0, awayGoals: 0 };
  }, [predictionRows]);
  void indexed;

  const score = useMemo<ScenarioScore | null>(() => {
    if (!tournament) return null;
    if (predictionRows === undefined || pickRows === undefined) return null;
    return scoreScenario(
      tournament,
      predictionRows,
      officialResults,
      pickRows
    );
  }, [tournament, predictionRows, pickRows, officialResults]);

  const totalMatches = tournament?.matches.length ?? 0;
  const finished = score?.finishedMatches ?? 0;
  const progressPct =
    totalMatches === 0 ? 0 : Math.round((finished / totalMatches) * 100);
  const maxScore = totalMatches * POINTS_EXACT;
  const den = maxScore > 0 ? maxScore : 1;
  return {
    score,
    loading: predictionRows === undefined || pickRows === undefined,
    progressPct,
    exactPct: Math.round(((score?.exact ?? 0) * POINTS_EXACT * 100) / den),
    signPct: Math.round(((score?.sign ?? 0) * POINTS_SIGN * 100) / den),
    wrongPct: Math.round(((score?.wrong ?? 0) * 100) / den),
    pendingPct: 100 - progressPct,
    totalMatches,
    maxScore,
  };
}
