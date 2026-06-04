import { test, expect } from '@playwright/test';
import { primeSettings, goto, installDemo } from './helpers';

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

test('generate an exchange QR code', async ({ page }) => {
  await installDemo(page);
  // give a duplicate so there is something to offer
  await goto(page, '/stickers');
  const card = page.getByTestId('sticker-card').first();
  await card.getByRole('button', { name: 'increment' }).click();
  await card.getByRole('button', { name: 'increment' }).click();

  await goto(page, '/exchange');
  await page.getByRole('button', { name: 'Generate QR' }).click();
  await expect(page.getByTestId('exchange-qr')).toBeVisible();
});
