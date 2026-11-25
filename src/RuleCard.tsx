import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { recipients, type Rule } from '../server/domain';
import { queueName } from './api';
import { templates, describe } from './RuleEditor';

export function RuleCard({
  rule,
  active,
  disabled,
  toggle,
  edit,
  remove,
}: {
  rule: Rule;
  active: number;
  disabled: boolean;
  toggle: () => void;
  edit: () => void;
  remove: () => void;
}) {
  const t = templates[rule.kind];
  const recipient = recipients.find((r) => r.id === rule.recipientId)!;
  return (
    <article className={`rule-card ${!rule.enabled ? 'paused-rule' : ''}`}>
      <div className="rule-card-top">
        <span className={`template-icon large ${t.color}`}>
          <t.Icon size={22} />
        </span>
        <div className="rule-title">
          <h3>
            <button onClick={edit}>{rule.name}</button>
          </h3>
          <div>
            <span className={`pill ${!rule.enabled ? 'neutral' : active ? 'warning' : 'green'}`}>
              <span className="status-dot" />
              {!rule.enabled
                ? 'Paused'
                : active
                  ? `${active} active incident${active > 1 ? 's' : ''}`
                  : 'Watching'}
            </span>
            <span className="rule-type">{t.label}</span>
          </div>
        </div>
        <div className="rule-actions">
          <button
            type="button"
            role="switch"
            aria-checked={rule.enabled}
            aria-label={`Enable ${rule.name}`}
            className="switch"
            onClick={toggle}
            disabled={disabled}
          >
            <span />
          </button>
          <button className="icon-button" onClick={edit} aria-label={`Edit ${rule.name}`}>
            <Pencil size={16} />
          </button>
          <button
            className="icon-button delete-button"
            onClick={remove}
            aria-label={`Delete ${rule.name}`}
            disabled={disabled}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <p className="rule-description">{describe(rule)}</p>
      <div className="rule-card-bottom">
        <div>
          <span className="tiny-label">WATCHING</span>
          <span className="queue-chips">
            {rule.queueIds.map((q) => (
              <span key={q}>{queueName(q)}</span>
            ))}
          </span>
        </div>
        <div className="routing">
          <span className="tiny-label">NOTIFY</span>
          <span>
            <span className="mini-avatar">
              {recipient.name
                .split(' ')
                .map((s) => s[0])
                .join('')}
            </span>
            {recipient.name}
            <ArrowRight size={13} />
            <span className="channel-label">
              {rule.channel === 'slack' ? 'Slack stub' : 'In-app inbox'}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}
