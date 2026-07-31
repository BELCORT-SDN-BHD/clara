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
  await reset({ log: () => {} });
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
