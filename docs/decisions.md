# Behavior contract

Primary audience: team leads. Three templates: queue SLA breach (`longest_wait_sec > sla_target_sec`), queue backlog (`tickets_waiting > threshold`), and agent adherence (`in_violation` and duration >= threshold minutes). Scope is a nonempty set of queues; an agent belongs if any reported queue intersects. Rules target a named demo recipient and an in-app or Slack stub channel.

One active incident per rule revision and entity. First match opens an incident and queues one delivery. Further matches update evidence, without another message. A fresh healthy observation resolves it; a recurrence opens a new incident. Unknown adherence duration does not open or resolve an incident. There is no inferred recovery from silence. The last observed time is always visible.

Thresholds run on observations, not wall-clock timers; no backfilled alerts when saving a rule. Editing or pausing a rule closes its active incidents as "rule changed" or "rule paused", not recovered. Every edit increments the revision. Re-enabling waits for fresh observations. Pending deliveries already committed keep their original recipient and message.

Events are processed in arrival order. A unique event ID owns its first payload (canonical key ordering); identical retries are ignored and conflicting retries are audited. Per entity AND event type, timestamps must strictly increase to affect state. Equal-time distinct events are audited as stale: no trustworthy tie breaker is supplied. Late events are retained but do not rewrite current incidents. No watermark sorting silently repairs the demo feed.

A missing adherence start is unknown, not a zero-duration violation. Invalid timestamps, future violation starts, negative counters, and invalid types are rejected with validation details. Malformed records do not halt a replay. Null forecasts are allowed: none of the implemented rules depends on forecast data. Agent state names are open strings to support custom states. Null queue membership means unknown and never reuses a previous assignment. An explicit empty membership is valid; a fresh adherence check outside a rule’s scope closes its incident as "Agent left selected queues", rather than reporting recovery.

The feed is a sampled 90-minute story, not complete cadence data; avoid inventing state between observations.

SQLite transactions atomically persist event acceptance, latest observations, incident changes, and outbox entries. A single-process worker retries pending deliveries. The database stub uses notification IDs as idempotency keys, making its visible inbox idempotent; external providers would need their own idempotency support. This is not a claim of universal exactly-once delivery.

The simulation persists its cursor after each event in the same transaction as evaluation. It resumes paused after process restart. Reset clears event/incident/delivery history and cursor while preserving configured rules. A preview uses a separate in-memory database and never delivers to the main inbox.
