// #636 — the INTAKE BATCH runtime module, unit. NO database: every cell drives
// `lib/intake-batches.mjs` and `lib/reconciler-batches.mjs` against a stub client, because what
// is under test is the CONTRACT the module keeps with its callers — typed returns, derived keys,
// the stored actor, and the two refusals it must swallow rather than escalate.
//
// The DOORS themselves are proven against real least-privileged Postgres roles in
// `packages/db/tests/intake-batch.test.mjs`; the World-level resume is proven in
// `packages/runtime/tests/intake-batch-e2e.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachIntake, beginIntakeInBatch, cancelBatch, childCancelKey, openBatch, recordCapacityWait,
  resumeCancel, setMemberDependency, sweepBatchCancellations,
} from "../lib/intake-batches.mjs";
import { reconcileIntakeBatchCancellations } from "../lib/reconciler-batches.mjs";

/** A pg error exactly as node-postgres shapes one: SQLSTATE on `.code`, detail as a JSON STRING. */
function pgError(code, message, detail = null) {
  const err = new Error(message);
  err.code = code;
  if (detail) err.detail = JSON.stringify(detail);
  return err;
}

/** A stub connection that answers `select clara.<fn>(…) as result` from a script. */
function stubClient(handler) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      const out = await handler(sql, params, calls.length);
      return { rows: out === undefined ? [{}] : [{ result: out }] };
    },
  };
}

const runtimeOf = (client) => (fn) => fn(client);

// ---------------------------------------------------------------------------------------------
// 1 · TYPED RETURNS. Never null, never a raw throw.
// ---------------------------------------------------------------------------------------------

test("p636.runtime.typed_returns — a raising door answers `unavailable`, a CLRxx answers `refused`", async () => {
  const boom = stubClient(() => { throw new Error("ECONNRESET"); });
  const gone = await openBatch(boom, { actor: "a", label: "x", opKey: "k" });
  assert.equal(gone.status, "unavailable", "an infrastructure failure is NOT a refusal");
  assert.equal(gone.message, "ECONNRESET");
  assert.ok(!("batch" in gone));

  const refusing = stubClient(() => {
    throw pgError("CLR10", "an intake batch needs a label of 1-120 characters",
      { reason: "invalid_label", field: "label" });
  });
  const refused = await openBatch(refusing, { actor: "a", label: "", opKey: "k" });
  assert.equal(refused.status, "refused", "a CLRxx SQLSTATE is a DECISION the database made");
  assert.equal(refused.code, "CLR10");
  assert.equal(refused.reason, "invalid_label", "…and its typed reason survives, parsed from the detail string");
  assert.equal(refused.detail.field, "label");

  for (const [label, call] of [
    ["attachIntake", () => attachIntake(boom, { actor: "a", batchId: "b", intakeId: "i", opKey: "k" })],
    ["setMemberDependency", () => setMemberDependency(boom, { actor: "a", intakeId: "i", dependency: null, opKey: "k" })],
    ["sweepBatchCancellations", () => sweepBatchCancellations(boom, { limit: 20 })],
  ]) {
    const out = await call();
    assert.equal(out.status, "unavailable", `${label} returns typed, never null and never a throw`);
  }
});

test("p636.runtime.sweep_empty — an empty worklist is still a shape, never undefined", async () => {
  const client = stubClient(() => null);
  const out = await sweepBatchCancellations(client, { limit: 5 });
  assert.equal(out.status, "ok");
  assert.deepEqual(out.worklist, { batches: [], settled: [] });
});

// ---------------------------------------------------------------------------------------------
// 2 · THE DERIVED KEY, and the STORED actor.
// ---------------------------------------------------------------------------------------------

test("p636.runtime.derived_keys — two runs of the fan-out produce BYTE-IDENTICAL calls", async () => {
  const decision = {
    batch_id: "B", state: "cancelling", cancel_op_key: "decide-1", cancel_requested_by: "alice",
    children: [{ member_id: "m1", work_id: "w1" }, { member_id: "m2", work_id: "w2" }],
  };
  const run = async () => {
    const client = stubClient((sql) =>
      (sql.includes("cancel_intake_batch") ? decision : { status: "cancelled" }));
    const out = await cancelBatch(runtimeOf(client), { actor: "alice", batchId: "B", opKey: "decide-1" });
    assert.equal(out.status, "ok");
    return client.calls.filter((c) => c.sql.includes("cancel_accounting_work")).map((c) => c.params);
  };
  const first = await run();
  const second = await run();
  assert.deepEqual(first, second, "the fan-out is a pure function of the parent decision");
  assert.deepEqual(first, [
    ["w1", "alice", "decide-1:w1"],
    ["w2", "alice", "decide-1:w2"],
  ], "each child's key is `<cancel_op_key>:<work_id>` and its author is the decision's own");
  assert.equal(childCancelKey("decide-1", "w1"), "decide-1:w1", "…spelled in exactly one place");
});

test("p636.runtime.resume_uses_the_stored_actor — the belt cannot use its own identity", async () => {
  const client = stubClient(() => ({ status: "cancelled" }));
  const parent = {
    batch_id: "B", firm_id: "F", cancel_requested_by: "alice", cancel_op_key: "decide-7",
    live: [{ member_id: "m3", work_id: "w3" }],
  };
  const out = await resumeCancel(runtimeOf(client), parent);
  assert.equal(out.status, "ok");
  assert.deepEqual(client.calls[0].params, ["w3", "alice", "decide-7:w3"],
    "the STORED actor and the STORED key — a different author under the same key is CLR10 op_key_conflict (0184:262-270, measured)");

  const naked = await resumeCancel(runtimeOf(client), { batch_id: "B", live: [{ work_id: "w4" }] });
  assert.equal(naked.status, "refused");
  assert.equal(naked.reason, "missing_stored_decision",
    "a parent with no stored decision is refused rather than fanned out under an invented identity");
});

test("p636.runtime.operation_in_flight — CLR13 leaves the child for the next sweep, and is not a failure", async () => {
  const seen = [];
  const client = stubClient((sql, params) => {
    if (sql.includes("cancel_accounting_work")) {
      seen.push(params[0]);
      if (params[0] === "w2") throw pgError("CLR13", "this cancel key is held by an in-flight sibling", { reason: "operation_in_flight" });
      if (params[0] === "w3") throw pgError("CLR11", "accounting work not found in your firm", { reason: "work_not_found" });
      return { status: "cancelled" };
    }
    return null;
  });
  const out = await resumeCancel(runtimeOf(client), {
    batch_id: "B", cancel_requested_by: "alice", cancel_op_key: "k",
    live: [{ work_id: "w1" }, { work_id: "w2" }, { work_id: "w3" }, { work_id: "w4" }],
  });
  assert.equal(out.status, "ok", "the fan-out finishes; one child's answer never aborts its siblings");
  assert.deepEqual(seen, ["w1", "w2", "w3", "w4"], "every child was asked, in order");
  assert.deepEqual(out.deferred, [{ work_id: "w2", reason: "operation_in_flight" }],
    "a sibling holding this exact key means 'not finished yet', not 'failed'");
  assert.deepEqual(out.refused.map((r) => r.work_id), ["w3"]);
  assert.deepEqual(out.cancelled.map((r) => r.work_id), ["w1", "w4"]);
});

// ---------------------------------------------------------------------------------------------
// 3 · THE CAPACITY WAIT — the measured fallback path (0229 header M2).
// ---------------------------------------------------------------------------------------------

test("p636.runtime.capacity_wait — CLR18 ONLY, actor from the sidecar, refusal swallowed", async () => {
  const calls = [];
  const client = stubClient((sql, params) => { calls.push(params); return { member_id: "m1", dependency: "awaiting_capacity" }; });
  const readMeta = async () => ({ uploadedBy: "alice" });

  const notCapacity = await recordCapacityWait(runtimeOf(client), "i1",
    pgError("CLR16", "not found"), { readMeta });
  assert.equal(notCapacity.status, "skipped");
  assert.equal(notCapacity.reason, "not_a_capacity_refusal");
  assert.equal(calls.length, 0, "no door is called for anything but CLR18");

  const ok = await recordCapacityWait(runtimeOf(client), "i1",
    pgError("CLR18", "document daily limit reached (docs)"), { readMeta });
  assert.equal(ok.status, "ok");
  assert.deepEqual(calls[0], [
    "alice", "i1", "awaiting_capacity", "document daily limit reached (docs)",
    "intake-batch-capacity:i1",
  ], "the sidecar's uploadedBy is the actor, and the DB's own sentence travels VERBATIM as the reason");

  const noSidecar = await recordCapacityWait(runtimeOf(client), "i2",
    pgError("CLR18", "x"), { readMeta: async () => null });
  assert.equal(noSidecar.status, "skipped");
  assert.equal(noSidecar.reason, "no_sidecar_actor",
    "no actor means no governed call — this function grants nothing and invents nobody");
});

test("p636.runtime.capacity_wait_never_escalates — a CLR04/CLR11 refusal is logged, not thrown", async () => {
  const logged = [];
  for (const code of ["CLR04", "CLR11"]) {
    const client = stubClient(() => { throw pgError(code, "refused", { reason: code === "CLR04" ? "actor_not_active" : "member_not_found" }); });
    const out = await recordCapacityWait(runtimeOf(client), "i1", pgError("CLR18", "limit"),
      { readMeta: async () => ({ uploadedBy: "alice" }), log: (m) => logged.push(m) });
    assert.equal(out.status, "refused", `${code} answers typed`);
    assert.equal(out.code, code);
  }
  assert.equal(logged.length, 2, "both refusals reached the log");
  // The route's honest 429 must survive: recordCapacityWait resolves, never rejects.
  const dead = { query: async () => { throw new Error("pool is gone"); } };
  const out = await recordCapacityWait((fn) => fn(dead), "i1", pgError("CLR18", "limit"),
    { readMeta: async () => ({ uploadedBy: "alice" }), log: (m) => logged.push(m) });
  assert.equal(out.status, "unavailable", "even a dead pool resolves typed — the finalize route still answers 429");
});

// ---------------------------------------------------------------------------------------------
// 4 · BEGIN + ATTACH, together.
// ---------------------------------------------------------------------------------------------

test("p636.runtime.begin_in_batch — the begin and the attach commit TOGETHER", async () => {
  const sqls = [];
  const client = {
    query: async (sql) => { sqls.push(String(sql).split("(")[0].trim()); return { rows: [{ result: { member_id: "m1" } }] }; },
  };
  const out = await beginIntakeInBatch({
    client,
    principal: { sub: "alice", firmId: "F" },
    input: { filename: "a.pdf" },
    batchId: "B",
    opKey: "k",
    begin: async () => ({ intake_id: "i1", upload_token: "t" }),
  });
  assert.equal(out.intake_id, "i1");
  assert.equal(out.batch_id, "B");
  assert.equal(out.member_id, "m1");
  assert.deepEqual(sqls.filter((s) => s === "begin" || s === "commit"), ["begin", "commit"],
    "an EXPLICIT transaction — withRuntime is autocommit, so two calls would otherwise be two commits");
});

test("p636.runtime.begin_in_batch_rollback — a refused attach rolls back AND drops the sidecar", async () => {
  const sqls = []; const cleaned = [];
  const client = {
    query: async (sql) => {
      const head = String(sql).split("(")[0].trim();
      sqls.push(head);
      if (head.includes("attach_intake_to_batch") || String(sql).includes("attach_intake_to_batch")) {
        throw pgError("CLR13", "this intake batch is no longer open", { reason: "batch_not_open", state: "cancelling" });
      }
      return { rows: [{}] };
    },
  };
  await assert.rejects(() => beginIntakeInBatch({
    client,
    principal: { sub: "alice", firmId: "F" },
    input: {},
    batchId: "B",
    opKey: "k",
    begin: async () => ({ intake_id: "i9" }),
    cleanup: async (id) => { cleaned.push(id); },
  }), (err) => {
    assert.equal(err.code, "CLR13", "the refusal keeps its SQLSTATE so sendError maps it honestly");
    assert.equal(JSON.parse(err.detail).reason, "batch_not_open");
    return true;
  });
  assert.ok(sqls.includes("rollback"), "the transaction rolled back — no orphan intake, no orphan reservation");
  assert.ok(!sqls.includes("commit"));
  assert.deepEqual(cleaned, ["i9"],
    "…and the sidecar the begin wrote is dropped, or recoverPendingDocumentIntakes would re-drive a vanished intake every sweep");
});

// ---------------------------------------------------------------------------------------------
// 5 · THE BELT.
// ---------------------------------------------------------------------------------------------

test("p636.runtime.belt_dormant — an image older than 0229 boots dormant, never red", async () => {
  const client = { query: async () => ({ rows: [{ ok: false }] }) };
  const out = await reconcileIntakeBatchCancellations(client, {});
  assert.deepEqual(out, { batchCancelOk: true, batchCancelDormant: true, batchCancelSettled: 0, batchCancelChildren: 0 });
});

test("p636.runtime.belt_probe_unreadable — an UNREADABLE catalog read is batchCancelOk:FALSE and dormant:FALSE, never a silent dormancy", async () => {
  // DECISIONS §6.3 on reports/integration-merge.md §5.2, and the reconciler-fa.mjs:74-89 law
  // cloned: "absent" and "unreadable" must not report the same thing. Bare, this probe's throw
  // escaped into reconciler.mjs's belt() wrapper — the assembly-level report reserved for a belt
  // that could not contain its own failure — while the FA and ADJ belts beside it contained the
  // identical injected failure. The cell above (`belt_dormant`) is the other half: a genuinely
  // absent 0229 is still a clean ok:true no-op.
  const log = [];
  const client = { query: async () => { throw new Error("connection reset"); } };
  const out = await reconcileIntakeBatchCancellations(client, { log: (m) => log.push(m) });
  assert.equal(out.batchCancelOk, false,
    "a failed read is 'we do not know' — the leader retries next cycle");
  assert.equal(out.batchCancelDormant, false,
    "…and it is NOT a missing 0229: reporting dormant would claim the surface is absent on the strength of a read that never landed");
  assert.ok(log.some((m) => /intake batch cancellations: surface probe error — connection reset/.test(m)),
    "the skip is logged with its cause, like every belt beside it");
});

test("p636.runtime.belt_resumes — the belt re-issues each parent's fan-out with its STORED decision", async () => {
  const fanned = [];
  const client = {
    query: async (sql) => {
      if (String(sql).includes("to_regprocedure")) return { rows: [{ ok: true }] };
      return {
        rows: [{
          result: {
            batches: [{
              batch_id: "B1", firm_id: "F", cancel_requested_by: "alice", cancel_op_key: "d1",
              live: [{ member_id: "m1", work_id: "w1" }, { member_id: "m2", work_id: "w2" }],
            }],
            settled: ["B0"],
          },
        }],
      };
    },
  };
  const withRuntime = (fn) => fn({
    query: async (sql, params) => { fanned.push(params); return { rows: [{ result: { status: "cancelled" } }] }; },
  });
  const out = await reconcileIntakeBatchCancellations(client, { withRuntime });
  assert.equal(out.batchCancelOk, true);
  assert.equal(out.batchCancelSettled, 1, "the verb settled the parent that had nothing live");
  assert.equal(out.batchCancelChildren, 2);
  assert.deepEqual(fanned, [["w1", "alice", "d1:w1"], ["w2", "alice", "d1:w2"]]);
});

test("p636.runtime.belt_isolates — a whole-belt failure says so; one poisoned parent does not", async () => {
  const dead = {
    query: async (sql) => {
      if (String(sql).includes("to_regprocedure")) return { rows: [{ ok: true }] };
      throw new Error("statement timeout");
    },
  };
  const out = await reconcileIntakeBatchCancellations(dead, {});
  assert.equal(out.batchCancelOk, false, "the worklist itself failing is 'we do not know'");

  const client = {
    query: async (sql) => (String(sql).includes("to_regprocedure")
      ? { rows: [{ ok: true }] }
      : { rows: [{ result: { batches: [
        { batch_id: "B1", cancel_requested_by: "a", cancel_op_key: "k", live: [{ work_id: "w1" }] },
        { batch_id: "B2", cancel_requested_by: "b", cancel_op_key: "k2", live: [{ work_id: "w2" }] },
      ], settled: [] } }] }),
  };
  const withRuntime = (fn) => fn({
    query: async (_sql, params) => {
      if (params[0] === "w1") throw pgError("CLR11", "gone", { reason: "work_not_found" });
      return { rows: [{ result: { status: "cancelled" } }] };
    },
  });
  const isolated = await reconcileIntakeBatchCancellations(client, { withRuntime });
  assert.equal(isolated.batchCancelOk, true, "one refusing parent never claims the whole sweep is unknown");
  assert.equal(isolated.batchCancelFailed, 1);
  assert.equal(isolated.batchCancelChildren, 1, "…and the healthy parent's child was still cancelled");
  assert.equal(isolated.batchCancelBlocked, 0,
    "a CLR11 is a refusal about one child, not a parent that can never progress");
});

test("p636.runtime.belt_names_a_blocked_parent — an all-CLR04 fan-out is counted apart (ADV-636-03)", async () => {
  // MEASURED on the rig: with the stored canceller's membership removed, EVERY child refuses
  // CLR04 `actor_not_active`, on this sweep and on every future one, because the fan-out must
  // re-issue with the STORED actor (clara._work_door_ctx hashes {work, author}). Counting that in
  // `batchCancelFailed` beside a transient refusal is how a permanently stuck batch stayed
  // invisible while the belt reported itself healthy.
  const client = {
    query: async (sql) => (String(sql).includes("to_regprocedure")
      ? { rows: [{ ok: true }] }
      : { rows: [{ result: { batches: [
        { batch_id: "B1", cancel_requested_by: "gone", cancel_op_key: "k",
          live: [{ work_id: "w1" }, { work_id: "w2" }] },
      ], settled: [] } }] }),
  };
  const lines = [];
  const withRuntime = (fn) => fn({
    query: async () => { throw pgError("CLR04", "the author is not an active member of this firm",
      { reason: "actor_not_active" }); },
  });
  const out = await reconcileIntakeBatchCancellations(client, { withRuntime, log: (m) => lines.push(m) });
  assert.equal(out.batchCancelOk, true, "the sweep itself worked — it is the parent that cannot move");
  assert.equal(out.batchCancelBlocked, 1, "the parent is counted as BLOCKED, once, not twice for two children");
  assert.equal(out.batchCancelChildren, 0);
  assert.ok(lines.some((l) => l.includes("BLOCKED") && l.includes("B1")),
    "…and it is logged by name, with what a reader can act on");
});
