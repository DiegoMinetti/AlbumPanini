import { test, expect } from '@playwright/test';
import { primeSettings, goto, installDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await primeSettings(page);
  await installDemo(page);
});

test('add and remove a sticker updates quantity', async ({ page }) => {
  await goto(page, '/stickers');
  const card = page.getByTestId('sticker-card').first();
  await card.getByRole('button', { name: 'increment' }).click();
  await expect(card).toHaveAttribute('data-quantity', '1');
  await card.getByRole('button', { name: 'increment' }).click();
  await expect(card).toHaveAttribute('data-quantity', '2');
  await card.getByRole('button', { name: 'decrement' }).click();
  await expect(card).toHaveAttribute('data-quantity', '1');
});

test('filter by missing then owned', async ({ page }) => {
  await goto(page, '/stickers');
  // own one sticker
  await page
    .getByTestId('sticker-card')
    .first()
    .getByRole('button', { name: 'increment' })
    .click();

  await page.getByRole('tab', { name: 'Owned' }).click();
  await expect(page.getByTestId('sticker-card')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Missing' }).click();
  await expect(page.getByTestId('sticker-card')).toHaveCount(4);
});

test('bulk import adds inventory by code', async ({ page }) => {
  await goto(page, '/stickers');
  // FAB plays a 200ms scale-in animation on mount; wait for the element to
  // be attached and the animation to settle so Playwright's stability check
  // doesn't race with it.
  const fab = page.getByTestId('fab');
  await fab.waitFor({ state: 'visible' });
  await fab.click();
  await page.getByTestId('bulk-input').fill('ARG 1\nARG 1\nBRA 12\nZZZ 9');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByTestId('bulk-report')).toContainText('2');
  // close and verify ARG 1 has 2 copies
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  const argCard = page.locator('[data-sticker-id="ARG-1"]');
  await expect(argCard).toHaveAttribute('data-quantity', '2');
});
