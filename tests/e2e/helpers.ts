import type { Page } from '@playwright/test';

/**
 * Force a deterministic initial settings state (English, light theme, no active
 * collection) before the app boots, so E2E selectors are stable.
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
}
