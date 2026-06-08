import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BracketResolver,
  IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { MatchStage, TournamentMatch } from '@/types/tournament';
import { KnockoutMatchRow } from './KnockoutMatchRow';

interface BracketViewProps {
  matches: TournamentMatch[];
  resolver: BracketResolver;
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  scenarioId: string;
}

/** Knockout stages in bracket order. `group` is excluded. */
const KNOCKOUT_STAGES: MatchStage[] = [
  'r32',
  'r16',
  'qf',
  'sf',
  'third',
  'final',
];

/**
 * Knockout bracket as a vertical list of rounds. Each side of every match is
 * resolved live from standings + earlier results via the bracket resolver, so
 * scoring a match instantly populates the next round.
 */
export function BracketView({
  matches,
  resolver,
  teamsById,
  results,
  scenarioId,
}: BracketViewProps) {
  const { t } = useTranslation();

  const byStage = useMemo(() => {
    const map = new Map<MatchStage, TournamentMatch[]>();
    for (const stage of KNOCKOUT_STAGES) {
      const list = matches
        .filter((m) => m.stage === stage)
        .sort((a, b) => a.matchNumber - b.matchNumber);
      if (list.length) map.set(stage, list);
    }
    return map;
  }, [matches]);

  return (
    <div className="flex flex-col gap-4">
      {KNOCKOUT_STAGES.map((stage) => {
        const list = byStage.get(stage);
        if (!list) return null;
        return (
          <section key={stage} className="card flex flex-col gap-1 p-4">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">
              {t(`tournament.stage.${stage}`)}
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((m) => {
                const { homeTeamId, awayTeamId } = resolver.resolveMatch(m);
                return (
                  <KnockoutMatchRow
                    key={m.id}
                    scenarioId={scenarioId}
                    matchId={m.id}
                    home={homeTeamId ? teamsById.get(homeTeamId) : undefined}
                    away={awayTeamId ? teamsById.get(awayTeamId) : undefined}
                    homeLabel={m.homeSlot}
                    awayLabel={m.awaySlot}
                    result={results.get(m.id)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
