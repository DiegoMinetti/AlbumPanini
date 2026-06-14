import type { TournamentMatch } from '@/types/tournament';
import type { StoredOfficialResult } from '@/types/prediction';

/**
 * Whether the user is still allowed to edit their prediction for a given match.
 *
 * Locks at the exact `kickoff` instant (`<= now`). Matches without a `kickoff`
 * are not lockable — typically knockout games that FIFA hasn't published a
 * time for yet — so the user can keep editing those. Callers (UI inputs)
 * should fall back to other disabled states (e.g. teams unresolved) in that
 * case; this function only checks the time-based lock.
 */
export function isLockedForPrediction(
  match: Pick<TournamentMatch, 'kickoff'>,
  now: number = Date.now()
): boolean {
  if (!match.kickoff) return false;
  const t = Date.parse(match.kickoff);
  if (Number.isNaN(t)) return false;
  return t <= now;
}

/**
 * Build a comparator that says whether an official result matches a stored
 * prediction. Used by the UI badge (✓ / ✗ / pending) and (in PR4) the
 * scoring engine. Pure: no DB access, no React.
 */
export function isPredictionCorrect(
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
): 'pending' | 'official-missing' | 'exact' | 'sign' | 'wrong' {
  if (!prediction || !prediction.played) return 'pending';
  if (!official) return 'official-missing';
  if (official.status === 'SCHEDULED') return 'pending';
  if (official.homeGoals == null || official.awayGoals == null) return 'pending';
  // For games that ended in penalties, the official result is decided on
  // penalties; mirror that here so a "draw in regulation + won on pens"
  // prediction counts as exact.
  const pens = official.status === 'PEN';
  const ph = pens ? (official.homePens ?? 0) : official.homeGoals;
  const pa = pens ? (official.awayPens ?? 0) : official.awayGoals;
  const pp = pens ? (prediction.homePens ?? 0) : prediction.homeGoals;
  const pa_ = pens ? (prediction.awayPens ?? 0) : prediction.awayGoals;
  if (ph === pp && pa === pa_) return 'exact';
  const sign = (h: number, a: number): number => Math.sign(h - a);
  if (sign(ph, pa) === sign(pp, pa_)) return 'sign';
  return 'wrong';
}
