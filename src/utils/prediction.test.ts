import { describe, it, expect } from 'vitest';
import { isLockedForPrediction, isPredictionCorrect } from './prediction';
import type { StoredOfficialResult } from '@/types/prediction';

function pred(
  homeGoals: number,
  awayGoals: number,
  played = true,
  homePens?: number,
  awayPens?: number
) {
  return { homeGoals, awayGoals, homePens, awayPens, played };
}

function official(
  status: StoredOfficialResult['status'],
  homeGoals?: number,
  awayGoals?: number,
  homePens?: number,
  awayPens?: number
): StoredOfficialResult {
  return {
    matchId: 'm1',
    status,
    kickoff: '2026-06-11T13:00:00.000-06:00',
    homeGoals,
    awayGoals,
    homePens,
    awayPens,
    finishedAt: '2026-06-11T15:00:00.000Z',
    apiFootballFixtureId: 1,
    syncedAt: 0,
  };
}

describe('isLockedForPrediction', () => {
  it('returns false when there is no kickoff at all', () => {
    expect(isLockedForPrediction({ kickoff: undefined })).toBe(false);
  });

  it('returns false when the kickoff string is unparseable', () => {
    expect(isLockedForPrediction({ kickoff: 'not-a-date' })).toBe(false);
  });

  it('returns true when the kickoff is in the past', () => {
    const past = new Date('2026-06-11T13:00:00Z').getTime();
    expect(
      isLockedForPrediction({ kickoff: '2026-06-11T13:00:00.000Z' }, past + 1)
    ).toBe(true);
  });

  it('returns true at the exact kickoff instant (inclusive)', () => {
    const t = new Date('2026-06-11T13:00:00Z').getTime();
    expect(
      isLockedForPrediction({ kickoff: '2026-06-11T13:00:00.000Z' }, t)
    ).toBe(true);
  });

  it('returns false when the kickoff is in the future', () => {
    const future = new Date('2026-06-11T13:00:00Z').getTime();
    expect(
      isLockedForPrediction({ kickoff: '2026-06-11T13:00:00.000Z' }, future - 1)
    ).toBe(false);
  });
});

describe('isPredictionCorrect', () => {
  it('returns pending when no prediction is provided', () => {
    expect(isPredictionCorrect(undefined, official('FT', 2, 1))).toBe(
      'pending'
    );
  });

  it('returns pending when prediction exists but is not played', () => {
    expect(isPredictionCorrect(pred(1, 0, false), official('FT', 2, 1))).toBe(
      'pending'
    );
  });

  it('returns official-missing when there is a prediction but no official yet', () => {
    expect(isPredictionCorrect(pred(1, 0), undefined)).toBe('official-missing');
  });

  it('returns pending when the official row is SCHEDULED', () => {
    expect(isPredictionCorrect(pred(1, 0), official('SCHEDULED'))).toBe(
      'pending'
    );
  });

  it('returns pending when the official row is finished but has no goals', () => {
    // Defensive: a malformed row with status=FT but no homeGoals/awayGoals
    // is treated as pending rather than crashing.
    expect(
      isPredictionCorrect(pred(1, 0), official('FT', undefined, undefined))
    ).toBe('pending');
  });

  it('returns exact when regulation scores match', () => {
    expect(isPredictionCorrect(pred(2, 1), official('FT', 2, 1))).toBe('exact');
  });

  it('returns sign when the winner matches but the score differs (group play)', () => {
    expect(isPredictionCorrect(pred(3, 0), official('FT', 1, 0))).toBe('sign');
    expect(isPredictionCorrect(pred(0, 2), official('FT', 0, 1))).toBe('sign');
  });

  it('returns wrong when the winner differs', () => {
    expect(isPredictionCorrect(pred(0, 1), official('FT', 2, 0))).toBe('wrong');
  });

  it('treats a draw prediction as sign on a draw official', () => {
    expect(isPredictionCorrect(pred(1, 1), official('FT', 2, 2))).toBe('sign');
  });

  it('penalty games: compares on penalty tally, not regulation', () => {
    // Regulation 1-1; user predicted pens 4-3; official pens 4-3. Exact.
    expect(
      isPredictionCorrect(pred(1, 1, true, 4, 3), official('PEN', 1, 1, 4, 3))
    ).toBe('exact');
  });

  it('penalty games: same sign of (home - away) counts as a sign reward', () => {
    // Penalty games with the SAME winner (home wins in pens regardless of
    // the exact tally) still get a +1 sign bonus — the user picked the
    // right team to advance, even if the exact pens differ.
    expect(
      isPredictionCorrect(pred(1, 1, true, 4, 3), official('PEN', 1, 1, 5, 4))
    ).toBe('sign');
  });

  it('penalty games: a regulation-only prediction is wrong on a penalty game', () => {
    // User predicted 1-0 in regulation; the game actually went to pens
    // (1-1 in regulation, 4-3 on pens for the home side). Strict
    // scoring: 0 pts — there's no sign bonus for penalty games.
    expect(isPredictionCorrect(pred(1, 0), official('PEN', 1, 1, 4, 3))).toBe(
      'wrong'
    );
  });

  it('AET: compares on regulation goals', () => {
    expect(isPredictionCorrect(pred(2, 1), official('AET', 2, 1))).toBe(
      'exact'
    );
  });
});
