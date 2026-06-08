import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';
import {
  DEFAULT_SETTINGS,
  type Language,
  type Settings,
  type StickerView,
  type ThemeMode,
} from '@/types/settings';
import { setHapticsEnabled } from '@/utils/haptics';

interface SettingsState extends Settings {
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  toggleHaptics: () => void;
  setStickerView: (view: StickerView) => void;
  setActiveCollection: (id: string | null) => void;
  setShowImages: (show: boolean) => void;
  setStickerGrouped: (grouped: boolean) => void;
  setEditMode: (editMode: boolean) => void;
  /** Replace the whole settings object (used after restoring a backup). */
  applySettings: (settings: Settings) => void;
}

/** localStorage key — must match the inline pre-paint script in index.html. */
const STORAGE_KEY = 'panini-settings';

/**
 * Storage that uses localStorage when available and falls back to an in-memory
 * map otherwise (private mode, opaque origins, SSR, tests). This keeps the app
 * functional even when persistence is unavailable.
 */
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

/** Resolve the effective dark-mode boolean for a theme mode. */
export function resolveDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Apply theme + haptics side effects to the document/runtime. */
export function applyThemeSideEffects(settings: Settings): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle(
      'dark',
      resolveDark(settings.theme)
    );
    document.documentElement.lang = settings.language;
  }
  setHapticsEnabled(settings.haptics);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setTheme: (theme) => {
        set({ theme });
        applyThemeSideEffects(get());
      },
      setLanguage: (language) => {
        set({ language });
        applyThemeSideEffects(get());
      },
      toggleHaptics: () => {
        set({ haptics: !get().haptics });
        applyThemeSideEffects(get());
      },
      setStickerView: (stickerView) => set({ stickerView }),
      setActiveCollection: (activeCollectionId) => set({ activeCollectionId }),
      setShowImages: (showImages) => set({ showImages }),
      setStickerGrouped: (stickerGrouped) => set({ stickerGrouped }),
      setEditMode: (editMode) => set({ editMode }),
      applySettings: (settings) => {
        set({ ...settings });
        applyThemeSideEffects(get());
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state): Settings => ({
        theme: state.theme,
        language: state.language,
        haptics: state.haptics,
        stickerView: state.stickerView,
        activeCollectionId: state.activeCollectionId,
        showImages: state.showImages,
        stickerGrouped: state.stickerGrouped,
        editMode: state.editMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeSideEffects(state);
      },
    }
  )
);
