import { useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  Clock3,
  Inbox,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  queueOptions,
  recipients,
  ruleSchema,
  type Kind,
  type Rule,
  type RuleInput,
} from '../server/domain';
import { api, entityName, queueName, time, type Preview } from './api';

export const templates = {
  sla: {
    label: 'SLA breach',
    description: 'When the oldest ticket exceeds its SLA',
    Icon: ShieldAlert,
    color: 'rose',
  },
  backlog: {
    label: 'Queue backlog',
    description: 'When waiting tickets exceed a threshold',
    Icon: Inbox,
    color: 'amber',
  },
  adherence: {
    label: 'Agent adherence',
    description: 'When an agent stays out of adherence',
    Icon: Users,
    color: 'violet',
  },
};
export function describe(rule: RuleInput) {
  const scope = rule.queueIds.map(queueName).join(', ') || 'selected queues';
  if (rule.kind === 'sla')
    return `Notify when the oldest ticket in ${scope} exceeds the queue’s SLA.`;
  if (rule.kind === 'backlog')
    return `Notify when ${scope} has more than ${rule.threshold ?? '…'} tickets waiting.`;
  return `Notify when an agent in ${scope} is out of adherence for at least ${rule.threshold ?? '…'} minutes.`;
}
const empty: RuleInput = {
  name: '',
  kind: 'sla',
  queueIds: ['billing'],
  threshold: null,
  recipientId: 'maya',
  channel: 'slack',
  enabled: true,
};

export function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule?: Rule;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<RuleInput>(
    rule
      ? {
          name: rule.name,
          kind: rule.kind,
          queueIds: rule.queueIds,
          threshold: rule.threshold,
          recipientId: rule.recipientId,
          channel: rule.channel,
          enabled: rule.enabled,
        }
      : empty,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'save' | 'preview' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    node.querySelector<HTMLInputElement>('#rule-name')?.focus();
    return () => {
      node.close();
      returnFocus.current?.focus();
    };
  }, []);
  function change(update: Partial<RuleInput>) {
    setDraft((d) => ({ ...d, ...update }));
    setPreview(null);
    setErrors({});
    setError('');
  }
  function validate() {
    const result = ruleSchema.safeParse(draft);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])));
    return null;
  }
  async function submit(mode: 'save' | 'preview') {
    const valid = validate();
    if (!valid) return;
    setBusy(mode);
    setError('');
    try {
      if (mode === 'preview') setPreview(await api<Preview>('preview', 'POST', valid));
      else {
        await api(rule ? `rules/${rule.id}` : 'rules', rule ? 'PUT' : 'POST', valid);
        await onSaved();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(null);
    }
  }
  const fieldError = (field: string) =>
    errors[field] && (
      <span className="field-error" id={`${field}-error`}>
        {errors[field]}
      </span>
    );
  return (
    <dialog
      className="editor-dialog"
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="editor-title"
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit('save');
        }}
      >
        <div className="editor-header">
          <div>
            <span className="eyebrow">RULE SETUP</span>
            <h2 id="editor-title">
              {rule ? 'Edit notification rule' : 'Create notification rule'}
            </h2>
            <p>A useful heads-up, exactly when it matters.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close rule editor"
            onClick={onClose}
            disabled={!!busy}
          >
            <X size={20} />
          </button>
        </div>
        <div className="editor-body">
          <div className="field">
            <label htmlFor="rule-name">Rule name</label>
            <input
              id="rule-name"
              value={draft.name}
              placeholder="e.g. Billing needs a hand"
              maxLength={80}
              onChange={(e) => change({ name: e.target.value })}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {fieldError('name')}
          </div>
          <fieldset>
            <legend>What should we watch?</legend>
            <div className="template-options">
              {Object.entries(templates).map(([kind, t]) => (
                <button
                  type="button"
                  key={kind}
                  className={`template-option ${draft.kind === kind ? 'selected' : ''}`}
                  aria-pressed={draft.kind === kind}
                  onClick={() =>
                    change({
                      kind: kind as Kind,
                      threshold: kind === 'sla' ? null : kind === 'backlog' ? 20 : 10,
                    })
                  }
                >
                  <span className={`template-icon ${t.color}`}>
                    <t.Icon size={18} />
                  </span>
                  <span>
                    <strong>{t.label}</strong>
                    <small>{t.description}</small>
                  </span>
                  {draft.kind === kind && <Check className="selection-check" size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
          {draft.kind !== 'sla' && (
            <div className="field">
              <label htmlFor="threshold">
                {draft.kind === 'backlog'
                  ? 'More than this many tickets waiting'
                  : 'Out of adherence for at least'}
              </label>
              <div className="input-unit">
                <input
                  id="threshold"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={draft.threshold ?? ''}
                  onChange={(e) =>
                    change({ threshold: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  aria-invalid={!!errors.threshold}
                  aria-describedby={errors.threshold ? 'threshold-error' : undefined}
                />
                <span>{draft.kind === 'backlog' ? 'tickets' : 'minutes'}</span>
              </div>
              {fieldError('threshold')}
            </div>
          )}
          <fieldset aria-describedby={errors.queueIds ? 'queueIds-error' : 'scope-help'}>
            <legend>
              {draft.kind === 'adherence' ? 'Agents in these queues' : 'Queues to watch'}
            </legend>
            <div className="queue-options">
              {queueOptions.map((q) => (
                <label key={q} className={draft.queueIds.includes(q) ? 'checked' : ''}>
                  <input
                    type="checkbox"
                    checked={draft.queueIds.includes(q)}
                    onChange={(e) =>
                      change({
                        queueIds: e.target.checked
                          ? [...draft.queueIds, q]
                          : draft.queueIds.filter((x) => x !== q),
                      })
                    }
                  />
                  {queueName(q)}
                </label>
              ))}
            </div>
            {fieldError('queueIds')}
            <p className="help" id="scope-help">
              {draft.kind === 'adherence'
                ? 'Each agent gets a separate incident, even across multiple queues.'
                : 'Each queue gets a separate incident.'}
            </p>
          </fieldset>
          <div className="field">
            <label htmlFor="recipient">Notify</label>
            <select
              id="recipient"
              value={draft.recipientId}
              onChange={(e) => change({ recipientId: e.target.value as RuleInput['recipientId'] })}
            >
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.role}
                </option>
              ))}
            </select>
            <span className="help">Demo recipients. All deliveries stay inside this app.</span>
          </div>
          <fieldset>
            <legend>Delivery channel</legend>
            <div className="channel-options">
              <label>
                <input
                  type="radio"
                  name="channel"
                  value="slack"
                  checked={draft.channel === 'slack'}
                  onChange={() => change({ channel: 'slack' })}
                />
                <span>
                  Slack <small>Stub</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="channel"
                  value="in_app"
                  checked={draft.channel === 'in_app'}
                  onChange={() => change({ channel: 'in_app' })}
                />
                <span>In-app inbox</span>
              </label>
            </div>
          </fieldset>
          <div className="rule-summary">
            <Bell size={18} />
            <div>
              <strong>Your rule, in plain English</strong>
              <p>{describe(draft)}</p>
              <small>One alert per incident. A fresh healthy observation resolves it.</small>
            </div>
          </div>
          {rule && (
            <p className="help">
              Saving closes current incidents for this rule. The updated rule starts with the next
              fresh observation.
            </p>
          )}
          <section className="preview-section" aria-label="Sample preview">
            <div>
              <div>
                <Sparkles size={17} />
                <strong>Try it on the sample morning</strong>
              </div>
              <button
                className="button secondary small"
                type="button"
                disabled={!!busy}
                onClick={() => void submit('preview')}
              >
                {busy === 'preview' ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <ArrowRight size={15} />
                )}
                Preview rule
              </button>
            </div>
            <p className="help">
              Replays all 96 sample events in isolation. No notifications are sent.
            </p>
            {preview && (
              <div className="preview-results" aria-live="polite">
                <strong>
                  {preview.notifications.length}{' '}
                  {preview.notifications.length === 1 ? 'alert' : 'alerts'} would fire
                </strong>
                {preview.notifications.length === 0 && (
                  <p>No observations crossed this threshold. Try a different queue or threshold.</p>
                )}
                {[...preview.notifications].reverse().map((n) => (
                  <div key={n.id}>
                    <Clock3 size={14} />
                    <span>
                      {time(n.eventTime)} UTC · {entityName(n.entityId)}
                      <small>{n.evidence.message}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {(error || Object.keys(errors).length > 0) && (
            <p role="alert" className="error-banner">
              {error || 'Check the highlighted fields before continuing.'}
            </p>
          )}
        </div>
        <div className="editor-footer">
          <button type="button" className="button secondary" onClick={onClose} disabled={!!busy}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={!!busy}>
            {busy === 'save' ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}
            {rule ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
