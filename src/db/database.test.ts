import { describe, it, expect, beforeEach } from 'vitest';
import { db, LATEST_DB_VERSION } from './database';
import { migrations } from './migrations';
import { resetDb, seedTestCollection } from '@/tests/helpers';

beforeEach(async () => {
  await resetDb();
});

describe('database', () => {
  it('opens and records a version history', async () => {
    await db.open();
    const history = await db.getVersionHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].version).toBe(1);
  });

  it('LATEST_DB_VERSION matches the highest migration', () => {
    const highest = Math.max(...migrations.map((m) => m.version));
    expect(LATEST_DB_VERSION).toBe(highest);
  });

  it('clearAllData wipes collection tables', async () => {
    await seedTestCollection();
    expect(await db.collections.count()).toBe(1);
    await db.clearAllData();
    expect(await db.collections.count()).toBe(0);
    expect(await db.stickers.count()).toBe(0);
  });
});
