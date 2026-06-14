import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  setPrediction,
  PredictionLockedError,
} from '@/services/predictionService';
import type {
  IndexedMatchResult,
  StandingRow,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { TournamentGroup, TournamentMatch } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';
import { Icon } from '@/components/ui/Icon';
import { GroupStandingsTable } from './GroupStandingsTable';
import { MatchScoreRow } from './MatchScoreRow';

interface GroupCardProps {
  group: TournamentGroup;
  matches: TournamentMatch[];
  standings: StandingRow[];
  teamsById: Map<string, StoredTeam>;
  results: Map<string, IndexedMatchResult>;
  officialResults: Map<string, StoredOfficialResult>;
  perGroup: number;
  qualifiedThirds: Set<string>;
  scenarioId: string;
}

/**
 * One group panel: its standings table plus a collapsible list of the group's
 * fixtures with inline score editors. Editing a score writes to the active
 * scenario's `predictions` table (post-v3), which the live query upstream
 * turns straight back into standings.
 */
export function GroupCard({
  group,
  matches,
  standings,
  teamsById,
  results,
  officialResults,
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
        <h2 className="text-title-md font-bold text-on-surface">
          {t('tournament.group', { id: group.id })}
        </h2>
        <button
          type="button"
          className="has-state-layer relative inline-flex h-8 items-center gap-1
            overflow-hidden rounded-full px-2.5
            text-label-md font-semibold text-primary
            transition-colors duration-motion-short2 ease-standard
            hover:bg-primary-container/60
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon
            name="chevron_right"
            size={16}
            className={`text-primary transition-transform duration-motion-medium2 ease-emphasized ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span>
            {open ? t('tournament.hideMatches') : t('tournament.showMatches')}
          </span>
          <span aria-hidden className="state-layer" />
        </button>
      </header>

      <GroupStandingsTable
        standings={standings}
        teamsById={teamsById}
        perGroup={perGroup}
        qualifiedThirds={qualifiedThirds}
      />

      {open ? (
        <div className="mt-1 divide-y divide-outline-variant/40 border-t border-outline-variant/40">
          {groupMatches.map((m) => {
            const result = results.get(m.id);
            const official = officialResults.get(m.id);
            return (
              <MatchScoreRow
                key={m.id}
                match={m}
                home={m.homeTeamId ? teamsById.get(m.homeTeamId) : undefined}
                away={m.awayTeamId ? teamsById.get(m.awayTeamId) : undefined}
                result={result}
                official={official}
                onScore={(homeGoals, awayGoals) => {
                  try {
                    void setPrediction(scenarioId, m, { homeGoals, awayGoals });
                  } catch (err) {
                    // Locked matches can no longer be edited; we surface a
                    // console warning rather than a toast (per the spec, the
                    // inputs are disabled anyway — this is a belt + suspenders
                    // path in case the lock is bypassed via dev tools).
                    if (err instanceof PredictionLockedError) {
                      console.warn(
                        `[prediction] rejected edit on ${err.matchId}: locked`
                      );
                    } else {
                      throw err;
                    }
                  }
                }}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
