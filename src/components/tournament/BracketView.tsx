import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BracketResolver,
  IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { MatchStage, TournamentMatch } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';
import { KnockoutMatchRow } from './KnockoutMatchRow';

interface BracketViewProps {
  matches: TournamentMatch[];
  resolver: BracketResolver;
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  officialResults: Map<string, StoredOfficialResult>;
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
 *
 * M3 styling: `.card` token (surface-container-low + elev-1), M3 outline-variant
 * dividers, primary token for the stage title.
 */
export function BracketView({
  matches,
  resolver,
  teamsById,
  results,
  officialResults,
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
            <h2
              className="mb-1 text-label-md font-bold uppercase
              tracking-wide text-primary"
            >
              {t(`tournament.stage.${stage}`)}
            </h2>
            <div className="divide-y divide-outline-variant/40">
              {list.map((m) => {
                const { homeTeamId, awayTeamId } = resolver.resolveMatch(m);
                return (
                  <KnockoutMatchRow
                    key={m.id}
                    match={m}
                    scenarioId={scenarioId}
                    home={homeTeamId ? teamsById.get(homeTeamId) : undefined}
                    away={awayTeamId ? teamsById.get(awayTeamId) : undefined}
                    homeLabel={m.homeSlot}
                    awayLabel={m.awaySlot}
                    result={results.get(m.id)}
                    official={officialResults.get(m.id)}
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
