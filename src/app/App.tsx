import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './queryClient';
import { router } from './router';
import { ToastViewport } from '@/components/feedback/ToastViewport';
import { PwaAutoUpdater } from '@/components/feedback/PwaAutoUpdater';
import { PwaUpdatePrompt } from '@/components/feedback/PwaUpdatePrompt';
import { PwaInstallPrompt } from '@/components/feedback/PwaInstallPrompt';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import {
  seedDefaultCollection,
  syncDefaultCollection,
} from '@/services/collectionLoader';
import { recordAppLaunch } from '@/services/appVersion';

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

  // Every launch: re-sync the default collection catalog (teams, stickers,
  // tournament structure) when the shipped manifest version is newer than
  // what's installed. User-owned rows (inventory, scenarios, predictions,
  // official results) are preserved across the re-install. Idempotent — a
  // no-op when the version is current or newer. Runs in the background so
  // it never blocks the first paint.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        await syncDefaultCollection(controller.signal);
      } catch (err) {
        console.warn('[sync] default collection sync failed', err);
      }
    })();
    return () => controller.abort();
  }, []);

  // Record the current build in `appVersions` and — if the SHA changed
  // since last launch — fire a subtle "updated to vX" toast so the user
  // knows they're on the latest bundle (otherwise the aggressive PWA
  // auto-update is invisible). Idempotent.
  useEffect(() => {
    void (async () => {
      try {
        const result = await recordAppLaunch();
        if (!result.updated) return;
        // Skip the toast on the very first install (no previous version
        // to compare against — would feel like a noisy welcome banner).
        if (!result.previousVersion) return;
        const message = `Actualizado a ${result.currentVersion} (antes ${result.previousVersion})`;
        useUiStore.getState().pushToast(message, 'success', 5000);
      } catch (err) {
        console.warn('[appVersion] recordAppLaunch failed', err);
      }
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastViewport />
      <PwaAutoUpdater />
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
    </QueryClientProvider>
  );
}
