import { useTranslation } from 'react-i18next';
import {
  setPrediction,
  PredictionLockedError,
} from '@/services/predictionService';
import {
  winnerOf,
  type IndexedMatchResult,
} from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { TournamentMatch } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';
import { isLockedForPrediction, isPredictionCorrect } from '@/utils/prediction';

interface KnockoutMatchRowProps {
  match: TournamentMatch;
  scenarioId: string;
  /** Resolved teams; undefined while the feeding match/slot is undecided. */
  home?: StoredTeam;
  away?: StoredTeam;
  /** Symbolic slot label shown when a side is not yet resolved (e.g. "W73"). */
  homeLabel?: string;
  awayLabel?: string;
  result?: IndexedMatchResult;
  official?: StoredOfficialResult;
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
 * later rounds) is always well-defined. Writes to the v3+ `predictions` table
 * (post-v3) via `setPrediction`, which also enforces the kickoff lock.
 */
export function KnockoutMatchRow({
  match,
  scenarioId,
  home,
  away,
  homeLabel,
  awayLabel,
  result,
  official,
}: KnockoutMatchRowProps) {
  const { t } = useTranslation();
  const teamsResolved = !!home && !!away;
  const locked = isLockedForPrediction(match);
  const editable = teamsResolved && !locked;
  const played = result?.played ?? false;

  const homeGoals = played ? result!.homeGoals : '';
  const awayGoals = played ? result!.awayGoals : '';
  const homePens = result?.homePens ?? '';
  const awayPens = result?.awayPens ?? '';

  const drawn = played && result!.homeGoals === result!.awayGoals;

  const { winner } = winnerOf(home?.id, away?.id, result);

  const parse = (v: string): number | null =>
    v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));

  const safeSetPrediction = (next: {
    homeGoals?: number | null;
    awayGoals?: number | null;
    homePens?: number | null;
    awayPens?: number | null;
  }) => {
    try {
      void setPrediction(scenarioId, match, {
        homeGoals: next.homeGoals ?? (played ? result!.homeGoals : null),
        awayGoals: next.awayGoals ?? (played ? result!.awayGoals : null),
        homePens: next.homePens ?? result?.homePens ?? null,
        awayPens: next.awayPens ?? result?.awayPens ?? null,
      });
    } catch (err) {
      if (err instanceof PredictionLockedError) {
        console.warn(`[prediction] rejected edit on ${err.matchId}: locked`);
      } else {
        throw err;
      }
    }
  };

  const verdict = isPredictionCorrect(
    result?.played
      ? {
          homeGoals: result.homeGoals,
          awayGoals: result.awayGoals,
          homePens: result.homePens,
          awayPens: result.awayPens,
          played: true,
        }
      : undefined,
    official
  );

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
            onChange={(e) =>
              safeSetPrediction({ homeGoals: parse(e.target.value) })
            }
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
            onChange={(e) =>
              safeSetPrediction({ awayGoals: parse(e.target.value) })
            }
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
            onChange={(e) =>
              safeSetPrediction({ homePens: parse(e.target.value) })
            }
            className={penInputCls}
          />
          <span className="text-on-tertiary-container/70">-</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${away?.name ?? 'away'} penalties`}
            value={awayPens}
            onChange={(e) =>
              safeSetPrediction({ awayPens: parse(e.target.value) })
            }
            className={penInputCls}
          />
        </div>
      ) : null}

      {official && official.status !== 'SCHEDULED' ? (
        <div className="flex items-center justify-end gap-1.5 text-label-sm text-on-surface-variant">
          <span className="uppercase tracking-wide">
            {t('tournament.official')}
          </span>
          <span className="tabular-nums font-semibold text-on-surface">
            {official.homeGoals}-{official.awayGoals}
            {official.status === 'PEN' &&
            official.homePens != null &&
            official.awayPens != null
              ? ` (${official.homePens}-${official.awayPens} pen)`
              : ''}
          </span>
          <VerdictChip verdict={verdict} />
        </div>
      ) : null}

      {locked && !official ? (
        <div className="text-right text-label-sm italic text-on-surface-variant">
          {t('tournament.locked')}
        </div>
      ) : null}
    </div>
  );
}

function VerdictChip({
  verdict,
}: {
  verdict: ReturnType<typeof isPredictionCorrect>;
}) {
  const { t } = useTranslation();
  const map = {
    exact: {
      label: t('tournament.verdict.exact'),
      cls: 'bg-primary/15 text-primary',
    },
    sign: {
      label: t('tournament.verdict.sign'),
      cls: 'bg-secondary/15 text-secondary',
    },
    wrong: {
      label: t('tournament.verdict.wrong'),
      cls: 'bg-error/15 text-error',
    },
    pending: {
      label: t('tournament.verdict.pending'),
      cls: 'bg-outline-variant/30 text-on-surface-variant',
    },
    'official-missing': { label: '', cls: '' },
  } as const;
  const v = map[verdict];
  if (verdict === 'official-missing') return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold ${v.cls}`}
    >
      {v.label}
    </span>
  );
}
