import { test, expect } from '@playwright/test';
import { primeSettings, goto, installByName } from './helpers';

test.beforeEach(async ({ page }) => {
  await primeSettings(page);
});

test('group stage shows groups and a score updates the standings', async ({
  page,
}) => {
  await installByName(page, 'FIFA World Cup 2026');
  await goto(page, '/tournament');

  // Twelve groups A..L are rendered.
  await expect(page.getByText('Group A', { exact: true })).toBeVisible();
  await expect(page.getByText('Group L', { exact: true })).toBeVisible();

  // Open Group A's fixtures and score the first match 2-0.
  const groupA = page
    .locator('section', { hasText: 'Group A' })
    .first();
  await groupA.getByRole('button', { name: 'Show matches' }).click();

  const inputs = groupA.locator('input[type="number"]');
  await inputs.nth(0).fill('2');
  await inputs.nth(1).fill('0');

  // The home team now has 3 points in the standings table.
  await expect(groupA.locator('table tbody tr').first()).toContainText('3');
});

test('bracket view renders the knockout rounds', async ({ page }) => {
  await installByName(page, 'FIFA World Cup 2026');
  await goto(page, '/tournament');

  await page.getByRole('tab', { name: 'Bracket' }).click();
  await expect(page.getByText('Round of 32')).toBeVisible();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
});
