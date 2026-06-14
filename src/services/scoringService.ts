import { computeAllStandings, indexPicks } from './tournamentService';
import type {
  StoredKnockoutPrediction,
  StoredOfficialResult,
  StoredPrediction,
} from '@/types/prediction';
import type { Tournament, TournamentMatch } from '@/types/tournament';

/**
 * Pure scoring engine — no React, no DB. Takes the static fixture, the user's
 * predictions for one scenario, and the FIFA-official results, and computes
 * a per-scenario point total with a per-match breakdown.
 *
 * Scoring rules (per match):
 *  - **3 pts** — exact result (regulation goals, or regulation+pens when
 *    `official.status === 'PEN'`). For knockout draws the official "score"
 *    for the comparison is the penalty tally, matching FIFA's tiebreak.
 *  - **1 pt** — correct sign in regulation: same winner, or same draw, but
 *    different score. Only applies to group matches; in knockout a wrong
 *    regulation score that still picks the right winner is rewarded via
 *    the penalty-aware exact check (3 pts) or scored as 0 if the user
 *    failed to predict the penalties. We do NOT give a 1-pt partial here
 *    because that would double-count against the 3-pt exact.
 *  - **0 pts** — wrong.
 *
 * Predictions that haven't been entered (`played: false`) or matches with no
 * official result yet (kickoff in the future, or sync lag) score 0 and are
 * listed under `pending` for the UI.
 *
 * `totalMaxAvailable` is the sum of `POINTS_EXACT` (3) for every match that
 * already has a final official result — i.e. the user knows the upper bound
 * of what they could have earned so far.
 */
export const POINTS_EXACT = 3;
export const POINTS_SIGN = 1;

export interface MatchScore {
  matchId: string;
  matchNumber: number;
  stage: TournamentMatch['stage'];
  group?: string;
  /** 'exact' | 'sign' | 'wrong' | 'pending' — pending = no prediction or no official result yet. */
  verdict: 'exact' | 'sign' | 'wrong' | 'pending';
  points: 0 | 1 | 3;
  /** True when this match had a penalty shootout (used to show "(pen)" in the UI). */
  wentToPenalties: boolean;
}

export interface ScenarioScore {
  totalPoints: number;
  totalMaxAvailable: number;
  /** Number of matches that have a final official result. */
  finishedMatches: number;
  exact: number;
  sign: number;
  wrong: number;
  pending: number;
  /** Per-match breakdown (caller can render a list / progress bar). */
  perMatch: MatchScore[];
}

function regulationSign(h: number, a: number): number {
  return Math.sign(h - a);
}

function verdictOf(
  prediction:
    | {
        homeGoals: number;
        awayGoals: number;
        homePens?: number;
        awayPens?: number;
        played: boolean;
      }
    | undefined,
  official: StoredOfficialResult | undefined
): 'exact' | 'sign' | 'wrong' | 'pending' {
  if (!prediction || !prediction.played) return 'pending';
  if (!official) return 'pending';
  const pens = official.status === 'PEN';
  // For penalty games, FIFA's official "score" is the pens; the regulation
  // result is always a draw. We compare against the user's pens if they
  // entered any; if not, they implicitly picked a regulation result and
  // get 0 on a penalty game (it's a different question).
  const ph = pens ? official.homePens ?? 0 : official.homeGoals;
  const pa = pens ? official.awayPens ?? 0 : official.awayGoals;
  const pp = pens ? prediction.homePens ?? 0 : prediction.homeGoals;
  const pa_ = pens ? prediction.awayPens ?? 0 : prediction.awayGoals;
  if (ph === pp && pa === pa_) return 'exact';
  if (pens) return 'wrong';
  if (regulationSign(ph, pa) === regulationSign(pp, pa_)) return 'sign';
  return 'wrong';
}

export function scoreMatch(
  match: TournamentMatch,
  prediction: StoredPrediction | undefined,
  official: StoredOfficialResult | undefined
): MatchScore {
  const verdict = verdictOf(prediction, official);
  const points: 0 | 1 | 3 =
    verdict === 'exact' ? POINTS_EXACT : verdict === 'sign' ? POINTS_SIGN : 0;
  return {
    matchId: match.id,
    matchNumber: match.matchNumber,
    stage: match.stage,
    group: match.group,
    verdict,
    points,
    wentToPenalties: official?.status === 'PEN',
  };
}

/**
 * Score a whole scenario. Optionally accept manual knockout picks so we can
 * credit a `sign` (1 pt) for a user-forced override that advanced the right
 * team — see the knockout-pick block at the bottom.
 */
export function scoreScenario(
  tournament: Tournament,
  predictions: StoredPrediction[],
  official: Map<string, StoredOfficialResult>,
  knockoutPicks: StoredKnockoutPrediction[] = []
): ScenarioScore {
  const perMatch: MatchScore[] = [];
  let total = 0;
  let max = 0;
  let exact = 0;
  let sign = 0;
  let wrong = 0;
  let pending = 0;
  let finished = 0;
  const predByMatch = new Map(predictions.map((p) => [p.matchId, p]));

  for (const m of tournament.matches) {
    const s = scoreMatch(m, predByMatch.get(m.id), official.get(m.id));
    perMatch.push(s);
    if (s.verdict === 'pending') {
      pending += 1;
      continue;
    }
    finished += 1;
    max += POINTS_EXACT;
    total += s.points;
    if (s.verdict === 'exact') exact += 1;
    else if (s.verdict === 'sign') sign += 1;
    else wrong += 1;
  }

  // Knockout manual picks: 1 extra point (sign) when the user forced a slot
  // to a team and that team advanced. The `per-match` block above already
  // counts the per-match prediction row, so this is purely additive for the
  // "I overrode the auto-resolved team" case.
  if (knockoutPicks.length > 0) {
    const indexed = indexPicks(knockoutPicks);
    const standings = computeAllStandings(
      tournament.groups,
      tournament.matches,
      new Map(predictions.map((p) => [p.matchId, p])),
      tournament.qualifiers.bestThirds
    );
    void standings; // we only need the picks map for the override signal
    for (const m of tournament.matches) {
      if (m.stage === 'group') continue;
      const o = official.get(m.id);
      if (!o) continue;
      const homeOverride = m.homeSlot ? indexed.get(m.homeSlot) : undefined;
      const awayOverride = m.awaySlot ? indexed.get(m.awaySlot) : undefined;
      if (!homeOverride && !awayOverride) continue;
      const winningSlot = pickWinnerSlot(m, o);
      if (!winningSlot) continue;
      if (
        (homeOverride && winningSlot === m.homeSlot) ||
        (awayOverride && winningSlot === m.awaySlot)
      ) {
        total += POINTS_SIGN;
        sign += 1;
        max += POINTS_EXACT;
        finished += 1;
      }
    }
  }

  return {
    totalPoints: total,
    totalMaxAvailable: max,
    finishedMatches: finished,
    exact,
    sign,
    wrong,
    pending,
    perMatch,
  };
}

function pickWinnerSlot(
  m: TournamentMatch,
  o: StoredOfficialResult
): string | undefined {
  if (o.status === 'PEN') {
    const hp = o.homePens ?? 0;
    const ap = o.awayPens ?? 0;
    if (hp > ap) return m.homeSlot;
    if (ap > hp) return m.awaySlot;
    return undefined;
  }
  if (o.homeGoals > o.awayGoals) return m.homeSlot;
  if (o.awayGoals > o.homeGoals) return m.awaySlot;
  return undefined;
}
