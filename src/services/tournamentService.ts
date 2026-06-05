import type { TournamentGroup, TournamentMatch } from '@/types/tournament';
import type { StoredKnockoutPick, StoredMatchResult } from '@/types/scenario';

/**
 * Pure tournament logic: group standings, best-third ranking and knockout slot
 * resolution. No DB or React here — everything is a deterministic function of
 * the static structure plus a scenario's results/picks, so it is trivially
 * testable and can run inside a `useMemo`.
 */

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** 1-based position within the group (after tiebreakers). */
  rank: number;
}

/** A match score, only meaningful when `played` is true. */
type Result = Pick<
  StoredMatchResult,
  'homeGoals' | 'awayGoals' | 'homePens' | 'awayPens' | 'played'
>;

function emptyRow(teamId: string): StandingRow {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    rank: 0,
  };
}

function applyResult(row: StandingRow, gf: number, ga: number): void {
  row.played += 1;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  if (gf > ga) {
    row.won += 1;
    row.points += 3;
  } else if (gf === ga) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}

/** Standard comparator: points → goal difference → goals for. */
function compareBase(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

/**
 * Compute the standings of a single group.
 *
 * Tiebreakers follow FIFA order: points, goal difference, goals scored, then a
 * head-to-head mini-table among the teams still tied, and finally team id for a
 * stable result.
 */
export function computeGroupStandings(
  group: TournamentGroup,
  matches: TournamentMatch[],
  results: Map<string, Result>,
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const teamId of group.teamIds) rows.set(teamId, emptyRow(teamId));

  const groupMatches = matches.filter(
    (m) => m.stage === 'group' && m.group === group.id,
  );

  for (const m of groupMatches) {
    const r = results.get(m.id);
    if (!r || !r.played || !m.homeTeamId || !m.awayTeamId) continue;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;
    applyResult(home, r.homeGoals, r.awayGoals);
    applyResult(away, r.awayGoals, r.homeGoals);
  }

  const sorted = [...rows.values()].sort((a, b) => {
    const base = compareBase(a, b);
    if (base !== 0) return base;
    const h2h = headToHead(a.teamId, b.teamId, rows, groupMatches, results);
    if (h2h !== 0) return h2h;
    return a.teamId.localeCompare(b.teamId);
  });

  sorted.forEach((row, i) => {
    row.rank = i + 1;
  });
  return sorted;
}

/** Head-to-head between exactly two tied teams (points, then GD, then GF). */
function headToHead(
  teamA: string,
  teamB: string,
  _rows: Map<string, StandingRow>,
  groupMatches: TournamentMatch[],
  results: Map<string, Result>,
): number {
  const a = emptyRow(teamA);
  const b = emptyRow(teamB);
  for (const m of groupMatches) {
    const r = results.get(m.id);
    if (!r || !r.played) continue;
    const pair = [m.homeTeamId, m.awayTeamId];
    if (!pair.includes(teamA) || !pair.includes(teamB)) continue;
    if (m.homeTeamId === teamA) {
      applyResult(a, r.homeGoals, r.awayGoals);
      applyResult(b, r.awayGoals, r.homeGoals);
    } else {
      applyResult(a, r.awayGoals, r.homeGoals);
      applyResult(b, r.homeGoals, r.awayGoals);
    }
  }
  return compareBase(a, b);
}

export interface AllStandings {
  /** Group id → ordered standings. */
  byGroup: Map<string, StandingRow[]>;
  /** Ranked best third-placed teamIds (length = bestThirds), index 0 = T1. */
  bestThirds: string[];
}

/** Compute every group's standings plus the ranked best third-placed teams. */
export function computeAllStandings(
  groups: TournamentGroup[],
  matches: TournamentMatch[],
  results: Map<string, Result>,
  bestThirdsCount: number,
): AllStandings {
  const byGroup = new Map<string, StandingRow[]>();
  const thirds: StandingRow[] = [];
  for (const group of groups) {
    const standings = computeGroupStandings(group, matches, results);
    byGroup.set(group.id, standings);
    const third = standings.find((r) => r.rank === 3);
    if (third) thirds.push(third);
  }
  const bestThirds = thirds
    .sort((a, b) => compareBase(a, b) || a.teamId.localeCompare(b.teamId))
    .slice(0, bestThirdsCount)
    .map((r) => r.teamId);
  return { byGroup, bestThirds };
}

/** Winner of a knockout match from its score (penalties break draws). */
export function winnerOf(
  homeTeamId: string | undefined,
  awayTeamId: string | undefined,
  result: Result | undefined,
): { winner?: string; loser?: string } {
  if (!homeTeamId || !awayTeamId || !result || !result.played) return {};
  const { homeGoals, awayGoals, homePens, awayPens } = result;
  if (homeGoals > awayGoals) return { winner: homeTeamId, loser: awayTeamId };
  if (awayGoals > homeGoals) return { winner: awayTeamId, loser: homeTeamId };
  if (homePens != null && awayPens != null && homePens !== awayPens) {
    return homePens > awayPens
      ? { winner: homeTeamId, loser: awayTeamId }
      : { winner: awayTeamId, loser: homeTeamId };
  }
  return {};
}

export interface BracketResolver {
  /** Resolve a slot (`"1A"`, `"2B"`, `"T3"`, `"W73"`, `"L101"`) to a teamId. */
  resolveSlot: (slot?: string) => string | undefined;
  /** Resolve both sides of a knockout match. */
  resolveMatch: (
    match: TournamentMatch,
  ) => { homeTeamId?: string; awayTeamId?: string };
}

/**
 * Build a resolver that turns symbolic bracket slots into concrete teams using
 * the auto-computed standings plus any manual hybrid picks. Manual picks (keyed
 * by slot) always win, which is what lets the user force advances click by
 * click. Results are memoized to keep the slot DAG cheap.
 */
export function createBracketResolver(
  matches: TournamentMatch[],
  standings: AllStandings,
  results: Map<string, Result>,
  picks: Map<string, string>,
): BracketResolver {
  const matchByNumber = new Map<number, TournamentMatch>(
    matches.map((m) => [m.matchNumber, m]),
  );
  const cache = new Map<string, string | undefined>();
  const inProgress = new Set<string>();

  function resolveSlot(slot?: string): string | undefined {
    if (!slot) return undefined;
    const pick = picks.get(slot);
    if (pick) return pick;
    if (cache.has(slot)) return cache.get(slot);
    if (inProgress.has(slot)) return undefined; // guard against cycles
    inProgress.add(slot);

    let teamId: string | undefined;
    const winLoss = /^([WL])(\d+)$/.exec(slot);
    const rankSlot = /^([12])([A-L])$/.exec(slot);
    const thirdSlot = /^T(\d+)$/.exec(slot);

    if (rankSlot) {
      const [, posStr, group] = rankSlot;
      const row = standings.byGroup
        .get(group)
        ?.find((r) => r.rank === Number(posStr));
      teamId = row?.teamId;
    } else if (thirdSlot) {
      teamId = standings.bestThirds[Number(thirdSlot[1]) - 1];
    } else if (winLoss) {
      const [, kind, numStr] = winLoss;
      const m = matchByNumber.get(Number(numStr));
      if (m) {
        const home = resolveSlot(m.homeSlot) ?? m.homeTeamId;
        const away = resolveSlot(m.awaySlot) ?? m.awayTeamId;
        const { winner, loser } = winnerOf(home, away, results.get(m.id));
        teamId = kind === 'W' ? winner : loser;
      }
    }

    inProgress.delete(slot);
    cache.set(slot, teamId);
    return teamId;
  }

  function resolveMatch(match: TournamentMatch) {
    return {
      homeTeamId: resolveSlot(match.homeSlot) ?? match.homeTeamId,
      awayTeamId: resolveSlot(match.awaySlot) ?? match.awayTeamId,
    };
  }

  return { resolveSlot, resolveMatch };
}

/** Build the lookup maps the resolver needs from raw stored rows. */
export function indexResults(
  rows: StoredMatchResult[],
): Map<string, Result> {
  return new Map(rows.map((r) => [r.matchId, r]));
}

export function indexPicks(rows: StoredKnockoutPick[]): Map<string, string> {
  return new Map(rows.map((p) => [p.slot, p.teamId]));
}
