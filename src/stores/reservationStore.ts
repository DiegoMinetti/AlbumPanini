import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';

/**
 * "Reservations" let a user set aside stickers (or whole pending trades)
 * for a specific trade partner *before* they meet in person. The items are
 * still in the inventory and still count as duplicates, but the user has a
 * dedicated view of what's earmarked for whom.
 *
 * Two flavours of reservation live here:
 *
 *  1. `StickerReservation` — a single sticker (or N copies of it) earmarked
 *     for a partner. Useful when you have 3 copies of USA15 and want to
 *     remember "1 is for María, 1 is for Juan, 1 is spare".
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

export type ReservationItem =
  | StickerReservation
  | PendingTrade;

export interface StickerReservation {
  kind: 'sticker';
  /** Collection this reservation belongs to. */
  collectionId: string;
  /** Sticker id within that collection. */
  stickerId: string;
  /** Free-form partner label (e.g. "María"). */
  partner: string;
  /** How many copies of the sticker are earmarked for this partner. */
  count: number;
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
  addStickerReservation: (
    input: Omit<StickerReservation, 'kind' | 'createdAt' | 'count'> & {
      count?: number;
    }
  ) => void;
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
const STORAGE_VERSION = 2; // bump: unified StickerReservation + PendingTrade

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

/** Stable key for a sticker-level reservation. */
function stickerKey(r: Pick<StickerReservation, 'collectionId' | 'stickerId' | 'partner'>) {
  return `${r.collectionId}::${r.stickerId}::${r.partner}`;
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
// Migration: v1 (legacy "reservations" array) → v2 ("items" array)
// ---------------------------------------------------------------------------

/** Legacy v1 shape — kept here so the migrate function can read old state. */
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

function migrateV1ToV2(legacy: LegacyV1State | undefined): ReservationState {
  const items: ReservationItem[] = (legacy?.reservations ?? []).map((r) => ({
    kind: 'sticker' as const,
    ...r,
  }));
  return { items } as unknown as ReservationState;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useReservationStore = create<ReservationState>()(
  persist(
    (set, get) => ({
      items: [],

      addStickerReservation: (input) => {
        const count = Math.max(1, Math.floor(input.count ?? 1));
        set((state) => {
          const incoming: StickerReservation = {
            kind: 'sticker',
            collectionId: input.collectionId,
            stickerId: input.stickerId,
            partner: input.partner,
            code: input.code,
            displayPrefix: input.displayPrefix,
            emoji: input.emoji,
            count,
            createdAt: Date.now(),
          };
          const idx = state.items.findIndex(
            (it) =>
              it.kind === 'sticker' &&
              stickerKey(it) === stickerKey(incoming)
          );
          if (idx === -1) {
            return { items: [...state.items, incoming] };
          }
          const next = [...state.items];
          const existing = next[idx] as StickerReservation;
          next[idx] = { ...existing, count: existing.count + count };
          return { items: next };
        });
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
        return persisted as ReservationState;
      },
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Sum of sticker-level reservation counts for a given sticker. */
export function totalReservedFor(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string
): number {
  return items
    .filter(
      (it) =>
        it.kind === 'sticker' &&
        it.collectionId === collectionId &&
        it.stickerId === stickerId
    )
    .reduce((sum, it) => sum + (it as StickerReservation).count, 0);
}

/** Sum of all reservation counts for a sticker — sticker + pending trades. */
export function totalReservedAcrossTrades(
  items: ReservationItem[],
  collectionId: string,
  stickerId: string
): number {
  let sum = 0;
  for (const it of items) {
    if (it.collectionId !== collectionId) continue;
    if (it.kind === 'sticker' && it.stickerId === stickerId) {
      sum += it.count;
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

/** All pending trades for a given collection, newest first. */
export function pendingTradesFor(
  items: ReservationItem[],
  collectionId: string
): PendingTrade[] {
  return items
    .filter(
      (it): it is PendingTrade => it.kind === 'trade' && it.collectionId === collectionId
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
