import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildOwnPosition,
  positionToPayload,
  encodeExchange,
  decodeExchange,
  computeMatch,
  type OwnPosition,
} from './qrService';
import { installPackage } from './collectionLoader';
import { setQuantity } from './inventoryService';
import { resetDb, makeTestPackage } from '@/tests/helpers';
import { EXCHANGE_VERSION } from '@/types/exchange';

beforeEach(async () => {
  await resetDb();
});

describe('buildOwnPosition', () => {
  it('classifies duplicates and missing', async () => {
    const c = await installPackage(makeTestPackage());
    await setQuantity(c.id, 'ARG-1', 2); // duplicate
    await setQuantity(c.id, 'ARG-2', 1); // owned, not spare
    // BRA-1, BRA-12 remain missing
    const pos = await buildOwnPosition(c.id);
    expect(pos.duplicates).toEqual(['ARG-1']);
    expect(pos.missing.sort()).toEqual(['BRA-1', 'BRA-12']);
  });
});

describe('encode/decode exchange', () => {
  it('round-trips a payload', () => {
    const payload = positionToPayload(
      {
        collectionId: 'wc',
        collectionVersion: '1.0.0',
        duplicates: ['ARG-1'],
        missing: ['BRA-1'],
      },
      'Diego'
    );
    expect(payload.v).toBe(EXCHANGE_VERSION);
    const text = encodeExchange(payload);
    expect(decodeExchange(text)).toEqual(payload);
  });
});

describe('computeMatch', () => {
  const mine: OwnPosition = {
    collectionId: 'wc',
    collectionVersion: '1.0.0',
    duplicates: ['ARG-1', 'ARG-2'],
    missing: ['BRA-1', 'BRA-12'],
  };

  it('intersects give and receive', () => {
    const theirs = positionToPayload({
      collectionId: 'wc',
      collectionVersion: '1.0.0',
      duplicates: ['BRA-1'], // I'm missing this -> can receive
      missing: ['ARG-1'], // I have spare -> can give
    });
    const match = computeMatch(mine, theirs);
    expect(match.sameCollection).toBe(true);
    expect(match.iCanGive).toEqual(['ARG-1']);
    expect(match.iCanReceive).toEqual(['BRA-1']);
    expect(match.mutualCount).toBe(1);
  });

  it('flags different collection', () => {
    const theirs = positionToPayload({
      collectionId: 'other',
      collectionVersion: '1.0.0',
      duplicates: [],
      missing: [],
    });
    expect(computeMatch(mine, theirs).sameCollection).toBe(false);
  });

  it('flags version mismatch', () => {
    const theirs = positionToPayload({
      collectionId: 'wc',
      collectionVersion: '2.0.0',
      duplicates: [],
      missing: [],
    });
    expect(computeMatch(mine, theirs).versionMismatch).toBe(true);
  });
});
