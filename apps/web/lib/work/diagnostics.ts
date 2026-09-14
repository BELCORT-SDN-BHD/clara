// #631 — THE WORK EXECUTION TRACE READ (C88.18: "expose correlated diagnostics to authorised
// users/operators with redaction and bounded retention").
//
// IT IS AN RPC for the same reason `lib/work/periodic-adjustment-reads.ts` gives: the authority
// story has to be whole in ONE place. `clara.get_work_execution_trace` (migration 0195) is
// bookkeeper-floored, firm-scoped, ordered and capped at 500 rows; a PostgREST filter chain would
// put the floor and the ordering in the browser, where neither is enforceable.
//
// REDACTED BY CONSTRUCTION, NOT BY THIS MODULE. `clara.work_execution_traces` HAS NO PAYLOAD
// COLUMN — no prompt, no transcript, no basis, no attribute bag. Every field below is an
// identifier, a digest, an instant or an outcome. There is nothing here for this module to filter,
// and that is the point: a reader cannot leak what the relation cannot hold.
//
// A VIEWER IS REFUSED, AND THAT IS A FACE RATHER THAN A FAILURE. The door raises the estate's
// ordinary CLR04 for a caller below the bookkeeper floor and CLR11 `work_not_found` for a Work in
// another firm — never a different error for the two, so the read cannot become an existence
// oracle. `readWorkTrace` reports both as TYPED OUTCOMES instead of throwing, because the
// Diagnostics section's job is to say "you may not see this" rather than to take the page down.

import { callDoor, DoorRefusal } from "@/lib/doors";
import { isUuidShape } from "@/lib/client-id";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The four moments a Work run can be asked about afterwards. */
export const TRACE_PHASES = ["dispatch", "model_call", "tool_call", "settle"] as const;
export type TracePhase = (typeof TRACE_PHASES)[number];

/** One step of one run, copied field-for-field from the door's own `row_to_json` projection.
 *  Nothing is derived here; every value is the database's. */
export type WorkTraceRow = {
  id: string;
  run_id: string;
  seq: number;
  phase: string;
  /** The server-owned capability this step exercised — never the model's own tool name. */
  capability_id: string | null;
  registry_version: string | null;
  bundle_id: string | null;
  bundle_digest: string | null;
  instructions_id: string | null;
  skills: string[] | null;
  tools_id: string | null;
  model_id: string | null;
  /** The purpose token the step spent, and the authorisation it spent — both derived server-side
   *  from the authorisation row, so a trace cannot claim an authority it did not have. */
  purpose: string | null;
  authorization_id: string | null;
  consent_ref: string | null;
  activation_ref: string | null;
  /** The DIGEST of the step's input. Never the input. */
  input_digest: string | null;
  observed_revisions: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  outcome: string;
  refusal: Record<string, unknown> | null;
  receipt_id: string | null;
  task_id: string;
};

/** What a caller can be told, without the page having to guess which it is.
 *  `denied` is a REAL state a human must see (a viewer opening a preparer's diagnostic), not an
 *  error to swallow; `unreadable` is everything else and keeps its message for the alert. */
export type WorkTraceRead =
  | { kind: "ok"; rows: WorkTraceRow[] }
  | { kind: "denied" }
  | { kind: "unreadable"; message: string };

/** Every trace row of ONE Work, oldest step first. */
export async function readWorkTrace(workId: string, opts: Opts = {}): Promise<WorkTraceRead> {
  // A malformed id never reaches PostgREST — on a `uuid` argument it is HTTP 400 `22P02`, which
  // throws, and a throw on a route reaches the error boundary instead of the scoped state the
  // section owns (the guard `lib/work/reads.ts` states for the same defect).
  if (!isUuidShape(workId)) return { kind: "ok", rows: [] };
  try {
    const out = await callDoor<unknown>("get_work_execution_trace", { p_work: workId }, opts);
    if (!Array.isArray(out)) {
      return { kind: "unreadable", message: "get_work_execution_trace did not answer with an array of rows" };
    }
    return { kind: "ok", rows: out as WorkTraceRow[] };
  } catch (err) {
    if (err instanceof DoorRefusal) {
      // CLR04 is the bookkeeper floor; CLR11 is "not in your firm", which the door answers the
      // same way for an absent Work — deliberately, so the read is not an existence oracle. Both
      // are "you may not see this" to the person looking at the page.
      if (err.code === "CLR04" || err.code === "CLR11") return { kind: "denied" };
      return { kind: "unreadable", message: err.message };
    }
    if (err instanceof Error && err.name === "AbortError") throw err;
    return { kind: "unreadable", message: err instanceof Error ? err.message : String(err) };
  }
}

/** The rows of one run, in order. A Work can hold several runs (a Retry mints a new one), and the
 *  Diagnostics section groups by run so a reader compares like with like. */
export type WorkTraceRun = { runId: string; rows: WorkTraceRow[]; startedAt: string };

/** Group by `run_id`, newest run FIRST — the order a person reads a Work in: what happened last,
 *  then why the attempt before it did not work. Rows inside a run stay in step order. */
export function groupTraceByRun(rows: ReadonlyArray<WorkTraceRow>): WorkTraceRun[] {
  const byRun = new Map<string, WorkTraceRow[]>();
  for (const row of rows) {
    const list = byRun.get(row.run_id);
    if (list) list.push(row);
    else byRun.set(row.run_id, [row]);
  }
  const runs: WorkTraceRun[] = [];
  for (const [runId, list] of byRun) {
    const ordered = [...list].sort((a, b) => a.seq - b.seq);
    runs.push({ runId, rows: ordered, startedAt: ordered[0]?.started_at ?? "" });
  }
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return runs;
}

/** The ONE fact a reader wants before any detail: did this run get as far as a model, and did the
 *  model's work reach the books? Derived from the rows the database returned — never from the
 *  Work's own status, which is a different question answered by a different row. */
export function traceSummary(run: WorkTraceRun): {
  dispatched: boolean;
  calledModel: boolean;
  refusedPhase: string | null;
  steps: number;
} {
  const dispatch = run.rows.find((r) => r.phase === "dispatch" && r.seq > 1) ?? run.rows.find((r) => r.phase === "dispatch");
  const refused = run.rows.find((r) => r.outcome === "refused" || r.outcome === "failed");
  return {
    dispatched: dispatch !== undefined && dispatch.outcome === "ok",
    calledModel: run.rows.some((r) => r.phase === "model_call"),
    refusedPhase: refused ? refused.phase : null,
    steps: run.rows.length,
  };
}

/** A digest, shortened for a line of prose — first 12 hex characters, the length an operator can
 *  actually compare against a boot log by eye. The FULL value stays in the title attribute so
 *  nothing is lost. */
export function shortDigest(value: string | null): string {
  if (!value) return "—";
  return value.length <= 12 ? value : `${value.slice(0, 12)}…`;
}

/** `1.2 s` / `340 ms` / `—`. Exact, never rounded up into a lie about how long a model took. */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
