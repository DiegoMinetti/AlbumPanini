import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './queryClient';
import { router } from './router';
import { ToastViewport } from '@/components/feedback/ToastViewport';
import { PwaUpdatePrompt } from '@/components/feedback/PwaUpdatePrompt';
import { useSettingsStore } from '@/stores/settingsStore';
import { seedDefaultCollection } from '@/services/collectionLoader';

const SESSION_LAUNCH_KEY = 'panini-launch-registered';

export function App() {
  const registerAppLaunch = useSettingsStore((s) => s.registerAppLaunch);
  const defaultCollectionSeeded = useSettingsStore(
    (s) => s.defaultCollectionSeeded
  );
  const markDefaultCollectionSeeded = useSettingsStore(
    (s) => s.markDefaultCollectionSeeded
  );
  const setActiveCollection = useSettingsStore((s) => s.setActiveCollection);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_LAUNCH_KEY) === '1') return;
      registerAppLaunch();
      sessionStorage.setItem(SESSION_LAUNCH_KEY, '1');
    } catch {
      registerAppLaunch();
    }
  }, [registerAppLaunch]);

  // First launch: install FIFA World Cup 2026 and select it so the app opens
  // on a usable album. Marked seeded only on success, so a failed fetch retries
  // next launch instead of leaving the app permanently empty.
  useEffect(() => {
    if (defaultCollectionSeeded) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const created = await seedDefaultCollection(controller.signal);
        if (controller.signal.aborted) return;
        if (created && !useSettingsStore.getState().activeCollectionId) {
          setActiveCollection(created.id);
        }
        markDefaultCollectionSeeded();
      } catch {
        /* keep unseeded; retry on next launch */
      }
    })();
    return () => controller.abort();
  }, [
    defaultCollectionSeeded,
    markDefaultCollectionSeeded,
    setActiveCollection,
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <PwaUpdatePrompt />
    </QueryClientProvider>
  );
}
