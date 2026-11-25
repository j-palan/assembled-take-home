import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ChevronDown } from 'lucide-react';
import { recipients } from '../server/domain';
import { entityName, time, type AppState } from './api';
import { EmptyState } from './ui';
import { incompleteCheck, incompleteChecks, observationStamp } from './observations';
import { UnknownChecks } from './UnknownChecks';

export function ActivityInbox({
  data,
  initialExpanded,
}: {
  data: AppState;
  initialExpanded?: string;
}) {
  const [filter, setFilter] = useState('all');
  const [recipient, setRecipient] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(initialExpanded ?? null);
  useEffect(() => {
    if (!initialExpanded) return;
    const card = document.getElementById(`notification-${initialExpanded}`)?.closest('article');
    card?.scrollIntoView({ block: 'nearest' });
    card?.querySelector<HTMLButtonElement>('.notification-trigger')?.focus({ preventScroll: true });
  }, [initialExpanded]);
  const notifications = data.notifications.filter(
    (n) =>
      (recipient === 'all' || n.recipientId === recipient) &&
      (filter === 'all' || data.incidents.find((i) => i.id === n.incidentId)?.status === filter),
  );
  return (
    <section aria-label="Notification history">
      <UnknownChecks checks={incompleteChecks(data.observations, data.rules)} />
      <div className="list-toolbar">
        <div className="segmented" aria-label="Filter alerts">
          {[
            ['all', 'All'],
            ['active', 'Active'],
            ['resolved', 'Resolved'],
            ['closed', 'Stopped'],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          <span className="sr-only">Filter by recipient</span>
          <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option value="all">All recipients</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="notification-list">
        {notifications.map((n) => {
          const incident = data.incidents.find((i) => i.id === n.incidentId);
          const state = incident?.status ?? 'closed';
          const latestCheck = data.observations.find(
            (e) => e.type === 'adherence_check' && e.agent_id === n.entityId,
          );
          const unknown =
            state === 'active' && latestCheck?.type === 'adherence_check'
              ? incompleteCheck(latestCheck)
              : null;
          const recipientName = recipients.find((r) => r.id === n.recipientId)?.name;
          const summaryEvidence = state === 'active' && incident ? incident.evidence : n.evidence;
          return (
            <article className="notification-card" key={n.id}>
              <button
                className="notification-trigger"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                aria-expanded={expanded === n.id}
                aria-controls={`notification-${n.id}`}
              >
                <span className={`template-icon ${state === 'active' ? 'rose' : 'green'}`}>
                  {state === 'active' ? <Bell size={20} /> : <CheckCheck size={20} />}
                </span>
                <span className="notification-content">
                  <span className="notification-title">
                    <strong>{n.ruleName}</strong>
                    <span
                      className={`pill ${state === 'active' ? 'warning' : state === 'resolved' ? 'green' : 'neutral'}`}
                    >
                      {state === 'closed' ? 'Stopped' : state === 'active' ? 'Active' : 'Resolved'}
                    </span>
                  </span>
                  <span className="notification-description">
                    {entityName(n.entityId)} · {unknown ? 'Last confirmed: ' : ''}
                    {summaryEvidence.message.split(';')[0]}
                  </span>
                  <small>
                    {recipientName} · {n.channel === 'slack' ? 'Slack' : 'In-app'} ·{' '}
                    {n.deliveredAt ? 'Delivered' : n.lastError ? 'Retrying' : 'Sending…'}
                  </small>
                  <small className="observation-status">
                    <span>
                      Last observed{' '}
                      {observationStamp(
                        unknown?.observation.ts ?? incident?.lastObservedAt ?? null,
                      )}
                    </span>
                    {unknown && <span className="data-badge">{unknown.reason}</span>}
                  </small>
                </span>
                <span className="notification-time">{time(n.eventTime).slice(0, 5)}</span>
                <ChevronDown size={17} className={expanded === n.id ? 'rotated' : ''} />
              </button>
              {expanded === n.id && (
                <div className="notification-details" id={`notification-${n.id}`}>
                  <div className="evidence-grid">
                    <div>
                      <h3>Why it fired</h3>
                      <p>{n.evidence.message}</p>
                      <small>{time(n.eventTime)} UTC</small>
                    </div>
                    <div>
                      <h3>Latest update</h3>
                      {unknown ? (
                        <>
                          <p className="data-unknown-title">{unknown.reason}</p>
                          <p>Last confirmed: {incident?.evidence.message}</p>
                          <small>
                            Confirmed {observationStamp(incident?.lastObservedAt ?? null)}
                          </small>
                        </>
                      ) : (
                        <>
                          <p>{incident?.evidence.message}</p>
                          <small>
                            Last observed {observationStamp(incident?.lastObservedAt ?? null)}
                          </small>
                        </>
                      )}
                      {incident?.closeReason && (
                        <p className="close-reason">{incident.closeReason}</p>
                      )}
                    </div>
                  </div>
                  <details className="technical-details">
                    <summary>Delivery & event details</summary>
                    <p>
                      {n.deliveredAt ? 'Delivered to local inbox' : 'Pending delivery'} ·{' '}
                      {n.attempts} attempt{n.attempts === 1 ? '' : 's'}
                    </p>
                    <p>
                      {recipientName} via {n.channel === 'slack' ? 'Slack' : 'in-app'} (local demo)
                    </p>
                    <code>{n.eventId}</code>
                    {n.lastError && <p role="alert">{n.lastError}</p>}
                  </details>
                </div>
              )}
            </article>
          );
        })}
        {!notifications.length && (
          <EmptyState
            Icon={Bell}
            title={data.notifications.length ? 'No matching alerts' : 'Nothing to report yet'}
            text={
              data.notifications.length
                ? 'Try a different filter.'
                : 'Run the demo above to see which rules send an alert.'
            }
          />
        )}
      </div>
    </section>
  );
}
