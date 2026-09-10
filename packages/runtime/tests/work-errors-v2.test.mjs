// #629 — THE v2 REPAIR ROUTER, and the ONE pair it adds to v1's roster.
//
// WHY A SECOND TABLE EXISTS AT ALL. The #634 lane's migration 0182 makes
// `clara._record_journal_entry_core` raise a NEW typed pair at commit: CLR13 with
// `detail.reason = 'source_conflict'` — the Work's document ref no longer holds (a retired filing,
// or another posted entry already claims it). `claraWork.v1.errors.ts` is FROZEN and has no entry
// for it, and its CLR13 default classifies it `state_changed`, which spends the run's replans
// re-reading a basis that cannot change back. `claraWork_v2` is #629's own closure and is not on
// main yet, so v2 gets its own classification table.
//
// THE TABLE IS A DELEGATION, NOT A COPY. v2 asks v1 first and overrides exactly one pair, so
// "every v1 mapping is preserved" is true BY CONSTRUCTION rather than by a transcription anyone
// has to keep in step. The closure cell below proves it for the whole roster anyway, because a
// future override could break it silently.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1 = await import("../workflows/claraWork.v1.errors.ts");
const v2 = await import("../workflows/claraWork.v2.errors.ts");

const raise = (code, reason, message = "refused") =>
  Object.assign(new Error(message), { code, detail: reason === null ? undefined : JSON.stringify({ reason }) });

/** Every pair v1's own cell drives, plus the estate-owned ones and a handful of unknowns. The
 *  point of the list is COVERAGE OF THE CLASSIFIER'S BRANCHES, not of one table. */
const V1_PAIRS = [
  ["CLR10", "basis_mismatch"], ["CLR10", "invalid_basis"],
  ["CLR13", "task_transition"], ["CLR13", "not_retryable"], ["CLR13", "operation_in_flight"],
  ["CLR10", "operation_payload_conflict"], ["CLR10", "intent_payload_conflict"],
  ["CLR19", "write_into_closed_period"], ["CLR10", "generic_control_leg"],
  ["CLR10", "unknown_account"], ["CLR10", "client_inactive"],
  ["CLR04", "obo_not_active"], ["CLR04", "actor_not_active"], ["CLR04", "insufficient_role"],
  ["CLR11", "work_not_found"], ["CLR11", "client_not_found"],
  ["CLR10", "invalid_op_key"], ["CLR10", "invalid_intent_key"], ["CLR10", "invalid_request"],
  ["CLR10", "invalid_bundle"], ["CLR10", "invalid_run_id"], ["CLR10", "invalid_outcome"],
  ["CLR10", "invalid_error_code"], ["CLR10", "invalid_basis_origin"], ["CLR10", "invalid_source_refs"],
  ["CLR10", "wrong_task_kind"], ["CLR10", "logical_op_mismatch"],
  ["CLR03", "no_wake_credential"], ["CLR03", "wrong_wake_kind"], ["CLR03", "wake_obo_unbound"],
  ["CLR03", "wake_task_unbound"], ["CLR11", "credential_client_pin"], ["CLR04", "obo_not_initiator"],
  // the estate's own raisers and the defaults
  ["CLR07", null], ["CLR08", null], ["40001", null], ["40P01", null], ["42883", null],
  ["42501", null], ["23505", null], ["CLR12", null], ["CLR14", null],
  ["CLR13", "a_reason_this_build_has_never_met"],
  ["CLR10", "a_reason_this_build_has_never_met"],
  ["ZZZZZ", null],
];

test("629.errors.v2: (CLR13, source_conflict) is a TERMINAL, RECOVERABLE refusal — never a replan", () => {
  const c = v2.classifyWorkError(raise("CLR13", "source_conflict", "the document this Work names no longer holds"));
  assert.equal(c.kind, "refusal", "an immutable basis is a business refusal, not a state to re-read");
  assert.equal(c.terminal, true, "the model does not get another attempt at the same commit");
  assert.equal(c.recoverable, true, "a human who fixes the source and presses Retry gets a NEW run");
  assert.equal(c.code, "CLR13");
  assert.equal(c.reason, "source_conflict");
  assert.equal(v2.workOutcomeFor(c.kind), "refused", "the Work settles refused, with the typed payload");
  assert.deepEqual(v2.workErrorPayload(c), {
    code: "CLR13",
    reason: "source_conflict",
    message: "the document this Work names no longer holds",
    recoverable: true,
  });
});

test("629.errors.v2: v1 would have called the SAME pair state_changed — which is the defect", () => {
  const one = v1.classifyWorkError(raise("CLR13", "source_conflict", "x"));
  assert.equal(one.kind, "state_changed", "v1's CLR13 default — a replan against an immutable basis");
  assert.equal(one.terminal, false);
});

test("629.errors.v2: ROSTER CLOSURE — every other pair classifies EXACTLY as v1 does", () => {
  for (const [code, reason] of V1_PAIRS) {
    const err = raise(code, reason, "refused");
    assert.deepEqual(
      v2.classifyWorkError(err),
      v1.classifyWorkError(err),
      `v2 changed the classification of (${code}, ${reason ?? "-"}) — the closure is not additive`,
    );
  }
});

test("629.errors.v2: the settle helpers are v1's, by re-export, so one vocabulary settles both", () => {
  assert.equal(v2.taskErrorCodeFor, v1.taskErrorCodeFor);
  assert.equal(v2.workOutcomeFor, v1.workOutcomeFor);
  assert.equal(v2.workErrorPayload, v1.workErrorPayload);
  assert.equal(v2.budgetExhaustedPayload, v1.budgetExhaustedPayload);
});

test("629.errors.v2: the v2 closure ROUTES through v2's classifier, not v1's", async () => {
  const impl = await import("../workflows/claraWork.v2.impl.ts");
  const src = (await import("node:fs")).readFileSync(
    new URL("../workflows/claraWork.v2.impl.ts", import.meta.url),
    "utf8",
  );
  assert.ok(impl, "the module loads");
  assert.match(src, /from "\.\/claraWork\.v2\.errors\.js"/, "the segment classifies through v2's table");
  assert.doesNotMatch(
    src,
    /classifyWorkError[\s\S]{0,200}from "\.\/claraWork\.v1\.errors\.js"/,
    "…and not through v1's",
  );
  const tools = (await import("node:fs")).readFileSync(
    new URL("../workflows/claraWork.v2.tools.ts", import.meta.url),
    "utf8",
  );
  assert.match(tools, /from "\.\/claraWork\.v2\.errors\.js"/, "the write router classifies through v2's table too");
});
