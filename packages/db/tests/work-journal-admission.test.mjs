// #623 — the ADMISSION and RUN-LIFECYCLE half of the accounting-work battery.
// The commit half (the wake verb, its refusals and its RLS) is `work-journal-post.test.mjs`.
//
// CONTRACT-BLIND, frontier-gated on the `accounting_work_journal_successor$` stem.
//
// WHAT THIS FILE IS ABOUT. Ticket #623 asks for ONE durable Work per journal intent, with a
// SERVER-ASSIGNED logical operation identity that survives a lost acknowledgement, a duplicate
// submit and an engine retry (C33.8 / C54.1 / C-62), and refuses a CHANGED payload under the
// same identity rather than creating a second effect. Admission is where that identity is
// minted, so it is where the identity claims are provable.
//
// C82.1 IS A SEPARATE CLAIM AND IT IS TESTED SEPARATELY: an empty/whitespace key is refused
// BEFORE any reservation exists — not merely refused. The cell reads `clara.op_receipts` after
// the raise to prove nothing was reserved, because "it raised" is compatible with a reservation
// that was written and rolled back only by luck of the transaction boundary.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateWork, buildWorkWorld, endPool, printLaneNotes, printSkipCount, noteLane,
  admitJournalWork, retryAccountingWork, claimWorkRun, settleWorkRun,
  basis, WCHART, MODEL, REASON, CLR, assertPair, rootQuery, opk,
  workRow, taskRow, tasksForWork, defaultBundle,
} from "./work-journal-fixtures.mjs";

// The world is built UNCONDITIONALLY: nothing in it depends on #623's migration, and building
// it under the gate would make a frontier-skipped run silently skip the world's own failures too.
let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-journal-admission");
  printSkipCount("work-journal-admission");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const B1 = () => world.clients.B1;
const ALICE = () => world.users.alice;   // owner, firm A
const BOB = () => world.users.bob;       // bookkeeper, firm A
const CAROL = () => world.users.carol;   // viewer, firm A
const DAVE = () => world.users.dave;     // owner, firm B

// ===========================================================================================
// 1 · Admission — the happy path and the identity it mints.
// ===========================================================================================

test("w623.admit.happy one Work + one queued task + a SERVER-ASSIGNED logical op id", async (t) => {
  if (await gateWork(t)) return;
  const key = `w623-happy-${Date.now().toString(36)}`;
  const out = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key });

  assert.equal(out.status, "queued", "admit.happy: the Work is admitted queued");
  assert.equal(out.replayed, false, "admit.happy: a first admission is not a replay");
  assert.ok(out.work_id, "admit.happy: a work id comes back");
  assert.ok(out.task_id, "admit.happy: a task id comes back");

  // THE IDENTITY IS THE SERVER'S, and its shape is the contract's: work:<id>:journal_entry:1.
  // Asserted as a WHOLE STRING, parser-free (C33.8's own words: "test parser-free round trip").
  assert.equal(out.logical_op_id, `work:${out.work_id}:journal_entry:1`,
    "admit.happy: the logical operation identity is server-assigned from the Work's own id");

  const w = await workRow(out.work_id);
  assert.equal(w.purpose, "journal_entry", "admit.happy: purpose");
  assert.equal(w.status, "queued");
  assert.equal(w.initiator, BOB(), "admit.happy: the initiator is the author");
  assert.equal(w.initiator_role, "bookkeeper",
    "admit.happy: the role AT ADMISSION is snapshotted for display (commit rereads the live one)");
  assert.equal(w.intent_key, key);
  assert.equal(w.basis_origin, "user_direct");
  assert.deepEqual(w.source_refs, [], "admit.happy: documentless — an EMPTY source_refs array");
  assert.equal(w.current_task_id, out.task_id, "admit.happy: the Work points at its run");
  assert.match(w.basis_digest, /^[0-9a-f]{64}$/,
    "admit.happy: the basis digest is a sha256 hex the DB computed — the runtime never sends one");
  assert.equal(w.result, null);
  assert.equal(w.error, null);
  assert.equal(w.bundle, null, "admit.happy: the bundle is the RUN's to record, not admission's");

  const tasks = await tasksForWork(out.work_id);
  assert.equal(tasks.length, 1, "admit.happy: exactly ONE run");
  assert.equal(tasks[0].kind, "accounting_work", "admit.happy: …of the new kind");
  assert.equal(tasks[0].status, "queued");
  assert.equal(tasks[0].workflow_run_id, null, "admit.happy: unbound until a run claims it");
  const full = await taskRow(tasks[0].id);
  assert.equal(full.client_id, A1(), "admit.happy: the task is client-scoped");
  assert.equal(full.created_by, BOB());
  assert.equal(full.model_snapshot, MODEL, "admit.happy: the model snapshot rides the task");
});

test("w623.admit.replay the SAME intent_key with the SAME basis returns the original — no second run", async (t) => {
  if (await gateWork(t)) return;
  const key = `w623-replay-${Date.now().toString(36)}`;
  const first = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key });
  const again = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key });

  assert.equal(again.replayed, true, "admit.replay: the second admission says so");
  assert.equal(again.work_id, first.work_id, "admit.replay: the SAME Work");
  assert.equal(again.logical_op_id, first.logical_op_id, "admit.replay: the SAME identity");
  assert.equal(again.task_id, first.task_id, "admit.replay: the SAME run");
  assert.equal((await tasksForWork(first.work_id)).length, 1,
    "admit.replay: a lost acknowledgement re-POSTs and must NOT mint a second run (C54.1)");
});

test("w623.admit.conflict the same intent_key with a CHANGED basis is a typed conflict, not a second Work", async (t) => {
  if (await gateWork(t)) return;
  const key = `w623-conflict-${Date.now().toString(36)}`;
  const first = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key });
  const before = await rootQuery("select count(*)::int as n from clara.accounting_work where firm_id=$1",
    [(await workRow(first.work_id)).firm_id]);

  await assertPair(CLR.badRequest, REASON.intentConflict,
    () => admitJournalWork({ client: A1(), author: BOB(), intentKey: key, basis: basis({ cents: 999900 }) }),
    "admit.conflict");

  const after = await rootQuery("select count(*)::int as n from clara.accounting_work where firm_id=$1",
    [(await workRow(first.work_id)).firm_id]);
  assert.equal(after.rows[0].n, before.rows[0].n,
    "admit.conflict: …and NO second Work was created");
});

test("w623.admit.client-scoped-intent the SAME key against a DIFFERENT client is a DIFFERENT intent", async (t) => {
  if (await gateWork(t)) return;
  // THE FINDING THIS CELL PINS. Idempotency was scoped to the FIRM, and neither key generator is
  // guaranteed distinct across clients: the composer mints one draft uuid per draft, and the chat
  // lane derives its key from the task id and the tool input. A firm-scoped key therefore made
  // the SECOND client's intent vanish — admission handed back the FIRST client's Work with
  // `replayed:true`, so a bookkeeper watched a Work against somebody else's books while their own
  // entry was never admitted at all. Same key, two clients, two Works.
  const key = `w623-two-clients-${Date.now().toString(36)}`;
  const one = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key });
  const two = await admitJournalWork({ client: A2(), author: BOB(), intentKey: key });

  assert.equal(two.replayed, false,
    "admit.client-scoped-intent: the second client's intent is NOT a replay of the first client's");
  assert.notEqual(two.work_id, one.work_id, "admit.client-scoped-intent: two Works");
  assert.notEqual(two.task_id, one.task_id, "admit.client-scoped-intent: …and two runs");
  assert.notEqual(two.logical_op_id, one.logical_op_id,
    "admit.client-scoped-intent: …carrying two distinct operation identities");
  assert.equal((await workRow(one.work_id)).client_id, A1());
  assert.equal((await workRow(two.work_id)).client_id, A2(),
    "admit.client-scoped-intent: the second Work is against the client it was submitted for");

  // …and the key is STILL idempotent WITHIN each client, which is the half that must not regress.
  const again = await admitJournalWork({ client: A2(), author: BOB(), intentKey: key });
  assert.equal(again.replayed, true, "admit.client-scoped-intent: a re-POST for A2 still replays");
  assert.equal(again.work_id, two.work_id);
  assert.equal((await tasksForWork(two.work_id)).length, 1,
    "admit.client-scoped-intent: …and mints no second run");
});

test("w623.admit.caps a memo or narration the frozen tool schema could never post is refused at ADMISSION", async (t) => {
  if (await gateWork(t)) return;
  // THE FINDING. `claraWork.v1.tools.ts` is FROZEN and caps the echoed basis at
  // (spelled without the literal freeze marker on purpose: scripts/check-frozen-workflows.mjs
  // treats ANY file containing that marker as a frozen root and hash-locks its whole relative
  // import closure — a prose mention here dragged this test file, its fixtures and half of
  // packages/db into frozen-workflows.json)
  // memo ≤ 4000 and description ≤ 2000. A longer one ADMITTED — a Work row, a queued run, a
  // model call — and then died inside the segment when the model echoed the basis back, settling
  // the Work `failed` for a reason the composer could have shown the typist at submit time.
  const { detail: memoD } = await assertPair(CLR.badRequest, REASON.invalidBasis,
    () => admitJournalWork({ client: A1(), author: BOB(), basis: basis({ memo: "m".repeat(4001) }) }),
    "admit.caps(memo)");
  assert.equal(memoD.field, "memo", "admit.caps: the detail names the memo");
  assert.equal(memoD.constraint, "max_length");
  assert.equal(memoD.max, 4000, "admit.caps: …and the cap it broke");

  const long = basis();
  long.lines[1].description = "d".repeat(2001);
  const { detail: lineD } = await assertPair(CLR.badRequest, REASON.invalidBasis,
    () => admitJournalWork({ client: A1(), author: BOB(), basis: long }), "admit.caps(description)");
  assert.equal(lineD.field, "lines[2].description",
    "admit.caps: the offending path is 1-BASED, as every other basis field path in this lane is");
  assert.equal(lineD.constraint, "max_length");
  assert.equal(lineD.max, 2000);

  // THE BOUNDARY ADMITS. A cap that refused its own limit would be a new floor nobody agreed to.
  const edge = basis({ memo: "m".repeat(4000) });
  edge.lines[0].description = "d".repeat(2000);
  const out = await admitJournalWork({ client: A1(), author: BOB(), basis: edge });
  assert.equal(out.status, "queued", "admit.caps: exactly 4000 and exactly 2000 are postable");
});

// ===========================================================================================
// 2 · Admission — the refusals, each with its typed pair.
// ===========================================================================================

test("w623.admit.viewer a viewer cannot admit accounting work", async (t) => {
  if (await gateWork(t)) return;
  await assertPair(CLR.authz, REASON.insufficientRole,
    () => admitJournalWork({ client: A1(), author: CAROL() }), "admit.viewer");
});

test("w623.admit.inactive-member a removed member cannot admit", async (t) => {
  if (await gateWork(t)) return;
  // A REAL membership transition, undone afterwards: the claim is about a LIVE membership read,
  // so a fixture that never touched the row would prove nothing.
  const w = world;
  await rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
    [w.users.bob, w.firms.A]);
  try {
    await assertPair(CLR.authz, REASON.actorNotActive,
      () => admitJournalWork({ client: A1(), author: BOB() }), "admit.inactive-member");
  } finally {
    await rootQuery("update clara.firm_memberships set status='active' where user_id=$1 and firm_id=$2",
      [w.users.bob, w.firms.A]);
  }
});

test("w623.admit.cross-firm a client in ANOTHER firm reads as not-found (no existence oracle)", async (t) => {
  if (await gateWork(t)) return;
  await assertPair(CLR.notFound, REASON.clientNotFound,
    () => admitJournalWork({ client: B1(), author: BOB() }), "admit.cross-firm");
  // And the mirror: a uuid that names no client at all answers the SAME way. If the two answers
  // differed, the pair would be an oracle for "does this client exist in some other firm".
  await assertPair(CLR.notFound, REASON.clientNotFound,
    () => admitJournalWork({ client: "00000000-0000-4000-8000-0000006230aa", author: BOB() }),
    "admit.cross-firm(absent)");
  noteLane("admit.cross-firm: dave/B1 is the far side; the near side never learns B1 exists");
});

test("w623.admit.inactive-client an archived client refuses new accounting work", async (t) => {
  if (await gateWork(t)) return;
  await rootQuery("update clara.clients set status='archived' where id=$1", [A2()]);
  try {
    await assertPair(CLR.badRequest, REASON.clientInactive,
      () => admitJournalWork({ client: A2(), author: ALICE() }), "admit.inactive-client");
  } finally {
    await rootQuery("update clara.clients set status='active' where id=$1", [A2()]);
  }
});

test("w623.admit.basis every malformed basis is refused with a typed FIELD", async (t) => {
  if (await gateWork(t)) return;
  const cases = [
    ["unbalanced", basis({ lines: [
      { account_code: WCHART.expense, debit_cents: 120000, credit_cents: 0 },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: 119900 }] }), "lines"],
    ["both-sides", basis({ lines: [
      { account_code: WCHART.expense, debit_cents: 120000, credit_cents: 5 },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: 120005 }] }), "lines[1]"],
    ["zero-sides", basis({ lines: [
      { account_code: WCHART.expense, debit_cents: 0, credit_cents: 0 },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: 0 }] }), "lines[1]"],
    ["fractional-cents", basis({ lines: [
      { account_code: WCHART.expense, debit_cents: 1200.5, credit_cents: 0 },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: 1200.5 }] }), "lines[1].debit_cents"],
    ["negative-cents", basis({ lines: [
      { account_code: WCHART.expense, debit_cents: -120000, credit_cents: 0 },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: -120000 }] }), "lines[1].debit_cents"],
    ["one-line", basis({ lines: [{ account_code: WCHART.expense, debit_cents: 1, credit_cents: 0 }] }), "lines"],
    ["blank-memo", basis({ memo: "   " }), "memo"],
    ["blank-account", basis({ lines: [
      { account_code: "  ", debit_cents: 120000, credit_cents: 0 },
      { account_code: WCHART.bank, debit_cents: 0, credit_cents: 120000 }] }), "lines[1].account_code"],
    ["non-myr", basis({ currency: "SGD" }), "currency"],
    ["no-date", basis({ postingDate: null }), "posting_date"],
  ];
  for (const [label, b, field] of cases) {
    const { detail } = await assertPair(CLR.badRequest, REASON.invalidBasis,
      () => admitJournalWork({ client: A1(), author: BOB(), basis: b }), `admit.basis(${label})`);
    assert.equal(detail.field, field,
      `admit.basis(${label}): the detail names the offending field (got ${JSON.stringify(detail)})`);
  }
});

test("w623.admit.whole-number-cents a zero-fraction cents literal is the SAME accounting act, not an untyped cast error", async (t) => {
  if (await gateWork(t)) return;
  // THE SEAM. `debit_cents` is validated by one predicate and canonicalised by another, and the
  // two must agree about what an integer minor unit IS. A JSON number written `120000.0` is a
  // whole number, so the validator admits it — jsonb keeps the numeric's SCALE, so the text the
  // canonicaliser reads back is `120000.0`. A canonicaliser that cast that text to bigint itself
  // raised a bare 22P02 (no CLR code, no typed detail) out of the one path this lane promises is
  // fully typed: a call the validator said was FINE died with an error no classifier can act on.
  //
  // The claim tested here is the invariant, not the spelling: the same accounting act written
  // two ways admits, and admits to the SAME digest — which is also what makes the replay in
  // `admit.replay` honest for any runtime whose JSON encoder emits a trailing `.0`.
  const key = `w623-wholecents-${Date.now().toString(36)}`;
  const plain = basis();
  // Built as TEXT, because JSON.stringify(120000.0) is "120000" — a JS round trip cannot carry
  // the scale, and a fixture that went through one would test nothing.
  const raw = JSON.stringify(plain)
    .replace('"debit_cents":120000', '"debit_cents":120000.0')
    .replace('"credit_cents":120000', '"credit_cents":120000.0');
  assert.match(raw, /120000\.0/, "admit.whole-number-cents: the fixture really carries a zero fraction");

  const first = await admitJournalWork({ client: A1(), author: BOB(), intentKey: key, basis: plain });
  const again = await rootQuery(
    "select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,'user_direct','[]'::jsonb,$5::text) as result",
    [A1(), BOB(), key, raw, MODEL]);
  const out = again.rows[0].result;
  assert.equal(out.replayed, true,
    "admit.whole-number-cents: 120000.0 and 120000 are ONE accounting act — same digest, same Work");
  assert.equal(out.work_id, first.work_id);
  assert.equal((await tasksForWork(first.work_id)).length, 1,
    "admit.whole-number-cents: …and no second run was minted");
});

test("w623.admit.blank-intent-key an empty/whitespace key is refused BEFORE any reservation (C82.1)", async (t) => {
  if (await gateWork(t)) return;
  const before = await rootQuery("select count(*)::int as n from clara.op_receipts");
  for (const key of ["", "   ", "\t\n"]) {
    await assertPair(CLR.badRequest, REASON.invalidIntentKey,
      () => admitJournalWork({ client: A1(), author: BOB(), intentKey: key }),
      `admit.blank-intent-key(${JSON.stringify(key)})`);
  }
  const after = await rootQuery("select count(*)::int as n from clara.op_receipts");
  assert.equal(after.rows[0].n, before.rows[0].n,
    "admit.blank-intent-key: NOTHING was reserved — the refusal is BEFORE the reservation, not after it");
  // And no Work carries a blank key either, which is the durable half of the same claim.
  const blanks = await rootQuery("select count(*)::int as n from clara.accounting_work where btrim(intent_key)=''");
  assert.equal(blanks.rows[0].n, 0, "admit.blank-intent-key: …and no Work row carries a blank key");
});

test("w623.admit.origin the basis origin is a CLOSED set", async (t) => {
  if (await gateWork(t)) return;
  await assertPair(CLR.badRequest, REASON.invalidBasisOrigin,
    () => admitJournalWork({ client: A1(), author: BOB(), origin: "guessed" }), "admit.origin");
  // …and the chat lane's value is admitted, with its source ref carried through verbatim.
  const chat = await admitJournalWork({
    client: A1(), author: BOB(), origin: "clara_interpreted",
    sourceRefs: [{ kind: "chat_task", task_id: "t-1", session_id: "s-1" }],
  });
  const w = await workRow(chat.work_id);
  assert.equal(w.basis_origin, "clara_interpreted");
  assert.equal(w.source_refs[0].kind, "chat_task", "admit.origin: the chat provenance survives");
});

// ===========================================================================================
// 3 · The run lifecycle — claim CAS, settle mapping, and the status mirror.
// ===========================================================================================

test("w623.claim.cas the first claim binds; a second under a DIFFERENT run id does not", async (t) => {
  if (await gateWork(t)) return;
  const w = await admitJournalWork({ client: A1(), author: BOB() });
  const runId = `run-${Date.now().toString(36)}`;

  const first = await claimWorkRun({ task: w.task_id, runId });
  assert.equal(first.claimed, true, "claim.cas: the first claim wins");
  assert.equal((await taskRow(w.task_id)).status, "running");
  assert.equal((await taskRow(w.task_id)).workflow_run_id, runId, "claim.cas: …and binds the run id");
  const work = await workRow(w.work_id);
  assert.equal(work.status, "running", "claim.cas: the Work follows its run");
  assert.equal(work.bundle.id, "clara-work/v1", "claim.cas: the run records its bundle identity (C88.8)");
  assert.equal(work.bundle.digest, defaultBundle().digest);

  const other = await claimWorkRun({ task: w.task_id, runId: `${runId}-other` });
  assert.equal(other.claimed, false, "claim.cas: a SECOND engine run may not steal a bound task");
  assert.equal((await taskRow(w.task_id)).workflow_run_id, runId,
    "claim.cas: …and the original run id is preserved (C-35: old-run identity survives)");

  const same = await claimWorkRun({ task: w.task_id, runId });
  assert.equal(same.claimed, true, "claim.cas: the SAME run reclaiming after a crash is admitted");
});

test("w623.settle.map each outcome maps to the task status and error_code the contract states", async (t) => {
  if (await gateWork(t)) return;
  const cases = [
    ["completed", null, "completed", null, "completed"],
    ["refused", null, "failed", "tool_error", "refused"],
    ["failed", "limit", "failed", "limit", "failed"],
    ["expired", null, "expired", null, "expired"],
  ];
  for (const [outcome, errorCode, taskStatus, taskErr, workStatus] of cases) {
    const w = await admitJournalWork({ client: A1(), author: BOB() });
    await claimWorkRun({ task: w.task_id, runId: `run-${outcome}-${Date.now().toString(36)}` });
    const out = await settleWorkRun({
      task: w.task_id, outcome, errorCode,
      error: outcome === "completed" ? null : { code: outcome === "failed" ? "budget_exhausted" : "refused_by_wall", reason: "rig", message: "rig", recoverable: true },
      result: outcome === "completed" ? { entry_id: null, receipt_id: null } : null,
    });
    assert.equal(out.replayed, false, `settle.map(${outcome}): a first settle is not a replay`);
    const task = await taskRow(w.task_id);
    assert.equal(task.status, taskStatus, `settle.map(${outcome}): task status`);
    assert.equal(task.error_code, taskErr, `settle.map(${outcome}): task error_code`);
    const work = await workRow(w.work_id);
    assert.equal(work.status, workStatus, `settle.map(${outcome}): work status`);
    if (outcome !== "completed") {
      assert.ok(work.error?.code, `settle.map(${outcome}): the typed refusal is durable on the Work`);
    }
    // Idempotent: a re-settle of a terminal run replays rather than rewriting.
    const twice = await settleWorkRun({ task: w.task_id, outcome, errorCode });
    assert.equal(twice.replayed, true, `settle.map(${outcome}): a re-settle REPLAYS`);
    assert.equal((await taskRow(w.task_id)).status, taskStatus,
      `settle.map(${outcome}): …and does not move the task`);
  }
});

test("w623.settle.bad-outcome an unknown outcome and an illegal error_code are typed refusals", async (t) => {
  if (await gateWork(t)) return;
  const w = await admitJournalWork({ client: A1(), author: BOB() });
  await claimWorkRun({ task: w.task_id, runId: opk("run") });
  await assertPair(CLR.badRequest, REASON.invalidOutcome,
    () => settleWorkRun({ task: w.task_id, outcome: "finished" }), "settle.bad-outcome");
  await assertPair(CLR.badRequest, REASON.invalidErrorCode,
    () => settleWorkRun({ task: w.task_id, outcome: "failed", errorCode: "exploded" }), "settle.bad-error-code");
});

test("w623.mirror.parked open_interruption parks the task AND the Work follows to awaiting_input", async (t) => {
  if (await gateWork(t)) return;
  const w = await admitJournalWork({ client: A1(), author: BOB() });
  await claimWorkRun({ task: w.task_id, runId: opk("run") });
  // The estate's OWN parking door, unedited — that is the whole point of the mirror trigger.
  await rootQuery(
    "select clara.open_interruption($1::uuid, $2::text, $3::jsonb, $4::uuid)",
    [w.task_id, `hook-${opk("hk")}`, JSON.stringify({ type: "question", text: "which bank?" }), null]);
  assert.equal((await taskRow(w.task_id)).status, "awaiting_input");
  assert.equal((await workRow(w.work_id)).status, "awaiting_input",
    "mirror.parked: the Work is honest about being blocked without open_interruption being edited");
});

// ===========================================================================================
// 4 · Retry — a NEW run for the SAME Work, under the SAME logical identity (C-62).
// ===========================================================================================

test("w623.retry.new-run a refused Work retries into a new run keeping its logical identity", async (t) => {
  if (await gateWork(t)) return;
  const w = await admitJournalWork({ client: A1(), author: BOB() });
  await claimWorkRun({ task: w.task_id, runId: opk("run") });
  await settleWorkRun({ task: w.task_id, outcome: "refused", error: { code: "CLR19", reason: "write_into_closed_period", message: "rig", recoverable: true } });

  const key = opk("w623-retry");
  const again = await retryAccountingWork({ work: w.work_id, author: BOB(), opKey: key });
  assert.equal(again.work_id, w.work_id, "retry.new-run: the SAME Work");
  assert.equal(again.logical_op_id, w.logical_op_id,
    "retry.new-run: the logical operation identity SURVIVES the retry (C-62)");
  assert.notEqual(again.task_id, w.task_id, "retry.new-run: …on a NEW run");
  assert.equal(again.status, "queued");
  assert.equal((await tasksForWork(w.work_id)).length, 2, "retry.new-run: exactly two runs now");
  assert.equal((await workRow(w.work_id)).current_task_id, again.task_id);

  // Idempotent on the op key: the same retry request replays the same new run.
  const replay = await retryAccountingWork({ work: w.work_id, author: BOB(), opKey: key });
  assert.equal(replay.task_id, again.task_id, "retry.new-run: the same op key replays");
  assert.equal(replay.replayed, true);
  assert.equal((await tasksForWork(w.work_id)).length, 2, "retry.new-run: …and mints no third run");
});

test("w623.retry.guards a live Work is not retryable, and a blank op key is refused first", async (t) => {
  if (await gateWork(t)) return;
  const w = await admitJournalWork({ client: A1(), author: BOB() });
  await assertPair(CLR.badRequest, REASON.invalidOpKey,
    () => retryAccountingWork({ work: w.work_id, author: BOB(), opKey: "  " }), "retry.blank-key");
  const { detail } = await assertPair(CLR.conflict, REASON.notRetryable,
    () => retryAccountingWork({ work: w.work_id, author: BOB() }), "retry.live");
  assert.equal(detail.status, "queued", "retry.guards: the refusal names the state that blocked it");
  await assertPair(CLR.notFound, REASON.workNotFound,
    () => retryAccountingWork({ work: "00000000-0000-4000-8000-0000006230bb", author: BOB() }),
    "retry.absent");
  // A member of another firm never learns the Work exists.
  await assertPair(CLR.notFound, REASON.workNotFound,
    () => retryAccountingWork({ work: w.work_id, author: DAVE() }), "retry.cross-firm");
});

test("w623.task.kind the widened agent_tasks kind CHECK keeps every value it already carried", async (t) => {
  if (await gateWork(t)) return;
  const r = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
      where c.conrelid='clara.agent_tasks'::regclass and c.conname='ck_agent_tasks_kind_0011'`);
  const def = r.rows[0].def;
  for (const kind of ["chat_turn", "wake", "autodraft", "close_prep", "accounting_work"]) {
    assert.ok(def.includes(`'${kind}'`), `task.kind: the CHECK still admits ${kind} (got ${def})`);
  }
});
