import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';

/**
 * Remembers which tournament scenario is active, per collection. Persisted to
 * localStorage so reopening the app keeps the user on the scenario they were
 * simulating. Falls back to an in-memory map when storage is unavailable
 * (mirrors the resilient storage used by the settings store).
 */

const STORAGE_KEY = 'panini-scenarios';

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

interface ScenarioState {
  /** collectionId → active scenario id. */
  activeByCollection: Record<string, string>;
  setActiveScenario: (collectionId: string, scenarioId: string) => void;
  getActiveScenario: (collectionId: string) => string | undefined;
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set, get) => ({
      activeByCollection: {},
      setActiveScenario: (collectionId, scenarioId) =>
        set((state) => ({
          activeByCollection: {
            ...state.activeByCollection,
            [collectionId]: scenarioId,
          },
        })),
      getActiveScenario: (collectionId) =>
        get().activeByCollection[collectionId],
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        activeByCollection: state.activeByCollection,
      }),
    },
  ),
);
