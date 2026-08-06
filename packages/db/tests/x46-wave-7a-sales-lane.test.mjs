// 0046 §7-A — THE UNATTENDED SALES LANE, DB HALF.
//
// WHAT THIS FILE IS FOR. The migration's own tail asserts SHAPE: which bodies call the
// floor, that each authority writer binds `corroborated` and compares it against six, that
// the flip verb is reachable from no application role. Shape is not behaviour. Everything
// here drives the real verbs and reads what actually happened, because the two failure
// modes this wave is most exposed to are both invisible to a source probe:
//
//   * an un-recut floor caller SUCCEEDS while silently omitting the corroboration gate
//     (all three bind NAMED columns that survive the new shape — nothing raises), and
//   * the activation flag is only a kill-switch if the lane genuinely does nothing while
//     it is off. "The code has an `if`" is not that proof.
//
// CONTRACT-BLIND where it can be: the cells below name the OUTCOME they require (a rule is
// refused; a floor reads N; a lane answers `ready`), not the internal variable that
// produces it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk, createClient,
  a21EnsureReady, skip16,
  proposeAutopostRule,
  upsertAccountClassed, seedCitedDocument, freshResolution, grantConsent, seedStatedInvoiceFacts,
  seedCorroboratingInvoiceFacts,
  approveEntry, ev, FIELD, counterpartyRows,
  mintInteractive, mintAutodraftCred, wakeDraftEntry, addClientIdentifier, addClientAlias, rm,
  rlsFlags,
} from "./a21-helpers.mjs";

const REC = "300-A00";      // trade debtors (receivable control)
const REV = "500-R01";      // service revenue (income)
const CLIENT_REG = "199901000999";
const CLIENT_NAME = "RIG SEVEN A SDN BHD";
const CUSTOMER = "SEVEN A RIG CUSTOMER SDN BHD";

let has46 = false;
let world = null;

function skipHere(t) {
  return skip16(t, has46, "0046 not applied — the §7-A sales-lane battery is dormant");
}

/** Is 0046 on this database? Read from the migration ledger, not from a function's
 *  existence: a half-applied file is a different failure than an unapplied one. */
async function has0046() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version like '0046_%'");
  return r.rows[0].n === 1;
}

/** A client that can carry OCR-sales evidence: identifiers + alias so
 *  clara._document_direction can resolve SALES, a receivable + an income account, and
 *  egress consent. */
async function freshSalesClient(sub) {
  const client = await createClient(sub, {
    name: `x46_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`, opKey: opk("cli"),
  });
  await addClientIdentifier(sub, { client, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  await addClientIdentifier(sub, { client, kind: "tin", value: CLIENT_REG }).catch(() => {});
  await addClientAlias(sub, {
    client, alias: CLIENT_NAME.toLowerCase().replace(/[^a-z0-9]/g, ""),
  }).catch(() => {});
  await upsertAccountClassed(sub, {
    client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec"),
  });
  await upsertAccountClassed(sub, {
    client, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev"),
  });
  await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
  return client;
}

/** One document-backed, human-APPROVED sales entry that lands a CREDIT sighting on REV.
 *
 *  THE `codingKind` ARGUMENT IS THE WHOLE POINT OF THIS HELPER, and the reason it drafts
 *  through clara.wake_draft_entry rather than clara.draft_entry: the HUMAN draft verb has
 *  no p_coding_kind parameter at all, so a hand-drafted entry is permanently
 *  coding_kind NULL. That is not an accident of the rig — it is the live shape of the
 *  product, and it is exactly what makes 7A-R4's `coding_kind='sales_invoice'` term
 *  load-bearing rather than cosmetic. Passing codingKind:null here produces the entry a
 *  human lane produces; passing 'sales_invoice' produces the entry an agent lane produces.
 */
async function approvedSalesSighting(sub, cred, {
  client, cp = null, newName = null, date, cents = 90000, codingKind = "sales_invoice",
}) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(cents) });
  await seedStatedInvoiceFacts(cited, { firm });
  const d = await wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    vendor: cp ? { existing_id: cp, kind: "customer" } : { new: { name: newName }, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    postingDate: date, codingKind, opKey: opk("x46s"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x46a") });
  return d.entry_id;
}

/** The floor, read as the DB reads it (root; the function is definer + ungranted). */
async function floorOf(client, cp, account = REV) {
  const r = await rootQuery(
    "select qualifying, distinct_invoices, corroborated, span_days from clara._ocr_sales_floor($1,$2,$3)",
    [client, cp, account]);
  return r.rows[0];
}

async function cpOf(client, name = CUSTOMER) {
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
}

before(async () => {
  await a21EnsureReady();
  has46 = await has0046();
  if (!has46) {
    noteLane("0046 not in clara.schema_migrations — the §7-A battery is dormant");
    return;
  }
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("x46-wave-7a-sales-lane");
  printSkipCount("x46-wave-7a-sales-lane");
  await endPool();
});

// ---------------------------------------------------------------------------
// A. THE FLOOR'S NEW SHAPE AND ITS TWO NEW TERMS.
// ---------------------------------------------------------------------------

test("A1 the floor returns qualifying/distinct_invoices/corroborated/span_days, and distinct_docs is gone", async (t) => {
  if (skipHere(t)) return;
  const r = await rootQuery(
    "select pg_get_function_result('clara._ocr_sales_floor(uuid,uuid,text)'::regprocedure) as shape");
  assert.equal(r.rows[0].shape,
    "TABLE(qualifying integer, distinct_invoices integer, corroborated integer, span_days integer)");
});

test("A2 7A-R4: entries the HUMAN lane produces (coding_kind NULL) earn NO sales posting authority", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const cred = await mintInteractive(await firmOf(client));

  // Seven document-backed, human-approved, corroborating-shaped credit sightings on the
  // revenue account, spanning well over 60 posting days — everything the pre-0046 floor
  // asked for. The ONLY thing they lack is the sales-invoice coding kind.
  await approvedSalesSighting(sub, cred, { client, newName: CUSTOMER, date: "2026-01-08", codingKind: null });
  const cp = await cpOf(client);
  assert.ok(cp, "mandatory setup: the customer counterparty exists");
  for (const date of ["2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08", "2026-06-18"]) {
    await approvedSalesSighting(sub, cred, { client, cp, date, codingKind: null });
  }

  const f = await floorOf(client, cp);
  assert.equal(f.qualifying, 0,
    "a corroborated income credit with a customer counterparty but NO sales-invoice coding kind "
    + "contributes nothing — this is the generic-JE provenance hole 7A-R4 closes");
  assert.equal(f.distinct_invoices, 0);
  assert.equal(f.corroborated, 0);

  // ...and the refusal is the floor's, by name, at the proposal door.
  const prop = await proposeAutopostRule(sub, {
    client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales",
  });
  assert.ok(prop.error, "an ocr_sales proposal on this evidence is REFUSED");
  assert.match(String(prop.error.detail ?? prop.error.message), /insufficient_evidence/);
});

test("A3 7A-R4: the SAME seven entries, tagged sales_invoice, DO earn it", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const cred = await mintInteractive(await firmOf(client));

  await approvedSalesSighting(sub, cred, { client, newName: CUSTOMER, date: "2026-01-08" });
  const cp = await cpOf(client);
  assert.ok(cp, "mandatory setup: the customer counterparty exists");
  for (const date of ["2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08", "2026-06-18"]) {
    await approvedSalesSighting(sub, cred, { client, cp, date });
  }

  const f = await floorOf(client, cp);
  assert.equal(f.qualifying, 7, "all seven qualify");
  assert.equal(f.distinct_invoices, 7, "seven DISTINCT stated invoice numbers");
  assert.ok(f.span_days >= 60, `the posting-date span is >= 60 (got ${f.span_days})`);
  // The span is measured on POSTING_DATE, not on approval date — documentation defect 1,
  // corrected in 0046's header. These seven were approved within one rig run.
  // ASSERTED, NOT LOGGED. The corroboration reading is the headline 7A-R4/ROOT-fix term, and
  // for THIS corpus the true value is ZERO — the rig's stated-invoice fixture seeds an invoice
  // number and nothing else, so none of these documents states a tax and none can corroborate
  // (0023:311). Logging it left the term unasserted anywhere in this file. The POSITIVE side
  // lives in A5, which builds genuinely corroborating documents.
  assert.equal(f.corroborated, 0,
    `a tax-silent corpus earns SEVEN qualifying sightings and ZERO corroboration (got ${JSON.stringify(f)})`);
  noteLane(`A3 floor: qualifying=${f.qualifying} invoices=${f.distinct_invoices} corroborated=${f.corroborated} span=${f.span_days}`);
});

test("A4 the corroboration gate is POSITIVE at propose and at sign, not merely present", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const cred = await mintInteractive(await firmOf(client));

  await approvedSalesSighting(sub, cred, { client, newName: CUSTOMER, date: "2026-01-08" });
  const cp = await cpOf(client);
  for (const date of ["2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08", "2026-06-18"]) {
    await approvedSalesSighting(sub, cred, { client, cp, date });
  }
  const before = await floorOf(client, cp);

  // The rig's stated-invoice fixture seeds an invoice id and nothing else, so these
  // documents state no tax and cannot corroborate (0023:311 — "a document that does not
  // state a tax has proven nothing about its tax"). If that ever changes, this cell tells
  // us by failing on its own premise rather than by quietly passing.
  // THE PREMISE IS ASSERTED, NOT USED AS AN ESCAPE. An earlier draft of this cell returned
  // early when the premise moved, which is a cell that disarms itself precisely when
  // something changed — the shape a green suite should never be able to hide.
  assert.ok(before.corroborated < 6,
    `mandatory premise: the stated-invoice fixture must NOT corroborate, or this cell cannot `
    + `isolate the corroboration gate from the other three legs (got ${JSON.stringify(before)})`);
  assert.ok(before.qualifying >= 6 && before.distinct_invoices >= 6 && before.span_days >= 60,
    `mandatory premise: every OTHER floor leg is satisfied (got ${JSON.stringify(before)})`);

  const prop = await proposeAutopostRule(sub, {
    client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales",
  });
  assert.ok(prop.error,
    "6 qualifying / 6 invoice numbers / 60+ days but < 6 CORROBORATED is REFUSED — the gate that "
    + "an un-recut caller would have silently omitted");
  assert.match(String(prop.error.detail ?? prop.error.message), /insufficient_evidence/);
});

test("A5 the POSITIVE side of corroborated>=6: six corroborating sales invoices ADMIT", async (t) => {
  if (skipHere(t)) return;
  // A2/A3/A4 are all NEGATIVE — they prove the two new terms REFUSE. A gate that only ever
  // refuses is indistinguishable from a gate that always refuses, so this is the cell that
  // proves the ROOT fix lets earned authority through. It is also the only place x46
  // asserts `corroborated` as a POSITIVE number.
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);

  let cp = null;
  const dates = ["2026-01-08", "2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-18"];
  for (const date of dates) {
    const cited = await seedCitedDocument(sub, { firm, client, quote: rm(90000) });
    await seedCorroboratingInvoiceFacts(cited, { sub, firm, client, cents: 90000 });
    const d = await wakeDraftEntry(cred, {
      client,
      resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
      document: cited.documentId, sha256: cited.sha256,
      lines: [
        { account_code: REC, debit_cents: 90000, credit_cents: 0, description: "sales-ar" },
        { account_code: REV, debit_cents: 0, credit_cents: 90000, description: "sales-rev" },
      ],
      vendor: cp ? { existing_id: cp, kind: "customer" } : { new: { name: CUSTOMER }, kind: "customer" },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      postingDate: date, codingKind: "sales_invoice", opKey: opk("x46a5"),
    });
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x46a5a") });
    if (!cp) { cp = await cpOf(client); assert.ok(cp, "mandatory setup: the customer was born at approval"); }
  }

  const f = await floorOf(client, cp);
  assert.ok(f.corroborated >= 6,
    `six corroborating sales invoices read >=6 CORROBORATED (got ${JSON.stringify(f)})`);
  assert.ok(f.qualifying >= 6 && f.distinct_invoices >= 6 && f.span_days >= 60,
    `...and every other leg is satisfied too (got ${JSON.stringify(f)})`);

  const prop = await proposeAutopostRule(sub, {
    client, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales",
  });
  assert.ok(!prop.error,
    `earned authority is ADMITTED, not merely un-refused (got ${prop.error?.code}: ${prop.error?.message})`);
});

// ---------------------------------------------------------------------------
// B. THE ACTIVATION KILL-SWITCH (7A-R1).
// ---------------------------------------------------------------------------

test("B1 the lane SHIPS OFF for every firm, and an absent firm_limits row reads OFF", async (t) => {
  if (skipHere(t)) return;
  // SCOPED TO THIS CELL'S OWN FIRM, not the database. A sibling battery that legitimately
  // activates a firm (C1 does, inside a try/finally) would otherwise make this cell fail for a
  // reason that has nothing to do with what it tests — a measured cross-file interference, not
  // a hypothetical. The ships-OFF guarantee for the WHOLE database is asserted where it cannot
  // race: tail arm (6) of the migration itself, in the same transaction that creates the column,
  // and it reads the column DEFAULT as well as the rows.
  const sub0 = world.users.alice;
  const mine = await firmOf(await freshSalesClient(sub0));
  const on = await rootQuery(
    "select count(*)::int as n from clara.firm_limits where sales_lane_active and firm_id=$1", [mine]);
  assert.equal(on.rows[0].n, 0, "a firm created after the migration is not sales-lane active");
  assert.equal((await rootQuery("select clara._sales_lane_active($1) as a", [mine])).rows[0].a, false,
    "...and the helper agrees");

  // A firm id that has no firm_limits row at all — absence must read FALSE, never NULL and
  // never true. (Law 2: an absence is not positive evidence.)
  const r = await rootQuery("select clara._sales_lane_active($1::uuid) as a", [randomUUID()]);
  assert.equal(r.rows[0].a, false, "a firm with no limits row reads inactive, fail-closed");
});

test("B2 the flip verb is reachable from NO application role", async (t) => {
  if (skipHere(t)) return;
  // Asked of has_function_privilege against the RESOLVED signature, not through a
  // name-based helper: the flip verb is ungranted, and a helper that answers `null` for
  // "no grant" would read as a pass under a loose comparison. This must be a hard false.
  const r = await rootQuery(
    `select r as role, has_function_privilege(r,
       'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)'::regprocedure,'execute') as ok
       from unnest($1::text[]) r`,
    [["clara_authenticated", "clara_runtime", "clara_agent_ro",
      "clara_wake_interactive", "clara_wake_proactive"]]);
  assert.equal(r.rows.length, 5);
  for (const row of r.rows) {
    assert.strictEqual(row.ok, false, `${row.role} cannot execute the activation flip`);
  }
});

test("B3 the flip records both states and a reason, and de-activation keeps the watermark", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const before = await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_sales_lane_activation'");

  const on = await rootQuery(
    "select clara.set_sales_lane_activation($1,true,null,$2) as r", [firm, "x46 rig activation"]);
  assert.equal(on.rows[0].r.sales_lane_active, true);
  assert.equal(on.rows[0].r.was_active, false, "the receipt names the state it moved FROM");
  const wm = on.rows[0].r.sales_admission_watermark;
  assert.ok(wm, "activating without an explicit watermark sets one — everything already filed is backlog");
  assert.equal(await (async () => (await rootQuery(
    "select clara._sales_lane_active($1) as a", [firm])).rows[0].a)(), true);

  const off = await rootQuery(
    "select clara.set_sales_lane_activation($1,false,null,$2) as r", [firm, "x46 rig emergency off"]);
  assert.equal(off.rows[0].r.sales_lane_active, false);
  assert.equal(off.rows[0].r.sales_admission_watermark, wm,
    "de-activating LEAVES the watermark — a flip-off/flip-on must not silently re-open the backlog");

  const after = await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='set_sales_lane_activation'");
  assert.equal(after.rows[0].n - before.rows[0].n, 2, "both flips are on the append-only audit log");

  await rootQuery("update clara.firm_limits set sales_lane_active=false where firm_id=$1", [firm]);
});

test("B4 a reason is required — the flip cannot be made anonymously", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  await assert.rejects(
    () => rootQuery("select clara.set_sales_lane_activation($1,true,null,$2)", [firm, "   "]),
    (e) => e.code === "CLR10");
});

// ---------------------------------------------------------------------------
// C. THE CODING LANE IS INERT WHILE THE FLAG IS OFF (7A-R3's blast radius).
// ---------------------------------------------------------------------------

test("C1 with the lane OFF a tax-silent sales filing is NOT ready; with it ON the same filing is", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(90000) });
  await seedStatedInvoiceFacts(cited, { firm });
  // Make the document resolve SALES: the supplier identity IS the client.
  const ext = await rootQuery(
    `select id from clara.document_extractions where document_id=$1 and engine_kind='invoice_facts'
       and status='done' order by version_n desc limit 1`, [cited.documentId]);
  if (!ext.rows[0]) { noteLane("C1: no invoice_facts extraction — cell dormant"); return; }
  for (const [path, value] of [
    ["invoice.vendor_registration", CLIENT_REG],
    ["invoice.vendor_name", CLIENT_NAME],
    ["invoice.customer_name", CUSTOMER],
  ]) {
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,1.0)`,
      [firm, ext.rows[0].id, path, value]);
  }
  const dir = await rootQuery(
    "select clara._autodraft_direction_tri($1,$2) as d", [cited.documentId, client]);
  if (dir.rows[0].d !== "sales") {
    noteLane(`C1: the fixture document resolves ${dir.rows[0].d}, not sales — cell dormant`);
    return;
  }

  const laneOff = await rootQuery(
    "select lane, reasons from clara._coding_lane_core($1,$2)", [client, cited.filingId]);
  assert.notEqual(laneOff.rows[0].lane, "ready",
    `with the lane OFF a tax-silent sales filing must NOT be ready (got ${JSON.stringify(laneOff.rows[0])})`);
  assert.ok(laneOff.rows[0].reasons.includes("tier_a_fails"),
    "and tier_a_fails is the reason blocking it");

  await rootQuery("select clara.set_sales_lane_activation($1,true,null,$2)", [firm, "x46 C1"]);
  try {
    const laneOn = await rootQuery(
      "select lane, reasons from clara._coding_lane_core($1,$2)", [client, cited.filingId]);
    assert.ok(laneOn.rows[0].reasons.includes("tier_a_fails"),
      "7A-R3 keeps the reason VISIBLE — it stops BLOCKING, it does not vanish");
    assert.equal(laneOn.rows[0].lane, "ready",
      `with the lane ON the same tax-silent sales filing is ready to draft (got ${JSON.stringify(laneOn.rows[0])})`);
  } finally {
    await rootQuery("update clara.firm_limits set sales_lane_active=false where firm_id=$1", [firm]);
  }
});

test("C2 the DB writer REFUSES a contradictory coding-kind/counterparty-kind pair (7A-R2)", async (t) => {
  if (skipHere(t)) return;
  // THE AUTHORITY LAYER, DRIVEN. 7A-R2 says the contradiction is "rejected in the DB writer
  // (the only authority layer)" and that the tool's derivation and the zod schema are
  // "ergonomics on top". Ergonomics cannot be the test: this drives clara.wake_draft_entry
  // directly with the pair the model is not supposed to be able to produce, and requires the
  // WRITER to refuse it.
  //
  // WHY THE CONTRADICTION AND NOT THE OMISSION: live precedence is
  // `coalesce(explicit kind, derive-from-coding_kind)` — the EXPLICIT kind WINS — so the
  // failure mode was never a missing kind, it was a contradicting one, and it is quiet:
  // a sales invoice labelled `vendor` enters the production vendor-binding resolver and can
  // be STAMPED as a vendor (0028:1212-1274).
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(90000) });
  await seedStatedInvoiceFacts(cited, { firm });

  const res1 = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  await assert.rejects(
    () => wakeDraftEntry(cred, {
      client,
      resolution: res1,
      document: cited.documentId, sha256: cited.sha256,
      lines: [
        { account_code: REC, debit_cents: 90000, credit_cents: 0, description: "sales-ar" },
        { account_code: REV, debit_cents: 0, credit_cents: 90000, description: "sales-rev" },
      ],
      vendor: { new: { name: "SEVEN A CONTRADICTION SDN BHD" }, kind: "vendor" },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      postingDate: "2026-06-10", codingKind: "sales_invoice", opKey: opk("x46c2"),
    }),
    (e) => e.code === "CLR21" && /counterparty_kind_contradiction/.test(String(e.detail ?? "")),
    "a sales_invoice carrying an explicit vendor counterparty is refused BY THE WRITER");

  // ...and the same pair the other way round.
  const res2 = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  await assert.rejects(
    () => wakeDraftEntry(cred, {
      client,
      resolution: res2,
      document: cited.documentId, sha256: cited.sha256,
      lines: [
        { account_code: REV, debit_cents: 90000, credit_cents: 0, description: "x" },
        { account_code: REC, debit_cents: 0, credit_cents: 90000, description: "y" },
      ],
      vendor: { new: { name: "SEVEN A CONTRADICTION SDN BHD" }, kind: "customer" },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      postingDate: "2026-06-10", codingKind: "supplier_bill", opKey: opk("x46c2b"),
    }),
    (e) => e.code === "CLR21" && /counterparty_kind_contradiction/.test(String(e.detail ?? "")),
    "a supplier_bill carrying an explicit customer counterparty is refused BY THE WRITER");
});

test("C3 the tri-state direction is total: sales | purchase | unresolved, never null", async (t) => {
  if (skipHere(t)) return;
  // The family binding is only as good as the answer it binds to, and this helper is
  // consumed inside the draft writer's refusal predicate — a null there would make the
  // whole comparison null and the refusal silently vanish.
  const r = await rootQuery(
    `select clara._autodraft_direction_tri(null,null) as a,
            clara._autodraft_direction_tri(gen_random_uuid(),gen_random_uuid()) as b`);
  assert.equal(r.rows[0].a, "purchase", "a null document answers purchase — the conservative answer for THIS lane");
  assert.equal(r.rows[0].b, "purchase", "an unknown document likewise, never null");
});

test("C4 the AUTODRAFT lane REFUSES a coding kind that contradicts the re-derived direction", async (t) => {
  if (skipHere(t)) return;
  // C2 covers the writer's CONTRADICTION arm (coding kind vs counterparty kind). This covers
  // the FAMILY arm, which had no behavioural cell at all — and it is the one 7A-R2 leans on
  // hardest, because it is what makes the model's coding_kind a PROPOSAL rather than routing
  // authority: the writer re-derives the direction from the document itself and refuses a
  // proposal that contradicts it, no matter what was carried in the task context.
  //
  // The fixture document carries no client-identity match, so clara._document_direction
  // resolves 'purchase' — and a 'sales_invoice' proposal on it must be refused. The lane is
  // the real one: an AUTODRAFT wake credential, because the family arm is scoped to that
  // wake kind (the human-present chat lane is deliberately untouched).
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(90000) });
  await seedStatedInvoiceFacts(cited, { firm });

  const dir = (await rootQuery(
    "select clara._autodraft_direction_tri($1,$2) as d", [cited.documentId, client])).rows[0].d;
  assert.equal(dir, "purchase",
    `mandatory premise: the fixture document must resolve PURCHASE for this cell to isolate the family arm (got '${dir}')`);

  const cred = await mintAutodraftCred(firm, client);
  const res = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  await assert.rejects(
    () => wakeDraftEntry(cred, {
      client,
      resolution: res,
      document: cited.documentId, sha256: cited.sha256,
      lines: [
        { account_code: REC, debit_cents: 90000, credit_cents: 0, description: "sales-ar" },
        { account_code: REV, debit_cents: 0, credit_cents: 90000, description: "sales-rev" },
      ],
      // counterparty kind AGREES with the coding kind, so arm 1 cannot be what refuses:
      // this cell must be refused by the DIRECTION family arm or not at all.
      vendor: { new: { name: "SEVEN A FAMILY MISMATCH SDN BHD" }, kind: "customer" },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      postingDate: "2026-06-10", codingKind: "sales_invoice", opKey: opk("x46c4"),
    }),
    (e) => e.code === "CLR21" && /direction_family_mismatch/.test(String(e.detail ?? "")),
    "a sales_invoice proposed on a purchase-direction document is refused BY THE WRITER, on the family arm");
});

// ---------------------------------------------------------------------------
// D. THE 6-ARITY SETTLE (skeleton §2d).
// ---------------------------------------------------------------------------

test("D1 exactly two settle signatures, both runtime-only, neither reachable from the human lane", async (t) => {
  if (skipHere(t)) return;
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig,
            has_function_privilege('clara_runtime', p.oid, 'execute') as rt,
            has_function_privilege('clara_authenticated', p.oid, 'execute') as human
       from pg_proc p where p.pronamespace='clara'::regnamespace
        and p.proname='settle_autodraft_task' order by 1`);
  assert.equal(r.rows.length, 2, "exactly two overloads");
  for (const row of r.rows) {
    assert.equal(row.rt, true, `clara_runtime executes ${row.sig}`);
    assert.equal(row.human, false, `clara_authenticated does NOT execute ${row.sig}`);
  }
  assert.ok(r.rows.some((x) => x.sig.includes("text)")),
    "one of them is the 6-arity carrying p_workflow_run_id text");
});

test("D2 the 6-arity preserves 0036's semantics rather than reverting to 0011's", async (t) => {
  if (skipHere(t)) return;
  // 0036 §B rewrote three losing-dispatch shapes into honest no-op receipts and moved the
  // park threshold onto the shared cap function. Re-typing 0011's older body would have
  // silently reverted all of it; deriving the overload from pg_get_functiondef makes the
  // preservation structural. Both markers must be present in BOTH bodies.
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig, p.prosrc from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task'`);
  for (const row of r.rows) {
    assert.ok(row.prosrc.includes("task_superseded"),
      `${row.sig} keeps 0036's terminal/supersession no-op`);
    assert.ok(row.prosrc.includes("clara._autodraft_attempt_cap()"),
      `${row.sig} keeps 0036's shared attempt cap`);
  }
  const six = r.rows.find((x) => x.sig.includes("text)"));
  assert.ok(six.prosrc.includes("run_superseded"),
    "the 6-arity adds the run-identity losing-dispatch receipt");
  assert.ok(six.prosrc.includes("t.workflow_run_id is distinct from p_workflow_run_id"),
    "and compares against agent_tasks.workflow_run_id — the ENGINE run id, not the sweep uuid");
});

// ---------------------------------------------------------------------------
// E. THE PREVIEW (skeleton §2b) AND THE BACKFILL DOOR (7A-R5).
// ---------------------------------------------------------------------------

test("E1 the preview answers not-applicable for an inaccessible rule and never raises", async (t) => {
  if (skipHere(t)) return;
  // Called as a HUMAN: the verb goes through clara._human_ctx exactly like
  // clara.list_autopost_rules, so a root/no-actor call is refused by design.
  const r = await humanQuery(world.users.alice,
    "select clara.preview_ocr_sales_evidence($1::uuid) as p", [randomUUID()]);
  assert.equal(r.rows[0].p.applicable, false);
  assert.equal(r.rows[0].p.advisory, true, "it is labelled advisory — sign re-checks the live floor");
  assert.ok(r.rows[0].p.evaluated_at, "and carries an evaluation timestamp");
});

test("E2 the preview reports the floor's own numbers plus the tax-silent gap", async (t) => {
  if (skipHere(t)) return;
  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const cred = await mintInteractive(await firmOf(client));
  await approvedSalesSighting(sub, cred, { client, newName: CUSTOMER, date: "2026-01-08" });
  const cp = await cpOf(client);
  for (const date of ["2026-02-08", "2026-03-08", "2026-04-08", "2026-05-08", "2026-06-08", "2026-06-18"]) {
    await approvedSalesSighting(sub, cred, { client, cp, date });
  }
  const f = await floorOf(client, cp);

  // A proposal cannot be made while the floor is short, so the rule the preview reads is
  // built directly at 'proposed' — the preview's contract is "read a rule", not "read a
  // rule that could be signed", and this is precisely the state an owner is in when they
  // most need the explanation.
  const rule = (await rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,
        pinned,origin,content_hash,created_by,amount_cap_cents,frequency_window,window_max_posts,
        expires_at,direction,evidence_class)
     values($1,$2,'autopost',$3,$4,'proposed',false,'authored',$5,$6,200000,'monthly',3,
        now()+interval '6 months','sales','ocr_sales') returning id`,
    // content_hash is CHECK-constrained to the 64-char sha256 hex the writers produce.
    [await firmOf(client), client, cp, REV,
      (randomUUID() + randomUUID()).replace(/-/g, ""), world.users.alice],
  )).rows[0].id;

  const p = (await humanQuery(world.users.alice,
    "select clara.preview_ocr_sales_evidence($1) as p", [rule])).rows[0].p;
  assert.equal(p.applicable, true);
  assert.equal(p.qualifying, f.qualifying, "the preview's qualifying IS the floor's");
  assert.equal(p.corroborated, f.corroborated, "and so is its corroboration count");
  assert.equal(p.distinct_invoices, f.distinct_invoices);
  assert.equal(p.floor_met, false, "an uncorroborated corpus does not meet the floor");
  assert.equal(p.tax_silent_documents, f.qualifying - f.corroborated,
    "tax_silent_documents is the qualifying documents that fail corroboration — the gap the "
    + "owner is about to sign into, stated before they sign");
  assert.deepEqual(p.required, { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 });
});

test("E3 the backfill door is recorded, singular per client, pausable, and terminal on close", async (t) => {
  if (skipHere(t)) return;
  const flags = await rlsFlags("sales_backfill_batches");
  assert.ok(flags.rls && flags.force, "the batch table is RLS ENABLE + FORCE");

  const sub = world.users.alice;
  const client = await freshSalesClient(sub);
  const opened = await humanQuery(sub,
    "select clara.open_sales_backfill($1,$2,$3,$4) as r",
    [client, 5, "x46 rig backfill", opk("bf")]);
  const batch = opened.rows[0].r.batch_id;
  assert.equal(opened.rows[0].r.state, "open");

  await assert.rejects(
    () => humanQuery(sub, "select clara.open_sales_backfill($1,$2,$3,$4)",
      [client, 5, "x46 rig second", opk("bf2")]),
    (e) => e.code === "CLR27",
    "a second open batch for the same client is refused — otherwise 'which batch paid for this "
    + "admission' has no answer");

  const paused = await humanQuery(sub,
    "select clara.set_sales_backfill_state($1,'paused',$2) as r", [batch, opk("bfp")]);
  assert.equal(paused.rows[0].r.state, "paused");

  const closed = await humanQuery(sub,
    "select clara.set_sales_backfill_state($1,'closed',$2) as r", [batch, opk("bfc")]);
  assert.equal(closed.rows[0].r.state, "closed");

  await assert.rejects(
    () => humanQuery(sub, "select clara.set_sales_backfill_state($1,'open',$2)", [batch, opk("bfr")]),
    (e) => e.code === "CLR27", "a closed batch cannot be reopened — open a new one, with its own note");

  const listed = (await humanQuery(sub,
    "select clara.list_sales_backfill_batches($1::jsonb) as r",
    [JSON.stringify({ client_id: client })])).rows[0].r;
  assert.ok(Array.isArray(listed) && listed.length >= 1, "the batch is visible on the read surface");
});

// ---------------------------------------------------------------------------
// F. PURCHASE ISOLATION. The whole purchase lane must be untouched.
// ---------------------------------------------------------------------------

test("F1 the purchase evidence floor still admits a purchase proposal on 3 debit sightings", async (t) => {
  if (skipHere(t)) return;
  // The purchase floor is the SEPARATE v_seen<3 branch (0016:1714-1725); the OCR floor sits
  // under v_evc='ocr_sales' and structured sales never calls it. A purchase proposal must
  // therefore never see a corroboration term at all.
  const r = await rootQuery(
    `select prosrc from pg_proc where pronamespace='clara'::regnamespace
      and proname='propose_autopost_rule'`);
  const src = r.rows[0].prosrc;
  const ocrBlock = src.slice(src.indexOf("if v_evc='ocr_sales' then"));
  assert.ok(src.includes("if v_seen<3 then"), "the purchase 3-sighting floor is intact");
  assert.ok(ocrBlock.includes("corroborated"),
    "corroboration is INSIDE the ocr_sales branch only — a purchase proposal never reaches it");
  assert.ok(!src.slice(0, src.indexOf("if v_evc='ocr_sales' then")).includes("corroborated"),
    "and nothing before that branch mentions it");
});
