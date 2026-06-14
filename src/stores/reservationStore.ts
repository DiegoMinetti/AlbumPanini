import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';

/**
 * "Reservations" let a user set aside individual sticker copies (or
 * whole pending trades) for a specific trade partner *before* they meet
 * in person. The items are still in the inventory and still count as
 * duplicates, but the user has a dedicated view of what's earmarked
 * for whom.
 *
 * Each sticker copy is its own atomic unit. If the user has 3 copies of
 * USA15 and reserves 1 for María, that single copy is what's committed.
 * They can still see the 2 free USA15 in the inventory. This is the
 * model that makes the "1 chip per copy" UI possible: each chip is one
 * committed (or free) inventory slot, and tapping a chip toggles its
 * reserved-for partner.
 *
 * Two flavours of reservation live here:
 *
 *  1. `StickerReservation` — a single sticker copy earmarked for a
 *     partner. The `instanceId` distinguishes this copy from other
 *     copies of the same sticker in the inventory.
 *
 *  2. `PendingTrade` — a full bilateral trade in waiting: "I give X, Y, Z
 *     to {{partner}} and they give me A, B back". Created from the paste
 *     flow when the user wants to remember a match but hasn't done the
 *     physical trade yet. Confirming it later applies the inventory
 *     deltas in one shot; cancelling it just removes the reservation.
 *
 * Both live in the same `items` array, discriminated by `kind`. The store
 * exposes a unified API and a few selectors so the UI can show "all my
 * pending trades with María" without having to know which kind it is.
 */

export type ReservationItem = StickerReservation | PendingTrade;

/**
 * A single sticker copy is identified by a deterministic slot id built
 * from the (collection, sticker, slot) triple:
 *
 *   slot:<collectionId>:<stickerId>:<slotIndex>
 *
 * `slotIndex` is 0-based over the inventory of that sticker. Slot 0 is
 * the "album copy" and never carries a reservation, so the first
 * resrvable slot is index 1. Storing the slot id on the reservation
 * (rather than a random uuid) means the UI can look up "is this visible
 * chip reserved?" by computing the same slot id from the iteration
 * index, without needing to keep a parallel map.
 */
export function stickerSlotId(
  collectionId: string,
  stickerId: string,
  slotIndex: number
): string {
  return `slot:${collectionId}:${stickerId}:${slotIndex}`;
}

export interface StickerReservation {
  kind: 'sticker';
  /**
   * Deterministic id of the sticker copy this reservation binds to
   * (see `stickerSlotId`). Stored as `instanceId` for back-compat with
   * the rest of the code that already reads that field.
   */
  instanceId: string;
  /** Collection this reservation belongs to. */
  collectionId: string;
  /** Sticker id within that collection. */
  stickerId: string;
  /**
   * 0-based slot index over the sticker's inventory. Slot 0 is the
   * album copy and never carries a reservation; reservations always
   * live on slot 1+.
   */
  slotIndex: number;
  /** Free-form partner label (e.g. "María"). */
  partner: string;
  /** Original printed code captured for display (e.g. "USA15"). */
  code: string;
  /** Display label for the team/group, e.g. "USA". */
  displayPrefix: string;
  /** Decorative emoji captured from the source list, e.g. "🇺🇸". */
  emoji: string;
  /** When the reservation was first created (ms epoch). */
  createdAt: number;
}

export interface PendingTrade {
  kind: 'trade';
  /** Synthetic id unique within the store (used to confirm/cancel). */
  tradeId: string;
  /** Collection this trade belongs to. */
  collectionId: string;
  /** Free-form partner label. */
  partner: string;
  /** Sticker ids the user is offering in this trade. */
  give: TradeStickerRef[];
  /** Sticker ids the user is asking for in this trade. */
  receive: TradeStickerRef[];
  /** Optional human note ("in the playground", "after the game", ...). */
  note?: string;
  /** When the reservation was first created (ms epoch). */
  createdAt: number;
}

export interface TradeStickerRef {
  stickerId: string;
  code: string;
  displayPrefix: string;
  emoji: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ReservationState {
  items: ReservationItem[];

  // Sticker-level actions
  /**
   * Reserve one specific sticker copy. The UI is responsible for
   * generating the slot-bound `instanceId` via `stickerSlotId(...)`.
   * This keeps the store DB-agnostic.
   */
  addStickerReservation: (
    input: Omit<StickerReservation, 'kind' | 'createdAt'>
  ) => void;
  /**
   * Remove a sticker-level reservation by its instance id (= slot id).
   * Use this (not the partner+stickerId combo) when freeing a specific
   * copy.
   */
  removeStickerReservationByInstance: (instanceId: string) => void;
  /**
   * Legacy: remove every reservation matching
   * (collectionId, stickerId, partner). Kept for bulk cleanup flows.
   * Prefer the by-instance version when releasing one chip.
   */
  removeStickerReservation: (
    collectionId: string,
    stickerId: string,
    partner: string
  ) => void;

  // Trade-level actions
  addPendingTrade: (
    input: Omit<PendingTrade, 'kind' | 'tradeId' | 'createdAt'>
  ) => string;
  confirmTrade: (tradeId: string) => PendingTrade | null;
  cancelTrade: (tradeId: string) => void;

  // Collection-scoped cleanup
  clearForCollection: (collectionId: string) => void;
  clearAll: () => void;
}

const STORAGE_KEY = 'panini-reservations';
const STORAGE_VERSION = 4; // bump: instanceId is now a deterministic slot id

// ---------------------------------------------------------------------------
// Persistence plumbing (copied from the previous version — see git history)
// ---------------------------------------------------------------------------

const memoryStore = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return (
        globalThis.localStorage?.getItem(name) ?? memoryStore.get(name) ?? null
      );
    } catch {
      return memoryStore.get(name) ?? null;
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
    memoryStore.set(name, value);
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    memoryStore.delete(name);
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a stable instance id for a single sticker copy. */
function generateInstanceId(): string {
  const g: typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Tiny non-cryptographic id (good enough for a local store). */
function generateTradeId(): string {
  const g: typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `trade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Migration: v1 → v2 (unify items), v2 → v3 (instance per copy)
// ---------------------------------------------------------------------------

/** Legacy v1 shape — pre-items[]. */
interface LegacyV1State {
  reservations: Array<{
    collectionId: string;
    stickerId: string;
    partner: string;
    count: number;
    code: string;
    displayPrefix: string;
    emoji: string;
    createdAt: number;
  }>;
}

/** Legacy v2 shape — items[] with count per sticker reservation. */
interface LegacyV2State {
  items: Array<
    | {
        kind: 'sticker';
        collectionId: string;
        stickerId: string;
        partner: string;
        count: number;
        code: string;
        displayPrefix: string;
        emoji: string;
        createdAt: number;
      }
    | PendingTrade
  >;
}

/** Legacy v3 shape — items[] with random `instanceId` per copy. */
interface LegacyV3State {
  items: Array<
    | (Omit<StickerReservation, 'slotIndex'> & { slotIndex?: number })
    | PendingTrade
  >;
}

function migrateV1ToV2(legacy: LegacyV1State | undefined): ReservationState {
  // v1 had no `instanceId` and no per-copy model. Synthesize a stable
  // instanceId for each legacy reservation so the v2 hydration doesn't
  // trip on the missing field. (count-based reservations will then be
  // expanded further by the v2 → v3 → v4 migrations.)
  const items: ReservationItem[] = (legacy?.reservations ?? []).map((r) => {
    const count = Math.max(1, r.count ?? 1);
    const out: ReservationItem[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        kind: 'sticker',
        instanceId: generateInstanceId(),
        collectionId: r.collectionId,
        stickerId: r.stickerId,
        slotIndex: i + 1, // slot 0 is the album copy
        partner: r.partner,
        code: r.code,
        displayPrefix: r.displayPrefix,
        emoji: r.emoji,
        createdAt: (r.createdAt ?? Date.now()) + i,
      });
    }
    return out[0];
  });
  return { items } as unknown as ReservationState;
}

function migrateV2ToV3(legacy: ReservationState | undefined): ReservationState {
  const oldItems = (legacy?.items ?? []) as LegacyV2State['items'];
  const items: ReservationItem[] = [];
  for (const it of oldItems) {
    if (it.kind === 'sticker') {
      // Expand a count-based reservation into N instance-based reservations.
      const count = Math.max(1, (it as { count?: number }).count ?? 1);
      const baseTime = (it as { createdAt?: number }).createdAt ?? Date.now();
      for (let i = 0; i < count; i++) {
        items.push({
          kind: 'sticker',
          instanceId: generateInstanceId(),
          collectionId: it.collectionId,
          stickerId: it.stickerId,
          slotIndex: i + 1, // slot 0 is the album copy
          partner: it.partner,
          code: it.code,
          displayPrefix: it.displayPrefix,
          emoji: it.emoji,
          createdAt: baseTime + i,
        });
      }
    } else {
      items.push(it);
    }
  }
  // Migration helpers only return persisted data; Zustand hydrates
  // the action methods itself, so we cast through `unknown`.
  return { items } as unknown as ReservationState;
}

/**
 * v3 → v4: rewrite random `instanceId`s into deterministic slot ids so
 * the UI can look up "is chip N reserved?" without bookkeeping.
 *
 * We bucket reservations per (collectionId, stickerId) sorted by
 * createdAt and assign slotIndex 1, 2, 3… in chronological order. If a
 * reservation already carries an explicit `slotIndex` we keep it.
 */
function migrateV3ToV4(legacy: ReservationState | undefined): ReservationState {
  const oldItems = ((legacy?.items ?? []) as LegacyV3State['items']).slice();
  const grouped = new Map<string, LegacyV3State['items']>();
  const order: string[] = [];
  for (const it of oldItems) {
    if (it.kind !== 'sticker') continue;
    const key = `${it.collectionId}::${it.stickerId}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)!.push(it);
  }
  const nextCounters = new Map<string, number>();
  const rewritten: ReservationItem[] = [];
  for (const it of oldItems) {
    if (it.kind !== 'sticker') {
      rewritten.push(it);
      continue;
    }
    const key = `${it.collectionId}::${it.stickerId}`;
    const existing = it.slotIndex;
    const slotIndex =
      typeof existing === 'number' && existing >= 1
        ? existing
        : (nextCounters.get(key) ?? 0) + 1;
    if (typeof existing !== 'number' || existing < 1) {
      nextCounters.set(key, slotIndex);
    }
    rewritten.push({
      ...it,
      slotIndex,
      instanceId: stickerSlotId(it.collectionId, it.stickerId, slotIndex),
    });
  }
  return { items: rewritten } as unknown as ReservationState;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useReservationStore = create<ReservationState>()(
  persist(
    (set, get) => ({
      items: [],

      addStickerReservation: (input) => {
        set((state) => {
          // If a reservation already exists for this exact slot, the new
          // call is a no-op (the chip is already taken). We intentionally
          // do NOT silently overwrite — that would let a misclick re-
          // assign someone else's reservation.
          const duplicate = state.items.some(
            (it) => it.kind === 'sticker' && it.instanceId === input.instanceId
          );
          if (duplicate) return state;
          const incoming: StickerReservation = {
            kind: 'sticker',
            instanceId: input.instanceId,
            collectionId: input.collectionId,
            stickerId: input.stickerId,
            slotIndex: input.slotIndex,
            partner: input.partner,
            code: input.code,
            displayPrefix: input.displayPrefix,
            emoji: input.emoji,
            createdAt: Date.now(),
          };
          return { items: [...state.items, incoming] };
        });
      },

      removeStickerReservationByInstance: (instanceId) => {
        set((state) => ({
          items: state.items.filter(
            (it) => !(it.kind === 'sticker' && it.instanceId === instanceId)
          ),
        }));
      },

      removeStickerReservation: (collectionId, stickerId, partner) => {
        set((state) => ({
          items: state.items.filter(
            (it) =>
              !(
                it.kind === 'sticker' &&
                it.collectionId === collectionId &&
                it.stickerId === stickerId &&
                it.partner === partner
              )
          ),
        }));
      },

      addPendingTrade: (input) => {
        const tradeId = generateTradeId();
        set((state) => {
          const next: PendingTrade = {
            kind: 'trade',
            tradeId,
            collectionId: input.collectionId,
            partner: input.partner,
            give: input.give,
            receive: input.receive,
            note: input.note,
            createdAt: Date.now(),
          };
          return { items: [...state.items, next] };
        });
        return tradeId;
      },

      confirmTrade: (tradeId) => {
        const item = get().items.find(
          (it) => it.kind === 'trade' && it.tradeId === tradeId
        );
        if (!item || item.kind !== 'trade') return null;
        set((state) => ({
          items: state.items.filter(
            (it) => !(it.kind === 'trade' && it.tradeId === tradeId)
          ),
        }));
        return item;
      },

      cancelTrade: (tradeId) => {
        set((state) => ({
          items: state.items.filter(
            (it) => !(it.kind === 'trade' && it.tradeId === tradeId)
          ),
        }));
      },

      clearForCollection: (collectionId) => {
        set((state) => ({
          items: state.items.filter((it) => it.collectionId !== collectionId),
        }));
      },

      clearAll: () => set({ items: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted, fromVersion) => {
        if (fromVersion < 2) {
          return migrateV1ToV2(persisted as LegacyV1State);
        }
        if (fromVersion < 3) {
          return migrateV2ToV3(persisted as ReservationState);
        }
        if (fromVersion < 4) {
          return migrateV3ToV4(persisted as ReservationState);
        }
        return persisted as ReservationState;
      },
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Count of sticker-level reservation copies for a given sticker. */
export function totalReservedFor(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string
): number {
  return items.filter(
    (it) =>
      it.kind === 'sticker' &&
      it.collectionId === collectionId &&
      it.stickerId === stickerId
  ).length;
}

/** All reservation copies for a sticker — sticker-level + trade `give` sides. */
export function totalReservedAcrossTrades(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string
): number {
  let sum = 0;
  for (const it of items) {
    if (it.collectionId !== collectionId) continue;
    if (it.kind === 'sticker' && it.stickerId === stickerId) {
      sum += 1;
    } else if (it.kind === 'trade') {
      sum += it.give.filter((g) => g.stickerId === stickerId).length;
    }
  }
  return sum;
}

/** True if any reservation exists for the given (collection, sticker) pair. */
export function isReserved(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string
): boolean {
  return totalReservedAcrossTrades(items, collectionId, stickerId) > 0;
}

/**
 * Look up the reservation that occupies a specific slot, if any.
 *
 * A "slot" is identified by the deterministic `stickerSlotId(...)` that
 * the UI builds from its iteration index. We also support looking up
 * by (collection, sticker, slotIndex) directly for code paths that
 * haven't built the id yet.
 *
 * Returns the partner label and the kind of reservation
 * ('sticker' for a per-chip reservation, 'trade' for a pending trade
 * that includes this sticker in its `give` list). The UI uses this to
 * render the "Reserved: María" badge under each chip with the right
 * partner name and to know whether clicking the chip should release
 * the reservation or open the trade dialog.
 */
export function reservationForSlot(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string,
  slotIndex: number
): { partner: string; kind: 'sticker' | 'trade'; instanceId: string } | null {
  const slotId = stickerSlotId(collectionId, stickerId, slotIndex);
  // 1) Direct per-chip reservation on this exact slot.
  const direct = items.find(
    (it) => it.kind === 'sticker' && it.instanceId === slotId
  );
  if (direct && direct.kind === 'sticker') {
    return {
      partner: direct.partner,
      kind: 'sticker',
      instanceId: direct.instanceId,
    };
  }
  // 2) Trade that includes this sticker in its `give` list. The
  //    partner badge is shown for the trade as a whole — the trade
  //    doesn't carry per-slot info, so we surface it on every chip
  //    of the sticker that's part of the trade.
  const trade = items.find(
    (it) =>
      it.kind === 'trade' &&
      it.collectionId === collectionId &&
      it.give.some((g) => g.stickerId === stickerId)
  );
  if (trade && trade.kind === 'trade') {
    return {
      partner: trade.partner,
      kind: 'trade',
      instanceId: trade.tradeId,
    };
  }
  return null;
}

/**
 * @deprecated Prefer `reservationForSlot` for new code. Kept for
 * legacy callers that only know the sticker id. Joins all partners
 * across slots + trades, sorted, comma-separated.
 */
export function reservedPartnerFor(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string
): string | null {
  const partners = new Set<string>();
  for (const it of items) {
    if (it.collectionId !== collectionId) continue;
    if (it.kind === 'sticker' && it.stickerId === stickerId) {
      partners.add(it.partner);
    } else if (it.kind === 'trade') {
      if (it.give.some((g) => g.stickerId === stickerId)) {
        partners.add(it.partner);
      }
    }
  }
  if (partners.size === 0) return null;
  return [...partners].sort().join(', ');
}

/** All pending trades for a given collection, newest first. */
export function pendingTradesFor(
  items: ReservationItem[],
  collectionId: string
): PendingTrade[] {
  return items
    .filter(
      (it): it is PendingTrade =>
        it.kind === 'trade' && it.collectionId === collectionId
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Sticker-level reservations for a given collection, newest first. */
export function stickerReservationsFor(
  items: ReservationItem[],
  collectionId: string
): StickerReservation[] {
  return items
    .filter(
      (it): it is StickerReservation =>
        it.kind === 'sticker' && it.collectionId === collectionId
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}
