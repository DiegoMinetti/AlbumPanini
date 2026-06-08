import { test, expect, type Page } from '@playwright/test';
import { primeSettings, goto, installDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await primeSettings(page);
  await installDemo(page);
});

/** A collapsible group header is the only button carrying `aria-expanded`. */
function groupHeader(page: Page, name: string) {
  return page.locator('button[aria-expanded]').filter({ hasText: name });
}

test('group view buckets stickers by country and toggles sections', async ({
  page,
}) => {
  await goto(page, '/stickers');

  // Flat view first: all 5 demo stickers are visible.
  await expect(page.getByTestId('sticker-card')).toHaveCount(5);

  // Switch to grouped view.
  await page.getByRole('button', { name: 'Group' }).click();
  await expect(page.getByTestId('sticker-groups')).toBeVisible();

  // Two country sections (Argentina 3, Brazil 2), still 5 cards total.
  const argHeader = groupHeader(page, 'Argentina');
  const braHeader = groupHeader(page, 'Brazil');
  await expect(argHeader).toBeVisible();
  await expect(braHeader).toBeVisible();
  await expect(page.getByTestId('sticker-card')).toHaveCount(5);

  // Collapsing Argentina hides its 3 cards, leaving Brazil's 2.
  await argHeader.click();
  await expect(argHeader).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('sticker-card')).toHaveCount(2);

  // Re-expanding restores all cards.
  await argHeader.click();
  await expect(page.getByTestId('sticker-card')).toHaveCount(5);
});

test('searching forces all groups open', async ({ page }) => {
  await goto(page, '/stickers');
  await page.getByRole('button', { name: 'Group' }).click();

  // Collapse Argentina, then search — the section reopens so matches show.
  await groupHeader(page, 'Argentina').click();
  await expect(page.getByTestId('sticker-card')).toHaveCount(2);

  await page.getByPlaceholder('Search').fill('ARG');
  await expect(page.getByTestId('sticker-card')).toHaveCount(3);
});
