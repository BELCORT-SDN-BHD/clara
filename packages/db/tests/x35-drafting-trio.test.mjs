// 0035_drafting_trio.sql -- the drafting-trio DB half (ledger #21 + #34).
//
// SECTION A (#21): an advisory approve-time warning when a supplier_bill approves
// with no counterparty bound. SECTION B (#34): the CLR23 counterparty-landscape-
// changed remedy text now points at a real path (withdraw + re-draft) instead of
// "revise the draft", a verb no lane the system ships can actually perform.
//
// HONEST NOTE (see the migration's own header for the full investigation, including
// an O-round Codex confirmation pass that found a real correction to an earlier,
// overclaimed draft of this note -- reproduced directly before accepting it). For the
// ORDINARY shape (a supplier_bill draft carrying an actual payable/receivable line),
// Section A's advisory branch is unreachable: the SHAPE GUARD (clara.
// _assert_supplier_bill_shape_at's unconditional "every control-class line requires a
// counterparty" refusal, reinforced by the independent deferred constraint trigger
// t_je_supplier_bill_shape) refuses first, for every coding_kind, and the whole
// transaction aborts before any return -- x35.b locks that boundary in. But Section A
// IS reachable via direct row construction that exploits a real gap: clara.
// _assert_supplier_bill_shape_at's supplier_bill-SPECIFIC checks are all gated
// `and e.reversal_of is null`, so a row with coding_kind='supplier_bill',
// reversal_of set, and ZERO control-class lines at all satisfies the one
// unconditional check vacuously and reaches Section A's branch for real -- x35.c
// exercises this exact counterexample end-to-end (approval succeeds, the warning
// persists in both the receipt and the audit row, and a same-op-key retry replays
// the identical cached receipt).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk,
  rootQuery,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  CLR23,
  upsertPayableAccount,
  draftEntryV3,
  approveEntry,
  billLines,
  freshResolution,
} from "./s6-helpers.mjs";

let ready = false;
let world = null;
const AP = "409-000"; // a fresh payable code, distinct from other suites sharing the cluster

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    ready = await has0035();
  }
  if (ready) {
    world = await buildWorld();
    await upsertPayableAccount(world.users.alice, { client: world.clients.A1, code: AP, name: "Trade Creditors (x35)", opKey: opk("ap") });
  }
});
after(async () => {
  printLaneNotes("x35-drafting-trio");
  await endPool();
});

async function has0035() {
  const r = await rootQuery("select 1 from clara.schema_migrations where version = '0035_drafting_trio'");
  return r.rowCount === 1;
}

function unready(t) {
  if (!ready) {
    t.skip("0035 not applied, or the Slice-6 counterparty surface is not ready");
    return true;
  }
  return false;
}

async function vendorDraft(sub, { client, vendor, amount = 50000, memo = "x35 vendor draft" }) {
  return draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "manual", subjectId: null }), memo,
    lines: billLines(world.coa.A1.expense, AP, amount),
    vendor, opKey: opk("x35-vd"),
  });
}

// ===========================================================================
// x35.a -- SECTION B: the CLR23 counterparty-landscape-changed refusal now
// carries the real remedy text, not "revise the draft".
// ===========================================================================
test("x35.a section B: counterparty-landscape-changed refusal carries the new remedy text, still CLR23", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const reg = "201900000135";
  // d1 proposes a NEW vendor (fingerprint decision=birth) -- not approved yet.
  const d1 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "X35 LANDSCAPE CO", registration_no: reg } } });
  // d2 proposes the SAME vendor and is approved first -> births it, so a fresh
  // re-resolution of d1's proposal now decides registration_match, not birth.
  const d2 = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "X35 LANDSCAPE CO", registration_no: reg } } });
  await approveEntry(sub, { entry: d2.entry_id, expectedRevision: d2.revision_token, opKey: opk("x35-ap") });

  let caught = null;
  try {
    await approveEntry(sub, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("x35-ap") });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "the stale-fingerprint approve must be refused, not succeed");
  assert.equal(caught.code, CLR23, `expected CLR23, got ${caught.code} (${caught.message})`);
  // Exact equality, not .includes() -- an .includes() check would still pass if
  // extra or altered text were prepended/appended around the expected phrase
  // (an O-round Codex finding). The live message carries no DETAIL suffix for
  // this refusal, so the raised message IS the full remedy text.
  assert.equal(
    caught.message,
    "counterparty match landscape changed; withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape",
    `refusal message must be exactly the new remedy text -- got: ${caught.message}`,
  );
});

// ===========================================================================
// x35.b -- THE BOUNDARY THIS TEST LOCKS: for an ORDINARY supplier_bill (one
// carrying an actual control-class line whose counterparty_id is null),
// Section A's conditional DOES execute (v_no_cp_warning gets assigned -- it is
// not skipped or short-circuited), but the LATER, unconditional shape guard
// (clara._assert_supplier_bill_shape_at's "every control-class line requires a
// counterparty" refusal) aborts the whole transaction before the function ever
// returns, so no warning-bearing receipt or audit row is ever persisted for
// THIS shape. The shape guard is the control; Section A's advisory sits
// entirely behind it, for any entry that carries a control-class line at all.
// Built via a direct row insert (bypassing every draft-time verb) so nothing
// upstream can quietly start stamping a counterparty and mask a future
// loosening of the shape guard itself.
// ===========================================================================
test("x35.b the shape guard aborts before persisting, even though Section A's conditional runs, for an ordinary control-class-bearing supplier_bill", async (t) => {
  if (unready(t)) return;
  const { firms, clients, users, coa } = world;
  const firm = firms.A;
  const client = clients.A1;

  // A single CTE-chained statement -- all three inserts (the entry + both lines)
  // commit as ONE transaction, so the deferred t_je_balance constraint trigger
  // fires once, at the end, after every line already exists. Three separate
  // rootQuery calls would each autocommit independently, tripping CLR07
  // "unbalanced (debit=0 credit=0)" on the entry-only insert before any line
  // was ever written.
  const rev = (
    await rootQuery(
      `with e as (
         insert into clara.journal_entries
           (id, firm_id, client_id, status, coding_kind, posting_date, memo, origin, maker_actor, revision_token)
         values (gen_random_uuid(), $1, $2, 'draft', 'supplier_bill', '2026-03-15', 'x35.b probe entry', 'manual', $3, gen_random_uuid())
         returning id, revision_token
       ), l1 as (
         insert into clara.journal_lines (entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents, counterparty_id)
         select e.id, 1, $2, $1, $4, 50000, 0, null from e
       ), l2 as (
         insert into clara.journal_lines (entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents, counterparty_id)
         select e.id, 2, $2, $1, $5, 0, 50000, null from e
       )
       select id, revision_token from e`,
      [firm, client, users.alice, coa.A1.expense, AP],
    )
  ).rows[0];
  const entry = rev.id;
  // A later AFTER-INSERT trigger (or the balance/provenance constraint triggers
  // firing at statement end) can leave the RETURNING clause's revision_token
  // stale relative to the row's final committed value -- re-select fresh,
  // exactly as the earlier scratch investigation for this same shape found.
  const freshRevisionToken = (
    await rootQuery("select revision_token from clara.journal_entries where id=$1", [entry])
  ).rows[0].revision_token;

  let caught = null;
  try {
    await approveEntry(users.alice, { entry, expectedRevision: freshRevisionToken, opKey: opk("x35-noshape") });
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, "a payable line with no counterparty must be refused, not silently approved");
  assert.equal(caught.code, CLR23, `expected CLR23, got ${caught.code} (${caught.message})`);
  assert.ok(
    caught.message.includes("every control-class line requires a counterparty"),
    `expected the shape check's refusal message -- got: ${caught.message}`,
  );
  // Nothing persisted -- proving the abort is total, even though Section A's own
  // conditional (v_no_cp_warning := ...) already ran before the shape guard fired.
  const auditRow = (
    await rootQuery(`select 1 from clara.audit_log where fn='approve_entry' and entry_id=$1`, [entry])
  ).rows[0];
  assert.equal(auditRow, undefined, "the aborted transaction must leave no audit_log row at all");
  const stillDraft = (
    await rootQuery(`select status from clara.journal_entries where id=$1`, [entry])
  ).rows[0].status;
  assert.equal(stillDraft, "draft", "the entry must remain a draft -- the abort is total, not partial");
  noteLane("x35.b: for an ordinary control-class-bearing supplier_bill, Section A's conditional runs (v_no_cp_warning gets assigned) but the LATER shape guard (clara._assert_supplier_bill_shape_at's unconditional counterparty-required refusal, reinforced by the deferred trigger t_je_supplier_bill_shape) aborts the whole transaction before any return -- no audit row, no warning, the entry stays draft. The shape guard is the control; Section A's advisory sits entirely behind it FOR THIS SHAPE. It is reachable for a different shape -- see x35.c's reversal counterexample (an O-round Codex finding, reproduced directly).");
});

// ===========================================================================
// x35.c -- THE O-ROUND CODEX COUNTEREXAMPLE, real end-to-end: a directly
// constructed row (coding_kind='supplier_bill', reversal_of set to an existing
// approved entry, ZERO control-class lines at all) satisfies clara.
// _assert_supplier_bill_shape_at's one unconditional check VACUOUSLY (nothing
// to check) and skips every other supplier_bill guard because reversal_of is
// not null -- so it reaches clara._approve_entry_core's v_counterparty
// fallback with no payable/receivable line to read from at all, leaving
// v_counterparty null. Section A's branch fires for real: the approval
// SUCCEEDS and the warning PERSISTS in both the receipt and the audit row.
// No sanctioned lane produces this shape today (clara.reverse_entry never
// copies coding_kind onto its mirror row), but it is reachable via the same
// direct-row-construction technique x35.b itself relies on -- which is why
// this is Section A's genuine, narrow, PRESENT justification, not merely
// hypothetical defense-in-depth. Also proves the op_key/_reserve_op/
// _finish_op replay mechanics are undisturbed: a second call with the
// IDENTICAL op_key on the same (now-approved) entry short-circuits via the
// cached receipt, replaying the identical warning-bearing result rather than
// re-running the function body or refusing "not a draft".
// ===========================================================================
test("x35.c O-round counterexample: a reversal-shaped, control-class-free supplier_bill reaches Section A for real -- warning persists in receipt + audit, replay is exact", async (t) => {
  if (unready(t)) return;
  const { firms, clients, users, coa } = world;
  const firm = firms.A;
  const client = clients.A1;

  // A fake "original" entry for reversal_of to reference -- any approved entry
  // will do; coding_kind/status/lines of the original are irrelevant to the
  // counterexample, only its existence (and being firm/client-scoped) matters.
  const orig = (
    await rootQuery(
      `with e as (
         insert into clara.journal_entries
           (id, firm_id, client_id, status, coding_kind, posting_date, memo, origin, maker_actor, revision_token)
         values (gen_random_uuid(), $1, $2, 'draft', null, '2026-03-01', 'x35.c fake original', 'manual', $3, gen_random_uuid())
         returning id
       ), l1 as (
         insert into clara.journal_lines (entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents)
         select e.id, 1, $2, $1, $4, 700, 0 from e
       ), l2 as (
         insert into clara.journal_lines (entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents)
         select e.id, 2, $2, $1, $5, 0, 700 from e
       )
       select id from e`,
      [firm, client, users.alice, coa.A1.expense, coa.A1.sales],
    )
  ).rows[0].id;
  await rootQuery(`update clara.journal_entries set status='approved', checker_actor=$1, approved_at=now() where id=$2`, [users.alice, orig]);

  // The counterexample itself: coding_kind='supplier_bill', reversal_of=orig,
  // ZERO payable/receivable lines -- just two ordinary expense/income legs.
  const entry = (
    await rootQuery(
      `with e as (
         insert into clara.journal_entries
           (id, firm_id, client_id, status, coding_kind, posting_date, memo, origin,
            maker_actor, revision_token, reversal_of, reversal_reason)
         values (gen_random_uuid(), $1, $2, 'draft', 'supplier_bill', '2026-03-15',
           'x35.c counterexample', 'manual', $3, gen_random_uuid(), $6, 'x35.c probe')
         returning id
       ), l1 as (
         insert into clara.journal_lines (entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents)
         select e.id, 1, $2, $1, $4, 500, 0 from e
       ), l2 as (
         insert into clara.journal_lines (entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents)
         select e.id, 2, $2, $1, $5, 0, 500 from e
       )
       select id from e`,
      [firm, client, users.alice, coa.A1.expense, coa.A1.sales, orig],
    )
  ).rows[0].id;
  const revisionToken = (
    await rootQuery(`select revision_token from clara.journal_entries where id=$1`, [entry])
  ).rows[0].revision_token;

  const opKey = opk("x35-reversal-counterexample");
  const expectedWarning = { code: "no_counterparty_sighting", message: "no sighting recorded - this approval builds no autopost history" };

  const result = await approveEntry(users.alice, { entry, expectedRevision: revisionToken, opKey });
  assert.equal(result.status, "approved", "the counterexample must actually approve, not refuse");
  assert.deepEqual(result.warnings, [expectedWarning], "the receipt must carry the exact typed warning");

  const auditRow = (
    await rootQuery(`select args from clara.audit_log where fn='approve_entry' and entry_id=$1 order by id desc limit 1`, [entry])
  ).rows[0];
  assert.ok(auditRow, "an approve_entry audit row must exist");
  assert.deepEqual(auditRow.args.warning, expectedWarning, "the audit row must carry the exact typed warning too");

  // Replay: the SAME op_key on the SAME (already-approved) entry must return the
  // identical cached receipt via _reserve_op's dedupe path, not re-run the
  // function body (which would otherwise hit "entry is not a draft").
  const replay = await approveEntry(users.alice, { entry, expectedRevision: revisionToken, opKey });
  assert.deepEqual(replay, result, "a same-op-key retry must replay the identical cached receipt, warning included");

  noteLane("x35.c: the O-round Codex Medium finding reproduced directly -- a reversal-shaped, control-class-free supplier_bill reaches Section A for real. No sanctioned lane builds this shape today (clara.reverse_entry never copies coding_kind onto its mirror), but direct row construction does, exactly as x35.b's own technique does. Section A's justification is a genuine present safety net for this exact gap, not merely hypothetical defense-in-depth.");
});

// ===========================================================================
// x35.d -- human path byte-identical: a normal, counterparty-bound
// supplier_bill approval carries NO 'warnings' key at all (the key is absent,
// not an empty array) -- zero behavioral change for the common case.
// ===========================================================================
test("x35.d human path unchanged: a counterparty-bound approve carries no 'warnings' key", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const sub = users.alice;
  const d = await vendorDraft(sub, { client: clients.A1, vendor: { new: { name: "X35 BOUND CO", registration_no: "201900000246" } } });
  const result = await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x35-bound") });
  assert.equal(result.status, "approved", "the routine approve must still succeed");
  assert.ok(!("warnings" in result), `a counterparty-bound approve must carry no 'warnings' key at all -- got keys: ${Object.keys(result)}`);

  const auditRow = (
    await rootQuery(
      `select args from clara.audit_log where fn='approve_entry' and entry_id=$1 order by id desc limit 1`,
      [d.entry_id],
    )
  ).rows[0];
  assert.ok(auditRow, "an approve_entry audit row must exist for this entry");
  assert.ok(!("warning" in (auditRow.args ?? {})), `a counterparty-bound approve's audit record must carry no 'warning' key -- got: ${JSON.stringify(auditRow.args)}`);
});
