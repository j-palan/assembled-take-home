import { useState } from 'react';
import { Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import { time, type AppState } from './api';
import { EmptyState } from './ui';

export function ProcessingLog({ data }: { data: AppState }) {
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
            <span>{outcome === 'unknown' ? 'Unknown evidence' : outcome}</span>
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
                  {r.outcome === 'unknown' ? 'unknown evidence' : r.outcome}
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
        Showing up to 200 recent receipts. “Unknown evidence” means a violation was reported without
        its start time; incident state is preserved.
      </p>
    </>
  );
}
