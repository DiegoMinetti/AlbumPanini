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
      <span className="truncate text-sm font-medium">{team.name}</span>
    </>
  ) : (
    <span className="truncate text-sm italic text-slate-400">
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
          className="h-9 w-10 rounded-md border border-slate-300 bg-white text-center text-sm font-bold tabular-nums disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
        />
        <span className="text-slate-400">-</span>
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
          className="h-9 w-10 rounded-md border border-slate-300 bg-white text-center text-sm font-bold tabular-nums disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800"
        />
      </div>
      <TeamSide team={away} label={awayLabel} align="right" />
    </div>
  );
}
