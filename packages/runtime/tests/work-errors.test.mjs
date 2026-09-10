// #623 — THE REPAIR ROUTER'S TABLE, driven directly rather than described.
//
// ARCHITECTURE §5 states the law in five clauses: a format/selection error may be corrected
// within budget; a safely-recomputable state conflict re-reads; infrastructure failures get
// bounded backoff; a missing fact or decision asks the human; and — the clause that decides most
// of this file — "权限、锁期或业务拒绝不能靠换参数无限尝试" (authority, a locked period or a
// business refusal cannot be retried by changing parameters), with "内部不变量失败成为可见故障"
// (an internal-invariant failure becomes a visible fault).
//
// Every `(errcode, detail.reason)` pair the contract names is asserted here, in BOTH directions:
// the kind, and the consequence the kind implies (terminal / recoverable). A pair that quietly
// changed kind would change whether a human sees "we could not do that, here is why" or a model
// gets handed the same refusal to guess around, so this table is the behaviour, not a summary of
// it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const errors = await import("../workflows/claraWork.v1.errors.ts");
const tools = await import("../workflows/claraWork.v1.tools.ts");
const bundle = await import("../workflows/claraWork.v1.bundle.ts");

const raise = (code, reason, message = "refused") =>
  Object.assign(new Error(message), { code, detail: reason === null ? undefined : JSON.stringify({ reason }) });

/** Every named pair, with its kind — READ BACK FROM THE RAISER. Migration 0178's header carries
 *  the complete `(errcode, detail.reason)` roster per verb, and this is that roster; the two
 *  estate-owned pairs (CLR19 write_into_closed_period from 0056's period wall, and the bare
 *  CLR07 from 0003's clara._assert_balanced) are asserted in their own cells below. */
const TABLE = [
  // model-fixable, inside budgets.replans
  ["CLR10", "basis_mismatch", "invalid_input"],
  ["CLR10", "invalid_basis", "invalid_input"],
  // safely re-read
  ["CLR13", "task_transition", "state_changed"],
  ["CLR13", "not_retryable", "state_changed"],
  // an uncommitted sibling holds the identity: wait, do not re-plan
  ["CLR13", "operation_in_flight", "transient"],
  // one identity, two payloads
  ["CLR10", "operation_payload_conflict", "conflict"],
  ["CLR10", "intent_payload_conflict", "conflict"],
  // business refusals — TERMINAL, recoverable by a human, never by a parameter change
  ["CLR19", "write_into_closed_period", "refusal"],
  ["CLR10", "generic_control_leg", "refusal"],
  ["CLR10", "unknown_account", "refusal"],
  ["CLR10", "client_inactive", "refusal"],
  // authority, rechecked at commit
  ["CLR04", "obo_not_active", "refusal"],
  ["CLR04", "actor_not_active", "refusal"],
  ["CLR04", "insufficient_role", "refusal"],
  // the subject is not what this run was told it was
  ["CLR11", "work_not_found", "refusal"],
  ["CLR11", "client_not_found", "refusal"],
  // invariants — every one of these arguments is supplied by the runtime itself
  ["CLR10", "invalid_op_key", "invariant"],
  ["CLR10", "invalid_intent_key", "invariant"],
  ["CLR10", "invalid_request", "invariant"],
  ["CLR10", "invalid_bundle", "invariant"],
  ["CLR10", "invalid_run_id", "invariant"],
  ["CLR10", "invalid_outcome", "invariant"],
  ["CLR10", "invalid_error_code", "invariant"],
  ["CLR10", "invalid_basis_origin", "invariant"],
  ["CLR10", "invalid_source_refs", "invariant"],
  ["CLR10", "wrong_task_kind", "invariant"],
  ["CLR10", "logical_op_mismatch", "invariant"],
  // The credential names a DIFFERENT human than the Work's own initiator. An INVARIANT and not a
  // refusal, unlike every other CLR04 here — see the cell below and the table's own note.
  ["CLR04", "obo_not_initiator", "invariant"],
  ["CLR03", "no_wake_credential", "invariant"],
  ["CLR03", "wrong_wake_kind", "invariant"],
  ["CLR03", "wake_obo_unbound", "invariant"],
  ["CLR03", "wake_task_unbound", "invariant"],
  ["CLR11", "credential_client_pin", "invariant"],
];

test("623.errors: every named (errcode, reason) pair classifies exactly as the contract says", () => {
  for (const [code, reason, kind] of TABLE) {
    const c = errors.classifyWorkError(raise(code, reason));
    assert.equal(c.kind, kind, `${code}/${reason} must classify ${kind}, got ${c.kind}`);
    assert.equal(c.code, code);
    assert.equal(c.reason, reason);
    assert.ok(c.message.length > 0, `${code}/${reason} carries a message a human can read`);
  }
});

test("623.errors: obo_not_initiator is the runtime's OWN fault, not the human's standing", () => {
  // 0178's `clara._record_journal_entry_core` binds the wake credential's `on_behalf_of` to the
  // Work's OWN initiator: authority alone is not enough, the receipt must attribute the posting
  // to the human who asked. The runtime mints that credential FROM `work.initiator`, read by
  // loadWorkStep off the very Work row this run is executing — so the two can only disagree if
  // this process paired a credential with the wrong Work.
  const c = errors.classifyWorkError(raise("CLR04", "obo_not_initiator"));
  assert.equal(c.kind, "invariant", "a pairing bug in this runtime is a VISIBLE fault");
  assert.equal(c.terminal, true);
  assert.equal(c.recoverable, false, "a human's Retry cannot fix a credential this runtime built wrong");
  assert.equal(errors.workOutcomeFor(c.kind), "failed");
  assert.equal(errors.taskErrorCodeFor(c.kind), "internal");

  // Its CLR04 NEIGHBOURS are the opposite, and that contrast is the whole reason the table is
  // keyed on the pair rather than on the code: these ARE the human's live standing changing under
  // a run, and a Retry after the role is restored genuinely succeeds.
  for (const reason of ["obo_not_active", "actor_not_active", "insufficient_role"]) {
    const other = errors.classifyWorkError(raise("CLR04", reason));
    assert.equal(other.kind, "refusal", `${reason} stays a refusal`);
    assert.equal(other.recoverable, true);
  }
  // And the CLR04 DEFAULT is still `refusal` — an unnamed authority CLR04 fails closed toward
  // the human, which is why this pair had to be named to get the other answer.
  assert.equal(errors.classifyWorkError(raise("CLR04", "some_future_authority_rule")).kind, "refusal");
});

test("623.errors: the RECEIPT OVERRIDE is a result flag, not an error this table classifies", () => {
  // `clara.settle_work_run` does not RAISE when it overrides a cancelled/failed/expired/refused
  // settle over a Work that already holds a committed receipt — it succeeds as `completed` and
  // says so in its answer (`requested_outcome`, `overridden_by_receipt`). Nothing reaches the
  // classifier, and the runtime's own half of that law lives in lib/reconciler-work.mjs.
  const src = readFileSync(new URL("../workflows/claraWork.v1.errors.ts", import.meta.url), "utf8");
  assert.match(src, /RECEIPT(?:\s|\/)+OVERRIDE/, "the file states why the override is absent from the table");
  assert.equal(
    src.includes("overridden_by_receipt"),
    true,
    "and names the flag, so a reader can find the mechanism rather than assume it was forgotten",
  );
  for (const reason of ["overridden_by_receipt", "requested_outcome"]) {
    assert.equal(errors.classifyWorkError(raise("CLR10", reason)).kind, "refusal", `${reason} is not a pair this table knows`);
  }
});

test("623.errors: the CONSEQUENCE of each kind is the one the architecture names", () => {
  const kindOf = (code, reason) => errors.classifyWorkError(raise(code, reason));

  // "格式或选择错误可在预算内改正" — back to the model, not terminal, and recoverable.
  const fixable = kindOf("CLR10", "basis_mismatch");
  assert.equal(fixable.terminal, false);
  assert.equal(fixable.recoverable, true);

  // "可安全重算的状态冲突重新读取" — same shape.
  const stateChanged = kindOf("CLR13", "task_transition");
  assert.equal(stateChanged.terminal, false);

  // "权限、锁期或业务拒绝不能靠换参数无限尝试" — TERMINAL, and a human's retry may still work.
  for (const [code, reason] of [["CLR19", "write_into_closed_period"], ["CLR04", "insufficient_role"], ["CLR10", "generic_control_leg"]]) {
    const c = kindOf(code, reason);
    assert.equal(c.terminal, true, `${code}/${reason} must be terminal for the loop`);
    assert.equal(c.recoverable, true, `${code}/${reason} is recoverable by a human, not by the model`);
  }

  // A conflict is terminal AND not recoverable: the identity is spent and the payload is what
  // it is, so a Retry on the same Work cannot make it succeed.
  const conflict = kindOf("CLR10", "operation_payload_conflict");
  assert.equal(conflict.terminal, true);
  assert.equal(conflict.recoverable, false);

  // "内部不变量失败成为可见故障" — terminal, NOT recoverable, never retried.
  const invariant = kindOf("CLR10", "invalid_op_key");
  assert.equal(invariant.terminal, true);
  assert.equal(invariant.recoverable, false);
});

test("623.errors: pg transient SQLSTATEs are transient, and are checked before the CLR defaults", () => {
  for (const sqlstate of errors.PG_TRANSIENT_SQLSTATES) {
    const c = errors.classifyWorkError(Object.assign(new Error("boom"), { code: sqlstate }));
    assert.equal(c.kind, "transient", `${sqlstate} must classify transient`);
    assert.equal(c.terminal, false, `${sqlstate} is retried, never settled`);
  }
  // A socket-level errno, directly and through a `cause`.
  for (const errno of errors.NODE_TRANSIENT_ERRNOS) {
    assert.equal(errors.classifyWorkError(Object.assign(new Error("net"), { code: errno })).kind, "transient");
    assert.equal(
      errors.classifyWorkError(Object.assign(new Error("net"), { cause: Object.assign(new Error("inner"), { code: errno }) })).kind,
      "transient",
    );
  }
});

test("623.errors: deploy-order and privilege faults are VISIBLE invariants with named causes", () => {
  const undeployed = errors.classifyWorkError(Object.assign(new Error("function does not exist"), { code: "42883" }));
  assert.equal(undeployed.kind, "invariant");
  assert.match(undeployed.message, /0178/, "an undeployed verb names the migration, not a generic failure");
  assert.match(undeployed.message, /[Nn]othing was recorded/);

  const denied = errors.classifyWorkError(Object.assign(new Error("permission denied"), { code: "42501" }));
  assert.equal(denied.kind, "invariant");

  const dup = errors.classifyWorkError(Object.assign(new Error("duplicate key"), { code: "23505" }));
  assert.equal(dup.kind, "conflict");

  const immutable = errors.classifyWorkError(Object.assign(new Error("append only"), { code: "CLR08" }));
  assert.equal(immutable.kind, "invariant");

  // The balance law raises a BARE CLR07 (clara._assert_balanced, 0003) with no typed detail at
  // all. Balance is already enforced at admission, so a disagreement at commit is the estate
  // contradicting itself — visible, never a repair the model could attempt.
  const unbalanced = errors.classifyWorkError(Object.assign(new Error("entry is unbalanced"), { code: "CLR07" }));
  assert.equal(unbalanced.kind, "invariant");
  assert.equal(unbalanced.recoverable, false);
  assert.match(unbalanced.message, /[Nn]othing was recorded/);
});

test("623.errors: the estate's own period wall (CLR19) is a REFUSAL, not an unknown SQLSTATE", () => {
  // The reason this cell exists as its own: the period wall is 0056's, not 0178's, and it raises
  // CLR19. Read as an unrecognised code it would settle the Work `failed`/internal — and the one
  // act that fixes it (reopen the period, then Retry) would be hidden from the human.
  const walled = errors.classifyWorkError(raise("CLR19", "write_into_closed_period"));
  assert.equal(walled.kind, "refusal");
  assert.equal(walled.terminal, true);
  assert.equal(walled.recoverable, true);
  assert.equal(errors.workOutcomeFor(walled.kind), "refused");
  assert.equal(errors.taskErrorCodeFor(walled.kind), "tool_error");
  // And an unrecognised CLR19 reason still refuses rather than becoming a visible fault.
  assert.equal(errors.classifyWorkError(raise("CLR19", "some_future_close_rule")).kind, "refusal");
});

test("623.errors: the defaults fail closed toward the human, never toward another model attempt", () => {
  // An unrecognised CLR10 reason is a business refusal this table has not been taught — settle
  // it, do not hand it back to a model to guess around.
  const unknownReason = errors.classifyWorkError(raise("CLR10", "some_future_rule"));
  assert.equal(unknownReason.kind, "refusal");
  assert.equal(unknownReason.terminal, true);

  // A CLR10 with NO typed detail at all still refuses rather than retrying.
  const bare = errors.classifyWorkError(Object.assign(new Error("no"), { code: "CLR10" }));
  assert.equal(bare.kind, "refusal");
  assert.equal(bare.reason, null);

  // A SQLSTATE nobody designed for is a visible fault.
  assert.equal(errors.classifyWorkError(Object.assign(new Error("?"), { code: "XX000" })).kind, "invariant");
  // So is a bare Error with no code at all.
  assert.equal(errors.classifyWorkError(new Error("plain")).kind, "invariant");
  assert.equal(errors.classifyWorkError(undefined).kind, "invariant");
});

test("623.errors: cancellation is a decision, not a fault", () => {
  const c = errors.classifyWorkError(Object.assign(new Error("stop"), { code: "clara_work_cancelled" }));
  assert.equal(c.kind, "cancelled");
  assert.equal(c.terminal, true);
  assert.equal(c.recoverable, true);
});

test("623.errors: each terminal kind settles the task and the Work where the estate allows", () => {
  // agent_tasks.error_code has no `refused` member; a typed refusal rides as 'tool_error' and
  // the Work row carries the real reason.
  assert.equal(errors.taskErrorCodeFor("refusal"), "tool_error");
  assert.equal(errors.taskErrorCodeFor("conflict"), "tool_error");
  assert.equal(errors.taskErrorCodeFor("invariant"), "internal");
  assert.equal(errors.taskErrorCodeFor("cancelled"), null);
  // Budget exhaustion MUST use 'limit' — the estate's own CHECK vocabulary.
  assert.equal(errors.taskErrorCodeFor("budget_exhausted"), "limit");

  assert.equal(errors.workOutcomeFor("refusal"), "refused");
  assert.equal(errors.workOutcomeFor("conflict"), "refused");
  assert.equal(errors.workOutcomeFor("invariant"), "failed");
  assert.equal(errors.workOutcomeFor("cancelled"), "cancelled");
  assert.equal(errors.workOutcomeFor("budget_exhausted"), "failed");
});

test("623.errors: the budget-exhaustion payload is recoverable and names which budget", () => {
  const payload = errors.budgetExhaustedPayload("modelCalls");
  assert.equal(payload.code, "budget_exhausted");
  assert.equal(payload.reason, "modelCalls");
  assert.equal(payload.recoverable, true);
  assert.match(String(payload.message), /modelCalls/);
  assert.match(String(payload.message), /[Nn]othing was posted/);
});

test("623.errors: the write-failure ROUTER spends replans, then goes terminal", () => {
  const budgets = bundle.CLARA_WORK_BUDGETS_V1;
  const ledger = tools.newBudgetLedger();

  // budgets.replans corrections are offered back to the model, each one counted.
  for (let i = 0; i < budgets.replans; i += 1) {
    const routed = tools.routeWriteFailure(ledger, budgets, errors.classifyWorkError(raise("CLR10", "basis_mismatch")));
    assert.equal(routed.ok, false);
    assert.equal(routed.terminal, false, "a correction inside budget is not terminal");
    assert.equal(ledger.replans, i + 1, "the replan is RECORDED, not merely allowed");
  }
  // The next one exhausts the budget — a bounded loop, not an unbounded one.
  const exhausted = tools.routeWriteFailure(ledger, budgets, errors.classifyWorkError(raise("CLR10", "basis_mismatch")));
  assert.equal(exhausted.terminal, true);
  assert.equal(ledger.exhausted, "replans");
  assert.equal(ledger.terminal.kind, "budget_exhausted");
});

test("623.errors: a refusal or a conflict goes terminal on the FIRST occurrence", () => {
  const budgets = bundle.CLARA_WORK_BUDGETS_V1;
  for (const [code, reason, terminalKind] of [
    ["CLR19", "write_into_closed_period", "refusal"],
    ["CLR10", "operation_payload_conflict", "conflict"],
    ["CLR04", "obo_not_active", "refusal"],
  ]) {
    const ledger = tools.newBudgetLedger();
    const routed = tools.routeWriteFailure(ledger, budgets, errors.classifyWorkError(raise(code, reason)));
    assert.equal(routed.terminal, true, `${code}/${reason} is terminal immediately`);
    assert.equal(ledger.replans, 0, "a refusal never spends a correction budget");
    assert.equal(ledger.terminal.kind, terminalKind);
    assert.equal(ledger.refusal.reason, reason, "the typed reason is carried, not flattened to prose");
  }
});
