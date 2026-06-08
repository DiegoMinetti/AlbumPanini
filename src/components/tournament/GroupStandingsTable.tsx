import { useTranslation } from 'react-i18next';
import type { StandingRow } from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';

interface GroupStandingsTableProps {
  standings: StandingRow[];
  teamsById: Map<string, StoredTeam>;
  /** How many top positions auto-qualify (e.g. 2). */
  perGroup: number;
  /** Team ids qualified as one of the best third-placed teams. */
  qualifiedThirds: Set<string>;
}

/**
 * Standings table for a single group. Rows are pre-sorted by the tournament
 * service. Qualifying positions get a colored marker on the left: solid for the
 * top `perGroup`, dashed for a third place that made the best-thirds cut.
 */
export function GroupStandingsTable({
  standings,
  teamsById,
  perGroup,
  qualifiedThirds,
}: GroupStandingsTableProps) {
  const { t } = useTranslation();

  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-slate-400">
          <th className="w-6 py-1 text-left font-medium">#</th>
          <th className="py-1 text-left font-medium">{t('tournament.team')}</th>
          <th className="w-7 py-1 text-center font-medium">
            {t('tournament.col.played')}
          </th>
          <th className="w-7 py-1 text-center font-medium">
            {t('tournament.col.won')}
          </th>
          <th className="w-7 py-1 text-center font-medium">
            {t('tournament.col.drawn')}
          </th>
          <th className="w-7 py-1 text-center font-medium">
            {t('tournament.col.lost')}
          </th>
          <th className="w-8 py-1 text-center font-medium">
            {t('tournament.col.goalDiff')}
          </th>
          <th className="w-8 py-1 text-center font-bold text-slate-500 dark:text-slate-300">
            {t('tournament.col.points')}
          </th>
        </tr>
      </thead>
      <tbody>
        {standings.map((row) => {
          const team = teamsById.get(row.teamId);
          const auto = row.rank <= perGroup;
          const thirdIn = !auto && qualifiedThirds.has(row.teamId);
          const marker = auto
            ? 'border-l-2 border-emerald-500'
            : thirdIn
              ? 'border-l-2 border-dashed border-amber-500'
              : 'border-l-2 border-transparent';
          return (
            <tr
              key={row.teamId}
              className={`${marker} border-b border-slate-100 last:border-0 dark:border-slate-800`}
            >
              <td className="py-1.5 pl-1 text-left text-slate-400">
                {row.rank}
              </td>
              <td className="py-1.5">
                <span className="flex items-center gap-1.5">
                  {team?.flag ? (
                    <span className="text-base leading-none">{team.flag}</span>
                  ) : null}
                  <span className="truncate font-medium">
                    {team?.name ?? row.teamId}
                  </span>
                </span>
              </td>
              <td className="py-1.5 text-center text-slate-500">
                {row.played}
              </td>
              <td className="py-1.5 text-center text-slate-500">{row.won}</td>
              <td className="py-1.5 text-center text-slate-500">{row.drawn}</td>
              <td className="py-1.5 text-center text-slate-500">{row.lost}</td>
              <td className="py-1.5 text-center text-slate-500">
                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
              </td>
              <td className="py-1.5 text-center font-bold">{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
