// Wave C-c — the 0040 UPGRADE / BACKFILL DRILL (design section 4.4 / fix-wave C4,
// contract item E2). The x37-0037-upgrade.test.mjs idiom, applied to 0040's OWN
// deploy-onto-existing risk.
//
// WHY THIS FILE EXISTS AT ALL. x40-wave-c-c-tieout.test.mjs runs against a database
// where 0040 was applied to an EMPTY schema (or one carrying only the fixtures its OWN
// cells build after 0040 is already live) — clara.open_item_allocations.effective_date
// gets backfilled over ZERO pre-existing rows there, so the backfill's own risk (0040's
// header: "the ONE statement in this migration that will touch 36 rows of live
// money-adjacent data inside a quiesce window") is structurally untested by every other
// battery. This drill does what CI otherwise never does: applies 0001→0039, builds a
// REAL subledger book through the audited C-a composites (allocate_payment,
// apply_open_items, unallocate_group), and only then applies 0040 onto it.
//
// It is the sixth member of the house drill family (rig-events-upgrade / rig-docs-upgrade
// / s6-upgrade / wave-b/wb-0020-upgrade / x37-0037-upgrade) and follows their pattern
// exactly: RESET-GATED (it drops schema clara), so it SKIPS in the concurrent
// all-packages sweep — `node --test` runs files concurrently against one shared database
// and a mid-run schema drop would nuke the others — and it is wired as its OWN CI step
// against its OWN throwaway database. Run it alone:
//   PGDATABASE=clara_x40_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     node --test packages/db/tests/x40-0040-upgrade.test.mjs
//
// THE BOOK IT BUILDS: an 'allocate' group (allocate_payment against a bill), an 'apply'
// group (a generic AP credit applied against a second bill, zero GL movement), and an
// 'unallocate' (reversing the allocate group) — the three operation_kind values the
// backfill's own three-arm producer law (0040 FIX WAVE C4) exists to resolve.
//
// AND WHAT IT ASSERTS: that 0040 applies cleanly onto the populated book; that every
// 'allocate' row's effective_date equals the SETTLEMENT entry's own posting_date
// (targeted on the singular item_kind='settlement' member, never the bill's date, never
// MAX()); that every 'apply' AND 'unallocate' row's effective_date equals the row's OWN
// created_at::date (act-dated, C4's fix — NOT any economic date drawn from the paired
// items); and that the PRODUCER going forward (a fresh allocate after 0040) answers the
// identical rule the backfill just derived, so no deploy-timing split survives. A second
// test proves the backfill's hard safety net aborts atomically on a corpus it cannot
// honestly resolve.
//
// AND ONE LODGER (0040 FIX WAVE F13): x40.z-CPM, at the foot of this file. It is not an
// upgrade drill at all -- it is the complete_pending_match settled-period splice, which can
// only be reached by disabling a member-table belt (an ACCESS EXCLUSIVE lock) and therefore
// cannot run inside the concurrent battery. It lives here purely for the isolation this
// reset-gated file already has, and it applies 0040 in full before it starts.
// ===========================================================================

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rootQuery, humanQuery, withActor, namedCall, opk, idOf,
  endPool, printLaneNotes, noteLane,
  createClient, upsertPayableAccount, upsertAccountClassed, grantConsent,
  freshResolution, draftEntryV3, approveEntry, counterpartyRows, normalize,
} from "./a21-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
// 0040 FIX WAVE F13: x40.z's staged half moved here for the isolation this reset-gated file
// already has. It needs the x38 bank toolkit (stateless by construction -- see that module's
// header), never a re-implementation.
import {
  caught, addBankAccount, enterStatement, completePendingMatch, lineGroupStatus,
} from "./x38-match-fixtures.mjs";

after(async () => {
  printLaneNotes("x40-0040-upgrade");
  await endPool();
});

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Copy 0001–0039 (NOT 0040) into a throwaway dir for the partial migrate. */
function exportPre0040() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0040-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^00(0[1-9]|[12][0-9]|3[0-9])_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

// The drill's own chart -- deliberately grepped clean against every other battery's codes.
const AP1 = "460-U40";
const BANK = "160-U40";
const EXPN = "560-U40";
const REVN = "660-U40";

async function freshDb() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  const { sweepChainMintedRoles } = await import("./rig-cluster-reset.mjs");
  // Cluster-wide role survival: this file's three callers (:271, :378, :436) each
  // replay to the real frontier, and roles are cluster-wide — see
  // tests/rig-cluster-reset.mjs's header (review-518 D1/D2). Requires
  // CLARA_RIG_ALLOW_ROLE_SWEEP=1 (set by the action on this step).
  await reset({ log: () => {} });
  await sweepChainMintedRoles({ log: () => {} });
  await migrate({ dir: exportPre0040(), log: () => {} });
  return { migrate };
}

async function buildChart(sub, client) {
  await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (u40)", opKey: opk("u40ap") });
  await upsertAccountClassed(sub, { client, code: BANK, name: "Bank (u40)", type: "asset", opKey: opk("u40bank") });
  await upsertAccountClassed(sub, { client, code: EXPN, name: "Purchases (u40)", type: "expense", opKey: opk("u40exp") });
  await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (u40)", type: "income", opKey: opk("u40rev") });
}

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** Birth a vendor counterparty through draft+approve of a tiny NON-control entry. */
async function birth(sub, { client, name }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `u40 birth ${name}`,
    lines: [
      { account_code: EXPN, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: BANK, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: { new: { name } }, opKey: opk("u40birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u40birtha") });
  const want = normalize(name);
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the counterparty ${name} was born (mandatory setup)`);
  return cp.id;
}

/** A plain approved 2-leg control entry, counterparty-stamped on the payable leg. */
async function approvedGeneric(sub, { client, cp, debit, credit, cents, memo, postingDate }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: { existing_id: cp }, opKey: opk("u40gen"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u40gena") });
  return d.entry_id;
}

/** An open AP item for `cp` (Dr expense / Cr payable control). */
async function openApItem(sub, { client, cp, cents, postingDate }) {
  const entry = await approvedGeneric(sub, { client, cp, debit: EXPN, credit: AP1, cents, memo: "u40 bill", postingDate });
  const items = (await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1", [entry])).rows.map((x) => x.row);
  assert.equal(items.length, 1, "an AP control entry mints exactly ONE item");
  return { entry, item: items[0].id };
}

// ---------------------------------------------------------------------------
// The C-a composites -- NAMED args verbatim from the pinned interface (mirrors the
// x37-0037-upgrade / x37-wave-c-a-subledger local rebuilds -- file-local there too).
// ---------------------------------------------------------------------------

async function allocatePayment(sub, { client, counterparty, postingDate, memo = "u40 payment", bankAccount = BANK, amountCents, allocations, controlAccount = AP1, opKey = null }) {
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
    { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
    { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" }, { name: "p_control_account" },
  ];
  const vals = [client, counterparty, postingDate, memo, bankAccount, amountCents, JSON.stringify(allocations), opKey ?? opk("u40-pay"), controlAccount];
  const r = await humanQuery(sub, namedCall("allocate_payment", specs), vals);
  return r.rows[0].result;
}

async function unallocateGroup(sub, { client, group, reason = "u40 unallocate", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("unallocate_group", [{ name: "p_client" }, { name: "p_group" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, group, reason, opKey ?? opk("u40-unalloc")],
  );
  return r.rows[0].result;
}

async function applyOpenItems(sub, { client, applications, reason = "u40 apply", opKey = null }) {
  const r = await humanQuery(
    sub,
    namedCall("apply_open_items", [{ name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, JSON.stringify(applications), reason, opKey ?? opk("u40-apply")],
  );
  return r.rows[0].result;
}

const groupOf = (receipt) => idOf(receipt, "group_id", "application_group", "group");

async function allocationRows(group) {
  const r = await rootQuery(
    "select to_jsonb(x) as row from clara.open_item_allocations x where x.application_group=$1 order by x.created_at, x.id",
    [group],
  );
  return r.rows.map((x) => x.row);
}

async function columnExists(table, column) {
  const r = await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
    [table, column],
  );
  return r.rowCount === 1;
}

// ===========================================================================
// THE DRILL.
// ===========================================================================
test("0040 upgrade drill: a real 0001->0039 subledger book (allocate + apply + unallocate) gets its effective_date backfilled per C4's ruled semantics on apply", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();
  assert.equal(await columnExists("open_item_allocations", "effective_date"), false, "the drill really starts pre-0040 (no effective_date column)");

  // -------------------------------------------------------------------------
  // THE BOOK, built through the audited C-a composites on a database that has never seen 0040.
  // -------------------------------------------------------------------------
  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice;
  const firm = w.firms.A;
  const client = await createClient(sub, { name: `u40_book_${randomUUID().slice(0, 6)}`, opKey: opk("u40cli") });
  await buildChart(sub, client);
  await grantConsent(sub, { firm, client }).catch(() => {});

  const vendorA = await birth(sub, { client, name: `U40 VENDOR A ${randomUUID().slice(0, 6)}` });
  const vendorB = await birth(sub, { client, name: `U40 VENDOR B ${randomUUID().slice(0, 6)}` });

  // (1) THE ALLOCATE GROUP. Bill RM1,000 posted 2033-02-01; paid RM1,000 via allocate_payment
  // posted 2033-03-15 -- a DIFFERENT date from the bill's own, so the assert below can actually
  // discriminate "the settlement entry's posting_date" from "the target item's" or a MAX().
  const bill1 = await openApItem(sub, { client, cp: vendorA, cents: 100000, postingDate: "2033-02-01" });
  const payReceipt = await allocatePayment(sub, {
    client, counterparty: vendorA, postingDate: "2033-03-15", memo: "u40 payment (allocate anchor)",
    amountCents: 100000, allocations: [{ item_id: bill1.item, amount_cents: 100000 }],
  });
  const allocateGroup = groupOf(payReceipt);
  assert.ok(allocateGroup, "allocate_payment's receipt names its application_group");

  // (2) THE APPLY GROUP. A second bill + a generic AP credit note, applied together (ZERO GL
  // movement, WCA-R3 pair mechanics) on a THIRD date (2033-04-20) -- the act date, not either
  // paired item's own entry date (2033-02-10 / 2033-04-20 itself), proving apply is act-dated,
  // never economic-dated.
  const bill2 = await openApItem(sub, { client, cp: vendorB, cents: 50000, postingDate: "2033-02-10" });
  const creditEntry = await approvedGeneric(sub, { client, cp: vendorB, debit: AP1, credit: REVN, cents: 20000, memo: "u40 credit note", postingDate: "2033-04-20" });
  const creditItems = (await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1", [creditEntry])).rows.map((x) => x.row);
  assert.equal(creditItems.length, 1, "the credit note mints exactly one item");
  const applyReceipt = await applyOpenItems(sub, {
    client, applications: [{ source_item_id: creditItems[0].id, target_item_id: bill2.item, amount_cents: 20000 }],
  });
  const applyGroup = groupOf(applyReceipt);
  assert.ok(applyGroup, "apply_open_items' receipt names its application_group");

  // (3) THE UNALLOCATE. Reverse the allocate group -- a FRESH set of operation_kind='unallocate'
  // rows; the original 'allocate' rows are untouched (append-only, reverse-not-delete).
  await unallocateGroup(sub, { client, group: allocateGroup });

  // -------------------------------------------------------------------------
  // THE CORPUS THE BACKFILL WILL SCAN. Asserted BEFORE the apply, so "the backfill resolved it"
  // is a statement about real rows rather than an empty table.
  // -------------------------------------------------------------------------
  const preRows = (await rootQuery(
    "select operation_kind, count(*)::int as n from clara.open_item_allocations group by operation_kind order by operation_kind",
  )).rows;
  noteLane(`pre-0040 corpus by operation_kind: ${JSON.stringify(preRows)}`);
  for (const kind of ["allocate", "apply", "unallocate"]) {
    assert.ok(preRows.some((r) => r.operation_kind === kind), `the pre-0040 book carries ${kind} rows for the backfill to resolve`);
  }

  // =========================================================================
  // APPLY 0040 ONTO THE POPULATED DATABASE.
  // =========================================================================
  await migrate({ dir: MIG_DIR, log: () => {} });
  assert.ok(await columnExists("open_item_allocations", "effective_date"), "0040 applied onto the populated database -- effective_date landed");

  // (a) ALLOCATE rows: effective_date = the settlement entry's OWN posting_date (2033-03-15) --
  // the bill posted 2033-02-01, so a wrong derivation (the target item's date, or MAX() over the
  // group) would be caught here.
  const allocRows = await allocationRows(allocateGroup);
  assert.ok(allocRows.length > 0, "the allocate group carries rows to check");
  for (const r of allocRows) {
    assert.equal(r.effective_date, "2033-03-15", `allocate row ${r.id}: effective_date = the settlement entry's posting_date, not the bill's (2033-02-01) or a MAX()`);
  }

  // (b) APPLY rows: effective_date = the row's OWN created_at::date [0040 FIX WAVE C4] -- ACT
  // dated, never the 2033-02-10 / 2033-04-20 economic dates of the paired items' own entries.
  const applyRows = await allocationRows(applyGroup);
  assert.ok(applyRows.length > 0, "the apply group carries rows to check");
  for (const r of applyRows) {
    const createdDate = String(r.created_at).slice(0, 10);
    assert.equal(r.effective_date, createdDate, `apply row ${r.id}: effective_date = created_at::date (${createdDate}), the ACT date -- C4's fix, not an economic date drawn from the paired items`);
  }

  // (c) UNALLOCATE rows: effective_date = the row's OWN created_at::date -- this arm was already
  // correct pre-0040 (the design's own house reverse-not-delete precedent); the backfill still
  // re-derives it identically, byte-same rule as (b).
  //
  // MEASURED THIS SESSION (rig verification, real run): unallocate_group writes its reversal
  // rows under a FRESH, DIFFERENT application_group -- never the original allocate group's id --
  // so the lookup joins through reverses_allocation_id back to the ORIGINAL allocate rows
  // instead of assuming group continuity.
  const unallocRows = (await rootQuery(
    `select to_jsonb(x) as row from clara.open_item_allocations x
      where x.operation_kind='unallocate'
        and x.reverses_allocation_id in (
          select id from clara.open_item_allocations where application_group=$1)`,
    [allocateGroup],
  )).rows.map((x) => x.row);
  assert.ok(unallocRows.length > 0, "the unallocate wrote rows to check");
  for (const r of unallocRows) {
    const createdDate = String(r.created_at).slice(0, 10);
    assert.equal(r.effective_date, createdDate, `unallocate row ${r.id}: effective_date = created_at::date (${createdDate})`);
  }

  // (d) THE PRODUCER GOING FORWARD carries the IDENTICAL rule (0040 FIX WAVE C4's whole point:
  // "no deploy-timing-dependent split"). A fresh allocate AFTER 0040 answers the same question
  // the backfilled rows above just answered.
  const bill3 = await openApItem(sub, { client, cp: vendorA, cents: 30000, postingDate: "2033-05-01" });
  const payReceipt2 = await allocatePayment(sub, {
    client, counterparty: vendorA, postingDate: "2033-05-20", memo: "u40 post-0040 payment",
    amountCents: 30000, allocations: [{ item_id: bill3.item, amount_cents: 30000 }],
    opKey: opk("u40-pay2"),
  });
  const group2 = groupOf(payReceipt2);
  const rows2 = await allocationRows(group2);
  assert.ok(rows2.length > 0, "the post-0040 allocate group carries rows to check");
  for (const r of rows2) {
    assert.equal(r.effective_date, "2033-05-20", `post-0040 allocate row ${r.id}: the LIVE producer stamps the settlement entry's posting_date, byte-same as the backfill's own rule`);
  }
});

// ===========================================================================
// THE ABORT SIDE. A drill that only ever shows a SUCCESSFUL apply cannot tell you the hard
// safety net (0040's own "refusing to proceed on a guess") is wired at all. This one stages
// a corpus the backfill genuinely cannot resolve and requires the migration to REFUSE.
//
// THE FORGED SHAPE, HONESTLY LABELLED. No audited verb can produce an 'allocate' row with no
// item_kind='settlement' member in its own application_group: allocate_payment/allocate_receipt
// always write BOTH halves of the balanced pair in the SAME transaction (0037's own pair
// mechanics). This shape -- an 'allocate' row naming a REAL, live target item, in a group that
// carries no settlement member at all -- is therefore reachable only by a root direct insert,
// exactly the gap the backfill's hard safety net exists to catch on a real book it did not build.
// ===========================================================================
test("0040 upgrade drill (abort side): an 'allocate' row orphaned from any item_kind='settlement' member REFUSES the migration, atomically", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice;
  const firm = w.firms.A;
  const client = await createClient(sub, { name: `u40_abort_${randomUUID().slice(0, 6)}`, opKey: opk("u40acli") });
  await buildChart(sub, client);
  await grantConsent(sub, { firm, client }).catch(() => {});

  const vendor = await birth(sub, { client, name: `U40 ABORT VENDOR ${randomUUID().slice(0, 6)}` });
  const bill = await openApItem(sub, { client, cp: vendor, cents: 40000, postingDate: "2033-06-01" });
  // A second, opposite-signed AP item -- NOT a settlement -- so the forged group can net to
  // zero (MEASURED THIS SESSION: a real belt refuses any application_group that does not net to
  // zero per client+domain) while still carrying NO item_kind='settlement' member anywhere in it.
  const creditEntry = await approvedGeneric(sub, { client, cp: vendor, debit: AP1, credit: REVN, cents: 40000, memo: "u40 abort-side credit", postingDate: "2033-06-02" });
  const creditItems = (await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1", [creditEntry])).rows.map((x) => x.row);
  assert.equal(creditItems.length, 1, "the abort-side credit mints exactly one item");

  const orphanGroup = randomUUID();
  await withActor({}, (c) => c.query(
    `insert into clara.open_item_allocations(firm_id, client_id, domain, item_id, application_group, operation_kind, amount_cents, reason, created_by)
     values ($1,$2,'ap',$3,$4,'allocate',$5,'u40 forged orphan allocate row -- no settlement member exists for this group', $6),
            ($1,$2,'ap',$7,$4,'allocate',$8,'u40 forged orphan allocate row -- the balancing leg', $6)`,
    [firm, client, bill.item, orphanGroup, -40000, sub, creditItems[0].id, 40000],
  ));
  assert.equal(
    (await rootQuery(
      "select count(*)::int as n from clara.open_item_allocations x where x.application_group=$1 and x.item_id in (select id from clara.open_items where item_kind='settlement')",
      [orphanGroup],
    )).rows[0].n,
    0, "the forged group really carries NO item_kind='settlement' member (mandatory setup -- the exact gap the backfill's anchor join cannot resolve)",
  );

  await assert.rejects(
    () => migrate({ dir: MIG_DIR, log: () => {} }),
    /could not be resolved to an anchor entry/i,
    "0040 REFUSES a corpus carrying an 'allocate' row orphaned from any item_kind='settlement' member -- the hard safety net, not a silent guess",
  );
  // Atomic: the refusal rolled the whole migration back -- no half-built column, no partial tail.
  assert.equal(await columnExists("open_item_allocations", "effective_date"), false, "the abort rolled 0040 back whole (effective_date never landed)");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.schema_migrations where version ~ '^0040_'")).rows[0].n,
    0, "...and 0040 is not recorded as applied",
  );
  noteLane("0040 backfill hard-safety-net ABORT verified: an orphaned allocate row -- unbuildable through the audited verbs -- blocks the apply and rolls back atomically");
});

// ===========================================================================
// x40.z-CPM -- THE complete_pending_match SETTLED-PERIOD SPLICE, DISCRIMINATED
// (0040 FIX WAVE F13 + F18, the delta round's MAJOR 7).
//
// WHY IT LIVES IN *THIS* FILE AND NOT IN x40-wave-c-c-tieout.test.mjs (F13).
// The only way to reach this guard is to stage its prestate by hand -- a PENDING
// reservation on a line whose statement is already reconciled -- and no lawful
// sequence of audited verbs can produce one (the walk-through is below). Staging
// means `ALTER TABLE clara.bank_match_line_members DISABLE TRIGGER`, which takes
// an ACCESS EXCLUSIVE lock on a table other packages' suites write concurrently
// against the same shared CI database. A lock that coarse has no business in the
// concurrent battery. This file is RESET-GATED (it drops schema clara) and
// therefore already runs ALONE against its OWN throwaway database -- exactly the
// isolation this cell needs, at no extra cost.
//
// WHY NO LAWFUL SEQUENCE OF AUDITED VERBS CAN REACH IT (Cluster A as shipped:
// A1/A4/A5/A6 all live). A period can NEVER complete while ANY of its own lines
// carries a PENDING reservation (recon_line_reserved, checked before the chain
// law), and the chain law then refuses recon_prior_missing on every LATER period
// on the SAME account too -- so "the pending line's own statement, or anything
// after it on that account, reaches complete" is structurally unreachable while
// the reservation stays pending. Voiding the pending line's statement to free it
// is closed as well (void_bank_statement refuses while any line rides a pending
// OR live match). And attaching a FRESH reservation to an already-settled line
// is closed by A4: the belt's member-INSERT carve-out admits ONLY a line whose
// exception is RESOLVED as matched_booking / written_off_adjustment, and by A1's
// narrowed completion precondition such a line can only have settled its period
// while STILL live-matched -- so it is never simultaneously free for a new
// reservation. Every reachable path circles back to the same wall. This is a
// defence-in-depth guard, staged honestly.
//
// AND WHY THE BELT IS DISABLED FOR THE **ACT**, NOT ONLY FOR THE STAGING (F18).
// The previous cut re-enabled t_bmlm_settled_authority before calling the verb,
// so the deferred belt was armed during the act -- and complete_pending_match's
// own member UPDATE (pending -> live) queues that belt, which raises the SAME
// recon_period_settled token at commit. The cell was therefore green whether or
// not the S4.3 splice existed at all: delete the splice and the belt answers in
// its place. Here BOTH member-table belts stay disabled across the act, so the
// spliced guard is the ONLY thing left that can raise -- and it must, which is
// what "the verb refuses" actually means. The belt's own live behaviour is
// proven separately, and with nothing disabled, by x40.z in the main battery.
// ===========================================================================
test("x40.z-CPM complete_pending_match's OWN spliced guard refuses recon_period_settled -- proven with both settled-authority belts disabled across the act, so nothing else can raise it", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();
  await migrate({ dir: MIG_DIR, log: () => {} }); // ...and 0040 on top: this cell tests 0040 itself
  assert.ok(await columnExists("open_item_allocations", "effective_date"), "x40.z-CPM mandatory setup: 0040 is applied");

  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice; // firm A's OWNER -- except_bank_line sits at the owner floor
  const firm = w.firms.A;
  const client = await createClient(sub, { name: `u40_cpm_${randomUUID().slice(0, 6)}`, opKey: opk("u40ccli") });
  await buildChart(sub, client);
  await grantConsent(sub, { firm, client }).catch(() => {});

  // An isolated bank account: every S3 term is ACCOUNT-scoped and ALL-TIME, so the drill's own
  // subledger book (on BANK) must not be able to reach this month's identity.
  const CPMCOA = "161-U40";
  await upsertAccountClassed(sub, { client, code: CPMCOA, name: "x40.z-CPM bank gl", type: "asset", opKey: opk("u40cpmgl") });
  const added = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: `1099${randomUUID().slice(0, 10)}`, coaAccountCode: CPMCOA });
  const bankAccountId = idOf(added, "bank_account_id", "id");

  // A month whose single line is settled by an OPEN exception -- the identity ties on excepted(P)
  // alone (closing -900 = anchor 0 + gl' 0 - outstanding 0 + excepted -900), so the period
  // certifies while the line carries NO membership of its own.
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAccountId, periodStart: "2033-11-01", periodEnd: "2033-11-30", opening: 0,
    specs: [{ amountCents: -900, entryDate: "2033-11-11", description: "u40 cpm the disputed debit" }],
    keepPeriod: true,
  });
  await humanQuery(sub, namedCall("except_bank_line", [
    { name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" },
  ]), [stmt.lines[0].id, "bank_error", "u40 cpm the line this cell forges a reservation onto", opk("u40cpmexc")]);
  const receipt = (await humanQuery(sub, namedCall("complete_bank_reconciliation", [
    { name: "p_statement" }, { name: "p_ack_outstanding", cast: "uuid[]" }, { name: "p_op_key" },
  ]), [stmt.statementId, [], opk("u40cpmcomplete")])).rows[0].result;
  assert.equal(
    (await rootQuery("select status from clara.bank_reconciliations where id=$1", [idOf(receipt, "reconciliation_id", "id")])).rows[0].status,
    "complete", "x40.z-CPM mandatory setup: the open-excepted line settles the period cleanly",
  );
  assert.equal((await lineGroupStatus(stmt.lines[0].id)).length, 0, "x40.z-CPM mandatory setup: the line carries no live/pending member -- free for the forged insert");

  // A real (unapproved) draft backs the reservation: complete_pending_match's own preflight
  // (a reservation with nothing to complete would hold the line forever) refuses a NULL
  // draft_entry_id long before it reaches the guard under test.
  const forgedDraft = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "u40 cpm forged reservation's draft",
    postingDate: "2033-11-11",
    lines: [
      { account_code: EXPN, debit_cents: 900, credit_cents: 0, description: "cpm dr" },
      { account_code: CPMCOA, debit_cents: 0, credit_cents: 900, description: "cpm cr" },
    ],
    opKey: opk("u40cpmdraft"),
  });

  const forgedMatch = randomUUID();
  const belts = [
    ["bank_match_line_members", "t_bmlm_settled_authority"],
    ["bank_match_entry_members", "t_bmem_settled_authority"],
  ];
  try {
    // Postgres refuses ALTER TABLE ... ENABLE/DISABLE TRIGGER while the SAME transaction still
    // carries a pending deferred trigger event for that table (55006), so the disable, the
    // staging transaction, the act and the re-enable are each their own transaction.
    for (const [tbl, trg] of belts) {
      await withActor({}, (c) => c.query(`alter table clara.${tbl} disable trigger ${trg}`));
    }
    // withActor only wraps an explicit begin/commit when transaction:true -- without it the
    // bank_matches INSERT autocommits alone and trips the 0038 group-tie belt (match_group_empty)
    // before the member row lands.
    await withActor({ transaction: true }, async (c) => {
      await c.query(
        `insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin, draft_entry_id, created_by)
         values ($1, (select firm_id from clara.clients where id=$2), $2, $3, 'pending', 'human', $5, $4)`,
        [forgedMatch, client, bankAccountId, sub, forgedDraft.entry_id],
      );
      await c.query(
        `insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id, bank_account_id, amount_cents, group_status, created_by)
         values ((select firm_id from clara.clients where id=$1), $1, $2, $3, $4, -900, 'pending', $5)`,
        [client, forgedMatch, stmt.lines[0].id, bankAccountId, sub],
      );
    });
    assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "pending", "x40.z-CPM mandatory setup: the forged reservation landed pending");

    // THE ACT, with both belts still disabled (F18): only the S4.3 splice can raise now.
    const denied = await caught(() => completePendingMatch(sub, { client, match: forgedMatch, opKey: opk("u40cpmact") }));
    assert.ok(denied, "x40.z-CPM complete_pending_match must refuse -- flipping this reservation live would move a term the receipt already certified");
    assert.equal(denied.code, "CLR10", `x40.z-CPM expected CLR10 (got ${denied.code} -- ${denied.message})`);
    assert.equal(
      JSON.parse(denied.detail ?? "{}").reason, "recon_period_settled",
      `x40.z-CPM the refusal must be the VERB's OWN spliced recon_period_settled guard -- with both settled-authority belts disabled nothing else can produce it (got ${denied.detail})`,
    );
    assert.equal((await lineGroupStatus(stmt.lines[0].id))[0], "pending", "x40.z-CPM the reservation is untouched -- the verb refused before mutating the member row (which is also why the disabled belts cannot be what raised)");
    assert.equal(
      (await rootQuery("select status from clara.journal_entries where id=$1", [forgedDraft.entry_id])).rows[0].status,
      "draft", "x40.z-CPM ...and the backing draft was never approved -- the refusal is strictly BEFORE the verb's own writes",
    );
    noteLane("x40.z-CPM: the complete_pending_match splice refused recon_period_settled with both member belts disabled -- the guard is the verb's own, not the belt answering in its place");
  } finally {
    for (const [tbl, trg] of belts) {
      await withActor({}, (c) => c.query(`alter table clara.${tbl} enable trigger ${trg}`)).catch(() => {});
    }
  }
});
