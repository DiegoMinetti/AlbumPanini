import type { IndexedMatchResult } from '@/services/tournamentService';
import type { StoredTeam } from '@/types/collection';

interface MatchScoreRowProps {
  /** Resolved teams (may be undefined for unresolved knockout slots). */
  home?: StoredTeam;
  away?: StoredTeam;
  /** Fallback labels shown when a team is not yet resolved (e.g. "1A"). */
  homeLabel?: string;
  awayLabel?: string;
  result?: IndexedMatchResult;
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
 * Inputs are disabled until both teams are known so you cannot score a phantom
 * knockout match.
 */
export function MatchScoreRow({
  home,
  away,
  homeLabel,
  awayLabel,
  result,
  onScore,
}: MatchScoreRowProps) {
  const editable = !!home && !!away;
  const homeGoals = result?.played ? result.homeGoals : '';
  const awayGoals = result?.played ? result.awayGoals : '';

  const parse = (v: string): number | null =>
    v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));

  return (
    <div className="flex items-center gap-2 py-2">
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
  );
}
