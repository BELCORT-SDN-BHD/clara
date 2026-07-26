// Extraction slice X3 (migration 0022) — the SUM-OF-STATED-COMPONENTS sales tie.
//
// THE DEFECT THIS CLOSES, from docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md
// (MAJOR 3). The 0016 identity was `net + tax + rounding = gross`. LAI LOU MEI, a real
// document, prints:
//
//     SubTotal            94.30
//     Service Charge@4%    3.77
//     Service Tax@6%       5.66
//     Rounding Adj         0.02
//     Net Total          103.75
//
// 94.30 + 5.66 + 0.02 = 99.98, not 103.75. Every figure is read correctly off the face of
// the document and the tie STILL fails, because a service charge sits outside the equation
// — and unlike the supplier floor there is no `amount_override` hatch on the sales side, so
// a human would do the coding work and be blocked at the final step with no way through.
// The same holds for any discount, delivery or handling line, i.e. for most Malaysian F&B
// and retail invoices.
//
// The identity is now the sum of STATED COMPONENTS over the closed taxonomy ratified at
// ADR-047 (subtotal · service charge · discount · delivery · tax · rounding), and it must
// equal the stated total EXACTLY: every failure mode is a refusal, never a wrong post.
//
// The cells prove three things in order: the real document now passes; a set that does not
// add up still refuses; and — the load-bearing negative — an extraction stating NO
// components leaves every tie exactly as dormant as it is today (contract gate XG4).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, opk, buildWorld, firmOf, rm, reasonOf, assertRaises,
  upsertAccountClassed, seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask,
  persistInvoiceFacts, failInvoiceFacts, factsRegion, grantConsent, freshResolution, ev, approveEntry,
  mintInteractive, wakeDraftEntry, addClientIdentifier,
  has0022, fail0022, componentFields, LAI_LOU_MEI, COMPONENT, factField,
} from "./x1-helpers.mjs";

const REC = "300-X01"; // trade debtors (receivable control)
const REV = "500-X01"; // revenue (income)
const SST = "250-X01"; // SST output (liability, special_acc_type='sst_output')
// The world already mints ONE rounding account per client and uq_coa_special is per
// (client, VALUE), so a second one is a CLR10 — reuse the fixture's.
const RND = "9990";
const CLIENT_REG = "199901000042";
const CLIENT_NAME = "X1 TIE PROPERTIES SDN BHD";
const CUSTOMER = "LAI LOU MEI RIG SDN BHD";

let W = null;
let live = false;
let CLIENT = null;

before(async () => {
  try {
    const { ensureReady } = await import("./rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  live = await has0022();
  if (!live) return;
  W = await buildWorld();
  CLIENT = W.clients.A1;
  const sub = W.users.alice;
  await addClientIdentifier(sub, { client: CLIENT, kind: "ssm", value: CLIENT_REG }).catch(() => {});
  await addClientIdentifier(sub, { client: CLIENT, kind: "tin", value: CLIENT_REG }).catch(() => {});
  await upsertAccountClassed(sub, { client: CLIENT, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") });
  await upsertAccountClassed(sub, { client: CLIENT, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev") });
  await upsertAccountClassed(sub, { client: CLIENT, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sst") });
  await grantConsent(sub, { firm: await firmOf(CLIENT), client: CLIENT }).catch(() => {});
});
after(async () => { await endPool(); });

const gate = () => fail0022(live);

/** A filed sales document whose facts state the given components. The supplier identity is
 *  the CLIENT (so the direction resolves to sales) and the buyer is the rig customer. */
async function salesDoc(components) {
  const firm = await firmOf(CLIENT);
  const cited = await seedCitedDocument(W.users.alice, {
    firm, client: CLIENT, quote: rm(components.gross), kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = componentFields(components);
  fields.push(factField("invoice.vendor_name", CLIENT_NAME));
  fields.push(factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }));
  fields.push(factField("invoice.customer_name", CUSTOMER));
  fields.push(factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }));
  await persistInvoiceFacts(task.id, fields);
  return cited;
}

/** Draft the sales entry (the interactive wake lane is what carries coding_kind). */
async function draftSales(cited, lines, codingKind = "sales_invoice") {
  const cred = await mintInteractive(await firmOf(CLIENT));
  const region = await factsRegion(cited.documentId, "invoice.total");
  return wakeDraftEntry(cred, {
    client: CLIENT,
    resolution: await freshResolution(W.users.alice, CLIENT, {
      subjectKind: "document", subjectId: cited.documentId }),
    lines, document: cited.documentId, sha256: cited.sha256,
    vendor: { new: { name: `${CUSTOMER} ${randomUUID().slice(0, 6)}` }, kind: "customer" },
    evidence: [ev(region?.id, region?.text_content ?? rm(0), "invoice.total")],
    codingKind, opKey: `x1tie:${cited.filingId}:${cited.documentId}`,
  });
}

/** Draft then approve; returns null on success or the raised error. */
async function approveSales(cited, lines) {
  const d = await draftSales(cited, lines);
  try {
    await approveEntry(W.users.alice, {
      entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x1ap") });
    return { entry: d.entry_id, error: null };
  } catch (e) {
    return { entry: d.entry_id, error: e };
  }
}

const arLine = (cents) => ({ account_code: REC, debit_cents: cents, credit_cents: 0, description: "ar" });
const revLine = (cents) => ({ account_code: REV, debit_cents: 0, credit_cents: cents, description: "rev" });
const sstLine = (cents) => ({ account_code: SST, debit_cents: 0, credit_cents: cents, description: "sst" });
const rndLine = (cents) => ({ account_code: RND, debit_cents: 0, credit_cents: cents, description: "rnd" });

// ===========================================================================

test("[X3] LAI LOU MEI — the real service-charge document the 0016 identity got WRONG now ties", async () => {
  gate();
  const { gross, net, serviceCharge, tax, rounding } = LAI_LOU_MEI;
  // The old identity, stated here so the cell says what it is proving:
  assert.notEqual(net + tax + rounding, gross,
    "precondition: `net + tax + rounding` (the 0016 identity) does NOT equal the stated total");
  assert.equal(net + serviceCharge + tax + rounding, gross,
    "…while the sum of STATED COMPONENTS does, exactly, to the sen");

  const cited = await salesDoc({ gross, net, tax, rounding, serviceCharge });
  // Income = the non-tax, non-rounding consideration = subtotal + service charge.
  const income = gross - tax - rounding;
  const res = await approveSales(cited, [arLine(gross), revLine(income), sstLine(tax), rndLine(rounding)]);
  assert.equal(res.error, null,
    `the service-charge invoice APPROVES (got ${res.error?.code}/${res.error ? reasonOf(res.error) : ""}: ${res.error?.message ?? ""})`);
  assert.equal(
    (await rootQuery("select status from clara.journal_entries where id=$1", [res.entry])).rows[0].status,
    "approved", "…and the entry is in the books");
});

test("[X3] a discount and a delivery line ride the same identity, with the discount SUBTRACTING", async () => {
  gate();
  // Sign convention (ADR-047): every component is stored POSITIVE as printed; only the
  // discount subtracts. A reader that took an absolute value, or a writer that stored the
  // discount negative, would double-count here and this cell would fail.
  const net = 20000, delivery = 1500, discount = 500, tax = 1260;
  const gross = net + delivery - discount + tax; // 22260
  const cited = await salesDoc({ gross, net, tax, delivery, discount });
  const income = gross - tax; // 21000 = 20000 + 1500 - 500
  const res = await approveSales(cited, [arLine(gross), revLine(income), sstLine(tax)]);
  assert.equal(res.error, null,
    `the discount + delivery invoice APPROVES (got ${res.error?.code}/${res.error ? reasonOf(res.error) : ""})`);
});

test("[X3] a component set that does not add up is REFUSED — every failure mode is a refusal", async () => {
  gate();
  const { gross, net, tax, rounding } = LAI_LOU_MEI;
  const wrongServiceCharge = 300; // the document says 3.77; this states 3.00
  const cited = await salesDoc({ gross, net, tax, rounding, serviceCharge: wrongServiceCharge });
  const income = gross - tax - rounding;
  const res = await approveSales(cited, [arLine(gross), revLine(income), sstLine(tax), rndLine(rounding)]);
  assert.ok(res.error, "a component set that misses the stated total by 77 sen NEVER posts");
  assert.equal(res.error.code, "CLR21", `the refusal is CLR21 (got ${res.error.code}: ${res.error.message})`);
  assert.equal(reasonOf(res.error), "tax_tie_failed", "…named tax_tie_failed, as the other tie failures are");
});

test("[X3] the income side must equal the non-tax consideration — 2 sen quietly moved into rounding refuses", async () => {
  gate();
  // Tie 3, the second half of the correction. The 0016 form compared revenue to `net`
  // alone, which breaks on the same service-charge documents tie 2 broke on (a service
  // charge is income, so the income legs legitimately exceed the subtotal). The corrected
  // form compares it to gross - tax - rounding.
  const net = 9430, serviceCharge = 377, tax = 566;
  const gross = net + serviceCharge + tax; // 10373, no rounding stated
  const cited = await salesDoc({ gross, net, tax, serviceCharge });

  const good = await approveSales(cited, [arLine(gross), revLine(gross - tax), sstLine(tax)]);
  assert.equal(good.error, null,
    `income = subtotal + service charge APPROVES (got ${good.error?.code}/${good.error ? reasonOf(good.error) : ""})`);

  const cited2 = await salesDoc({ gross, net, tax, serviceCharge });
  const bad = await approveSales(cited2,
    [arLine(gross), revLine(gross - tax - 2), sstLine(tax), rndLine(2)]);
  assert.ok(bad.error, "shaving 2 sen of income into the rounding account NEVER posts");
  assert.equal(bad.error.code, "CLR21", `the refusal is CLR21 (got ${bad.error.code}: ${bad.error.message})`);
  assert.equal(reasonOf(bad.error), "tax_tie_failed", "…named tax_tie_failed");
});

test("[X3] a net-stating, TAX-SILENT document is still checked — the correction weakens nothing", async () => {
  gate();
  // The branch that exists because the obvious rewrite would have dropped it: guarding tie
  // 3 on `tax is not null` ALONE stops checking every document that states a net and no
  // tax, which is the shape the live structured/MyInvois lane produces when tax is absent.
  const net = 30000, gross = 30000;
  const okDoc = await salesDoc({ gross, net });
  const ok = await approveSales(okDoc, [arLine(gross), revLine(net)]);
  assert.equal(ok.error, null, `income = net APPROVES (got ${ok.error?.code}/${ok.error ? reasonOf(ok.error) : ""})`);

  const badDoc = await salesDoc({ gross, net });
  const bad = await approveSales(badDoc, [arLine(gross), revLine(net - 2), rndLine(2)]);
  assert.ok(bad.error, "…and income <> net on the SAME tax-silent shape still refuses");
  assert.equal(reasonOf(bad.error), "tax_tie_failed", "…named tax_tie_failed, exactly as at 0016");
});

test("[XG4] a component-LESS extraction leaves every tie dormant — today's corpus is byte-stable", async () => {
  gate();
  // The whole regression claim of the slice in one cell. All 29 live extractions state a
  // gross and nothing else: no total_excl_tax, no tax_total, and (until 0022 admitted the
  // paths at all) no components. Both ties are guarded on facts those extractions do not
  // carry, so an entry that would approve at 0021 must approve at 0022.
  const gross = 50000;
  const cited = await salesDoc({ gross });
  const res = await approveSales(cited, [arLine(gross), revLine(gross)]);
  assert.equal(res.error, null,
    `a gross-only sales invoice APPROVES unchanged (got ${res.error?.code}/${res.error ? reasonOf(res.error) : ""})`);

  // And the arithmetic ties really are inert rather than accidentally satisfied: an income
  // total that disagrees with the gross still refuses on the RECEIVABLE tie (CLR23), which
  // is the 0016 behaviour and is not part of this change.
  const cited2 = await salesDoc({ gross });
  const off = await approveSales(cited2, [arLine(gross - 100), revLine(gross - 100)]);
  assert.ok(off.error, "…while a control leg that disagrees with the stated gross still refuses");
  assert.equal(off.error.code, "CLR23", `on the unchanged receivable tie (got ${off.error.code})`);
});

test("[XG4] the fact-state helper is UNTOUCHED — components never enter the corroboration surface", async () => {
  gate();
  // The components are read inside the shape floor, not in `_invoice_fact_state_at`, so the
  // structured (XML) corroboration branch is byte-identical BY CONSTRUCTION rather than by
  // argument. If a component ever appears in this payload, corroboration terms have moved —
  // and moving them is X5's job, alone, with its own review.
  const { gross, net, tax, rounding, serviceCharge } = LAI_LOU_MEI;
  const cited = await salesDoc({ gross, net, tax, rounding, serviceCharge });
  const state = (await rootQuery("select clara._invoice_fact_state($1) as s", [cited.documentId])).rows[0].s;
  for (const key of ["service_charge_cents", "discount_cents", "delivery_cents"]) {
    assert.equal(key in state, false, `the fact state carries no ${key}`);
  }
  assert.equal(Number(state.total_excl_tax_cents), net, "…while the pre-existing keys are unchanged");
  assert.equal(Number(state.tax_total_cents), tax, "…including the tax total");
});

test("[X3/sign] a NEGATIVE component is refused at the write boundary — the convention is a control, not a habit", async () => {
  gate();
  // ADR-047 says "every component is stored positive as printed". That was written as an
  // EMITTER convention, and an emitter convention is not a control. `_normalize_invoice_cents`
  // (0009:110-121) accepts BOTH `-5.00` and the accounting parenthesis form `(5.00)`, so a
  // negative discount is persistable — and because the identity SUBTRACTS the discount, a
  // negative one turns that minus into a plus and TIES a gross the document does not state.
  const firm = await firmOf(CLIENT);
  const mk = async () => {
    const cited = await seedCitedDocument(W.users.alice, {
      firm, client: CLIENT, quote: rm(11100), kind: "invoice" });
    await enqueueInvoiceFacts(cited.documentId);
    const task = await invoiceFactsTask(cited.documentId);
    await claimTask(task.id, { egressApproved: true });
    return task.id;
  };
  // The exact exploit: net 100.00 + tax 6.00 - (-5.00) = 111.00 ties a stated gross of
  // 111.00, while the document's own face reads 100.00 + 6.00 - 5.00 = 101.00.
  assert.equal(10000 + 600 - (-500), 11100, "precondition: the forged identity balances arithmetically");
  assert.equal(10000 + 600 - 500, 10100, "…while the document's signed arithmetic says 101.00");
  for (const [label, path, raw] of [
    ["a minus-signed discount", COMPONENT.discount, "-5.00"],
    ["a parenthesized discount", COMPONENT.discount, "(5.00)"],
    ["a negative service charge", COMPONENT.serviceCharge, "-3.77"],
    ["a negative delivery charge", COMPONENT.delivery, "-15.00"],
  ]) {
    const fields = componentFields({ gross: 11100, net: 10000, tax: 600 });
    fields.push(factField(path, raw, { polygon: [], confidence: 0.9 }));
    const task = await mk();
    await assertRaises("CLR10", () => persistInvoiceFacts(task, fields), label);
    await failInvoiceFacts(task, "engine_error");
  }
  // A ZERO component is not negative and stays acceptable — the guard is a sign check, not
  // a "must be material" check.
  const zero = componentFields({ gross: 10600, net: 10000, tax: 600, discount: 0 });
  const ok = await persistInvoiceFacts(await mk(), zero);
  assert.equal(ok.status, "done", "a stated ZERO discount still persists");
});

test("[X3/sign] the BELT holds at the floor's read site, whatever wrote the region", async () => {
  gate();
  // The write boundary is the buckle; this is the belt. It covers what the write boundary
  // cannot: a region written before 0022, a root/superuser insert, or a future writer that
  // forgets. The cell writes the negative region the way the write boundary would never
  // allow, then proves the sales floor still refuses to post on it.
  const net = 10000, tax = 600, gross = 11100;
  const cited = await salesDoc({ gross, net, tax });
  const ext = (await rootQuery(
    `select id from clara.document_extractions where document_id=$1 and engine_kind='invoice_facts'
      and status='done' order by version_n desc limit 1`, [cited.documentId])).rows[0].id;
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
        text_content,engine_confidence,monetary_raw,monetary_cents)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,'-5.00',0.9,'-5.00',-500)`,
    [await firmOf(CLIENT), ext, COMPONENT.discount]);

  // The forged entry: AR 111.00 / revenue 105.00 / SST 6.00 — balanced, correctly shaped,
  // and tying against the forged identity. Before the belt this POSTED RM111.00 for a
  // RM101.00 document.
  const res = await approveSales(cited, [arLine(gross), revLine(gross - tax), sstLine(tax)]);
  assert.ok(res.error, "an entry resting on a NEGATIVE component never posts");
  assert.equal(res.error.code, "CLR21", `the refusal is CLR21 (got ${res.error.code}: ${res.error.message})`);
  assert.equal(reasonOf(res.error), "tax_tie_failed", "…named tax_tie_failed");
  // Pin WHICH refusal fired. Without this the cell would still pass if some unrelated floor
  // happened to reject the entry, and it would go on passing after someone deleted the
  // belt. The arithmetic is the reason it matters: with the negative discount, tie 2 reads
  // 10000 + 600 - (-500) = 11100 = gross and tie 3 reads 10500 = gross - tax, so BOTH ties
  // are satisfied and nothing downstream would have caught this. The belt is the only thing
  // standing between this document and a RM111.00 post.
  assert.match(res.error.message, /component is negative/,
    "…and it is the SIGN BELT that refused, not an unrelated floor");
  assert.equal(
    (await rootQuery("select status from clara.journal_entries where id=$1", [res.entry])).rows[0].status,
    "draft", "…and RM111.00 was not posted for a RM101.00 document");
});

test("[X3] the WRITE boundary guards the new components exactly as it guards the old ones", async () => {
  gate();
  const firm = await firmOf(CLIENT);
  const mk = async () => {
    const cited = await seedCitedDocument(W.users.alice, {
      firm, client: CLIENT, quote: rm(10375), kind: "invoice" });
    await enqueueInvoiceFacts(cited.documentId);
    const task = await invoiceFactsTask(cited.documentId);
    await claimTask(task.id, { egressApproved: true });
    return task.id;
  };
  const base = () => componentFields({ gross: 10375, net: 9430, tax: 566, rounding: 2, serviceCharge: 377 });
  // A refused persist leaves its task RUNNING (the refusal rolls the statement back, not the
  // claim), and the claim lane caps concurrent running tasks per firm — so each refusal case
  // settles its own task as failed before the next one claims.
  const refuses = async (fields, label) => {
    const task = await mk();
    await assertRaises("CLR10", () => persistInvoiceFacts(task, fields), label);
    await failInvoiceFacts(task, "engine_error");
  };

  // (a) two DISAGREEING service charges forfeit the whole extraction, as two disagreeing
  //     totals already do — never a min()-selected winner.
  const dup = base();
  dup.push(factField(COMPONENT.serviceCharge, rm(300), { polygon: [], confidence: 0.9 }));
  await refuses(dup, "an extraction stating two different service charges");

  // (b) a component that is PRESENT but unparseable is a data error, not a silent zero —
  //     a zero would make a wrong identity balance.
  const bad = componentFields({ gross: 10375, net: 9430, tax: 566, rounding: 2 });
  bad.push(factField(COMPONENT.delivery, "N/A", { polygon: [], confidence: 0.9 }));
  await refuses(bad, "an extraction stating an unreadable delivery charge");

  // (c) the taxonomy is CLOSED: a component outside the ratified enumeration is refused,
  //     not silently absorbed.
  const unknown = base();
  unknown.push(factField("invoice.surcharge", rm(100), { polygon: [], confidence: 0.9 }));
  await refuses(unknown, "an extraction stating a component outside the closed taxonomy");

  // (d) …and the well-formed payload the three refusals are contrasted against persists.
  const ok = await persistInvoiceFacts(await mk(), base());
  assert.equal(ok.status, "done", "the well-formed component payload persists");
  const stored = await rootQuery(
    `select field_path, monetary_cents from clara.document_regions
      where extraction_id=$1 and field_path=$2`, [ok.extraction_id, COMPONENT.serviceCharge]);
  assert.equal(Number(stored.rows[0].monetary_cents), 377,
    "…with the service charge normalised to CENTS — a component admitted to the allowlist "
    + "but left out of the normalisation set would store text with a NULL amount, and the "
    + "tie would then read a stated charge as 'not stated'");
});
