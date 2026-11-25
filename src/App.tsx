import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  FileJson2,
  Layers3,
  ListFilter,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipForward,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { recipients, type Rule, type RuleInput } from '../server/domain';
import { api, entityName, queueName, time, type AppState } from './api';
import { describe, RuleEditor, templates } from './RuleEditor';

type Page = 'rules' | 'activity' | 'processing';
const pages = {
  rules: {
    label: 'Notification rules',
    description: 'The right heads-up. For the right person. At the right time.',
    Icon: Settings2,
  },
  activity: {
    label: 'Activity inbox',
    description: 'Every alert has a reason. See the evidence and who received it.',
    Icon: Bell,
  },
  processing: {
    label: 'Processing log',
    description: 'A transparent record of what was processed, skipped, or needs attention.',
    Icon: Code2,
  },
};
function initialPage(): Page {
  const hash = window.location.hash.slice(1);
  return hash in pages ? (hash as Page) : 'rules';
}

export function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [data, setData] = useState<AppState | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Rule | 'new' | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    label: string;
    action: () => Promise<void>;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try {
      setData(await api<AppState>('state'));
      setConnectionError('');
    } catch {
      setConnectionError(
        'Unable to connect. Displaying the last received state; retrying automatically.',
      );
    }
  }, []);
  useEffect(() => {
    let fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      await refresh();
      fetching = false;
    };
    void poll();
    const timer = setInterval(() => {
      if (!document.hidden) void poll();
    }, 1000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const change = () => setPage(initialPage());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = `Intraday · ${pages[page].label}`;
  }, [page]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      if (message) setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete action.');
    } finally {
      setBusy(false);
    }
  }
  const control = (action: string, rate?: number) =>
    run(() => api('replay', 'POST', { action, ...(rate ? { rate } : {}) }));
  const toggle = (rule: Rule) => {
    const { id, revision, createdAt, ...input } = rule;
    void run(
      () => api(`rules/${id}`, 'PUT', { ...input, enabled: !rule.enabled }),
      rule.enabled
        ? 'Rule paused. Existing incidents were closed.'
        : 'Rule enabled. Watching for fresh observations.',
    );
  };
  const active = data?.incidents.filter((i) => i.status === 'active').length ?? 0;
  const issues =
    data?.stats
      .filter((s) => ['invalid', 'conflict', 'stale', 'unknown'].includes(s.outcome))
      .reduce((n, s) => n + s.count, 0) ?? 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#rules" className="brand" aria-label="Intraday home">
          <span className="brand-mark">
            <Activity size={23} strokeWidth={2.3} />
          </span>
          <span>
            intraday<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Layers3 size={17} />
          </span>
          <span>
            <strong>Support operations</strong>
            <small>Demo workspace</small>
          </span>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {Object.entries(pages).map(([key, p]) => (
            <a
              key={key}
              className={page === key ? 'nav-item active' : 'nav-item'}
              href={`#${key}`}
              aria-current={page === key ? 'page' : undefined}
            >
              <p.Icon size={18} />
              <span>
                {key === 'rules'
                  ? 'Rules'
                  : key === 'activity'
                    ? 'Activity inbox'
                    : 'Processing log'}
              </span>
              {key === 'activity' && !!data?.notifications.length && (
                <span className="nav-count">{data.notifications.length}</span>
              )}
              {key === 'processing' && issues > 0 && (
                <span className="nav-count muted-count">{issues}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>Built to keep things quiet.</strong>
          <p>
            One alert per incident.
            <br />
            No repeat pings while it’s active.
          </p>
          <a href="#activity">
            See what’s happening <ArrowRight size={14} />
          </a>
        </div>
        <div className="sidebar-person">
          <span className="avatar">MC</span>
          <span>
            <strong>Maya Chen</strong>
            <small>Team lead · demo persona</small>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            <Layers3 size={16} />
            Workspace <ChevronRight size={14} />
            <strong>{pages[page].label}</strong>
          </span>
          <div className="topbar-right">
            <span className="demo-badge">
              <span />
              SAMPLE DATA
            </span>
            <details className="help-menu">
              <summary aria-label="About this demo">
                <CircleHelp size={19} />
              </summary>
              <div>
                <strong>A morning in support</strong>
                <p>
                  Replay May 26, 2026, from 09:00–10:30 UTC. The clock follows event time; events
                  arrive in file order.
                </p>
                <p>All delivery channels are local stubs. No real messages leave this app.</p>
                <p>Alerts evaluate on fresh observations. Silence does not imply recovery.</p>
              </div>
            </details>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">STAY AHEAD OF THE DAY</span>
              <h1>{pages[page].label}</h1>
              <p>{pages[page].description}</p>
            </div>
            <button className="button primary" onClick={() => setEditor('new')}>
              <Plus size={18} />
              Create rule
            </button>
          </div>
          {connectionError && (
            <div role="alert" className="error-banner">
              {connectionError}
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading-state" role="status">
              <LoaderCircle className="spin" />
              Loading your workspace…
            </div>
          ) : (
            <>
              <div className="metrics">
                <Metric
                  label="Enabled rules"
                  value={data.rules.filter((r) => r.enabled).length}
                  suffix={`of ${data.rules.length} configured`}
                  Icon={Settings2}
                />
                <Metric
                  label="Active incidents"
                  value={active}
                  suffix="based on latest observations"
                  Icon={Radio}
                />
                <Metric
                  label="Notifications delivered"
                  value={data.notifications.filter((n) => n.deliveredAt).length}
                  suffix="through local delivery stubs"
                  Icon={CheckCheck}
                />
              </div>
              <section className="replay-panel" aria-label="Sample replay">
                <div className="replay-info">
                  <span className="replay-icon">
                    <FileJson2 size={23} />
                  </span>
                  <div>
                    <div className="replay-title">
                      <strong>A busy morning, on replay</strong>
                      <span className="pill neutral">96 events</span>
                    </div>
                    <p>
                      3 queues · 8 agents · May 26, 2026 <span className="utc-note">· UTC</span>
                    </p>
                  </div>
                </div>
                <div className="replay-controls">
                  <div className="replay-clock">
                    <Clock3 size={15} />
                    <strong>{time(data.replay.time)}</strong>
                    <span>UTC</span>
                  </div>
                  <select
                    aria-label="Replay speed"
                    value={data.replay.rate}
                    disabled={busy}
                    onChange={(e) => void control('speed', Number(e.target.value))}
                  >
                    {[2, 4, 12].map((r) => (
                      <option key={r} value={r}>
                        {r} events/sec
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary small"
                    disabled={busy || data.replay.cursor === data.replay.total}
                    onClick={() => void control(data.replay.playing ? 'pause' : 'play')}
                  >
                    {data.replay.playing ? <Pause size={15} /> : <Play size={15} />}
                    {data.replay.playing
                      ? 'Pause'
                      : data.replay.cursor === data.replay.total
                        ? 'Complete'
                        : data.replay.cursor
                          ? 'Resume'
                          : 'Play sample'}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Process next event"
                    title="Process next event"
                    disabled={busy || data.replay.cursor === data.replay.total}
                    onClick={() => void control('step')}
                  >
                    <SkipForward size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Reset sample"
                    title="Reset history, keep rules"
                    disabled={busy || data.replay.cursor === 0}
                    onClick={() =>
                      setConfirmation({
                        title: 'Reset the sample morning?',
                        text: 'This clears all event history, incidents, and notifications. Your configured rules are kept, ready for another replay.',
                        label: 'Reset sample',
                        action: async () => {
                          await control('reset');
                        },
                      })
                    }
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <div
                  className="replay-progress"
                  role="progressbar"
                  aria-label="Sample events processed"
                  aria-valuenow={data.replay.cursor}
                  aria-valuemin={0}
                  aria-valuemax={data.replay.total}
                >
                  <span style={{ width: `${(data.replay.cursor / data.replay.total) * 100}%` }} />
                </div>
                <div className="replay-caption">
                  <span>
                    <span className={`status-dot ${data.replay.playing ? 'live' : ''}`} />
                    {data.replay.playing
                      ? 'Replaying in arrival order'
                      : data.replay.cursor === data.replay.total
                        ? 'Replay complete · latest observations shown'
                        : 'Paused · ready when you are'}
                  </span>
                  <span>
                    {data.replay.cursor} / {data.replay.total} processed{' '}
                    <button
                      className="text-button"
                      disabled={busy || data.replay.cursor === data.replay.total}
                      onClick={() => void control('finish')}
                    >
                      Run to end <ArrowRight size={13} />
                    </button>
                  </span>
                </div>
                {data.replay.error && (
                  <p role="alert" className="error-banner">
                    {data.replay.error}
                  </p>
                )}
              </section>
              {page === 'rules' && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>
                        Your rules <span className="number-badge">{data.rules.length}</span>
                      </h2>
                      <p>Watch what matters. We’ll handle the heads-up.</p>
                    </div>
                    <span className="subtle-label">
                      <ShieldCheck size={14} />
                      One alert per incident
                    </span>
                  </div>
                  <div className="rule-list">
                    {data.rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        active={
                          data.incidents.filter(
                            (i) => i.ruleId === rule.id && i.status === 'active',
                          ).length
                        }
                        disabled={busy}
                        toggle={() => toggle(rule)}
                        edit={() => setEditor(rule)}
                        remove={() =>
                          setConfirmation({
                            title: `Delete “${rule.name}”?`,
                            text: 'This stops future alerts and closes active incidents for this rule. Historical notifications will remain in your inbox.',
                            label: 'Delete rule',
                            action: async () => {
                              await run(() => api(`rules/${rule.id}`, 'DELETE'), 'Rule deleted.');
                            },
                          })
                        }
                      />
                    ))}
                    {data.rules.length === 0 && (
                      <EmptyState
                        Icon={Settings2}
                        title="Make your first rule"
                        text="Choose what to watch and who should get the heads-up."
                        action={
                          <button className="button primary" onClick={() => setEditor('new')}>
                            <Plus size={17} />
                            Create rule
                          </button>
                        }
                      />
                    )}
                  </div>
                  <div className="bottom-tip">
                    <BookOpen size={18} />
                    <p>
                      <strong>A little signal goes a long way.</strong> Start with the conditions
                      your team can act on. Add more rules as you learn what’s useful.
                    </p>
                  </div>
                </>
              )}
              {page === 'activity' && <ActivityInbox data={data} />}
              {page === 'processing' && <ProcessingLog data={data} />}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Activity size={14} />
              Intraday notifications
            </span>
            <span>Demo workspace · All times in UTC · Local delivery only</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role="status" className="toast">
          <Check size={17} />
          {notice}
        </div>
      )}
      {editor && (
        <RuleEditor
          rule={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await refresh();
            setNotice(
              editor === 'new'
                ? 'Rule created. Watching for fresh observations.'
                : 'Rule updated. Watching for fresh observations.',
            );
          }}
        />
      )}
      {confirmation && <Confirmation {...confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  Icon,
}: {
  label: string;
  value: number;
  suffix: string;
  Icon: typeof Bell;
}) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
    </div>
  );
}
function RuleCard({
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

function ActivityInbox({ data }: { data: AppState }) {
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

function ProcessingLog({ data }: { data: AppState }) {
  const [onlyIssues, setOnlyIssues] = useState(true);
  const receipts = data.receipts.filter(
    (r) => !onlyIssues || !['accepted', 'duplicate'].includes(r.outcome),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Event processing</h2>
          <p>
            Arrival order is preserved. Duplicate IDs and older observations never overwrite current
            state.
          </p>
        </div>
      </div>
      <div className="processing-stats">
        {['accepted', 'duplicate', 'conflict', 'stale', 'unknown', 'invalid'].map((outcome) => (
          <div key={outcome}>
            <strong>{data.stats.find((s) => s.outcome === outcome)?.count ?? 0}</strong>
            <span>{outcome === 'unknown' ? 'Unknown duration' : outcome}</span>
          </div>
        ))}
      </div>
      <div className="list-toolbar">
        <h3>Recent receipts</h3>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
          />
          Only show issues
        </label>
      </div>
      <div className="receipts">
        {receipts.map((r) => (
          <article key={r.id}>
            <span className={`receipt-icon ${r.outcome === 'accepted' ? 'green' : 'amber'}`}>
              {r.outcome === 'accepted' ? <Check size={17} /> : <TriangleAlert size={17} />}
            </span>
            <div>
              <div>
                <strong>{r.eventId ?? 'Invalid event'}</strong>
                <span className="pill neutral">
                  {r.outcome === 'unknown' ? 'unknown duration' : r.outcome}
                </span>
              </div>
              <p>{r.detail}</p>
              <small>
                Arrival #{r.id} · Event time {time(r.eventTime)} UTC
              </small>
            </div>
          </article>
        ))}
        {!receipts.length && (
          <EmptyState
            Icon={ShieldCheck}
            title={
              data.receipts.length ? 'No processing issues so far' : 'Ready for the first event'
            }
            text={
              data.receipts.length
                ? 'Fresh observations are being evaluated normally.'
                : 'Play the sample to see an audit of accepted events, late arrivals, and data issues.'
            }
          />
        )}
      </div>
      <p className="help">
        Showing up to 200 recent receipts. “Unknown duration” means a violation was reported without
        its start time; incident state is preserved.
      </p>
    </>
  );
}
function EmptyState({
  Icon,
  title,
  text,
  action,
}: {
  Icon: typeof Bell;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Confirmation({
  title,
  text,
  label,
  action,
  onClose,
}: {
  title: string;
  text: string;
  label: string;
  action: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <span className="confirm-icon">
        <TriangleAlert size={24} />
      </span>
      <h2 id="confirm-title">{title}</h2>
      <p>{text}</p>
      <div>
        <button className="button secondary" autoFocus disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await action();
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <LoaderCircle className="spin" size={16} />}
          {label}
        </button>
      </div>
    </dialog>
  );
}
