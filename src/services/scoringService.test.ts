import { describe, it, expect } from 'vitest';
import {
  scoreMatch,
  scoreScenario,
  POINTS_EXACT,
  POINTS_SIGN,
} from './scoringService';
import type { Tournament, TournamentMatch } from '@/types/tournament';
import type {
  StoredKnockoutPrediction,
  StoredOfficialResult,
  StoredPrediction,
} from '@/types/prediction';

function pred(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  pens?: [number, number]
): StoredPrediction {
  return {
    uid: `s::${matchId}`,
    scenarioId: 's',
    matchId,
    homeGoals,
    awayGoals,
    homePens: pens?.[0],
    awayPens: pens?.[1],
    played: true,
    updatedAt: 0,
  };
}

function official(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  status: 'FT' | 'AET' | 'PEN' = 'FT',
  pens?: [number, number]
): StoredOfficialResult {
  return {
    matchId,
    homeGoals,
    awayGoals,
    homePens: pens?.[0],
    awayPens: pens?.[1],
    status,
    finishedAt: '2026-06-11T20:00:00.000Z',
    apiFootballFixtureId: 1,
    syncedAt: 0,
  };
}

const match: TournamentMatch = {
  id: 'm1',
  matchNumber: 1,
  stage: 'group',
  group: 'A',
  homeTeamId: 'T1',
  awayTeamId: 'T2',
};

describe('scoreMatch', () => {
  it('returns pending when no prediction', () => {
    expect(scoreMatch(match, undefined, undefined).verdict).toBe('pending');
  });

  it('returns pending when prediction exists but no official result', () => {
    expect(scoreMatch(match, pred('m1', 1, 0), undefined).verdict).toBe(
      'pending'
    );
  });

  it('returns exact when scores match', () => {
    const s = scoreMatch(match, pred('m1', 2, 1), official('m1', 2, 1));
    expect(s.verdict).toBe('exact');
    expect(s.points).toBe(POINTS_EXACT);
  });

  it('returns sign when winner matches but score differs (group)', () => {
    const s = scoreMatch(match, pred('m1', 3, 1), official('m1', 1, 0));
    expect(s.verdict).toBe('sign');
    expect(s.points).toBe(POINTS_SIGN);
  });

  it('returns wrong when winner differs', () => {
    const s = scoreMatch(match, pred('m1', 1, 0), official('m1', 0, 1));
    expect(s.verdict).toBe('wrong');
    expect(s.points).toBe(0);
  });

  it('counts penalty shootouts as exact when pens match', () => {
    const s = scoreMatch(
      match,
      pred('m1', 1, 1, [4, 3]),
      official('m1', 1, 1, 'PEN', [4, 3])
    );
    expect(s.verdict).toBe('exact');
    expect(s.wentToPenalties).toBe(true);
  });

  it('counts penalty shootouts as wrong when pens differ', () => {
    const s = scoreMatch(
      match,
      pred('m1', 1, 1, [4, 3]),
      official('m1', 1, 1, 'PEN', [5, 4])
    );
    expect(s.verdict).toBe('wrong');
  });

  it('does not give a sign reward for penalty games (sign = exact for pens)', () => {
    // User predicted regulation 1-0 (winner home). Official went to pens with
    // home winning. We do NOT reward 1 pt here because in a penalty game
    // there's no "same winner, different score" — the score is whatever the
    // pens say, and the user got it wrong.
    const s = scoreMatch(
      match,
      pred('m1', 1, 0),
      official('m1', 1, 1, 'PEN', [4, 3])
    );
    expect(s.verdict).toBe('wrong');
  });
});

const miniTournament: Tournament = {
  qualifiers: { perGroup: 2, bestThirds: 2 },
  groups: [{ id: 'A', teamIds: ['T1', 'T2', 'T3', 'T4'] }],
  matches: [
    {
      id: 'm1',
      matchNumber: 1,
      stage: 'group',
      group: 'A',
      homeTeamId: 'T1',
      awayTeamId: 'T2',
    },
    {
      id: 'm2',
      matchNumber: 2,
      stage: 'group',
      group: 'A',
      homeTeamId: 'T3',
      awayTeamId: 'T4',
    },
    {
      id: 'm3',
      matchNumber: 3,
      stage: 'group',
      group: 'A',
      homeTeamId: 'T1',
      awayTeamId: 'T3',
    },
    { id: 'm4', matchNumber: 4, stage: 'r32', homeSlot: '1A', awaySlot: '2A' },
  ],
};

describe('scoreScenario', () => {
  it('aggregates per-match verdicts and counts max-over-finished', () => {
    const preds: StoredPrediction[] = [
      pred('m1', 2, 1), // exact
      pred('m2', 1, 0), // exact
      pred('m3', 0, 0), // sign: both predicted a draw, but different score
      // m4 no prediction yet → pending
    ];
    const off = new Map<string, StoredOfficialResult>([
      ['m1', official('m1', 2, 1)],
      ['m2', official('m1', 2, 1)], // unused, just to align keys
    ]);
    // replace m2 entry
    off.set('m2', official('m2', 1, 0));
    off.set('m3', official('m3', 1, 1));
    // m4 no official → pending

    const s = scoreScenario(miniTournament, preds, off);
    expect(s.exact).toBe(2);
    expect(s.sign).toBe(1);
    expect(s.wrong).toBe(0);
    expect(s.pending).toBe(1);
    expect(s.finishedMatches).toBe(3);
    expect(s.totalPoints).toBe(POINTS_EXACT * 2 + POINTS_SIGN);
    expect(s.totalMaxAvailable).toBe(POINTS_EXACT * 3);
  });

  it('credits a sign point for a manual knockout pick that advanced the right team', () => {
    const preds: StoredPrediction[] = [];
    const off = new Map<string, StoredOfficialResult>([
      ['m1', official('m1', 1, 0)], // T1 wins → 1A = T1
      ['m2', official('m2', 0, 1)], // T4 wins → 2A = T4
      ['m4', official('m4', 1, 0)], // m4 finished, home (1A) wins
    ]);
    // User manually overrode 2A to T4. Official winner of m4 was 1A (home),
    // so the override on 2A didn't help the user for THIS match (their
    // override was on the away side which lost). But the override on 1A
    // side is the winning slot — but we didn't override 1A, the resolver
    // auto-picks T1. Override credit only fires for slots the user
    // explicitly forced.
    // For the credit to fire we need: user override on side X + official
    // winner == slot X. So override 1A (the home side, which wins).
    const picks: StoredKnockoutPrediction[] = [
      { uid: 's::1A', scenarioId: 's', slot: '1A', teamId: 'T1', updatedAt: 0 },
    ];
    const s = scoreScenario(miniTournament, preds, off, picks);
    expect(s.sign).toBe(1);
    expect(s.totalPoints).toBe(POINTS_SIGN);
    expect(s.totalMaxAvailable).toBe(POINTS_EXACT);
  });

  it('returns zero totals when nothing has been played yet', () => {
    const s = scoreScenario(miniTournament, [], new Map());
    expect(s.totalPoints).toBe(0);
    expect(s.totalMaxAvailable).toBe(0);
    expect(s.finishedMatches).toBe(0);
    expect(s.pending).toBe(4);
  });
});
