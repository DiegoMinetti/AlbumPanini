import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useScenarioStore } from '@/stores/scenarioStore';
import { ensureOfficialScenario } from '@/services/scenarioService';
import { autoFillOfficialScenarios } from '@/services/officialAutoFillService';
import {
  computeAllStandings,
  createBracketResolver,
  indexPicks,
  indexResults,
  type IndexedMatchResult,
  type AllStandings,
  type BracketResolver,
} from '@/services/tournamentService';
import type { Tournament } from '@/types/tournament';
import type { StoredScenario } from '@/types/scenario';
import type {
  StoredKnockoutPrediction,
  StoredOfficialResult,
  StoredPrediction,
} from '@/types/prediction';
import { useOfficialResults } from './useOfficialResults';

export interface TournamentData {
  tournament: Tournament | null;
  scenarios: StoredScenario[];
  activeScenarioId: string | null;
  activeScenario: StoredScenario | null;
  /** True when the active scenario is the auto-filled "Oficial" one. */
  isOfficialScenario: boolean;
  results: Map<string, IndexedMatchResult>;
  picks: Map<string, string>;
  /** FIFA-official finished matches, keyed by matchId. Empty until the sync
   *  JSON is fetched and persisted. */
  officialResults: Map<string, StoredOfficialResult>;
  /** When the last successful official-results sync happened. */
  officialSyncedAt: string | null;
  /** True while a user-triggered official-results refresh is in flight. */
  officialRefreshing: boolean;
  /** Manually re-fetch the official results from the network. */
  refreshOfficial: () => Promise<number>;
  standings: AllStandings | null;
  resolver: BracketResolver | null;
  loading: boolean;
}

const EMPTY_STANDINGS: AllStandings = {
  byGroup: new Map(),
  bestThirds: [],
};

/**
 * Live, reactive view of a collection's tournament: its static structure, the
 * list of scenarios, the active scenario's results/picks, and the derived
 * standings + bracket resolver. Auto-creates the official scenario and keeps a
 * valid active scenario selected. Everything recomputes when the underlying DB
 * rows change.
 */
export function useTournament(collectionId: string | null): TournamentData {
  const collection = useLiveQuery(
    async () => (collectionId ? db.collections.get(collectionId) : undefined),
    [collectionId]
  );
  const tournament = collection?.tournament ?? null;

  const scenarios = useLiveQuery<StoredScenario[]>(
    async () =>
      collectionId
        ? db.scenarios.where('collectionId').equals(collectionId).toArray()
        : [],
    [collectionId]
  );

  // Ensure the official scenario exists as soon as a tournament is present.
  useEffect(() => {
    if (collectionId && tournament) {
      void (async () => {
        await ensureOfficialScenario(collectionId);
        try {
          await autoFillOfficialScenarios(await db.officialResults.toArray());
        } catch (err) {
          console.warn('[useTournament] auto-fill after ensure failed', err);
        }
      })();
    }
  }, [collectionId, tournament]);

  const storedActiveId = useScenarioStore((s) =>
    collectionId ? s.activeByCollection[collectionId] : undefined
  );
  const setActiveScenario = useScenarioStore((s) => s.setActiveScenario);

  const sortedScenarios = useMemo(() => {
    const rows = scenarios ?? [];
    return [...rows].sort((a, b) => {
      if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }, [scenarios]);

  // Resolve the active scenario: stored choice if still valid, else official.
  const activeScenario = useMemo(() => {
    if (!sortedScenarios.length) return null;
    return (
      sortedScenarios.find((s) => s.id === storedActiveId) ??
      sortedScenarios.find((s) => s.isOfficial) ??
      sortedScenarios[0]
    );
  }, [sortedScenarios, storedActiveId]);

  const activeScenarioId = activeScenario?.id ?? null;
  const isOfficialScenario = !!activeScenario?.isOfficial;

  // Self-heal the persisted selection if it points at a missing scenario.
  useEffect(() => {
    if (
      collectionId &&
      activeScenarioId &&
      storedActiveId !== activeScenarioId
    ) {
      setActiveScenario(collectionId, activeScenarioId);
    }
  }, [collectionId, activeScenarioId, storedActiveId, setActiveScenario]);

  const resultRows = useLiveQuery<StoredPrediction[]>(
    async () =>
      activeScenarioId
        ? db.predictions.where('scenarioId').equals(activeScenarioId).toArray()
        : [],
    [activeScenarioId]
  );
  const pickRows = useLiveQuery<StoredKnockoutPrediction[]>(
    async () =>
      activeScenarioId
        ? db.knockoutPredictions
            .where('scenarioId')
            .equals(activeScenarioId)
            .toArray()
        : [],
    [activeScenarioId]
  );

  // FIFA official results, fetched on mount. Shared via useOfficialResults
  // so multiple pages that need them (Tournament, future PR4 dashboard) hit
  // the cache instead of re-downloading.
  const {
    byMatchId: officialByMatchId,
    syncedAt: officialSyncedAt,
    loading: loadingOfficial,
    refreshing: officialRefreshing,
    refresh: refreshOfficial,
  } = useOfficialResults();

  const results = useMemo(() => indexResults(resultRows ?? []), [resultRows]);
  const picks = useMemo(() => indexPicks(pickRows ?? []), [pickRows]);

  const standings = useMemo(() => {
    if (!tournament) return EMPTY_STANDINGS;
    return computeAllStandings(
      tournament.groups,
      tournament.matches,
      results,
      tournament.qualifiers.bestThirds
    );
  }, [tournament, results]);

  const resolver = useMemo(() => {
    if (!tournament) return null;
    return createBracketResolver(tournament.matches, standings, results, picks);
  }, [tournament, standings, results, picks]);

  return {
    tournament,
    scenarios: sortedScenarios,
    activeScenarioId,
    activeScenario,
    isOfficialScenario,
    results,
    picks,
    officialResults: officialByMatchId,
    officialSyncedAt,
    officialRefreshing,
    refreshOfficial,
    standings: tournament ? standings : null,
    resolver,
    loading:
      collection === undefined ||
      scenarios === undefined ||
      loadingOfficial ||
      (activeScenarioId !== null &&
        (resultRows === undefined || pickRows === undefined)),
  };
}
