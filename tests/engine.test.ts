import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultRules, evaluate, eventSchema, ruleSchema, type RuleInput } from '../server/domain.ts';
import { Store } from '../server/store.ts';

const queue = (event_id: string, minute: number, waiting = 21, queue_id = 'billing') => ({
  event_id, ts: `2026-05-26T09:${String(minute).padStart(2, '0')}:00Z`, type: 'queue_snapshot',
  queue_id, tickets_waiting: waiting, longest_wait_sec: 180, sla_target_sec: 120,
  agents_available: 2, agents_on_call: 3, volume_last_15m: 20, volume_forecast_next_15m: 10,
});
const adherence = (event_id: string, minute: number, agent_id = 'a_19', violating = true, start: string | null = '2026-05-26T09:00:00Z') => ({
  event_id, ts: `2026-05-26T09:${String(minute).padStart(2, '0')}:00Z`, type: 'adherence_check',
  agent_id, queue_ids: ['billing'], scheduled_state: 'available', actual_state: violating ? 'on_break' : 'available',
  in_violation: violating, violation_started_at: start,
});
function using(fn: (s: Store) => void) { const s = new Store(); try { fn(s); } finally { s.close(); } }

test('threshold boundaries: backlog strictly greater, SLA strictly greater, adherence at least', () => {
  const q = eventSchema.parse(queue('q', 1, 20));
  assert.equal(evaluate(defaultRules[1], q)?.match, false);
  assert.equal(evaluate(defaultRules[0], eventSchema.parse({ ...q, longest_wait_sec: 120 }))?.match, false);
  assert.equal(evaluate(defaultRules[0], q)?.match, true);
  assert.equal(evaluate(defaultRules[2], eventSchema.parse(adherence('a', 9)))?.match, false);
  assert.equal(evaluate(defaultRules[2], eventSchema.parse(adherence('a', 10)))?.match, true);
});
test('one opening per incident, resolution and recurrence, entity isolation', () => using(s => {
  s.createRule({ ...defaultRules[1], queueIds: ['billing', 'tier_2'] });
  s.ingest(queue('1', 1)); s.ingest(queue('2', 2));
  assert.equal(s.listNotifications().length, 1);
  assert.equal(s.listIncidents()[0].lastObservedAt, '2026-05-26T09:02:00.000Z');
  s.ingest(queue('3', 3, 30, 'tier_2'));
  s.ingest(queue('4', 4, 0));
  assert.equal(s.listIncidents().filter(i => i.status === 'resolved').length, 1);
  s.ingest(queue('5', 5));
  assert.equal(s.listNotifications().length, 3);
}));
test('canonical retries deduplicate; conflicting IDs and late/equal timestamps cannot mutate state', () => using(s => {
  s.createRule(defaultRules[1]);
  const e = queue('1', 10);
  assert.equal(s.ingest(e), 'accepted');
  assert.equal(s.ingest(Object.fromEntries(Object.entries(e).reverse())), 'duplicate');
  assert.equal(s.ingest({ ...e, tickets_waiting: 0 }), 'conflict');
  assert.equal(s.ingest(queue('2', 9, 0)), 'stale');
  assert.equal(s.ingest(queue('3', 10, 0)), 'stale');
  assert.equal(s.listIncidents()[0].status, 'active');
  assert.equal(s.listNotifications().length, 1);
  assert.equal(s.listReceipts().length, 5);
}));
test('unknown adherence never fabricates a recovery and agent incidents are independent', () => using(s => {
  s.createRule(defaultRules[2]);
  assert.equal(s.ingest(adherence('1', 10, 'a_19', true, null)), 'unknown');
  assert.equal(s.listNotifications().length, 0);
  s.ingest(adherence('2', 11));
  s.ingest(adherence('3', 12, 'a_23'));
  s.ingest(adherence('4', 13, 'a_19', true, null));
  assert.equal(s.listIncidents().filter(i => i.status === 'active').length, 2);
  s.ingest(adherence('5', 14, 'a_19', false, null));
  assert.equal(s.listIncidents().filter(i => i.status === 'resolved').length, 1);
}));
test('scope, recipient and channel are enforced; event types have separate clocks', () => using(s => {
  s.createRule(defaultRules[0]); s.createRule(defaultRules[2]);
  s.ingest(queue('1', 20, 30, 'vip'));
  assert.equal(s.listNotifications().length, 0);
  s.ingest({ event_id: '2', ts: '2026-05-26T09:30:00Z', type: 'agent_state_change', agent_id: 'a_19', queue_ids: ['billing'], previous_state: null, previous_state_duration_sec: null, new_state: 'on_break' });
  assert.equal(s.ingest(adherence('3', 10)), 'accepted');
  const n = s.listNotifications()[0];
  assert.equal(n.recipientId, 'jordan'); assert.equal(n.channel, 'slack');
}));
test('invalid payloads reject safely, including future adherence starts', () => using(s => {
  for (const invalid of [{}, { ...queue('x', 1), tickets_waiting: -1 }, { ...queue('x', 1), ts: 'yesterday' }, adherence('a', 10, 'a_19', true, '2026-05-26T09:11:00Z')])
    assert.equal(s.ingest(invalid), 'invalid');
  assert.equal(s.listIncidents().length, 0);
  assert.throws(() => ruleSchema.parse({ ...defaultRules[1], queueIds: [] }));
  assert.throws(() => ruleSchema.parse({ ...defaultRules[1], threshold: null }));
}));
test('edits and pauses close old incidents; no retrospective evaluation; historical routing retained', () => using(s => {
  const rule = s.createRule(defaultRules[1]);
  s.ingest(queue('1', 1));
  const { id, revision, createdAt, ...input } = rule;
  s.updateRule(id, { ...input, enabled: false });
  assert.equal(s.listIncidents()[0].closeReason, 'Rule paused');
  s.ingest(queue('2', 2));
  assert.equal(s.listNotifications().length, 1);
  s.updateRule(id, { ...input, recipientId: 'jordan' });
  assert.equal(s.listNotifications().length, 1);
  s.ingest(queue('3', 3));
  assert.equal(s.listNotifications()[0].recipientId, 'jordan');
  assert.equal(s.listNotifications()[1].recipientId, 'maya');
  assert.equal(s.listIncidents()[0].revision, 3);
  s.deleteRule(id);
  assert.equal(s.listIncidents()[0].closeReason, 'Rule deleted');
  assert.equal(s.listNotifications().length, 2);
}));
test('event/incident/outbox/cursor changes roll back atomically on failure', () => using(s => {
  s.createRule(defaultRules[1]);
  s.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;");
  assert.throws(() => s.ingest(queue('1', 1), 1));
  assert.equal(s.listIncidents().length, 0);
  assert.equal(s.listReceipts().length, 0);
  assert.equal(s.getMeta('replayCursor'), undefined);
  s.db.exec('DROP TRIGGER fail_outbox');
  assert.equal(s.ingest(queue('1', 1), 1), 'accepted');
}));
test('restart persists incidents/cursor and idempotent stub survives send-before-ack failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intraday-'));
  const path = join(dir, 'test.sqlite');
  let s = new Store(path);
  try {
    s.createRule(defaultRules[1]); s.ingest(queue('1', 1), 1);
    s.flushOutbox(n => { s.deliverToInbox(n); throw new Error('crash before acknowledgment'); });
    assert.equal(s.listNotifications()[0].attempts, 1);
    assert.equal(s.listNotifications()[0].deliveredAt, null);
    s.close(); s = new Store(path);
    s.flushOutbox(); s.flushOutbox();
    assert.equal(s.deliveredCount(), 1);
    assert.equal(s.listNotifications()[0].attempts, 2);
    assert.ok(s.listNotifications()[0].deliveredAt);
    assert.equal(s.getMeta('replayCursor'), '1');
    s.ingest(queue('2', 2));
    assert.equal(s.listNotifications().length, 1);
  } finally { s.close(); rmSync(dir, { recursive: true }); }
});
test('sample replay has stable expected notifications and audits its intentional anomalies', () => using(s => {
  for (const r of defaultRules) s.createRule(r);
  const events = readFileSync(new URL('../events.jsonl', import.meta.url), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  for (const [index, e] of events.entries()) s.ingest(e, index + 1);
  s.flushOutbox();
  assert.equal(s.listReceipts().length, 96);
  assert.equal(s.listReceipts().filter(r => r.outcome === 'conflict').length, 1);
  assert.equal(s.listReceipts().filter(r => r.outcome === 'stale').length, 1);
  assert.equal(s.listReceipts().filter(r => r.outcome === 'unknown').length, 1);
  assert.deepEqual(s.listNotifications().map(n => [n.ruleName, n.entityId, n.eventTime]).reverse(), [
    ['Billing SLA breached', 'billing', '2026-05-26T09:30:00.000Z'],
    ['Billing backlog above 20', 'billing', '2026-05-26T09:36:00.000Z'],
    ['Agent out of adherence for 10 min', 'a_19', '2026-05-26T09:45:00.000Z'],
    ['Agent out of adherence for 10 min', 'a_88', '2026-05-26T10:15:00.000Z'],
  ]);
}));
