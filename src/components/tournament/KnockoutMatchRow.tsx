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

/**
 * M3 text field for short numeric input (goals).
 * Matches `MatchScoreRow` so both group and knockout score inputs feel
 * identical across the app.
 */
const goalInputCls =
  'h-9 w-10 rounded-md border border-outline-variant bg-transparent text-center ' +
  'text-body-md font-bold tabular-nums text-on-surface ' +
  'transition-colors duration-motion-short2 ease-standard ' +
  'hover:border-outline focus:border-primary focus:outline-none ' +
  'focus:ring-2 focus:ring-primary/40 disabled:opacity-40';

/**
 * M3 chip-style input for the penalty shootout (tertiary palette).
 * Uses the M3 tertiary-container (amber-100 light / amber-900-tinted dark)
 * to clearly mark these as a "highlighted" secondary score channel.
 */
const penInputCls =
  'h-7 w-8 rounded border border-tertiary/40 bg-tertiary-container ' +
  'text-center text-label-md font-semibold tabular-nums ' +
  'text-on-tertiary-container ' +
  'transition-colors duration-motion-short2 ease-standard ' +
  'hover:border-tertiary focus:border-tertiary focus:outline-none ' +
  'focus:ring-2 focus:ring-tertiary/40';

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
            className={`truncate text-body-md ${
              isWinner
                ? 'font-bold text-on-surface'
                : 'font-medium text-on-surface-variant'
            }`}
          >
            {team.name}
          </span>
        </>
      ) : (
        <span className="truncate text-body-md italic text-on-surface-variant">
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
            className={goalInputCls}
          />
          <span className="text-on-surface-variant">-</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${away?.name ?? awayLabel ?? 'away'} goals`}
            disabled={!editable}
            value={awayGoals}
            onChange={(e) => commit({ awayGoals: parse(e.target.value) })}
            className={goalInputCls}
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
        <div
          className="mt-1 flex items-center justify-center gap-1.5 rounded-md
          bg-tertiary-container/60 px-2 py-1
          text-on-tertiary-container"
        >
          <span className="text-label-sm font-semibold uppercase tracking-wide">
            {t('tournament.pens')}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${home?.name ?? 'home'} penalties`}
            value={homePens}
            onChange={(e) => commit({ homePens: parse(e.target.value) })}
            className={penInputCls}
          />
          <span className="text-on-tertiary-container/70">-</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${away?.name ?? 'away'} penalties`}
            value={awayPens}
            onChange={(e) => commit({ awayPens: parse(e.target.value) })}
            className={penInputCls}
          />
        </div>
      ) : null}
    </div>
  );
}
