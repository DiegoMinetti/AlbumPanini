import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setScore } from '@/services/scenarioService';
import type {
  IndexedMatchResult,
  StandingRow,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { TournamentGroup, TournamentMatch } from '@/types/tournament';
import { GroupStandingsTable } from './GroupStandingsTable';
import { MatchScoreRow } from './MatchScoreRow';

interface GroupCardProps {
  group: TournamentGroup;
  matches: TournamentMatch[];
  standings: StandingRow[];
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  perGroup: number;
  qualifiedThirds: Set<string>;
  scenarioId: string;
}

/**
 * One group panel: its standings table plus a collapsible list of the group's
 * fixtures with inline score editors. Editing a score writes to the active
 * scenario, which the live query upstream turns straight back into standings.
 */
export function GroupCard({
  group,
  matches,
  standings,
  teamsById,
  results,
  perGroup,
  qualifiedThirds,
  scenarioId,
}: GroupCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const groupMatches = useMemo(
    () =>
      matches
        .filter((m) => m.stage === 'group' && m.group === group.id)
        .sort((a, b) => a.matchNumber - b.matchNumber),
    [matches, group.id]
  );

  return (
    <section className="card flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-bold">
          {t('tournament.group', { id: group.id })}
        </h2>
        <button
          type="button"
          className="text-xs font-semibold text-brand-600 dark:text-brand-400"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t('tournament.hideMatches') : t('tournament.showMatches')}
        </button>
      </header>

      <GroupStandingsTable
        standings={standings}
        teamsById={teamsById}
        perGroup={perGroup}
        qualifiedThirds={qualifiedThirds}
      />

      {open ? (
        <div className="mt-1 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {groupMatches.map((m) => {
            const result = results.get(m.id);
            return (
              <MatchScoreRow
                key={m.id}
                home={m.homeTeamId ? teamsById.get(m.homeTeamId) : undefined}
                away={m.awayTeamId ? teamsById.get(m.awayTeamId) : undefined}
                result={result}
                onScore={(homeGoals, awayGoals) =>
                  void setScore(scenarioId, m.id, { homeGoals, awayGoals })
                }
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
