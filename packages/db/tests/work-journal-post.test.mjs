// #623 — the COMMIT half of the accounting-work battery: `clara.wake_record_journal_entry`,
// its replay/conflict behaviour, its refusals, the agent-post receipt wall, and RLS.
// The admission and run-lifecycle half is `work-journal-admission.test.mjs`.
//
// CONTRACT-BLIND, frontier-gated on the `accounting_work_journal_successor$` stem.
//
// WHY EVERY POSITIVE FIXTURE RUNS UNDER A REAL `interactive_client` CREDENTIAL. #623's whole
// claim is that current role, client, period, account and control constraints are checked AT
// COMMIT under the initiator's LIVE authority — not against the snapshot admission took. A cell
// that called the core directly, or that used a plain `interactive` credential, would prove the
// arithmetic and none of the authority.
//
// A REFUSAL MUST LEAVE NOTHING BEHIND, and both halves are asserted every time: no journal rows
// (the entry count is unmoved) and no committed receipt. A verb that raised after writing a
// draft would pass a bare `assertRaises` and fail the estate.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gateWork, buildWorkWorld, endPool, printLaneNotes, printSkipCount, noteLane,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  basis, WCHART, REASON, CLR, BUNDLE_DIGEST, assertPair, assertRaises,
  rootQuery, humanQuery, opk, workRow, receiptsForWork, entriesForClient, linesOf,
  entryCount, committedReceiptCount, AGENT_USER_ID, ROLES, roleQuery, withTxnOrNull,
} from "./work-journal-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printLaneNotes("work-journal-post");
  printSkipCount("work-journal-post");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const B1 = () => world.clients.B1;
const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;
const CAROL = () => world.users.carol;
const DAVE = () => world.users.dave;

/** Admit a Work, claim its run, and mint the credential the run would hold. */
async function armed({ client = null, author = null, b = null } = {}) {
  const cli = client ?? A1();
  const who = author ?? BOB();
  const work = await admitJournalWork({ client: cli, author: who, basis: b ?? basis() });
  await claimWorkRun({ task: work.task_id, runId: opk("run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: who, client: cli });
  return { ...work, cred, client: cli, author: who, basis: b ?? basis() };
}

const post = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, ...over,
});

// ===========================================================================================
// 1 · The commit.
// ===========================================================================================

test("w623.post.happy ONE approved documentless entry, agent maker AND checker, ONE committed receipt", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  const before = await entryCount(A1());
  const out = await post(a);

  assert.equal(out.posted, true, "post.happy: posted");
  assert.equal(out.replayed, false);
  assert.ok(out.entry_id && out.receipt_id && out.revision_token, "post.happy: the receipt names the effect");
  assert.equal(out.logical_op_id, a.logical_op_id);
  assert.equal(await entryCount(A1()), before + 1, "post.happy: exactly ONE new entry");

  const entry = (await entriesForClient(A1())).find((e) => e.id === out.entry_id);
  assert.equal(entry.status, "approved", "post.happy: approved, not left as a draft to chase");
  assert.equal(entry.origin, "agent", "post.happy: the origin records who held the pen");
  assert.equal(entry.maker_actor, AGENT_USER_ID, "post.happy: agent maker");
  assert.equal(entry.checker_actor, AGENT_USER_ID, "post.happy: agent checker (attribution, not ceremony)");
  assert.equal(entry.document_id, null, "post.happy: NO document");
  assert.equal(entry.source_doc_sha256, null, "post.happy: …and NO fabricated document sha");
  assert.equal(entry.memo, a.basis.memo);
  assert.equal(entry.posting_date, a.basis.posting_date, "post.happy: the exact posting date, never a timezone-shifted one");

  const lines = await linesOf(out.entry_id);
  assert.equal(lines.length, 2, "post.happy: exactly the admitted lines");
  assert.equal(lines[0].account_code, WCHART.expense);
  assert.equal(String(lines[0].debit_cents), "120000", "post.happy: EXACT minor units, never a float");
  assert.equal(String(lines[0].credit_cents), "0");
  assert.equal(lines[1].account_code, WCHART.bank);
  assert.equal(String(lines[1].credit_cents), "120000");

  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts.length, 1, "post.happy: ONE operation receipt");
  const r = receipts[0];
  assert.equal(r.outcome, "committed");
  assert.equal(r.logical_op_id, a.logical_op_id);
  assert.equal(r.purpose, "journal_entry");
  assert.equal(r.acting_actor, AGENT_USER_ID, "post.happy: the agent acted…");
  assert.equal(r.on_behalf_of, BOB(), "post.happy: …under the human whose authority was rechecked");
  assert.equal(r.via_wake_kind, "interactive_client");
  assert.equal(r.bundle_digest, BUNDLE_DIGEST, "post.happy: the serving bundle rides the receipt (C88.8)");
  assert.equal(r.effects.entry_id, out.entry_id);
  assert.equal(r.task_id, (await workRow(a.work_id)).current_task_id,
    "post.happy: the receipt names the RUN that produced it");
  assert.match(r.payload_digest, /^[0-9a-f]{64}$/);
  assert.equal(r.refusal, null);

  // The wall: the entry carries EXACTLY ONE receipt across BOTH receipt tables.
  const wall = await rootQuery(
    `select (select count(*) from clara.entry_post_receipts p where p.entry_id=$1)
          + (select count(*) from clara.operation_receipts o
              where o.effects->>'entry_id' = $1::text and o.outcome='committed') as n`, [out.entry_id]);
  assert.equal(Number(wall.rows[0].n), 1,
    "post.happy: the agent-post receipt wall is satisfied by exactly one receipt, in one table");

  const w = await workRow(a.work_id);
  assert.equal(w.result.entry_id, out.entry_id, "post.happy: the Work carries its outcome");
  assert.equal(w.result.receipt_id, out.receipt_id);
});

test("w623.post.replay the SAME logical id + SAME basis returns the ORIGINAL receipt, no second entry", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  const first = await post(a);
  const n = await entryCount(A1());
  const again = await post(a, { runId: opk("run-2") });

  assert.equal(again.replayed, true, "post.replay: a re-executed step replays");
  assert.equal(again.posted, true);
  assert.equal(again.entry_id, first.entry_id, "post.replay: the SAME journal entry");
  assert.equal(again.receipt_id, first.receipt_id, "post.replay: the SAME receipt");
  assert.equal(await entryCount(A1()), n, "post.replay: entry count UNCHANGED");
  assert.equal((await receiptsForWork(a.work_id)).length, 1, "post.replay: still ONE receipt");
  noteLane("post.replay: the second call carries a DIFFERENT run id on purpose — replay is keyed on the "
    + "logical operation identity and the payload, never on which engine run is holding the pen (C-62)");
});

test("w623.post.conflict the SAME logical id + a DIFFERENT basis is a typed conflict with no effect", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await post(a);
  const n = await entryCount(A1());
  const receipts = (await receiptsForWork(a.work_id)).length;

  const { detail } = await assertPair(CLR.badRequest, REASON.operationConflict,
    () => post(a, { basis: basis({ cents: 999900 }) }), "post.conflict");
  assert.equal(detail.logical_op_id, a.logical_op_id,
    "post.conflict: the detail names WHICH identity conflicted — a bare message is not classifiable");
  assert.equal(await entryCount(A1()), n, "post.conflict: NO second entry");
  assert.equal((await receiptsForWork(a.work_id)).length, receipts, "post.conflict: NO second receipt");
});

test("w623.post.canonical the digest survives key ORDER and memo whitespace — the runtime never computes one", async (t) => {
  if (await gateWork(t)) return;
  // THE SEAM THIS PROVES. The runtime echoes the basis back from its own TypeScript object, so
  // the key order and the exact spacing of what reaches the DB are NOT under the DB's control.
  // If the digest were taken over the raw text, an honest echo would read as `basis_mismatch`
  // and every posting would fail for a reason nobody could see. The canonicalisation is what
  // makes "the runtime must NOT need to recompute the digest" true.
  const a = await armed();
  const b = a.basis;
  const reordered = {
    lines: b.lines.map((l) => ({
      description: l.description, credit_cents: l.credit_cents,
      debit_cents: l.debit_cents, account_code: `  ${l.account_code}  `,
    })),
    currency: "myr",
    memo: `  ${b.memo}  `,
    posting_date: b.posting_date,
  };
  const out = await post(a, { basis: reordered });
  assert.equal(out.posted, true,
    "post.canonical: a key-reordered, whitespace-padded, lower-cased-currency echo of the SAME "
    + "accounting act is the same act");
  const lines = await linesOf(out.entry_id);
  assert.equal(lines[0].account_code, WCHART.expense,
    "post.canonical: …and the account code lands TRIMMED, not with the padding it arrived with");
});

test("w623.wall.fires the widened receipt wall ABORTS a #623 post whose operation receipt is suppressed", async (t) => {
  if (await gateWork(t)) return;
  // THE POSITIVE CONTROL. Every other cell here proves the wall LETS THE RIGHT THING THROUGH,
  // which is exactly what a wall widened into uselessness would also do. This one removes the
  // receipt inside the same transaction and requires the COMMIT to fail: either the append-only
  // belt refuses the delete, or the deferred wall aborts at commit. Both answer CLR08, and the
  // cell records which it saw rather than accepting any error.
  const a = await armed();
  const before = await entryCount(A1());
  const out = await withTxnOrNull(async (c) => {
    await c.query("set role clara_wake_interactive");
    await c.query("select set_config('clara.wake_secret',$1,true)", [a.cred.secret]);
    await c.query(
      "select clara.wake_record_journal_entry(p_client => $1::uuid, p_work => $2::uuid, "
      + "p_logical_op_id => $3::text, p_basis => $4::jsonb, p_bundle_digest => $5::text, "
      + "p_run_id => $6::text, p_rationale => $7::text)",
      [a.client, a.work_id, a.logical_op_id, JSON.stringify(a.basis), BUNDLE_DIGEST,
        opk("run"), "wall.fires"]);
    await c.query("reset role");
    await c.query("delete from clara.operation_receipts where logical_op_id=$1", [a.logical_op_id]);
    return "deleted";
  });
  assert.ok(out?.error,
    `wall.fires: the transaction FAILED (append-only refusal, or the deferred wall at COMMIT) — got ${JSON.stringify(out)}`);
  assert.equal(out.error.code, CLR.immutable,
    `wall.fires: …with CLR08 (got ${out.error.code}: ${out.error.message})`);
  noteLane(`wall.fires: answered by "${out.error.message.slice(0, 90)}"`);
  assert.equal(await entryCount(A1()), before,
    "wall.fires: and NO journal entry survived — a commit-time abort rolls the whole post back");
});

// ===========================================================================================
// 2 · The refusals. Each asserts the typed pair AND that nothing durable was written.
// ===========================================================================================

/** Run `fn`, expect (code, reason), and prove the client's books are untouched. */
async function refuses(client, code, reason, fn, label) {
  const entries = await entryCount(client);
  const receipts = await committedReceiptCount(client);
  const out = await assertPair(code, reason, fn, label);
  assert.equal(await entryCount(client), entries, `${label}: NO journal rows were written`);
  assert.equal(await committedReceiptCount(client), receipts, `${label}: NO committed receipt was written`);
  return out;
}

test("w623.post.obo-revoked authority is rechecked AT COMMIT, not read off the admission snapshot", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
    [BOB(), FIRM_A()]);
  try {
    // A removed on_behalf_of makes the credential itself unresolvable (wake_context's own
    // liveness predicate), so the door answers "no valid wake credential" — a STRONGER refusal
    // than an authority check inside the verb, and the cell says which door answered.
    const out = await refuses(A1(), CLR.wake, REASON.noWakeCredential, () => post(a), "post.obo-removed");
    noteLane(`post.obo-removed: answered by ${JSON.stringify(out.detail)} — wake_context's liveness `
      + "predicate already refuses a credential whose on_behalf_of stopped being an active bookkeeper+");
  } finally {
    await rootQuery("update clara.firm_memberships set status='active' where user_id=$1 and firm_id=$2",
      [BOB(), FIRM_A()]);
  }
});

test("w623.post.obo-downgraded a bookkeeper demoted to viewer after admission may not post", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await rootQuery("update clara.firm_memberships set role='viewer' where user_id=$1 and firm_id=$2",
    [BOB(), FIRM_A()]);
  try {
    const out = await refuses(A1(), CLR.wake, REASON.noWakeCredential, () => post(a), "post.obo-viewer");
    noteLane(`post.obo-viewer: answered by ${JSON.stringify(out.detail)} — the same liveness predicate `
      + "carries the bookkeeper+ floor, so a demotion invalidates the live credential outright");
  } finally {
    await rootQuery("update clara.firm_memberships set role='bookkeeper' where user_id=$1 and firm_id=$2",
      [BOB(), FIRM_A()]);
  }
});

test("w623.post.client-inactive an archived client refuses the commit", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed({ client: A2(), author: ALICE() });
  await rootQuery("update clara.clients set status='archived' where id=$1", [A2()]);
  try {
    await refuses(A2(), CLR.badRequest, REASON.clientInactive, () => post(a), "post.client-inactive");
  } finally {
    await rootQuery("update clara.clients set status='active' where id=$1", [A2()]);
  }
});

test("w623.post.closed-period a closed fiscal year refuses the posting date", async (t) => {
  if (await gateWork(t)) return;
  // A DEDICATED client. `clara.fiscal_years` is append-only, so a closed year seeded here can
  // never be cleaned up — and left on a shared client it would silently close the period out
  // from under every later cell in this file. The cell owns its own books instead.
  const cli = await freshWorkClient(ALICE(), "closedfy");
  const a = await armed({ client: cli, author: ALICE() });
  const seeded = await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
     values((select firm_id from clara.clients where id=$1),$1,'w623 closed FY','2026-01-01','2026-12-31',1,'closed','asserted',$2)
     returning id`, [cli, ALICE()]);
  assert.ok(seeded.rows[0]?.id,
    "post.closed-period: mandatory setup — without a genuinely closed FY the pair is unproven");
  await refuses(cli, CLR.period, REASON.closedPeriod, () => post(a), "post.closed-period");
});

test("w623.post.unknown-account an absent and an INACTIVE account are both refused, by name", async (t) => {
  if (await gateWork(t)) return;
  const absent = await armed({ b: basis({ debitAccount: "9999-nope" }) });
  const g1 = await refuses(A1(), CLR.badRequest, REASON.unknownAccount, () => post(absent), "post.unknown-account");
  assert.equal(g1.detail.account_code, "9999-nope", "post.unknown-account: the detail names the code");

  const retired = await armed({ b: basis({ debitAccount: WCHART.retired }) });
  const g2 = await refuses(A1(), CLR.badRequest, REASON.unknownAccount, () => post(retired), "post.inactive-account");
  assert.equal(g2.detail.account_code, WCHART.retired,
    "post.inactive-account: a DEACTIVATED account is not a postable account");
});

test("w623.post.control-leg a generic journal may not carry an AR/AP control leg", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed({ b: basis({ debitAccount: WCHART.receivable }) });
  const out = await refuses(A1(), CLR.badRequest, REASON.genericControlLeg, () => post(a), "post.control-leg");
  assert.equal(out.detail.account_code, WCHART.receivable,
    "post.control-leg: the detail names the offending leg — an open item is a claim about who owes what, "
    + "and a documentless generic basis is the weakest anchor in the estate");
});

test("w623.post.basis-mismatch a run may not post something other than the ADMITTED basis", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await refuses(A1(), CLR.badRequest, REASON.basisMismatch,
    () => post(a, { basis: basis({ memo: "a memo nobody admitted" }) }), "post.basis-mismatch");
  // The narrowest possible edit — one cent — must answer the same way.
  await refuses(A1(), CLR.badRequest, REASON.basisMismatch,
    () => post(a, { basis: basis({ cents: 120001 }) }), "post.basis-mismatch(one cent)");
});

test("w623.post.logical-mismatch a logical id that is not this Work's is refused", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await refuses(A1(), CLR.badRequest, REASON.logicalOpMismatch,
    () => post(a, { logicalOpId: `work:${a.work_id}:journal_entry:2` }), "post.logical-mismatch");
});

test("w623.post.pinned-elsewhere a credential pinned to ANOTHER client cannot post here", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  const elsewhere = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client: A2() });
  await refuses(A1(), CLR.notFound, REASON.credentialClientPin,
    () => wakeRecordJournalEntry(elsewhere.secret, {
      client: A1(), work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis }),
    "post.pinned-elsewhere");
});

test("w623.post.wrong-kind a plain `interactive` credential is refused — the pin IS the authority", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  const plain = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client: null, kind: "interactive" });
  await refuses(A1(), CLR.wake, REASON.wrongWakeKind,
    () => wakeRecordJournalEntry(plain.secret, {
      client: A1(), work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis }),
    "post.wrong-kind");
});

test("w623.post.no-credential the door refuses without any wake credential at all", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await refuses(A1(), CLR.wake, REASON.noWakeCredential,
    () => wakeRecordJournalEntry("not-a-secret", {
      client: A1(), work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis }),
    "post.no-credential");
});

test("w623.post.foreign-work a Work belonging to another client is not found", async (t) => {
  if (await gateWork(t)) return;
  const mine = await armed();
  const other = await admitJournalWork({ client: A2(), author: ALICE() });
  await refuses(A1(), CLR.notFound, REASON.workNotFound,
    () => post(mine, { work: other.work_id, logicalOpId: other.logical_op_id }), "post.foreign-work");
});

test("w623.post.blank-inputs a blank logical id, rationale, run id or bundle digest is refused", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await refuses(A1(), CLR.badRequest, REASON.invalidOpKey, () => post(a, { logicalOpId: "   " }),
    "post.blank-logical-id");
  for (const [field, over] of [["rationale", { rationale: "  " }], ["run_id", { runId: " " }],
    ["bundle_digest", { bundleDigest: "" }]]) {
    const out = await refuses(A1(), CLR.badRequest, "invalid_request", () => post(a, over),
      `post.blank(${field})`);
    assert.equal(out.detail.class, field, `post.blank(${field}): the detail names which input was blank`);
  }
});

// ===========================================================================================
// 3 · RLS — the reads the web will do.
// ===========================================================================================

test("w623.rls.firm a member of firm A cannot select firm B's work or receipts", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await post(a);
  const far = await admitJournalWork({ client: B1(), author: DAVE() });

  const mine = await humanQuery(BOB(), "select id from clara.accounting_work order by created_at");
  const ids = mine.rows.map((r) => r.id);
  assert.ok(ids.includes(a.work_id), "rls.firm: a firm-A member sees firm A's Work");
  assert.ok(!ids.includes(far.work_id), "rls.firm: …and never firm B's");

  const theirs = await humanQuery(DAVE(), "select id from clara.accounting_work order by created_at");
  assert.ok(!theirs.rows.map((r) => r.id).includes(a.work_id), "rls.firm: and the far side is blind too");

  const rec = await humanQuery(BOB(),
    "select firm_id from clara.operation_receipts");
  const firms = new Set(rec.rows.map((r) => r.firm_id));
  assert.deepEqual([...firms].filter((f) => f !== FIRM_A()), [],
    "rls.firm: a member reads receipts of their own firm and no other");
  const farRec = await humanQuery(DAVE(), "select count(*)::int as n from clara.operation_receipts");
  assert.equal(farRec.rows[0].n, 0, "rls.firm: firm B sees none of firm A's receipts");
});

test("w623.rls.viewer a viewer reads the Work — the READ predicate is journal_entries' own", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  await post(a);
  const viewer = await humanQuery(CAROL(), "select id from clara.accounting_work where id=$1", [a.work_id]);
  const entries = await humanQuery(CAROL(),
    "select id from clara.journal_entries where client_id=$1 limit 1", [A1()]);
  assert.equal(viewer.rowCount, entries.rowCount === 0 ? 0 : 1,
    "rls.viewer: accounting_work is readable exactly where journal_entries is — the SAME predicate, "
    + "not a narrower or wider one invented for this table");
  noteLane("rls.viewer: the estate's read model is FIRM-SCOPED — `p_journal_entries_human` is "
    + "`firm_id = clara.jwt_firm()` with NO per-client clause, and there is no client-access table "
    + "anywhere in the schema. So 'a member without access to that client' is not a state this "
    + "estate can represent, and #623 does not invent one. Reported as a finding, not tested as a wall.");
});

test("w623.rls.no-write no application role may write either new table directly", async (t) => {
  if (await gateWork(t)) return;
  const roles = ["clara_authenticated", "clara_agent_ro", "clara_runtime",
    "clara_wake_interactive", "clara_wake_proactive"];
  const bad = [];
  for (const role of roles) {
    for (const table of ["accounting_work", "operation_receipts"]) {
      for (const priv of ["insert", "update", "delete"]) {
        const r = await rootQuery("select has_table_privilege($1, $2, $3) as ok",
          [role, `clara.${table}`, priv]);
        if (r.rows[0].ok) bad.push(`${role} ${priv} ${table}`);
      }
    }
  }
  assert.deepEqual(bad, [], "rls.no-write: the verbs are the only door");
});

test("w623.receipt.append-only a committed receipt cannot be updated or deleted", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  const out = await post(a);
  await assertRaises(CLR.immutable,
    () => rootQuery("update clara.operation_receipts set outcome='refused' where id=$1", [out.receipt_id]),
    "receipt.append-only(update)");
  await assertRaises(CLR.immutable,
    () => rootQuery("delete from clara.operation_receipts where id=$1", [out.receipt_id]),
    "receipt.append-only(delete)");
});

test("w623.work.immutable the identity columns of a Work never move after admission", async (t) => {
  if (await gateWork(t)) return;
  const a = await armed();
  // `purpose` is probed with a value that is genuinely DIFFERENT. Writing it to itself is not a
  // change and the trigger is right not to raise; the CHECK behind it admits exactly one value,
  // so both doors are shut and the trigger (BEFORE UPDATE) is the one that answers first.
  for (const [col, value] of [["purpose", "'something_else'"], ["intent_key", "'moved'"],
    ["logical_op_id", "'work:x:journal_entry:1'"], ["basis_digest", `'${"b".repeat(64)}'`],
    ["basis_origin", "'clara_interpreted'"], ["initiator", `'${AGENT_USER_ID}'`],
    ["client_id", `'${A2()}'`]]) {
    await assertRaises(CLR.immutable,
      () => rootQuery(`update clara.accounting_work set ${col}=${value} where id=$1`, [a.work_id]),
      `work.immutable(${col})`);
  }
  // …while the mutable half still moves, or the trigger would have frozen the lifecycle.
  await rootQuery("update clara.accounting_work set status='stopping' where id=$1", [a.work_id]);
  assert.equal((await workRow(a.work_id)).status, "stopping",
    "work.immutable: status is deliberately NOT frozen — the Work has a lifecycle");
  await rootQuery("update clara.accounting_work set status='running' where id=$1", [a.work_id]);
  const closed = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
      where c.conrelid='clara.accounting_work'::regclass and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%purpose%'`);
  assert.match(closed.rows[0].def, /journal_entry/,
    "work.immutable: …and the CHECK behind the trigger admits exactly the one purpose this ticket ships");
});

test("w623.wall.allowlist the wake verb is reachable by exactly one kind and one role", async (t) => {
  if (await gateWork(t)) return;
  const rows = await rootQuery(
    "select wake_kind from clara.wake_fn_allowlist where function_name='wake_record_journal_entry' order by 1");
  assert.deepEqual(rows.rows.map((r) => r.wake_kind), ["interactive_client"],
    "wall.allowlist: exactly ONE allowlist row, on the pinned chat kind");
  const who = await rootQuery(
    `select coalesce(array_agg(g order by g),'{}'::text[]) as roles from (
       select distinct (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end)::text as g
         from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        where f.oid='clara.wake_record_journal_entry(uuid,uuid,text,jsonb,text,text,text)'::regprocedure
          and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) q`);
  assert.deepEqual(who.rows[0].roles, ["clara_wake_interactive"],
    "wall.allowlist: EXECUTE reaches the write pool's group role and nothing else");
  const core = await rootQuery(
    `select coalesce(array_agg(g order by g),'{}'::text[]) as roles from (
       select distinct (case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end)::text as g
         from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        where f.proname='_record_journal_entry_core' and f.pronamespace='clara'::regnamespace
          and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) q`);
  assert.deepEqual(core.rows[0].roles, [],
    "wall.allowlist: the core has NO alternate entry point — the wrapper is the only door");
});

test("w623.runtime.grants the four runtime verbs reach clara_runtime and no wake or human role", async (t) => {
  if (await gateWork(t)) return;
  const verbs = ["admit_journal_work", "retry_accounting_work", "claim_work_run", "settle_work_run"];
  const bad = [];
  for (const verb of verbs) {
    for (const role of ["clara_runtime", "clara_authenticated", "clara_agent_ro",
      "clara_wake_interactive", "clara_wake_proactive"]) {
      const r = await rootQuery(
        `select bool_or(has_function_privilege($1, p.oid, 'execute')) as ok from pg_proc p
          where p.proname=$2 and p.pronamespace='clara'::regnamespace`, [role, verb]);
      const want = role === "clara_runtime";
      if (r.rows[0].ok !== want) bad.push(`${role} EXECUTE ${verb}: expected ${want}, got ${r.rows[0].ok}`);
    }
  }
  assert.deepEqual(bad, [], "runtime.grants: the admission lane is the runtime's alone");
  // …and no wake role can reach the runtime lane by SET ROLE either (the estate's own posture).
  const leak = await roleQuery(ROLES.wakeInteractive,
    "select has_function_privilege('clara_wake_interactive', 'clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)', 'execute') as ok");
  assert.equal(leak.rows[0].ok, false, "runtime.grants: the wake lane never admits its own work");
});
