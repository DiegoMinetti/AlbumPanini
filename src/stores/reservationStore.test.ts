import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useReservationStore,
  totalReservedFor,
  totalReservedAcrossTrades,
  isReserved,
  reservedPartnerFor,
  pendingTradesFor,
  stickerReservationsFor,
} from './reservationStore';

function reset() {
  useReservationStore.setState({ items: [] });
}

describe('reservationStore — sticker reservations (per-copy)', () => {
  beforeEach(reset);

  it('adds a single sticker copy as one item', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].kind).toBe('sticker');
  });

  it('treats each copy as independent (different instanceIds)', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        instanceId: 'b',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'Juan',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
    });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].partner).toBe('María');
    expect(result.current.items[1].partner).toBe('Juan');
  });

  it('removes a single copy by instanceId', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        instanceId: 'b',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'Juan',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.removeStickerReservationByInstance('a');
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].partner).toBe('Juan');
  });

  it('removes every copy matching (collectionId, stickerId, partner)', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        instanceId: 'b',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.removeStickerReservation('wc-2026', 'USA-15', 'María');
    });
    expect(result.current.items).toHaveLength(0);
  });
});

describe('reservationStore — pending trades', () => {
  beforeEach(reset);

  it('adds a pending trade and returns its id', () => {
    const { result } = renderHook(() => useReservationStore());
    let id = '';
    act(() => {
      id = result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'María',
        give: [
          { stickerId: 'USA-15', code: 'USA15', displayPrefix: 'USA', emoji: '🇺🇸' },
        ],
        receive: [
          { stickerId: 'MEX-1', code: 'MEX1', displayPrefix: 'MEX', emoji: '🇲🇽' },
        ],
      });
    });
    expect(id).toMatch(/^trade-|^[0-9a-f-]{36}$/);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].kind).toBe('trade');
  });

  it('confirmTrade returns the trade and removes it from the store', () => {
    const { result } = renderHook(() => useReservationStore());
    let id = '';
    act(() => {
      id = result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'María',
        give: [
          { stickerId: 'USA-15', code: 'USA15', displayPrefix: 'USA', emoji: '🇺🇸' },
        ],
        receive: [
          { stickerId: 'MEX-1', code: 'MEX1', displayPrefix: 'MEX', emoji: '🇲🇽' },
        ],
      });
    });
    let confirmed: ReturnType<typeof result.current.confirmTrade> = null;
    act(() => {
      confirmed = result.current.confirmTrade(id);
    });
    expect(confirmed).not.toBeNull();
    expect(confirmed?.kind).toBe('trade');
    if (confirmed?.kind === 'trade') {
      expect(confirmed.tradeId).toBe(id);
    }
    expect(result.current.items).toHaveLength(0);
  });

  it('confirmTrade returns null for an unknown id', () => {
    const { result } = renderHook(() => useReservationStore());
    let confirmed: ReturnType<typeof result.current.confirmTrade> = null;
    act(() => {
      confirmed = result.current.confirmTrade('does-not-exist');
    });
    expect(confirmed).toBeNull();
  });

  it('cancelTrade removes a pending trade without returning it', () => {
    const { result } = renderHook(() => useReservationStore());
    let id = '';
    act(() => {
      id = result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'María',
        give: [],
        receive: [],
      });
    });
    act(() => result.current.cancelTrade(id));
    expect(result.current.items).toHaveLength(0);
  });
});

describe('reservationStore — selectors', () => {
  beforeEach(reset);

  it('totalReservedFor counts each copy as 1', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        instanceId: 'b',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'Juan',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
    });
    expect(totalReservedFor(result.current.items, 'wc-2026', 'USA-15')).toBe(2);
  });

  it('totalReservedAcrossTrades counts per-copy + trade `give`', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'Juan',
        give: [
          { stickerId: 'USA-15', code: 'USA15', displayPrefix: 'USA', emoji: '🇺🇸' },
        ],
        receive: [],
      });
    });
    expect(totalReservedAcrossTrades(result.current.items, 'wc-2026', 'USA-15')).toBe(2);
  });

  it('isReserved is true when any copy is reserved', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
    });
    expect(isReserved(result.current.items, 'wc-2026', 'USA-15')).toBe(true);
    expect(isReserved(result.current.items, 'wc-2026', 'ARG-1')).toBe(false);
  });

  it('reservedPartnerFor returns the first partner; joins multiple sorted', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        instanceId: 'b',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'Juan',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
    });
    expect(
      reservedPartnerFor(result.current.items, 'wc-2026', 'USA-15')
    ).toBe('Juan, María');
  });

  it('pendingTradesFor returns trades sorted newest-first, scoped to collection', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'Older',
        give: [],
        receive: [],
      });
      const realNow = Date.now;
      Date.now = () => realNow() + 1000;
      result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'Newer',
        give: [],
        receive: [],
      });
      result.current.addPendingTrade({
        collectionId: 'pokemon-151',
        partner: 'Other collection',
        give: [],
        receive: [],
      });
      Date.now = realNow;
    });
    const trades = pendingTradesFor(result.current.items, 'wc-2026');
    expect(trades).toHaveLength(2);
    expect(trades[0].partner).toBe('Newer');
    expect(trades[1].partner).toBe('Older');
  });

  it('stickerReservationsFor returns sticker reservations, scoped to collection', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        instanceId: 'a',
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        instanceId: 'b',
        collectionId: 'pokemon-151',
        stickerId: 'PK-25',
        partner: 'Ash',
        code: 'PK25',
        displayPrefix: 'PK',
        emoji: '⚡',
      });
    });
    const wc = stickerReservationsFor(result.current.items, 'wc-2026');
    expect(wc).toHaveLength(1);
    expect(wc[0].stickerId).toBe('USA-15');
  });
});
