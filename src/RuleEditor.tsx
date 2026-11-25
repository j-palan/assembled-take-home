import { useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Clock3,
  Inbox,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import {
  queueOptions,
  recipients,
  ruleSchema,
  type Evidence,
  type Kind,
  type Rule,
  type RuleInput,
} from '../server/domain';
import { api, entityName, queueName, time, type Preview } from './api';

export const templates = {
  sla: { label: 'A queue misses its SLA', Icon: ShieldAlert, color: 'rose' },
  backlog: { label: 'Too many tickets are waiting', Icon: Inbox, color: 'amber' },
  adherence: { label: 'An agent is out of adherence', Icon: Users, color: 'violet' },
};
export function describe(rule: RuleInput) {
  const scope = rule.queueIds.map(queueName).join(', ') || 'Selected queues';
  if (rule.kind === 'sla') return `${scope} · Oldest ticket exceeds its SLA`;
  if (rule.kind === 'backlog')
    return `${scope} · More than ${rule.threshold ?? '…'} tickets waiting`;
  return `${scope} · Agent out of adherence for ${rule.threshold ?? '…'}+ minutes`;
}
function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder} sec`;
  return `${minutes} min${remainder ? ` ${remainder} sec` : ''}`;
}
function previewReason(kind: Kind, evidence: Evidence) {
  if (kind === 'backlog')
    return `${evidence.value} tickets waiting. Your threshold is ${evidence.threshold}.`;
  if (kind === 'sla')
    return `Oldest ticket waited ${duration(evidence.value)}. SLA target: ${duration(evidence.threshold)}.`;
  return `Out of adherence for ${duration(evidence.value)}. Your threshold is ${duration(evidence.threshold)}.`;
}
function emptyPreviewReason(rule: RuleInput) {
  const scope = rule.queueIds.map(queueName).join(', ');
  if (rule.kind === 'sla') return `No sample ticket in ${scope} exceeded its queue’s SLA.`;
  if (rule.kind === 'backlog')
    return `No sample snapshot in ${scope} had more than ${rule.threshold} tickets waiting.`;
  return `No sample check in ${scope} confirmed a violation lasting at least ${rule.threshold} minutes.`;
}
function suggestedName(rule: RuleInput) {
  const scope = rule.queueIds.map(queueName).join(', ') || 'Queue';
  if (rule.kind === 'sla') return `${scope} SLA breached`;
  if (rule.kind === 'backlog') return `${scope} backlog above ${rule.threshold ?? 20}`;
  return `Agent out of adherence for ${rule.threshold ?? 10} min`;
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
  activeIncidentCount = 0,
}: {
  rule?: Rule;
  onClose: () => void;
  onSaved: () => Promise<void>;
  activeIncidentCount?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
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
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    node.querySelector<HTMLSelectElement>('#rule-kind')?.focus();
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
  async function submit(mode: 'save' | 'preview') {
    const result = ruleSchema.safeParse({
      ...draft,
      name: draft.name.trim() || suggestedName(draft),
    });
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])));
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLElement>(
            'input[aria-invalid="true"], fieldset[aria-invalid="true"] input',
          )
          ?.focus(),
      );
      return;
    }
    setBusy(mode);
    setError('');
    try {
      if (mode === 'preview') setPreview(await api<Preview>('preview', 'POST', result.data));
      else {
        await api(rule ? `rules/${rule.id}` : 'rules', rule ? 'PUT' : 'POST', result.data);
        await onSaved();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save. Try again.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <dialog
      className="editor-dialog"
      ref={dialog}
      aria-labelledby="editor-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit('save');
        }}
      >
        <div className="editor-header">
          <h2 id="editor-title">{rule ? 'Edit rule' : 'Create rule'}</h2>
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
          <fieldset className="editor-fields" disabled={!!busy}>
            <div className="field">
              <label htmlFor="rule-kind">Notify when</label>
              <select
                id="rule-kind"
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as Kind;
                  change({ kind, threshold: kind === 'sla' ? null : kind === 'backlog' ? 20 : 10 });
                }}
              >
                {Object.entries(templates).map(([kind, t]) => (
                  <option key={kind} value={kind}>
                    {t.label}
                  </option>
                ))}
              </select>
              {draft.kind === 'sla' && (
                <span className="help">SLA is the queue’s promised response time.</span>
              )}
              {draft.kind === 'adherence' && (
                <span className="help">Adherence means doing what’s on the schedule.</span>
              )}
            </div>
            {draft.kind !== 'sla' && (
              <div className="field">
                <label htmlFor="threshold">
                  {draft.kind === 'backlog' ? 'More than' : 'For at least'}
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
                {errors.threshold && (
                  <span id="threshold-error" className="field-error">
                    {errors.threshold}
                  </span>
                )}
              </div>
            )}
            <fieldset
              aria-invalid={!!errors.queueIds}
              aria-describedby={errors.queueIds ? 'queue-error' : undefined}
            >
              <legend>{draft.kind === 'adherence' ? 'For agents in' : 'In these queues'}</legend>
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
              {errors.queueIds && (
                <p id="queue-error" className="field-error">
                  {errors.queueIds}
                </p>
              )}
            </fieldset>
            <div className="form-row">
              <div className="field">
                <label htmlFor="recipient">Send to</label>
                <select
                  id="recipient"
                  value={draft.recipientId}
                  onChange={(e) =>
                    change({ recipientId: e.target.value as RuleInput['recipientId'] })
                  }
                >
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="channel">Via</label>
                <select
                  id="channel"
                  value={draft.channel}
                  onChange={(e) => change({ channel: e.target.value as RuleInput['channel'] })}
                >
                  <option value="slack">Slack</option>
                  <option value="in_app">In-app</option>
                </select>
              </div>
            </div>
            <details className="name-settings" open={rule ? true : undefined}>
              <summary aria-label="Custom rule name">
                Rule name <span>Optional</span>
              </summary>
              <div className="field">
                <label className="sr-only" htmlFor="rule-name">
                  Rule name
                </label>
                <input
                  id="rule-name"
                  value={draft.name}
                  placeholder={suggestedName(draft)}
                  maxLength={80}
                  onChange={(e) => change({ name: e.target.value })}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
            </details>
            <div className="editor-note">
              <Check size={16} />
              <span>One alert per issue. We’ll update it until things recover.</span>
            </div>
            {preview && (
              <section className="preview-results" aria-live="polite">
                <strong>
                  {preview.notifications.length}{' '}
                  {preview.notifications.length === 1 ? 'alert' : 'alerts'} in the sample morning
                </strong>
                {preview.notifications.length === 0 && <p>{emptyPreviewReason(draft)}</p>}
                {[...preview.notifications].reverse().map((n) => (
                  <div key={n.id}>
                    <Clock3 size={14} />
                    <span>
                      {time(n.eventTime)} UTC · {entityName(n.entityId)}
                      <small>{previewReason(draft.kind, n.evidence)}</small>
                    </span>
                  </div>
                ))}
              </section>
            )}
            {error && (
              <p role="alert" className="error-banner">
                {error}
              </p>
            )}
          </fieldset>
        </div>
        <div className="editor-actions">
          {rule && activeIncidentCount > 0 && (
            <div className="edit-impact" role="status" aria-label="Impact of saving">
              <TriangleAlert size={18} />
              <div>
                <strong>
                  Saving will close {activeIncidentCount} current{' '}
                  {activeIncidentCount === 1 ? 'issue' : 'issues'}.
                </strong>
                <p>They’ll be marked stopped. The updated rule starts with the next observation.</p>
              </div>
            </div>
          )}
          <div className="editor-footer">
            <button
              className="button secondary"
              type="button"
              disabled={!!busy}
              onClick={() => void submit('preview')}
            >
              {busy === 'preview' && <LoaderCircle className="spin" size={16} />}Test with sample
            </button>
            <button className="button primary" type="submit" disabled={!!busy}>
              {busy === 'save' && <LoaderCircle className="spin" size={16} />}
              {rule ? 'Save changes' : 'Create rule'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
