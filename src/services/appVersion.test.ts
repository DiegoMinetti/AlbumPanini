import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@/db';
import { resetDb } from '@/tests/helpers';
import type { recordAppLaunch as RecordAppLaunchFn } from './appVersion';

describe('recordAppLaunch', () => {
  beforeEach(async () => {
    await resetDb();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function withBuildSha(sha: string): void {
    vi.stubEnv('VITE_APP_VERSION', sha);
  }

  async function loadRecordAppLaunch(): Promise<typeof RecordAppLaunchFn> {
    const mod = await import('@/services/appVersion');
    return mod.recordAppLaunch;
  }

  it('writes the first row on the very first launch', async () => {
    withBuildSha('abc1234567890abcdef');
    const recordAppLaunch = await loadRecordAppLaunch();
    const result = await recordAppLaunch();
    expect(result.updated).toBe(false);
    expect(result.previousVersion).toBeUndefined();
    expect(result.currentSha).toBe('abc1234567890abcdef');
    expect(result.currentVersion).toBe('vabc1234');
    const rows = await db.appVersions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      buildSha: 'abc1234567890abcdef',
      isCurrent: true,
    });
  });

  it('reports no update when the SHA matches the previous launch', async () => {
    withBuildSha('abc1234567890abcdef');
    const recordAppLaunch = await loadRecordAppLaunch();
    await recordAppLaunch();
    const second = await recordAppLaunch();
    expect(second.updated).toBe(false);
    expect(second.previousVersion).toBe('vabc1234');
    expect(await db.appVersions.toArray()).toHaveLength(1);
  });

  it('flags an update + writes a new row when the SHA changes', async () => {
    withBuildSha('aaaa1111aaaa1111aaaa');
    const recordAppLaunch = await loadRecordAppLaunch();
    await recordAppLaunch();
    withBuildSha('bbbb2222bbbb2222bbbb');
    vi.resetModules();
    const recordAppLaunch2 = await loadRecordAppLaunch();
    const second = await recordAppLaunch2();
    expect(second.updated).toBe(true);
    expect(second.previousVersion).toBe('vaaaa111');
    expect(second.currentVersion).toBe('vbbbb222');
    const rows = await db.appVersions.orderBy('installedAt').toArray();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.isCurrent).toBe(false);
    expect(rows[1]).toMatchObject({
      buildSha: 'bbbb2222bbbb2222bbbb',
      isCurrent: true,
    });
  });
});
