import { describe, it, expect, beforeEach } from 'vitest';
import {
  addByCodes,
  adjustQuantity,
  decrementSticker,
  getInventoryMap,
  incrementSticker,
  resetInventory,
  setQuantity,
  getRecentActivity,
} from './inventoryService';
import { resetDb, seedTestCollection } from '@/tests/helpers';

let collectionId: string;

beforeEach(async () => {
  await resetDb();
  collectionId = await seedTestCollection();
});

describe('quantity mutations', () => {
  it('increments and decrements, clamped at zero', async () => {
    await incrementSticker(collectionId, 'ARG-1');
    await incrementSticker(collectionId, 'ARG-1');
    let map = await getInventoryMap(collectionId);
    expect(map.get('ARG-1')).toBe(2);

    await decrementSticker(collectionId, 'ARG-1');
    await decrementSticker(collectionId, 'ARG-1');
    await decrementSticker(collectionId, 'ARG-1'); // already 0
    map = await getInventoryMap(collectionId);
    expect(map.get('ARG-1')).toBe(0);
  });

  it('setQuantity sets absolute values', async () => {
    await setQuantity(collectionId, 'BRA-1', 5);
    const map = await getInventoryMap(collectionId);
    expect(map.get('BRA-1')).toBe(5);
  });

  it('adjustQuantity floors negatives to zero', async () => {
    await adjustQuantity(collectionId, 'BRA-1', -3);
    const map = await getInventoryMap(collectionId);
    expect(map.get('BRA-1')).toBe(0);
  });
});

describe('addByCodes', () => {
  it('resolves printed codes and accumulates copies', async () => {
    const report = await addByCodes(collectionId, [
      'ARG 1',
      'arg1',
      'BRA12',
      'ZZZ 9',
    ]);
    expect(report.matchedCount).toBe(2);
    expect(report.addedCopies).toBe(3);
    expect(report.unmatched).toContain('ZZZ 9');

    const map = await getInventoryMap(collectionId);
    expect(map.get('ARG-1')).toBe(2);
    expect(map.get('BRA-12')).toBe(1);
  });
});

describe('activity log', () => {
  it('records mutations newest-first', async () => {
    await incrementSticker(collectionId, 'ARG-1');
    await addByCodes(collectionId, ['BRA 1']);
    const activity = await getRecentActivity(collectionId, 10);
    expect(activity.length).toBeGreaterThanOrEqual(2);
    expect(activity[0].timestamp).toBeGreaterThanOrEqual(activity[1].timestamp);
  });
});

describe('resetInventory', () => {
  it('clears all quantities', async () => {
    await setQuantity(collectionId, 'ARG-1', 3);
    await resetInventory(collectionId);
    const map = await getInventoryMap(collectionId);
    expect(map.size).toBe(0);
  });
});
