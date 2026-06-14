import { useTranslation } from 'react-i18next';
import type {
  AllStandings,
  IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { Tournament } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';
import { GroupCard } from './GroupCard';

interface GroupsViewProps {
  tournament: Tournament;
  standings: AllStandings;
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  officialResults: Map<string, StoredOfficialResult>;
  scenarioId: string;
}

/**
 * All groups stacked, each with its standings and (collapsible) fixtures.
 *
 * M3 styling: M3 outline tokens for the qualify/best-third markers
 * (secondary for auto-qualify, tertiary for best-thirds), on-surface-variant
 * for the legend text.
 */
export function GroupsView({
  tournament,
  standings,
  teamsById,
  results,
  officialResults,
  scenarioId,
}: GroupsViewProps) {
  const { t } = useTranslation();
  const qualifiedThirds = new Set(standings.bestThirds);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-label-sm text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-2 border-l-2 border-secondary" />
          {t('tournament.legend.qualify')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-2 border-l-2 border-dashed border-tertiary" />
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
          officialResults={officialResults}
          perGroup={tournament.qualifiers.perGroup}
          qualifiedThirds={qualifiedThirds}
          scenarioId={scenarioId}
        />
      ))}
    </div>
  );
}
