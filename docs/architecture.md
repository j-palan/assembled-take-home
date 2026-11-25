# Architecture and tradeoffs

## Boundaries

`domain.ts` accepts a rule and a validated observation and returns a match, a clear condition, unknown evidence, or no relevant evaluation. It has no database, HTTP, delivery, or wall-clock dependency. Adherence duration uses event time, not test execution time.

`Store.ingest` is the transaction boundary. It records each processing receipt, reserves new event IDs, rejects time regressions per entity/type, updates the observation, and evaluates enabled rules for the relevant event type. Queue snapshots query SLA/backlog rules; adherence checks query adherence rules. Agent transitions are stored for inspection and future duration-based features but do not trigger the current templates.

`Replay` feeds that same ingestion path. Its cursor advances in the ingestion transaction, so restarting cannot skip an event whose evaluation failed. The simulated clock is the maximum event timestamp consumed, so late arrivals do not move it backward. Loading all 96 events and synchronous finish/preview are deliberate fixture-sized conveniences; a production importer would stream records and yield between batches.

The API owns request/response validation and status codes. React polls a bounded snapshot every second while the tab is visible. The UI is a client of the engine, with no independent alert logic. The rule editor shares input validation and configuration types with the API.

## Persistence model

| Table          | Key / index                                    | Purpose                                                          |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `rules`        | ID; `(kind, enabled)`                          | Validated current configuration and revision                     |
| `events`       | Unique event ID                                | First validated canonical payload, including valid stale events  |
| `receipts`     | Arrival sequence                               | Outcome, event ID/time, explanation for each attempt             |
| `observations` | Event type + entity ID                         | Latest accepted timestamp and observation                        |
| `incidents`    | ID; unique `(rule_id, entity_id)` where active | Opening/latest evidence, lifecycle, rule name and revision       |
| `outbox`       | ID; unique incident ID; delivery status index  | Immutable message/routing snapshot plus mutable delivery receipt |
| `inbox`        | Notification ID                                | Idempotent visible local delivery sink                           |
| `metadata`     | Key                                            | Initialization marker and durable replay cursor                  |

SQLite runs in WAL mode with foreign keys enabled. Routing and evidence are JSON snapshots to keep the small schema readable and preserve historical messages after rule edits/deletion. Indexed columns hold operational predicates. Incidents intentionally do not reference a live rule with a foreign key: deleting configuration must preserve audit history. Outbox/inbox relationships do use foreign keys.

Editing or pausing configuration closes its current incidents explicitly; it does not imply the operational issue recovered. The next fresh matching observation can create a new incident for the new rule revision. Rule changes use wall-clock time; observations and recoveries use source event time. The UI labels the observation times separately.

## Failure semantics

- Validation failure: record a receipt; no evaluation or observation replacement.
- Identical retry: record a duplicate receipt; no lifecycle or delivery work.
- Conflicting retry: record a conflict; first valid payload remains authoritative. Investigate source ownership rather than guess which payload to trust.
- Late/equal-time observation: store the event and receipt, preserve newer operational state. This sacrifices historical transient alerts for predictable current-state semantics.
- Unknown duration or scope: preserve existing incidents and do not create alerts from guessed evidence.
- Transaction failure: roll back event ID reservation, receipt, observation, incident, outbox, and cursor together. Retrying is safe.
- Delivery failure: keep pending state with attempt count/error; retry on the two-second worker or restart. The local provider deduplicates on notification ID, including a crash after insertion but before acknowledgment.
- Restart: configured rules, incidents, and delivery state survive; replay starts paused. Worker drains pending deliveries on startup.

The outbox provides a durable delivery intent. It does not make arbitrary external network delivery exactly once. A real worker should claim rows, use provider idempotency keys, exponential backoff/jitter, a retry budget, and a dead-letter workflow. This demo has one process and one synchronous local provider; no leases or distributed locks are needed.

## Scaling to thousands of customers

A million events/day averages about 12 events/second; bursts and rule fanout matter more than that average. The prototype has not been load-tested and makes no production throughput claim.

The domain evaluator and incident key remain useful at larger scale. The storage and execution layer would evolve:

1. **Partition consumption by organization and entity.** Maintain ordering for all event types of an agent or queue; deduplicate on `(organization, event_id)`. Persist broker acknowledgment only after a successful transaction. Tenant context must be present throughout rules, observations, incidents, and recipients.
2. **Index subscriptions by event type and scope.** Today the engine filters by kind and enabled state, then checks queue membership. A production index on tenant/type/queue avoids scanning every matching-kind rule for each event. Cache rule revisions and invalidate them on edits.
3. **Move persistence to Postgres.** Preserve atomic event/incident/outbox writes and partial uniqueness. Use optimistic concurrency or locked observation rows for parallel workers. Add schema migrations and separate queryable columns from immutable evidence snapshots.
4. **Separate delivery workers.** Claim outbox rows in batches, apply retry/backoff and per-recipient/provider rate limits, and monitor provider acknowledgments. Fanout remains separate from evaluation.
5. **Bound retention and reads.** Partition or expire old event/receipt records and archive historical incidents. Replace the recent-200 snapshot with cursor pagination, aggregate counts, and a change stream or SSE for active workspaces.
6. **Instrument the pipeline.** Track ingestion lag, stale/conflict rates, rule-evaluation time, alert volume by rule, suppression, outbox age, retry rates, and dead letters. Missing observations need their own freshness policy and UI treatment.

Live duration alerts would add durable deadlines with cancellation tokens tied to observation/rule revisions. Late transitions and stale telemetry must cancel or invalidate scheduled work. A long-call rule needs this machinery to alert while the call is still running.

## Intentional limits

- Single process, synchronous SQLite writes and local stub delivery; no broker, distributed workers, or tenant plumbing.
- No automatic recovery from missing telemetry, no wall-clock adherence timer, and no retrospective recalculation after late events.
- One healthy observation resolves an incident. No hysteresis, reminder cadence, cooldown, or alert grouping; a flapping metric can create recurring incidents.
- Current recipient and queue catalogs are seeded constants. Scope means queue membership reported in the adherence event, not an inferred org chart or manager relationship.
- The snapshot returns the latest 200 incidents, notifications, and receipts. UI activity counts are derived from this recent window; processing totals cover all receipts. This is sufficient for the sample, but needs aggregate counts and pagination before a large live feed.
- No schema migration runner or configuration history table. Incident revisions, message snapshots, and evidence preserve the context needed for this demo.
- Preview uses the complete supplied fixture, irrespective of current replay position. It cannot predict future notification volume.
