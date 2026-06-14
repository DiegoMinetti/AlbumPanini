import { test, expect } from '@playwright/test';
import {
  primeSettings,
  goto,
  installByName,
  createCustomScenario,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await primeSettings(page);
});

test('group stage shows groups and a score updates the standings', async ({
  page,
}) => {
  await installByName(page, 'FIFA World Cup 2026');
  await goto(page, '/tournament');

  // Switch to a custom scenario first: the default selection is the
  // official scenario, whose score inputs are read-only because FIFA
  // auto-fills the real results. The test exercises the user prediction
  // path, which only works on a custom scenario.
  await createCustomScenario(page, 'Test sim');

  // Twelve groups A..L are rendered.
  await expect(page.getByText('Group A', { exact: true })).toBeVisible();
  await expect(page.getByText('Group L', { exact: true })).toBeVisible();

  // Open Group A's fixtures and score the second-to-last match 2-0. We
  // target MD3 (Mexico vs Czechia, 24 jun) instead of MD1 so the test
  // keeps working after the real-world kickoff of the first games: the
  // kickoff lock (PR3) leaves the inputs disabled once a match starts,
  // and we don't want a flaky e2e tied to "what date is today".
  const groupA = page
    .locator('section', { hasText: 'Group A' })
    .first();
  await groupA.getByRole('button', { name: 'Show matches' }).click();

  const inputs = groupA.locator('input[type="number"]');
  // Each match has two inputs (home + away). The MD3 Mexico-vs-Czechia
  // match is the 5th one — its home input is index 8, away input 9.
  // We score 2-0 to MEX so Mexico tops the group (3 points).
  await inputs.nth(8).fill('2');
  await inputs.nth(9).fill('0');

  // Mexico now has 3 points in the standings table.
  await expect(groupA.locator('table tbody tr').first()).toContainText('3');
});

test('bracket view renders the knockout rounds', async ({ page }) => {
  await installByName(page, 'FIFA World Cup 2026');
  await goto(page, '/tournament');

  await page.getByRole('tab', { name: 'Bracket' }).click();
  await expect(page.getByText('Round of 32')).toBeVisible();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
});
