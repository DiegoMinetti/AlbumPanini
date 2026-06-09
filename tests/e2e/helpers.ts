import type { Page } from '@playwright/test';

/**
 * Force a deterministic initial settings state (English, light theme, no active
 * collection) before the app boots, so E2E selectors are stable.
 *
 * `defaultCollectionSeeded: true` skips the App-level auto-install of the
 * bundled FIFA World Cup 2026 collection (see App.tsx + collectionLoader).
 * Without it, that effect runs during test boot and pollutes IndexedDB with
 * 980 stickers that break every count-based assertion below.
 */
export async function primeSettings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'panini-settings',
      JSON.stringify({
        state: {
          theme: 'light',
          language: 'en',
          haptics: false,
          stickerView: 'grid',
          activeCollectionId: null,
          showImages: true,
          defaultCollectionSeeded: true,
        },
        version: 1,
      })
    );
  });
}

/** Navigate to a hash route and wait for the app shell. */
export async function goto(page: Page, hash = '/'): Promise<void> {
  await page.goto(`/#${hash}`);
  await page.getByRole('banner').waitFor();
}

/** Install the tiny demo collection via the Collections page. */
export async function installDemo(page: Page): Promise<void> {
  await installByName(page, 'Demo Mini');
}

/** Install a manifest collection by its display name via the Collections page. */
export async function installByName(page: Page, name: string): Promise<void> {
  await goto(page, '/collections');
  const installRow = page.locator('.card', { hasText: name }).first();
  await installRow.getByRole('button', { name: 'Install' }).click();
  // Once installed it shows up as the selected active collection.
  await page.getByText('Selected').first().waitFor();
  // The "Collection installed" toast and the PWA offline-ready prompt both
  // sit at `z-50 bottom-20` and overlap the FAB (`z-30 bottom-24`) for up
  // to ~3.5s. Clear them so the next interaction (FAB click, etc.) is
  // safe and not intercepted by either overlay.
  await dismissTransientUi(page);
}

/**
 * Clear anything floating above the app that could intercept clicks on
 * bottom-anchored controls (FAB, bottom-nav). This includes:
 *  - Toasts (notifications region at `z-50 bottom-20`)
 *  - PWA update/offline-ready prompt (also at `z-50 bottom-20`)
 *
 * Both overlays share the same z-index and anchor, so the later-rendered
 * one can intercept clicks on the earlier one. We use `force: true` to
 * dispatch the click at the target's own coordinates and bypass the
 * actionability check.
 */
export async function dismissTransientUi(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    // The PWA prompt's Close button carries `data-testid="pwa-close"` —
    // match by that to avoid clashing with the bulk-import dialog's
    // "Close" button (which lives inside `role="dialog"` and isn't a
    // transient overlay).
    const pwaClose = page.getByTestId('pwa-close');
    if (await pwaClose.isVisible().catch(() => false)) {
      await pwaClose.click({ force: true }).catch(() => {});
      continue;
    }
    // Toasts are <button role="alert"> — clicking dismisses them.
    const toast = page.locator('[role="alert"]').first();
    if (await toast.isVisible().catch(() => false)) {
      await toast.click({ force: true }).catch(() => {});
      continue;
    }
    return;
  }
}
