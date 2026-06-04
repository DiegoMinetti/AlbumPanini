import { test, expect } from '@playwright/test';
import { primeSettings, goto, installDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await primeSettings(page);
});

test('install a collection and see it on the dashboard', async ({ page }) => {
  await installDemo(page);
  await goto(page, '/');
  // Demo Mini has 5 stickers.
  await expect(page.getByText('0/5')).toBeVisible();
});

test('rename a collection', async ({ page }) => {
  await installDemo(page);
  await goto(page, '/collections');
  await page.getByRole('button', { name: 'Rename' }).first().click();
  const input = page.getByRole('textbox');
  await input.fill('My Album');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('My Album').first()).toBeVisible();
});

test('duplicate a collection', async ({ page }) => {
  await installDemo(page);
  await goto(page, '/collections');
  await page.getByRole('button', { name: 'Duplicate' }).first().click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('collection-row')).toHaveCount(2);
});
