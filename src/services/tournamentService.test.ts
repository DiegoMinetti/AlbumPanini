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

describe('best3rd-set slots (FIFA Annex C)', () => {
  // Build a small "fake" tournament: 3 groups (A, B, C), each with 4 teams.
  // We control points/GD so we know who finishes 3rd in each group.
  const groupA: TournamentGroup = {
    id: 'A',
    teamIds: ['A1', 'A2', 'A3', 'A4'],
  };
  const groupB: TournamentGroup = {
    id: 'B',
    teamIds: ['B1', 'B2', 'B3', 'B4'],
  };
  const groupC: TournamentGroup = {
    id: 'C',
    teamIds: ['C1', 'C2', 'C3', 'C4'],
  };

  // Standard 4-team round-robin: 3 matchdays, 6 matches per group.
  const pairings = [
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
    [0, 3],
    [1, 2],
  ];

  function groupFixtures(
    g: TournamentGroup,
    startN: number
  ): TournamentMatch[] {
    return pairings.map(([a, b], i) => ({
      id: `${g.id}-m${startN + i}`,
      matchNumber: startN + i,
      stage: 'group',
      group: g.id,
      homeTeamId: g.teamIds[a],
      awayTeamId: g.teamIds[b],
    }));
  }

  const fixtures = [
    ...groupFixtures(groupA, 1),
    ...groupFixtures(groupB, 7),
    ...groupFixtures(groupC, 13),
  ];

  function setResults(
    rows: Array<[string, number, number]>
  ): Map<string, StoredMatchResult> {
    return new Map(
      rows.map(([matchId, hg, ag]) => [matchId, result(matchId, hg, ag)])
    );
  }

  // Targeted standings — every group: X1 7 pts (top), X2 7 pts (H2H loser),
  // X3 3 pts, X4 0 pts. We then tweak each "X3" team's GD so that the
  // best-3rd comparison across groups produces a known order:
  //
  //   A3 → 3 pts, GD  0    (best of the 3 thirds)
  //   C3 → 3 pts, GD -1    (middle)
  //   B3 → 3 pts, GD -4    (worst — out of top-2)
  //
  // With bestThirdsCount = 2: qualifying = {A, C}; B's 3rd is eliminated.
  const results = setResults([
    // Group A — A1+A2 tied on 7; A1 wins H2H (GD +2 vs +1).
    ['A-m1', 1, 1], // A1 = A2 (draw)
    ['A-m2', 2, 0], // A3 > A4
    ['A-m3', 1, 0], // A1 > A3
    ['A-m4', 2, 0], // A2 > A4
    ['A-m5', 1, 0], // A1 > A4
    ['A-m6', 1, 0], // A2 > A3   → A3 GD = 0 (2-0, 0-1, 0-1)
    // Group B — B1+B2 tied on 7; B1 wins H2H (GD +6 vs +3). B3 finishes
    // with 3 pts and GD -4 (1-0, 0-3, 0-2).
    ['B-m7', 1, 1],
    ['B-m8', 1, 0],
    ['B-m9', 3, 0],
    ['B-m10', 1, 0],
    ['B-m11', 3, 0],
    ['B-m12', 2, 0],
    // Group C — C1+C2 tied on 7; C1 wins H2H. C3 finishes with 3 pts and
    // GD -1 (2-0, 0-2, 1-2).
    ['C-m13', 1, 1],
    ['C-m14', 2, 0],
    ['C-m15', 2, 0],
    ['C-m16', 3, 0],
    ['C-m17', 4, 0],
    ['C-m18', 2, 1],
  ]);

  it('computeAllStandings exposes thirdByGroup and qualifyingGroups', () => {
    const standings = computeAllStandings(
      [groupA, groupB, groupC],
      fixtures,
      results,
      2
    );
    expect(standings.thirdByGroup.get('A')?.teamId).toBe('A3');
    expect(standings.thirdByGroup.get('B')?.teamId).toBe('B3');
    expect(standings.thirdByGroup.get('C')?.teamId).toBe('C3');
    // Top 2 thirds by (pts desc, GD desc): A3 (GD 0), C3 (GD -1).
    expect(standings.bestThirds).toEqual(['A3', 'C3']);
    expect(standings.qualifyingGroups).toEqual(new Set(['A', 'C']));
  });

  it('resolves `3[A-L]+` to the unique qualifying candidate (one of the listed qualifies)', () => {
    // Slot `3AB` = best 3rd from {A, B}. Only A's 3rd is in top-2 → A3.
    const standings = computeAllStandings(
      [groupA, groupB, groupC],
      fixtures,
      results,
      2
    );
    const resolver = createBracketResolver(
      fixtures,
      standings,
      results,
      new Map()
    );
    expect(resolver.resolveSlot('3AB')).toBe('A3');
    expect(resolver.resolveSlot('3BC')).toBe('C3');
  });

  it('returns undefined for `3[A-L]+` when ≥2 listed groups qualify (ambiguous — defer)', () => {
    // Both A3 and C3 are in top-2 → `3AC` is ambiguous; the resolver should
    // not pick one for the user. Annex C / manual pick will decide later.
    const standings = computeAllStandings(
      [groupA, groupB, groupC],
      fixtures,
      results,
      2
    );
    const resolver = createBracketResolver(
      fixtures,
      standings,
      results,
      new Map()
    );
    expect(resolver.resolveSlot('3AC')).toBeUndefined();
  });

  it('returns undefined for `3[A-L]+` when no listed group qualifies', () => {
    // bestThirdsCount = 1 → only A3 qualifies (best GD). `3BC` lists only
    // groups whose 3rds are out → no candidate → undefined.
    const standings = computeAllStandings(
      [groupA, groupB, groupC],
      fixtures,
      results,
      1
    );
    expect(standings.qualifyingGroups).toEqual(new Set(['A']));
    const resolver = createBracketResolver(
      fixtures,
      standings,
      results,
      new Map()
    );
    expect(resolver.resolveSlot('3BC')).toBeUndefined();
  });

  it('lets a manual pick override an ambiguous `3[A-L]+` slot', () => {
    // `3AC` is ambiguous under the auto-resolver, but a stored pick for the
    // exact slot string always wins (hybrid mode).
    const standings = computeAllStandings(
      [groupA, groupB, groupC],
      fixtures,
      results,
      2
    );
    const picks = new Map([['3AC', 'FORCED']]);
    const resolver = createBracketResolver(fixtures, standings, results, picks);
    expect(resolver.resolveSlot('3AC')).toBe('FORCED');
  });
});
