import { test, expect } from '@playwright/test';

test('configure and preview a rule, replay, inspect routed evidence, then edit and delete', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Billing SLA breached' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rules-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Preview rule' }).click();
  await expect(editor.getByText('Give this rule a name.')).toBeVisible();
  await editor.getByLabel('Rule name').fill('Tier 2 SLA watch');
  await editor.getByLabel('Billing', { exact: true }).uncheck();
  await editor.getByLabel('Tier 2', { exact: true }).check();
  await page.route('**/api/preview', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await editor.getByRole('button', { name: 'Preview rule' }).click();
  await expect(editor.getByLabel('Rule name')).toBeDisabled();
  await expect(editor.getByText('1 alert would fire')).toBeVisible();
  await expect(editor.getByText(/10:00:00 UTC/)).toBeVisible();
  await page.screenshot({ path: 'test-results/rule-preview.png', fullPage: true });
  await editor.getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tier 2 SLA watch' })).toBeVisible();
  await page.getByRole('button', { name: 'Play sample' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run to end' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '96');
  const finalState = await (await page.request.get('/api/state')).json();
  expect(finalState.stats).toEqual([
    { outcome: 'accepted', count: 93 },
    { outcome: 'conflict', count: 1 },
    { outcome: 'stale', count: 1 },
    { outcome: 'unknown', count: 1 },
  ]);
  await page.getByRole('link', { name: /Activity inbox/ }).click();
  await expect(page.getByRole('heading', { name: 'Notification history' })).toContainText('5');
  await page.getByRole('button', { name: /Tier 2 SLA watch/ }).click();
  await expect(page.getByText('Delivered to local inbox')).toBeVisible();
  await expect(page.getByText(/evt_01HXYZ/)).toBeVisible();
  await page.screenshot({ path: 'test-results/activity-desktop.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Filter by recipient' }).selectOption('jordan');
  await expect(page.getByRole('button', { name: /Agent out of adherence/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Tier 2 SLA watch/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Processing log/ }).click();
  await expect(
    page.getByText('Event ID reused with a different payload; original retained.'),
  ).toBeVisible();
  await expect(page.getByText(/Missing violation_started_at/)).toBeVisible();
  await page.getByRole('link', { name: 'Rules', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Tier 2 SLA watch', exact: true }).click();
  await page.getByLabel('Rule name').fill('Tier 2 response watch');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Tier 2 response watch' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Tier 2 response watch', exact: true }).click();
  await page.getByRole('button', { name: 'Delete rule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tier 2 response watch' })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Enable Billing SLA breached' }).click();
  await expect(page.getByRole('switch', { name: 'Enable Billing SLA breached' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByRole('button', { name: 'Reset sample' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset sample', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('heading', { name: 'Billing SLA breached' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Enable Billing SLA breached' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(browserErrors).toEqual([]);
});

test('responsive layouts and keyboard-accessible modal work without horizontal overflow', async ({
  page,
}) => {
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
  await expect(page.getByRole('link', { name: 'Rules', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Activity inbox', exact: true })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(page.getByLabel('Rule name')).toBeFocused();
  await page.getByLabel('Rule name').fill('Adherence watch');
  await page.getByRole('button', { name: /Agent adherence/ }).click();
  await page.getByLabel('Out of adherence for at least').fill('10');
  await page.getByRole('button', { name: 'Preview rule' }).click();
  await expect(page.getByText('1 alert would fire')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
  expect(await page.getByRole('dialog').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Create rule', exact: true })).toBeFocused();
});
