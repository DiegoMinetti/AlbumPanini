import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, resolveDark } from './settingsStore';
import { DEFAULT_SETTINGS } from '@/types/settings';

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});

describe('settingsStore', () => {
  it('changes theme and toggles dark class', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    useSettingsStore.getState().setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('sets language and active collection', () => {
    useSettingsStore.getState().setLanguage('en');
    expect(useSettingsStore.getState().language).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    useSettingsStore.getState().setActiveCollection('col-1');
    expect(useSettingsStore.getState().activeCollectionId).toBe('col-1');
  });

  it('toggles haptics and images', () => {
    const before = useSettingsStore.getState().haptics;
    useSettingsStore.getState().toggleHaptics();
    expect(useSettingsStore.getState().haptics).toBe(!before);

    useSettingsStore.getState().setShowImages(false);
    expect(useSettingsStore.getState().showImages).toBe(false);
  });

  it('applySettings replaces all values', () => {
    useSettingsStore.getState().applySettings({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      language: 'en',
      stickerView: 'list',
    });
    expect(useSettingsStore.getState().stickerView).toBe('list');
  });
});

describe('resolveDark', () => {
  it('resolves explicit modes', () => {
    expect(resolveDark('dark')).toBe(true);
    expect(resolveDark('light')).toBe(false);
  });
});
