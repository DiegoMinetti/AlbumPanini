import type { IndexedMatchResult } from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';
import type { TournamentMatch } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';
import { useTranslation } from 'react-i18next';
import { isLockedForPrediction, isPredictionCorrect } from '@/utils/prediction';

interface MatchScoreRowProps {
  /** The full match object — we need `kickoff` to enforce the lock. */
  match: TournamentMatch;
  /** Resolved teams (may be undefined for unresolved knockout slots). */
  home?: StoredTeam;
  away?: StoredTeam;
  /** Fallback labels shown when a team is not yet resolved (e.g. "1A"). */
  homeLabel?: string;
  awayLabel?: string;
  result?: IndexedMatchResult;
  /** FIFA-official result for this match (if already finished). */
  official?: StoredOfficialResult;
  onScore: (homeGoals: number | null, awayGoals: number | null) => void;
}

/**
 * M3 text field variant for short numeric inputs (score).
 * Transparent fill, M3 outline, on-surface text, focus ring inherits from
 * the global M3 focus-visible styles in index.css.
 */
const scoreInputCls =
  'h-9 w-10 rounded-md border border-outline-variant bg-transparent text-center ' +
  'text-body-md font-bold tabular-nums text-on-surface ' +
  'transition-colors duration-motion-short2 ease-standard ' +
  'hover:border-outline focus:border-primary focus:outline-none ' +
  'focus:ring-2 focus:ring-primary/40 disabled:opacity-40';

function TeamSide({
  team,
  label,
  align,
}: {
  team?: StoredTeam;
  label?: string;
  align: 'left' | 'right';
}) {
  const content = team ? (
    <>
      {team.flag ? (
        <span className="text-lg leading-none">{team.flag}</span>
      ) : null}
      <span className="truncate text-body-md font-medium text-on-surface">
        {team.name}
      </span>
    </>
  ) : (
    <span className="truncate text-body-md italic text-on-surface-variant">
      {label ?? '—'}
    </span>
  );
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-1.5 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      {content}
    </div>
  );
}

/**
 * One fixture row: two teams (or slot placeholders) with editable goal inputs.
 * Inputs are disabled when:
 *  - either team is unresolved (e.g. bracket slot still open), or
 *  - the match kickoff is in the past (predictions are locked).
 *
 * If a FIFA-official result is available, we render it side-by-side with the
 * user's prediction and a small verdict chip (✓ / ✗ / pending) so the user
 * can see at a glance how their guess stacked up.
 */
export function MatchScoreRow({
  match,
  home,
  away,
  homeLabel,
  awayLabel,
  result,
  official,
  onScore,
}: MatchScoreRowProps) {
  const { t } = useTranslation();
  const teamsResolved = !!home && !!away;
  const locked = isLockedForPrediction(match);
  const editable = teamsResolved && !locked;
  const homeGoals = result?.played ? result.homeGoals : '';
  const awayGoals = result?.played ? result.awayGoals : '';

  const parse = (v: string): number | null =>
    v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));

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
        <TeamSide team={home} label={homeLabel} align="left" />
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            aria-label={`${home?.name ?? homeLabel ?? 'home'} goals`}
            disabled={!editable}
            value={homeGoals}
            onChange={(e) =>
              onScore(parse(e.target.value), parse(String(awayGoals)))
            }
            className={scoreInputCls}
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
              onScore(parse(String(homeGoals)), parse(e.target.value))
            }
            className={scoreInputCls}
          />
        </div>
        <TeamSide team={away} label={awayLabel} align="right" />
      </div>

      {official ? (
        <div className="flex items-center justify-end gap-1.5 text-label-sm text-on-surface-variant">
          <span className="uppercase tracking-wide">
            {t('tournament.official')}
          </span>
          <span className="tabular-nums font-semibold text-on-surface">
            {official.homeGoals}-{official.awayGoals}
            {official.status === 'PEN' && official.homePens != null && official.awayPens != null
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
    exact: { label: t('tournament.verdict.exact'), cls: 'bg-primary/15 text-primary' },
    sign: { label: t('tournament.verdict.sign'), cls: 'bg-secondary/15 text-secondary' },
    wrong: { label: t('tournament.verdict.wrong'), cls: 'bg-error/15 text-error' },
    pending: { label: t('tournament.verdict.pending'), cls: 'bg-outline-variant/30 text-on-surface-variant' },
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
