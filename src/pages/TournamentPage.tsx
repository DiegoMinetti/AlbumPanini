import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCollection } from '@/hooks';
import { useCollectionData } from '@/hooks/useCollectionData';
import { useTournament } from '@/hooks/useTournament';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spinner } from '@/components/feedback/Spinner';
import { EmptyState } from '@/components/feedback/EmptyState';
import { NoActiveCollection } from '@/components/collections/NoActiveCollection';
import { ScenarioBar } from '@/components/tournament/ScenarioBar';
import { GroupsView } from '@/components/tournament/GroupsView';
import { BracketView } from '@/components/tournament/BracketView';
import { DashboardView } from '@/components/tournament/DashboardView';

type Tab = 'groups' | 'bracket' | 'dashboard';

/**
 * Tournament — usa SegmentedControl M3 (indicator animado) para alternar
 * entre vista de grupos, eliminatorias, y el dashboard "Mi predicción vs
 * FIFA" con scoring en vivo.
 */
export function TournamentPage() {
  const { t } = useTranslation();
  const { active, loading: loadingActive } = useActiveCollection();
  const { teams, loading: loadingTeams } = useCollectionData(
    active?.id ?? null
  );
  const {
    tournament,
    scenarios,
    activeScenario,
    activeScenarioId,
    standings,
    resolver,
    results,
    officialResults,
    loading: loadingTournament,
  } = useTournament(active?.id ?? null);

  const [tab, setTab] = useState<Tab>('groups');

  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams]
  );

  if (loadingActive) return <Spinner />;
  if (!active) return <NoActiveCollection />;
  if (loadingTeams || loadingTournament) return <Spinner />;
  if (!tournament || !standings || !resolver) {
    return <EmptyState icon="🏆" title={t('tournament.noTournament')} />;
  }
  if (!activeScenarioId || !activeScenario) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <ScenarioBar
        collectionId={active.id}
        scenarios={scenarios}
        activeScenario={activeScenario}
      />

      <SegmentedControl<Tab>
        ariaLabel={t('tournament.title')}
        options={[
          { value: 'groups', label: t('tournament.groups') },
          { value: 'bracket', label: t('tournament.bracket') },
          { value: 'dashboard', label: t('tournament.dashboard') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'groups' ? (
        <GroupsView
          tournament={tournament}
          standings={standings}
          teamsById={teamsById}
          results={results}
          officialResults={officialResults}
          scenarioId={activeScenarioId}
        />
      ) : tab === 'bracket' ? (
        <BracketView
          matches={tournament.matches}
          resolver={resolver}
          teamsById={teamsById}
          results={results}
          officialResults={officialResults}
          scenarioId={activeScenarioId}
        />
      ) : (
        <DashboardView
          tournament={tournament}
          scenarioId={activeScenarioId}
          officialResults={officialResults}
        />
      )}
    </div>
  );
}
