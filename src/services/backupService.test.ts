import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createBackupPayload,
  exportBackup,
  parseBackupFile,
  restoreBackup,
  migrateBackup,
  backupFilename,
} from './backupService';
import { db } from '@/db';
import { installPackage } from './collectionLoader';
import { setQuantity } from './inventoryService';
import {
  ensureOfficialScenario,
  setScore,
  setKnockoutPick,
  getResults,
  getPicks,
} from './scenarioService';
import { resetDb, makeTestPackage } from '@/tests/helpers';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { BACKUP_MAGIC, BACKUP_VERSION } from '@/types/backup';
import { gzipJson } from '@/utils/compression';
import { readFileAsBytes } from '@/utils/file';

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBackupPayload', () => {
  it('captures collections + owned inventory', async () => {
    const c = await installPackage(makeTestPackage());
    await setQuantity(c.id, 'ARG-1', 2);
    const payload = await createBackupPayload(DEFAULT_SETTINGS);
    expect(payload.magic).toBe(BACKUP_MAGIC);
    expect(payload.collections).toHaveLength(1);
    const col = payload.collections[0];
    expect(col.stickers).toHaveLength(4);
    expect(col.inventory).toEqual([{ stickerId: 'ARG-1', quantity: 2 }]);
  });
});

describe('export + restore round-trip', () => {
  it('restores an exported backup into a clean DB', async () => {
    const c = await installPackage(makeTestPackage());
    await setQuantity(c.id, 'BRA-1', 3);

    const blob = await exportBackup(DEFAULT_SETTINGS);
    const bytes = await readFileAsBytes(blob);

    await resetDb();
    expect(await db.collections.count()).toBe(0);

    const { payload } = parseBackupFile(bytes);
    const { summary } = await restoreBackup(payload, { mode: 'replace' });
    expect(summary.collections).toBe(1);
    expect(summary.stickers).toBe(4);

    const restored = await db.inventory.get(`${c.id}::BRA-1`);
    expect(restored?.quantity).toBe(3);
  });

  it('preserves tournament scenarios, results and picks', async () => {
    const c = await installPackage(makeTestPackage());
    const scenario = await ensureOfficialScenario(c.id);
    await setScore(scenario.id, 'M1', { homeGoals: 2, awayGoals: 1 });
    await setKnockoutPick(scenario.id, 'W73', 'ARG');

    const blob = await exportBackup(DEFAULT_SETTINGS);
    const bytes = await readFileAsBytes(blob);

    await resetDb();
    expect(await db.scenarios.count()).toBe(0);

    const { payload } = parseBackupFile(bytes);
    const { summary } = await restoreBackup(payload, { mode: 'replace' });
    expect(summary.scenarios).toBe(1);

    const restoredScenario = await db.scenarios.get(scenario.id);
    expect(restoredScenario?.isOfficial).toBe(true);
    const results = await getResults(scenario.id);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      matchId: 'M1',
      homeGoals: 2,
      awayGoals: 1,
    });
    const picks = await getPicks(scenario.id);
    expect(picks).toEqual([
      expect.objectContaining({ slot: 'W73', teamId: 'ARG' }),
    ]);
  });

  it('self-heals an old backup by re-hydrating the tournament from its package', async () => {
    // A pre-tournament backup carries no `tournament` block on the collection.
    const c = await installPackage(makeTestPackage());
    const payload = await createBackupPayload(DEFAULT_SETTINGS);
    expect(payload.collections[0].tournament).toBeUndefined();

    // The bundled package the collection came from *does* ship a tournament.
    const miniTournament = {
      groups: [{ id: 'A', teamIds: ['ARG', 'BRA'] }],
      matches: [
        {
          id: 'M1',
          matchNumber: 1,
          stage: 'group',
          group: 'A',
          homeTeamId: 'ARG',
          awayTeamId: 'BRA',
        },
      ],
    };
    const manifest = {
      collections: [
        {
          id: 'test-col',
          file: 'test-col.json',
          name: 'Test Collection',
          version: '1.0.0',
          language: 'en',
        },
      ],
    };
    const pkg = { ...makeTestPackage(), tournament: miniTournament };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        const body = u.includes('index.json') ? manifest : pkg;
        return { ok: true, status: 200, json: async () => body } as Response;
      })
    );

    await resetDb();
    await restoreBackup(payload, { mode: 'replace' });

    const restored = await db.collections.get(c.id);
    expect(restored?.tournament).toBeDefined();
    expect(restored?.tournament?.groups).toHaveLength(1);
  });

  it('merge keeps existing tournament data when the backup has none', async () => {
    // Simulate an old (v1) backup that carries no scenarios.
    const c = await installPackage(makeTestPackage());
    const blob = await exportBackup(DEFAULT_SETTINGS);
    const oldBytes = await readFileAsBytes(blob);

    // User has since built up tournament data.
    const scenario = await ensureOfficialScenario(c.id);
    await setScore(scenario.id, 'M1', { homeGoals: 3, awayGoals: 0 });

    const { payload } = parseBackupFile(oldBytes);
    expect(payload.collections[0].scenarios).toHaveLength(0);

    await restoreBackup(payload, { mode: 'merge' });

    // Cup data must survive a merge that doesn't include it.
    expect(await db.scenarios.get(scenario.id)).toBeTruthy();
    const results = await getResults(scenario.id);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ homeGoals: 3, awayGoals: 0 });
  });
});

describe('validation + migration', () => {
  it('rejects files without the magic signature', () => {
    const bytes = gzipJson({ foo: 'bar' });
    expect(() => parseBackupFile(bytes)).toThrow();
  });

  it('rejects newer-than-supported versions', () => {
    expect(() =>
      migrateBackup({ magic: BACKUP_MAGIC, version: BACKUP_VERSION + 99 })
    ).toThrow();
  });

  it('throws on corrupt (non-gzip) bytes', () => {
    expect(() => parseBackupFile(new Uint8Array([1, 2, 3]))).toThrow();
  });
});

describe('backupFilename', () => {
  it('produces an .albumbackup name', () => {
    expect(backupFilename(new Date('2026-01-02T03:04:05Z'))).toMatch(
      /^panini-2026-01-02-03-04-05\.albumbackup$/
    );
  });
});
