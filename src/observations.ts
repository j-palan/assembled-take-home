import type { Event, Rule } from '../server/domain';
import { time } from './api';

type AdherenceCheck = Extract<Event, { type: 'adherence_check' }>;
export type IncompleteCheck = { observation: AdherenceCheck; reason: string; explanation: string };

export function observationStamp(ts: string | null) {
  if (!ts) return 'unavailable';
  const date = new Date(ts).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
  return `${date}, ${time(ts)} UTC`;
}

/** Unknown evidence is distinct from recovery, including on a previously opened incident. */
export function incompleteCheck(observation: AdherenceCheck): IncompleteCheck | null {
  if (observation.queue_ids === null)
    return {
      observation,
      reason: 'Queue membership unknown',
      explanation: 'Queue membership is missing. Existing issues stay unchanged.',
    };
  if (observation.in_violation && !observation.violation_started_at)
    return {
      observation,
      reason: 'Duration unknown',
      explanation: 'The violation start time is missing. No new alert was sent for this check.',
    };
  return null;
}

/** Observations already contain only the newest accepted record per entity and event type. */
export function incompleteChecks(observations: Event[], rules: Rule[]): IncompleteCheck[] {
  const adherenceRules = rules.filter((r) => r.enabled && r.kind === 'adherence');
  return observations.flatMap((observation) => {
    if (observation.type !== 'adherence_check') return [];
    const check = incompleteCheck(observation);
    if (
      !check ||
      !adherenceRules.some(
        (r) =>
          observation.queue_ids === null ||
          observation.queue_ids.some((q) => r.queueIds.some((id) => id === q)),
      )
    )
      return [];
    return [check];
  });
}
