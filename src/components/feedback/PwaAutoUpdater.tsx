import { useEffect, useState } from 'react';

/**
 * Aggressive PWA update strategy.
 *
 * Why this exists: with `registerType: 'autoUpdate'`, vite-plugin-pwa does
 * the right thing *most* of the time, but several real-world failure modes
 * leave users stuck on stale bundles:
 *   - Android WebAPK launch: the SW may skip its update check when the
 *     app is opened from the home-screen icon (no fresh navigation event).
 *   - iOS Safari: SW update timing is even less predictable.
 *   - Long-lived tabs: if a user keeps the app open across deploys, the
 *     SW never re-checks for an update.
 *
 * This component plugs those gaps by:
 *   1. Forcing `registration.update()` on every app mount and every
 *      visibility change (returns from background).
 *   2. Polling `registration.update()` every 60 seconds while the tab is
 *      visible — a new deploy lands within a minute of users opening the
 *      app or returning to it.
 *   3. Listening for `controllerchange` and force-reloading the page when
 *      a new SW takes control. Without this, the page keeps running the
 *      old bundle even though the SW has updated.
 *
 * Data safety: IndexedDB / localStorage / cookies survive SW updates and
 * page reloads, so this never costs the user their data.
 */

const UPDATE_CHECK_INTERVAL_MS = 60_000;

export function PwaAutoUpdater() {
  // Render a tiny status badge in dev so we can confirm the strategy runs.
  // In prod it's invisible (display: none) — purely a sanity aid.
  const [lastCheck, setLastCheck] = useState<number>(0);
  const [reloading, setReloading] = useState<boolean>(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Use a holder object so the cleanup closure can read the latest interval
    // id without triggering ESLint's prefer-const (we assign once via .id).
    const intervalHolder: { id: ReturnType<typeof setInterval> | undefined } = {
      id: undefined,
    };

    const triggerUpdate = (): void => {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (!registration) return;
        setLastCheck(Date.now());
        // `update()` re-fetches the SW script and re-checks against the
        // current precache manifest. If a new SW is found it installs in
        // the background; autoUpdate's skipWaiting + clientsClaim then
        // activates it and the controllerchange listener (below) reloads.
        void registration.update().catch(() => {
          /* update() can reject if the SW script 404s — safe to ignore. */
        });
      });
    };

    // 1. Check on mount.
    triggerUpdate();

    // 2. Check whenever the tab becomes visible again (e.g. user came back
    //    from another app — common mobile flow).
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') triggerUpdate();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // 3. Poll while the tab is visible. Mobile browsers don't fire
    //    visibilitychange every time the user reopens the home-screen
    //    app, so a poll is the safety net.
    intervalHolder.id = setInterval(() => {
      if (document.visibilityState === 'visible') triggerUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);

    // 4. Force-reload when a new SW takes over. Without this, the page
    //    continues serving the old bundle even though the SW has updated.
    const onControllerChange = (): void => {
      // `skipWaiting + clientsClaim` fires this event. Reloading is the
      // only way to make the React tree pick up the new bundle.
      setReloading(true);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange
    );

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalHolder.id !== undefined) clearInterval(intervalHolder.id);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      );
    };
  }, []);

  if (reloading) {
    // Brief flash before reload — keeps the screen from showing stale
    // content for a frame between SW activation and page navigation.
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-[100] flex items-center justify-center
          bg-surface/80 backdrop-blur-sm"
      >
        <div className="text-body-lg font-semibold text-on-surface">
          Actualizando…
        </div>
      </div>
    );
  }

  if (import.meta.env.DEV && lastCheck > 0) {
    return (
      <div
        className="fixed bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5
          font-mono text-[10px] text-white"
        data-testid="pwa-updater-debug"
      >
        sw-check {new Date(lastCheck).toLocaleTimeString()}
      </div>
    );
  }
  return null;
}
