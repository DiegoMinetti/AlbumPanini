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
import { MatchesView } from '@/components/tournament/MatchesView';
import { DashboardView } from '@/components/tournament/DashboardView';

type Tab = 'groups' | 'bracket' | 'matches' | 'dashboard';

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
    isOfficialScenario,
    standings,
    resolver,
    results,
    officialResults,
    officialRefreshing,
    refreshOfficial,
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

      <div
        data-testid="tournament-tabs-bar"
        className="sticky top-[var(--app-topbar-h,0px)] z-20 -mx-3
          bg-surface/85 px-3 py-1.5 backdrop-blur
          supports-[backdrop-filter]:bg-surface/65"
      >
        <SegmentedControl<Tab>
          ariaLabel={t('tournament.title')}
          options={[
            { value: 'groups', label: t('tournament.groups') },
            { value: 'bracket', label: t('tournament.bracket') },
            { value: 'matches', label: t('tournament.matches') },
            { value: 'dashboard', label: t('tournament.dashboard') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'groups' ? (
        <GroupsView
          tournament={tournament}
          standings={standings}
          teamsById={teamsById}
          results={results}
          officialResults={officialResults}
          scenarioId={activeScenarioId}
          isOfficialScenario={isOfficialScenario}
        />
      ) : tab === 'bracket' ? (
        <BracketView
          matches={tournament.matches}
          resolver={resolver}
          teamsById={teamsById}
          results={results}
          officialResults={officialResults}
          scenarioId={activeScenarioId}
          isOfficialScenario={isOfficialScenario}
        />
      ) : tab === 'matches' ? (
        <MatchesView
          matches={tournament.matches}
          resolver={resolver}
          teamsById={teamsById}
          results={results}
          officialResults={officialResults}
          scenarioId={activeScenarioId}
          isOfficialScenario={isOfficialScenario}
          officialRefreshing={officialRefreshing}
          refreshOfficial={refreshOfficial}
        />
      ) : (
        <DashboardView
          tournament={tournament}
          scenarioId={activeScenarioId}
          isOfficialScenario={isOfficialScenario}
          officialResults={officialResults}
        />
      )}
    </div>
  );
}
