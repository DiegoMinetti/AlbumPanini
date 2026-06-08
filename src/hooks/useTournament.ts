import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useScenarioStore } from '@/stores/scenarioStore';
import { ensureOfficialScenario } from '@/services/scenarioService';
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
import type {
  StoredKnockoutPick,
  StoredMatchResult,
  StoredScenario,
} from '@/types/scenario';

export interface TournamentData {
  tournament: Tournament | null;
  scenarios: StoredScenario[];
  activeScenarioId: string | null;
  activeScenario: StoredScenario | null;
  results: Map<string, IndexedMatchResult>;
  picks: Map<string, string>;
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
    [collectionId],
  );
  const tournament = collection?.tournament ?? null;

  const scenarios = useLiveQuery<StoredScenario[]>(
    async () =>
      collectionId
        ? db.scenarios.where('collectionId').equals(collectionId).toArray()
        : [],
    [collectionId],
  );

  // Ensure the official scenario exists as soon as a tournament is present.
  useEffect(() => {
    if (collectionId && tournament) {
      void ensureOfficialScenario(collectionId);
    }
  }, [collectionId, tournament]);

  const storedActiveId = useScenarioStore((s) =>
    collectionId ? s.activeByCollection[collectionId] : undefined,
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

  const resultRows = useLiveQuery<StoredMatchResult[]>(
    async () =>
      activeScenarioId
        ? db.matchResults.where('scenarioId').equals(activeScenarioId).toArray()
        : [],
    [activeScenarioId],
  );
  const pickRows = useLiveQuery<StoredKnockoutPick[]>(
    async () =>
      activeScenarioId
        ? db.knockoutPicks.where('scenarioId').equals(activeScenarioId).toArray()
        : [],
    [activeScenarioId],
  );

  const results = useMemo(
    () => indexResults(resultRows ?? []),
    [resultRows],
  );
  const picks = useMemo(() => indexPicks(pickRows ?? []), [pickRows]);

  const standings = useMemo(() => {
    if (!tournament) return EMPTY_STANDINGS;
    return computeAllStandings(
      tournament.groups,
      tournament.matches,
      results,
      tournament.qualifiers.bestThirds,
    );
  }, [tournament, results]);

  const resolver = useMemo(() => {
    if (!tournament) return null;
    return createBracketResolver(
      tournament.matches,
      standings,
      results,
      picks,
    );
  }, [tournament, standings, results, picks]);

  return {
    tournament,
    scenarios: sortedScenarios,
    activeScenarioId,
    activeScenario,
    results,
    picks,
    standings: tournament ? standings : null,
    resolver,
    loading:
      collection === undefined ||
      scenarios === undefined ||
      (activeScenarioId !== null &&
        (resultRows === undefined || pickRows === undefined)),
  };
}
