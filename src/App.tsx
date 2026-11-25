import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipForward,
  X,
} from 'lucide-react';
import type { Rule } from '../server/domain';
import { api, time, type AppState } from './api';
import { RuleEditor } from './RuleEditor';
import { RuleCard } from './RuleCard';
import { ActivityInbox } from './ActivityInbox';
import { ProcessingLog } from './ProcessingLog';
import { EmptyState, Confirmation } from './ui';

type Page = 'rules' | 'activity' | 'processing';
function initialPage(): Page {
  const hash = window.location.hash.slice(1);
  return hash === 'activity' || hash === 'processing' ? hash : 'rules';
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
      setConnectionError('Connection lost. Retrying…');
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
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent &&
        (event.key !== 'Escape' || document.querySelector('dialog[open]'))
      )
        return;
      document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]').forEach((menu) => {
        if (
          event instanceof KeyboardEvent ||
          (event.target instanceof Node && !menu.contains(event.target))
        ) {
          menu.open = false;
          if (event instanceof KeyboardEvent) menu.querySelector('summary')?.focus();
        }
      });
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);
  useEffect(() => {
    document.title = `Intraday · ${page === 'rules' ? 'Rules' : page === 'activity' ? 'Activity' : 'Event log'}`;
  }, [page]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const control = (action: string, rate?: number) =>
    run(() => api('replay', 'POST', { action, ...(rate ? { rate } : {}) }));
  const reset = () =>
    setConfirmation({
      title: 'Reset the demo?',
      text: 'Clear sample activity and start again. Your rules will stay.',
      label: 'Reset demo',
      action: async () => {
        await control('reset');
      },
    });
  function toggle(rule: Rule) {
    const { id, revision, createdAt, ...input } = rule;
    void run(
      () => api(`rules/${id}`, 'PUT', { ...input, enabled: !rule.enabled }),
      rule.enabled ? 'Rule paused' : 'Rule enabled',
    );
  }
  const complete = !!data && data.replay.cursor === data.replay.total;
  const active = data?.incidents.filter((i) => i.status === 'active').length ?? 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-inner">
          <a href="#rules" className="brand" aria-label="Intraday home">
            <span className="brand-mark">
              <Activity size={22} />
            </span>
            intraday<span className="brand-dot">.</span>
          </a>
          <span className="workspace-label">
            Support operations <span className="demo-badge">Demo</span>
          </span>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <h1>Notifications</h1>
            <p>Choose when your team gets a heads-up.</p>
          </div>
          <button className="button primary" onClick={() => setEditor('new')}>
            <Plus size={18} />
            Create rule
          </button>
        </div>
        <nav className="page-tabs" aria-label="Main navigation">
          <a href="#rules" aria-current={page === 'rules' ? 'page' : undefined}>
            <Settings2 size={17} />
            Rules <span>{data?.rules.length ?? 0}</span>
          </a>
          <a href="#activity" aria-current={page === 'activity' ? 'page' : undefined}>
            <Bell size={17} />
            Activity <span>{data?.notifications.length ?? 0}</span>
          </a>
          {page === 'processing' && (
            <a href="#processing" aria-current="page">
              Event log
            </a>
          )}
        </nav>
        {connectionError && (
          <p role="alert" className="error-banner">
            {connectionError}
          </p>
        )}
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={17} />
            </button>
          </div>
        )}
        {!data ? (
          <div className="loading-state" role="status">
            <LoaderCircle className="spin" />
            Loading…
          </div>
        ) : (
          <>
            <section className="demo-panel" aria-label="Sample replay">
              <div className="demo-main">
                <span className="demo-icon">
                  <Play size={19} />
                </span>
                <div className="demo-copy">
                  <strong>
                    {complete
                      ? 'Demo complete'
                      : data.replay.playing
                        ? 'Playing the sample morning…'
                        : 'See your rules in action'}
                  </strong>
                  <p>
                    {complete
                      ? `${data.notifications.length} alerts · ${active} still active`
                      : 'Try a sample morning with 3 queues and 8 agents.'}
                  </p>
                </div>
                <div className="demo-actions">
                  {complete ? (
                    <button className="button secondary" onClick={reset} disabled={busy}>
                      <RotateCcw size={15} />
                      Reset demo
                    </button>
                  ) : (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (await control('finish')) window.location.hash = 'activity';
                      }}
                    >
                      {busy ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}Run
                      demo
                    </button>
                  )}
                  <details className="demo-options" data-menu>
                    <summary aria-label="Replay controls">
                      <ChevronDown size={18} />
                    </summary>
                    <div className="demo-options-content">
                      <strong>Replay controls</strong>
                      <p>May 26 · 09:00–10:30 UTC</p>
                      <div className="replay-clock">
                        {time(data.replay.time)} UTC{' '}
                        <small>
                          {data.replay.cursor}/{data.replay.total} events
                        </small>
                      </div>
                      <div className="replay-controls">
                        <button
                          className="button secondary"
                          disabled={busy || complete}
                          onClick={() => void control(data.replay.playing ? 'pause' : 'play')}
                        >
                          {data.replay.playing ? <Pause size={15} /> : <Play size={15} />}
                          {data.replay.playing
                            ? 'Pause'
                            : data.replay.cursor
                              ? 'Resume'
                              : 'Play sample'}
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Process next event"
                          disabled={busy || complete}
                          onClick={() => void control('step')}
                        >
                          <SkipForward size={18} />
                        </button>
                        <select
                          aria-label="Replay speed"
                          value={data.replay.rate}
                          onChange={(e) => void control('speed', Number(e.target.value))}
                          disabled={busy}
                        >
                          {[2, 4, 12].map((r) => (
                            <option key={r} value={r}>
                              {r} events/sec
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="text-button"
                        onClick={reset}
                        disabled={busy || data.replay.cursor === 0}
                      >
                        Reset sample history
                      </button>
                      <a
                        href="#processing"
                        onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
                      >
                        View event log <ArrowRight size={14} />
                      </a>
                    </div>
                  </details>
                </div>
              </div>
              <div
                className="demo-progress"
                role="progressbar"
                aria-label="Sample events processed"
                aria-valuenow={data.replay.cursor}
                aria-valuemin={0}
                aria-valuemax={data.replay.total}
              >
                <span style={{ width: `${(data.replay.cursor / data.replay.total) * 100}%` }} />
              </div>
              {data.replay.error && (
                <p role="alert" className="error-banner">
                  {data.replay.error}
                </p>
              )}
            </section>
            {page === 'rules' && (
              <section aria-label="Notification rules">
                <div className="list-heading">
                  <span>{data.rules.filter((r) => r.enabled).length} rules enabled</span>
                  <span>One alert per issue. No repeat pings.</span>
                </div>
                <div className="rule-list">
                  {data.rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      active={
                        data.incidents.filter((i) => i.ruleId === rule.id && i.status === 'active')
                          .length
                      }
                      disabled={busy}
                      toggle={() => toggle(rule)}
                      edit={() => setEditor(rule)}
                      remove={() =>
                        setConfirmation({
                          title: 'Delete this rule?',
                          text: `“${rule.name}” will stop sending alerts. Past notifications will stay.`,
                          label: 'Delete rule',
                          action: async () => {
                            await run(() => api(`rules/${rule.id}`, 'DELETE'), 'Rule deleted');
                          },
                        })
                      }
                    />
                  ))}
                  {data.rules.length === 0 && (
                    <EmptyState
                      Icon={Settings2}
                      title="What should we watch?"
                      text="Create a rule to let your team know when something needs attention."
                      action={
                        <button className="button primary" onClick={() => setEditor('new')}>
                          <Plus size={17} />
                          Create rule
                        </button>
                      }
                    />
                  )}
                </div>
              </section>
            )}
            {page === 'activity' && <ActivityInbox data={data} />}
            {page === 'processing' && <ProcessingLog data={data} />}
          </>
        )}
        <footer className="page-footer">
          <span>Demo only · No messages leave this app.</span>
          <span>All times in UTC</span>
        </footer>
      </main>
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
            setNotice(editor === 'new' ? 'Rule created' : 'Changes saved');
          }}
        />
      )}
      {confirmation && <Confirmation {...confirmation} onClose={() => setConfirmation(null)} />}
    </div>
  );
}
