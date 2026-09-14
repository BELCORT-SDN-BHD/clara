# Execution trace export

There is no export route for `clara.work_execution_traces`. The trace is view-only through
`clara.get_work_execution_trace` (one Work at a time, bookkeeper-floored, firm-scoped), and its
retention rides the existing prune lane.

## Why this is out of scope

The execution trace records what one Work run did — the versioned bundle, the capability, the
purpose and authorisation it spent, input digests, observed revisions, timing and the typed
outcome — and carries no prompt, no transcript and no client figures by construction (no payload
column; every column is bounded and format-checked). Evidence that something happened to the books
is the operation receipt and the Activity feed, not the trace.

An export route would be the first bulk path out of the estate for per-run data and would need its
own redaction discipline (the live view's `redact()` in `lib/tracing.mjs`). Nothing today needs it:
an audit request is answered from receipts and Activity, and a hosted incident is investigated
through the single-Work read. If a compliance obligation ever requires bulk trace export, that is a
new decision with its own spec, not an unwired route.

Decided by the owner on 2026-09-15 and recorded in `docs/ARCHITECTURE.md` §5 E.

## Prior requests

- #802: "Execution trace export route stays disabled; no human/operator export path exists"
