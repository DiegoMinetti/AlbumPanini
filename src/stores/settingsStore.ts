import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  /** Replace the whole settings object (used after restoring a backup). */
  applySettings: (settings: Settings) => void;
}

/** localStorage key — must match the inline pre-paint script in index.html. */
const STORAGE_KEY = 'panini-settings';

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
    document.documentElement.classList.toggle('dark', resolveDark(settings.theme));
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
      applySettings: (settings) => {
        set({ ...settings });
        applyThemeSideEffects(get());
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state): Settings => ({
        theme: state.theme,
        language: state.language,
        haptics: state.haptics,
        stickerView: state.stickerView,
        activeCollectionId: state.activeCollectionId,
        showImages: state.showImages,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeSideEffects(state);
      },
    }
  )
);
