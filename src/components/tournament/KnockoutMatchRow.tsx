import { useTranslation } from 'react-i18next';
import { setScore } from '@/services/scenarioService';
import {
  winnerOf,
  type IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';

interface KnockoutMatchRowProps {
  scenarioId: string;
  matchId: string;
  /** Resolved teams; undefined while the feeding match/slot is undecided. */
  home?: StoredTeam;
  away?: StoredTeam;
  /** Symbolic slot label shown when a side is not yet resolved (e.g. "W73"). */
  homeLabel?: string;
  awayLabel?: string;
  result?: IndexedMatchResult;
}

function TeamSide({
  team,
  label,
  isWinner,
  align,
}: {
  team?: StoredTeam;
  label?: string;
  isWinner: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-1.5 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      {team ? (
        <>
          {team.flag ? (
            <span className="text-lg leading-none">{team.flag}</span>
          ) : null}
          <span
            className={`truncate text-sm ${
              isWinner ? 'font-bold' : 'font-medium'
            }`}
          >
            {team.name}
          </span>
        </>
      ) : (
        <span className="truncate text-sm italic text-slate-400">
          {label ?? '—'}
        </span>
      )}
    </div>
  );
}

/**
 * A single knockout fixture. Adds penalty shoot-out inputs that appear whenever
 * both teams are known and regulation ends level, so the winner (used to feed
 * later rounds) is always well-defined. Writes straight to the active scenario.
 */
export function KnockoutMatchRow({
  scenarioId,
  matchId,
  home,
  away,
  homeLabel,
  awayLabel,
  result,
}: KnockoutMatchRowProps) {
  const { t } = useTranslation();
  const editable = !!home && !!away;
  const played = result?.played ?? false;

  const homeGoals = played ? result!.homeGoals : '';
  const awayGoals = played ? result!.awayGoals : '';
  const homePens = result?.homePens ?? '';
  const awayPens = result?.awayPens ?? '';

  const drawn = played && result!.homeGoals === result!.awayGoals;

  const { winner } = winnerOf(home?.id, away?.id, result);

  const parse = (v: string): number | null =>
    v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));

  const commit = (next: {
    homeGoals?: number | null;
    awayGoals?: number | null;
    homePens?: number | null;
    awayPens?: number | null;
  }) =>
    void setScore(scenarioId, matchId, {
      homeGoals: next.homeGoals ?? (played ? result!.homeGoals : null),
      awayGoals: next.awayGoals ?? (played ? result!.awayGoals : null),
      homePens: next.homePens ?? result?.homePens ?? null,
      awayPens: next.awayPens ?? result?.awayPens ?? null,
    });

  const goalInput =
    'h-9 w-10 rounded-md border border-slate-300 bg-white text-center text-sm font-bold tabular-nums disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800';
  const penInput =
    'h-7 w-8 rounded border border-amber-300 bg-amber-50 text-center text-xs font-semibold tabular-nums dark:border-amber-700/60 dark:bg-amber-900/20';

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-2">
        <TeamSide
          team={home}
          label={homeLabel}
          isWinner={winner === home?.id}
          align="left"
        />
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${home?.name ?? homeLabel ?? 'home'} goals`}
            disabled={!editable}
            value={homeGoals}
            onChange={(e) => commit({ homeGoals: parse(e.target.value) })}
            className={goalInput}
          />
          <span className="text-slate-400">-</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${away?.name ?? awayLabel ?? 'away'} goals`}
            disabled={!editable}
            value={awayGoals}
            onChange={(e) => commit({ awayGoals: parse(e.target.value) })}
            className={goalInput}
          />
        </div>
        <TeamSide
          team={away}
          label={awayLabel}
          isWinner={winner === away?.id}
          align="right"
        />
      </div>

      {editable && drawn ? (
        <div className="flex items-center justify-center gap-1 text-amber-600 dark:text-amber-400">
          <span className="text-[10px] font-semibold uppercase">
            {t('tournament.pens')}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${home?.name ?? 'home'} penalties`}
            value={homePens}
            onChange={(e) => commit({ homePens: parse(e.target.value) })}
            className={penInput}
          />
          <span className="text-amber-400">-</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${away?.name ?? 'away'} penalties`}
            value={awayPens}
            onChange={(e) => commit({ awayPens: parse(e.target.value) })}
            className={penInput}
          />
        </div>
      ) : null}
    </div>
  );
}
