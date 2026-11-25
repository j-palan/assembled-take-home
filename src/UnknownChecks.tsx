import { TriangleAlert } from 'lucide-react';
import { entityName } from './api';
import { observationStamp, type IncompleteCheck } from './observations';

export function UnknownChecks({ checks }: { checks: IncompleteCheck[] }) {
  if (!checks.length) return null;
  return (
    <section className="unknown-checks" aria-label="Checks needing data">
      <h3>Missing information</h3>
      {checks.map((check) => (
        <div className="unknown-check" key={check.observation.agent_id}>
          <TriangleAlert size={17} />
          <div>
            <strong>
              {entityName(check.observation.agent_id)} · {check.reason}
            </strong>
            <p>{check.explanation}</p>
            <small>Last observed {observationStamp(check.observation.ts)}</small>
          </div>
        </div>
      ))}
    </section>
  );
}
