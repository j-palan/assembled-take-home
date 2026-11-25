import { defaultRules, recipients } from '../server/domain.ts';
import { Replay } from '../server/replay.ts';
import { Store } from '../server/store.ts';

// An isolated run, never touches the application database.
const store = new Store();
try {
  for (const r of defaultRules) store.createRule(r);
  const replay = new Replay(store);
  replay.finish();
  for (const n of store.listNotifications().reverse()) {
    console.log(`${n.eventTime} | ${n.ruleName} | ${n.entityId}\n  ${n.evidence.message}\n  → ${recipients.find(r => r.id === n.recipientId)?.name} via ${n.channel} stub\n`);
  }
  console.log('Processing outcomes:', store.stats());
  console.log(`Delivered ${store.deliveredCount()} notifications from ${replay.cursor} events.`);
} finally { store.close(); }
