import { describe, it, expect, beforeEach } from 'vitest';
import {
  applySyncPayload,
  assembleSyncChunks,
  buildSyncPayload,
  buildSyncUrl,
  chunkSync,
  clearSyncSession,
  decodeSync,
  encodeSync,
  parseSyncUrl,
  recordSyncChunk,
  type ParsedSyncLink,
} from './syncService';
import { installPackage } from './collectionLoader';
import { setQuantity } from './inventoryService';
import { ensureOfficialScenario, setScore } from './scenarioService';
import { db } from '@/db';
import { resetDb, makeTestPackage } from '@/tests/helpers';
import { DEFAULT_SETTINGS } from '@/types/settings';

beforeEach(async () => {
  await resetDb();
  clearSyncSession();
});

describe('buildSyncPayload + encode/decode', () => {
  it('captures inventory only (no sticker metadata)', async () => {
    const c = await installPackage(makeTestPackage());
    await setQuantity(c.id, 'ARG-1', 2);
    await setQuantity(c.id, 'BRA-1', 1);

    const payload = await buildSyncPayload(DEFAULT_SETTINGS);
    expect(payload.v).toBeGreaterThan(0);
    expect(payload.c).toHaveLength(1);
    const sc = payload.c[0];
    expect(sc.i).toBe(c.id);
    expect(sc.q).toEqual(
      expect.arrayContaining([
        ['ARG-1', 2],
        ['BRA-1', 1],
      ])
    );
    expect(sc.q).toHaveLength(2);
    expect(sc.s).toEqual([]);

    // round-trip
    const text = encodeSync(payload);
    expect(typeof text).toBe('string');
    expect(decodeSync(text)).toEqual(payload);
  });

  it('captures scenarios + results', async () => {
    const c = await installPackage(makeTestPackage());
    const scenario = await ensureOfficialScenario(c.id);
    await setScore(scenario.id, 'M1', { homeGoals: 2, awayGoals: 1 });

    const payload = await buildSyncPayload(DEFAULT_SETTINGS);
    const sc = payload.c.find((x: { i: string }) => x.i === c.id)!;
    expect(sc.s).toHaveLength(1);
    expect(sc.s[0].i).toBe(scenario.id);
    expect(sc.s[0].r).toEqual([['M1', 2, 1, undefined, undefined, true]]);
  });
});

describe('chunkSync + URL flow', () => {
  it('returns a single chunk for small payloads', () => {
    const chunks = chunkSync('short-data');
    expect(chunks.total).toBe(1);
    expect(chunks.pieces).toEqual(['short-data']);
  });

  it('splits large payloads into multiple chunks', () => {
    const big = 'x'.repeat(4000);
    const chunks = chunkSync(big);
    expect(chunks.total).toBeGreaterThan(1);
    expect(chunks.pieces.join('')).toBe(big);
    expect(chunks.pieces[0]?.length).toBeLessThanOrEqual(1800);
  });

  it('builds and parses a sync URL round-trip', () => {
    const chunks = { sid: 'abc123', total: 2, pieces: ['hello', 'world'] };
    const url = buildSyncUrl({
      sid: chunks.sid,
      idx: 1,
      total: chunks.total,
      data: chunks.pieces[0],
    });
    expect(url).toContain('sync=abc123');
    expect(url).toContain('i=1');
    expect(url).toContain('n=2');
    expect(url).toContain('c=hello');
    const parsed = parseSyncUrl(url);
    expect(parsed).toEqual({
      isSingle: false,
      sid: 'abc123',
      total: 2,
      idx: 1,
      data: 'hello',
    });
  });

  it('returns null for a non-sync URL', () => {
    expect(parseSyncUrl('https://example.com/AlbumPanini/#/backup')).toBeNull();
  });
});

describe('recordSyncChunk / assembleSyncChunks', () => {
  const mkLink = (
    sid: string,
    idx: number,
    total: number,
    data: string
  ): ParsedSyncLink => ({
    isSingle: total <= 1,
    sid,
    idx,
    total,
    data,
  });

  it('accumulates chunks in order and signals completion', () => {
    const r1 = recordSyncChunk(mkLink('s1', 1, 3, 'aaa'));
    expect(r1?.isComplete).toBe(false);
    expect(r1?.session.chunks.size).toBe(1);

    const r2 = recordSyncChunk(mkLink('s1', 2, 3, 'bbb'));
    expect(r2?.isComplete).toBe(false);
    expect(r2?.session.chunks.size).toBe(2);

    const r3 = recordSyncChunk(mkLink('s1', 3, 3, 'ccc'));
    expect(r3?.isComplete).toBe(true);
    expect(r3?.session.chunks.size).toBe(3);

    expect(assembleSyncChunks(r3!.session)).toBe('aaabbbccc');
  });

  it('rejects out-of-order chunks for a new session', () => {
    const r = recordSyncChunk(mkLink('s1', 2, 3, 'bbb'));
    expect(r).toBeNull();
  });

  it('replaces a stale session on a fresh chunk 1', () => {
    recordSyncChunk(mkLink('old', 1, 2, 'a'));
    const r = recordSyncChunk(mkLink('new', 1, 1, 'only'));
    expect(r?.session.sid).toBe('new');
    expect(r?.isComplete).toBe(true);
  });
});

describe('applySyncPayload', () => {
  it('merges inventory into the local DB', async () => {
    const c = await installPackage(makeTestPackage());
    // Seed some inventory so the collection is actually emitted in the
    // payload (buildSyncPayload only includes collections with at least one
    // inventory row or scenario).
    await setQuantity(c.id, 'ARG-1', 1);
    const payload = await buildSyncPayload(DEFAULT_SETTINGS);
    expect(payload.c[0]).toBeDefined();
    // Mutate the payload so we know it came from "the other phone".
    payload.c[0]!.q = [['ARG-1', 4], ['BRA-12', 1]];

    const summary = await applySyncPayload(payload, { mode: 'merge' });
    expect(summary.inventoryItems).toBe(2);
    const inv = await db.inventory.get(`${c.id}::ARG-1`);
    expect(inv?.quantity).toBe(4);
  });

  it('replaces inventory when mode is replace', async () => {
    const c = await installPackage(makeTestPackage());
    await setQuantity(c.id, 'ARG-1', 9);
    const payload = await buildSyncPayload(DEFAULT_SETTINGS);
    expect(payload.c[0]).toBeDefined();
    payload.c[0]!.q = [['BRA-1', 2]];

    const summary = await applySyncPayload(payload, { mode: 'replace' });
    expect(summary.inventoryItems).toBe(1);
    const removed = await db.inventory.get(`${c.id}::ARG-1`);
    expect(removed).toBeUndefined();
    const added = await db.inventory.get(`${c.id}::BRA-1`);
    expect(added?.quantity).toBe(2);
  });

  it('reports collections missing locally without failing', async () => {
    const c = await installPackage(makeTestPackage());
    await setQuantity(c.id, 'ARG-1', 2);
    const payload = await buildSyncPayload(DEFAULT_SETTINGS);
    expect(payload.c[0]).toBeDefined();
    // Add a fictional collection not installed locally.
    payload.c.push({
      i: 'not-installed',
      v: '',
      q: [['X-1', 1]],
      s: [],
    });
    const summary = await applySyncPayload(payload);
    expect(summary.missingCollections).toContain('not-installed');
    // The installed collection's data should still apply.
    const inv = await db.inventory.get(`${c.id}::ARG-1`);
    expect(inv).toBeDefined();
  });
});
