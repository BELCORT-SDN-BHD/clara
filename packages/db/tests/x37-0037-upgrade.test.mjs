// Wave C-a — the 0037 UPGRADE / BACKFILL DRILL (design section 4.4, WCA-R4/R9a).
//
// WHY THIS FILE EXISTS AT ALL. x37-wave-c-a-subledger.test.mjs runs against a database
// where 0037 was applied to an EMPTY schema: its §0 live probes scanned zero rows, its §J
// backfill wrote zero items, and its D1/D2 tail asserts compared zero to zero. Every one of
// them PASSED, and none of them was exercised. The migration's whole risk lives in the half
// that battery structurally cannot reach — the deploy onto a database that already has a
// book — and the ceremony that matters (four live firms, one shared database) is exactly
// that deploy. So this drill does what CI otherwise never does: applies 0001→0036, builds a
// REAL book through the audited verbs, and only then applies 0037 onto it.
//
// It is the fifth member of the house drill family (rig-events-upgrade / rig-docs-upgrade /
// s6-upgrade / wave-b/wb-0020-upgrade) and follows their pattern exactly: RESET-GATED
// (it drops schema clara), so it SKIPS in the concurrent all-packages sweep — `node --test`
// runs files concurrently against one shared database and a mid-run schema drop would nuke
// the others — and it is wired as its OWN CI step against its OWN throwaway database.
// Run it alone:
//   PGDATABASE=clara_x37_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     node --test packages/db/tests/x37-0037-upgrade.test.mjs
//
// THE BOOK IT BUILDS (every shape the backfill's five classifier ladders have to survive):
//   · a typed supplier_bill through the wake lane          → ladder 3, ap `bill`
//   · a sales_invoice and a sales_credit_note              → ladder 3, ar `invoice`/`credit_note`
//   · a multi-COUNTERPARTY generic JV                      → ladder 5, one item per party
//   · an approved reversal PAIR over that JV               → ladder 1, the unwind pass
//   · a counterparty MERGED after approval, collapsing TWO parties of ONE entry into one
//     (the CX-B3 case: the negation must aggregate per CANONICAL party, not per stored id)
//   · a full approved OPENING seed through the K-block verbs, including a counterparty-
//     stamped ar_open_item                                 → ladder 2 + approve path 3
//   · a WITHDRAWN opening draft whose opening_items row survives it (design §2.3: opening
//     items materialise at DRAFT, so status='approved' is load-bearing in every read)
//
// AND WHAT IT ASSERTS AFTERWARDS: that the §0 probes ran against real rows (with a second
// test proving they ABORT a violating corpus atomically), that the reversal pass decomposed
// on pass ≥1 with created_in_migration=true, that D1 (per-entry) and D2 (per client×domain
// tie) hold NON-VACUOUSLY, that re-running the §J body is a no-op, and that a merge
// performed after approval does not wedge reverse_entry afterwards.
//
// TWO DEVIATIONS, STATED, BOTH FORCED BY THE K-FAMILY BOUNDARY. (1) The K6 supersede/
// replacement shape is modelled by its STRUCTURE — an approved opening entry with control
// legs and NO opening_items row, which is exactly what a K6 replacement mirror gets
// (0017:4105-4118) — rather than by driving supersede_opening_item +
// approve_opening_correction; what 0037 has to survive is the shape, and the K6 verb chain
// itself is covered by the wave-b K battery. (2) The withdrawn opening draft is staged
// directly, because clara.withdraw_draft REFUSES opening entries (0017's CLR31
// `opening_entry_k_family_only`) and no K-family verb withdraws a staged draft either —
// yet §2.3 names the state, so it is put under the backfill the only way it can be.
// Everything a verb CAN build is built through the verb.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rootQuery, endPool, printLaneNotes, noteLane, opk, withActor,
  firmOf, createClient, upsertPayableAccount, upsertAccountClassed, grantConsent,
  freshResolution, draftEntryV3, approveEntry, reverseEntry,
  counterpartyRows, normalize, mergeCounterparties,
  seedCitedDocument, invoiceFactsTask, mintLegacyInvoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, statedIdentityFields, agreedEnvelope, factsRegion, mintInteractive, wakeDraftEntry,
  ev, FIELD, billLines, rm,
} from "./a21-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

after(async () => {
  printLaneNotes("x37-0037-upgrade");
  await endPool();
});

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Copy 0001–0036 (NOT 0037) into a throwaway dir for the partial migrate. */
function exportPre0037() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0037-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^00(0[1-9]|[12][0-9]|3[0-6])_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
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

// The drill's own chart. Deliberately TWO payable control accounts: the tie identity is per
// DOMAIN and must sum over every account of the class, and a single-account book would hide
// a backfill that ties per account instead.
const AR1 = "360-U37";
const AP1 = "460-U37";
const AP2 = "461-U37";
const BANK = "160-U37";
const EXPN = "560-U37";
const REVN = "660-U37";

async function freshDb() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0037(), log: () => {} });
  return { migrate };
}

async function buildChart(sub, client) {
  await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (u37)", type: "asset", accountClass: "receivable", opKey: opk("u37ar") });
  await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (u37)", opKey: opk("u37ap1") });
  await upsertPayableAccount(sub, { client, code: AP2, name: "Trade Creditors - accruals (u37)", opKey: opk("u37ap2") });
  await upsertAccountClassed(sub, { client, code: BANK, name: "Bank (u37)", type: "asset", opKey: opk("u37bank") });
  await upsertAccountClassed(sub, { client, code: EXPN, name: "Purchases (u37)", type: "expense", opKey: opk("u37exp") });
  await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (u37)", type: "income", opKey: opk("u37rev") });
}

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** Birth a counterparty through draft+approve of a tiny NON-control entry. */
async function birth(sub, { client, name, kind = "vendor" }) {
  const proposal = { new: { name } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `u37 birth ${name}`,
    lines: [
      { account_code: EXPN, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: BANK, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: proposal, opKey: opk("u37birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u37birtha") });
  const want = normalize(name);
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the counterparty ${name} was born (mandatory setup)`);
  assert.equal(cp.kind, kind, `${name} was born with kind='${kind}'`);
  return cp.id;
}

/** A facts-complete cited document (zero tax, net = total) for the typed lanes. */
async function citedDoc(sub, { client, gross }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(gross), kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, rm(gross)),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, "U37 COUNTERPARTY SDN BHD"),
    factField(FIELD.invoiceId, `U37-${randomUUID().slice(0, 8)}`),
    ...statedIdentityFields(gross),
  ], { envelope: agreedEnvelope() });
  return cited;
}

/** A typed entry through the wake drafter (the only lane that carries a coding_kind). */
async function typedEntry(sub, { client, cp, cents, codingKind, lines }) {
  const firm = await firmOf(client);
  const cited = await citedDoc(sub, { client, gross: cents });
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, FIELD.total);
  const kindIsSales = codingKind.startsWith("sales_");
  const d = await wakeDraftEntry(cred, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines, document: cited.documentId, sha256: cited.sha256,
    vendor: kindIsSales ? { existing_id: cp, kind: "customer" } : { existing_id: cp },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind, opKey: opk("u37typed"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u37typeda") });
  return { entry: d.entry_id, ...cited };
}

// ---------------------------------------------------------------------------
// Readbacks. Root (superuser bypasses RLS): assertions only, never the lane.
// ---------------------------------------------------------------------------

async function controlGl(client, domain) {
  const cls = domain === "ar" ? "receivable" : "payable";
  const net = domain === "ar" ? "l.debit_cents - l.credit_cents" : "l.credit_cents - l.debit_cents";
  const r = await rootQuery(
    `select coalesce(sum(${net}),0)::bigint as n
       from clara.journal_lines l
       join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and a.account_class=$2 and e.status='approved'`,
    [client, cls],
  );
  return Number(r.rows[0].n);
}

async function itemsSum(client, domain) {
  const r = await rootQuery(
    "select coalesce(sum(amount_cents),0)::bigint as n from clara.open_items where client_id=$1 and domain=$2",
    [client, domain],
  );
  return Number(r.rows[0].n);
}

async function itemsOf(entry) {
  const r = await rootQuery(
    "select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1 order by i.domain, i.counterparty_id",
    [entry],
  );
  return r.rows.map((x) => x.row);
}

async function tableExists(name) {
  return (await rootQuery("select to_regclass($1) as rel", [`clara.${name}`])).rows[0].rel != null;
}

// ===========================================================================
// THE DRILL.
// ===========================================================================
test("0037 upgrade drill: a real 0001→0036 book decomposes on apply — probes on real rows, the reversal pass, a non-vacuous tie, and an idempotent re-run", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();
  assert.equal(await tableExists("open_items"), false, "clara.open_items does not exist under 0001–0036 (the drill really starts pre-0037)");

  // -------------------------------------------------------------------------
  // THE BOOK, built through the audited verbs on a database that has never seen 0037.
  // -------------------------------------------------------------------------
  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice;
  const firm = w.firms.A;
  const book = await createClient(sub, { name: `u37_book_${randomUUID().slice(0, 6)}`, opKey: opk("u37cli") });
  await buildChart(sub, book);
  await grantConsent(sub, { firm, client: book }).catch(() => {});

  const vendorA = await birth(sub, { client: book, name: `U37 VENDOR A ${randomUUID().slice(0, 6)}` });
  const vendorB = await birth(sub, { client: book, name: `U37 VENDOR B ${randomUUID().slice(0, 6)}` });
  const vendorC = await birth(sub, { client: book, name: `U37 VENDOR C ${randomUUID().slice(0, 6)}` });
  const vendorD = await birth(sub, { client: book, name: `U37 VENDOR D ${randomUUID().slice(0, 6)}` });
  const customer = await birth(sub, { client: book, name: `U37 CUSTOMER ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // (1) a TYPED supplier_bill — the ADR-050 production shape, and the F3 debt itself.
  const bill = await typedEntry(sub, {
    client: book, cp: vendorC, cents: 250000, codingKind: "supplier_bill",
    lines: billLines(EXPN, AP1, 250000),
  });
  // (2) a sales invoice and (3) a sales credit note — ladder 3's other two labels, with the
  // sign law on the CN (Cr receivable) that the item matrix enforces.
  const inv = await typedEntry(sub, {
    client: book, cp: customer, cents: 180000, codingKind: "sales_invoice",
    lines: [
      { account_code: AR1, debit_cents: 180000, credit_cents: 0, description: "sales-ar" },
      { account_code: REVN, debit_cents: 0, credit_cents: 180000, description: "sales-rev" },
    ],
  });
  const cn = await typedEntry(sub, {
    client: book, cp: customer, cents: 20000, codingKind: "sales_credit_note",
    lines: [
      { account_code: AR1, debit_cents: 0, credit_cents: 20000, description: "cn-ar" },
      { account_code: REVN, debit_cents: 20000, credit_cents: 0, description: "cn-rev" },
    ],
  });

  // (4) a MULTI-COUNTERPARTY generic JV. No verb can build this — draft_entry stamps ONE
  // resolved counterparty on every control line — so it is constructed directly, which is
  // also honest about where such rows come from in a real book (an import, an older lane).
  // Two payable legs, two parties, two DIFFERENT control accounts.
  const jv = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft','2026-01-20','u37 multi-counterparty accrual','manual',$3) returning id`,
      [firm, book, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,90000,0,'accrued expense',null),
             ($1,2,$3,0,50000,'party A',$4),
             ($1,3,$5,0,40000,'party B',$6)`,
      [id, EXPN, AP1, vendorA, AP2, vendorB],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, w.users.bob],
    );
    return id;
  });

  // (5) an APPROVED REVERSAL PAIR over that JV (below the high-stakes threshold, so the
  // mirror approves inline). At 0036 this writes no subledger state at all — which is the
  // point: 0037's backfill has to decompose BOTH halves and have them cancel.
  await reverseEntry(w.users.bob, { entry: jv, reason: "u37 accrual reversed", opKey: opk("u37rev") });
  const jvMirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [jv])).rows[0].id;

  // (6) THE MERGE, performed AFTER both halves were approved (the CX-B3 / AB-M2 case).
  // A merges into B, so ONE canonical party now owes the whole RM900 — and the mirror's
  // negation has to aggregate per canonical party, not per stored id, or the two sides
  // decompose at different grains and the entry can never tie again.
  await mergeCounterparties(sub, { client: book, survivor: vendorB, merged: vendorA, reason: "u37 duplicate supplier", opKey: opk("u37merge") });
  assert.equal(
    (await rootQuery("select merged_into from clara.counterparties where id=$1", [vendorA])).rows[0].merged_into,
    vendorB, "vendor A really merged into vendor B (mandatory setup for the collapse case)",
  );

  // (7) a plain generic AR entry (ladder 5's `adjustment`) so the ar domain carries a
  // non-typed shape too.
  const adjEntry = await (async () => {
    const d = await draftEntryV3(sub, {
      client: book, resolution: await manualRes(sub, book), memo: "u37 manual receivable accrual",
      lines: [
        { account_code: AR1, debit_cents: 65000, credit_cents: 0, description: "ar" },
        { account_code: REVN, debit_cents: 0, credit_cents: 65000, description: "rev" },
      ],
      vendor: { existing_id: customer, kind: "customer" }, opKey: opk("u37adj"),
    });
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u37adja") });
    return d.entry_id;
  })();

  // (8) THE OPENING SET, through the K-block verbs — approve path 3 (_approve_opening_entry)
  // and ladder 2. stageFullSet includes a counterparty-stamped ar_open_item, which is the
  // only shape that gives the classifier an opening_items row to take LINEAGE from.
  const onb = await wb.onboardingClient(w.users.hana);
  await wb.seedOpeningCoa(w.users.alice, onb.client);
  const st = await wb.stageFullSet(w.users.bob, { owner: w.users.alice, client: onb.client, plan: onb.plan, firm });
  await wb.approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await wb.planRevision(onb.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("u37obap"),
  });
  const openingArEntry = (await rootQuery(
    "select entry_id from clara.opening_items where seed_id=$1 and item_kind='ar_open_item'", [st.seed],
  )).rows[0]?.entry_id ?? null;
  assert.ok(openingArEntry, "the approved opening set carries a counterparty-stamped ar_open_item (mandatory setup)");
  assert.equal(
    (await rootQuery("select status from clara.journal_entries where id=$1", [openingArEntry])).rows[0].status,
    "approved", "…and its entry is approved",
  );

  // (9) the K6-REPLACEMENT SHAPE: an approved opening entry with control legs and NO
  // opening_items row (0017:4105-4118). Its item must still materialise from the LEGS, with
  // opening_item_id null — opening_items is lineage, never a row source.
  const k6 = await withActor({ transaction: true }, async (c) => {
    const r = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor,is_opening_balance)
       values($1,$2,'draft','2025-12-31','u37 K6 replacement opening','manual',$3,true) returning id`,
      [firm, book, sub],
    );
    const id = r.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$2,33000,0,'opening expense',null),($1,2,$3,0,33000,'opening payable',$4)`,
      [id, EXPN, AP1, vendorD],
    );
    await c.query(
      "update clara.journal_entries set status='approved',checker_actor=$2,approved_at=now() where id=$1",
      [id, w.users.bob],
    );
    return id;
  });

  // (10) a WITHDRAWN opening DRAFT whose opening_items row outlives it. Opening items
  // materialise at DRAFT (0017:3463-3471), so this row exists on a database where the entry
  // never reached the books — and every subledger read has to join status='approved' or the
  // backfill invents a payable nobody owes.
  const onb2 = await wb.onboardingClient(w.users.hana);
  await wb.seedOpeningCoa(w.users.alice, onb2.client);
  const st2 = await wb.stageFullSet(w.users.bob, { owner: w.users.alice, client: onb2.client, plan: onb2.plan, firm });
  const withdrawnEntry = st2.ar.entry_id;
  // The withdrawal is applied directly: clara.withdraw_draft REFUSES an opening entry by
  // design (0017's CLR31 K-family boundary, `opening_entry_k_family_only`), and no verb in
  // the K family withdraws a staged draft either — yet the design names this state
  // explicitly (§2.3) because a database that has lived through several onboarding attempts
  // has it. Staging it by construction is the only way to put the state under the backfill,
  // and the three withdrawal columns are set together because 0009's lifecycle trigger
  // (0009:556) demands them.
  await rootQuery(
    `update clara.journal_entries
        set status='withdrawn', withdrawn_by=$2, withdrawn_at=now(),
            withdrawal_reason='u37 opening item withdrawn before approval'
      where id=$1`,
    [withdrawnEntry, w.users.bob],
  );
  assert.equal(
    (await rootQuery("select status from clara.journal_entries where id=$1", [withdrawnEntry])).rows[0].status,
    "withdrawn", "the opening AR draft is withdrawn",
  );
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.opening_items where entry_id=$1", [withdrawnEntry])).rows[0].n,
    1, "…and its draft-time opening_items row SURVIVES it (this is the hazard being staged)",
  );

  // -------------------------------------------------------------------------
  // THE CORPUS THE §0 PROBES WILL SCAN. Asserted BEFORE the apply, so "the probes passed"
  // is a statement about real rows rather than about an empty table.
  // -------------------------------------------------------------------------
  const scanned = (await rootQuery(
    `select count(*)::int as n
       from clara.journal_entries e
       join clara.journal_lines l on l.entry_id=e.id
       join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where e.status='approved' and a.account_class in ('payable','receivable')`,
  )).rows[0].n;
  assert.ok(scanned >= 10, `the pre-0037 book carries a real control-leg corpus for the probes to scan (got ${scanned} lines)`);
  noteLane(`pre-0037 corpus: ${scanned} approved control-class journal lines across the drill's clients`);

  // =========================================================================
  // APPLY 0037 ONTO THE POPULATED DATABASE.
  // =========================================================================
  await migrate({ dir: MIG_DIR, log: () => {} });
  assert.equal(await tableExists("open_items"), true, "0037 applied onto the populated database");

  // (a) THE PROBES RAN AND PASSED ON REAL ROWS. They abort the migration when they hit, so a
  // successful apply over a corpus of `scanned` control lines IS the pass — and the second
  // test below proves the abort side, so this is not an argument from silence.
  const items = (await rootQuery("select count(*)::int as n from clara.open_items")).rows[0].n;
  assert.ok(items > 0, `the §J backfill materialised items from the existing book (got ${items})`);
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.open_items where created_in_migration is not true")).rows[0].n,
    0, "every item in the database came from the migration (created_in_migration=true) -- nothing else has run yet",
  );

  // (b) THE REVERSAL PASS. Pass 0 excludes reversal entries entirely (`reversal_of is null`),
  // so an unwind item can ONLY have come from the loop's pass ≥1. Its existence IS the proof
  // the loop ran, and the exact-negation check is what makes the pair cancel in the tie.
  const unwind = await itemsOf(jvMirror);
  assert.equal(unwind.length, 1, `the reversal mirror decomposed to ONE unwind row (got ${unwind.length}) -- the two parties collapsed into their canonical survivor`);
  assert.equal(unwind[0].item_kind, "reversal_unwind", "…with item_kind='reversal_unwind'");
  assert.equal(unwind[0].created_in_migration, true, "…written by the migration's reversal pass");
  assert.equal(Number(unwind[0].amount_cents), -90000, "…as the EXACT negation of the original's (now collapsed) RM900");
  assert.equal(unwind[0].counterparty_id, vendorB, "…booked to the canonical survivor, not the merged-away id");
  assert.ok(unwind[0].reversal_unwind_of, "…carrying its item lineage");

  // (c) THE COLLAPSE, on the original side too: ONE item for the whole JV under the survivor.
  const jvItems = await itemsOf(jv);
  assert.equal(jvItems.length, 1, `the merged JV decomposed to ONE item (got ${jvItems.length}) -- two payable legs under two ids that are now one party`);
  assert.equal(jvItems[0].counterparty_id, vendorB, "…under the canonical survivor");
  assert.equal(Number(jvItems[0].amount_cents), 90000, "…carrying the summed control net of both legs");
  assert.equal(jvItems[0].item_kind, "adjustment", "…as a ladder-5 adjustment (no coding_kind, not opening, not a reversal)");

  // (d) THE TYPED LADDERS.
  const billItems = await itemsOf(bill.entry);
  assert.equal(billItems.length, 1, "the typed supplier_bill decomposed to one ap item");
  assert.equal(billItems[0].item_kind, "bill", "…item_kind='bill'");
  assert.equal(Number(billItems[0].amount_cents), 250000, "…positive: we owe the supplier");
  const invItems = await itemsOf(inv.entry);
  assert.equal(invItems[0].item_kind, "invoice", "the sales invoice decomposed to an ar `invoice` item");
  assert.equal(Number(invItems[0].amount_cents), 180000, "…positive: the customer owes us");
  const cnItems = await itemsOf(cn.entry);
  assert.equal(cnItems[0].item_kind, "credit_note", "the sales credit note decomposed to an ar `credit_note` item");
  assert.equal(Number(cnItems[0].amount_cents), -20000, "…NEGATIVE, per the kind/sign matrix");
  assert.equal((await itemsOf(adjEntry))[0].item_kind, "adjustment", "the generic AR entry decomposed as an adjustment");

  // (e) LADDER 2 -- OPENING, both lineage shapes.
  const openArItems = await itemsOf(openingArEntry);
  assert.equal(openArItems.length, 1, "the approved opening AR entry decomposed to one item");
  assert.equal(openArItems[0].item_kind, "opening", "…item_kind='opening' (is_opening_balance outranks the coding ladder)");
  assert.ok(openArItems[0].opening_item_id, "…and it carries its opening_items LINEAGE");
  const k6Items = await itemsOf(k6);
  assert.equal(k6Items.length, 1, "the K6-replacement-shaped opening entry decomposed from its LEGS");
  assert.equal(k6Items[0].item_kind, "opening", "…also as `opening`");
  assert.equal(k6Items[0].opening_item_id, null, "…with NULL lineage -- opening_items is never an independent row source");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.open_items where entry_id=$1", [withdrawnEntry])).rows[0].n,
    0, "the WITHDRAWN opening draft produced NO item, though its opening_items row still exists",
  );

  // (f) D1 -- per-entry decomposition equality, read through the same preview surface the
  // ceremony's dry-run uses. Non-vacuous: it must actually return rows.
  for (const client of [book, onb.client, onb2.client]) {
    const preview = await rootQuery("select * from clara._subledger_decompose_preview($1,$2)", [client, null]);
    const drift = preview.rows.filter((r) => Number(r.diff_cents) !== 0);
    assert.equal(drift.length, 0, `D1: every classified row equals what was materialised (drifted: ${JSON.stringify(drift.slice(0, 3))})`);
  }
  const bookPreview = await rootQuery("select * from clara._subledger_decompose_preview($1,$2)", [book, null]);
  assert.ok(bookPreview.rowCount >= 6, `D1 is non-vacuous -- the preview really returned the book's decomposition (got ${bookPreview.rowCount} rows)`);

  // (g) D2 -- the identity, per client × domain, summed over EVERY account of the class.
  // NON-VACUOUS by explicit assertion: a book whose control balances were all zero would
  // satisfy 0=0 and prove nothing at all.
  let nonZero = 0;
  for (const client of [book, onb.client, onb2.client]) {
    for (const domain of ["ar", "ap"]) {
      const gl = await controlGl(client, domain);
      const sum = await itemsSum(client, domain);
      assert.equal(sum, gl, `D2 (${domain}): sum(open_items)=${sum} must equal the control GL=${gl}`);
      if (gl !== 0) nonZero += 1;
    }
  }
  assert.ok(nonZero >= 3, `D2 is non-vacuous -- at least three client×domain pairs carry a NONZERO control balance (got ${nonZero})`);
  noteLane(`post-apply: ${items} items across ${nonZero} nonzero client×domain control balances`);

  // (h) THE BACKFILL IS IDEMPOTENT. Re-running §J's body verbatim must write nothing: the
  // grain unique is what makes a re-run (a resumed ceremony, a retried deploy) safe, and
  // "on conflict do nothing" is only a claim until something re-runs it.
  const before = (await rootQuery("select count(*)::int as n from clara.open_items")).rows[0].n;
  const reran = await rootQuery(
    `insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
        item_kind, opening_item_id, reversal_unwind_of, item_date, amount_cents,
        created_in_migration, created_by)
     select e.firm_id, e.client_id, cl.domain, cl.counterparty_id, e.id, cl.item_kind,
            cl.opening_item_id, cl.reversal_unwind_of, e.posting_date, cl.amount_cents,
            true, coalesce(e.checker_actor, e.maker_actor)
     from clara.journal_entries e
     cross join lateral clara._subledger_classify_entry(e.id) cl
     where e.status = 'approved'
     on conflict on constraint uq_open_items_grain do nothing`,
  );
  assert.equal(reran.rowCount, 0, `re-running the §J backfill body writes ZERO rows (got ${reran.rowCount})`);
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.open_items")).rows[0].n, before,
    "…and the item count is unchanged",
  );

  // (i) MERGE-THEN-REVERSE, on the LIVE verbs this time. The pre-apply case above proves the
  // BACKFILL survives a merge; this proves the running system does. Approve, merge, reverse:
  // if any read joined the raw stored counterparty against a canonicalised one, reverse_entry
  // would refuse this entry forever with a wrong diagnosis (belt-1 would see a grain that
  // does not line up), and the client could never be corrected.
  const late = await (async () => {
    const d = await draftEntryV3(sub, {
      client: book, resolution: await manualRes(sub, book), memo: "u37 post-apply payable",
      lines: [
        { account_code: EXPN, debit_cents: 47000, credit_cents: 0, description: "dr" },
        { account_code: AP1, debit_cents: 0, credit_cents: 47000, description: "cr" },
      ],
      vendor: { existing_id: vendorC }, opKey: opk("u37late"),
    });
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u37latea") });
    return d.entry_id;
  })();
  assert.equal((await itemsOf(late))[0].counterparty_id, vendorC, "the post-apply entry minted its item under vendor C");
  await mergeCounterparties(sub, { client: book, survivor: vendorD, merged: vendorC, reason: "u37 late duplicate", opKey: opk("u37merge2") });
  await reverseEntry(w.users.bob, { entry: late, reason: "u37 reversed after a merge", opKey: opk("u37laterev") });
  const lateMirror = (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [late])).rows[0].id;
  const lateUnwind = await itemsOf(lateMirror);
  assert.equal(lateUnwind.length, 1, "reverse_entry SUCCEEDS on an entry whose counterparty was merged after approval");
  assert.equal(Number(lateUnwind[0].amount_cents), -47000, "…and the unwind is the exact negation");
  assert.equal(lateUnwind[0].counterparty_id, vendorD, "…booked to the canonical survivor");
  for (const domain of ["ar", "ap"]) {
    assert.equal(await itemsSum(book, domain), await controlGl(book, domain), `the identity still holds (${domain}) after the post-apply merge-and-reverse`);
  }
});

// ===========================================================================
// THE ABORT SIDE. A drill that only ever shows a SUCCESSFUL apply cannot tell you the §0
// probes are wired at all — a `do $probe$ begin end $probe$` block would pass the test above
// exactly as well. So this one stages a violation and requires the migration to REFUSE.
//
// The violation it stages is PROBE 2 (a control-class leg whose counterparty kind
// contradicts the account class), and that choice is the finding rather than a convenience:
// probe 2's shape is reachable RIGHT NOW, through the ordinary audited verbs, on any live
// database. Nothing at 0036 objects to stamping a 'customer' counterparty on a payable
// control leg — `_resolve_counterparty` is kind-scoped but the caller states the kind, and
// no floor compares that kind to the account class. The refusal only arrives with 0037.
// (Probe 1's shape — an approved control leg with NO counterparty — is deliberately NOT
// used: the 0009/0036 coding floor already refuses it at COMMIT for every approved entry, so
// staging it would require disabling triggers, and a probe fed a shape the running system
// cannot produce proves less than one fed a shape it produces happily.)
// ===========================================================================
test("0037 upgrade drill (abort side): a corpus carrying a kind-contradicting control leg REFUSES the migration, atomically", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();

  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice;
  const firm = w.firms.A;
  const client = await createClient(sub, { name: `u37_abort_${randomUUID().slice(0, 6)}`, opKey: opk("u37acli") });
  await buildChart(sub, client);
  await grantConsent(sub, { firm, client }).catch(() => {});

  // A CUSTOMER, stamped on a PAYABLE control leg — entirely through the audited verbs, and
  // entirely lawful at 0036. This is what the probe exists to find on the live book.
  const customer = await birth(sub, { client, name: `U37 ABORT CUSTOMER ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "u37 customer stamped on a payable leg",
    lines: [
      { account_code: EXPN, debit_cents: 55000, credit_cents: 0, description: "expense" },
      { account_code: AP1, debit_cents: 0, credit_cents: 55000, description: "payable, wrong party kind" },
    ],
    vendor: { existing_id: customer, kind: "customer" }, opKey: opk("u37abortd"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u37aborta") });
  assert.equal(
    (await rootQuery(
      `select cp.kind from clara.journal_lines l join clara.counterparties cp on cp.id=l.counterparty_id
        where l.entry_id=$1 and l.account_code=$2`, [d.entry_id, AP1])).rows[0].kind,
    "customer", "the payable control leg really carries a CUSTOMER-kind counterparty at 0036 (nothing refused it)",
  );

  await assert.rejects(
    () => migrate({ dir: MIG_DIR, log: () => {} }),
    /probe 2|contradicts the account class/i,
    "0037 REFUSES a corpus whose control legs carry kind-contradicting counterparties",
  );
  // Atomic: the refusal rolled the whole migration back — no tables, no half-built surface.
  assert.equal(await tableExists("open_items"), false, "the abort rolled 0037 back whole (clara.open_items absent)");
  assert.equal(await tableExists("open_item_allocations"), false, "…both tables");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.schema_migrations where version ~ '^0037_'")).rows[0].n,
    0, "…and 0037 is not recorded as applied",
  );
  noteLane("probe 2 ABORT verified: a kind-contradicting control leg — buildable through the audited verbs at 0036 — blocks the apply and rolls back atomically");
});
