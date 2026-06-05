import { describe, it, expect, beforeEach } from 'vitest';
import {
  createScenario,
  deleteScenario,
  ensureOfficialScenario,
  getPicks,
  getResults,
  listScenarios,
  renameScenario,
  setKnockoutPick,
  setScore,
} from './scenarioService';
import { resetDb } from '@/tests/helpers';

const COL = 'wc';

beforeEach(async () => {
  await resetDb();
});

describe('official scenario', () => {
  it('is created once and reused', async () => {
    const a = await ensureOfficialScenario(COL);
    const b = await ensureOfficialScenario(COL);
    expect(a.id).toBe(b.id);
    expect(a.isOfficial).toBe(true);
    const all = await listScenarios(COL);
    expect(all.filter((s) => s.isOfficial)).toHaveLength(1);
  });

  it('cannot be deleted', async () => {
    const official = await ensureOfficialScenario(COL);
    await expect(deleteScenario(official.id)).rejects.toThrow();
  });
});

describe('scenarios CRUD', () => {
  it('lists official first', async () => {
    await ensureOfficialScenario(COL);
    await createScenario(COL, 'Sim 1');
    const all = await listScenarios(COL);
    expect(all[0].isOfficial).toBe(true);
    expect(all[1].name).toBe('Sim 1');
  });

  it('renames and deletes custom scenarios', async () => {
    const s = await createScenario(COL, 'Draft');
    await renameScenario(s.id, 'Final four');
    await setScore(s.id, 'm1', { homeGoals: 1, awayGoals: 0 });
    await deleteScenario(s.id);
    expect(await listScenarios(COL)).toHaveLength(0);
    expect(await getResults(s.id)).toHaveLength(0);
  });

  it('copies results when duplicating', async () => {
    const src = await createScenario(COL, 'Source');
    await setScore(src.id, 'm1', { homeGoals: 3, awayGoals: 1 });
    await setKnockoutPick(src.id, 'W73', 'ARG');
    const copy = await createScenario(COL, 'Copy', src.id);
    const results = await getResults(copy.id);
    const picks = await getPicks(copy.id);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ homeGoals: 3, awayGoals: 1 });
    expect(picks[0]).toMatchObject({ slot: 'W73', teamId: 'ARG' });
  });
});

describe('setScore', () => {
  it('clamps negatives and stores penalties', async () => {
    const s = await createScenario(COL, 'S');
    await setScore(s.id, 'm1', {
      homeGoals: -2,
      awayGoals: 2,
      homePens: 4,
      awayPens: 5,
    });
    const [row] = await getResults(s.id);
    expect(row).toMatchObject({ homeGoals: 0, awayGoals: 2, homePens: 4, awayPens: 5, played: true });
  });

  it('clears a result when both goals are null', async () => {
    const s = await createScenario(COL, 'S');
    await setScore(s.id, 'm1', { homeGoals: 1, awayGoals: 0 });
    await setScore(s.id, 'm1', { homeGoals: null, awayGoals: null });
    expect(await getResults(s.id)).toHaveLength(0);
  });
});

describe('setKnockoutPick', () => {
  it('sets and clears a pick', async () => {
    const s = await createScenario(COL, 'S');
    await setKnockoutPick(s.id, '3-CDFG', 'BRA');
    expect(await getPicks(s.id)).toHaveLength(1);
    await setKnockoutPick(s.id, '3-CDFG', null);
    expect(await getPicks(s.id)).toHaveLength(0);
  });
});
