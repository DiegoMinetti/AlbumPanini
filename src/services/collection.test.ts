import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchManifest,
  fetchPackage,
  installPackage,
  packageToRows,
  isInstalled,
} from './collectionLoader';
import {
  duplicateCollection,
  renameCollection,
  archiveCollection,
  deleteCollection,
  listCollections,
  getStickers,
} from './collectionService';
import { setQuantity, getInventoryMap } from './inventoryService';
import { db } from '@/db';
import { resetDb, makeTestPackage } from '@/tests/helpers';

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('packageToRows', () => {
  it('namespaces uids and normalizes codes', () => {
    const { collection, teams, stickers } = packageToRows(
      makeTestPackage(),
      'col-x'
    );
    expect(collection.id).toBe('col-x');
    expect(teams[0].uid).toBe('col-x::ARG');
    expect(stickers[0].uid).toBe('col-x::ARG-1');
    expect(stickers[0].normalizedCode).toBe('ARG1');
  });
});

describe('installPackage', () => {
  it('installs catalog rows and preserves inventory on re-install', async () => {
    const created = await installPackage(makeTestPackage());
    expect(await isInstalled(created.id)).toBe(true);
    expect(await getStickers(created.id)).toHaveLength(4);

    await setQuantity(created.id, 'ARG-1', 2);
    await installPackage(makeTestPackage({ version: '1.1.0' }));
    const map = await getInventoryMap(created.id);
    expect(map.get('ARG-1')).toBe(2); // inventory survived re-sync
    const updated = await db.collections.get(created.id);
    expect(updated?.version).toBe('1.1.0');
  });
});

describe('fetch helpers', () => {
  it('fetchManifest parses the manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          collections: [
            { id: 'a', file: 'a.json', name: 'A', version: '1.0.0' },
          ],
        }),
      }))
    );
    const entries = await fetchManifest();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('a');
  });

  it('fetchManifest returns [] on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }))
    );
    expect(await fetchManifest()).toEqual([]);
  });

  it('fetchPackage validates the package', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => makeTestPackage(),
      }))
    );
    const pkg = await fetchPackage({ file: 'x.json' });
    expect(pkg.stickers).toHaveLength(4);
  });
});

describe('lifecycle', () => {
  it('renames, archives and deletes', async () => {
    const created = await installPackage(makeTestPackage());
    await renameCollection(created.id, 'New Name');
    expect((await db.collections.get(created.id))?.name).toBe('New Name');

    await archiveCollection(created.id);
    expect((await db.collections.get(created.id))?.status).toBe('archived');

    await deleteCollection(created.id);
    expect(await db.collections.get(created.id)).toBeUndefined();
    expect(await getStickers(created.id)).toHaveLength(0);
  });

  it('duplicates including inventory', async () => {
    const created = await installPackage(makeTestPackage());
    await setQuantity(created.id, 'ARG-1', 3);
    const newId = await duplicateCollection(created.id, {
      name: 'Copy',
      includeInventory: true,
    });
    expect(newId).not.toBe(created.id);
    const map = await getInventoryMap(newId);
    expect(map.get('ARG-1')).toBe(3);
    const all = await listCollections();
    expect(all).toHaveLength(2);
  });

  it('rename rejects empty names', async () => {
    const created = await installPackage(makeTestPackage());
    await expect(renameCollection(created.id, '   ')).rejects.toThrow();
  });
});
