import { test, expect } from '@playwright/test';
import { defaultRules } from '../../server/domain';

test.beforeEach(async ({ request }) => {
  await request.post('/api/replay', { data: { action: 'reset' } });
  const state = await (await request.get('/api/state')).json();
  for (const rule of state.rules) await request.delete(`/api/rules/${rule.id}`);
  for (const rule of defaultRules) await request.post('/api/rules', { data: rule });
});

test('create and test a rule, run the demo, inspect delivery, then edit and delete', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (e) => browserErrors.push(e.message));
  await page.goto('/#rules');
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
  await expect(
    editor.getByText('Oldest ticket waited 5 min 20 sec. SLA target: 5 min.'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/rule-preview.png', fullPage: true });
  await editor.getByRole('button', { name: 'Create rule', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tier 2 SLA watch' })).toBeVisible();
  // The primary demo action takes a newcomer straight to visible results.
  await page.getByRole('button', { name: 'Run demo', exact: true }).click();
  await expect(page).toHaveURL(/#overview$/);
  await page.getByRole('link', { name: /^Activity/ }).click();
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
  await page.goto('/#rules');
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

test('overview shows active issues, recent alerts, and links to the matching evidence', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: 'Ready to watch' })).toBeVisible();
  const rules = page.getByRole('region', { name: 'Rules', exact: true });
  await expect(rules.getByText('3enabled', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-empty.png', fullPage: true });
  await page.getByRole('button', { name: 'Run demo', exact: true }).click();
  const attention = page.getByRole('region', { name: /Needs attention/ });
  await expect(
    attention.getByRole('button', { name: 'View active issue for Agent a_88' }),
  ).toBeVisible();
  await expect(attention.getByText('Out of adherence for 30 min')).toBeVisible();
  await expect(attention.getByText('May 26 · 10:30 UTC')).toBeVisible();
  const recent = page.getByRole('region', { name: 'Recent alerts' });
  await expect(recent.getByRole('button')).toHaveCount(4);
  await expect(recent.getByText('Resolved', { exact: true })).toHaveCount(3);
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/overview-${width}.png`, fullPage: true });
  }
  await attention.getByRole('button', { name: 'View active issue for Agent a_88' }).click();
  await expect(page).toHaveURL(/#activity$/);
  const expanded = page
    .locator('.notification-card')
    .filter({ has: page.getByRole('button', { expanded: true }) });
  await expect(expanded.getByRole('heading', { name: 'Latest update' })).toBeInViewport();
  await expect(expanded.getByText(/Out of adherence for 30 min/)).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await recent.getByRole('button', { name: /View alert: Billing backlog/ }).click();
  await expect(
    page.getByRole('button', { name: /Billing backlog above 20/, expanded: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await rules.getByRole('button', { name: 'Edit Billing SLA breached' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit rule' })).toBeVisible();
  await page.keyboard.press('Escape');
  await rules.getByRole('link', { name: 'Manage rules' }).click();
  await expect(page).toHaveURL(/#rules$/);
  await page.getByRole('switch', { name: 'Enable Billing SLA breached' }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(rules.getByText('2enabled', { exact: false })).toBeVisible();
  await expect(rules.getByText('1paused', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ready to watch' })).toBeVisible();
  await expect(recent.getByRole('button')).toHaveCount(0);
});

test('preview explains matching backlog evidence and zero-result thresholds', async ({ page }) => {
  await page.goto('/#rules');
  await page.getByRole('button', { name: 'Create rule', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Notify when').selectOption('backlog');
  await editor.getByRole('button', { name: 'Test with sample' }).click();
  await expect(editor.getByText('22 tickets waiting. Your threshold is 20.')).toBeVisible();
  await editor.getByLabel('More than', { exact: true }).fill('100');
  await expect(editor.getByText('22 tickets waiting. Your threshold is 20.')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Test with sample' }).click();
  await expect(editor.getByText('0 alerts in the sample morning')).toBeVisible();
  await expect(
    editor.getByText('No sample snapshot in Billing had more than 100 tickets waiting.'),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await editor.getByLabel('Notify when').selectOption('adherence');
  await editor.getByRole('button', { name: 'Test with sample' }).click();
  await expect(
    editor.getByText('Out of adherence for 10 min. Your threshold is 10 min.'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/preview-reasons-mobile.png', fullPage: true });
  const state = await (await page.request.get('/api/state')).json();
  expect(state.notifications).toHaveLength(0);
});

test('freshness and unknown duration remain explicit until a newer valid check arrives', async ({
  page,
  request,
}) => {
  await request.post('/api/replay', { data: { action: 'finish' } });
  await page.goto('/#activity');
  const missing = page.getByRole('region', { name: 'Checks needing data' });
  await expect(missing.getByText('Agent a_23 · Duration unknown')).toBeVisible();
  const activeCard = page.locator('.notification-card').filter({ hasText: 'Agent a_88' });
  await expect(
    activeCard.getByText('Last observed May 26, 10:30:00 UTC', { exact: true }),
  ).toBeVisible();
  const unknown = {
    event_id: 'ui_unknown_88',
    ts: '2026-05-26T10:31:00Z',
    type: 'adherence_check',
    agent_id: 'a_88',
    queue_ids: ['tier_2'],
    scheduled_state: 'available',
    actual_state: 'in_meeting',
    in_violation: true,
    violation_started_at: null,
  };
  const response = await request.post('/api/events', { data: unknown });
  expect((await response.json()).outcome).toBe('unknown');
  await expect(
    activeCard.getByRole('button').getByText('Duration unknown', { exact: true }),
  ).toBeVisible();
  await expect(
    activeCard.getByText('Last observed May 26, 10:31:00 UTC', { exact: true }),
  ).toBeVisible();
  await activeCard.getByRole('button', { expanded: false }).click();
  await expect(
    activeCard.getByText('Confirmed May 26, 10:30:00 UTC', { exact: true }),
  ).toBeVisible();
  await expect(activeCard.getByText(/^Last confirmed: Out of adherence for 30 min/)).toBeVisible();
  await page.screenshot({ path: 'test-results/unknown-duration.png', fullPage: true });
  const stale = await request.post('/api/events', {
    data: {
      ...unknown,
      event_id: 'ui_stale_88',
      ts: '2026-05-26T10:29:00Z',
      in_violation: false,
      actual_state: 'available',
    },
  });
  expect((await stale.json()).outcome).toBe('stale');
  await expect(
    activeCard.getByRole('button').getByText('Duration unknown', { exact: true }),
  ).toBeVisible();
  const state = await (await request.get('/api/state')).json();
  expect(state.notifications).toHaveLength(4);
  expect(state.incidents.find((i: { entityId: string }) => i.entityId === 'a_88').status).toBe(
    'active',
  );
  await request.post('/api/events', {
    data: {
      ...unknown,
      event_id: 'ui_recovered_88',
      ts: '2026-05-26T10:32:00Z',
      in_violation: false,
      actual_state: 'available',
    },
  });
  await expect(activeCard.getByText('Resolved', { exact: true })).toBeVisible();
  await expect(
    activeCard.getByRole('button').getByText('Duration unknown', { exact: true }),
  ).toHaveCount(0);
  await expect(missing.getByText('Agent a_23 · Duration unknown')).toBeVisible();
  await request.post('/api/events', {
    data: {
      ...unknown,
      event_id: 'ui_recovered_23',
      agent_id: 'a_23',
      ts: '2026-05-26T10:33:00Z',
      in_violation: false,
      actual_state: 'available',
    },
  });
  await expect(missing).toHaveCount(0);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No active issues' })).toBeVisible();
});

test('edit impact counts active issues and saving stops them without retrospective alerts', async ({
  page,
  request,
}) => {
  await request.post('/api/replay', { data: { action: 'finish' } });
  const check = {
    event_id: 'ui_edit_19',
    ts: '2026-05-26T10:31:00Z',
    type: 'adherence_check',
    agent_id: 'a_19',
    queue_ids: ['billing'],
    scheduled_state: 'available',
    actual_state: 'on_break',
    in_violation: true,
    violation_started_at: '2026-05-26T10:00:00Z',
  };
  await request.post('/api/events', { data: check });
  const before = await (await request.get('/api/state')).json();
  await page.goto('/#rules');
  await page.getByRole('button', { name: 'Billing SLA breached', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Impact of saving' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Agent out of adherence for 10 min', exact: true })
    .click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('status', { name: 'Impact of saving' })).toContainText(
    'Saving will close 2 current issues.',
  );
  await editor.getByLabel('For at least').fill('12');
  await expect(
    editor.getByText(
      'They’ll be marked stopped. The updated rule starts with the next observation.',
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'test-results/edit-impact-mobile.png', fullPage: true });
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).not.toBeVisible();
  const after = await (await request.get('/api/state')).json();
  expect(after.notifications).toHaveLength(before.notifications.length);
  const adherence = after.rules.find((r: { kind: string }) => r.kind === 'adherence');
  expect(
    after.incidents.filter(
      (i: { ruleId: string; status: string }) => i.ruleId === adherence.id && i.status === 'active',
    ),
  ).toHaveLength(0);
  expect(
    after.incidents.filter(
      (i: { ruleId: string; closeReason: string }) =>
        i.ruleId === adherence.id && i.closeReason === 'Rule changed',
    ),
  ).toHaveLength(2);
  await page
    .getByRole('button', { name: 'Agent out of adherence for 10 min', exact: true })
    .click();
  await expect(editor.getByRole('status', { name: 'Impact of saving' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await request.post('/api/events', {
    data: { ...check, event_id: 'ui_edit_19_fresh', ts: '2026-05-26T10:32:00Z' },
  });
  const fresh = await (await request.get('/api/state')).json();
  expect(fresh.notifications).toHaveLength(before.notifications.length + 1);
});
