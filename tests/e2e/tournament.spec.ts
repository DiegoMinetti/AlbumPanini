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
  const groupA = page.locator('section', { hasText: 'Group A' }).first();
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

test('matches view shows a timeline grouped by day with the next match anchored', async ({
  page,
}) => {
  await installByName(page, 'FIFA World Cup 2026');
  await goto(page, '/tournament');

  // Switch to the new "Matches" tab.
  await page.getByRole('tab', { name: 'Matches' }).click();

  // The tab is a list of day sections. Every section shows a weekday short
  // name (e.g. "Thu", "Fri"…) plus a day-of-month number. We assert that at
  // least three distinct day sections render, which guarantees the timeline
  // is grouped by day and not just a flat list.
  const daySections = page.getByTestId('matches-day-section');
  await expect(daySections.first()).toBeVisible();
  expect(await daySections.count()).toBeGreaterThanOrEqual(3);

  // The auto-anchor should be marked on exactly one section. The data-anchor
  // attribute lives on the section itself. We pull the day-key of the anchor
  // out of the DOM and then look it up by data-day-key, which is more
  // robust than chaining `.locator('[data-anchor="true"]')` against a Locator
  // (the chained selector was observed returning 0 in the dev environment).
  const anchorDay = await page.evaluate(() => {
    const el = document.querySelector(
      '[data-testid="matches-day-section"][data-anchor="true"]'
    );
    return el ? el.getAttribute('data-day-key') : null;
  });
  expect(anchorDay).not.toBeNull();

  // The auto-scroll on mount centers the anchor section in the viewport,
  // but the first match row may sit just below the fold (the section has
  // multiple matches and the section heading is what's centered). Scroll
  // the anchor into view at the top so the row beneath it is visible too.
  await page.evaluate(() => {
    document
      .querySelector('[data-testid="matches-day-section"][data-anchor="true"]')
      ?.scrollIntoView({ block: 'start' });
  });

  // The first match row inside the anchor section is either "live" (pulsing
  // dot) or the next-up match — both states are valid for "current/next".
  // We pull the first row's status straight from the DOM because Playwright's
  // Locator chaining through nested `data-day-key` + `data-testid` had
  // visibility-check edge cases after the auto-scroll into view.
  const firstRowStatus = await page.evaluate((dayKey) => {
    const row = document.querySelector(
      `[data-testid="matches-day-section"][data-day-key="${dayKey}"] [data-testid="match-row"]`
    );
    return row ? row.getAttribute('data-match-status') : null;
  }, anchorDay);
  expect(['live', 'next']).toContain(firstRowStatus);

  // Jump-to-today pill only renders when the user has scrolled away from
  // the anchor. We scroll to the very top of the page and assert it appears.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByTestId('matches-jump-anchor')).toBeVisible();
});

test('matches view: filter chips, refresh button, and next-match countdown', async ({
  page,
}) => {
  await installByName(page, 'FIFA World Cup 2026');
  await goto(page, '/tournament');
  await page.getByRole('tab', { name: 'Matches' }).click();

  // Status filter chips render with counts.
  await expect(page.getByTestId('matches-filter-chips')).toBeVisible();
  const allChip = page.getByTestId('matches-filter-all');
  const pastChip = page.getByTestId('matches-filter-past');
  const upcomingChip = page.getByTestId('matches-filter-upcoming');
  await expect(allChip).toBeVisible();
  await expect(pastChip).toBeVisible();
  await expect(upcomingChip).toBeVisible();

  // Sanity: "All" count is greater than "Past" (some matches are upcoming).
  const allCount = await allChip.locator('span.opacity-70').textContent();
  const pastCount = await pastChip.locator('span.opacity-70').textContent();
  const allNum = parseInt(allCount?.replace(/[^\d]/g, '') ?? '0', 10);
  const pastNum = parseInt(pastCount?.replace(/[^\d]/g, '') ?? '0', 10);
  expect(allNum).toBeGreaterThan(pastNum);
  expect(pastNum).toBeGreaterThan(0);

  // Filter to "Played" — only past matches remain.
  await pastChip.click();
  await expect(pastChip).toHaveAttribute('aria-selected', 'true');
  const visibleStatuses = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="match-row"]')).map(
      (r) => r.getAttribute('data-match-status')
    )
  );
  expect(visibleStatuses.length).toBeGreaterThan(0);
  for (const s of visibleStatuses) expect(s).toBe('past');

  // Switch to "Upcoming" — only next + future rows remain.
  await upcomingChip.click();
  const upcomingStatuses = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="match-row"]')).map(
      (r) => r.getAttribute('data-match-status')
    )
  );
  for (const s of upcomingStatuses) {
    expect(['next', 'future']).toContain(s);
  }

  // Back to "All" so the rest of the test sees the full timeline.
  await allChip.click();

  // The next-match countdown is rendered in the header. The exact string
  // changes with the wall clock; we just assert the prefix ("Next:") and
  // that some non-empty time string follows.
  const countdown = page.getByTestId('matches-next-countdown');
  await expect(countdown).toBeVisible();
  const countdownText = (await countdown.textContent())?.trim() ?? '';
  expect(countdownText).toMatch(/^Next: .+/);

  // The manual refresh button is rendered and enabled.
  const refreshBtn = page.getByTestId('matches-refresh');
  await expect(refreshBtn).toBeVisible();
  await expect(refreshBtn).toBeEnabled();
});
