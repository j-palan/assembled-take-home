import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
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
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipForward,
  X,
} from 'lucide-react';
import type { Rule } from '../server/domain';
import { api, time, type AppState } from './api';
import { RuleEditor } from './RuleEditor';
import { RuleCard } from './RuleCard';
import { ActivityInbox } from './ActivityInbox';
import { ProcessingLog } from './ProcessingLog';
import { Metric, EmptyState, Confirmation } from './ui';

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
  return Object.hasOwn(pages, hash) ? (hash as Page) : 'rules';
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
