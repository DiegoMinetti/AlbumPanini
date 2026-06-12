import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';

/**
 * "Reservations" let a user mark a duplicate sticker as earmarked for a
 * specific trade partner before they meet. Once reserved, the sticker is
 * still in the inventory (and still counts as a duplicate) but it shows up
 * in a dedicated UI so the user remembers "I'm giving USA15 to María" when
 * they finally meet.
 *
 * A reservation is keyed by `(collectionId, stickerId, partner)` so the same
 * sticker can be reserved for multiple partners (we allow that — the user
 * might have three copies of ARG10 and want to trade each with a different
 * person). The count tracks how many copies of the sticker are reserved for
 * this partner (capped at the user's current duplicate count at render time).
 */

export interface Reservation {
  /** Collection this reservation belongs to. */
  collectionId: string;
  /** Sticker id within that collection. */
  stickerId: string;
  /** Free-form partner label (e.g. "María", "figuritas.app user 42"). */
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

interface ReservationState {
  reservations: Reservation[];
  /** Add a new reservation, or bump the count on an existing one. */
  addReservation: (input: Omit<Reservation, 'createdAt' | 'count'> & {
    count?: number;
  }) => void;
  /** Remove a single reservation by its composite key. */
  removeReservation: (
    collectionId: string,
    stickerId: string,
    partner: string
  ) => void;
  /** Drop every reservation for the given collection. */
  clearForCollection: (collectionId: string) => void;
  /** Wipe everything (used by full-reset flows). */
  clearAll: () => void;
}

const STORAGE_KEY = 'panini-reservations';

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
      globalThis.localStorage?.setItem(name, value);
    } catch {
      /* ignore */
    }
    memoryStore.set(name, value);
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage?.removeItem(name);
    } catch {
      /* ignore */
    }
    memoryStore.delete(name);
  },
};

/** Stable key for `(collectionId, stickerId, partner)` lookups. */
function reservationKey(r: Pick<Reservation, 'collectionId' | 'stickerId' | 'partner'>) {
  return `${r.collectionId}::${r.stickerId}::${r.partner}`;
}

export const useReservationStore = create<ReservationState>()(
  persist(
    (set) => ({
      reservations: [],
      addReservation: (input) => {
        const count = Math.max(1, Math.floor(input.count ?? 1));
        set((state) => {
          const incoming: Reservation = {
            collectionId: input.collectionId,
            stickerId: input.stickerId,
            partner: input.partner,
            code: input.code,
            displayPrefix: input.displayPrefix,
            emoji: input.emoji,
            count,
            createdAt: Date.now(),
          };
          const idx = state.reservations.findIndex(
            (r) => reservationKey(r) === reservationKey(incoming)
          );
          if (idx === -1) {
            return { reservations: [...state.reservations, incoming] };
          }
          const next = [...state.reservations];
          next[idx] = { ...next[idx], count: next[idx].count + count };
          return { reservations: next };
        });
      },
      removeReservation: (collectionId, stickerId, partner) => {
        set((state) => ({
          reservations: state.reservations.filter(
            (r) =>
              !(
                r.collectionId === collectionId &&
                r.stickerId === stickerId &&
                r.partner === partner
              )
          ),
        }));
      },
      clearForCollection: (collectionId) => {
        set((state) => ({
          reservations: state.reservations.filter(
            (r) => r.collectionId !== collectionId
          ),
        }));
      },
      clearAll: () => set({ reservations: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
    }
  )
);

/** Sum of all reservation counts for a given sticker (across partners). */
export function totalReservedFor(
  reservations: Reservation[],
  collectionId: string,
  stickerId: string
): number {
  return reservations
    .filter((r) => r.collectionId === collectionId && r.stickerId === stickerId)
    .reduce((sum, r) => sum + r.count, 0);
}

/** True if any reservation exists for the given (collection, sticker) pair. */
export function isReserved(
  reservations: Reservation[],
  collectionId: string,
  stickerId: string
): boolean {
  return reservations.some(
    (r) => r.collectionId === collectionId && r.stickerId === stickerId
  );
}
