import { describe, it, expect } from 'vitest';
import {
  computeOverview,
  computeTeamStats,
  computeCategoryStats,
  computeMostRepeated,
  computeStatistics,
} from './statsService';
import { sticker, team } from '@/tests/helpers';

const stickers = [
  sticker({ id: 'ARG-1', teamId: 'ARG', category: 'player' }),
  sticker({ id: 'ARG-2', teamId: 'ARG', category: 'player' }),
  sticker({ id: 'BRA-1', teamId: 'BRA', category: 'player' }),
  sticker({ id: 'BRA-2', teamId: 'BRA', category: 'badge' }),
];
const teams = [team({ id: 'ARG' }), team({ id: 'BRA' })];

describe('computeOverview', () => {
  it('counts owned, missing and duplicates', () => {
    const inv = new Map([
      ['ARG-1', 2],
      ['ARG-2', 1],
      ['BRA-1', 0],
    ]);
    const o = computeOverview(stickers, inv);
    expect(o.total).toBe(4);
    expect(o.owned).toBe(2);
    expect(o.missing).toBe(2);
    expect(o.duplicates).toBe(1);
    expect(o.distinctDuplicates).toBe(1);
    expect(o.completion).toBe(0.5);
  });

  it('handles empty collection', () => {
    const o = computeOverview([], new Map());
    expect(o.completion).toBe(0);
  });
});

describe('computeTeamStats', () => {
  it('computes per-team completion and complete flag', () => {
    const inv = new Map([
      ['ARG-1', 1],
      ['ARG-2', 1],
      ['BRA-1', 1],
    ]);
    const ts = computeTeamStats(stickers, teams, inv);
    const arg = ts.find((t) => t.teamId === 'ARG')!;
    const bra = ts.find((t) => t.teamId === 'BRA')!;
    expect(arg.complete).toBe(true);
    expect(arg.completion).toBe(1);
    expect(bra.complete).toBe(false);
    expect(bra.completion).toBe(0.5);
  });
});

describe('computeCategoryStats', () => {
  it('buckets by category', () => {
    const inv = new Map([['BRA-2', 1]]);
    const cats = computeCategoryStats(stickers, inv);
    const badge = cats.find((c) => c.category === 'badge')!;
    expect(badge.total).toBe(1);
    expect(badge.owned).toBe(1);
  });
});

describe('computeMostRepeated', () => {
  it('returns duplicates sorted desc', () => {
    const inv = new Map([
      ['ARG-1', 3],
      ['BRA-1', 2],
      ['ARG-2', 1],
    ]);
    const rep = computeMostRepeated(stickers, inv);
    expect(rep.map((r) => r.stickerId)).toEqual(['ARG-1', 'BRA-1']);
    expect(rep[0].quantity).toBe(3);
  });
});

describe('computeStatistics', () => {
  it('flags near-complete teams at threshold', () => {
    const inv = new Map([
      ['ARG-1', 1],
      ['ARG-2', 1],
      ['BRA-1', 1],
    ]);
    const stats = computeStatistics(stickers, teams, inv, {
      nearCompleteThreshold: 0.5,
    });
    expect(stats.completedTeams.some((t) => t.teamId === 'ARG')).toBe(true);
    expect(stats.nearCompleteTeams.some((t) => t.teamId === 'BRA')).toBe(true);
  });
});
