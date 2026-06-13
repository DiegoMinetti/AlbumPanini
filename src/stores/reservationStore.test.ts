import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useReservationStore,
  totalReservedFor,
  totalReservedAcrossTrades,
  isReserved,
  pendingTradesFor,
  stickerReservationsFor,
} from './reservationStore';

function reset() {
  useReservationStore.setState({ items: [] });
}

describe('reservationStore — sticker reservations', () => {
  beforeEach(reset);

  it('adds a sticker reservation', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
        count: 1,
      });
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].kind).toBe('sticker');
  });

  it('accumulates count when called twice for the same partner+sticker', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
        count: 1,
      });
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
        count: 1,
      });
    });
    const sticker = result.current.items[0];
    expect(sticker.kind).toBe('sticker');
    if (sticker.kind === 'sticker') {
      expect(sticker.count).toBe(2);
    }
  });

  it('keeps separate entries for different partners', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'Juan',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
    });
    expect(result.current.items).toHaveLength(2);
  });

  it('removes a sticker reservation by composite key', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
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

  it('totalReservedFor sums sticker-level counts', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
        count: 2,
      });
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'Juan',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
        count: 1,
      });
    });
    expect(totalReservedFor(result.current.items, 'wc-2026', 'USA-15')).toBe(3);
  });

  it('totalReservedAcrossTrades counts sticker + pending-trade give sides', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
        count: 1,
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

  it('isReserved is true when the sticker appears in any reservation', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addStickerReservation({
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

  it('pendingTradesFor returns trades sorted newest-first, scoped to collection', () => {
    const { result } = renderHook(() => useReservationStore());
    act(() => {
      result.current.addPendingTrade({
        collectionId: 'wc-2026',
        partner: 'Older',
        give: [],
        receive: [],
      });
      // Bump the clock so the second one is "newer".
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
        collectionId: 'wc-2026',
        stickerId: 'USA-15',
        partner: 'María',
        code: 'USA15',
        displayPrefix: 'USA',
        emoji: '🇺🇸',
      });
      result.current.addStickerReservation({
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
