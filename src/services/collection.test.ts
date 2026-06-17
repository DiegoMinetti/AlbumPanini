import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  compareSemver,
  fetchManifest,
  fetchPackage,
  installPackage,
  packageToRows,
  isInstalled,
  syncDefaultCollection,
  DEFAULT_COLLECTION_ID,
} from './collectionLoader';
import {
  duplicateCollection,
  renameCollection,
  archiveCollection,
  deleteCollection,
  listCollections,
  getStickers,
} from './collectionService';
import { setQuantity, getInventoryMap } from '@/services/inventoryService';
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

describe('compareSemver', () => {
  it('orders dotted numeric segments', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemver('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareSemver('1', '1.0.0')).toBe(0);
    expect(compareSemver('1.0', '1.0.1')).toBeLessThan(0);
  });

  it('falls back to zero for non-numeric parts', () => {
    // Pre-release tags are ignored — only the numeric segments matter.
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBe(0);
  });
});

describe('syncDefaultCollection', () => {
  function stubManifestEntry(entry: {
    id: string;
    file: string;
    name?: string;
    version: string;
  }) {
    const fullEntry = {
      name: entry.name ?? 'Test World Cup',
      description: '',
      language: 'es',
      ...entry,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('index.json')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ collections: [fullEntry] }),
          };
        }
        if (url.endsWith(entry.file)) {
          return {
            ok: true,
            status: 200,
            json: async () =>
              makeTestPackage({ id: entry.id, version: entry.version }),
          };
        }
        return { ok: false, status: 404 };
      })
    );
  }

  it('is a no-op when the default collection is not installed yet', async () => {
    // First-time install is the job of `seedDefaultCollection` (gated by the
    // `defaultCollectionSeeded` settings flag). `syncDefaultCollection` is
    // for *re-syncing* an existing install when the manifest version moves
    // forward, so it must not first-time-install — otherwise it would
    // clobber E2E setups that have explicitly opted out of the WC26 seed.
    stubManifestEntry({
      id: DEFAULT_COLLECTION_ID,
      file: 'wc.json',
      version: '2.0.0',
    });
    const result = await syncDefaultCollection();
    expect(result).toBeNull();
    expect(await isInstalled(DEFAULT_COLLECTION_ID)).toBe(false);
  });

  it('is a no-op when the installed version is current', async () => {
    // Seed at 2.0.0, manifest is also 2.0.0.
    await installPackage(
      makeTestPackage({ id: DEFAULT_COLLECTION_ID, version: '2.0.0' })
    );
    stubManifestEntry({
      id: DEFAULT_COLLECTION_ID,
      file: 'wc.json',
      version: '2.0.0',
    });
    const result = await syncDefaultCollection();
    expect(result).toBeNull();
    const stored = await db.collections.get(DEFAULT_COLLECTION_ID);
    expect(stored?.version).toBe('2.0.0');
  });

  it('re-installs the catalog when the manifest version is newer', async () => {
    // Old install + a sticker the user has marked in inventory.
    await installPackage(
      makeTestPackage({ id: DEFAULT_COLLECTION_ID, version: '1.0.0' })
    );
    await setQuantity(DEFAULT_COLLECTION_ID, 'ARG-1', 5);

    stubManifestEntry({
      id: DEFAULT_COLLECTION_ID,
      file: 'wc.json',
      version: '1.1.0',
    });
    const result = await syncDefaultCollection();
    expect(result?.updated).toBe(true);
    expect(result?.collection.version).toBe('1.1.0');

    // Inventory survived the re-install.
    const map = await getInventoryMap(DEFAULT_COLLECTION_ID);
    expect(map.get('ARG-1')).toBe(5);

    // createdAt preserved, status preserved.
    const stored = await db.collections.get(DEFAULT_COLLECTION_ID);
    expect(stored?.version).toBe('1.1.0');
  });

  it('never downgrades an installation ahead of the manifest', async () => {
    await installPackage(
      makeTestPackage({ id: DEFAULT_COLLECTION_ID, version: '2.5.0' })
    );
    stubManifestEntry({
      id: DEFAULT_COLLECTION_ID,
      file: 'wc.json',
      version: '2.0.0',
    });
    const result = await syncDefaultCollection();
    expect(result).toBeNull();
    const stored = await db.collections.get(DEFAULT_COLLECTION_ID);
    expect(stored?.version).toBe('2.5.0');
  });

  it('returns null when the manifest has no entry for the default collection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ collections: [] }),
      }))
    );
    expect(await syncDefaultCollection()).toBeNull();
  });
});
