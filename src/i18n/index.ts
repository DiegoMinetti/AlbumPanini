import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import es from './locales/es.json';
import { useSettingsStore } from '@/stores/settingsStore';

export const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // The persisted setting wins; fall back to detector, then Spanish.
    lng: useSettingsStore.getState().language,
    fallbackLng: 'es',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: [],
    },
  });

// Keep i18next in sync with the settings store.
useSettingsStore.subscribe((state, prev) => {
  if (state.language !== prev.language && i18n.language !== state.language) {
    void i18n.changeLanguage(state.language);
  }
});

export default i18n;
