import { ArrowRight, Bell, Check, Clock3, ShieldCheck } from 'lucide-react';
import { recipients, type Rule } from '../server/domain';
import { entityName, time, type AppState } from './api';
import { incompleteChecks } from './observations';
import { UnknownChecks } from './UnknownChecks';

export function Overview({
  data,
  onOpenAlert,
  onEditRule,
}: {
  data: AppState;
  onOpenAlert: (id?: string) => void;
  onEditRule: (rule: Rule) => void;
}) {
  const active = data.incidents.filter((i) => i.status === 'active');
  const enabled = data.rules.filter((r) => r.enabled).length;
  const unknown = incompleteChecks(data.observations, data.rules);
  const latest = data.observations.reduce<string | null>(
    (last, observation) => (!last || observation.ts > last ? observation.ts : last),
    null,
  );
  const observedAt = latest
    ? `${new Date(latest).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })} · ${time(latest).slice(0, 5)} UTC`
    : null;
  return (
    <div className="overview">
      <div className="overview-top">
        <section className="overview-panel attention-panel" aria-labelledby="attention-title">
          <div className="overview-section-heading">
            <h2 id="attention-title">
              Needs attention{' '}
              {active.length > 0 && <span className="attention-count">{active.length}</span>}
            </h2>
            {observedAt && (
              <span className="observation-time">
                <Clock3 size={13} />
                {observedAt}
              </span>
            )}
          </div>
          {active.length === 0 && unknown.length === 0 ? (
            <div className="attention-empty">
              <span>
                <ShieldCheck size={25} />
              </span>
              <h3>{latest ? 'No active issues' : 'Ready to watch'}</h3>
              <p>
                {latest
                  ? 'No issues in the latest observations.'
                  : 'Run the demo to see which rules catch an issue.'}
              </p>
            </div>
          ) : (
            <div className="attention-list">
              {active.map((incident) => {
                const notification = data.notifications.find((n) => n.incidentId === incident.id);
                const recipient = recipients.find((r) => r.id === notification?.recipientId);
                return (
                  <button
                    className="attention-item"
                    key={incident.id}
                    onClick={() => onOpenAlert(notification?.id)}
                    aria-label={`View active issue for ${entityName(incident.entityId)}`}
                  >
                    <span className="attention-dot" />
                    <span className="attention-content">
                      <strong>{entityName(incident.entityId)}</strong>
                      <span>{incident.evidence.message.split(';')[0]}</span>
                      <small>
                        {recipient
                          ? `${recipient.name}${notification?.deliveredAt ? ' notified' : ' · delivery pending'} · `
                          : ''}
                        Observed {time(incident.lastObservedAt).slice(0, 5)} UTC
                      </small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                );
              })}
            </div>
          )}
          <UnknownChecks checks={unknown} />
        </section>
        <section className="overview-panel rule-overview" aria-labelledby="rules-summary-title">
          <div className="overview-section-heading">
            <h2 id="rules-summary-title">Rules</h2>
            <a href="#rules" aria-label="Manage rules">
              Manage <ArrowRight size={14} />
            </a>
          </div>
          <div className="rules-totals">
            <strong>
              {enabled}
              <span>enabled</span>
            </strong>
            <strong>
              {data.rules.length - enabled}
              <span>paused</span>
            </strong>
          </div>
          {data.rules.length ? (
            <div className="overview-rule-list">
              {data.rules.slice(0, 3).map((rule) => (
                <button
                  key={rule.id}
                  onClick={() => onEditRule(rule)}
                  aria-label={`Edit ${rule.name}`}
                >
                  <span className={`rule-indicator ${rule.enabled ? 'enabled' : ''}`}>
                    {rule.enabled && <Check size={10} />}
                  </span>
                  <span>{rule.name}</span>
                  <ArrowRight size={13} />
                </button>
              ))}
              {data.rules.length > 3 && (
                <a href="#rules" className="more-rules">
                  View all {data.rules.length} rules <ArrowRight size={13} />
                </a>
              )}
            </div>
          ) : (
            <p className="overview-no-rules">Create a rule to start watching your queues.</p>
          )}
        </section>
      </div>
      <section className="overview-panel recent-alerts" aria-labelledby="recent-alerts-title">
        <div className="overview-section-heading">
          <h2 id="recent-alerts-title">Recent alerts</h2>
          <a href="#activity" onClick={() => onOpenAlert()}>
            View activity <ArrowRight size={14} />
          </a>
        </div>
        {data.notifications.length ? (
          <div className="recent-alert-list">
            {data.notifications.slice(0, 4).map((notification) => {
              const incident = data.incidents.find((i) => i.id === notification.incidentId);
              const status = incident?.status ?? 'closed';
              const recipient = recipients.find((r) => r.id === notification.recipientId);
              return (
                <button
                  key={notification.id}
                  className="recent-alert-row"
                  onClick={() => onOpenAlert(notification.id)}
                  aria-label={`View alert: ${notification.ruleName} for ${entityName(notification.entityId)}`}
                >
                  <span className={`recent-alert-icon ${status === 'active' ? 'rose' : 'green'}`}>
                    {status === 'active' ? <Bell size={17} /> : <Check size={17} />}
                  </span>
                  <span className="recent-alert-content">
                    <strong>{notification.ruleName}</strong>
                    <span>
                      {entityName(notification.entityId)} · {recipient?.name} ·{' '}
                      {notification.deliveredAt
                        ? 'Delivered'
                        : notification.lastError
                          ? 'Retrying'
                          : 'Sending…'}
                    </span>
                  </span>
                  <span
                    className={`pill ${status === 'active' ? 'warning' : status === 'resolved' ? 'green' : 'neutral'}`}
                  >
                    {status === 'active'
                      ? 'Active'
                      : status === 'resolved'
                        ? 'Resolved'
                        : 'Stopped'}
                  </span>
                  <time dateTime={notification.eventTime}>
                    {time(notification.eventTime).slice(0, 5)}
                  </time>
                  <ArrowRight size={15} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="recent-empty">
            <Bell size={20} />
            <p>Alerts will appear here when a rule matches.</p>
          </div>
        )}
      </section>
    </div>
  );
}
