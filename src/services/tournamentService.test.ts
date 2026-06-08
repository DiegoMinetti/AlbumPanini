import { describe, it, expect } from 'vitest';
import {
  computeGroupStandings,
  computeAllStandings,
  createBracketResolver,
  winnerOf,
} from './tournamentService';
import type { TournamentGroup, TournamentMatch } from '@/types/tournament';
import type { StoredMatchResult } from '@/types/scenario';

const group: TournamentGroup = {
  id: 'A',
  teamIds: ['T1', 'T2', 'T3', 'T4'],
};

// Standard 4-team round robin for group A (matches 1..6).
const groupMatches: TournamentMatch[] = [
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
  {
    id: 'm4',
    matchNumber: 4,
    stage: 'group',
    group: 'A',
    homeTeamId: 'T2',
    awayTeamId: 'T4',
  },
  {
    id: 'm5',
    matchNumber: 5,
    stage: 'group',
    group: 'A',
    homeTeamId: 'T1',
    awayTeamId: 'T4',
  },
  {
    id: 'm6',
    matchNumber: 6,
    stage: 'group',
    group: 'A',
    homeTeamId: 'T2',
    awayTeamId: 'T3',
  },
];

function result(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  pens?: [number, number]
): StoredMatchResult {
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

function resultsMap(rows: StoredMatchResult[]): Map<string, StoredMatchResult> {
  return new Map(rows.map((r) => [r.matchId, r]));
}

describe('computeGroupStandings', () => {
  it('orders by points then goal difference', () => {
    // T1 wins all, T4 loses all, T2 & T3 in between.
    const results = resultsMap([
      result('m1', 2, 0), // T1 > T2
      result('m2', 1, 0), // T3 > T4
      result('m3', 3, 0), // T1 > T3
      result('m4', 2, 1), // T2 > T4
      result('m5', 1, 0), // T1 > T4
      result('m6', 0, 0), // T2 = T3
    ]);
    const table = computeGroupStandings(group, groupMatches, results);
    // T1 wins all (9). T2 (4 pts, GD -1) ahead of T3 (4 pts, GD -2). T4 last.
    expect(table.map((r) => r.teamId)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(table[0]).toMatchObject({ points: 9, won: 3, rank: 1 });
    expect(table[1]).toMatchObject({ teamId: 'T2', points: 4, goalDiff: -1 });
    expect(table[2]).toMatchObject({ teamId: 'T3', points: 4, goalDiff: -2 });
    expect(table[3]).toMatchObject({ teamId: 'T4', points: 0, rank: 4 });
  });

  it('breaks ties on head-to-head', () => {
    // Make T2 and T3 level on points/GD/GF; their direct match decides.
    const results = resultsMap([
      result('m1', 0, 1), // T2 > T1
      result('m2', 1, 0), // T3 > T4
      result('m3', 0, 0), // T1 = T3
      result('m4', 0, 0), // T2 = T4
      result('m5', 0, 0), // T1 = T4
      result('m6', 2, 0), // T2 > T3 (head to head)
    ]);
    const table = computeGroupStandings(group, groupMatches, results);
    const t2 = table.find((r) => r.teamId === 'T2')!;
    const t3 = table.find((r) => r.teamId === 'T3')!;
    expect(t2.rank).toBeLessThan(t3.rank); // T2 ahead via head-to-head
  });

  it('leaves unplayed matches out', () => {
    const table = computeGroupStandings(group, groupMatches, new Map());
    expect(table.every((r) => r.played === 0)).toBe(true);
  });
});

describe('winnerOf', () => {
  it('uses goals, then penalties', () => {
    expect(winnerOf('A', 'B', result('x', 2, 1)).winner).toBe('A');
    expect(winnerOf('A', 'B', result('x', 1, 1, [4, 3])).winner).toBe('A');
    expect(winnerOf('A', 'B', result('x', 1, 1, [3, 5])).winner).toBe('B');
    expect(winnerOf('A', 'B', result('x', 1, 1)).winner).toBeUndefined();
  });
});

describe('createBracketResolver', () => {
  const knockout: TournamentMatch[] = [
    {
      id: 'm73',
      matchNumber: 73,
      stage: 'r32',
      homeSlot: '1A',
      awaySlot: '2A',
    },
    {
      id: 'm74',
      matchNumber: 74,
      stage: 'r32',
      homeSlot: 'T1',
      awaySlot: 'T2',
    },
    {
      id: 'm89',
      matchNumber: 89,
      stage: 'r16',
      homeSlot: 'W73',
      awaySlot: 'W74',
    },
  ];
  const matches = [...groupMatches, ...knockout];

  it('resolves group winner/runner-up slots from standings', () => {
    const results = resultsMap([
      result('m1', 2, 0),
      result('m2', 1, 0),
      result('m3', 3, 0),
      result('m4', 2, 1),
      result('m5', 1, 0),
      result('m6', 0, 0),
    ]);
    const standings = computeAllStandings([group], matches, results, 8);
    const resolver = createBracketResolver(
      matches,
      standings,
      results,
      new Map()
    );
    expect(resolver.resolveSlot('1A')).toBe('T1');
    expect(resolver.resolveSlot('2A')).toBe('T2');
  });

  it('resolves winner-of-match chains', () => {
    const results = resultsMap([result('m73', 1, 0)]); // home (1A) advances
    const standings = computeAllStandings([group], matches, results, 8);
    const m73 = matches.find((m) => m.matchNumber === 73)!;
    // Without standings, 1A is undefined, so feed a manual pick for 1A.
    const picks = new Map([
      ['1A', 'X'],
      ['2A', 'Y'],
    ]);
    const resolver = createBracketResolver(matches, standings, results, picks);
    expect(resolver.resolveMatch(m73)).toEqual({
      homeTeamId: 'X',
      awayTeamId: 'Y',
    });
    expect(resolver.resolveSlot('W73')).toBe('X');
  });

  it('lets a manual pick override the slot', () => {
    const standings = computeAllStandings([group], matches, new Map(), 8);
    const picks = new Map([['W73', 'OVERRIDE']]);
    const resolver = createBracketResolver(
      matches,
      standings,
      new Map(),
      picks
    );
    expect(resolver.resolveSlot('W73')).toBe('OVERRIDE');
  });
});
