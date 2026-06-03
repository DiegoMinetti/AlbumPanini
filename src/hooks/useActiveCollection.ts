import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCollections } from './useCollections';
import type { StoredCollection } from '@/types/collection';

export interface ActiveCollectionResult {
  collections: StoredCollection[] | undefined;
  active: StoredCollection | null;
  activeId: string | null;
  setActive: (id: string | null) => void;
  loading: boolean;
}

/**
 * Resolve the currently active collection from settings, self-healing when the
 * stored active id no longer exists (e.g. it was deleted) by falling back to the
 * most recently updated active collection.
 */
export function useActiveCollection(): ActiveCollectionResult {
  const collections = useCollections();
  const activeId = useSettingsStore((s) => s.activeCollectionId);
  const setActive = useSettingsStore((s) => s.setActiveCollection);

  const active =
    collections?.find((c) => c.id === activeId && c.status === 'active') ?? null;

  useEffect(() => {
    if (!collections) return;
    const activeOnes = collections.filter((c) => c.status === 'active');
    const stillValid = activeOnes.some((c) => c.id === activeId);
    if (!stillValid) {
      setActive(activeOnes[0]?.id ?? null);
    }
  }, [collections, activeId, setActive]);

  return {
    collections,
    active,
    activeId,
    setActive,
    loading: collections === undefined,
  };
}
