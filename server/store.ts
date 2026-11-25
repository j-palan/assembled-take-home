import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  canonical,
  defaultRules,
  evaluate,
  eventSchema,
  ruleSchema,
  type Evidence,
  type Rule,
  type RuleInput,
} from './domain.ts';

export type Outcome = 'accepted' | 'duplicate' | 'conflict' | 'stale' | 'invalid' | 'unknown';
export type Incident = {
  id: string;
  ruleId: string;
  revision: number;
  ruleName: string;
  entityId: string;
  status: 'active' | 'resolved' | 'closed';
  openedAt: string;
  lastObservedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  evidence: Evidence;
};
export type Notification = {
  id: string;
  incidentId: string;
  ruleName: string;
  entityId: string;
  recipientId: string;
  channel: RuleInput['channel'];
  eventTime: string;
  eventId: string;
  evidence: Evidence;
  deliveredAt: string | null;
  attempts: number;
  lastError: string | null;
};
export type Receipt = {
  id: number;
  eventId: string | null;
  eventTime: string | null;
  outcome: Outcome;
  detail: string;
};
type JsonRow = { data: string };
const parseRow = <T>(row: unknown): T | undefined =>
  row ? JSON.parse((row as JsonRow).data) : undefined;

export class Store {
  readonly db: DatabaseSync;
  constructor(path = ':memory:', seed = false) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, kind TEXT NOT NULL, enabled INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS rules_kind ON rules(kind, enabled);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY, event_id TEXT, event_time TEXT, outcome TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations (entity_key TEXT PRIMARY KEY, event_time TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, entity_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_incident ON incidents(rule_id, entity_id) WHERE status='active';
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, incident_id TEXT NOT NULL UNIQUE REFERENCES incidents(id), delivered INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pending_delivery ON outbox(delivered);
      CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY REFERENCES outbox(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    if (seed && !this.getMeta('initialized'))
      this.transaction(() => {
        for (const rule of defaultRules) this.createRule(rule);
        this.setMeta('initialized', 'true');
      });
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  getMeta(key: string) {
    return (
      this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value;
  }
  setMeta(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run(key, value);
  }
  listRules(): Rule[] {
    return this.db
      .prepare('SELECT data FROM rules ORDER BY rowid')
      .all()
      .map((row) => parseRow<Rule>(row)!);
  }
  getRule(id: string) {
    return parseRow<Rule>(this.db.prepare('SELECT data FROM rules WHERE id=?').get(id));
  }
  createRule(input: unknown): Rule {
    const rule = {
      ...ruleSchema.parse(input),
      id: randomUUID(),
      revision: 1,
      createdAt: new Date().toISOString(),
    };
    this.writeRule(rule);
    return rule;
  }
  private writeRule(rule: Rule) {
    this.db
      .prepare('INSERT OR REPLACE INTO rules VALUES (?,?,?,?)')
      .run(rule.id, rule.kind, Number(rule.enabled), JSON.stringify(rule));
  }
  updateRule(id: string, input: unknown): Rule | undefined {
    const valid = ruleSchema.parse(input);
    const previous = this.getRule(id);
    if (!previous) return;
    return this.transaction(() => {
      this.closeRuleIncidents(id, valid.enabled ? 'Rule changed' : 'Rule paused');
      const rule = { ...previous, ...valid, revision: previous.revision + 1 };
      this.writeRule(rule);
      return rule;
    });
  }
  deleteRule(id: string): boolean {
    return this.transaction(() => {
      this.closeRuleIncidents(id, 'Rule deleted');
      return this.db.prepare('DELETE FROM rules WHERE id=?').run(id).changes > 0;
    });
  }
  private closeRuleIncidents(id: string, reason: string) {
    for (const row of this.db
      .prepare("SELECT data FROM incidents WHERE rule_id=? AND status='active'")
      .all(id)) {
      const incident = parseRow<Incident>(row)!;
      this.writeIncident({
        ...incident,
        status: 'closed',
        closeReason: reason,
        closedAt: new Date().toISOString(),
      });
    }
  }
  private writeIncident(i: Incident) {
    this.db
      .prepare(
        'INSERT INTO incidents VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data',
      )
      .run(i.id, i.ruleId, i.entityId, i.status, JSON.stringify(i));
  }
  listIncidents(): Incident[] {
    return this.db
      .prepare('SELECT data FROM incidents ORDER BY rowid DESC LIMIT 200')
      .all()
      .map((r) => parseRow<Incident>(r)!);
  }
  listNotifications(): Notification[] {
    return this.db
      .prepare('SELECT data FROM outbox ORDER BY rowid DESC LIMIT 200')
      .all()
      .map((r) => parseRow<Notification>(r)!);
  }
  listReceipts(): Receipt[] {
    return this.db
      .prepare(
        'SELECT id, event_id as eventId, event_time as eventTime, outcome, detail FROM receipts ORDER BY id DESC LIMIT 200',
      )
      .all() as Receipt[];
  }
  observations() {
    return this.db
      .prepare('SELECT data FROM observations ORDER BY entity_key')
      .all()
      .map((r) => JSON.parse((r as JsonRow).data));
  }
  stats() {
    return this.db
      .prepare('SELECT outcome, COUNT(*) as count FROM receipts GROUP BY outcome')
      .all() as { outcome: Outcome; count: number }[];
  }
  private receipt(
    eventId: string | null,
    eventTime: string | null,
    outcome: Outcome,
    detail: string,
  ): Outcome {
    this.db
      .prepare('INSERT INTO receipts(event_id,event_time,outcome,detail) VALUES (?,?,?,?)')
      .run(eventId, eventTime, outcome, detail);
    return outcome;
  }
  ingest(raw: unknown, replayCursor?: number): Outcome {
    return this.transaction(() => {
      const outcome = this.process(raw);
      if (replayCursor !== undefined) this.setMeta('replayCursor', String(replayCursor));
      return outcome;
    });
  }
  private process(raw: unknown): Outcome {
    const result = eventSchema.safeParse(raw);
    if (!result.success)
      return this.receipt(
        null,
        null,
        'invalid',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    const e = result.data;
    const payload = canonical(e);
    const existing = this.db.prepare('SELECT payload FROM events WHERE id=?').get(e.event_id) as
      { payload: string } | undefined;
    if (existing)
      return this.receipt(
        e.event_id,
        e.ts,
        existing.payload === payload ? 'duplicate' : 'conflict',
        existing.payload === payload
          ? 'Identical retry ignored.'
          : 'Event ID reused with a different payload; original retained.',
      );
    this.db.prepare('INSERT INTO events VALUES (?,?)').run(e.event_id, payload);
    const entityId = e.type === 'queue_snapshot' ? e.queue_id : e.agent_id;
    const key = `${e.type}:${entityId}`;
    const last = this.db
      .prepare('SELECT event_time FROM observations WHERE entity_key=?')
      .get(key) as { event_time: string } | undefined;
    if (last && e.ts <= last.event_time)
      return this.receipt(
        e.event_id,
        e.ts,
        'stale',
        `Observation is not newer than ${last.event_time}; current state preserved.`,
      );
    this.db
      .prepare('INSERT OR REPLACE INTO observations VALUES (?,?,?)')
      .run(key, e.ts, JSON.stringify(e));
    const relevant =
      e.type === 'queue_snapshot'
        ? ['sla', 'backlog']
        : e.type === 'adherence_check'
          ? ['adherence']
          : [];
    let unknown = e.type === 'adherence_check' && e.in_violation && !e.violation_started_at;
    for (const kind of relevant) {
      const rules = this.db
        .prepare('SELECT data FROM rules WHERE kind=? AND enabled=1')
        .all(kind)
        .map((r) => parseRow<Rule>(r)!);
      for (const rule of rules) {
        const evaluation = evaluate(rule, e);
        if (!evaluation) continue;
        const active = parseRow<Incident>(
          this.db
            .prepare(
              "SELECT data FROM incidents WHERE rule_id=? AND entity_id=? AND status='active'",
            )
            .get(rule.id, evaluation.entityId),
        );
        if (evaluation.match === null) {
          unknown = true;
          continue;
        }
        if (evaluation.match) {
          if (active)
            this.writeIncident({ ...active, lastObservedAt: e.ts, evidence: evaluation.evidence! });
          else {
            const incident: Incident = {
              id: randomUUID(),
              ruleId: rule.id,
              revision: rule.revision,
              ruleName: rule.name,
              entityId: evaluation.entityId,
              status: 'active',
              openedAt: e.ts,
              lastObservedAt: e.ts,
              closedAt: null,
              closeReason: null,
              evidence: evaluation.evidence!,
            };
            this.writeIncident(incident);
            const notification: Notification = {
              id: randomUUID(),
              incidentId: incident.id,
              ruleName: rule.name,
              entityId: incident.entityId,
              recipientId: rule.recipientId,
              channel: rule.channel,
              eventTime: e.ts,
              eventId: e.event_id,
              evidence: incident.evidence,
              deliveredAt: null,
              attempts: 0,
              lastError: null,
            };
            this.db
              .prepare('INSERT INTO outbox(id,incident_id,data) VALUES (?,?,?)')
              .run(notification.id, incident.id, JSON.stringify(notification));
          }
        } else if (active)
          this.writeIncident({
            ...active,
            status: 'resolved',
            lastObservedAt: e.ts,
            closedAt: e.ts,
            closeReason: 'Condition cleared',
            evidence: evaluation.evidence!,
          });
      }
    }
    return this.receipt(
      e.event_id,
      e.ts,
      unknown ? 'unknown' : 'accepted',
      unknown
        ? 'Missing violation_started_at; duration unknown, incident state preserved.'
        : 'Fresh observation processed.',
    );
  }
  /** Stub provider with durable, idempotent inbox insertion. Called by the delivery worker. */
  deliverToInbox(notification: Notification) {
    this.db
      .prepare('INSERT OR IGNORE INTO inbox VALUES (?,?)')
      .run(notification.id, JSON.stringify(notification));
  }
  deliveredCount() {
    return (this.db.prepare('SELECT COUNT(*) as count FROM inbox').get() as { count: number })
      .count;
  }
  flushOutbox(deliver: (n: Notification) => void = (n) => this.deliverToInbox(n)) {
    const pending = this.db
      .prepare('SELECT data FROM outbox WHERE delivered=0 ORDER BY rowid LIMIT 100')
      .all();
    for (const row of pending) {
      const n = parseRow<Notification>(row)!;
      n.attempts++;
      try {
        deliver(n);
        n.deliveredAt = new Date().toISOString();
        n.lastError = null;
      } catch (error) {
        n.lastError = error instanceof Error ? error.message : 'Delivery failed';
      }
      this.db
        .prepare('UPDATE outbox SET delivered=?,data=? WHERE id=?')
        .run(Number(n.deliveredAt !== null), JSON.stringify(n), n.id);
    }
  }
  reset() {
    this.transaction(() => {
      this.db.exec(
        'DELETE FROM inbox; DELETE FROM outbox; DELETE FROM incidents; DELETE FROM observations; DELETE FROM receipts; DELETE FROM events;',
      );
      this.setMeta('replayCursor', '0');
    });
  }
}
