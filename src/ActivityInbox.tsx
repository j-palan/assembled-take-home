import { useState } from 'react';
import { Bell, CheckCheck, ChevronDown, ListFilter } from 'lucide-react';
import { recipients } from '../server/domain';
import { entityName, time, type AppState } from './api';
import { EmptyState } from './ui';

export function ActivityInbox({ data }: { data: AppState }) {
  const [filter, setFilter] = useState('all');
  const [recipient, setRecipient] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const notifications = data.notifications.filter(
    (n) =>
      (recipient === 'all' || n.recipientId === recipient) &&
      (filter === 'all' || data.incidents.find((i) => i.id === n.incidentId)?.status === filter),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>
            Notification history <span className="number-badge">{data.notifications.length}</span>
          </h2>
          <p>Opening alerts stay here as incidents update and resolve.</p>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="segmented" aria-label="Filter incidents">
          {['all', 'active', 'resolved', 'closed'].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={filter === f ? 'selected' : ''}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All alerts' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label className="filter-select">
          <ListFilter size={15} />
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
          return (
            <article className="notification-card" key={n.id}>
              <button
                className="notification-trigger"
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                aria-expanded={expanded === n.id}
                aria-controls={`notification-${n.id}`}
              >
                <span className={`notification-icon ${state === 'active' ? 'rose' : 'green'}`}>
                  {state === 'active' ? <Bell size={20} /> : <CheckCheck size={20} />}
                </span>
                <span className="notification-content">
                  <span>
                    <strong>{n.ruleName}</strong>
                    <span
                      className={`pill ${state === 'active' ? 'warning' : state === 'resolved' ? 'green' : 'neutral'}`}
                    >
                      {state}
                    </span>
                  </span>
                  <span>
                    {entityName(n.entityId)} · {n.evidence.message}
                  </span>
                  <small>
                    {recipients.find((r) => r.id === n.recipientId)?.name} ·{' '}
                    {n.channel === 'slack' ? 'Slack stub' : 'In-app inbox'} ·{' '}
                    {n.deliveredAt
                      ? 'Delivered'
                      : n.lastError
                        ? 'Retrying delivery'
                        : 'Pending delivery'}
                  </small>
                </span>
                <span className="notification-time">
                  {time(n.eventTime)}
                  <small>UTC</small>
                </span>
                <ChevronDown size={17} className={expanded === n.id ? 'rotated' : ''} />
              </button>
              {expanded === n.id && (
                <div className="notification-details" id={`notification-${n.id}`}>
                  <div>
                    <span className="tiny-label">TRIGGERING OBSERVATION</span>
                    <p>
                      {n.evidence.value} {n.evidence.unit} observed · threshold{' '}
                      {n.evidence.threshold} {n.evidence.unit}
                    </p>
                    <code>{n.eventId}</code>
                    <p>
                      {time(n.eventTime)} UTC · {new Date(n.eventTime).toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <div>
                    <span className="tiny-label">LATEST INCIDENT EVIDENCE</span>
                    <p>{incident?.evidence.message}</p>
                    <p>Last confirmed: {time(incident?.lastObservedAt ?? null)} UTC</p>
                    {incident?.closeReason && (
                      <p>
                        {incident.closeReason} · {time(incident.closedAt)} UTC
                      </p>
                    )}
                    <small>Based on observed events; no recovery inferred from silence.</small>
                  </div>
                  <div>
                    <span className="tiny-label">DELIVERY RECEIPT</span>
                    <p>
                      {n.deliveredAt ? 'Delivered to local inbox' : 'Awaiting delivery'} ·{' '}
                      {n.attempts} attempt{n.attempts === 1 ? '' : 's'}
                    </p>
                    <p>
                      {n.channel === 'slack'
                        ? 'Slack adapter is a local stub.'
                        : 'In-app delivery is a local stub.'}{' '}
                      No external messages sent.
                    </p>
                    {n.lastError && <p role="alert">{n.lastError}</p>}
                    <code>{n.id}</code>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {!notifications.length && (
          <EmptyState
            Icon={Bell}
            title={
              data.notifications.length
                ? 'No alerts match these filters'
                : 'A quiet inbox, by design'
            }
            text={
              data.notifications.length
                ? 'Try another status or recipient.'
                : 'Play the sample morning to see your rules in action. Only the first observation of each incident sends an alert.'
            }
          />
        )}
      </div>
    </>
  );
}
