import type { Rule } from '../server/domain';
import type { Incident, Notification, Receipt, Outcome } from '../server/store';
import type { Replay } from '../server/replay';

export type AppState = {
  rules: Rule[];
  incidents: Incident[];
  notifications: Notification[];
  receipts: Receipt[];
  stats: { outcome: Outcome; count: number }[];
  observations: { type: string; ts: string; queue_id?: string; agent_id?: string }[];
  replay: ReturnType<Replay['status']>;
};
export type Preview = Pick<AppState, 'notifications' | 'incidents' | 'stats'>;
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.issues
        ?.map((i: { path: string[]; message: string }) => `${i.path.join('.')}: ${i.message}`)
        .join('; ') ||
        data.error ||
        'Unable to complete request.',
    );
  return data;
}
export const queueName = (id: string) =>
  ({ billing: 'Billing', tier_2: 'Tier 2', vip: 'VIP' })[id] ?? id;
export const entityName = (id: string) => (id.startsWith('a_') ? `Agent ${id}` : queueName(id));
export function time(ts: string | null) {
  return ts
    ? new Date(ts).toLocaleTimeString('en-GB', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
}
