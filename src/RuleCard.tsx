import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { recipients, type Rule } from '../server/domain';
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
      <span className={`template-icon ${t.color}`}>
        <t.Icon size={21} />
      </span>
      <div className="rule-content">
        <h2>
          <button onClick={edit}>{rule.name}</button>
        </h2>
        <p>{describe(rule)}</p>
        <div className="rule-meta">
          <span>{recipient.name}</span>
          <span>via {rule.channel === 'slack' ? 'Slack' : 'in-app'}</span>
          {active > 0 && rule.enabled && (
            <a href="#activity" className="active-label">
              {active} active {active === 1 ? 'issue' : 'issues'}
            </a>
          )}
        </div>
      </div>
      <div className="rule-actions">
        <span className="rule-state">{rule.enabled ? 'On' : 'Paused'}</span>
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
        <details className="row-menu" data-menu>
          <summary aria-label={`Actions for ${rule.name}`}>
            <MoreHorizontal size={20} />
          </summary>
          <div>
            <button
              onClick={(e) => {
                const menu = e.currentTarget.closest('details');
                menu?.removeAttribute('open');
                menu?.querySelector('summary')?.focus();
                edit();
              }}
            >
              <Pencil size={15} />
              Edit rule
            </button>
            <button
              className="delete-button"
              onClick={(e) => {
                const menu = e.currentTarget.closest('details');
                menu?.removeAttribute('open');
                menu?.querySelector('summary')?.focus();
                remove();
              }}
              disabled={disabled}
            >
              <Trash2 size={15} />
              Delete rule
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}
