import { z } from 'zod';

const id = z.string().trim().min(1).max(120);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base = { event_id: id, ts: timestamp };
const queues = z.array(id).min(1).max(100);
const state = z.enum(['available', 'on_call', 'on_break', 'in_meeting', 'offline']);
export const eventSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        ...base,
        type: z.literal('queue_snapshot'),
        queue_id: id,
        tickets_waiting: count,
        longest_wait_sec: count,
        sla_target_sec: count.positive(),
        agents_available: count,
        agents_on_call: count,
        volume_last_15m: count,
        volume_forecast_next_15m: count,
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('agent_state_change'),
        agent_id: id,
        queue_ids: queues,
        previous_state: state.nullable(),
        previous_state_duration_sec: count.nullable(),
        new_state: state,
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal('adherence_check'),
        agent_id: id,
        queue_ids: queues,
        scheduled_state: state,
        actual_state: state,
        in_violation: z.boolean(),
        violation_started_at: timestamp.nullable(),
      })
      .strict(),
  ])
  .superRefine((e, ctx) => {
    if (e.type === 'adherence_check' && e.violation_started_at && e.violation_started_at > e.ts)
      ctx.addIssue({
        code: 'custom',
        path: ['violation_started_at'],
        message: 'Violation cannot start after the observation.',
      });
  });
export type Event = z.infer<typeof eventSchema>;
export const kinds = ['sla', 'backlog', 'adherence'] as const;
export type Kind = (typeof kinds)[number];
export const recipients = [
  { id: 'maya', name: 'Maya Chen', role: 'Team lead' },
  { id: 'jordan', name: 'Jordan Lee', role: 'Operations manager' },
] as const;
export const queueOptions = ['billing', 'tier_2', 'vip'] as const;
export const ruleSchema = z
  .object({
    name: z.string().trim().min(1, 'Give this rule a name.').max(80),
    kind: z.enum(kinds),
    queueIds: z
      .array(z.enum(queueOptions))
      .min(1, 'Select at least one queue.')
      .max(3)
      .transform((q) => [...new Set(q)]),
    threshold: z.number().int().min(1).max(10000).nullable(),
    recipientId: z.enum(['maya', 'jordan']),
    channel: z.enum(['in_app', 'slack']),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.kind !== 'sla' && r.threshold === null)
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: 'Enter a threshold.' });
    if (r.kind === 'sla' && r.threshold !== null)
      ctx.addIssue({
        code: 'custom',
        path: ['threshold'],
        message: 'SLA rules use the queue’s SLA target.',
      });
  });
export type RuleInput = z.infer<typeof ruleSchema>;
export type Rule = RuleInput & { id: string; revision: number; createdAt: string };
export type Evidence = { value: number; threshold: number; unit: string; message: string };
export type Evaluation = { entityId: string; match: boolean | null; evidence: Evidence | null };

/** Pure observation-based evaluation; null means insufficient evidence, not recovery. */
export function evaluate(rule: RuleInput, event: Event): Evaluation | null {
  if (!rule.enabled) return null;
  if (
    event.type === 'queue_snapshot' &&
    rule.kind !== 'adherence' &&
    rule.queueIds.includes(event.queue_id as (typeof rule.queueIds)[number])
  ) {
    const sla = rule.kind === 'sla';
    const value = sla ? event.longest_wait_sec : event.tickets_waiting;
    const threshold = sla ? event.sla_target_sec : rule.threshold!;
    return {
      entityId: event.queue_id,
      match: value > threshold,
      evidence: {
        value,
        threshold,
        unit: sla ? 'seconds' : 'tickets',
        message: sla
          ? `Oldest ticket waited ${value}s; SLA target is ${threshold}s.`
          : `${value} tickets waiting; threshold is more than ${threshold}.`,
      },
    };
  }
  if (
    event.type === 'adherence_check' &&
    rule.kind === 'adherence' &&
    event.queue_ids.some((q) => rule.queueIds.includes(q as (typeof rule.queueIds)[number]))
  ) {
    if (event.in_violation && !event.violation_started_at)
      return { entityId: event.agent_id, match: null, evidence: null };
    const seconds = event.in_violation
      ? (Date.parse(event.ts) - Date.parse(event.violation_started_at!)) / 1000
      : 0;
    return {
      entityId: event.agent_id,
      match: event.in_violation && seconds >= rule.threshold! * 60,
      evidence: {
        value: seconds,
        threshold: rule.threshold! * 60,
        unit: 'seconds',
        message: event.in_violation
          ? `Out of adherence for ${Math.floor(seconds / 60)} min; threshold is ${rule.threshold} min. Scheduled: ${event.scheduled_state}. Actual: ${event.actual_state}.`
          : 'Agent is back in adherence.',
      },
    };
  }
  return null;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export const defaultRules: RuleInput[] = [
  {
    name: 'Billing SLA breached',
    kind: 'sla',
    queueIds: ['billing'],
    threshold: null,
    recipientId: 'maya',
    channel: 'slack',
    enabled: true,
  },
  {
    name: 'Billing backlog above 20',
    kind: 'backlog',
    queueIds: ['billing'],
    threshold: 20,
    recipientId: 'maya',
    channel: 'in_app',
    enabled: true,
  },
  {
    name: 'Agent out of adherence for 10 min',
    kind: 'adherence',
    queueIds: ['billing', 'tier_2', 'vip'],
    threshold: 10,
    recipientId: 'jordan',
    channel: 'slack',
    enabled: true,
  },
];
