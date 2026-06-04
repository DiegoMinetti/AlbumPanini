import { describe, it, expect, beforeEach } from 'vitest';
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
import { resetDb, makeTestPackage } from '@/tests/helpers';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { BACKUP_MAGIC, BACKUP_VERSION } from '@/types/backup';
import { gzipJson } from '@/utils/compression';
import { readFileAsBytes } from '@/utils/file';

beforeEach(async () => {
  await resetDb();
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
