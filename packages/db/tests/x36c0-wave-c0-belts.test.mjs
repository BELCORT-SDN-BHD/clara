// 0036_wave_c0_deferred_belts.sql — the Wave-C0 clearing batch, four deferred ledger items.
//
//   §A (#52) the nonzero-tax belt: a supplier bill whose DOCUMENT states a nonzero tax,
//            carries NO sst_purchase_cost leg, and whose debit side is PURELY
//            expense-typed is refused (CLR21 / tax_leg_missing). Stated-ZERO,
//            stated-nothing, no-document, a purely CAPITALISED (asset-debit) purchase
//            AND a MIXED asset+expense bill are all carved out (review F1 — the belt
//            must not claim a shape with no compliant remedy); every leg-PRESENT
//            outcome is byte-stable; the reversal gating is intact.
//   §B (#51) settle_autodraft_task: the three losing-dispatch shapes are honest NO-OPS with
//            a receipt instead of exceptions; a never-begun task keeps its CLR13.
//   §C (#53) the shared attempt budget is VISIBLE on list_review_queue (used / remaining /
//            cap / who), correctly at 0, 1 and 2 attempts, with the cap it reports proven
//            equal to the cap that actually parks.
//   §D (#4)  a sales-direction filing never reaches the purchase-only unattended drafter:
//            excluded from list_autodraft_candidates() AND refused by NAME at admission
//            with a real run-bound receipt. A purchase filing still appears and admits.
//
// CONTRACT-BLIND where it can be: every DB verb is called by its pinned name with named
// args. Two cells are deliberately CATALOG-LEVEL (x36c0.e1, and the cap-agreement half of
// x36c0.g) because the property they assert is structural — see each cell's own note for
// why that is the honest instrument rather than a weaker end-to-end proxy.
//
// Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk, createClient,
  a21EnsureReady, markSkip,
  upsertPayableAccount, upsertAccountClassed, grantConsent,
  seedCitedDocument, freshResolution, draftEntryV3, approveEntry, reverseEntry,
  billLines, ev, FIELD, counterpartyRows, entryStatusOf, rm,
  invoiceFactsTask, mintLegacyInvoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, agreedEnvelope, factsRegion,
  mintInteractive, wakeDraftEntry,
  addClientIdentifier, addClientAlias,
  admitAutodraft, beginAutodraft, settleAutodraft, listAutodraftCandidates,
  openSweepRun, attemptRow, ORIGIN, primeReadyFiling, cancelAgentTask,
  listReviewQueue, humanPersona, humanQuery,
  AP, EXP,
} from "./a21-helpers.mjs";

const SSTP = "500-S36"; // sst_purchase_cost (expense-typed special) — a code of this suite's own
const ASSET = "150-S36"; // an ASSET-typed debit target — the capital-purchase carve-out's fixture
const CLR23 = "CLR23";
const CLR21 = "CLR21";
const CLR13 = "CLR13";

let has36 = false;
let world = null;

/** Loud + COUNTED, the house gate (skip16's own discipline): a dormant suite must show up
 *  in printSkipCount, never quietly green. */
function skipHere(t) {
  if (!has36) {
    markSkip();
    t.skip("0036_wave_c0_deferred_belts not applied — the Wave-C0 belt battery is dormant");
    return true;
  }
  return false;
}

before(async () => {
  const ready = await a21EnsureReady();
  const applied = ready.base
    ? (await rootQuery("select 1 from clara.schema_migrations where version = '0036_wave_c0_deferred_belts'")).rowCount === 1
    : false;
  has36 = Boolean(ready.base && ready.has16 && applied);
  if (has36) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: SSTP, name: "SST On Purchases", type: "expense", special: "sst_purchase_cost", opKey: opk("sstp") })
        .catch((e) => noteLane(`sstp acct ${e.code}: ${e.message}`));
      await upsertAccountClassed(world.users.alice, { client: c, code: ASSET, name: "Equipment", type: "asset", opKey: opk("asset") })
        .catch((e) => noteLane(`asset acct ${e.code}: ${e.message}`));
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  } else {
    noteLane("0036 absent (or the 0016 surface is not ready) — x36c0 suite dormant");
  }
});
after(async () => {
  printLaneNotes("x36c0-wave-c0-belts");
  printSkipCount("x36c0-wave-c0-belts");
  await endPool();
});

// ---------------------------------------------------------------------------
// §A fixtures — the a21-purchase-split shapes, restated locally (they are that
// suite's file-local helpers, not exports). `tax` is passed EXPLICITLY on every
// call so the arithmetic each cell relies on is visible in the cell itself:
// this whole section turns on the difference between a stated nonzero tax, a
// stated ZERO tax, and no stated tax at all, and a defaulted fixture would hide
// exactly the distinction under test.
// ---------------------------------------------------------------------------

async function makeVendor(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("v"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("va") });
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
}

/** A purchase facts doc stating a gross total, and net/tax ONLY when asked. Passing
 *  `tax: null` means the document states NO tax figure at all (the "absence" case);
 *  `tax: 0` means it prints "SST 0.00" (the ADR-050 owner-ruled shape). */
async function purchaseFactsDoc(client, { gross, net = null, tax = null }) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: rm(gross) });
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField("invoice.total", rm(gross)),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "THIRDPARTY SUPPLIER SDN BHD"),
    factField("invoice.invoice_id", `INV-${randomUUID().slice(0, 8)}`),
  ];
  if (net != null) fields.push(factField("invoice.total_excl_tax", rm(net), { polygon: [], confidence: 0.9 }));
  if (tax != null) fields.push(factField("invoice.tax_total", rm(tax), { polygon: [], confidence: 0.9 }));
  await persistInvoiceFacts(task.id, fields, { envelope: agreedEnvelope() });
  return cited;
}

/** A wake supplier_bill DRAFT for `cp` citing the doc's MACHINE total region. */
async function billDraft(client, cited, { cp, lines }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, FIELD.total);
  return wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines, document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp },
    evidence: [ev(region?.id ?? cited.regionId, region?.text_content ?? cited.quote, FIELD.total)],
    codingKind: "supplier_bill", opKey: opk("pb"),
  });
}

const split3 = (net, tax, gross) => [
  { account_code: EXP, debit_cents: net, credit_cents: 0, description: "expense (net)" },
  { account_code: SSTP, debit_cents: tax, credit_cents: 0, description: "sst portion of cost" },
  { account_code: AP, debit_cents: 0, credit_cents: gross, description: "ap (gross)" },
];

/** Approve and return the caught error (or null on success) — the §A cells all turn on
 *  "was this refused, and with exactly which code/reason". */
async function tryApprove(entry, revision, label) {
  try {
    await approveEntry(world.users.alice, { entry, expectedRevision: revision, opKey: opk(label) });
    return null;
  } catch (e) {
    return e;
  }
}

function reasonOf(err) {
  try {
    return JSON.parse(err?.detail ?? "{}")?.reason ?? null;
  } catch {
    return null;
  }
}

// ===========================================================================
// x36c0.a — §A THE BELT ITSELF: a stated NONZERO tax with NO sst_purchase_cost
// leg is REFUSED. This is the previously-unasked fourth corner of the purchase
// tax tie: the three existing branches only ever ran once a leg already
// existed, so this shape passed cleanly (and passed the verified-total tie too,
// because expense=gross holds whether or not the tax portion is split out).
// ===========================================================================
test("x36c0.a §A: a stated NONZERO tax with NO sst_purchase_cost leg REFUSES at approve (CLR21 / tax_leg_missing)", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cp = await makeVendor(world.users.alice, { client, name: `BELTNZ ${randomUUID().slice(0, 6)}`, reg: "201801360001" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  // The 2-leg shape: Dr expense GROSS / Cr AP GROSS. Arithmetically fine (Malaysian
  // purchase SST is expensed into cost, so expense=gross either way) — what is wrong is
  // that the stated RM6.00 of tax is invisible, on the ONE shape for which no owner
  // precedent exists (the SST-ZERO 2-leg is precedented; this is not).
  const d = await billDraft(client, cited, { cp, lines: billLines(EXP, AP, 10600) });
  assert.ok(d?.entry_id, "the 2-leg draft on a nonzero-tax document exists (mandatory setup)");

  const err = await tryApprove(d.entry_id, d.revision_token, "belt-nz");
  assert.ok(err, "a 2-leg bill on a document stating a NONZERO tax must be REFUSED, not approved");
  assert.equal(err.code, CLR21, `the belt rides the CLR21 tax-tie family (got ${err.code}: ${err.message})`);
  assert.equal(reasonOf(err), "tax_leg_missing",
    `the reason must be the DISTINCT tax_leg_missing token, not tax_tie_failed — the remedy differs (add a leg, not fix an amount). Got ${reasonOf(err)}`);
  assert.notEqual(await entryStatusOf(d.entry_id), "approved", "the refused bill never reaches approved");
});

// ===========================================================================
// x36c0.a2 — §A THE CAPITALISED-PURCHASE CARVE-OUT. The belt's only satisfying shape
// is a debit to sst_purchase_cost, which is CHECK-pinned to account_type='expense'
// (ck_coa_sst_purchase_cost_expense). For a bill whose debit side is an ASSET
// purchase (0016's own comment: "asset-debit bills exist") that shape would move the
// stated tax OUT of the asset's cost and into an expense account — understating the
// asset — and there is no override for it. So an unconditional belt would leave a
// legitimate entry with NO approvable shape: it would block a RIGHT entry, not a wrong
// one. The belt therefore fires only when an EXPENSE-typed debit leg exists.
//
// THE LOAD-BEARING ASSERTION here is "the belt does not CLAIM this shape" — i.e. the
// refusal reason is never tax_leg_missing. What then happens is owned by PRE-EXISTING
// floors 0036 does not touch, and on a corroborated document the FIRST of them is the
// draft-time W1 amount comparator (0009:1355-1363): it is already EXPENSE-centric
// (v_expense sums account_type='expense' debits only), so a purely asset-debit bill
// stamps amount_exception at draft and approve refuses CLR21/amount_conflict BEFORE
// the shape assert is ever reached. Where evidence instead lands verified without
// corroboration, the verified-total tie refuses CLR23; with neither, it approves as it
// did before 0036. All three outcomes are accepted and NAMED, because all three prove
// the property under test; what is not accepted is the belt owning this refusal.
// (Verified against the rig 2026-07-30: the corroborated fixture takes the
// amount_conflict path — the original pin on CLR23 asserted the wrong pre-existing
// owner and was corrected, not the behaviour.)
// ===========================================================================
test("x36c0.a2 §A: a purely CAPITALISED purchase (asset debit) is NOT claimed by the belt — no tax_leg_missing, behaviour unchanged from 0016", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cp = await makeVendor(world.users.alice, { client, name: `BELTCAP ${randomUUID().slice(0, 6)}`, reg: "201801360007" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  // Dr Equipment (asset) GROSS / Cr AP GROSS — non-recoverable purchase SST sits in the
  // asset's cost. billLines just puts the debit on whatever code it is handed.
  const d = await billDraft(client, cited, { cp, lines: billLines(ASSET, AP, 10600) })
    .catch((e) => { noteLane(`x36c0.a2: the asset-debit draft was refused at DRAFT time (${e.code}) — the belt is an approve-time floor, so this cell cannot speak`); return null; });
  if (!d?.entry_id) return;

  const err = await tryApprove(d.entry_id, d.revision_token, "belt-cap");
  assert.notEqual(reasonOf(err), "tax_leg_missing",
    "the belt must NOT claim a purely capitalised purchase — the only shape it would accept expenses capitalisable cost, and no override exists");
  if (err) {
    const owner = `${err.code}/${reasonOf(err) ?? "-"}`;
    assert.ok(
      (err.code === CLR21 && reasonOf(err) === "amount_conflict") || err.code === CLR23,
      `the refusal must belong to a NAMED pre-existing floor 0036 does not touch — the W1 expense-centric amount comparator (CLR21/amount_conflict) or the verified-total tie (CLR23). Got ${owner}: ${err.message}`);
    noteLane(`x36c0.a2: the asset-debit bill refused ${owner} on a pre-existing floor — unchanged by 0036`);
  } else {
    assert.equal(await entryStatusOf(d.entry_id), "approved",
      "with neither corroboration nor verified invoice.total evidence the capitalised purchase APPROVES exactly as it did before 0036");
    noteLane("x36c0.a2: the asset-debit bill APPROVED — the carve-out is exercised end-to-end");
  }
});

// ===========================================================================
// x36c0.a3 — §A THE MIXED CARVE-OUT (restated for review F1). asset + expense debits
// on a nonzero-tax document: the belt must NEVER claim this shape, because the only
// shape it accepts — an expense-typed sst_purchase_cost leg tied to the FULL stated
// tax — would expense the capitalised portion's share and understate the asset, and
// a PARTIAL leg fails the full-tie. There is no compliant remedy in this schema (the
// tax-allocation model is Gate-P territory), and a belt must not claim a shape it
// cannot offer a remedy for. Codex's counterexample: Dr equipment 10,600 / Dr
// service 5,300 / Cr AP 15,900 on a document stating 900 tax — correct, and it
// would have had NO approvable representation under the unconditional belt.
// NOT SILENTLY GREEN either: on this cell's CORROBORATED fixture the draft-time W1
// comparator (0009:1355-1363, expense-centric) stamps amount_exception (expense-sum
// 5600 <> gross 10600) and approve refuses CLR21/amount_conflict — the pre-existing
// owner, unchanged by 0036. The cell asserts BOTH halves: refused by W1, and the
// refusal is never the belt's.
// ===========================================================================
test("x36c0.a3 §A: a MIXED asset+expense bill is CARVED OUT of the belt (never tax_leg_missing) and still refuses on the pre-existing W1 comparator", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cp = await makeVendor(world.users.alice, { client, name: `BELTMIX ${randomUUID().slice(0, 6)}`, reg: "201801360008" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const d = await billDraft(client, cited, { cp, lines: [
    { account_code: ASSET, debit_cents: 5000, credit_cents: 0, description: "capitalised part" },
    { account_code: EXP, debit_cents: 5600, credit_cents: 0, description: "expensed part" },
    { account_code: AP, debit_cents: 0, credit_cents: 10600, description: "ap (gross)" },
  ] }).catch((e) => { noteLane(`x36c0.a3: the mixed draft was refused at DRAFT time (${e.code}) — the belt is an approve-time floor, so this cell cannot speak`); return null; });
  if (!d?.entry_id) return;

  const err = await tryApprove(d.entry_id, d.revision_token, "belt-mix");
  assert.ok(err, "a mixed asset+expense bill on this CORROBORATED nonzero-tax fixture must be REFUSED (by W1, not the belt)");
  const reason = reasonOf(err);
  assert.notEqual(reason, "tax_leg_missing",
    "the belt must NEVER claim a mixed debit side — its only satisfying shape understates the asset, and no compliant remedy exists (review F1)");
  assert.equal(err.code, CLR21, `the pre-existing W1 refusal rides CLR21 (got ${err.code}: ${err.message})`);
  assert.equal(reason, "amount_conflict",
    `on the corroborated path the W1 expense-centric comparator owns the refusal (got ${reason})`);
  noteLane("x36c0.a3: the mixed bill is carved out of the belt and refused CLR21/amount_conflict by the pre-existing W1 comparator — unchanged by 0036");
  assert.notEqual(await entryStatusOf(d.entry_id), "approved", "the mixed bill never reaches approved");
});

// ===========================================================================
// x36c0.b — §A NEGATIVE 1: a stated ZERO tax with no leg still APPROVES. This is
// the ADR-050 owner-ruled shape (the client's own four approved EZSEC bills all
// print "SST Amt @ 6%: 0.00" and are all two-leg). If this cell ever goes red the
// belt has broken the ONE production shape that exists today.
// ===========================================================================
test("x36c0.b §A: a stated ZERO tax with no leg still APPROVES — the ADR-050 owner-ruled shape is untouched", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const cp = await makeVendor(world.users.alice, { client, name: `BELTZERO ${randomUUID().slice(0, 6)}`, reg: "201801360002" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  // net === gross and tax === 0: exactly what a no-SST bill prints, and a consistent
  // stated arithmetic (so the document still corroborates).
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10600, tax: 0 });
  const d = await billDraft(client, cited, { cp, lines: billLines(EXP, AP, 10600) });
  assert.ok(d?.entry_id, "the 2-leg draft on a zero-tax document exists (mandatory setup)");

  const err = await tryApprove(d.entry_id, d.revision_token, "belt-zero");
  assert.equal(err, null, `a stated ZERO tax must NOT raise — a zero figure documents "no tax charged" (got ${err?.code}/${reasonOf(err)}: ${err?.message})`);
  assert.equal(await entryStatusOf(d.entry_id), "approved", "the SST-zero 2-leg bill APPROVES exactly as before 0036");
});

// ===========================================================================
// x36c0.c — §A NEGATIVE 2: no stated tax AT ALL still APPROVES. ABSENCE IS NOT A
// NONZERO CLAIM. This is the whole live OCR corpus's shape (invoice.tax_total has
// had no nonzero occurrences), so this cell is the regression guard for every
// existing bill in the estate.
// ===========================================================================
test("x36c0.c §A: a document stating NO tax at all still APPROVES — absence is not a nonzero claim", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2;
  const cp = await makeVendor(world.users.alice, { client, name: `BELTNONE ${randomUUID().slice(0, 6)}`, reg: "201801360003" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600 }); // NO net, NO tax fields
  const d = await billDraft(client, cited, { cp, lines: billLines(EXP, AP, 10600) });
  assert.ok(d?.entry_id, "the 2-leg draft on a tax-silent document exists (mandatory setup)");

  const err = await tryApprove(d.entry_id, d.revision_token, "belt-none");
  assert.equal(err, null, `a tax-SILENT document must NOT raise (got ${err?.code}/${reasonOf(err)}: ${err?.message})`);
  assert.equal(await entryStatusOf(d.entry_id), "approved", "a tax-silent 2-leg bill APPROVES exactly as before 0036");
});

// ===========================================================================
// x36c0.d — §A REGRESSION: every leg-PRESENT outcome is byte-stable. The belt is
// the ELSE of the leg conditional, so none of these three paths can have moved;
// this cell proves it rather than asserting it.
// ===========================================================================
test("x36c0.d §A regression: the leg-PRESENT paths are unchanged — tied 3-leg approves, mistied refuses, leg-without-fact refuses", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;

  // (1) the correctly tied 3-leg split still APPROVES.
  const cpOk = await makeVendor(world.users.alice, { client, name: `BELTOK ${randomUUID().slice(0, 6)}`, reg: "201801360004" });
  const citedOk = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const dOk = await billDraft(client, citedOk, { cp: cpOk, lines: split3(10000, 600, 10600) });
  assert.ok(dOk?.entry_id, "the tied 3-leg draft exists (mandatory setup)");
  const errOk = await tryApprove(dOk.entry_id, dOk.revision_token, "belt-ok3");
  assert.equal(errOk, null, `a correctly tied 3-leg split must still approve (got ${errOk?.code}/${reasonOf(errOk)})`);
  assert.equal(await entryStatusOf(dOk.entry_id), "approved", "the tied split APPROVES, as at 0016");
  const sstLeg = (await rootQuery(
    "select debit_cents::int as d from clara.journal_lines where entry_id=$1 and account_code=$2", [dOk.entry_id, SSTP],
  )).rows[0];
  assert.equal(sstLeg?.d, 600, "the sst_purchase_cost leg still equals the stated tax to the sen");

  // (2) a MISTIED leg still refuses CLR21 — and specifically NOT with the belt's own
  //     reason, which would mean the two shapes had been conflated.
  const cpTie = await makeVendor(world.users.alice, { client, name: `BELTTIE ${randomUUID().slice(0, 6)}`, reg: "201801360005" });
  const citedTie = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const dTie = await billDraft(client, citedTie, { cp: cpTie, lines: split3(10001, 599, 10600) })
    .catch((e) => { noteLane(`mistied draft refused at draft (${e.code}) — floor fired early`); return null; });
  if (dTie?.entry_id) {
    const errTie = await tryApprove(dTie.entry_id, dTie.revision_token, "belt-tie");
    assert.ok(errTie, "a mistied sst_purchase_cost leg is still REFUSED");
    assert.equal(errTie.code, CLR21, `the mistie refusal is still CLR21 (got ${errTie.code})`);
    assert.equal(reasonOf(errTie), "tax_tie_failed",
      `a mistied leg keeps its OWN reason tax_tie_failed — the belt must not have swallowed it (got ${reasonOf(errTie)})`);
  }

  // (3) an sst_purchase_cost leg with NO stated tax fact still refuses.
  const cpNo = await makeVendor(world.users.alice, { client, name: `BELTNOFACT ${randomUUID().slice(0, 6)}`, reg: "201801360006" });
  const citedNo = await purchaseFactsDoc(client, { gross: 10600 }); // no tax fact
  const dNo = await billDraft(client, citedNo, { cp: cpNo, lines: split3(10000, 600, 10600) })
    .catch((e) => { noteLane(`no-fact split draft refused at draft (${e.code}) — floor fired early`); return null; });
  if (dNo?.entry_id) {
    const errNo = await tryApprove(dNo.entry_id, dNo.revision_token, "belt-nofact");
    assert.ok(errNo, "an sst_purchase_cost leg with NO stated tax fact is still REFUSED");
    assert.equal(errNo.code, CLR21, `the no-fact refusal is still CLR21 (got ${errNo.code})`);
    assert.equal(reasonOf(errNo), "tax_tie_failed", `the no-fact refusal keeps tax_tie_failed (got ${reasonOf(errNo)})`);
  }
});

// ===========================================================================
// x36c0.e — §A THE REVERSAL GATING, in two honest halves.
//
// e1 is CATALOG-LEVEL and that is DELIBERATE, not a shortcut. The property is
// lexical: the belt is the ELSE of the sst-leg conditional, which lives inside
// `coding_kind='supplier_bill' AND reversal_of is null`, so a reversal mirror
// cannot reach it BY CONSTRUCTION. The end-to-end alternative would need a
// directly-constructed, DOCUMENT-BOUND, reversal-shaped row: x35.c's
// document-free construction technique does not extend to it cheaply (provenance
// binding validates source_doc_sha256 + document_id in-txn, and reversal_of is
// not in _tf_entry_immutable's draft->draft allowset, so it can be neither
// inserted around nor patched in afterwards). Rather than ship a fragile
// construction or a vacuous document-less probe (with no document there is no
// stated tax, so the belt could not fire either way and the cell would prove
// nothing), e1 asserts the lexical containment directly and e2 proves the real
// reversal LANE still works after the belt lands. Stated plainly so no later
// reader mistakes this for an untested boundary.
// ===========================================================================
test("x36c0.e1 §A: the belt is lexically INSIDE the `reversal_of is null` gate — a reversal mirror can never reach it", async (t) => {
  if (skipHere(t)) return;
  const raw = (await rootQuery(
    "select pg_get_functiondef('clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure) as src", [],
  )).rows[0].src;
  // The migration tail's own normalizer: block comments, then line comments, then collapse
  // whitespace, then lowercase. Stripping comments FIRST is load-bearing — the function's
  // commentary quotes the very tokens probed below.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

  const gate = src.indexOf("if e.coding_kind = 'supplier_bill' and e.reversal_of is null then");
  const belt = src.indexOf("else v_tax := case when e.document_id is null then null");
  const raise = src.indexOf("detail='{\"reason\":\"tax_leg_missing\"}'");
  assert.ok(gate >= 0, "the reversal-gated supplier_bill block must still exist");
  assert.ok(belt >= 0, "the belt's ELSE branch must exist in the deployed body");
  assert.ok(raise >= 0, "the belt's tax_leg_missing raise must exist in the deployed body");
  assert.ok(gate < belt, "the belt must come AFTER the `reversal_of is null` gate opens — otherwise a reversal mirror could reach it");
  assert.ok(belt < raise, "the raise must sit inside the belt's own ELSE branch");
  // And the gate must not have been weakened into a coding_kind-only test.
  assert.ok(
    !src.includes("if e.coding_kind = 'supplier_bill' then"),
    "the supplier_bill block must not have lost its `and e.reversal_of is null` conjunct",
  );
});

test("x36c0.e2 §A: the real reverse_entry lane still works on a nonzero-tax bill after the belt lands", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A2;
  const cp = await makeVendor(world.users.alice, { client, name: `BELTREV ${randomUUID().slice(0, 6)}`, reg: "201801360007" });
  assert.ok(cp, "vendor exists (mandatory setup)");
  const cited = await purchaseFactsDoc(client, { gross: 10600, net: 10000, tax: 600 });
  const d = await billDraft(client, cited, { cp, lines: split3(10000, 600, 10600) });
  assert.ok(d?.entry_id, "the tied 3-leg draft exists (mandatory setup)");
  const errAp = await tryApprove(d.entry_id, d.revision_token, "belt-revap");
  assert.equal(errAp, null, `the tied split must approve before it can be reversed (got ${errAp?.code}/${reasonOf(errAp)})`);

  let raised = null;
  const r = await reverseEntry(world.users.alice, { entry: d.entry_id, reason: "x36c0 reversal probe", opKey: opk("belt-rev") })
    .catch((e) => { raised = e; return null; });
  assert.equal(raised, null, `reverse_entry must not be broken by the belt (raised ${raised?.code}/${reasonOf(raised)}: ${raised?.message})`);
  assert.ok(r, "reverse_entry returned a receipt");
  const reversed = (await rootQuery("select reversed_by from clara.journal_entries where id=$1", [d.entry_id])).rows[0];
  if (reversed?.reversed_by == null) {
    noteLane("x36c0.e2: reverse_entry succeeded but left reversed_by null — the high-stakes path leaves the mirror a DRAFT for later approval; the belt is untouched either way");
  }
});

// ===========================================================================
// §B fixtures — a ready filing whose autodraft task can be driven by hand.
// ===========================================================================

// primeReadyFiling, NOT bare readyFiling: admission only mints a task when the lane is
// genuinely 'ready', and readyFiling alone leaves the vendor unresolved (a name-only facts
// match against a REGISTERED counterparty is ambiguous). primeReadyFiling births the
// name-only counterparty first, which is exactly what the READY lane needs.
async function admittedTask(client) {
  const rf = await primeReadyFiling(world.users.alice, { client, vendorName: `SETTLECO ${randomUUID().slice(0, 6)} SDN BHD` });
  const res = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  return { rf, admit: res, task: res?.task_id ?? null };
}

// ===========================================================================
// x36c0.f — §B THE LOSING DISPATCH. Each of the three shapes must be a NO-OP with
// an honest receipt, leaving the task, the registry row and the attempt count
// exactly as they were; and the ONE shape that is a genuine internal-contract
// violation (a settle for a task that was never begun) must keep its exception.
// ===========================================================================
test("x36c0.f1 §B: a settle for a CANCELLED task is an honest NO-OP (task_superseded), not an exception", async (t) => {
  if (skipHere(t)) return;
  const { rf, task } = await admittedTask(world.clients.A1);
  assert.ok(task, "an autodraft task was admitted (mandatory setup)");
  // A QUEUED task cancels straight to 'cancelled' (a RUNNING one stops at
  // cancel_requested, which the engine is still SUPPOSED to settle — hence not a
  // losing dispatch and deliberately not covered by the new branch).
  await cancelAgentTask(world.users.bob, { task, opKey: opk("x36c0-cancel") });
  const status = (await rootQuery("select status from clara.agent_tasks where id=$1", [task])).rows[0]?.status;
  if (status !== "cancelled") {
    noteLane(`x36c0.f1: a queued autodraft task cancelled to '${status}', not 'cancelled' — the task_superseded branch could not be exercised through the sanctioned verb`);
    return;
  }
  const before = await attemptRow(rf.filingId);

  let raised = null;
  const r = await settleAutodraft({ task, outcome: "failed", tokens: 0 }).catch((e) => { raised = e; return null; });
  assert.equal(raised, null, `a losing dispatch is NORMAL and must not raise (got ${raised?.code}: ${raised?.message})`);
  assert.equal(r?.settled, false, "the receipt must say settled:false");
  assert.equal(r?.reason, "task_superseded", `the receipt must name the reason (got ${r?.reason})`);
  assert.equal(r?.outcome, "not_settled", "the receipt's outcome must be not_settled, never a fabricated success");

  // The task and the attempt COUNT are untouched — but the RESERVATION is not "nothing"
  // (review F3): a one-click task cancelled mid-run has no re-admission and no sweep
  // recovery coming, so if the registry still points at this task the no-op must release
  // the reservation (reserved_tokens -> 0, state -> 'idle') or the firm's daily budget
  // stays consumed forever. attempt_count stays put: a cancelled task never settled, so
  // no attempt was spent.
  const afterStatus = (await rootQuery("select status from clara.agent_tasks where id=$1", [task])).rows[0]?.status;
  assert.equal(afterStatus, "cancelled", "the cancelled task must not be flipped by a losing settle");
  const after = await attemptRow(rf.filingId);
  assert.equal(Number(after?.attempt_count ?? 0), Number(before?.attempt_count ?? 0),
    "attempt_count must NOT move — a losing dispatch must never spend somebody else's attempt");
  assert.equal(Number(after?.reserved_tokens ?? -1), 0,
    `the still-owned reservation must be RELEASED by the no-op (got reserved_tokens=${after?.reserved_tokens})`);
  assert.equal(after?.state, "idle",
    `the released attempt row returns to 'idle' (got ${after?.state})`);
  assert.equal(r?.released_reservation, true,
    "the receipt must say it released the reservation — visible, never silent");
  // And the no-op is VISIBLE: an audit row records it rather than it vanishing.
  const audit = (await rootQuery(
    "select args from clara.audit_log where fn='settle_autodraft_task' and args->>'task'=$1 order by id desc limit 1", [task],
  )).rows[0];
  assert.ok(audit, "the no-op must leave an audit row — an honest receipt, not a silent return");
  assert.equal(audit.args.settled, false, "the audit row records settled:false");
  assert.equal(audit.args.reason, "task_superseded", "the audit row names the same reason as the receipt");
  assert.equal(audit.args.released_reservation, true, "the audit row records the release too");
});

test("x36c0.f2 §B: a settle whose per-filing registry has been repointed at a NEWER task is an honest NO-OP (registry_superseded)", async (t) => {
  if (skipHere(t)) return;
  const { rf, task } = await admittedTask(world.clients.A2);
  assert.ok(task, "an autodraft task was admitted (mandatory setup)");
  await beginAutodraft({ task });
  // The ownership shape: the task is still LIVE but clara.autodraft_attempts (unique per
  // filing) now points at a different task — precisely what admit_autodraft_task's
  // `on conflict(filing_id) do update set task_id=excluded.task_id` does on a re-admission,
  // and what 0034's supersede branch relies on. Repointed directly here because reaching
  // it through the sanctioned lanes requires the OLD task to be terminal first, at which
  // point the task_superseded branch (f1) fires before the registry is ever consulted.
  const other = (await rootQuery(
    `insert into clara.agent_tasks(firm_id,client_id,kind,status,model_snapshot)
       select firm_id,client_id,'autodraft','queued','x36c0-model' from clara.autodraft_attempts where filing_id=$1
     returning id`, [rf.filingId],
  )).rows[0]?.id;
  assert.ok(other, "a rival task row was created (mandatory setup)");
  await rootQuery("update clara.autodraft_attempts set task_id=$1 where filing_id=$2", [other, rf.filingId]);
  const before = await attemptRow(rf.filingId);

  let raised = null;
  const r = await settleAutodraft({ task, outcome: "failed", tokens: 0 }).catch((e) => { raised = e; return null; });
  assert.equal(raised, null, `a superseded dispatch must NOT raise CLR11 — that exception is what ends a run as a cosmetic failure (got ${raised?.code}: ${raised?.message})`);
  assert.equal(r?.settled, false, "the receipt must say settled:false");
  assert.equal(r?.reason, "registry_superseded", `the receipt must name registry_superseded (got ${r?.reason})`);

  const after = await attemptRow(rf.filingId);
  assert.equal(after?.task_id, other, "the registry must still point at the NEWER task — the loser cannot steal it back");
  assert.equal(Number(after?.attempt_count ?? 0), Number(before?.attempt_count ?? 0), "attempt_count must not move");
  assert.equal(after?.state, before?.state, "the registry state must not move");
});

test("x36c0.f3 §B: a settle whose attempt was already RELEASED is an honest NO-OP (registry_released)", async (t) => {
  if (skipHere(t)) return;
  const { rf, task } = await admittedTask(world.clients.A1);
  assert.ok(task, "an autodraft task was admitted (mandatory setup)");
  await beginAutodraft({ task });
  // The reconciler's recovery UPDATE leaves exactly this: the attempt released to 'idle'
  // with its reservation zeroed, while the task itself is still running. Set directly
  // because clara.reconcile_sweep_runs also completes the task in the same pass, which
  // would route the settle into the pre-existing 'completed' replay branch instead.
  await rootQuery("update clara.autodraft_attempts set state='idle',reserved_tokens=0 where filing_id=$1", [rf.filingId]);
  const before = await attemptRow(rf.filingId);

  let raised = null;
  const r = await settleAutodraft({ task, outcome: "failed", tokens: 0 }).catch((e) => { raised = e; return null; });
  assert.equal(raised, null, `an already-released attempt must NOT raise (got ${raised?.code}: ${raised?.message})`);
  assert.equal(r?.settled, false, "the receipt must say settled:false");
  assert.equal(r?.reason, "registry_released", `the receipt must name registry_released (got ${r?.reason})`);
  assert.equal(r?.registry_state, "idle", "the receipt reports the state it found, so the no-op is diagnosable");

  const after = await attemptRow(rf.filingId);
  assert.equal(Number(after?.attempt_count ?? 0), Number(before?.attempt_count ?? 0),
    "attempt_count must NOT move — the release already accounted for this attempt");
  assert.equal(Number(after?.reserved_tokens ?? 0), 0, "the reservation stays closed out; the no-op must not re-refund it");
});

test("x36c0.f4 §B: a settle for a task that was NEVER BEGUN still raises CLR13 — a real contract violation is not a losing dispatch", async (t) => {
  if (skipHere(t)) return;
  const { task } = await admittedTask(world.clients.A2);
  assert.ok(task, "an autodraft task was admitted (mandatory setup)");
  const status = (await rootQuery("select status from clara.agent_tasks where id=$1", [task])).rows[0]?.status;
  assert.equal(status, "queued", "the freshly admitted task is queued (mandatory setup — begin was deliberately skipped)");

  let raised = null;
  await settleAutodraft({ task, outcome: "drafted", tokens: 10 }).catch((e) => { raised = e; });
  assert.ok(raised, "settling a task that was never begun must still RAISE — softening this would hide a real internal-contract violation");
  assert.equal(raised.code, CLR13, `the never-begun refusal is still CLR13 (got ${raised.code}: ${raised.message})`);
});

// ===========================================================================
// x36c0.g — §C THE SHARED BUDGET, MADE VISIBLE. The owner's ruling is that the cap
// of 2 STAYS and the defect is invisibility, so this cell checks what a human can
// SEE before triggering a retry, at 0, 1 and 2 attempts — and proves the cap the
// read reports is the SAME cap that actually parks (a read that reported a
// different number would be worse than no read at all).
// ===========================================================================
async function queueAutodraftBlock(client, filing) {
  const q = await listReviewQueue(humanPersona(world.users.alice), { scope: { client_id: client }, limit: 500 });
  const row = (q?.rows ?? []).find((r) => r.filing_id === filing);
  return { queue: q, row, autodraft: row?.autodraft ?? null };
}

test("x36c0.g §C: the queue read exposes used / remaining / cap / who at 0, 1 and 2 attempts, and its cap is the cap that actually parks", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const rf = await primeReadyFiling(world.users.alice, { client, vendorName: `BUDGETCO ${randomUUID().slice(0, 6)} SDN BHD` });

  // --- 0 attempts: a full budget, no claimant, nothing to warn about yet.
  const at0 = await queueAutodraftBlock(client, rf.filingId);
  assert.ok(at0.row, "the uncoded filing appears on the queue read (mandatory setup)");
  assert.ok(at0.autodraft, "every filing-bearing queue row carries the additive 'autodraft' block");
  const cap = Number(at0.autodraft.attempts_cap);
  assert.equal(cap, 2, `the reported cap is the owner-ruled 2 (got ${cap})`);
  assert.equal(Number(at0.autodraft.attempts_used), 0, "0 attempts used before anything is dispatched");
  assert.equal(Number(at0.autodraft.attempts_remaining), 2, "the full budget remains");
  assert.equal(at0.autodraft.last_origin, null, "no claimant yet — reported as null, not fabricated");
  assert.equal(at0.autodraft.origin_attribution, "none",
    "nothing has been spent, so there is no attribution to make — 'none', not a claim about an actor");
  assert.equal(at0.autodraft.parked, false, "not parked");

  // 0017 CHANGE-OF-RECORD SURVIVAL. §C installs its key by PATCHING the live body, not by
  // rebuilding 0016's, precisely because 0017_wave_b.sql:511-655 is this function's last
  // definition (it installs the L5/O8.4 lint lane, the per-row finding_id, counts.lint_findings
  // and seven active-client guard joins, plus the ADR-031 draft rank). A rebuilt body would
  // pass every "the autodraft key is present" assertion in this cell while having silently
  // deleted all of that, so the survival of 0017's surface is asserted HERE, next to the
  // additive key that could have destroyed it.
  assert.equal(typeof at0.queue?.lint?.stale_evaluator, "boolean",
    "the 0017 'lint' envelope survived §C's patch — its absence means the queue body was rebuilt from 0016 and the lint lane is gone");
  assert.equal(typeof at0.queue?.counts?.lint_findings, "number",
    "…and so did counts.lint_findings, the tile the dashboard renders");
  assert.ok(Object.prototype.hasOwnProperty.call(at0.row, "finding_id"),
    "…and the per-row finding_id key, which wb-l asserts on EVERY row");

  // --- 1 attempt: spent by the SWEEP, so a human can see who spent it before retrying.
  const a1 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  assert.ok(a1?.task_id, `the sweep admission produced a task (got ${JSON.stringify(a1)})`);
  await beginAutodraft({ task: a1.task_id });
  await settleAutodraft({ task: a1.task_id, outcome: "failed", tokens: 0 });
  const at1 = await queueAutodraftBlock(client, rf.filingId);
  assert.ok(at1.autodraft, "the row still carries the autodraft block after one failure");
  assert.equal(Number(at1.autodraft.attempts_used), 1, "one attempt spent");
  assert.equal(Number(at1.autodraft.attempts_remaining), 1, "one attempt remaining — the warning a human needed");
  assert.equal(at1.autodraft.last_origin, "sweep",
    `the SWEEP is named as the most recent claimant — the actor the user never saw act (got ${at1.autodraft.last_origin})`);
  assert.equal(at1.autodraft.origin_attribution, "latest_only",
    "one attempt is spent but `origin` is a single column a later admission can repoint, so the read reports 'latest_only' — it can never prove WHO spent it");
  assert.equal(at1.autodraft.parked, false, "one failure does not park");

  // --- THE MISATTRIBUTION GUARD, on the exact sanctioned sequence that produces it.
  //     admit_autodraft_task repoints `origin` (`on conflict(filing_id) do update set ...
  //     origin=excluded.origin`) while attempt_count only moves at SETTLE. So immediately
  //     after a human's one-click retry the row reads attempt_count=1 with
  //     origin='one_click' — and a payload that called THAT 'complete' would render
  //     "1 of 2 used, by you" for an attempt the SWEEP spent. Sampled BEFORE the retry
  //     settles, which is precisely the window a human reads the queue in.
  const a2 = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.oneClick });
  assert.ok(a2?.task_id, `the one-click retry produced a task (got ${JSON.stringify(a2)})`);
  const mid = await queueAutodraftBlock(client, rf.filingId);
  if (mid.autodraft) {
    assert.equal(Number(mid.autodraft.attempts_used), 1,
      "re-admission does NOT move attempt_count — it moves at settle, which is the whole desynchronisation");
    assert.equal(mid.autodraft.last_origin, "one_click",
      "…but it DOES repoint origin, so the column now names the human while the sweep is the actual spender");
    assert.equal(mid.autodraft.origin_attribution, "latest_only",
      "the read must NOT claim 'complete' here — that would credit the human with the sweep's attempt, the exact fabrication this key exists to prevent");
  }
  await beginAutodraft({ task: a2.task_id });
  await settleAutodraft({ task: a2.task_id, outcome: "failed", tokens: 0 });
  const at2 = await queueAutodraftBlock(client, rf.filingId);
  assert.ok(at2.autodraft, "the row still carries the autodraft block after the second failure");
  assert.equal(Number(at2.autodraft.attempts_used), 2, "both attempts spent");
  assert.equal(Number(at2.autodraft.attempts_remaining), 0, "no attempts remain");
  assert.equal(at2.autodraft.last_origin, "one_click", "the LATEST claimant is named");
  assert.equal(at2.autodraft.origin_attribution, "latest_only",
    "with 2 attempts and ONE origin column the read must say 'latest_only' — it cannot know who spent the first, and must not pretend to");

  // THE CAP AGREEMENT, which is the point of collapsing the literal into one function: the
  // read's own attempts_remaining===0 and the writer's actual park decision must coincide.
  const row = await attemptRow(rf.filingId);
  assert.equal(row?.state, "parked", "the SECOND failure genuinely parks the filing (the writer's own decision)");
  assert.equal(at2.autodraft.parked, true, "…and the read reports parked — the number shown IS the number that parks");
  assert.equal(Number(at2.autodraft.attempts_remaining) === 0, row?.state === "parked",
    "attempts_remaining===0 and state==='parked' must agree exactly — a drift here is the defect #53 exists to prevent");
});

// ===========================================================================
// §D fixtures — a SALES-direction filing. clara._document_direction answers 'sales'
// when the document's SUPPLIER identity is the CLIENT's own (registration against
// client_identifiers, plus a name/alias match; post-RESIDUAL-3 a registration match
// with a contradicting name abstains, so both are registered). A DEDICATED client is
// created for this so the identifier/alias writes cannot leak into the shared world
// clients and perturb another suite's direction resolution.
// ===========================================================================
const SALES_NAME = "X36C0 SELFSUPPLIER SDN BHD";
const SALES_REG = "201801360900";

async function salesDirectionFiling() {
  const sub = world.users.alice;
  const client = await createClient(sub, { name: `X36C0 SALESDIR ${randomUUID().slice(0, 6)}`, opKey: opk("x36c0-cl") });
  const firm = await firmOf(client);
  await addClientIdentifier(sub, { client, kind: "ssm", value: SALES_REG }).catch((e) => noteLane(`ssm id ${e?.code}`));
  await addClientIdentifier(sub, { client, kind: "tin", value: SALES_REG }).catch((e) => noteLane(`tin id ${e?.code}`));
  await addClientAlias(sub, { client, alias: SALES_NAME.toLowerCase().replace(/[^a-z0-9]/g, "") }).catch((e) => noteLane(`alias ${e?.code}`));
  await grantConsent(sub, { firm, client }).catch(() => {});

  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 1,000.00", kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 1,000.00"),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `SALES-${randomUUID().slice(0, 8)}`),
    // The SUPPLIER is the client itself -> direction 'sales'.
    factField("invoice.vendor_name", SALES_NAME),
    factField("invoice.vendor_registration", SALES_REG, { polygon: [], confidence: 0.9 }),
    // The BUYER is somebody else — a buyer that ALSO matched the client would make the
    // double-identity check abstain (CLR30) instead of resolving 'sales'.
    factField("invoice.customer_name", "SOME REAL BUYER SDN BHD", { polygon: [], confidence: 0.9 }),
  ], { envelope: agreedEnvelope() });
  return { client, firm, cited };
}

test("x36c0.h §D: a SALES-direction filing is excluded from the purchase-only sweep enumeration and refused by NAME at admission; a purchase filing still admits", async (t) => {
  if (skipHere(t)) return;
  // The gate helper must be TOTAL, never tri-valued: it is consumed as `and not <helper>` in
  // list_autodraft_candidates' WHERE clause, where a NULL would make `not NULL` -> NULL and
  // silently DROP a purchase filing from the enumeration — reintroducing the exact stranding
  // this section exists to prevent.
  const total = (await rootQuery(
    `select clara._autodraft_sales_direction(null,null) a,
            clara._autodraft_sales_direction(gen_random_uuid(),gen_random_uuid()) b`, [],
  )).rows[0];
  assert.equal(total.a, false, "a null-argument call must return FALSE, never null");
  assert.equal(total.b, false, "an unknown-document call must return FALSE, never null");

  const { client, firm, cited } = await salesDirectionFiling();

  // Confirm the fixture actually resolves 'sales' — otherwise this cell would silently
  // prove nothing at all (the gate only excludes a CLEAN sales resolution).
  let dir = null;
  try {
    dir = (await rootQuery("select clara._document_direction($1,$2) as d", [cited.documentId, client])).rows[0]?.d;
  } catch (e) {
    noteLane(`x36c0.h: _document_direction raised ${e.code} on the fixture — the gate deliberately treats that as "not provably sales"`);
  }
  // Review F6: MANDATORY, not an early return. A silently-skipping fixture would leave
  // BOTH §D gates untested while CI stayed green — a fixture regression must fail loudly.
  assert.equal(dir, "sales",
    `mandatory setup: the sales fixture must resolve direction='sales' or the §D gate goes untested (got '${dir}') — inspect the client-identity fixture`);

  // (1) EXCLUDED from the enumeration the unattended purchase-only drafter consumes.
  const candidates = await listAutodraftCandidates();
  const ids = candidates.map((r) => r.filing_id);
  assert.ok(!ids.includes(cited.filingId),
    "a sales-direction filing must NOT be enumerated as an autodraft candidate — the drafter hardcodes coding_kind 'supplier_bill'");

  // (2) NOT invisibly stranded: the queue read says why the sweep will never take it.
  const { autodraft } = await queueAutodraftBlock(client, cited.filingId);
  if (autodraft == null) {
    noteLane("x36c0.h: the sales filing produced no queue row to carry the block (its lane may exclude it) — the admission refusal below is the load-bearing receipt either way");
  } else {
    assert.equal(autodraft.sweep_eligible, false, "the queue read reports the filing as NOT sweep-eligible");
    assert.equal(autodraft.blocked_reason, "sales_direction", "…and names the reason, so the exclusion is visible rather than silent");
  }

  // (3) REFUSED BY NAME at admission, with a real run-bound receipt. Admission is the
  //     load-bearing gate: the primary dispatch path resolves filings through
  //     list_document_autodraft_candidates, which filters nothing by design.
  const run = await openSweepRun({ firm, expected: 1 });
  const res = await admitAutodraft({ filing: cited.filingId, origin: ORIGIN.sweep, runId: run });
  assert.equal(res?.outcome, "skipped_direction", `admission must refuse by NAME (got ${JSON.stringify(res)})`);
  assert.equal(res?.reason, "sales_direction", "the refusal names sales_direction");
  const item = (await rootQuery(
    "select outcome, refusal_token from clara.sweep_run_items where run_id=$1 and filing_id=$2", [run, cited.filingId],
  )).rows[0];
  assert.ok(item, "a run-bound admission MUST write its item or the run never reaches expected_count and wedges open");
  assert.equal(item.outcome, "skipped_lane",
    "the receipt rides the CHECK-admitted 'skipped_lane' outcome (the enum admits no bespoke value)");
  assert.equal(item.refusal_token?.reason, "sales_direction",
    "…discriminated from the pre-existing lane_changed skip by its refusal_token reason");
  // No task, no reservation: the refusal creates nothing.
  assert.equal(await attemptRow(cited.filingId), null, "a direction refusal must create no registry row at all");

  // (4) And a PURCHASE filing is untouched — the gate is narrow, not a blanket.
  const okFiling = await primeReadyFiling(world.users.alice, { client: world.clients.A2, vendorName: `DIRPURCH ${randomUUID().slice(0, 6)} SDN BHD` });
  const cands2 = await listAutodraftCandidates();
  assert.ok(cands2.map((r) => r.filing_id).includes(okFiling.filingId),
    "a purchase-direction ready filing must STILL be enumerated");
  const ok = await admitAutodraft({ filing: okFiling.filingId, origin: ORIGIN.oneClick });
  assert.ok(ok?.task_id, `a purchase-direction filing must still ADMIT for real (got ${JSON.stringify(ok)})`);
});

// ===========================================================================
// x36c0.i — §E: MSIC reaches the context pack. The interview commits the client's
// MSIC into onboarding_plan_items on the committed client plan (interview.v2
// item_key 'msic'); before 0036 §E nothing read it back. The pack's client object
// now carries it; absence reads null. Seeded via root (the onboarding verbs span a
// durable-run flow this DB-scoped cell does not exercise; the CHECK constraints on
// both tables still bind a root INSERT, so the seeded shape is the committed shape).
// Read in the HUMAN lane — the pack is SECURITY DEFINER (review F7 corrected an
// INVOKER misstatement here), so the human read proves the real member surface while
// the definer body needs no table grant on the onboarding tables; tenant scoping
// stays bound to the function's own authorized client.
// ===========================================================================
test("x36c0.i §E: a committed plan's answered msic surfaces as pack.client.msic; no plan reads null; the 0017/0016 markers survive", async (t) => {
  if (skipHere(t)) return;
  const client = world.clients.A1;
  const firm = await firmOf(client);

  // Seed: one committed client plan + its answered msic item (root; CHECKs still bind).
  const planId = randomUUID();
  await rootQuery(
    `insert into clara.onboarding_plans
       (id, firm_id, scope_kind, client_id, state, committed_at, committed_by, contributors)
     values ($1, $2, 'client', $3, 'committed', now(), $4, array[$4]::uuid[])`,
    [planId, firm, client, world.users.alice],
  );
  await rootQuery(
    `insert into clara.onboarding_plan_items
       (plan_id, firm_id, item_kind, item_key, question, answer, state, answered_by, answered_at)
     values ($1, $2, 'capture', 'msic', 'What is the client''s 5-digit MSIC industry code?',
             '"62010"'::jsonb, 'answered', $3, now())`,
    [planId, firm, world.users.alice],
  );

  const r1 = await humanQuery(world.users.alice,
    "select clara.get_context_pack(p_client => $1, p_purpose => $2) as pack", [client, "coding"]);
  const pack1 = r1.rows[0].pack;
  assert.ok(pack1?.client, "the pack's client object exists (mandatory)");
  assert.equal(pack1.client.msic, "62010",
    `the committed plan's answered msic must surface as pack.client.msic (got ${JSON.stringify(pack1.client.msic)})`);

  // The sibling client has NO committed plan: the key is present and honestly null.
  const r2 = await humanQuery(world.users.alice,
    "select clara.get_context_pack(p_client => $1, p_purpose => $2) as pack", [world.clients.A2, "coding"]);
  const pack2 = r2.rows[0].pack;
  assert.ok(pack2?.client, "the sibling pack's client object exists (mandatory)");
  assert.equal(pack2.client.msic, null,
    `a client with no committed plan must read msic null, never a fabricated value (got ${JSON.stringify(pack2.client.msic)})`);

  // The patch lost nothing: a marker from EVERY post-0016 surgery must survive (review
  // F2 — 0016/0017 alone would re-bless a body reverted past 0018/0019).
  const def = await rootQuery(
    "select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) as d");
  const body = def.rows[0].d;
  assert.ok(body.includes("sst_registration_watch"), "the 0016 sst_registration_watch block survived the §E patch");
  assert.ok(body.includes("'wiki'"), "the 0017 wiki block survived the §E patch");
  assert.ok(body.includes("-'bound_scope_kind'-'bound_scope_id'"),
    "the 0018 resolution-exclusion strip survived the §E patch");
  assert.ok(body.includes("'stale_at',wc.stale_at") && body.includes("'has_stale_sources'"),
    "the 0019 wiki-boundary stale annotations survived the §E patch");
  noteLane("x36c0.i: pack.client.msic live end-to-end — answered '62010' surfaces, absent reads null, 0016/0017/0018/0019 markers intact");
});
