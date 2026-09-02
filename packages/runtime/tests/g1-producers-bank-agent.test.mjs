// Gate G1 PR-2b — the bank_agent PRODUCER, against a real rig. #437 shipped bankAgent_v1 (the
// consumer) and measured no producer exists (PROGRESS.md 2026-08-30 noon). This file proves the
// missing half: reconciler-bank-agent.mjs's produceBankAgentWakes() and its pure switch,
// classifyBankDueReason.
//
// REWRITTEN AT THE G1 PR-2b FOLD (Codex r1 review of #449 — HIGH-1, MEDIUM-4). The role-matrix
// / negative-control / concurrency cells (HIGH-2, HIGH-3) moved to
// g1-producers-bank-agent-security.test.mjs (the 500-line module budget); fixtures shared via
// g1-producers-bank-agent-fixtures.mjs.
//
// The DB surfaces this belt needs do not exist on `main` yet, by design (module header):
//   clara.bank_agent_run_due(uuid)  — F-A3's own domain due-predicate (g1-wake-engine-design.md
//                                     §5), unbuilt.
//   clara.emit_bank_agent_due(...)  — THIS PR's own emission door, shipped in
//                                     UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql (present on
//                                     THIS branch's rig, since the file has been applied).
// Per the lane brief ("stub the registration in your test fixture and say so"), this battery
// STUBS the missing bank_agent_run_due predicate and the missing clara.event_types/
// trigger_taxonomy registration for `bank.agent_due` as RIG-ONLY objects — never a product
// migration. The stub's own reply shape carries a DB-owned `subject_id` (R2-2's contract, documented in
// reconciler-bank-agent.mjs's header and packages/runtime/README.md) and a caller-chosen
// `reason` (HIGH-1's closed switch).
//
// THIS BELT ONLY APPENDS THE DOMAIN EVENT — routing (domain_events -> wake_intents) and drain
// (wake_intents -> held agent_tasks) are a SEPARATE, already-proven leader-cycle phase
// (relay.mjs/drain.mjs) this PR does not touch, so positive-shape cells read domain_events
// directly rather than the derived held-task carrier.

process.env.RELAY_TEST_MODE ??= "1";

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, asRuntime, buildFirm, endPool } from "./relay-fixtures.mjs";
import { produceBankAgentWakes, classifyBankDueReason } from "../lib/reconciler-bank-agent.mjs";
import {
  hasEmitDoor, ensureBankAgentDueEventType, ensureFirmLevelStubType, ensureBankAgentRunDueStub,
  resetDueStub, stubReply, setBankAgentEnabled, buildActiveBankAccount, buildReasonSubject, eventsFor,
} from "./g1-producers-bank-agent-fixtures.mjs";

const HAS_EMIT_DOOR = await hasEmitDoor();
const skip = HAS_EMIT_DOOR ? false : "clara.emit_bank_agent_due(uuid,uuid,uuid,text) absent — apply UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql first";

before(async () => {
  await ensureBankAgentRunDueStub();
  await ensureBankAgentDueEventType();
  await ensureFirmLevelStubType();
});

after(async () => {
  await rootQuery(
    "update clara.wake_engine_sources set enabled=false, disabled_by=null, disabled_at=null, disabled_reason='g1-producers-bank-agent.test.mjs after() restore' where source_key='bank_agent'",
  );
  await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
  await rootQuery("drop table if exists clara._test_g1pr2b_bank_due_stub");
  await endPool();
});

// =====================================================================================
// classifyBankDueReason — the pure closed switch (HIGH-1), driven directly, every branch.
// =====================================================================================

test("classifyBankDueReason: the closed reason table, every member, both directions", () => {
  for (const reason of ["unmatched_lines", "reconcilable", "retry_later"]) {
    const v = classifyBankDueReason({ due: true, reason, bank_account_id: randomUUID(), subject_id: randomUUID() });
    assert.equal(v.action, "emit", `${reason} must emit`);
    assert.equal(v.reason, reason);
  }
  assert.deepEqual(classifyBankDueReason({ due: true, reason: "chase_statement" }), { action: "notify_deferred", reason: "chase_statement" });
  for (const reason of ["purpose_unconsented", "held", "nothing_due"]) {
    assert.deepEqual(classifyBankDueReason({ due: false, reason }), { action: "quiet", reason });
  }
  // Consistency checks — a reason paired with the WRONG due boolean is malformed, not silently accepted.
  assert.equal(classifyBankDueReason({ due: false, reason: "unmatched_lines", bank_account_id: randomUUID(), subject_id: randomUUID() }).action, "malformed");
  assert.equal(classifyBankDueReason({ due: true, reason: "nothing_due" }).action, "malformed");
  // FIND-11 (opus r1 review of #449): an emit reason missing bank_account_id or subject_id is
  // "anomalous" (logged, not counted) — a RECOGNISED reason with a shape hiccup, distinct from a
  // genuinely unrecognised reason (still "malformed" and counted, asserted below).
  assert.equal(classifyBankDueReason({ due: true, reason: "unmatched_lines", subject_id: randomUUID() }).action, "anomalous");
  assert.equal(classifyBankDueReason({ due: true, reason: "unmatched_lines", bank_account_id: randomUUID() }).action, "anomalous");
  // An UNRECOGNISED reason is a counted failure, never emit/quiet/notify.
  assert.equal(classifyBankDueReason({ due: true, reason: "some_new_reason_nobody_ruled" }).action, "malformed");
  assert.equal(classifyBankDueReason({}).action, "malformed");
  assert.equal(classifyBankDueReason(null).action, "malformed");
});

// =====================================================================================
// The belt, against the real rig.
// =====================================================================================

test("bank_agent producer: DISABLED source appends nothing, even with a genuinely due account", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-off");
  const acct = await buildActiveBankAccount(w, "off");
  await stubReply(w.client, { due: true, reason: "unmatched_lines", bank_account_id: acct, subject_id: randomUUID() });
  await setBankAgentEnabled(false);
  const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.dormant, false, "both surfaces exist — this is a disabled-source no-op, not dormancy");
  assert.equal(out.bankAgentAppended, 0, "a disabled source must append ZERO events");
  assert.equal((await eventsFor(acct)).length, 0, "and nothing landed on the event spine either");
});

test("bank_agent producer: unmatched_lines/reconcilable/retry_later each emit exactly one event, correctly shaped", { skip }, async () => {
  await resetDueStub();
  for (const reason of ["unmatched_lines", "reconcilable", "retry_later"]) {
    await resetDueStub();
    const w = await buildFirm(`g1ba-${reason.slice(0, 4)}`);
    await setBankAgentEnabled(true, w.owner);
    const subject = await buildReasonSubject(w, reason, reason);
    const acct = subject.bankAccountId;
    await stubReply(w.client, { due: true, reason, bank_account_id: acct, subject_id: subject.subjectId });
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.bankAgentOk, true);
    assert.equal(out.bankAgentAppended, 1, `${reason}: expected exactly one appended event, got ${JSON.stringify(out)}`);
    const events = await eventsFor(acct);
    assert.equal(events.length, 1, `${reason}: exactly one domain event`);
    assert.equal(events[0].payload.bank_account_id, acct, "the payload must carry bank_account_id");
    assert.equal(events[0].payload.reason, reason);
    assert.equal(events[0].client_id, w.client, "the domain event must be client-scoped");
  }
});

test("bank_agent producer: chase_statement is DEFERRED — zero events, counted separately, never silently dropped", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-chase");
  const acct = await buildActiveBankAccount(w, "chase");
  await stubReply(w.client, { due: true, reason: "chase_statement", bank_account_id: acct });
  await setBankAgentEnabled(true, w.owner);
  const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.bankAgentAppended, 0, "chase_statement must never emit bank.agent_due");
  assert.equal(out.bankAgentNotifyDeferred, 1, "the deferral must be COUNTED, not silent");
  assert.equal(out.bankAgentFailed, 0, "a named, ruled reason is not a failure");
  assert.equal((await eventsFor(acct)).length, 0);
});

test("bank_agent producer: purpose_unconsented/held/nothing_due are quiet — no event, no failure", { skip }, async () => {
  for (const reason of ["purpose_unconsented", "held", "nothing_due"]) {
    await resetDueStub();
    const w = await buildFirm(`g1ba-q${reason.slice(0, 3)}`);
    await setBankAgentEnabled(true, w.owner);
    const acct = await buildActiveBankAccount(w, reason);
    await stubReply(w.client, { due: false, reason });
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.bankAgentOk, true, reason);
    assert.equal(out.bankAgentAppended, 0, reason);
    assert.equal(out.bankAgentFailed, 0, reason);
    assert.equal((await eventsFor(acct)).length, 0, reason);
  }
});

test("bank_agent producer: an UNRECOGNISED reason is a counted failure, never an event", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-unk");
  const acct = await buildActiveBankAccount(w, "unk");
  await stubReply(w.client, { due: true, reason: "a_reason_nobody_ruled", bank_account_id: acct, subject_id: randomUUID() });
  await setBankAgentEnabled(true, w.owner);
  const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(out.bankAgentOk, true, "one poisoned client must not flip the whole belt");
  assert.equal(out.bankAgentAppended, 0);
  assert.equal(out.bankAgentFailed, 1);
  assert.equal((await eventsFor(acct)).length, 0);
});

// FIND-11 (opus r1 review of #449): a RECOGNISED emit reason with a missing required field is
// ANOMALOUS, not a counted failure — the belt continues, logs loudly, appends nothing. Two
// cells (both required fields, each missing in turn) using the existing stub's own optional
// bank_account_id/subject_id — no fixture change needed, since stubReply already omits either as
// SQL NULL when the caller's reply object leaves it out.
test("bank_agent producer: a recognised reason missing bank_account_id is ANOMALOUS — logged, appended=0, failed=0 (not counted)", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-anom1");
  await setBankAgentEnabled(true, w.owner);
  await stubReply(w.client, { due: true, reason: "unmatched_lines", subject_id: randomUUID() }); // bank_account_id omitted
  const log = [];
  const out = await asRuntime((c) => produceBankAgentWakes(c, { log: (m) => log.push(m) }));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.bankAgentAppended, 0);
  assert.equal(out.bankAgentFailed, 0, "an anomalous shape must NOT be counted as a failure");
  assert.ok(log.some((m) => /anomalous shape/.test(m)), "but it must still be logged loudly");
});

test("bank_agent producer: a recognised reason missing subject_id is ANOMALOUS — logged, appended=0, failed=0 (not counted)", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-anom2");
  await setBankAgentEnabled(true, w.owner);
  const acct = await buildActiveBankAccount(w, "anom2");
  await stubReply(w.client, { due: true, reason: "reconcilable", bank_account_id: acct }); // subject_id omitted
  const log = [];
  const out = await asRuntime((c) => produceBankAgentWakes(c, { log: (m) => log.push(m) }));
  assert.equal(out.bankAgentOk, true);
  assert.equal(out.bankAgentAppended, 0);
  assert.equal(out.bankAgentFailed, 0, "an anomalous shape must NOT be counted as a failure");
  assert.ok(log.some((m) => /anomalous shape/.test(m)), "but it must still be logged loudly");
});

test("bank_agent producer: TWO TICKS with the SAME DB subject append exactly ONE event (DB-owned claim, HIGH-3)", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-2t");
  const subject = await buildReasonSubject(w, "unmatched_lines", "2t");
  const acct = subject.bankAccountId;
  await stubReply(w.client, { due: true, reason: "unmatched_lines", bank_account_id: acct, subject_id: subject.subjectId });
  await setBankAgentEnabled(true, w.owner);
  const first = await asRuntime((c) => produceBankAgentWakes(c, {}));
  const second = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(first.bankAgentAppended, 1, "the first tick must append the event");
  assert.equal(second.bankAgentAppended, 0, "the second tick must append NOTHING for the same DB subject");
  assert.equal(second.bankAgentSkipped, 1, "and the belt must SAY it skipped, not silently do nothing");
  assert.equal((await eventsFor(acct)).length, 1, "exactly ONE bank.agent_due event for this account after two ticks");
});

test("bank_agent producer: a DIFFERENT statement subject for the same account derives a distinct key", { skip }, async () => {
  await resetDueStub();
  const w = await buildFirm("g1ba-newkey");
  const firstSubject = await buildReasonSubject(w, "unmatched_lines", "newkey-1");
  const acct = firstSubject.bankAccountId;
  await stubReply(w.client, { due: true, reason: "unmatched_lines", bank_account_id: acct, subject_id: firstSubject.subjectId });
  await setBankAgentEnabled(true, w.owner);
  const first = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(first.bankAgentAppended, 1);
  const secondSubject = await buildReasonSubject(w, "reconcilable", "newkey-2", {
    bankAccountId: acct, periodStart: "2024-08-01", periodEnd: "2024-08-31", lineDate: "2024-08-15",
  });
  await stubReply(w.client, { due: true, reason: "reconcilable", bank_account_id: acct, subject_id: secondSubject.subjectId });
  const second = await asRuntime((c) => produceBankAgentWakes(c, {}));
  assert.equal(second.bankAgentAppended, 1, "a fresh DB occurrence must not be blocked by an earlier claim on the same account");
  assert.equal((await eventsFor(acct)).length, 2, "TWO distinct events for this account — two distinct occurrences");
  const keys = await rootQuery(
    "select due_key from clara.bank_agent_due_claims where client_id=$1 and bank_account_id=$2 order by due_key",
    [w.client, acct],
  );
  assert.equal(keys.rows.length, 2);
  assert.notEqual(keys.rows[0].due_key, keys.rows[1].due_key, "the SQL door must derive distinct keys for distinct statement ids");
});

test("bank_agent producer: absent bank_agent_run_due/emit_bank_agent_due surface is DORMANT, never a failure", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/reconciler-bank-agent.mjs", import.meta.url), "utf8"),
  );
  assert.match(src, /checkFunctionSurface/, "the belt must use the shared shape-checking helper (MEDIUM-4), not a bare to_regprocedure probe");
  assert.match(src, /dormant:\s*true/, "an absent surface must answer dormant:true, never throw");
});

// =====================================================================================
// MEDIUM-4 — a PRESENT but WRONGLY-SHAPED surface is a belt FAILURE, never dormancy.
// =====================================================================================

describe("bank_agent producer: MEDIUM-4 — present-but-invalid surfaces are a belt failure, not dormancy", { skip }, () => {
  let restored = false;
  after(async () => {
    // Restore the real stub function so a LATER file's own before() (which just re-applies it
    // anyway) never inherits a deliberately-wrong shape if this suite is ever run standalone.
    if (!restored) await ensureBankAgentRunDueStub();
  });

  test("a PROCEDURE with the same name/arity is refused, not silently treated as dormant", async () => {
    await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
    await rootQuery("create procedure clara.bank_agent_run_due(p_client uuid) language plpgsql as $$ begin end $$");
    await rootQuery("grant execute on procedure clara.bank_agent_run_due(uuid) to clara_runtime");
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.bankAgentOk, false, "a procedure must NOT satisfy the surface check");
    assert.equal(out.dormant, false, "and it must NOT be reported as dormant either — this is a real, present, wrong-shaped surface");
    await rootQuery("drop procedure clara.bank_agent_run_due(uuid)");
  });

  test("a TEXT-returning function with the same name/arity is refused", async () => {
    await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
    await rootQuery("create function clara.bank_agent_run_due(p_client uuid) returns text language sql as $$ select 'nope' $$");
    await rootQuery("grant execute on function clara.bank_agent_run_due(uuid) to clara_runtime");
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.bankAgentOk, false);
    assert.equal(out.dormant, false);
  });

  test("a SETOF jsonb function with the same name/arity is refused (a scalar is expected)", async () => {
    await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
    await rootQuery("create function clara.bank_agent_run_due(p_client uuid) returns setof jsonb language sql as $$ select '{}'::jsonb $$");
    await rootQuery("grant execute on function clara.bank_agent_run_due(uuid) to clara_runtime");
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.bankAgentOk, false);
    assert.equal(out.dormant, false);
  });

  test("a shadow in ANOTHER schema does not satisfy the surface (schema-qualification matters)", async () => {
    await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
    await rootQuery("create schema if not exists g1pr2b_shadow_test");
    await rootQuery("create function g1pr2b_shadow_test.bank_agent_run_due(p_client uuid) returns jsonb language sql as $$ select '{\"due\":false}'::jsonb $$");
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.dormant, true, "the REAL clara.bank_agent_run_due is genuinely absent — the shadow must not satisfy the check");
    await rootQuery("drop schema g1pr2b_shadow_test cascade");
  });

  test("the correct scalar-jsonb function DOES activate the belt (the positive control)", async () => {
    await rootQuery("drop function if exists clara.bank_agent_run_due(uuid)");
    await ensureBankAgentRunDueStub();
    restored = true;
    await resetDueStub();
    const out = await asRuntime((c) => produceBankAgentWakes(c, {}));
    assert.equal(out.dormant, false);
    assert.equal(out.bankAgentOk, true);
  });
});
