import { test, expect } from '@playwright/test';

test('create and test a rule, run the demo, inspect delivery, then edit and delete', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Billing SLA breached' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rules-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByLabel('Notify when')).toBeFocused();
  await editor.getByLabel('Billing', { exact: true }).uncheck();
  await editor.getByRole('button', { name: 'Test with sample' }).click();
  await expect(editor.getByText('Select at least one queue.')).toBeVisible();
  await editor.getByLabel('Tier 2', { exact: true }).check();
  await editor.getByLabel('Custom rule name').click();
  await editor.getByLabel('Rule name', { exact: true }).fill('Tier 2 SLA watch');
  await page.route('**/api/preview', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await editor.getByRole('button', { name: 'Test with sample' }).click();
  await expect(editor.getByLabel('Notify when')).toBeDisabled();
  await expect(editor.getByText('1 alert in the sample morning')).toBeVisible();
  await expect(editor.getByText(/10:00:00 UTC/)).toBeVisible();
  await page.screenshot({ path: 'test-results/rule-preview.png', fullPage: true });
  await editor.getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tier 2 SLA watch' })).toBeVisible();
  // The primary demo action takes a newcomer straight to visible results.
  await page.getByRole('button', { name: 'Run demo', exact: true }).click();
  await expect(page).toHaveURL(/#activity$/);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '96');
  await expect(page.getByText('5 alerts · 1 still active')).toBeVisible();
  const state = await (await page.request.get('/api/state')).json();
  expect(state.stats).toEqual([
    { outcome: 'accepted', count: 93 },
    { outcome: 'conflict', count: 1 },
    { outcome: 'stale', count: 1 },
    { outcome: 'unknown', count: 1 },
  ]);
  await page.getByRole('button', { name: /Tier 2 SLA watch/ }).click();
  await expect(page.getByRole('heading', { name: 'Why it fired' })).toBeVisible();
  await page.getByText('Delivery & event details').click();
  await expect(page.getByText('Delivered to local inbox', { exact: false })).toBeVisible();
  await expect(page.getByText(/evt_01HXYZ/)).toBeVisible();
  await page.screenshot({ path: 'test-results/activity-desktop.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Filter by recipient' }).selectOption('jordan');
  await expect(page.getByRole('button', { name: /Agent out of adherence/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Tier 2 SLA watch/ })).toHaveCount(0);
  await page.getByLabel('Replay controls').click();
  await page.getByRole('link', { name: 'View event log' }).click();
  await expect(
    page.getByText('Event ID reused with a different payload; original retained.'),
  ).toBeVisible();
  await page.getByRole('link', { name: /^Rules/ }).click();
  await page.getByRole('button', { name: 'Tier 2 SLA watch', exact: true }).click();
  await page.getByLabel('Rule name', { exact: true }).fill('Tier 2 response watch');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Tier 2 response watch' })).toBeVisible();
  await page.getByLabel('Actions for Tier 2 response watch').click();
  await page.getByRole('button', { name: 'Delete rule', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete rule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tier 2 response watch' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Enable Billing SLA breached' }).click();
  await expect(page.getByRole('switch', { name: 'Enable Billing SLA breached' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(browserErrors).toEqual([]);
});

test('responsive layout, automatic rule names, and keyboard focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Billing SLA breached' })).toBeVisible();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/rules-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('link', { name: /^Rules/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Activity/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(page.getByLabel('Notify when')).toBeFocused();
  await page.getByLabel('Notify when').selectOption('adherence');
  await page.getByLabel('For at least').fill('12');
  await page.getByRole('button', { name: 'Test with sample' }).click();
  await expect(page.getByText('1 alert in the sample morning')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
  expect(await page.getByRole('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Create rule', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  await page.getByLabel('Notify when').selectOption('backlog');
  await page.getByLabel('More than', { exact: true }).fill('15');
  await page.getByRole('dialog').getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Billing backlog above 15' })).toBeVisible();
  // Detailed playback remains available, but out of the main workflow.
  await page.getByLabel('Replay controls').click();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Replay controls')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play sample', exact: true })).not.toBeVisible();
  await page.getByLabel('Replay controls').click();
  await page.getByRole('button', { name: 'Play sample', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
});
