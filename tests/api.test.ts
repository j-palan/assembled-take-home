import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.ts';
import { Store } from '../server/store.ts';
import { Replay } from '../server/replay.ts';
import { defaultRules } from '../server/domain.ts';

test('API rule CRUD, isolated preview, replay, delivery and reset preserving rules', async () => {
  const store = new Store();
  const replay = new Replay(store);
  const server = createApp(store, replay).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  try {
    assert.equal(
      (await request('rules', 'POST', { ...defaultRules[0], queueIds: [] })).status,
      422,
    );
    const created = await request('rules', 'POST', defaultRules[0]);
    assert.equal(created.status, 201);
    const preview = await request('preview', 'POST', defaultRules[0]);
    assert.equal(preview.body.notifications.length, 1);
    assert.equal((await request('state')).body.notifications.length, 0);
    assert.equal((await request('replay', 'POST', { action: 'play', rate: 0 })).status, 422);
    await request('replay', 'POST', { action: 'finish' });
    const state = (await request('state')).body;
    assert.equal(state.replay.cursor, 96);
    assert.equal(state.replay.time, '2026-05-26T10:30:00.000Z');
    assert.equal(state.notifications.length, 1);
    assert.ok(state.notifications[0].deliveredAt);
    assert.equal(store.deliveredCount(), 1);
    assert.equal((await request('notifications')).body.length, 1);
    const rule = created.body;
    assert.equal(
      (await request(`rules/${rule.id}`, 'PUT', { ...defaultRules[0], enabled: false })).body
        .revision,
      2,
    );
    await request('replay', 'POST', { action: 'reset' });
    assert.equal((await request('state')).body.rules.length, 1);
    assert.equal((await request('state')).body.notifications.length, 0);
    assert.equal((await request(`rules/${rule.id}`, 'DELETE')).status, 204);
    assert.equal((await request(`rules/${rule.id}`, 'DELETE')).status, 404);
    assert.equal((await request('events', 'POST', {})).status, 422);
    assert.equal((await request('missing')).status, 404);
    const malformed = await fetch(`http://127.0.0.1:${address.port}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.status, 400);
  } finally {
    replay.pause();
    server.close();
    server.closeAllConnections();
    store.close();
  }
});

test('replay pauses and resumes from its durable cursor; preview has no delivery side effects', () => {
  const store = new Store();
  try {
    const replay = new Replay(store);
    replay.step();
    replay.step();
    const restarted = new Replay(store);
    assert.equal(restarted.status().cursor, 2);
    assert.equal(restarted.status().playing, false);
    restarted.step();
    assert.equal(store.listReceipts().length, 3);
    assert.equal(store.getMeta('replayCursor'), '3');
  } finally {
    store.close();
  }
});
