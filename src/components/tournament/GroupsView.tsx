import { useTranslation } from 'react-i18next';
import type {
  AllStandings,
  IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { Tournament } from '@/types/tournament';
import { GroupCard } from './GroupCard';

interface GroupsViewProps {
  tournament: Tournament;
  standings: AllStandings;
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  scenarioId: string;
}

/** All groups stacked, each with its standings and (collapsible) fixtures. */
export function GroupsView({
  tournament,
  standings,
  teamsById,
  results,
  scenarioId,
}: GroupsViewProps) {
  const { t } = useTranslation();
  const qualifiedThirds = new Set(standings.bestThirds);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-2 border-l-2 border-emerald-500" />
          {t('tournament.legend.qualify')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-2 border-l-2 border-dashed border-amber-500" />
          {t('tournament.legend.bestThird')}
        </span>
      </div>

      {tournament.groups.map((group) => (
        <GroupCard
          key={group.id}
          group={group}
          matches={tournament.matches}
          standings={standings.byGroup.get(group.id) ?? []}
          teamsById={teamsById}
          results={results}
          perGroup={tournament.qualifiers.perGroup}
          qualifiedThirds={qualifiedThirds}
          scenarioId={scenarioId}
        />
      ))}
    </div>
  );
}
