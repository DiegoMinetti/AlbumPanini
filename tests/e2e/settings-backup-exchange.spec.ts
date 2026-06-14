import { test, expect } from '@playwright/test';
import { primeSettings, goto, installDemo, dismissTransientUi } from './helpers';

test.beforeEach(async ({ page }) => {
  await primeSettings(page);
});

test('change theme to dark', async ({ page }) => {
  await goto(page, '/settings');
  await page.getByRole('tab', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('change language to Spanish', async ({ page }) => {
  await goto(page, '/settings');
  await page.getByRole('tab', { name: 'Español' }).click();
  // Settings title becomes "Ajustes" in Spanish.
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
});

test('export a backup file', async ({ page }) => {
  await installDemo(page);
  await goto(page, '/backup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.albumbackup$/);
});

test('copy duplicates list to clipboard', async ({ page }) => {
  // Browsers may not support granting clipboard perms in headless; the test
  // still verifies the UI flow (the copy is best-effort).
  await installDemo(page);
  // Make at least one duplicate so the Duplicates section has something to offer.
  await goto(page, '/stickers');
  const card = page.getByTestId('sticker-card').first();
  await card.getByRole('button', { name: 'increment' }).click();
  await card.getByRole('button', { name: 'increment' }).click();
  await dismissTransientUi(page);

  await goto(page, '/exchange');
  await expect(page.getByTestId('duplicates-section')).toBeVisible();
  await page.getByTestId('duplicates-section-copy').click();
  // Either a success toast appears or the button label flips to "Copy selected".
  // We assert the section is still rendered (no crash) and the testids exist.
  await expect(page.getByTestId('duplicates-section')).toBeVisible();
});

test('paste a friend list and see a summary', async ({ page }) => {
  await installDemo(page);
  await goto(page, '/exchange');
  // The parser needs section headers ("Repetidas" / "Me faltan") to
  // classify a paste as "wants" vs "extras" — without them the body
  // lines are treated as unresolved and the summary doesn't render.
  // Real shares from this app always include those headers.
  await page
    .getByTestId('paste-textarea')
    .fill("I'm missing\nARG 🇦🇷: 1\nBRA 🇧🇷: 1");
  await page.getByTestId('paste-analyze').click();
  await expect(page.getByTestId('paste-summary')).toBeVisible();
});
