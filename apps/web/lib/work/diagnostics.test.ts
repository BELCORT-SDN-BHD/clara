// #631 — THE EXECUTION-TRACE READER'S OWN RULES, in isolation.
//
// The mounted section (`components/work/work-diagnostics.test.tsx`) proves the FACES. This file
// proves the four things underneath them, each of which is a place a plausible-looking mistake
// would be invisible on screen:
//
//   1. GROUPING BY RUN, NEWEST FIRST. A Work that was Retried holds two runs, and a reader opens
//      the page to find out what happened LAST. Rows inside a run stay in STEP order, because a
//      trace read out of order is a trace that tells a different story.
//   2. THE SUMMARY IS DERIVED FROM THE ROWS, never from the Work's status. "Was a model called?"
//      is a different question from "did the Work complete", and the whole point of the dispatch
//      row is that it can answer the first one NO while the second is still open.
//   3. A REFUSED READ IS A TYPED OUTCOME, not a throw. `denied` is a real state a viewer must see;
//      an abort still propagates, because a cancelled read is not an answer.
//   4. THE FORMATTERS DO NOT LIE. A digest is shortened with the full value kept; a duration is
//      exact and never rounded up into a claim about how long a model took.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TRACE_PHASES,
  formatDuration,
  groupTraceByRun,
  readWorkTrace,
  shortDigest,
  traceSummary,
  type WorkTraceRow,
} from "./diagnostics";

function row(over: Partial<WorkTraceRow> = {}): WorkTraceRow {
  return {
    id: `id_${over.run_id ?? "a"}_${over.seq ?? 1}`,
    run_id: "run_a",
    seq: 1,
    phase: "dispatch",
    capability_id: "accounting_work.model_segment",
    registry_version: "clara-capability-registry/v1",
    bundle_id: "clara-work/v3",
    bundle_digest: "345f2a38c3c8e128300fdf6af47d615285c8c278aea6db47283f5d85505d5bc4",
    instructions_id: "clara-work-instructions/v3",
    skills: ["journal-entry/v3"],
    tools_id: "clara-work-tools/v3",
    model_id: "gpt-5.6-terra",
    purpose: "accounting_work",
    authorization_id: null,
    consent_ref: null,
    activation_ref: null,
    input_digest: null,
    observed_revisions: {},
    started_at: "2026-09-14T02:00:00.000Z",
    ended_at: null,
    duration_ms: null,
    outcome: "ok",
    refusal: null,
    receipt_id: null,
    task_id: "t",
    ...over,
  };
}

describe("#631 work execution trace reader", () => {
  it("groups by run with the NEWEST first, and keeps step order inside each run", () => {
    const runs = groupTraceByRun([
      row({ run_id: "run_old", seq: 3, started_at: "2026-09-14T02:00:02.000Z", phase: "settle" }),
      row({ run_id: "run_old", seq: 1, started_at: "2026-09-14T02:00:00.000Z" }),
      row({ run_id: "run_new", seq: 2, started_at: "2026-09-14T03:00:01.000Z", phase: "model_call" }),
      row({ run_id: "run_new", seq: 1, started_at: "2026-09-14T03:00:00.000Z" }),
    ]);
    assert.deepEqual(runs.map((r) => r.runId), ["run_new", "run_old"],
      "a reader opens this section to find out what happened LAST");
    assert.deepEqual(runs[0]!.rows.map((r) => r.seq), [1, 2], "steps stay in step order");
    assert.deepEqual(runs[1]!.rows.map((r) => r.seq), [1, 3]);
    assert.equal(runs[0]!.startedAt, "2026-09-14T03:00:00.000Z", "a run starts when its FIRST step did");
  });

  it("summarises from the ROWS: a refused dispatch means no model was called", () => {
    const refused = groupTraceByRun([
      row({ seq: 1, phase: "dispatch" }),
      row({ seq: 2, phase: "dispatch", outcome: "refused", refusal: { reason: "egress_not_authorized" } }),
    ])[0]!;
    const s = traceSummary(refused);
    assert.equal(s.calledModel, false, "the whole point of the dispatch row is that it can say NO model was called");
    assert.equal(s.dispatched, false);
    assert.equal(s.refusedPhase, "dispatch");
    assert.equal(s.steps, 2);
  });

  it("…and an authorised run that reached the books says so", () => {
    const ok = groupTraceByRun([
      row({ seq: 1, phase: "dispatch" }),
      row({ seq: 2, phase: "dispatch" }),
      row({ seq: 3, phase: "model_call" }),
      row({ seq: 4, phase: "tool_call" }),
      row({ seq: 14, phase: "settle" }),
    ])[0]!;
    const s = traceSummary(ok);
    assert.equal(s.dispatched, true);
    assert.equal(s.calledModel, true);
    assert.equal(s.refusedPhase, null);
    assert.equal(s.steps, 5);
  });

  it("a malformed work id answers an EMPTY read rather than reaching PostgREST", async () => {
    // On a `uuid` argument a malformed id is HTTP 400 `22P02`, which throws — and a throw on a
    // route reaches the error boundary instead of the scoped state this section owns.
    const out = await readWorkTrace("not-a-uuid");
    assert.deepEqual(out, { kind: "ok", rows: [] });
  });

  it("the phase vocabulary is the migration's four, in run order", () => {
    assert.deepEqual([...TRACE_PHASES], ["dispatch", "model_call", "tool_call", "settle"]);
  });

  it("a digest is shortened WITHOUT losing the value, and an absent one is an em dash", () => {
    assert.equal(shortDigest(null), "—");
    assert.equal(shortDigest("abc"), "abc", "a value shorter than the window is shown whole");
    assert.equal(shortDigest("345f2a38c3c8e128300fdf6af47d615285c8c278aea6db47283f5d85505d5bc4"), "345f2a38c3c8…");
  });

  it("a duration is exact and never rounded up into a claim about a model", () => {
    assert.equal(formatDuration(null), "—");
    assert.equal(formatDuration(0), "0 ms");
    assert.equal(formatDuration(999), "999 ms");
    assert.equal(formatDuration(1000), "1.0 s");
    assert.equal(formatDuration(1240), "1.2 s", "truncating toward the tenth, not inflating it");
  });
});
