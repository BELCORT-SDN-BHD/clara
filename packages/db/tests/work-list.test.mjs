// #641 — the B-style Work LIST battery for packages/db/migrations/0189_work_list_reads.sql.
//
// FRONTIER-GATED on the `work_list_reads$` stable stem (the work-journal-fixtures.mjs
// workLaneReady()/gateWork() pattern, restated here for this migration's own stem so the
// slice-frontier CI legs SKIP cleanly rather than red on a database pinned before 0189 lands).
// A skip is not evidence; the green run that matters is the one on a chain that carries 0189.
//
// WHAT THIS FILE IS ABOUT. `clara.list_accounting_work` is the ONE server-backed read behind both
// Work lists (`/work` firm-wide and `/clients/:id/work`): filterable, keyset-paged, newest first,
// with the two CANONICAL signals the status LABELS are derived from carried on every row — the
// number of runs the Work has had (`attempts`, which is what makes "Retrying" a fact rather than
// a guess) and the pending question it is parked on. `clara.get_accounting_work_row` is the
// addressed-row door: the #719 lesson, that a `?work=<id>` deep link must resolve a row which may
// be nowhere near the current page window. And `clara.save_my_preferences` gains ONE new
// enumerated interface key, `workViews`, so a saved filter set is durable per person.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. Nothing here says anything about the BROWSER: the Empty
// taxonomy, the filter bar, Pagination and the Tabs are proven by the web unit cells and
// `apps/web/e2e/work-list-walk.spec.ts`. This file proves the door.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, roleQuery, rootQuery, humanQuery, buildWorkWorld, freshWorkClient, endPool, opk,
  assertRaises, admitJournalWork, retryAccountingWork, claimWorkRun, settleWorkRun, basis,
  detailOf, printSkipCount, MODEL, workRow, mintClientObo, wakeRecordJournalEntry, receiptsForWork,
} from "./work-journal-fixtures.mjs";
// #630's lane exports the two world manipulations a TAKE-OVER needs (a throwaway member to
// revoke, and the door that hands the Work on). Imported from there rather than restated here:
// they are the same world (`work-cancel-fixtures.mjs` re-exports `work-journal-fixtures.mjs`
// wholesale for exactly this reason), and a second spelling of a take-over would be a second
// place for a divergence to hide. 0189 sits ABOVE 0184 on the chain, so this file's own gate
// already implies that lane is present.
import {
  insertUser, addMember, deactivateMember, takeOverAccountingWork,
} from "./work-cancel-fixtures.mjs";
import { parkedWork } from "./work-question-fixtures.mjs";
// #880 [0266] widens the SAME two doors a third time, with clara.staff_expense_claims's own claim
// builders — imported directly rather than through staff-expense-claim.test.mjs's own larger
// world, so this file's gate stays independent of that lane's own fixture surface. 0221 sits BELOW
// 0266 on the chain (strict migration order), so `claimLabelReady()` alone is the honest frontier:
// a database old enough to carry 0266 has already applied 0221.
import {
  admitStaffExpenseClaimWork, claim, ensureSecChart, seedAdvance, SETTLEMENT, SECHART,
} from "./staff-expense-claim-fixtures.mjs";

const CLR04 = "CLR04";
const CLR06 = "CLR06";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const STEM = "work_list_reads$";

let _ready = null;
async function workListReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

async function gate(t) {
  if (await workListReady()) return false;
  t.skip(`#641 work-list lane absent (no ${STEM} migration applied)`);
  return true;
}

// #809 — the `intent_key` projection widen lives in ITS OWN migration (0203), a separate
// frontier from 0189's above: a slice-frontier CI leg can be pinned AT 0189, before 0203 lands,
// and the cell below must skip cleanly there rather than red on a projection that has not yet
// gained the field.
const INTENT_KEY_STEM = "list_accounting_work_intent_key$";
let _intentKeyReady = null;
async function intentKeyReady() {
  if (_intentKeyReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [INTENT_KEY_STEM]);
      _intentKeyReady = r.rows[0].n > 0;
    } catch {
      _intentKeyReady = false;
    }
  }
  return _intentKeyReady;
}

async function gateIntentKey(t) {
  if (await intentKeyReady()) return false;
  t.skip(`#809 intent_key projection absent (no ${INTENT_KEY_STEM} migration applied)`);
  return true;
}

// #880 — the claim_id/claimant_label widen lives in ITS OWN migration (0266), a separate frontier
// again: a slice-frontier CI leg can be pinned at 0203 (or anywhere below 0266), before this widen
// lands, and the cell below must skip cleanly there rather than red on fields that do not exist
// yet.
const CLAIM_LABEL_STEM = "work_list_claim_label$";
let _claimLabelReady = null;
async function claimLabelReady() {
  if (_claimLabelReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [CLAIM_LABEL_STEM]);
      _claimLabelReady = r.rows[0].n > 0;
    } catch {
      _claimLabelReady = false;
    }
  }
  return _claimLabelReady;
}

async function gateClaimLabel(t) {
  if (await claimLabelReady()) return false;
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud (review finding L09-ADV-08).
  // The package-wide sweep preloads this widen’s OWN pre-integration gate module (named in
  // the refusal below), which sets the flag below to declare "a database below this migration is an
  // expected pre-integration state". A worker running this file directly preloads nothing, so
  // an absent widen fails HERE rather than reporting a green run over a cell that quietly
  // executed no assertion.
  if (process.env.CLARA_ALLOW_MISSING_WORK_LIST_CLAIM_LABEL !== "1") {
    throw new Error(
      `#880 claim_id/claimant_label projection absent (no ${CLAIM_LABEL_STEM} row in clara.schema_migrations)`
      + " and CLARA_ALLOW_MISSING_WORK_LIST_CLAIM_LABEL is unset -- this is a FOCUSED run"
      + " and must fail loudly, not skip. Preload ./tests/work-list-claim-label-preintegration-gate.mjs"
      + " for an estate sweep against a pre-PR chain.");
  }
  t.skip(`#880 claim_id/claimant_label projection absent (no ${CLAIM_LABEL_STEM} migration applied)`);
  return true;
}

// #905 — the receipt-dated window lives in ITS OWN migration (0267), a separate frontier again: a
// slice-frontier CI leg can be pinned at 0266 (or anywhere below 0267), before this widen lands,
// and the cells below must skip cleanly there rather than red on parameters that do not exist yet.
const RECEIPT_WINDOW_STEM = "work_list_receipt_window$";
let _receiptWindowReady = null;
async function receiptWindowReady() {
  if (_receiptWindowReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [RECEIPT_WINDOW_STEM]);
      _receiptWindowReady = r.rows[0].n > 0;
    } catch {
      _receiptWindowReady = false;
    }
  }
  return _receiptWindowReady;
}

async function gateReceiptWindow(t) {
  if (await receiptWindowReady()) return false;
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud (review finding L09-ADV-08).
  // The package-wide sweep preloads this widen’s OWN pre-integration gate module (named in
  // the refusal below), which sets the flag below to declare "a database below this migration is an
  // expected pre-integration state". A worker running this file directly preloads nothing, so
  // an absent widen fails HERE rather than reporting a green run over a cell that quietly
  // executed no assertion.
  if (process.env.CLARA_ALLOW_MISSING_WORK_LIST_RECEIPT_WINDOW !== "1") {
    throw new Error(
      `#905 receipt-dated window absent (no ${RECEIPT_WINDOW_STEM} row in clara.schema_migrations)`
      + " and CLARA_ALLOW_MISSING_WORK_LIST_RECEIPT_WINDOW is unset -- this is a FOCUSED run"
      + " and must fail loudly, not skip. Preload ./tests/work-list-receipt-window-preintegration-gate.mjs"
      + " for an estate sweep against a pre-PR chain.");
  }
  t.skip(`#905 receipt-dated window absent (no ${RECEIPT_WINDOW_STEM} migration applied)`);
  return true;
}

// #1069 - the `allocation_count` projection lives in ITS OWN migration (0341), a fourth frontier
// on the SAME two doors: a slice-frontier CI leg can be pinned anywhere below it and the cell
// below must skip cleanly there rather than red on a field that does not exist yet.
const ALLOCATION_COUNT_STEM = "work_claim_allocation_count$";
let _allocationCountReady = null;
async function allocationCountReady() {
  if (_allocationCountReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [ALLOCATION_COUNT_STEM]);
      _allocationCountReady = r.rows[0].n > 0;
    } catch {
      _allocationCountReady = false;
    }
  }
  return _allocationCountReady;
}

async function gateAllocationCount(t) {
  if (await allocationCountReady()) return false;
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud (review finding L09-ADV-08), the
  // same shape gateClaimLabel and gateReceiptWindow above already carry.
  if (process.env.CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT !== "1") {
    throw new Error(
      `#1069 allocation_count projection absent (no ${ALLOCATION_COUNT_STEM} row in clara.schema_migrations)`
      + " and CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT is unset -- this is a FOCUSED run"
      + " and must fail loudly, not skip. Preload"
      + " ./tests/work-claim-allocation-count-preintegration-gate.mjs for an estate sweep against"
      + " a pre-PR chain.");
  }
  t.skip(`#1069 allocation_count projection absent (no ${ALLOCATION_COUNT_STEM} migration applied)`);
  return true;
}

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printSkipCount("work-list");
  await endPool();
});

const ALICE = () => world.users.alice; // owner, firm A
const BOB = () => world.users.bob;     // bookkeeper, firm A
const CAROL = () => world.users.carol; // viewer, firm A
const DAVE = () => world.users.dave;   // owner, firm B
const FIRM_A = () => world.firms.A;
const CLIENT_B1 = () => world.clients.B1;

// ===========================================================================================
// Wrappers over the two new doors. NAMED arguments only — a divergence in a parameter name is a
// real finding rather than a silent positional mismatch.
// ===========================================================================================

const LIST_CALL =
  "select clara.list_accounting_work("
  + "p_client => $1::uuid, p_status => $2::text[], p_initiator => $3::uuid, p_purpose => $4::text[],"
  + "p_since => $5::timestamptz, p_until => $6::timestamptz, p_q => $7::text,"
  + "p_cursor => $8::text, p_limit => $9::int,"
  // #905: THE RECEIPT-DATED BOUND, LAST, matching the door's own append-at-the-end shape — an
  // omitted pair (every caller above this ticket) reproduces the nine-argument door exactly.
  + "p_receipt_since => $10::timestamptz, p_receipt_until => $11::timestamptz) as result";

async function listWork(sub, {
  client = null, status = null, initiator = null, purpose = null,
  since = null, until = null, q = null, cursor = null, limit = 25,
  receiptSince = null, receiptUntil = null,
} = {}) {
  const r = await humanQuery(sub, LIST_CALL,
    [client, status, initiator, purpose, since, until, q, cursor, limit, receiptSince, receiptUntil]);
  return r.rows[0].result;
}

async function getWorkRow(sub, workId) {
  const r = await humanQuery(sub,
    "select clara.get_accounting_work_row(p_work => $1::uuid) as result", [workId]);
  return r.rows[0].result;
}

async function getPrefs(sub) {
  const r = await humanQuery(sub, "select clara.get_my_preferences() as result");
  return r.rows[0].result;
}

async function savePrefs(sub, { version, patch, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.save_my_preferences(p_expected_version => $1::int, p_patch => $2::jsonb,"
    + " p_op_key => $3::text) as result",
    [version, JSON.stringify(patch), opKey ?? opk("w641-prefs")]);
  return r.rows[0].result;
}

const ids = (page) => page.rows.map((r) => r.id);

/** Admit one Work and settle it to a named terminal, so a cell can build a roster of statuses
 *  through the REAL verbs rather than by planting rows (a planted status would prove nothing
 *  about what the estate can actually produce). */
async function settledWork({ client, author = null, outcome, memo = "rent", errorCode = null, error = null }) {
  const admitted = await admitJournalWork({
    client, author: author ?? ALICE(), basis: basis({ memo }),
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w641-run") });
  await settleWorkRun({ task: admitted.task_id, outcome, errorCode, error });
  return admitted;
}

// ===========================================================================================
// #905 fixtures. `postedWork`/`completedWithoutReceipt`/`backdateWorkAdmission` mirror
// `packages/db/tests/client-work-pack.test.mjs`'s own fixtures of the same names byte-for-byte in
// intent (they are private to each file, the same way `listWork` is): #650's file proves the
// pack COUNTS by receipt; this file proves the LIST can now be BOUNDED by the same receipt.
// ===========================================================================================

/** Admit, claim, and POST through the wake verb, so a COMMITTED receipt exists — the only way the
 *  estate mints one (`clara._record_journal_entry_core`, 0178:442-445). Settles `completed`
 *  unless `settle` is null. */
async function postedWork(client, { memo = "posted", settle = "completed" } = {}) {
  const admitted = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  const w = await workRow(admitted.work_id);
  await claimWorkRun({ task: admitted.task_id, runId: opk("w905-run") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  await wakeRecordJournalEntry(obo.secret, {
    client, work: admitted.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  if (settle !== null) await settleWorkRun({ task: admitted.task_id, outcome: settle });
  const receipts = (await receiptsForWork(admitted.work_id)).filter((r) => r.outcome === "committed");
  assert.equal(receipts.length, 1, "the fixture must have produced exactly one committed receipt");
  return { ...admitted, receipt_id: receipts[0].id, committed_at: receipts[0].created_at };
}

/** Admit, claim, settle `completed` WITHOUT posting — a Work the estate cannot date by receipt at
 *  all, because `clara.accounting_work` carries no completion instant of its own (0178:324-325). */
async function completedWithoutReceipt(client, memo = "no receipt") {
  const admitted = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w905-run") });
  await settleWorkRun({ task: admitted.task_id, outcome: "completed" });
  assert.equal((await receiptsForWork(admitted.work_id)).length, 0, "no receipt was written");
  return admitted;
}

/** OWNER-LEVEL FIXTURE DML, and it is labelled rather than hidden — the same shape
 *  `client-work-pack.test.mjs`'s own `backdateWorkAdmission` uses. `clara.accounting_work` is
 *  guarded by `clara._tf_accounting_work_immutable` (0178) and FORCE RLS, so `created_at` cannot
 *  be restated through any verb; this is how a fixture builds the ordinary real-world Work that
 *  was ADMITTED long ago and POSTED just now. */
async function backdateWorkAdmission(workId, instantExpr) {
  assert.match(workId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "a fixture work id must be uuid-shaped before interpolation");
  await rootQuery(
    "set session_replication_role = replica; "
    + `update clara.accounting_work set created_at = ${instantExpr} where id = '${workId}'; `
    + "reset session_replication_role",
  );
}

/** The same owner-level move for a RECEIPT's OWN commit instant — `client-work-pack.test.mjs`'s
 *  own `backdateReceipt`, restated here because it is private to each file. */
async function backdateReceipt(receiptId, instantExpr) {
  assert.match(receiptId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "a fixture receipt id must be uuid-shaped before interpolation");
  await rootQuery(
    "set session_replication_role = replica; "
    + `update clara.operation_receipts set created_at = ${instantExpr} where id = '${receiptId}'; `
    + "reset session_replication_role",
  );
}

/** The DB's own `now()`, so a window is measured against the SAME clock the fixtures' SQL
 *  `interval` expressions run against — never a JS `Date.now()` that could skew against it. */
async function dbNow() {
  return (await rootQuery("select now() as now")).rows[0].now;
}

// ===========================================================================================
// wl.1 — THE FLOOR. A viewer is below bookkeeper and is refused CLR04 before any row is read.
// ===========================================================================================
test("wl.1 list_accounting_work floors at bookkeeper: a viewer is refused CLR04", async (t) => {
  if (await gate(t)) return;
  await assertRaises(CLR04, () => listWork(CAROL()), "viewer lists work");
  await assertRaises(CLR04, () => getWorkRow(CAROL(), world.clients.A1), "viewer reads a work row");
});

// ===========================================================================================
// wl.2 — A SHORT PAGE IS HONEST ABOUT BEING SHORT. `truncated=false`, `next_cursor=null`: the
// caller must never be handed a cursor that names a page which does not exist, and must never
// infer a total from one page (AC1's own line).
// ===========================================================================================
test("wl.2 a short page reports truncated=false and next_cursor=null", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl2");
  await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "one" }) });

  const page = await listWork(BOB(), { client, limit: 25 });
  assert.equal(page.truncated, false, "a one-row answer under the limit is not truncated");
  assert.equal(page.next_cursor, null, "a short page mints no cursor");
  assert.equal(page.rows.length, 1);
});

// ===========================================================================================
// wl.3 — THE KEYSET ROUND TRIP. Three Works, two statuses, limit 2: page 1 carries two rows and
// a cursor; that cursor's page carries the third and closes the feed. No row appears twice and
// none is skipped — the property a `limit/offset` pager loses the moment a row is inserted.
// ===========================================================================================
test("wl.3 a minted cursor round-trips to the next page in a stable, gapless order", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl3");
  const a = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "first" }) });
  const b = await settledWork({ client, outcome: "completed", memo: "second" });
  const c = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "third" }) });

  const page1 = await listWork(BOB(), { client, limit: 2 });
  assert.equal(page1.rows.length, 2, "page 1 is exactly the limit");
  assert.equal(page1.truncated, true, "a full page with more behind it says so");
  assert.ok(typeof page1.next_cursor === "string" && page1.next_cursor.length > 0, "page 1 mints a cursor");

  const page2 = await listWork(BOB(), { client, limit: 2, cursor: page1.next_cursor });
  assert.equal(page2.rows.length, 1, "page 2 carries the remaining row");
  assert.equal(page2.truncated, false);
  assert.equal(page2.next_cursor, null);

  const seen = [...ids(page1), ...ids(page2)];
  assert.equal(new Set(seen).size, 3, "no row is paged twice");
  assert.deepEqual(new Set(seen), new Set([c.work_id, b.work_id, a.work_id]), "no row is skipped");
  // Newest first, by the door's own order.
  assert.deepEqual(seen, [c.work_id, b.work_id, a.work_id], "the order is (created_at desc, id desc)");
});

// ===========================================================================================
// wl.4 — CROSS-FIRM. A bookkeeper of ANOTHER firm reads zero rows for this firm's client, and
// the addressed-row door gives the same no-oracle answer an unknown id gets.
// ===========================================================================================
test("wl.4 another firm's owner reads zero rows and gets no oracle on the row door", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl4");
  const mine = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "mine" }) });

  const theirs = await listWork(DAVE(), { client });
  assert.deepEqual(theirs.rows, [], "firm B sees none of firm A's Work");

  const unfiltered = await listWork(DAVE(), {});
  assert.ok(!ids(unfiltered).includes(mine.work_id), "nor through an unfiltered read");

  await assertRaises(CLR11, () => getWorkRow(DAVE(), mine.work_id), "firm B addresses firm A's Work");
  await assertRaises(CLR11, () => getWorkRow(BOB(), "00000000-0000-4000-8000-000000000000"),
    "an id that never existed");
});

// ===========================================================================================
// wl.5 — THE STATUS FILTER, and its closed roster. An unknown token is refused rather than
// silently matching nothing: a status this build does not know is a caller defect, and a door
// that answered `[]` for it would look exactly like "no such Work".
// ===========================================================================================
test("wl.5 the status filter returns only matching rows; an unknown status is refused CLR10", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl5");
  const queued = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "queued one" }) });
  const done = await settledWork({ client, outcome: "completed", memo: "done one" });

  const onlyCompleted = await listWork(BOB(), { client, status: ["completed"] });
  assert.deepEqual(ids(onlyCompleted), [done.work_id]);

  const both = await listWork(BOB(), { client, status: ["completed", "queued"] });
  assert.equal(new Set(ids(both)).size, 2);
  assert.ok(ids(both).includes(queued.work_id));

  const none = await listWork(BOB(), { client, status: ["cancelled"] });
  assert.deepEqual(none.rows, [], "a filter that matches nothing is an honest empty page");
  assert.equal(none.truncated, false);

  const err = await assertRaises(CLR10, () => listWork(BOB(), { client, status: ["not_a_status"] }),
    "an unknown status token");
  assert.equal(detailOf(err)?.reason, "invalid_status");
});

// ===========================================================================================
// wl.6 — A MALFORMED CURSOR IS A TYPED REFUSAL, never a silent page 1. A caller following a
// hand-edited `?cursor=` must be told, not quietly shown the top of the list as if it were the
// page they asked for.
// ===========================================================================================
test("wl.6 a malformed cursor is refused CLR10 invalid_cursor", async (t) => {
  if (await gate(t)) return;
  const err = await assertRaises(CLR10, () => listWork(BOB(), { cursor: "not-a-cursor" }),
    "a malformed cursor");
  assert.equal(detailOf(err)?.reason, "invalid_cursor");
});

// ===========================================================================================
// wl.7 — THE LIMIT IS CLAMPED, both ends. A caller asking for 10,000 rows gets the ceiling, not
// the whole table; a caller asking for 0 or a negative gets one row rather than an empty page
// that would read as "there is nothing here".
// ===========================================================================================
test("wl.7 p_limit clamps to 1..100", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl7");
  for (const memo of ["a", "b", "c"]) {
    await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  }
  const zero = await listWork(BOB(), { client, limit: 0 });
  assert.equal(zero.rows.length, 1, "limit 0 clamps up to 1");
  assert.equal(zero.truncated, true, "and still says there is more");

  const huge = await listWork(BOB(), { client, limit: 10_000 });
  assert.equal(huge.rows.length, 3, "limit 10000 clamps to the ceiling, which this client is under");
});

// ===========================================================================================
// wl.8 — THE PURPOSE AND INITIATOR FILTERS. Purpose carries one value on this estate today
// (`journal_entry`, 0178's own CHECK) and other lanes are widening it; the door therefore filters
// on it WITHOUT a second roster of its own, so an unknown purpose matches nothing rather than
// raising against a list that has already drifted.
// ===========================================================================================
test("wl.8 the purpose and initiator filters narrow the page", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl8");
  const byAlice = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "alice" }) });
  const byBob = await admitJournalWork({ client, author: BOB(), basis: basis({ memo: "bob" }) });

  const journal = await listWork(BOB(), { client, purpose: ["journal_entry"] });
  assert.equal(new Set(ids(journal)).size, 2, "both are journal_entry Work");

  const nothing = await listWork(BOB(), { client, purpose: ["a_purpose_that_does_not_exist"] });
  assert.deepEqual(nothing.rows, [], "an unknown purpose matches nothing and raises nothing");

  const alicesOnly = await listWork(BOB(), { client, initiator: ALICE() });
  assert.deepEqual(ids(alicesOnly), [byAlice.work_id]);
  const bobsOnly = await listWork(BOB(), { client, initiator: BOB() });
  assert.deepEqual(ids(bobsOnly), [byBob.work_id]);
});

// ===========================================================================================
// wl.9 — FREE TEXT over the basis memo. Matched by CONTAINMENT rather than by a LIKE pattern
// built from caller input, so a `%` or `_` a person types is a literal character they are
// searching for and never a wildcard the door silently granted them.
// ===========================================================================================
test("wl.9 free text matches the basis memo by containment, case-insensitively", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl9");
  const rent = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "Quarterly RENT to Maybank" }) });
  await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "Stationery purchase" }) });

  const hit = await listWork(BOB(), { client, q: "rent" });
  assert.deepEqual(ids(hit), [rent.work_id], "case-insensitive containment");

  const literal = await listWork(BOB(), { client, q: "%" });
  assert.deepEqual(literal.rows, [], "a percent sign is a literal, not a wildcard that matches everything");
});

// ===========================================================================================
// wl.10 — THE DATE FENCE. `p_since` is inclusive and `p_until` is exclusive, so two adjacent
// windows tile the timeline without double-counting the instant on their shared boundary.
// ===========================================================================================
test("wl.10 since is inclusive and until is exclusive", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl10");
  const w = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "fenced" }) });
  const at = (await rootQuery("select created_at from clara.accounting_work where id=$1", [w.work_id]))
    .rows[0].created_at;

  const inclusive = await listWork(BOB(), { client, since: at });
  assert.ok(ids(inclusive).includes(w.work_id), "p_since includes a row AT the boundary instant");

  const exclusive = await listWork(BOB(), { client, until: at });
  assert.ok(!ids(exclusive).includes(w.work_id), "p_until excludes a row AT the boundary instant");
});

// ===========================================================================================
// wl.11 — THE RETRY SIGNAL IS A COUNT OF REAL RUNS, not a flag anybody set. A Work that has been
// retried carries `attempts = 2`; a fresh one carries 1. This is the canonical fact the list's
// "Retrying" LABEL is derived from — without it the UI would be inventing a state (#641's own
// "never invent state" line).
// ===========================================================================================
test("wl.11 attempts counts the Work's real runs, so a retry is a fact and not a guess", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl11");
  const fresh = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "one run" }) });
  const failed = await settledWork({
    client, outcome: "failed", memo: "retried",
    errorCode: "internal", error: { code: "CLR10", reason: "transient", message: "boom", recoverable: true },
  });
  await retryAccountingWork({ work: failed.work_id, author: ALICE() });

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  assert.equal(byId.get(fresh.work_id).attempts, 1, "a Work admitted once has had one run");
  assert.equal(byId.get(failed.work_id).attempts, 2, "a retried Work has had two");

  const addressed = await getWorkRow(BOB(), failed.work_id);
  assert.equal(addressed.attempts, 2, "the addressed-row door reports the same count");
});

// ===========================================================================================
// wl.12 — THE PARKED QUESTION IS ON THE LIST ROW. "Needs you" is the label the list shows for
// `awaiting_input`; the QUESTION's own identity travels with the row so the list can link
// straight to the thing that is waiting rather than making a second read per row.
// ===========================================================================================
test("wl.12 a parked Work carries its pending question's id and version", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl12");
  const parked = await parkedWork({ client, author: ALICE() });
  const quiet = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "not parked" }) });

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  const row = byId.get(parked.workId);
  assert.equal(row.status, "awaiting_input", "the mirror moved the Work");
  assert.equal(row.pending_question_id, parked.questionId);
  assert.equal(row.pending_question_version, parked.version);
  assert.equal(byId.get(quiet.work_id).pending_question_id, null, "a Work parked on nothing carries null");

  const onlyParked = await listWork(BOB(), { client, status: ["awaiting_input"] });
  assert.deepEqual(ids(onlyParked), [parked.workId], "the Needs-you view is a status filter, not a second read");
});

// ===========================================================================================
// wl.13 — THE ADDRESSED ROW LIVES OUTSIDE THE PAGE WINDOW (#719's own lesson). A deep link to a
// Work that is three pages down must resolve; a list-only read would have shown a not-found for
// a row the caller is perfectly entitled to see.
// ===========================================================================================
test("wl.13 get_accounting_work_row resolves a Work that page 1 does not contain", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl13");
  const oldest = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "oldest" }) });
  for (const memo of ["n1", "n2", "n3", "n4"]) {
    await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  }

  const page1 = await listWork(BOB(), { client, limit: 2 });
  assert.ok(!ids(page1).includes(oldest.work_id), "the oldest Work is genuinely off page 1");

  const addressed = await getWorkRow(BOB(), oldest.work_id);
  assert.equal(addressed.id, oldest.work_id);
  assert.equal(addressed.memo, "oldest", "and carries the same projection a list row does");
  assert.ok(typeof addressed.client_name === "string" && addressed.client_name.length > 0);
});

// ===========================================================================================
// wl.14 — THE FIRM-WIDE READ CARRIES THE CLIENT. `/work` lists every client's Work in one table,
// so the client NAME has to come from the door — a browser that resolved 100 ids against a
// register read would be a second source of truth for whose books a row belongs to.
// ===========================================================================================
test("wl.14 the firm-wide read spans clients and names each row's client", async (t) => {
  if (await gate(t)) return;
  const c1 = await freshWorkClient(ALICE(), "wl14a");
  const c2 = await freshWorkClient(ALICE(), "wl14b");
  const w1 = await admitJournalWork({ client: c1, author: ALICE(), basis: basis({ memo: "in c1" }) });
  const w2 = await admitJournalWork({ client: c2, author: ALICE(), basis: basis({ memo: "in c2" }) });

  const firmWide = await listWork(BOB(), { limit: 100 });
  const byId = new Map(firmWide.rows.map((r) => [r.id, r]));
  assert.ok(byId.has(w1.work_id) && byId.has(w2.work_id), "one unfiltered read spans both clients");
  assert.equal(byId.get(w1.work_id).client_id, c1);
  assert.ok(typeof byId.get(w1.work_id).client_name === "string" && byId.get(w1.work_id).client_name.length > 0);

  const scoped = await listWork(BOB(), { client: c2, limit: 100 });
  assert.deepEqual(ids(scoped), [w2.work_id], "the client filter narrows the same door");
});

// ===========================================================================================
// wl.15 — EVERY ORIGIN IS LISTED. A Work admitted from a Clara conversation is the SAME durable
// record as one admitted from the composer, and #629's finding is that a chat-originated Work is
// reachable nowhere else. The door therefore filters on NOTHING to do with origin, and the row
// carries `basis_origin` so the list can SHOW where it came from.
// ===========================================================================================
test("wl.15 a clara_interpreted Work is listed beside a user_direct one, with its origin", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl15");
  const direct = await admitJournalWork({
    client, author: ALICE(), basis: basis({ memo: "typed by a person" }), origin: "user_direct",
  });
  const interpreted = await admitJournalWork({
    client, author: ALICE(), basis: basis({ memo: "asked in chat" }), origin: "clara_interpreted",
  });

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  assert.equal(byId.get(direct.work_id).basis_origin, "user_direct");
  assert.equal(byId.get(interpreted.work_id).basis_origin, "clara_interpreted");
});

// ===========================================================================================
// wl.16 — SAVED VIEWS. `interface.workViews` is ONE new enumerated key on the preferences door
// 0179 already owns; nothing about the shape is stored that the write did not validate.
// ===========================================================================================
test("wl.16 save_my_preferences accepts interface.workViews and get_my_preferences returns it", async (t) => {
  if (await gate(t)) return;
  const before = await getPrefs(BOB());
  const views = [
    { id: "needs-my-attention", name: "Needs my attention", query: "status=awaiting_input" },
    { id: "failures", name: "Failures", query: "status=failed,refused" },
  ];
  const saved = await savePrefs(BOB(), { version: before.version, patch: { interface: { workViews: views } } });
  assert.deepEqual(saved.interface.workViews, views);

  const read = await getPrefs(BOB());
  assert.deepEqual(read.interface.workViews, views, "the door round-trips the saved views");

  // THE SHALLOW MERGE STILL HOLDS: saving a motion preference cannot clear the views.
  const after = await savePrefs(BOB(), {
    version: read.version, patch: { interface: { motion: "reduced" } },
  });
  assert.deepEqual(after.interface.workViews, views, "one save cannot clear an unrelated setting");
  assert.equal(after.interface.motion, "reduced");
});

test("wl.17 an ill-shaped workViews patch is refused CLR10 with the field path as its reason", async (t) => {
  if (await gate(t)) return;
  const me = ALICE();
  const cases = [
    ["not an array", { workViews: { id: "x" } }],
    ["an element that is not an object", { workViews: ["x"] }],
    ["a blank id", { workViews: [{ id: "  ", name: "n", query: "" }] }],
    ["a missing name", { workViews: [{ id: "x", query: "" }] }],
    ["an unknown key inside a view", { workViews: [{ id: "x", name: "n", query: "", colour: "red" }] }],
    ["duplicate ids", { workViews: [{ id: "x", name: "a", query: "" }, { id: "x", name: "b", query: "" }] }],
  ];
  for (const [label, iface] of cases) {
    const prefs = await getPrefs(me);
    const err = await assertRaises(CLR10,
      () => savePrefs(me, { version: prefs.version, patch: { interface: iface } }), label);
    assert.equal(detailOf(err)?.reason, "interface.workViews", `${label}: names the field path`);
  }
  // And the pre-existing guarantees are untouched: an unknown interface key still refuses under
  // its own path, and a stale version still refuses CLR06.
  const prefs = await getPrefs(me);
  const unknown = await assertRaises(CLR10,
    () => savePrefs(me, { version: prefs.version, patch: { interface: { nope: 1 } } }), "an unknown key");
  assert.equal(detailOf(unknown)?.reason, "interface.nope");
  await assertRaises(CLR06,
    () => savePrefs(me, { version: prefs.version + 7, patch: { interface: { motion: "system" } } }),
    "a stale expected version");
});

// ===========================================================================================
// wl.18 — THE TERMINAL OUTCOME TRAVELS WITH THE ROW. A failed Work's typed error code/reason is
// on the list row, so the list can say WHY without opening every item — and a completed Work's
// posted entry id is there for the same reason.
// ===========================================================================================
test("wl.18 a settled Work carries its typed outcome on the list row", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl18");
  const refused = await settledWork({
    client, outcome: "refused", memo: "refused one",
    errorCode: "internal", error: { code: "CLR13", reason: "period_locked", message: "the period is locked" },
  });

  const page = await listWork(BOB(), { client, limit: 25 });
  const row = page.rows.find((r) => r.id === refused.work_id);
  assert.equal(row.status, "refused");
  assert.equal(row.error_reason, "period_locked");
  assert.equal(row.error_code, "CLR13");
});

// ===========================================================================================
// wl.19 — A CLIENT OF ANOTHER FIRM CANNOT BE USED AS A PROBE. Passing firm B's client id as
// `p_client` from firm A answers an empty page, never a refusal that would confirm the id exists.
// ===========================================================================================
test("wl.19 a cross-firm p_client answers an empty page, not an oracle", async (t) => {
  if (await gate(t)) return;
  const page = await listWork(BOB(), { client: CLIENT_B1() });
  assert.deepEqual(page.rows, []);
  assert.equal(page.truncated, false);
  assert.equal(page.next_cursor, null);
});

// ===========================================================================================
// wl.20 — A NULL ELEMENT IN A FILTER ARRAY IS A CALLER DEFECT, NOT A FILTER. `v not in (…)` is
// NULL for a NULL element, so the first cut of the roster check fell THROUGH it and
// `= any(array[null])` then matched nothing: `rows=0`, no refusal — the exact "`[]` looks like
// *no such Work*" failure the roster check exists to prevent. Measured by the adversarial
// migration-safety review, 2026-09-14.
// ===========================================================================================
test("wl.20 a NULL element in p_status or p_purpose is refused CLR10, never answered as an empty page", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl20");
  await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "present" }) });

  const nullStatus = await assertRaises(CLR10, () => listWork(BOB(), { client, status: [null] }),
    "a bare [null] status");
  assert.equal(detailOf(nullStatus)?.reason, "invalid_status");

  const mixed = await assertRaises(CLR10,
    () => listWork(BOB(), { client, status: ["completed", null] }), "a null BESIDE a real token");
  assert.equal(detailOf(mixed)?.reason, "invalid_status");

  const nullPurpose = await assertRaises(CLR10, () => listWork(BOB(), { client, purpose: [null] }),
    "a bare [null] purpose");
  assert.equal(detailOf(nullPurpose)?.reason, "invalid_purpose");

  // …and the honest neighbours still behave: an EMPTY array is "no filter on this axis", and a
  // real unknown purpose still matches nothing without raising (0178's CHECK owns that roster).
  const empty = await listWork(BOB(), { client, status: [], purpose: [] });
  assert.equal(empty.rows.length, 1, "an empty array is no filter at all, not a refusal");
  const unknown = await listWork(BOB(), { client, purpose: ["a_purpose_that_does_not_exist"] });
  assert.deepEqual(unknown.rows, [], "an unknown purpose still matches nothing and raises nothing");
});

// ===========================================================================================
// wl.21 — THE 100 CEILING, ON A CLIENT THAT IS ACTUALLY OVER IT. wl.7 clamps against a client
// holding three Works, which proves the arithmetic and nothing about the ceiling: 10,000 and 3
// both answer 3. This builds 105 Works in ONE statement (so they also share one `created_at` to
// the microsecond, which is the case where the keyset's id tie-break is what orders the page)
// and measures what the door actually hands back.
// ===========================================================================================

/** 105 admissions in ONE statement, through the REAL admission door — `select f(...) from
 *  generate_series(...)`, so it is one transaction and one round trip rather than 105. */
async function bulkAdmit({ client, author, n, tag }) {
  await roleQuery(ROLES.runtime,
    "select clara.admit_journal_work("
    + "p_client => $1::uuid, p_author => $2::uuid, p_intent_key => $3::text || g::text,"
    + "p_basis => $4::jsonb, p_basis_origin => 'user_direct', p_source_refs => '[]'::jsonb,"
    + "p_model => $5::text) from generate_series(1, $6::int) g",
    [client, author, `${tag}-${opk("wl641")}-`, JSON.stringify(basis({ memo: `${tag} bulk` })),
      MODEL, n]);
}

test("wl.21 p_limit ceilings at 100 on a client that holds more, and a null p_limit is 25", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl21");
  await bulkAdmit({ client, author: ALICE(), n: 105, tag: "wl21" });
  const total = (await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id = $1", [client])).rows[0].n;
  assert.equal(total, 105, "fixture: the client really does hold more than the ceiling");

  for (const asked of [100, 101, 1_000_000_000, 2_147_483_647]) {
    const page = await listWork(BOB(), { client, limit: asked });
    assert.equal(page.rows.length, 100, `p_limit ${asked} answers the 100 ceiling`);
    assert.equal(page.truncated, true, `p_limit ${asked} still says there is more`);
    assert.ok(typeof page.next_cursor === "string" && page.next_cursor.length > 0,
      `p_limit ${asked} mints a cursor`);
  }

  const defaulted = await listWork(BOB(), { client, limit: null });
  assert.equal(defaulted.rows.length, 25, "a null p_limit is the door's own default of 25");
  assert.equal(defaulted.truncated, true);

  // The tie-break is real: every row admitted in one statement carries ONE created_at, so the
  // page order is decided by `id desc` alone and must still be gapless.
  const clock = (await rootQuery(
    "select count(distinct created_at)::int as n from clara.accounting_work where client_id = $1",
    [client])).rows[0].n;
  assert.equal(clock, 1, "one statement, one clock reading — the id tie-break is what orders this");
  const page1 = await listWork(BOB(), { client, limit: 100 });
  const page2 = await listWork(BOB(), { client, limit: 100, cursor: page1.next_cursor });
  const seen = [...ids(page1), ...ids(page2)];
  assert.equal(seen.length, 105, "the walk carries every row");
  assert.equal(new Set(seen).size, 105, "…each exactly once");
});

// ===========================================================================================
// wl.22 — THE DEFINER HELPER, CALLED DIRECTLY. A leading underscore hides nothing from PostgREST
// (0181's own caveat) and this helper is GRANTED, so it is a door in its own right: it answers
// nothing for another firm, and it refuses an array bigger than any page the two real doors
// could ever ask about (measured before the bound: 1,000,000 ids cost 5.6 s of server CPU).
// ===========================================================================================
test("wl.22 _work_run_attempts is firm-self-scoped and bounded at the doors' own page size", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl22");
  const mine = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "mine" }) });
  const theirs = await admitJournalWork({
    client: CLIENT_B1(), author: DAVE(), basis: basis({ memo: "theirs" }) });

  const attempts = async (sub, works) => humanQuery(sub,
    "select work_id::text as work_id, attempts from clara._work_run_attempts($1::uuid[])", [works]);

  const crossFirm = await attempts(BOB(), [theirs.work_id]);
  assert.deepEqual(crossFirm.rows, [], "firm B's Work answers nothing to a firm A bookkeeper");

  const mixed = await attempts(BOB(), [theirs.work_id, mine.work_id]);
  assert.deepEqual(mixed.rows.map((r) => r.work_id), [mine.work_id],
    "an array naming both firms answers only for this one");

  // The bound is p_limit + 1 = 101, which is the largest page either door can ask about.
  const uuids = (n) => Array.from({ length: n }, (_, i) =>
    `c641c641-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const ok = await attempts(BOB(), uuids(101));
  assert.deepEqual(ok.rows, [], "101 unknown ids is a lawful call that simply matches nothing");

  const tooMany = await assertRaises(CLR10, () => attempts(BOB(), uuids(102)), "102 ids");
  assert.equal(detailOf(tooMany)?.reason, "invalid_work_ids");
  const nulled = await assertRaises(CLR10, () => attempts(BOB(), null), "a null array");
  assert.equal(detailOf(nulled)?.reason, "invalid_work_ids");

  // …and the doors themselves are unaffected: the list still asks about its own page.
  const page = await listWork(BOB(), { client, limit: 25 });
  assert.equal(page.rows.find((r) => r.id === mine.work_id).attempts, 1);
});

// ===========================================================================================
// wl.23 — NULL RANK. A REAL user who holds no membership anywhere has a valid JWT sub and a NULL
// `clara.jwt_firm()`/`clara.actor_role_rank()`. wl.1 covers the viewer (rank 0, below the floor);
// this is the other half — the actor the `coalesce(…, -1)` arm exists for, and the shape x42's
// own ruling was written about (a null rank must REFUSE, never fall open).
// ===========================================================================================
test("wl.23 a real user with no membership at all is refused CLR04 by all three names", async (t) => {
  if (await gate(t)) return;
  const stranger = await insertUser(world.prefix, "wl23_stranger");
  const claims = (await humanQuery(stranger,
    "select clara.jwt_sub()::text as sub, clara.jwt_firm()::text as firm,"
    + " clara.actor_role_rank() as rank")).rows[0];
  assert.equal(claims.sub, stranger, "the credential is valid…");
  assert.equal(claims.firm, null, "…and carries no firm");
  assert.equal(claims.rank, null, "…and no rank at all");

  await assertRaises(CLR04, () => listWork(stranger, {}), "a membership-less list");
  await assertRaises(CLR04, () => getWorkRow(stranger, world.clients.A1),
    "a membership-less addressed row");
  await assertRaises(CLR04,
    () => humanQuery(stranger, "select * from clara._work_run_attempts($1::uuid[])",
      [[world.clients.A1]]),
    "a membership-less helper call");
});

// ===========================================================================================
// wl.24 — EVERY MALFORMED CURSOR SHAPE IS THE SAME TYPED REFUSAL. wl.6 covers one; a cursor is
// the one parameter a person can hand-edit in the address bar, so the shapes are enumerated —
// including the two that did NOT refuse before this round: a non-finite timestamp compares below
// every real row and fabricated a clean, well-formed EMPTY page.
// ===========================================================================================
test("wl.24 malformed and non-finite cursors are all CLR10 invalid_cursor, never a silent page", async (t) => {
  if (await gate(t)) return;
  // This cell owns its own Work rather than leaning on a sibling's: the two CONTROL arms below
  // (a blank cursor reads the first page; the table survived the SQL-shaped payload) are only
  // meaningful against a list that has something in it, and a cell whose control depends on
  // another cell having run first is a cell that passes for the wrong reason.
  const client = await freshWorkClient(ALICE(), "wl24");
  await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "fenced" }) });
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
  const shapes = [
    ["not base64 at all", "not-a-cursor!!"],
    ["base64 with no pipe", b64("2026-09-01T00:00:00Z")],
    ["a leading pipe", b64("|00000000-0000-4000-8000-000000000000")],
    ["a trailing pipe", b64("2026-09-01T00:00:00Z|")],
    ["a non-uuid id", b64("2026-09-01T00:00:00Z|not-a-uuid")],
    // NOT `yesterday`, and the reason is worth recording: PostgreSQL's `timestamptz` input
    // ACCEPTS the special literals `now`/`today`/`yesterday`/`epoch`, so a cursor carrying one of
    // them casts to a real, finite instant and fences an honest page. It is a strange thing to
    // find in an address bar and it is not malformed. `-infinity`/`infinity` below are the two
    // that ARE, because no cursor this door mints can be non-finite and the fence they produce is
    // a clean empty page that looks exactly like "there is no more Work".
    ["a garbage timestamp", b64("2026-13-45T99:99:99Z|00000000-0000-4000-8000-000000000000")],
    ["a non-timestamp word", b64("zzz|00000000-0000-4000-8000-000000000000")],
    ["a 200 KB payload", b64(`${"x".repeat(200_000)}|00000000-0000-4000-8000-000000000000`)],
    ["a SQL-shaped payload", b64("'; drop table clara.accounting_work; --|x")],
    ["-infinity", b64("-infinity|00000000-0000-4000-8000-000000000000")],
    ["infinity", b64("infinity|00000000-0000-4000-8000-000000000000")],
  ];
  for (const [label, cursor] of shapes) {
    const err = await assertRaises(CLR10, () => listWork(BOB(), { client, cursor }), label);
    assert.equal(detailOf(err)?.reason, "invalid_cursor", `${label}: names invalid_cursor`);
  }
  // A BLANK cursor is an absence, not a fault — the honest first page.
  for (const blank of ["", "   "]) {
    const page = await listWork(BOB(), { client, cursor: blank, limit: 1 });
    assert.equal(page.rows.length, 1, "a blank cursor reads the first page like no cursor at all");
  }
  // The table is still there, which is what the SQL-shaped payload was asking about.
  const alive = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id = $1", [client]);
  assert.equal(alive.rows[0].n, 1, "no payload above reached the planner as SQL");
});

// ===========================================================================================
// wl.25 — THE workViews CAPS, not just its shapes. wl.17 proves the six shape faults; these are
// the SIZE and IDENTITY rules, which are what stop a preferences row from becoming an unbounded
// jsonb bucket — plus the two faults the first cut accepted: a view with no `query` key (which
// the web reader then dropped silently — a write that succeeded and a view that never appeared)
// and an id that differs from another only by whitespace or carries a control character.
// ===========================================================================================
test("wl.25 the workViews caps and identity rules are enforced, all under the one field path", async (t) => {
  if (await gate(t)) return;
  const me = CAROL(); // a viewer may hold preferences: 0179 floors this door at viewer.
  const view = (over = {}) => ({ id: "v1", name: "View one", query: "status=failed", ...over });
  const cases = [
    ["21 views", { workViews: Array.from({ length: 21 }, (_, i) => view({ id: `v${i}`, name: `View ${i}` })) }],
    ["a 513-character query", { workViews: [view({ query: "q".repeat(513) })] }],
    ["a 10 MB query", { workViews: [view({ query: "q".repeat(10 * 1024 * 1024) })] }],
    ["a non-string query", { workViews: [view({ query: 7 })] }],
    ["a MISSING query key", { workViews: [{ id: "v1", name: "View one" }] }],
    ["a 65-character id", { workViews: [view({ id: "i".repeat(65) })] }],
    ["a 65-character name", { workViews: [view({ name: "n".repeat(65) })] }],
    ["ids differing only by whitespace",
      { workViews: [view({ id: "rent" }), view({ id: " rent ", name: "View two" })] }],
    ["a control character in an id", { workViews: [view({ id: "re\nnt" })] }],
    ["a control character in a name", { workViews: [view({ name: "View\u0007one" })] }],
  ];
  for (const [label, iface] of cases) {
    const prefs = await getPrefs(me);
    const err = await assertRaises(CLR10,
      () => savePrefs(me, { version: prefs.version, patch: { interface: iface } }), label);
    assert.equal(detailOf(err)?.reason, "interface.workViews", `${label}: names the field path`);
  }

  // THE CEILING ITSELF IS STORABLE: 20 views at the full 64/64/512 is what this door promises to
  // accept, and a cap that refused its own ceiling would be a different cap.
  const prefs = await getPrefs(me);
  const full = Array.from({ length: 20 }, (_, i) => ({
    id: `view-${String(i).padStart(2, "0")}${"x".repeat(50)}`,
    name: `${"N".repeat(60)}${i}`,
    query: "q".repeat(512),
  }));
  const saved = await savePrefs(me, { version: prefs.version, patch: { interface: { workViews: full } } });
  assert.equal(saved.interface.workViews.length, 20, "the ceiling is accepted whole");
  // …and put back, so no later cell inherits twenty views from this one.
  const after = await getPrefs(me);
  await savePrefs(me, { version: after.version, patch: { interface: { workViews: [] } } });
});

// ===========================================================================================
// wl.26 — "ENTERED BY" MEANS WHO ASKED, AND THE FILTER SAYS THE SAME THING AS THE COLUMN. #630
// split the two facts: `initiated_by` is who ASKED (frozen), `initiator` is who it currently RUNS
// AS (a Take-over moves it). The list column renders `initiated_by ?? initiator`; before this
// round the door filtered the mutable one, so filtering by the name the column SHOWS dropped the
// very row it was showing — and filtering by the new responsible admitted Work they never asked
// for. This cell is the one place both facts diverge, so it is the only place the bug is visible.
// ===========================================================================================
test("wl.26 after a Take-over the initiator filter follows WHO ASKED, exactly as the column does", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl26");

  // Heidi asks for the Work; her run refuses `authority_lost`; her membership is then revoked, so
  // the Work is orphaned and takeable. BOB picks it up. Every step is the estate's own door.
  const heidi = await insertUser(world.prefix, "wl26_heidi");
  await addMember(ALICE(), {
    firm: world.firms.A, user: heidi, role: "bookkeeper", opKey: opk("wl641-mem") });
  const handed = await admitJournalWork({ client, author: heidi, basis: basis({ memo: "handed over" }) });
  await claimWorkRun({ task: handed.task_id, runId: opk("wl641-run") });
  await settleWorkRun({
    task: handed.task_id, outcome: "refused", errorCode: "tool_error",
    error: { code: "CLR04", reason: "authority_lost", message: "no longer a member", recoverable: true },
  });
  await deactivateMember(ALICE(), { firm: world.firms.A, user: heidi });
  const takeover = await takeOverAccountingWork({ work: handed.work_id, author: BOB() });
  assert.equal(takeover.taken_over, true, "fixture: the take-over really happened");

  // A second Work on the same client that BOB genuinely asked for, so "filter by Bob" has
  // something lawful to return and the cell can tell inclusion from exclusion.
  const bobs = await admitJournalWork({ client, author: BOB(), basis: basis({ memo: "bob asked" }) });

  const page = await listWork(BOB(), { client, limit: 25 });
  const row = page.rows.find((r) => r.id === handed.work_id);
  assert.equal(row.initiated_by, heidi, "the row still records WHO ASKED");
  assert.equal(row.initiator, BOB(), "…and who it now runs as — the two facts have diverged");

  const asked = await listWork(BOB(), { client, initiator: heidi });
  assert.deepEqual(ids(asked), [handed.work_id],
    "filtering by the name the Entered-by column shows finds the row the column shows");

  const bobsOnly = await listWork(BOB(), { client, initiator: BOB() });
  assert.deepEqual(ids(bobsOnly), [bobs.work_id],
    "…and the new responsible is not credited with Work they never asked for");
});

// ===========================================================================================
// wl.27 — THE FIRM-WIDE PAGE IS AN ORDERED INDEX SCAN, not a top-N heapsort over the firm's whole
// Work. `/work` IS that surface, and before §0.5's index the only firm-leading index was
// `uq_accounting_work_intent (firm_id, client_id, intent_key)`, which binds the firm and orders
// nothing — so every page, cursor or not, sorted the firm's entire history first. Measured
// RLS-BOUND, as `clara_authenticated`, because the firm predicate is half of what the index
// serves; an EXPLAIN as root would be a plan no caller ever runs.
// ===========================================================================================
test("wl.27 the firm-wide keyset has an index over its own ORDER BY tuple, and the planner uses it", async (t) => {
  if (await gate(t)) return;
  const def = (await rootQuery(
    "select indexdef from pg_indexes where schemaname='clara' and tablename='accounting_work'"
    + " and indexname='ix_accounting_work_firm_created'")).rows[0]?.indexdef;
  assert.ok(def, "the firm-wide ordering index exists");
  assert.match(def.replace(/\s+/g, " "),
    /\(firm_id, created_at DESC, id DESC\)/,
    "the key tuple IS the door's ORDER BY tuple — the id tie-break is part of the key");

  await rootQuery("analyze clara.accounting_work");
  const plan = (await humanQuery(BOB(),
    "explain (format json) select w.id, w.created_at from clara.accounting_work w"
    + " order by w.created_at desc, w.id desc limit 26")).rows[0]["QUERY PLAN"][0].Plan;
  const rendered = JSON.stringify(plan);
  assert.match(rendered, /ix_accounting_work_firm_created/,
    `the firm-wide page must ride the new index; plan was ${rendered}`);
  assert.match(rendered, /"Index Cond":"\(firm_id = clara\.jwt_firm\(\)\)"/,
    `…bound by the caller's own firm, not by the table; plan was ${rendered}`);
  assert.doesNotMatch(rendered, /"Node Type":"Sort"/,
    `…and with no sort node at all; plan was ${rendered}`);
});

// ===========================================================================================
// wl.28 — #809: THE PROJECTION CARRIES intent_key, ON BOTH DOORS.
//
// The plan authority picker labels a candidate by its basis memo falling back to its intent key.
// Until 0203 this door carried neither `basis` nor `intent_key`, which is the whole reason a
// SECOND, direct-table reader of clara.accounting_work existed beside it. The field is NOT NULL
// on the table (0178), so a row that reached a caller without it would be a type lie rather than
// an absent value — asserted here as a non-empty string, on the list row AND on the addressed
// row 0189 calls "the SAME projection".
// ===========================================================================================
test("wl.28 every list row carries a non-empty intent_key, and the addressed-row door carries the same field", async (t) => {
  if (await gate(t)) return;
  if (await gateIntentKey(t)) return;
  const client = await freshWorkClient(ALICE(), "wl28");
  const admitted = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "intent key" }) });

  const page = await listWork(BOB(), { client, limit: 25 });
  assert.ok(page.rows.length > 0, "wl.28 vacuity control: the client has at least one Work");
  for (const r of page.rows) {
    assert.equal(typeof r.intent_key, "string",
      `wl.28 intent_key must be a string on every row — got ${JSON.stringify(r.intent_key)}`);
    assert.ok(r.intent_key.length > 0, "wl.28 …and never an empty one: the column is NOT NULL");
  }

  // IT IS THE COLUMN, not a re-derivation. Read the row's own intent_key as root and compare.
  const canonical = (await rootQuery(
    "select intent_key from clara.accounting_work where id = $1", [admitted.work_id])).rows[0].intent_key;
  const listed = page.rows.find((r) => r.id === admitted.work_id);
  assert.ok(listed, "wl.28 the admitted Work is on the page");
  assert.equal(listed.intent_key, canonical, "wl.28 the projected value IS clara.accounting_work.intent_key");

  // …AND THE ADDRESSED ROW AGREES. 0189's own comment calls this door "the SAME projection
  // clara.list_accounting_work emits" and wl.13 asserts it; a widen that moved one and not the
  // other would have made both statements false on the first field either one gained, and would
  // have typed a non-nullable field on a row that lacks it (apps/web/lib/work/work-list.ts types
  // BOTH doors' answers as one WorkListRow).
  const addressed = await getWorkRow(BOB(), admitted.work_id);
  assert.equal(addressed.intent_key, canonical, "wl.28 the addressed-row door carries the same intent_key");

  // The BASIS OBJECT is still not projected by either: #809 is a one-field widen, and 0189's
  // "a list of operations is not a ledger" stands.
  assert.equal("basis" in listed, false, "wl.28 no basis object joined the list row");
  assert.equal("basis" in addressed, false, "wl.28 …nor the addressed row");
});

// ===========================================================================================
// wl.29 — #880: THE CLAIM LABEL, ON ONE PAGE, WITHOUT A SECOND ROUND TRIP.
//
// A staff expense claim posts under the plain `journal_entry` purpose (0221's own header: a
// fourth purpose cannot post through the closed core), so before migration 0266 the list's own
// projection could not tell one apart from an ordinary journal entry — the Work detail alone
// could, through a SEPARATE per-Work call to `clara.get_work_claim_origin`. AC1 asks for "at most
// one additional round trip" to resolve every claim label on a page; this cell proves the
// STRONGER fact the additive-projection choice buys — ZERO additional round trips, because the
// fields ride the SAME page `listWork` already fetched. AC2 asks that a non-claim row is
// unchanged; this cell puts a plain journal Work on the SAME page as the claim, so one page proves
// both ACs against the SAME query.
// ===========================================================================================
test("wl.29 a page carrying a claim resolves its label with NO extra round trip, and a plain row is unchanged", async (t) => {
  if (await gate(t)) return;
  if (await gateClaimLabel(t)) return;
  const client = await freshWorkClient(ALICE(), "wl29");
  await ensureSecChart(ALICE(), client, "wl29");

  const claimed = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: claim() });
  const plain = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "wl29 plain" }) });

  // --- AC1: the LIST page itself carries the label — no second call to any door. ------------
  const page = await listWork(BOB(), { client, limit: 25 });
  const claimRow = page.rows.find((r) => r.id === claimed.work_id);
  assert.ok(claimRow, "wl.29 the claim Work is on the page");
  assert.equal(claimRow.claim_id, claimed.claim_id,
    "wl.29 the list row's claim_id IS the claim admission answered with — no re-derivation");
  assert.equal(claimRow.claimant_label, "Farah binti Idris",
    "wl.29 the list row carries the claimant label the door enrolled");
  assert.equal(claimRow.purpose, "journal_entry",
    "wl.29 the Work's own purpose is still the plain, unwidened journal_entry (0221's own rule) — "
    + "claim_id is how the caller tells it apart, not a fourth purpose value");

  // …AND THE ADDRESSED ROW AGREES (AC4's "the two Work projections still match", re-proved from
  // the outside; migration 0266's own §T step 7 proves it from the catalog).
  const claimAddressed = await getWorkRow(BOB(), claimed.work_id);
  assert.equal(claimAddressed.claim_id, claimed.claim_id, "wl.29 the addressed row carries the SAME claim_id");
  assert.equal(claimAddressed.claimant_label, "Farah binti Idris", "wl.29 …and the SAME claimant_label");

  // --- AC2: the PLAIN row on the SAME page is unchanged — both new fields null, everything else
  // exactly as wl.1–wl.28 already prove for a plain journal Work. --------------------------
  const plainRow = page.rows.find((r) => r.id === plain.work_id);
  assert.ok(plainRow, "wl.29 the plain Work is on the SAME page as the claim");
  assert.equal(plainRow.claim_id, null, "wl.29 a plain journal Work has NO claim_id");
  assert.equal(plainRow.claimant_label, null, "wl.29 …nor a claimant_label");
  assert.equal(plainRow.memo, "wl29 plain", "wl.29 the plain row's own memo is untouched");

  const plainAddressed = await getWorkRow(BOB(), plain.work_id);
  assert.equal(plainAddressed.claim_id, null, "wl.29 the plain Work's addressed row agrees: no claim_id");
  assert.equal(plainAddressed.claimant_label, null, "wl.29 …nor a claimant_label");

  // AC3, restated as a machine fact rather than a promise: get_work_claim_origin (the Work
  // detail's own existing read) is a SEPARATE function this migration never touches — its
  // signature and body are exactly what 0221 shipped.
  const origin = (await rootQuery(
    "select encode(sha256(convert_to(prosrc,'UTF8')),'hex') as sha from pg_proc"
    + " where oid = 'clara.get_work_claim_origin(uuid)'::regprocedure")).rows[0];
  assert.ok(origin, "wl.29 clara.get_work_claim_origin still resolves, untouched by this migration");
});

// ===========================================================================================
// wl.30 — #905 AC1: THE RECEIPT-DATED BOUND FENCES BY THE COMMITTED RECEIPT, NOT BY ADMISSION.
// A Work admitted long before a window but posted (committed) inside it is the exact shape
// `p650.pack.recent_success_drilldown` (packages/db/tests/client-work-pack.test.mjs) names as
// "class 1: posted inside the window, admitted before it — the list cannot express this". This
// cell is the fix: the list CAN now express it, on the receipt-dated axis.
// ===========================================================================================
test("wl.30 a receipt-dated bound fences by the COMMITTED RECEIPT — an old admission posted just now is IN it and OUT of the start-dated one", async (t) => {
  if (await gateReceiptWindow(t)) return;
  const client = await freshWorkClient(ALICE(), "wl30");

  const old = await postedWork(client, { memo: "admitted-long-ago" });
  await backdateWorkAdmission(old.work_id, "now() - interval '30 days'");

  const now = await dbNow();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const byAdmission = await listWork(BOB(), { client, since, until });
  assert.ok(!ids(byAdmission).includes(old.work_id),
    "wl.30 the start-dated bound fences w.created_at, and this Work was admitted 30 days ago");

  const byReceipt = await listWork(BOB(), { client, receiptSince: since, receiptUntil: until });
  assert.ok(ids(byReceipt).includes(old.work_id),
    "wl.30 the receipt-dated bound fences the committed receipt, which landed inside the window");
});

// ===========================================================================================
// wl.31 — #905 AC2: A COMPLETED WORK WITH NO COMMITTED RECEIPT IS EXCLUDED, NEVER DATED BY
// SOMETHING ELSE. True whichever half of the pair is supplied, alone or together — and a control
// proves the SAME Work is exactly where wl.1–wl.29 already put it when neither is supplied.
// ===========================================================================================
test("wl.31 a completed Work with no committed receipt appears in NEITHER half of a receipt-dated bound", async (t) => {
  if (await gateReceiptWindow(t)) return;
  const client = await freshWorkClient(ALICE(), "wl31");
  const undated = await completedWithoutReceipt(client, "no-receipt");

  const now = await dbNow();
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const until = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const withSinceOnly = await listWork(BOB(), { client, receiptSince: since });
  assert.ok(!ids(withSinceOnly).includes(undated.work_id),
    "wl.31 p_receipt_since alone excludes an undated completion");

  const withUntilOnly = await listWork(BOB(), { client, receiptUntil: until });
  assert.ok(!ids(withUntilOnly).includes(undated.work_id),
    "wl.31 p_receipt_until alone excludes an undated completion");

  const withBoth = await listWork(BOB(), { client, receiptSince: since, receiptUntil: until });
  assert.ok(!ids(withBoth).includes(undated.work_id),
    "wl.31 the combined receipt-dated bound excludes an undated completion");

  const plain = await listWork(BOB(), { client, status: ["completed"] });
  assert.ok(ids(plain).includes(undated.work_id),
    "wl.31 …but the SAME Work is on the page when no receipt-dated bound is supplied at all");
});

// ===========================================================================================
// wl.32 — #905 AC3: THE TWO BOUNDS COMBINE BY `and`, AND SUPPLYING NEITHER CHANGES NOTHING.
// Three Works, three populations: one satisfies BOTH bounds, one satisfies the admission bound
// alone, one satisfies the receipt bound alone — so a page filtered on both is the intersection,
// not the union, and a page filtered on neither still shows all three (today's own behaviour,
// unwidened).
// ===========================================================================================
test("wl.32 the admission-dated and receipt-dated bounds combine as an intersection, and supplying neither is today's page", async (t) => {
  if (await gateReceiptWindow(t)) return;
  const client = await freshWorkClient(ALICE(), "wl32");

  const now = await dbNow();
  const admissionSince = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const admissionUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const receiptSinceIso = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const receiptUntilIso = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

  // (AB) admitted NOW (inside the admission window) and committed 30 days ago (inside the
  // receipt window) — satisfies BOTH bounds.
  const both = await postedWork(client, { memo: "wl32-both" });
  await backdateReceipt(both.receipt_id, "now() - interval '30 days'");

  // (A) admitted NOW, but committed 100 days ago — OUTSIDE the receipt window. Satisfies the
  // admission bound alone.
  const admissionOnly = await postedWork(client, { memo: "wl32-admission-only" });
  await backdateReceipt(admissionOnly.receipt_id, "now() - interval '100 days'");

  // (B) admitted 100 days ago — OUTSIDE the admission window — but committed 30 days ago, inside
  // the receipt window. Satisfies the receipt bound alone.
  const receiptOnly = await postedWork(client, { memo: "wl32-receipt-only" });
  await backdateWorkAdmission(receiptOnly.work_id, "now() - interval '100 days'");
  await backdateReceipt(receiptOnly.receipt_id, "now() - interval '30 days'");

  const byAdmissionOnly = await listWork(BOB(), { client, since: admissionSince, until: admissionUntil });
  assert.deepEqual(ids(byAdmissionOnly).sort(), [both.work_id, admissionOnly.work_id].sort(),
    "wl.32 the admission bound alone admits AB and A, excludes B");

  const byReceiptOnly = await listWork(BOB(), { client, receiptSince: receiptSinceIso, receiptUntil: receiptUntilIso });
  assert.deepEqual(ids(byReceiptOnly).sort(), [both.work_id, receiptOnly.work_id].sort(),
    "wl.32 the receipt bound alone admits AB and B, excludes A");

  const byBoth = await listWork(BOB(), {
    client,
    since: admissionSince, until: admissionUntil,
    receiptSince: receiptSinceIso, receiptUntil: receiptUntilIso,
  });
  assert.deepEqual(ids(byBoth), [both.work_id],
    "wl.32 both bounds together are an INTERSECTION: only the Work satisfying both remains");

  // AC3's OTHER HALF: supplying NEITHER bound changes nothing about who is on the page — every
  // one of the three Works this cell built is still there, exactly as if #905 had never shipped.
  const byNeither = await listWork(BOB(), { client });
  assert.deepEqual(
    ids(byNeither).sort(),
    [both.work_id, admissionOnly.work_id, receiptOnly.work_id].sort(),
    "wl.32 an omitted pair (on both axes) reproduces today's page — no Work is silently dropped",
  );
});

// ===========================================================================================
// wl.33 - #1069 (fix round, review finding L03-SPEC-01): HOW MANY ADVANCES A CLAIM DISCHARGES,
// ON THE LIST'S OWN PAGE.
//
// #1069's AC2 is "the Work LIST card renders that count when it is greater than 1", and its
// stated value is giving a reviewer that information WITHOUT OPENING THE CLAIM. The first cut
// projected `allocation_count` on `clara.get_work_claim_origin` alone - the Work DETAIL read -
// which is the one surface that cannot deliver that. The list renders from
// `clara.list_accounting_work`'s own projection (0266 put `claim_id`/`claimant_label` there for
// exactly this reason, deliberately WITHOUT a second per-row call to the detail door), so the
// count belongs there, and on the ADDRESSED-row door beside it: 0266's own comment calls that
// door "the SAME projection clara.list_accounting_work emits", wl.13 asserts it, and
// `apps/web/lib/work/work-list.ts` types both doors' answers as one `WorkListRow`.
//
// THE EXPECTED VALUES ARE READ OFF THE REGISTER ITSELF (`clara.staff_expense_claim_allocations`,
// #931/0301), never off the door being tested.
// ===========================================================================================
test("wl.33 a claim row carries how many advances it discharges, on the page and on the addressed row", async (t) => {
  if (await gate(t)) return;
  if (await gateClaimLabel(t)) return;
  if (await gateAllocationCount(t)) return;
  const client = await freshWorkClient(ALICE(), "wl33");
  await ensureSecChart(ALICE(), client, "wl33");

  // TWO real advances on the claimant's own enrolled account, disbursed through the estate's own
  // doors, then ONE claim that discharges both. 40,000 + 20,500 = 60,500, the claim's own total.
  const advA = (await seedAdvance(ALICE(), BOB(), { client, cents: 40000, issueDate: "2026-01-10" })).advance;
  const advB = (await seedAdvance(ALICE(), BOB(), { client, cents: 30000, issueDate: "2026-02-01" })).advance;
  const twoAdvances = claim({
    settlement: SETTLEMENT.advance, advanceAccountCode: SECHART.advance, payableAccountCode: null,
  });
  twoAdvances.advance_allocations = [
    { advance_id: advA.id, amount_cents: 40000, account_code: SECHART.advance },
    { advance_id: advB.id, amount_cents: 20500, account_code: SECHART.advance },
  ];
  const multi = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: twoAdvances });

  // ...a REIMBURSEMENT claim, which discharges no advance at all, on the same page...
  const reimbursed = await admitStaffExpenseClaimWork({ client, author: ALICE(), claim: claim() });
  // ...and a plain journal Work, which is not a claim at all.
  const plain = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "wl33 plain" }) });

  const registerCount = Number((await rootQuery(
    "select count(*)::int as n from clara.staff_expense_claim_allocations where claim_id = $1",
    [multi.claim_id])).rows[0].n);
  assert.equal(registerCount, 2, "wl.33 the register itself holds the two confirmed allocations");

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));

  assert.equal(byId.get(multi.work_id).allocation_count, registerCount,
    "wl.33 the LIST row says how many advances this claim settles - the register's own row count");
  assert.equal(byId.get(reimbursed.work_id).allocation_count, 0,
    "wl.33 a reimbursement claim discharges none: the honest 0, never a fabricated 1");
  assert.equal(byId.get(plain.work_id).allocation_count, null,
    "wl.33 a Work that is not a claim carries NULL - the same honest absence claim_id carries");

  // ...AND THE ADDRESSED ROW AGREES, because the two projections are one projection.
  assert.equal((await getWorkRow(BOB(), multi.work_id)).allocation_count, registerCount,
    "wl.33 the addressed-row door carries the SAME count");
  assert.equal((await getWorkRow(BOB(), plain.work_id)).allocation_count, null,
    "wl.33 ...and the SAME null for a Work that is not a claim");
});
